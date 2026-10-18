import "server-only";
import type { CampaignSendType } from "@/lib/ops-shared";
import { weeklyEmailCopy } from "@/lib/weekly-email-copy";
import { getSiteUrl } from "@/lib/env";
import { buildEditorialSections } from "@/lib/editorial-sections";
import {
  BRAND_NAME,
  type RenderableDeal,
  buildDealHeadline,
  escapeHtml,
  formatCampaignDateRange,
  formatCampaignDealPattern,
  formatCampaignDealTitle,
  formatCampaignRouteLabel,
  formatCampaignTiming,
  formatCurrency,
  formatDateWithWeekday,
  formatDrop,
  formatFlightClock,
  formatFlightWeekdayClock,
  formatStayHours,
  formatStops,
  formatVerifiedAge,
  renderPlainEmailAddress,
  versionEmailAsset,
} from "./format";
import { type EmailLocale, getCopy, normalizeEmailLocale } from "./copy";

type RenderCampaignEmailInput = {
  sendType: CampaignSendType;
  subject: string;
  previewText: string;
  subscriberEmail?: string | null;
  managePreferencesUrl: string;
  unsubscribeUrl: string;
  deals: RenderableDeal[];
  locale?: EmailLocale | null;
};

export function buildCampaignSubject(
  sendType: CampaignSendType,
  deals: RenderableDeal[],
  locale?: EmailLocale | null,
) {
  const copy = getCopy(locale);
  const [topDeal] = deals;
  if (sendType === "weekly") {
    const label = weeklyEmailCopy[normalizeEmailLocale(locale)].subject;
    return topDeal
      ? `${label}: ${copy.singleSubject(topDeal.destinationCity, formatCurrency(topDeal.dealPrice, locale))}`
      : label;
  }

  if (!topDeal) {
    return sendType === "flash"
      ? copy.emptyFlashSubject
      : copy.emptyDigestSubject;
  }

  const price = formatCurrency(topDeal.dealPrice, locale);
  if (deals.length === 1) {
    return copy.singleSubject(topDeal.destinationCity, price);
  }

  return copy.multiSubject(topDeal.destinationCity, price, deals.length - 1);
}

export function buildCampaignPreviewText(
  sendType: CampaignSendType,
  deals: RenderableDeal[],
  locale?: EmailLocale | null,
) {
  const copy = getCopy(locale);
  if (sendType === "weekly")
    return weeklyEmailCopy[normalizeEmailLocale(locale)].intro;
  const [topDeal] = deals;
  if (!topDeal) {
    return sendType === "flash"
      ? copy.emptyFlashPreview
      : copy.emptyDigestPreview;
  }

  const price = formatCurrency(topDeal.dealPrice, locale);
  const routeLabel = formatCampaignRouteLabel(topDeal);
  return deals.length === 1
    ? copy.singlePreview(routeLabel, price)
    : copy.multiPreview(deals.length, topDeal.destinationCity, price);
}

