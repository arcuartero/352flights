import "server-only";
import { matchesAnySecret } from "@/lib/secret-compare";
import {
  deliveryModeMatches,
  weeklyPeriodStart,
  weeklySkipReason,
  eligibleWeeklyDeals,
  bestWeeklyDeals,
} from "@/lib/campaign-delivery";
import { createHash } from "node:crypto";
import { buildEditorialSections } from "@/lib/editorial-sections";
import {
  getCronSecret,
  getSiteUrl,
  hasCronSecret,
  hasResendEnv,
} from "@/lib/env";
import {
  buildCampaignPreviewText,
  buildCampaignSubject,
  renderCampaignEmail,
  sendResendEmail,
  getResendFromEmail,
} from "@/lib/email";
import {
  type CampaignPreview,
  type CampaignSendType,
  type DigestAutomationSummary,
} from "@/lib/ops-shared";
import {
  type DeliveryModeValue,
  type MaxStopsPreferenceValue,
  type WeekdayValue,
} from "@/lib/preferences-shared";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { digestSkipReason } from "@/lib/digest-schedule";
import {
  getScheduledDigestJob,
  sendScheduledDigestEmail,
} from "@/lib/scheduled-digest-store";
import {
  EDITORIAL_DEAL_MAX_DROP_RATIO,
  autoExpireStaleDeals,
  buildRouteMap,
  buildSeriesKey,
  defaultDigestAutomationSummary,
  extractPatternKey,
  fetchPagedSnapshots,
  formatDisplayRouteLabel,
  formatError,
  formatTimeParts,
  luxembourgParts,
  makeRouteKey,
  unique,
  weekdayForDate,
} from "@/lib/ops/shared";
import {
  type AudienceMember,
  type AutomationSettingsRow,
  type DealRow,
  type DealSummary,
  type MatchedRecipient,
  type RouteRow,
  type SnapshotRow,
  type SubscriberCustomAlertRow,
  type SubscriberPreferenceRow,
  type SubscriberRoutePreferenceRow,
  type SubscriberRow,
} from "@/lib/ops/types";
import { toRenderableDeal } from "@/lib/ops/public-fares";
import { buildSubscriberSummaries } from "@/lib/ops/audience";
import { enrichDeals } from "@/lib/ops/enrichment";

export function stopsMatch(
  preferences: MaxStopsPreferenceValue[],
  routeMaxStops: string,
) {
  if (preferences.includes("ANY")) {
    return true;
  }

  if (routeMaxStops === "NON_STOP") {
    return (
      preferences.includes("NON_STOP") ||
      preferences.includes("ONE_STOP_OR_FEWER")
    );
  }

  if (routeMaxStops === "ONE_STOP_OR_FEWER") {
    return preferences.includes("ONE_STOP_OR_FEWER");
  }

  return false;
}

export function departureWeekdayMatches(
  weekdays: WeekdayValue[],
  departureDate: string | null,
) {
  const weekday = weekdayForDate(departureDate);
  if (!weekday) {
    return false;
  }

  return weekdays.includes(weekday);
}

