import "server-only";
import { getSiteUrl, hasCronSecret } from "@/lib/env";
import {
  campaignSendTypes,
  type DigestAutomationSummary,
} from "@/lib/ops-shared";
import { getSupabaseAdminClient } from "@/lib/supabase";
import {
  EDITORIAL_DEAL_MAX_DROP_RATIO,
  buildRouteMap,
  buildSeriesKey,
  defaultDigestAutomationSummary,
  extractPatternKey,
  formatError,
  formatTimeParts,
  opsConfigurationMessage,
  opsQueryMessage,
  unique,
} from "@/lib/ops/shared";
import {
  type AutomationSettingsRow,
  type DealRow,
  type EmailCampaignRow,
  type OpsEmailCampaignsData,
  type RouteRow,
  type SnapshotRow,
  type SubscriberCustomAlertRow,
  type SubscriberPreferenceRow,
  type SubscriberRoutePreferenceRow,
  type SubscriberRow,
} from "@/lib/ops/types";
import { buildSubscriberSummaries } from "@/lib/ops/audience";
import { enrichDeals } from "@/lib/ops/enrichment";
import { buildCampaignPreview, loadCampaignModel } from "@/lib/ops/campaigns";

export async function getOpsEmailCampaignsData(): Promise<OpsEmailCampaignsData> {
  const fallback = (input: {
    configured: boolean;
    onboardingMessage: string;
  }): OpsEmailCampaignsData => ({
    configured: input.configured,
    schemaReady: false,
    onboardingMessage: input.onboardingMessage,
    digestAutomation: defaultDigestAutomationSummary(),
    sendQueue: [],
    subscribers: [],
    recentCampaigns: [],
  });

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fallback({
      configured: false,
      onboardingMessage: opsConfigurationMessage(),
    });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const [
      subscribersQuery,
      preferencesQuery,
      routePreferencesQuery,
      customAlertRulesQuery,
      routesQuery,
      reviewedDealsQuery,
      recentCampaignsQuery,
      automationQuery,
    ] = await Promise.all([
      supabase
        .from("newsletter_subscribers")
        .select(
          "id,email,source,status,created_at,home_airport,onboarding_completed,preference_token,unsubscribe_token,email_confirmed,preferred_locale",
        )
        .order("created_at", { ascending: false }),
      supabase.from("subscriber_preferences").select("*"),
      supabase
        .from("subscriber_route_preferences")
        .select(
          "subscriber_id,destination_airport,destination_city,bucket,is_enabled",
        ),
      supabase
        .from("subscriber_custom_alerts")
        .select("*")
        .order("sort_order", { ascending: true }),
      supabase
        .from("scanned_routes")
        .select(
          "id,origin_airport,destination_airport,destination_city,bucket,trip_nights,min_trip_nights,max_trip_nights,max_stops,is_active",
        ),
      supabase
        .from("deal_candidates")
        .select(
          "id,route_id,snapshot_id,title,summary,deal_price,baseline_price,drop_ratio,score,send_type,status,created_at",
        )
        .eq("status", "reviewed")
        .lte("drop_ratio", EDITORIAL_DEAL_MAX_DROP_RATIO)
        .order("score", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("email_campaigns")
        .select(
          "id,send_type,subject,status,recipient_count,sent_count,failed_count,route_labels,created_at,sent_at",
        )
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("ops_automation_settings")
        .select(
          "id,daily_digest_enabled,daily_digest_hour,daily_digest_minute,test_email,last_digest_sent_on,weekly_digest_enabled,last_weekly_sent_on",
        )
        .eq("id", "default")
        .maybeSingle(),
    ]);

    const firstError =
      subscribersQuery.error ??
      preferencesQuery.error ??
      routePreferencesQuery.error ??
      customAlertRulesQuery.error ??
      routesQuery.error ??
      reviewedDealsQuery.error ??
      recentCampaignsQuery.error ??
      automationQuery.error;
    if (firstError) {
      return fallback({
        configured: true,
        onboardingMessage: opsQueryMessage(formatError(firstError)),
      });
    }

    const subscriberSummaries = buildSubscriberSummaries(
      (subscribersQuery.data ?? []) as SubscriberRow[],
      (preferencesQuery.data ?? []) as SubscriberPreferenceRow[],
      (routePreferencesQuery.data ?? []) as SubscriberRoutePreferenceRow[],
      (customAlertRulesQuery.data ?? []) as SubscriberCustomAlertRow[],
    );
    const activeAudience = subscriberSummaries.filter(
      (subscriber) =>
        subscriber.status === "active" &&
        subscriber.onboardingCompleted &&
        subscriber.emailConfirmed,
    );
    const reviewedDealRows = (
      (reviewedDealsQuery.data ?? []) as DealRow[]
    ).filter((deal) => deal.deal_price > 0);
    const snapshotIds = unique(
      reviewedDealRows.map((deal) => deal.snapshot_id),
    );
    const snapshotsQuery =
      snapshotIds.length === 0
        ? { data: [] as SnapshotRow[], error: null }
        : await supabase
            .from("price_snapshots")
            .select(
              "id,route_id,price,currency,departure_date,return_date,trip_nights,max_stops,metadata,scanned_at",
            )
            .in("id", snapshotIds);
    if (snapshotsQuery.error) {
      return fallback({
        configured: true,
        onboardingMessage: opsQueryMessage(formatError(snapshotsQuery.error)),
      });
    }

    const snapshotRows = (snapshotsQuery.data ?? []) as SnapshotRow[];
    const snapshotMap = new Map(
      snapshotRows.map((snapshot) => [snapshot.id, snapshot]),
    );
    const baselineSeriesStartMap = new Map<string, string>();
    for (const snapshot of snapshotRows) {
      const patternKey = extractPatternKey(snapshot.metadata);
      if (patternKey) {
        baselineSeriesStartMap.set(
          buildSeriesKey(snapshot.route_id, patternKey),
          snapshot.scanned_at,
        );
      }
    }
    const reviewedDeals = enrichDeals(
      reviewedDealRows,
      buildRouteMap((routesQuery.data ?? []) as RouteRow[]),
      snapshotMap,
      baselineSeriesStartMap,
    );

    const automationSettings =
      (automationQuery.data as AutomationSettingsRow | null) ?? null;
    const siteUrl = getSiteUrl();
    const digestAutomation: DigestAutomationSummary = automationSettings
      ? {
          enabled: automationSettings.daily_digest_enabled,
          weeklyEnabled: automationSettings.weekly_digest_enabled,
          lastWeeklySentOn: automationSettings.last_weekly_sent_on,
          localTime: formatTimeParts(
            automationSettings.daily_digest_hour,
            automationSettings.daily_digest_minute,
          ),
          testEmail:
            automationSettings.test_email ??
            process.env.RESEND_REPLY_TO_EMAIL ??
            null,
          lastDigestSentOn: automationSettings.last_digest_sent_on,
          endpointReady: hasCronSecret() && !siteUrl.includes("localhost"),
          blockedReason: !hasCronSecret()
            ? "Add CRON_SECRET to the deployed app and GitHub Actions before automatic digests can run."
            : siteUrl.includes("localhost")
              ? "NEXT_PUBLIC_SITE_URL still points to localhost, so the GitHub workflow has nowhere public to call."
              : null,
        }
      : defaultDigestAutomationSummary();

    const sendQueue = campaignSendTypes
      .filter((sendType) => sendType !== "weekly")
      .map((sendType) =>
        buildCampaignPreview(
          sendType,
          reviewedDeals.filter((deal) => deal.sendType === sendType),
          activeAudience,
          digestAutomation.testEmail,
        ),
      );
    const weeklyModel = await loadCampaignModel("weekly");
    sendQueue.push(
      buildCampaignPreview(
        "weekly",
        weeklyModel.deals,
        weeklyModel.subscribers,
        digestAutomation.testEmail,
      ),
    );
    const recentCampaigns = (
      (recentCampaignsQuery.data ?? []) as EmailCampaignRow[]
    ).map((campaign) => ({
      id: campaign.id,
      sendType: campaign.send_type,
      status: campaign.status,
      subject: campaign.subject,
      recipientCount: campaign.recipient_count,
      sentCount: campaign.sent_count,
      failedCount: campaign.failed_count,
      createdAt: campaign.created_at,
      sentAt: campaign.sent_at,
      routeLabels: campaign.route_labels ?? [],
    }));

    return {
      configured: true,
      schemaReady: true,
      onboardingMessage: null,
      digestAutomation,
      sendQueue,
      subscribers: subscriberSummaries,
      recentCampaigns,
    };
  } catch (error) {
    return fallback({
      configured: true,
      onboardingMessage: opsQueryMessage(formatError(error)),
    });
  }
}