export function renderCampaignEmail(input: RenderCampaignEmailInput) {
  const locale = normalizeEmailLocale(input.locale);
  const copy = getCopy(locale);
  const siteUrl = getSiteUrl();
  const headline = buildDealHeadline(input.sendType, input.deals, locale);
  const dealCount = input.deals.length;
  const intro =
    input.sendType === "weekly"
      ? weeklyEmailCopy[locale].intro
      : input.sendType === "flash"
        ? copy.introFlash(dealCount)
        : copy.introDigest(dealCount);
  const skyscannerNote = copy.skyscannerNote(dealCount);
  const logoUrl = `${siteUrl}/v2-logo.png`;
  const heroImageUrl = versionEmailAsset(
    `${siteUrl}/email-airplane-window.jpg`,
  );
  const iconUrl = (name: string) =>
    versionEmailAsset(`${siteUrl}/email-icons/${name}.png`);

  const renderDealCard = (deal: RenderableDeal) => {
    const routeLabel = formatCampaignRouteLabel(deal);
    const localizedTitle = formatCampaignDealTitle(deal, locale);
    const localizedPattern = formatCampaignDealPattern(deal, locale);
    const travelDates = formatCampaignDateRange(
      deal.departureDate,
      deal.returnDate,
      locale,
    );
    const outboundTiming =
      deal.outboundDepartureAt && deal.outboundArrivalAt
        ? formatCampaignTiming(
            copy.labels.outbound,
            formatFlightClock(deal.outboundDepartureAt, locale),
            formatFlightClock(deal.outboundArrivalAt, locale),
          )
        : null;
    const returnTiming =
      deal.returnDepartureAt && deal.returnArrivalAt
        ? formatCampaignTiming(
            copy.labels.return,
            formatFlightClock(deal.returnDepartureAt, locale),
            formatFlightClock(deal.returnArrivalAt, locale),
          )
        : null;
    const dropPercent =
      deal.dropRatio === null
        ? null
        : Math.max(0, Math.round((1 - deal.dropRatio) * 100));
    const discountPill =
      dropPercent && dropPercent > 0
        ? `<span style="display: inline-block; margin-left: 8px; padding: 5px 9px; border-radius: 7px; background-color: #d8f5df; color: #15853d; font-size: 13px; line-height: 16px; font-weight: 800; vertical-align: middle;">&#9660;&nbsp;${dropPercent}%</span>`
        : "";

    return `
      <tr>
        <td style="padding: 0 0 16px;">
          <table class="email-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width: 100%; background-color: #ffffff; border: 1px solid #e4ecf8; border-radius: 20px; border-collapse: separate; box-shadow: 0 12px 34px rgba(38, 83, 155, 0.08);">
            <tr>
              <td class="deal-card-pad" style="padding: 27px 30px 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td class="deal-head-left" valign="top" style="padding: 0 18px 17px 0;">
                      <p style="margin: 0 0 10px; color: #1263e9; font-size: 12px; line-height: 16px; font-weight: 800; letter-spacing: 0.03em; text-transform: uppercase;">${escapeHtml(routeLabel)}</p>
                      <h2 class="email-text" style="margin: 0; color: #091a3a; font-size: 25px; line-height: 1.18; font-weight: 400; letter-spacing: -0.025em;">${escapeHtml(localizedTitle)}</h2>
                      ${localizedPattern ? `<p class="email-muted" style="margin: 7px 0 0; color: #52627b; font-size: 16px; line-height: 1.4; font-weight: 400;">${escapeHtml(localizedPattern)}</p>` : ""}
                    </td>
                    <td class="deal-head-right" valign="top" align="right" width="230" style="width: 230px; padding: 0 0 17px;">
                      <p class="email-text" style="margin: 0; color: #091a3a; font-size: 33px; line-height: 1; font-weight: 850; white-space: nowrap;">${escapeHtml(formatCurrency(deal.dealPrice, locale))}${discountPill}</p>
                      <p class="email-muted" style="margin: 8px 0 0; color: #52627b; font-size: 13px; line-height: 1.4;">${escapeHtml(copy.campaign.belowReference)}</p>
                    </td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top: 1px solid #dce7f6;">
                  <tr>
                    <td class="meta-cell" valign="top" width="34%" style="width: 34%; padding: 17px 14px 17px 0;">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="top" style="padding-right: 10px;"><img src="${escapeHtml(iconUrl("calendar"))}" width="27" height="27" alt="" style="display: block; width: 27px; height: 27px; border: 0;" /></td><td class="email-text" style="color: #091a3a; font-size: 13px; line-height: 1.55;">${escapeHtml(travelDates)}</td></tr></table>
                    </td>
                    <td class="meta-cell" valign="top" width="35%" style="width: 35%; padding: 17px 14px; border-left: 1px solid #dce7f6;">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="top" style="padding-right: 10px;"><img src="${escapeHtml(iconUrl("clock"))}" width="27" height="27" alt="" style="display: block; width: 27px; height: 27px; border: 0;" /></td><td class="email-text" style="color: #091a3a; font-size: 13px; line-height: 1.55;">${outboundTiming ? escapeHtml(outboundTiming) : escapeHtml(copy.notAvailable)}${returnTiming ? `<br />${escapeHtml(returnTiming)}` : ""}</td></tr></table>
                    </td>
                    <td class="meta-cell" valign="top" width="31%" style="width: 31%; padding: 17px 0 17px 14px; border-left: 1px solid #dce7f6;">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="top" style="padding-right: 10px;"><img src="${escapeHtml(iconUrl("plane"))}" width="27" height="27" alt="" style="display: block; width: 27px; height: 27px; border: 0;" /></td><td class="trip-meta email-text" style="color: #091a3a; font-size: 13px; line-height: 1.55; white-space: nowrap;">${escapeHtml(copy.nights(deal.tripNights))} &nbsp;·&nbsp; ${escapeHtml(deal.airlineSummary ?? copy.multipleCarriers)}</td></tr></table>
                    </td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td class="action-cell" valign="middle" align="right" style="padding-top: 3px; text-align: right;">
                      ${deal.bookingUrl ? `<a href="${escapeHtml(deal.bookingUrl)}" style="display: inline-block; padding: 13px 22px; border-radius: 8px; background-color: #ed241f; color: #ffffff; font-size: 14px; line-height: 18px; font-weight: 800; text-decoration: none; box-shadow: 0 7px 18px rgba(237, 36, 31, 0.2);">${escapeHtml(copy.campaign.viewFlight)}</a>` : ""}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  };

  const sections = buildEditorialSections(input.deals, (deal) => ({
    routeBucket: deal.routeBucket,
    tripNights: deal.tripNights,
    dropRatio: deal.dropRatio,
    departureDate: deal.departureDate,
  }));

  const htmlDeals = sections
    .map((section) => {
      const sectionCopy = copy.editorial[section.key];
      return `
        <tr>
          <td style="padding: 16px 0 13px;">
            <p style="margin: 0; color: #1263e9; font-size: 14px; line-height: 18px; font-weight: 850; letter-spacing: 0.03em; text-transform: uppercase;">${escapeHtml(sectionCopy.label)}</p>
          </td>
        </tr>
        ${section.items.map(renderDealCard).join("")}
      `;
    })
    .join("");

  const html = `<!doctype html>
<html lang="${copy.htmlLang}">
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light only" />
    <title>${escapeHtml(input.subject)}</title>
    <style>
      .email-body, .email-canvas { background-color: #eef5ff !important; }
      .email-card { background-color: #ffffff !important; }
      .email-text { color: #091a3a !important; }
      .email-muted { color: #52627b !important; }
      .account-email a, .account-email [x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
      @media only screen and (max-width: 620px) {
        html, body { width: 100% !important; max-width: 100% !important; overflow-x: hidden !important; }
        .email-body { width: 100% !important; max-width: 100% !important; padding: 18px 10px !important; box-sizing: border-box !important; overflow-x: hidden !important; }
        .email-canvas { width: 100% !important; max-width: 100% !important; table-layout: fixed !important; }
        .email-shell { width: 100% !important; max-width: 100% !important; min-width: 0 !important; table-layout: fixed !important; }
        .email-card { table-layout: fixed !important; }
        .email-logo { width: 142px !important; max-width: 142px !important; }
        .email-shell, .email-card, .hero-copy-cell, .hero-image-cell, .summary-pad, .manage-pad, .deal-card-pad, .deal-head-left, .deal-head-right { min-width: 0 !important; max-width: 100% !important; box-sizing: border-box !important; }
        .hero-copy-cell, .hero-image-cell { display: block !important; width: 100% !important; max-width: 100% !important; }
        .hero-copy-cell { padding: 34px 25px 32px !important; }
        .hero-image { width: 100% !important; max-width: none !important; height: 230px !important; border-radius: 0 0 19px 19px !important; object-fit: cover !important; }
        .hero-title { font-size: 30px !important; line-height: 1.12 !important; }
        .summary-pad, .manage-pad { padding: 22px 21px !important; }
        .deal-card-pad { padding: 23px 21px 21px !important; }
        .deal-head-left, .deal-head-right, .action-cell { display: block !important; width: 100% !important; max-width: 100% !important; }
        .deal-head-left { padding-right: 0 !important; }
        .deal-head-right { padding: 0 0 18px !important; }
        .meta-cell { display: block !important; width: 100% !important; padding: 14px 0 !important; border-left: 0 !important; border-bottom: 1px solid #dce7f6 !important; }
        .trip-meta { white-space: normal !important; }
        .action-cell { padding-top: 17px !important; text-align: right !important; }
        .manage-icon, .manage-copy, .manage-action { display: block !important; width: 100% !important; max-width: 100% !important; box-sizing: border-box !important; text-align: left !important; }
        .manage-icon { padding: 16px 0 10px !important; }
        .manage-copy { padding: 0 !important; }
        .manage-action { padding: 14px 0 0 !important; }
        .manage-action a { display: block !important; width: auto !important; min-width: 0 !important; text-align: center !important; white-space: normal !important; }
        .account-email { word-break: break-word !important; }
        .footer-links a { display: inline-block !important; margin: 4px 5px !important; }
      }
    </style>
  </head>
  <body class="email-body" style="margin: 0; padding: 32px 16px; background-color: #eef5ff; background-image: radial-gradient(circle at 50% 8%, #ffffff 0%, #f6f9ff 42%, #eaf3ff 100%); color: #091a3a; font-family: Avenir Next, Segoe UI, Helvetica Neue, Arial, sans-serif; -webkit-text-size-adjust: 100%;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${escapeHtml(input.previewText)}</div>
    <table class="email-canvas" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef5ff" style="background-color: #eef5ff; background-image: radial-gradient(circle at 50% 8%, #ffffff 0%, #f6f9ff 42%, #eaf3ff 100%);">
      <tr>
        <td align="center">
          <table class="email-shell" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 810px;">
            <tr>
              <td align="center" style="padding: 0 0 24px;">
                <a href="${escapeHtml(siteUrl)}" style="text-decoration: none;">
                  <img class="email-logo" src="${escapeHtml(logoUrl)}" width="190" alt="${BRAND_NAME}" style="display: block; width: 190px; max-width: 100%; height: auto; border: 0;" />
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 0 18px;">
                <table class="email-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width: 100%; background-color: #ffffff; border: 1px solid #e4ecf8; border-radius: 22px; border-collapse: separate; overflow: hidden; box-shadow: 0 12px 34px rgba(38, 83, 155, 0.09);">
                  <tr>
                    <td class="hero-copy-cell" valign="middle" width="60%" style="width: 60%; padding: 58px 38px;">
                      <h1 class="hero-title email-text" style="margin: 0 0 16px; color: #091a3a; font-size: 40px; line-height: 1.12; font-weight: 500; letter-spacing: -0.035em;">${escapeHtml(headline)}</h1>
                      <p class="email-muted" style="margin: 0; color: #52627b; font-size: 16px; line-height: 1.65;">${escapeHtml(intro)}</p>
                    </td>
                    <td class="hero-image-cell" valign="middle" width="40%" style="width: 40%; padding: 0; background-color: #e5e8ee;">
                      <img class="hero-image" src="${escapeHtml(heroImageUrl)}" width="324" height="390" alt="" style="display: block; width: 100%; max-width: 324px; height: 390px; border: 0; border-radius: 0 21px 21px 0; object-fit: cover;" />
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 0 18px;">
                <table class="email-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width: 100%; background-color: #ffffff; border: 1px solid #e4ecf8; border-radius: 20px; border-collapse: separate; box-shadow: 0 12px 34px rgba(38, 83, 155, 0.08);">
                  <tr>
                    <td class="summary-pad" style="padding: 28px 32px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width: 100%; table-layout: fixed;">
                        <tr>
                          <td class="summary-icon-cell" valign="middle" width="82" style="width: 82px; padding-right: 18px;">
                            <table role="presentation" width="72" height="72" cellpadding="0" cellspacing="0" bgcolor="#edf4ff" style="width: 72px; height: 72px; background-color: #edf4ff; border-radius: 16px;"><tr><td align="center" valign="middle"><img src="${escapeHtml(iconUrl("bell"))}" width="38" height="38" alt="" style="display: block; width: 38px; height: 38px; border: 0;" /></td></tr></table>
                          </td>
                          <td class="summary-copy-cell" valign="middle" style="word-break: break-word;">
                            <p class="email-text" style="margin: 0; color: #091a3a; font-size: 15px; line-height: 1.5; font-weight: 800;">${escapeHtml(input.previewText)}</p>
                            <p class="email-muted" style="margin: 5px 0 0; color: #52627b; font-size: 14px; line-height: 1.55;">${escapeHtml(skyscannerNote)}</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${htmlDeals}</table></td></tr>
            <tr>
              <td style="padding: 0 0 18px;">
                <table class="email-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width: 100%; background-color: #ffffff; border: 1px solid #e4ecf8; border-radius: 20px; border-collapse: separate; box-shadow: 0 12px 34px rgba(38, 83, 155, 0.08);">
                  <tr>
                    <td class="manage-pad" style="padding: 25px 30px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        ${input.subscriberEmail ? `<tr><td class="manage-icon" valign="middle" width="62" style="width: 62px; padding-right: 17px;"><table role="presentation" width="54" height="54" cellpadding="0" cellspacing="0" bgcolor="#edf4ff" style="width: 54px; height: 54px; background-color: #edf4ff; border-radius: 14px;"><tr><td align="center" valign="middle"><img src="${escapeHtml(iconUrl("at"))}" width="31" height="31" alt="" style="display: block; width: 31px; height: 31px; border: 0;" /></td></tr></table></td><td class="manage-copy" colspan="2" valign="middle"><p class="email-muted" style="margin: 0; color: #52627b; font-size: 13px; line-height: 1.4;">${escapeHtml(copy.campaign.associatedWith)}</p><p class="account-email email-text" style="margin: 4px 0 0; color: #091a3a; font-size: 17px; line-height: 1.4; font-weight: 400;">${renderPlainEmailAddress(input.subscriberEmail)}</p></td></tr><tr><td colspan="3" style="height: 18px; border-bottom: 1px solid #dce7f6; font-size: 0; line-height: 0;">&nbsp;</td></tr>` : ""}
                        <tr>
                          <td class="manage-icon" valign="middle" width="62" style="width: 62px; padding: 18px 17px 0 0;"><table role="presentation" width="54" height="54" cellpadding="0" cellspacing="0" bgcolor="#edf4ff" style="width: 54px; height: 54px; background-color: #edf4ff; border-radius: 14px;"><tr><td align="center" valign="middle"><img src="${escapeHtml(iconUrl("sliders"))}" width="31" height="31" alt="" style="display: block; width: 31px; height: 31px; border: 0;" /></td></tr></table></td>
                          <td class="manage-copy" valign="middle" style="padding-top: 18px;"><p class="email-text" style="margin: 0; color: #091a3a; font-size: 16px; line-height: 1.35; font-weight: 400;">${escapeHtml(copy.campaign.editTitle)}</p><p class="email-muted" style="margin: 4px 0 0; color: #52627b; font-size: 13px; line-height: 1.5;">${escapeHtml(copy.campaign.editBody)}</p></td>
                          <td class="manage-action" valign="middle" align="right" width="230" style="width: 230px; padding: 18px 0 0 16px;"><a href="${escapeHtml(input.managePreferencesUrl)}" style="display: inline-block; min-width: 190px; padding: 11px 16px; border-radius: 8px; background-color: #edf4ff; color: #1263e9; font-size: 13px; line-height: 17px; font-weight: 400; text-align: center; text-decoration: none; white-space: nowrap;">${escapeHtml(copy.campaign.editAction)}</a></td>
                        </tr>
                        <tr><td colspan="3" style="height: 18px; border-bottom: 1px solid #dce7f6; font-size: 0; line-height: 0;">&nbsp;</td></tr>
                        <tr>
                          <td class="manage-icon" valign="middle" width="62" style="width: 62px; padding: 18px 17px 0 0;"><table role="presentation" width="54" height="54" cellpadding="0" cellspacing="0" bgcolor="#edf4ff" style="width: 54px; height: 54px; background-color: #edf4ff; border-radius: 14px;"><tr><td align="center" valign="middle"><img src="${escapeHtml(iconUrl("close"))}" width="31" height="31" alt="" style="display: block; width: 31px; height: 31px; border: 0;" /></td></tr></table></td>
                          <td class="manage-copy" valign="middle" style="padding-top: 18px;"><p class="email-text" style="margin: 0; color: #091a3a; font-size: 16px; line-height: 1.35; font-weight: 400;">${escapeHtml(copy.campaign.unsubscribeTitle)}</p><p class="email-muted" style="margin: 4px 0 0; color: #52627b; font-size: 13px; line-height: 1.5;">${escapeHtml(copy.campaign.unsubscribeBody)}</p></td>
                          <td class="manage-action" valign="middle" align="right" width="230" style="width: 230px; padding: 18px 0 0 16px;"><a href="${escapeHtml(input.unsubscribeUrl)}" style="display: inline-block; min-width: 190px; padding: 11px 16px; border-radius: 8px; background-color: #edf4ff; color: #1263e9; font-size: 13px; line-height: 17px; font-weight: 400; text-align: center; text-decoration: none; white-space: nowrap;">${escapeHtml(copy.campaign.unsubscribeAction)}</a></td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding: 2px 12px 0;">
                <p class="footer-links email-muted" style="margin: 0; color: #52627b; font-size: 12px; line-height: 1.8;">
                  <a href="${escapeHtml(input.managePreferencesUrl)}" style="color: #1263e9; font-weight: 700; text-decoration: none;">${escapeHtml(copy.managePreferences)}</a>
                  &nbsp;·&nbsp; <a href="${escapeHtml(input.unsubscribeUrl)}" style="color: #1263e9; font-weight: 700; text-decoration: none;">${escapeHtml(copy.unsubscribe)}</a>
                  &nbsp;·&nbsp; <a href="${escapeHtml(siteUrl)}" style="color: #1263e9; font-weight: 700; text-decoration: none;">${BRAND_NAME}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textLines = [
    BRAND_NAME,
    "",
    headline,
    intro,
    "",
    input.previewText,
    skyscannerNote,
    `${copy.campaign.editAction}: ${input.managePreferencesUrl}`,
    "",
    ...input.deals.flatMap((deal) => [
      formatCampaignRouteLabel(deal),
      formatCampaignDealTitle(deal, locale),
      ...(formatCampaignDealPattern(deal, locale)
        ? [formatCampaignDealPattern(deal, locale) as string]
        : []),
      `${copy.labels.price}: ${formatCurrency(deal.dealPrice, locale)} · ${formatVerifiedAge(deal.verifiedAt, locale)}`,
      `${copy.labels.travelDates}: ${copy.travelDateRange(formatDateWithWeekday(deal.departureDate, locale), formatDateWithWeekday(deal.returnDate, locale))}`,
      ...(deal.outboundDepartureAt && deal.outboundArrivalAt
        ? [
            copy.timing(
              copy.labels.outbound,
              formatFlightWeekdayClock(deal.outboundDepartureAt, locale),
              formatFlightClock(deal.outboundArrivalAt, locale),
            ),
          ]
        : []),
      ...(deal.returnDepartureAt && deal.returnArrivalAt
        ? [
            copy.timing(
              copy.labels.return,
              formatFlightWeekdayClock(deal.returnDepartureAt, locale),
              formatFlightClock(deal.returnArrivalAt, locale),
            ),
          ]
        : []),
      ...(deal.destinationStayHours !== null
        ? [
            `${copy.labels.timeInDestination}: ${formatStayHours(deal.destinationStayHours, locale)}`,
          ]
        : []),
      `${copy.labels.tripShape}: ${copy.tripShape(deal.tripNights, formatStops(deal.maxStops, locale))}`,
      `${copy.labels.airline}: ${deal.airlineSummary ?? copy.multipleCarriers}`,
      ...(deal.bookingUrl
        ? [`${copy.campaign.viewFlight}: ${deal.bookingUrl}`]
        : []),
      `${copy.labels.discount}: ${formatDrop(deal.dropRatio, locale)}`,
      "",
    ]),
    `${copy.searchInSkyscanner}: https://www.skyscanner.net`,
    `${copy.managePreferences}: ${input.managePreferencesUrl}`,
    `${copy.unsubscribe}: ${input.unsubscribeUrl}`,
    `${copy.labels.homepage}: ${siteUrl}`,
  ];

  return { html, text: textLines.join("\n") };
}
