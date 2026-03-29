import "server-only";

import { getResendEnv, getSiteUrl } from "@/lib/env";
import { type CampaignSendType } from "@/lib/ops-shared";

type RenderableDeal = {
  id: string;
  title: string;
  summary: string;
  routeLabel: string;
  destinationCity: string;
  destinationAirport: string;
  dealPrice: number;
  baselinePrice: number | null;
  dropRatio: number | null;
  departureDate: string | null;
  returnDate: string | null;
  tripNights: number;
  maxStops: string;
  airlineSummary: string | null;
  bookingUrl: string | null;
};

type RenderCampaignEmailInput = {
  sendType: CampaignSendType;
  subject: string;
  previewText: string;
  managePreferencesUrl: string;
  deals: RenderableDeal[];
};

type SendResendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  sendType: CampaignSendType;
  idempotencyKey: string;
};

function formatCurrency(value: number, currency: string = "EUR") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) {
    return "Flexible dates";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatStops(maxStops: string) {
  if (maxStops === "NON_STOP") {
    return "Non-stop only";
  }

  if (maxStops === "ONE_STOP_OR_FEWER") {
    return "Up to 1 stop";
  }

  return maxStops.replaceAll("_", " ");
}

function formatDrop(dropRatio: number | null) {
  if (dropRatio === null) {
    return "below the recent baseline";
  }

  return `${Math.round((1 - dropRatio) * 100)}% below the recent baseline`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildDealHeadline(sendType: CampaignSendType, deals: RenderableDeal[]) {
  if (sendType === "flash") {
    return "A fare just moved sharply below the normal range.";
  }

  if (deals.length === 1) {
    return "One route in your Luxembourg profile is standing out today.";
  }

  return "Here are the best Luxembourg fares that match the routes and filters you picked.";
}

export function buildCampaignSubject(sendType: CampaignSendType, deals: RenderableDeal[]) {
  const [topDeal] = deals;

  if (!topDeal) {
    return sendType === "flash"
      ? "Lux Flight Deals flash alert"
      : "Lux Flight Deals daily digest";
  }

  if (deals.length === 1) {
    return `${topDeal.destinationCity} from ${formatCurrency(topDeal.dealPrice)}`;
  }

  return `${topDeal.destinationCity} from ${formatCurrency(topDeal.dealPrice)} + ${
    deals.length - 1
  } more Luxembourg fares`;
}

export function buildCampaignPreviewText(sendType: CampaignSendType, deals: RenderableDeal[]) {
  const [topDeal] = deals;
  if (!topDeal) {
    return sendType === "flash"
      ? "Urgent Luxembourg flight alert."
      : "Fresh Luxembourg fare drops from your watchlist.";
  }

  if (deals.length === 1) {
    return `${topDeal.routeLabel} at ${formatCurrency(topDeal.dealPrice)}.`;
  }

  return `${deals.length} matching fares, led by ${topDeal.destinationCity} at ${formatCurrency(
    topDeal.dealPrice,
  )}.`;
}

export function renderCampaignEmail(input: RenderCampaignEmailInput) {
  const siteUrl = getSiteUrl();
  const headline = buildDealHeadline(input.sendType, input.deals);
  const intro =
    input.sendType === "flash"
      ? "This one crossed the stronger alert threshold, so we are sending it immediately."
      : "These are the strongest fares currently sitting inside your route profile.";

  const htmlDeals = input.deals
    .map((deal) => {
      const baseline =
        deal.baselinePrice === null ? "Baseline still forming" : formatCurrency(deal.baselinePrice);

      return `
        <tr>
          <td style="padding: 0 0 18px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid rgba(7, 19, 29, 0.12); border-radius: 18px; background: #f7f3ea;">
              <tr>
                <td style="padding: 20px 22px;">
                  <p style="margin: 0; color: #bb7a21; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;">${escapeHtml(
                    deal.routeLabel,
                  )}</p>
                  <h2 style="margin: 12px 0 8px; color: #0a1a28; font-size: 24px; line-height: 1.1;">${escapeHtml(
                    deal.title,
                  )}</h2>
                  <p style="margin: 0; color: #44515b; font-size: 15px; line-height: 1.6;">${escapeHtml(
                    deal.summary,
                  )}</p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 16px;">
                    <tr>
                      <td style="padding: 0 12px 8px 0; color: #6b7780; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em;">Price</td>
                      <td style="padding: 0 12px 8px 0; color: #6b7780; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em;">Travel dates</td>
                      <td style="padding: 0 0 8px; color: #6b7780; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em;">Trip shape</td>
                      <td style="padding: 0 0 8px 12px; color: #6b7780; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em;">Airline</td>
                    </tr>
                    <tr>
                      <td style="padding: 0 12px 0 0; color: #0a1a28; font-size: 16px; font-weight: 700;">${escapeHtml(
                        formatCurrency(deal.dealPrice),
                      )}</td>
                      <td style="padding: 0 12px 0 0; color: #0a1a28; font-size: 15px;">${escapeHtml(
                        `${formatDate(deal.departureDate)} to ${formatDate(deal.returnDate)}`,
                      )}</td>
                      <td style="padding: 0; color: #0a1a28; font-size: 15px;">${escapeHtml(
                        `${deal.tripNights} nights · ${formatStops(deal.maxStops)}`,
                      )}</td>
                      <td style="padding: 0 0 0 12px; color: #0a1a28; font-size: 15px;">${escapeHtml(
                        deal.airlineSummary ?? "Multiple carriers",
                      )}</td>
                    </tr>
                  </table>
                  <p style="margin: 14px 0 0; color: #44515b; font-size: 14px; line-height: 1.6;">
                    Recent baseline: ${escapeHtml(baseline)}. This is ${escapeHtml(
                      formatDrop(deal.dropRatio),
                    )}.
                  </p>
                  ${
                    deal.bookingUrl
                      ? `<p style="margin: 18px 0 0;"><a href="${escapeHtml(
                          deal.bookingUrl,
                        )}" style="display: inline-block; padding: 12px 16px; border-radius: 999px; background: #bb7a21; color: #fffaf0; font-size: 14px; font-weight: 700; text-decoration: none;">Open in Skyscanner</a></p>`
                      : ""
                  }
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `;
    })
    .join("");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(input.subject)}</title>
  </head>
  <body style="margin: 0; padding: 32px 16px; background: #07131d; color: #0a1a28; font-family: Avenir Next, Segoe UI, Helvetica Neue, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 680px; background: #fffaf0; border-radius: 28px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08);">
            <tr>
              <td style="padding: 36px 34px 22px; background: linear-gradient(135deg, #0a1622 0%, #09111a 100%); color: #f6efe1;">
                <p style="margin: 0; color: #f5af4a; font-size: 11px; letter-spacing: 0.24em; text-transform: uppercase;">Lux Flight Deals</p>
                <h1 style="margin: 14px 0 10px; font-family: Iowan Old Style, Palatino Linotype, Book Antiqua, serif; font-size: 38px; line-height: 0.98;">${escapeHtml(
                  headline,
                )}</h1>
                <p style="margin: 0; color: rgba(246, 239, 225, 0.78); font-size: 16px; line-height: 1.7;">${escapeHtml(
                  intro,
                )}</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 28px 34px 10px;">
                <p style="margin: 0 0 18px; color: #44515b; font-size: 16px; line-height: 1.7;">
                  ${escapeHtml(input.previewText)}
                </p>
                <p style="margin: 0 0 22px; color: #44515b; font-size: 15px; line-height: 1.7;">
                  Open this search in <a href="https://www.skyscanner.net" style="color: #bb7a21; font-weight: 700;">Skyscanner</a> or your preferred booking flow while the fare is still visible.
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${htmlDeals}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 34px 34px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top: 1px solid rgba(7, 19, 29, 0.12);">
                  <tr>
                    <td style="padding-top: 20px;">
                      <p style="margin: 0; color: #6b7780; font-size: 13px; line-height: 1.7;">
                        You are receiving this because you asked for Luxembourg flight deals matched to your route profile.
                        <a href="${escapeHtml(input.managePreferencesUrl)}" style="color: #bb7a21; font-weight: 700;">Manage preferences</a>
                        or revisit <a href="${escapeHtml(siteUrl)}" style="color: #bb7a21; font-weight: 700;">Lux Flight Deals</a>.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textLines = [
    "Lux Flight Deals",
    "",
    headline,
    intro,
    "",
    input.previewText,
    "",
    ...input.deals.flatMap((deal) => [
      `${deal.routeLabel} · ${deal.title}`,
      `${deal.summary}`,
      `Price: ${formatCurrency(deal.dealPrice)}`,
      `Travel dates: ${formatDate(deal.departureDate)} to ${formatDate(deal.returnDate)}`,
      `Trip shape: ${deal.tripNights} nights · ${formatStops(deal.maxStops)}`,
      `Airline: ${deal.airlineSummary ?? "Multiple carriers"}`,
      ...(deal.bookingUrl ? [`Open in Skyscanner: ${deal.bookingUrl}`] : []),
      `Baseline: ${
        deal.baselinePrice === null ? "Baseline still forming" : formatCurrency(deal.baselinePrice)
      }`,
      `Drop: ${formatDrop(deal.dropRatio)}`,
      "",
    ]),
    "Search in Skyscanner: https://www.skyscanner.net",
    `Manage preferences: ${input.managePreferencesUrl}`,
    `Homepage: ${siteUrl}`,
  ];

  return {
    html,
    text: textLines.join("\n"),
  };
}

export async function sendResendEmail(input: SendResendEmailInput) {
  const env = getResendEnv();

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(env.RESEND_REPLY_TO_EMAIL ? { replyTo: env.RESEND_REPLY_TO_EMAIL } : {}),
      tags: [
        {
          name: "product",
          value: "luxflightdeals",
        },
        {
          name: "send_type",
          value: input.sendType,
        },
      ],
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { id?: string; message?: string; error?: string }
    | null;

  if (!response.ok || !payload?.id) {
    throw new Error(payload?.message ?? payload?.error ?? "Resend rejected the email request.");
  }

  return payload.id;
}