export function hourForDateTime(value: string | null) {
  if (!value) {
    return null;
  }

  const isoHourMatch = value.match(/T(\d{2}):\d{2}/);
  if (isoHourMatch) {
    const parsedHour = Number(isoHourMatch[1]);
    if (Number.isFinite(parsedHour)) {
      return parsedHour;
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.getHours();
}

export function comfortMatchesDeal(
  preferences: {
    earliestDepartureHour: number | null;
    latestArrivalHour: number | null;
    minDestinationStayHours: number | null;
  },
  deal: DealSummary,
) {
  if (preferences.minDestinationStayHours !== null) {
    if (
      deal.destinationStayHours === null ||
      deal.destinationStayHours < preferences.minDestinationStayHours
    ) {
      return false;
    }
  }

  if (preferences.earliestDepartureHour !== null) {
    const outboundDepartureHour = hourForDateTime(deal.outboundDepartureAt);
    const returnDepartureHour = hourForDateTime(deal.returnDepartureAt);

    if (
      outboundDepartureHour === null ||
      outboundDepartureHour < preferences.earliestDepartureHour
    ) {
      return false;
    }

    if (
      returnDepartureHour === null ||
      returnDepartureHour < preferences.earliestDepartureHour
    ) {
      return false;
    }
  }

  if (preferences.latestArrivalHour !== null) {
    const outboundArrivalHour = hourForDateTime(deal.outboundArrivalAt);
    const returnArrivalHour = hourForDateTime(deal.returnArrivalAt);

    if (
      outboundArrivalHour === null ||
      outboundArrivalHour > preferences.latestArrivalHour
    ) {
      return false;
    }

    if (
      returnArrivalHour === null ||
      returnArrivalHour > preferences.latestArrivalHour
    ) {
      return false;
    }
  }

  return true;
}

export function basePreferenceMatchesDeal(
  subscriber: AudienceMember,
  deal: DealSummary,
) {
  if (!subscriber.preferredBuckets.includes(deal.routeBucket)) {
    return false;
  }

  if (
    subscriber.selectedRouteKeys.size > 0 &&
    !subscriber.selectedRouteKeys.has(
      makeRouteKey(deal.destinationAirport, deal.routeBucket),
    )
  ) {
    return false;
  }

  if (!stopsMatch(subscriber.maxStopsPreferences, deal.maxStops)) {
    return false;
  }

  if (
    !departureWeekdayMatches(subscriber.departureWeekdays, deal.departureDate)
  ) {
    return false;
  }

  if (
    subscriber.minTripNights !== null &&
    deal.tripNights < subscriber.minTripNights
  ) {
    return false;
  }

  if (
    subscriber.maxTripNights !== null &&
    deal.tripNights > subscriber.maxTripNights
  ) {
    return false;
  }

  if (
    subscriber.budgetCeilingEur !== null &&
    deal.dealPrice > subscriber.budgetCeilingEur
  ) {
    return false;
  }

  return true;
}

export function customRuleMatchesDeal(
  rule: AudienceMember["customAlertRules"][number],
  deal: DealSummary,
) {
  if (!rule.isActive) {
    return false;
  }

  if (rule.destinationCity && rule.destinationCity !== deal.destinationCity) {
    return false;
  }

  if (rule.bucket && rule.bucket !== deal.routeBucket) {
    return false;
  }

  if (!stopsMatch(rule.maxStopsPreferences, deal.maxStops)) {
    return false;
  }

  if (!departureWeekdayMatches(rule.departureWeekdays, deal.departureDate)) {
    return false;
  }

  if (rule.minTripNights !== null && deal.tripNights < rule.minTripNights) {
    return false;
  }

  if (rule.maxTripNights !== null && deal.tripNights > rule.maxTripNights) {
    return false;
  }

  if (
    rule.budgetCeilingEur !== null &&
    deal.dealPrice > rule.budgetCeilingEur
  ) {
    return false;
  }

  return true;
}

export function dealMatchesSubscriber(
  subscriber: AudienceMember,
  deal: DealSummary,
  sendType: CampaignSendType,
) {
  if (!deliveryModeMatches(sendType, subscriber.deliveryModes)) {
    return false;
  }

  if (!comfortMatchesDeal(subscriber, deal)) {
    return false;
  }

  if (basePreferenceMatchesDeal(subscriber, deal)) {
    return true;
  }

  return subscriber.customAlertRules.some((rule) =>
    customRuleMatchesDeal(rule, deal),
  );
}

export function matchRecipients(
  sendType: CampaignSendType,
  subscribers: AudienceMember[],
  deals: DealSummary[],
) {
  const matched: MatchedRecipient[] = [];

  for (const subscriber of subscribers) {
    const matchingDeals = deals.filter((deal) =>
      dealMatchesSubscriber(subscriber, deal, sendType),
    );
    if (matchingDeals.length === 0) {
      continue;
    }

    matched.push({
      subscriber,
      deals:
        sendType === "weekly"
          ? bestWeeklyDeals(matchingDeals)
          : matchingDeals.sort((left, right) => {
              if (right.score !== left.score) {
                return right.score - left.score;
              }

              return left.dealPrice - right.dealPrice;
            }),
    });
  }

  return matched;
}

export function buildPreviewRender(
  sendType: CampaignSendType,
  deals: DealSummary[],
  subscriber: AudienceMember | null,
) {
  const siteUrl = getSiteUrl();
  const previewDeals = deals.slice(0, 3);
  const locale = subscriber?.preferredLocale ?? "en";
  const subject = buildCampaignSubject(sendType, previewDeals, locale);
  const previewText = buildCampaignPreviewText(sendType, previewDeals, locale);
  const rendered = renderCampaignEmail({
    sendType,
    subject,
    previewText,
    subscriberEmail: subscriber?.email ?? null,
    managePreferencesUrl: subscriber
      ? `${siteUrl}/preferences?token=${subscriber.preferenceToken}`
      : `${siteUrl}/preferences`,
    unsubscribeUrl: subscriber
      ? `${siteUrl}/unsubscribe?token=${subscriber.unsubscribeToken}`
      : `${siteUrl}/unsubscribe`,
    deals: previewDeals.map(toRenderableDeal),
    locale,
  });

  return {
    subject,
    previewText,
    previewHtml: rendered.html,
    previewDeals: previewDeals.map(toRenderableDeal),
  };
}

export function buildCampaignPreview(
  sendType: CampaignSendType,
  deals: DealSummary[],
  subscribers: AudienceMember[],
  suggestedTestEmail: string | null,
): CampaignPreview {
  const matchedRecipients = matchRecipients(sendType, subscribers, deals);
  const topRoutes = unique(
    deals.map((deal) =>
      formatDisplayRouteLabel(deal.routeLabel, deal.patternLabel),
    ),
  ).slice(0, 3);
  const previewSeed = matchedRecipients[0]?.deals ?? deals;
  const previewRender = buildPreviewRender(
    sendType,
    previewSeed,
    matchedRecipients[0]?.subscriber ?? null,
  );
  const previewDeals = previewSeed.map(toRenderableDeal);
  const previewSections = buildEditorialSections(previewDeals, (deal) => ({
    routeBucket: deal.routeBucket,
    tripNights: deal.tripNights,
    dropRatio: deal.dropRatio,
    departureDate: deal.departureDate,
  }));

  let blockedReason: string | null = null;
  if (!hasResendEnv()) {
    blockedReason = "Add RESEND_API_KEY before sending live emails.";
  } else if (deals.length === 0) {
    blockedReason =
      sendType === "flash"
        ? "Review at least one flash deal to unlock this send."
        : "Review at least one digest deal to unlock this send.";
  } else if (matchedRecipients.length === 0) {
    blockedReason =
      "No active subscribers match the current routes and filters.";
  }

  return {
    sendType,
    label:
      sendType === "weekly"
        ? "Weekly best-of"
        : sendType === "flash"
          ? "Flash alerts"
          : "Daily digest",
    description:
      sendType === "weekly"
        ? "Up to six matching destinations from the last seven days. Sent once per week to weekly subscribers."
        : sendType === "flash"
          ? "Immediate sends for the strongest drops. Weekly-only subscribers stay excluded."
          : "One operational digest to everyone whose route profile matches reviewed daily deals.",
    reviewedDeals: deals.length,
    matchingSubscribers: matchedRecipients.length,
    topRoutes,
    isReady: blockedReason === null,
    blockedReason,
    subject: previewRender.subject,
    previewText: previewRender.previewText,
    previewHtml: previewRender.previewHtml,
    previewDeals,
    previewSections,
    suggestedTestEmail,
  };
}

export function buildIdempotencyKey(
  sendType: CampaignSendType,
  subscriberId: string,
  dealIds: string[],
) {
  const digest = createHash("sha1")
    .update(`${sendType}:${subscriberId}:${[...dealIds].sort().join(",")}`)
    .digest("hex");

  return `lux-${sendType}-${digest}`;
}

export async function loadAutomationSettings() {
  const supabase = getSupabaseAdminClient();
  const query = await supabase
    .from("ops_automation_settings")
    .select(
      "id,daily_digest_enabled,daily_digest_hour,daily_digest_minute,test_email,last_digest_sent_on,weekly_digest_enabled,last_weekly_sent_on",
    )
    .eq("id", "default")
    .maybeSingle();

  if (query.error) {
    throw new Error(formatError(query.error));
  }

  const row = query.data as AutomationSettingsRow | null;
  if (!row) {
    return defaultDigestAutomationSummary();
  }

  const siteUrl = getSiteUrl();
  const endpointReady = hasCronSecret() && !siteUrl.includes("localhost");
  let blockedReason: string | null = null;

  if (!hasCronSecret()) {
    blockedReason =
      "Add CRON_SECRET to the deployed app and GitHub Actions before automatic digests can run.";
  } else if (siteUrl.includes("localhost")) {
    blockedReason =
      "NEXT_PUBLIC_SITE_URL still points to localhost, so the GitHub workflow has nowhere public to call.";
  }

  return {
    enabled: row.daily_digest_enabled,
    weeklyEnabled: row.weekly_digest_enabled,
    lastWeeklySentOn: row.last_weekly_sent_on,
    localTime: formatTimeParts(row.daily_digest_hour, row.daily_digest_minute),
    testEmail: row.test_email ?? process.env.RESEND_REPLY_TO_EMAIL ?? null,
    lastDigestSentOn: row.last_digest_sent_on,
    endpointReady,
    blockedReason,
  } satisfies DigestAutomationSummary;
}

export async function loadCampaignModel(sendType: CampaignSendType) {
  await autoExpireStaleDeals();
  const supabase = getSupabaseAdminClient();
  const [
    subscribersQuery,
    preferencesQuery,
    routePreferencesQuery,
    customAlertRulesQuery,
    routesQuery,
    dealsQuery,
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
      .in("status", sendType === "weekly" ? ["reviewed", "sent"] : ["reviewed"])
      .lte("drop_ratio", EDITORIAL_DEAL_MAX_DROP_RATIO)
      .in("send_type", sendType === "weekly" ? ["digest", "flash"] : [sendType])
      .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
      .order("score", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const errors = [
    subscribersQuery.error ? formatError(subscribersQuery.error) : null,
    preferencesQuery.error ? formatError(preferencesQuery.error) : null,
    routePreferencesQuery.error
      ? formatError(routePreferencesQuery.error)
      : null,
    customAlertRulesQuery.error
      ? formatError(customAlertRulesQuery.error)
      : null,
    routesQuery.error ? formatError(routesQuery.error) : null,
    dealsQuery.error ? formatError(dealsQuery.error) : null,
  ].filter(Boolean) as string[];

  if (errors.length > 0) {
    throw new Error(errors[0]);
  }

  const dealRows = (dealsQuery.data ?? []) as DealRow[];
  const snapshotIds = unique(dealRows.map((deal) => deal.snapshot_id));
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
    throw new Error(formatError(snapshotsQuery.error));
  }

  const subscribers = buildSubscriberSummaries(
    (subscribersQuery.data ?? []) as SubscriberRow[],
    (preferencesQuery.data ?? []) as SubscriberPreferenceRow[],
    (routePreferencesQuery.data ?? []) as SubscriberRoutePreferenceRow[],
    (customAlertRulesQuery.data ?? []) as SubscriberCustomAlertRow[],
  );

  const activeAudience = subscribers.filter(
    (subscriber) =>
      subscriber.status === "active" &&
      subscriber.onboardingCompleted &&
      subscriber.emailConfirmed,
  );
  const routeMap = buildRouteMap((routesQuery.data ?? []) as RouteRow[]);
  const snapshotMap = new Map(
    ((snapshotsQuery.data ?? []) as SnapshotRow[]).map((snapshot) => [
      snapshot.id,
      snapshot,
    ]),
  );
  const baselineSeriesStartMap = new Map<string, string>();
  for (const snapshot of (snapshotsQuery.data ?? []) as SnapshotRow[]) {
    const patternKey = extractPatternKey(snapshot.metadata);
    if (!patternKey) {
      continue;
    }

    const seriesKey = buildSeriesKey(snapshot.route_id, patternKey);
    const currentEarliest = baselineSeriesStartMap.get(seriesKey);
    if (
      !currentEarliest ||
      new Date(snapshot.scanned_at).getTime() <
        new Date(currentEarliest).getTime()
    ) {
      baselineSeriesStartMap.set(seriesKey, snapshot.scanned_at);
    }
  }
  const deals = enrichDeals(
    dealRows,
    routeMap,
    snapshotMap,
    baselineSeriesStartMap,
  );

  return {
    subscribers: activeAudience,
    deals: sendType === "weekly" ? eligibleWeeklyDeals(deals) : deals,
  };
}

export async function sendApprovedDealCampaign(input: {
  sendType: CampaignSendType;
  digestDate?: string;
}) {
  if (!hasResendEnv()) {
    throw new Error("Add RESEND_API_KEY before sending live emails.");
  }

  const supabase = getSupabaseAdminClient();
  const prepare = async () => {
    const model = await loadCampaignModel(input.sendType);
    if (!model.deals.length)
      throw new Error("There are no reviewed digest deals ready to send.");
    if (
      !matchRecipients(input.sendType, model.subscribers, model.deals).length
    ) {
      throw new Error(
        "No active subscribers match the reviewed deals and saved route filters.",
      );
    }
    return {
      deals: model.deals,
      subscribers: model.subscribers.map((subscriber) => ({
        ...subscriber,
        selectedRouteKeys: [...subscriber.selectedRouteKeys],
      })),
    };
  };
  const job = input.digestDate
    ? await getScheduledDigestJob(
        input.digestDate,
        prepare,
        input.sendType === "weekly" ? "weekly" : "digest",
      )
    : null;
  const { subscribers, deals } = job
    ? {
        deals: job.model.deals,
        subscribers: job.model.subscribers.map((subscriber) => ({
          ...subscriber,
          selectedRouteKeys: new Set(subscriber.selectedRouteKeys),
        })),
      }
    : await loadCampaignModel(input.sendType);

  if (deals.length === 0) {
    throw new Error(
      input.sendType === "flash"
        ? "There are no reviewed flash deals ready to send."
        : "There are no reviewed digest deals ready to send.",
    );
  }

  let matchedRecipients = matchRecipients(input.sendType, subscribers, deals);
  if (job) {
    // Respect unsubscribes/confirmation changes since the frozen daily snapshot.
    const active = await fetchPagedSnapshots((from, to) =>
      supabase
        .from("newsletter_subscribers")
        .select("id")
        .eq("status", "active")
        .eq("email_confirmed", true)
        .eq("onboarding_completed", true)
        .order("id")
        .range(from, to),
    );
    const currentPreferences = await fetchPagedSnapshots((from, to) =>
      supabase
        .from("subscriber_preferences")
        .select("subscriber_id,delivery_mode,delivery_modes")
        .order("subscriber_id")
        .range(from, to),
    );
    if (active.error || currentPreferences.error)
      throw new Error(active.error ?? currentPreferences.error!);
    const ids = new Set(active.data.map((row) => row.id));
    const modesBySubscriber = new Map(
      currentPreferences.data.map((row) => [
        row.subscriber_id,
        (row.delivery_modes?.length
          ? row.delivery_modes
          : [row.delivery_mode ?? "daily_digest"]) as DeliveryModeValue[],
      ]),
    );
    matchedRecipients = matchedRecipients.filter(
      ({ subscriber }) =>
        ids.has(subscriber.id) &&
        deliveryModeMatches(
          input.sendType,
          modesBySubscriber.get(subscriber.id) ?? ["daily_digest"],
        ),
    );
  }
  if (matchedRecipients.length === 0) {
    throw new Error(
      "No active subscribers match the reviewed deals and saved route filters.",
    );
  }

  const nowIso = new Date().toISOString();
  const routeLabels = unique(
    deals.map((deal) =>
      formatDisplayRouteLabel(deal.routeLabel, deal.patternLabel),
    ),
  ).slice(0, 8);
  const genericSubject =
    input.sendType === "weekly"
      ? "+352 Flights weekly best-of"
      : input.sendType === "flash"
        ? "+352 Flights flash alert"
        : "+352 Flights daily digest";
  const previewText = buildCampaignPreviewText(input.sendType, deals);

  const campaignInsert = await supabase
    .from("email_campaigns")
    .upsert(
      {
        ...(job ? { id: job.id } : {}),
        send_type: input.sendType,
        subject: genericSubject,
        preview_text: previewText,
        from_email: getResendFromEmail("campaign"),
        reply_to_email: process.env.RESEND_REPLY_TO_EMAIL ?? null,
        recipient_count: matchedRecipients.length,
        sent_count: 0,
        failed_count: 0,
        status: "sending",
        provider: "resend",
        deal_candidate_ids: deals.map((deal) => deal.id),
        route_labels: routeLabels,
        created_at: nowIso,
      },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();

  if (campaignInsert.error) {
    throw new Error(formatError(campaignInsert.error));
  }

  const campaignId = job?.id ?? campaignInsert.data!.id;
  const siteUrl = getSiteUrl();
  const results: Array<{
    subscriberId: string;
    email: string;
    subject: string;
    dealIds: string[];
    status: "sent" | "failed";
    providerMessageId: string | null;
    errorMessage: string | null;
    sentAt: string | null;
  }> = [];

  try {
    for (let index = 0; index < matchedRecipients.length; index += 5) {
      const chunk = matchedRecipients.slice(index, index + 5);
      const chunkResults = await Promise.all(
        chunk.map(async ({ subscriber, deals: matchedDeals }) => {
          const subject = buildCampaignSubject(
            input.sendType,
            matchedDeals,
            subscriber.preferredLocale,
          );
          const preview = buildCampaignPreviewText(
            input.sendType,
            matchedDeals,
            subscriber.preferredLocale,
          );
          const rendered = renderCampaignEmail({
            sendType: input.sendType,
            subject,
            previewText: preview,
            subscriberEmail: subscriber.email,
            managePreferencesUrl: `${siteUrl}/preferences?token=${subscriber.preferenceToken}`,
            unsubscribeUrl: `${siteUrl}/unsubscribe?token=${subscriber.unsubscribeToken}`,
            deals: matchedDeals.map(toRenderableDeal),
            locale: subscriber.preferredLocale,
          });

          try {
            const providerMessageId = await (
              job ? sendScheduledDigestEmail : sendResendEmail
            )({
              to: subscriber.email,
              subject,
              html: rendered.html,
              text: rendered.text,
              emailType: "campaign",
              sendType: input.sendType,
              listUnsubscribeUrl: `${siteUrl}/api/unsubscribe/one-click?token=${subscriber.unsubscribeToken}`,
              idempotencyKey: input.digestDate
                ? `lux-${input.sendType}-${input.digestDate}-${subscriber.id}`
                : buildIdempotencyKey(
                    input.sendType,
                    subscriber.id,
                    matchedDeals.map((deal) => deal.id),
                  ),
            });

            return {
              subscriberId: subscriber.id,
              email: subscriber.email,
              subject,
              dealIds: matchedDeals.map((deal) => deal.id),
              status: "sent" as const,
              providerMessageId,
              errorMessage: null,
              sentAt: new Date().toISOString(),
            };
          } catch (error) {
            return {
              subscriberId: subscriber.id,
              email: subscriber.email,
              subject,
              dealIds: matchedDeals.map((deal) => deal.id),
              status: "failed" as const,
              providerMessageId: null,
              errorMessage:
                error instanceof Error
                  ? error.message
                  : "Email provider request failed.",
              sentAt: null,
            };
          }
        }),
      );

      const deliveryInsert = await supabase.from("email_deliveries").upsert(
        chunkResults.map((result) => ({
          ...(job
            ? {
                scheduled_message_key: `lux-${input.sendType}-${input.digestDate}-${result.subscriberId}`,
              }
            : {}),
          campaign_id: campaignId,
          subscriber_id: result.subscriberId,
          email: result.email,
          subject: result.subject,
          deal_candidate_ids: result.dealIds,
          status: result.status,
          provider_message_id: result.providerMessageId,
          error_message: result.errorMessage,
          sent_at: result.sentAt,
        })),
        { onConflict: job ? "scheduled_message_key" : "id" },
      );

      if (deliveryInsert.error) {
        throw new Error(formatError(deliveryInsert.error));
      }

      results.push(...chunkResults);
    }
  } catch (error) {
    await supabase
      .from("email_campaigns")
      .update({
        status: "failed",
        error_message:
          error instanceof Error ? error.message : "Campaign send failed.",
      })
      .eq("id", campaignId);

    throw error;
  }

  const sentCount = results.filter((result) => result.status === "sent").length;
  const failedCount = results.length - sentCount;
  const status =
    sentCount === 0 ? "failed" : failedCount === 0 ? "sent" : "partial";

  const campaignUpdate = await supabase
    .from("email_campaigns")
    .update({
      sent_count: sentCount,
      failed_count: failedCount,
      status,
      sent_at: sentCount > 0 ? new Date().toISOString() : null,
      error_message:
        failedCount > 0 ? `${failedCount} deliveries failed.` : null,
    })
    .eq("id", campaignId);

  if (campaignUpdate.error) {
    throw new Error(formatError(campaignUpdate.error));
  }

  if (
    input.sendType !== "weekly" &&
    sentCount > 0 &&
    (!job || failedCount === 0)
  ) {
    const dealUpdate = await supabase
      .from("deal_candidates")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .in(
        "id",
        unique(
          results.flatMap((result) =>
            result.status === "sent" ? result.dealIds : [],
          ),
        ),
      );

    if (dealUpdate.error) {
      throw new Error(formatError(dealUpdate.error));
    }
  }

  return {
    campaignId,
    recipientCount: matchedRecipients.length,
    sentCount,
    failedCount,
    sendType: input.sendType,
  };
}

export async function sendCampaignTestEmail(input: {
  sendType: CampaignSendType;
  testEmail?: string | null;
}) {
  if (!hasResendEnv()) {
    throw new Error("Add RESEND_API_KEY before sending live emails.");
  }

  const fallbackEmail = process.env.RESEND_REPLY_TO_EMAIL ?? null;
  const destination = input.testEmail?.trim() || fallbackEmail;
  if (!destination) {
    throw new Error(
      "Add a test email in /ops or set RESEND_REPLY_TO_EMAIL first.",
    );
  }

  const { subscribers, deals } = await loadCampaignModel(input.sendType);
  if (deals.length === 0) {
    throw new Error(
      input.sendType === "flash"
        ? "There are no reviewed flash deals to preview right now."
        : "There are no reviewed digest deals to preview right now.",
    );
  }

  const matchedRecipients = matchRecipients(input.sendType, subscribers, deals);
  const previewRecipient =
    matchedRecipients[0]?.subscriber ?? subscribers[0] ?? null;
  const previewDeals = matchedRecipients[0]?.deals ?? deals.slice(0, 3);
  const preview = buildPreviewRender(
    input.sendType,
    previewDeals,
    previewRecipient,
  );

  await sendResendEmail({
    to: destination,
    subject: `[Test] ${preview.subject}`,
    html: preview.previewHtml,
    text: `${preview.previewText}\n\nThis is a test email from +352 Flights.`,
    emailType: "campaign_test",
    sendType: input.sendType,
    idempotencyKey: `lux-test-${input.sendType}-${destination}-${Date.now()}`,
  });

  return {
    sendType: input.sendType,
    email: destination,
  };
}

export async function updateDigestAutomation(input: {
  enabled: boolean;
  weeklyEnabled: boolean;
  localTime: string;
  testEmail: string | null;
}) {
  const [hourString, minuteString] = input.localTime.split(":");
  const hour = Number(hourString);
  const minute = Number(minuteString);

  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error("Digest hour must be between 00 and 23.");
  }

  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error("Digest minute must be between 00 and 59.");
  }

  const supabase = getSupabaseAdminClient();
  const upsertQuery = await supabase.from("ops_automation_settings").upsert(
    {
      id: "default",
      daily_digest_enabled: input.enabled,
      weekly_digest_enabled: input.weeklyEnabled,
      daily_digest_hour: hour,
      daily_digest_minute: minute,
      test_email: input.testEmail?.trim() ? input.testEmail.trim() : null,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "id",
      ignoreDuplicates: false,
    },
  );

  if (upsertQuery.error) {
    throw new Error(formatError(upsertQuery.error));
  }

  return {
    enabled: input.enabled,
    localTime: formatTimeParts(hour, minute),
  };
}

export async function runScheduledDigest(input: { force?: boolean } = {}) {
  const automation = await loadAutomationSettings();
  const now = luxembourgParts(new Date());

  const reason = digestSkipReason({
    force: input.force,
    enabled: automation.enabled,
    localTime: automation.localTime,
    nowTime: now.time,
    localDate: now.date,
    lastDigestSentOn: automation.lastDigestSentOn,
  });
  if (reason) return { status: "skipped" as const, reason };

  try {
    const result = await sendApprovedDealCampaign({
      sendType: "digest",
      digestDate: now.date,
    });
    if (result.failedCount > 0) {
      throw new Error(
        `${result.failedCount} digest deliveries remain pending; retry this same date.`,
      );
    }
    const supabase = getSupabaseAdminClient();
    const updateQuery = await supabase
      .from("ops_automation_settings")
      .update({
        last_digest_sent_on: now.date,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "default");

    if (updateQuery.error) {
      throw new Error(formatError(updateQuery.error));
    }

    return {
      status: "sent" as const,
      ...result,
      localDate: now.date,
      localTime: now.time,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Scheduled digest failed.";
    if (
      message.includes("There are no reviewed digest deals") ||
      message.includes("No active subscribers match the reviewed deals")
    ) {
      return {
        status: "skipped" as const,
        reason: message,
      };
    }

    throw error;
  }
}

export function validateCronSecret(secret: string | null) {
  if (!hasCronSecret()) {
    return false;
  }

  return matchesAnySecret(secret, [getCronSecret().CRON_SECRET]);
}

/** Runs from the hourly trigger; Monday's date stays stable for retries all week. */
export async function runScheduledWeeklyDigest(
  input: { force?: boolean } = {},
) {
  const automation = await loadAutomationSettings();
  const now = luxembourgParts(new Date());
  const reason = weeklySkipReason({
    ...input,
    enabled: automation.weeklyEnabled,
    localDate: now.date,
    nowTime: now.time,
    localTime: automation.localTime,
    lastWeeklySentOn: automation.lastWeeklySentOn,
  });
  if (reason) return { status: "skipped" as const, reason };
  const week = weeklyPeriodStart(now.date);
  try {
    const result = await sendApprovedDealCampaign({
      sendType: "weekly",
      digestDate: week,
    });
    if (result.failedCount > 0)
      throw new Error(
        `${result.failedCount} weekly deliveries remain pending for ${week}.`,
      );
    const saved = await getSupabaseAdminClient()
      .from("ops_automation_settings")
      .upsert(
        {
          id: "default",
          last_weekly_sent_on: week,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
    if (saved.error) throw new Error(formatError(saved.error));
    return {
      status: "sent" as const,
      ...result,
      week,
      localDate: now.date,
      localTime: now.time,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Weekly roundup failed.";
    if (
      message.includes("There are no reviewed digest deals") ||
      message.includes("No active subscribers match")
    ) {
      return { status: "skipped" as const, reason: message };
    }
    throw error;
  }
}
