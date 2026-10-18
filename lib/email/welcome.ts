import "server-only";
import { getSiteUrl } from "@/lib/env";
import { type EmailLocale, getCopy, normalizeEmailLocale } from "./copy";
import {
  BRAND_NAME,
  escapeHtml,
  renderPlainEmailAddress,
  versionEmailAsset,
} from "./format";

type RenderWelcomeEmailInput = {
  email: string;
  confirmUrl: string;
  managePreferencesUrl: string;
  unsubscribeUrl: string;
  alreadyConfirmed: boolean;
  onboardingCompleted: boolean;
  locale?: EmailLocale | null;
};

export function renderWelcomeEmail(input: RenderWelcomeEmailInput) {
  const locale = normalizeEmailLocale(input.locale);
  const copy = getCopy(locale);
  const siteUrl = getSiteUrl();
  const welcome = copy.welcome;
  const subject = input.alreadyConfirmed
    ? welcome.confirmedSubject
    : welcome.pendingSubject;
  const previewText = input.alreadyConfirmed
    ? welcome.confirmedPreview
    : welcome.pendingPreview;
  const headline = input.alreadyConfirmed
    ? welcome.confirmedHeadline
    : welcome.pendingHeadline;
  const intro = input.alreadyConfirmed
    ? welcome.confirmedIntro
    : welcome.pendingIntro;
  const primaryLabel = input.alreadyConfirmed
    ? welcome.primaryConfirmed
    : welcome.primaryPending;
  const primaryUrl = input.alreadyConfirmed
    ? input.managePreferencesUrl
    : input.confirmUrl;
  const heroImageUrl = versionEmailAsset(
    `${siteUrl}/${input.alreadyConfirmed ? "email-alerts-airport.jpg" : "email-airplane-window.jpg"}`,
  );
  const logoUrl = `${siteUrl}/v2-logo.png`;

  const html = `<!doctype html>
<html lang="${copy.htmlLang}">
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>${escapeHtml(subject)}</title>
    <style>
      :root { color-scheme: light dark; supported-color-schemes: light dark; }
      .email-body, .email-canvas { background-color: #eef4ff !important; }
      .email-card { background-color: #ffffff !important; }
      .email-card-soft, .email-icon { background-color: #f3f6fc !important; }
      .email-text { color: #091a3a !important; }
      .email-muted { color: #52627b !important; }
      .email-link { color: #174ed6 !important; }
      .email-divider { border-color: #dce4f1 !important; }
      .email-logo-plate { background-color: #ffffff !important; }
      .account-email a, .account-email [x-apple-data-detectors] {
        color: inherit !important;
        text-decoration: none !important;
        pointer-events: none !important;
        cursor: text !important;
      }

      @media only screen and (max-width: 620px) {
        .email-body { padding: 16px 10px !important; }
        .email-shell { width: 100% !important; max-width: 100% !important; }
        .hero-copy-cell { width: 100% !important; padding: 38px 26px 40px !important; }
        .hero-image-cell, .hero-image {
          display: none !important;
          width: 0 !important;
          max-width: 0 !important;
          height: 0 !important;
          max-height: 0 !important;
          overflow: hidden !important;
          mso-hide: all !important;
        }
        .hero-title { font-size: 38px !important; line-height: 1.08 !important; }
        .card-pad { padding: 25px 22px !important; }
        .feature-icon-cell { width: 52px !important; padding-right: 14px !important; }
        .feature-icon { width: 46px !important; height: 46px !important; line-height: 46px !important; }
        .account-email { font-size: 17px !important; word-break: break-word !important; }
        .email-logo { width: 122px !important; max-width: 122px !important; }
        .footer-links a { display: inline-block !important; margin: 4px 5px !important; }
      }

      @media (prefers-color-scheme: dark) {
        .email-body, .email-canvas { background-color: #081321 !important; }
        .email-card { background-color: #111e31 !important; }
        .email-card-soft, .email-icon { background-color: #17263d !important; }
        .email-text { color: #f5f8ff !important; }
        .email-muted { color: #bac6d8 !important; }
        .email-link { color: #8eafff !important; }
        .email-divider { border-color: #2c3c55 !important; }
        .email-logo-plate { background-color: #ffffff !important; }
      }

      [data-ogsc] .email-body, [data-ogsc] .email-canvas { background-color: #081321 !important; }
      [data-ogsc] .email-card { background-color: #111e31 !important; }
      [data-ogsc] .email-card-soft, [data-ogsc] .email-icon { background-color: #17263d !important; }
      [data-ogsc] .email-text { color: #f5f8ff !important; }
      [data-ogsc] .email-muted { color: #bac6d8 !important; }
      [data-ogsc] .email-link { color: #8eafff !important; }
      [data-ogsc] .email-divider { border-color: #2c3c55 !important; }
      [data-ogsc] .email-logo-plate { background-color: #ffffff !important; }
    </style>
  </head>
  <body class="email-body" style="margin: 0; padding: 34px 16px; background-color: #eef4ff; color: #091a3a; font-family: Avenir Next, Segoe UI, Helvetica Neue, Arial, sans-serif; -webkit-text-size-adjust: 100%;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${escapeHtml(previewText)}</div>
    <table class="email-canvas" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef4ff" style="background-color: #eef4ff;">
      <tr>
        <td align="center">
          <table class="email-shell" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 700px;">
            <tr>
              <td align="center" style="padding: 0 0 18px;">
                <table class="email-logo-plate" role="presentation" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background-color: #ffffff; border-radius: 12px;">
                  <tr>
                    <td style="padding: 8px 12px;">
                      <a href="${escapeHtml(siteUrl)}" style="text-decoration: none;">
                        <img class="email-logo" src="${escapeHtml(logoUrl)}" width="174" alt="${BRAND_NAME}" style="display: block; width: 174px; max-width: 100%; height: auto; border: 0;" />
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 0 18px;">
                <table class="email-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background-color: #ffffff; border: 1px solid #dce4f1; border-radius: 22px; border-collapse: separate; overflow: hidden;">
                  <tr>
                    <td class="hero-copy-cell" valign="middle" width="62%" style="width: 62%; padding: 54px 38px 52px;">
                      <h1 class="hero-title email-text" style="margin: 0 0 34px; color: #091a3a; font-size: 46px; line-height: 1.08; font-weight: 500; letter-spacing: -0.035em; mso-line-height-rule: exactly;">${escapeHtml(headline)}</h1>
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="center" bgcolor="#ee312c" style="background-color: #ee312c; border-radius: 9px;">
                            <a href="${escapeHtml(primaryUrl)}" style="display: inline-block; padding: 16px 25px; color: #ffffff; font-size: 16px; line-height: 20px; font-weight: 700; text-decoration: none;">${escapeHtml(primaryLabel)}</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                    <td class="hero-image-cell" valign="middle" width="38%" style="width: 38%; padding: 0; background-color: #dce8f8;">
                      <img class="hero-image" src="${escapeHtml(heroImageUrl)}" width="266" height="356" alt="" style="display: block; width: 100%; max-width: 266px; height: 356px; border: 0; border-radius: 0 21px 21px 0; object-fit: cover;" />
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 0 18px;">
                <table class="email-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background-color: #ffffff; border: 1px solid #dce4f1; border-radius: 22px; border-collapse: separate;">
                  <tr>
                    <td class="card-pad" style="padding: 30px 38px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td class="feature-icon-cell" valign="middle" width="64" style="width: 64px; padding-right: 18px;">
                            <div class="feature-icon email-icon email-link" style="width: 52px; height: 52px; border-radius: 16px; background-color: #f3f6fc; color: #174ed6; font-size: 21px; line-height: 52px; font-weight: 700; text-align: center;">@</div>
                          </td>
                          <td valign="middle">
                            <p class="email-muted" style="margin: 0; color: #52627b; font-size: 14px; line-height: 1.4;">${escapeHtml(welcome.linkedTo)}</p>
                            <p class="account-email email-text" style="margin: 5px 0 0; color: #091a3a; font-size: 19px; line-height: 1.35; font-weight: 800;">${renderPlainEmailAddress(input.email)}</p>
                          </td>
                        </tr>
                        <tr>
                          <td colspan="2" class="email-divider" style="height: 25px; border-bottom: 1px solid #dce4f1; font-size: 0; line-height: 0;">&nbsp;</td>
                        </tr>
                        <tr>
                          <td class="feature-icon-cell" valign="middle" width="64" style="width: 64px; padding: 25px 18px 0 0;">
                            <div class="feature-icon email-icon" style="width: 52px; height: 52px; border-radius: 16px; background-color: #f3f6fc; color: #174ed6; font-family: Apple Color Emoji, Segoe UI Emoji, sans-serif; font-size: 22px; line-height: 52px; font-weight: 700; text-align: center;">&#128276;</div>
                          </td>
                          <td valign="middle" style="padding-top: 25px;">
                            <p class="email-text" style="margin: 0; color: #091a3a; font-size: 18px; line-height: 1.35; font-weight: 800;">${escapeHtml(welcome.alertSetupTitle)}</p>
                            <p class="email-muted" style="margin: 6px 0 0; color: #52627b; font-size: 15px; line-height: 1.55;">${escapeHtml(input.alreadyConfirmed ? welcome.alertSetupBody : welcome.confirmBody)}</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 0 18px;">
                <table class="email-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background-color: #ffffff; border: 1px solid #dce4f1; border-radius: 22px; border-collapse: separate;">
                  <tr>
                    <td class="card-pad" style="padding: 27px 38px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td class="feature-icon-cell" valign="middle" width="64" style="width: 64px; padding-right: 18px;">
                            <div class="feature-icon email-icon email-link" style="width: 52px; height: 52px; border-radius: 16px; background-color: #f3f6fc; color: #174ed6; font-size: 20px; line-height: 52px; font-weight: 700; text-align: center;">×</div>
                          </td>
                          <td valign="middle">
                            <p class="email-text" style="margin: 0; color: #091a3a; font-size: 19px; line-height: 1.35; font-weight: 800;">${escapeHtml(welcome.notYouTitle)}</p>
                            <p class="email-muted" style="margin: 7px 0 0; color: #52627b; font-size: 14px; line-height: 1.55;">${escapeHtml(welcome.notYouBody)} <a class="email-link" href="${escapeHtml(input.unsubscribeUrl)}" style="color: #174ed6; font-weight: 700; text-decoration: none;">${escapeHtml(welcome.unsubscribeNow)}</a></p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" class="email-divider" style="padding: 24px 16px 4px; border-top: 1px solid #dce4f1;">
                <p class="footer-links email-muted" style="margin: 0; color: #52627b; font-size: 12px; line-height: 1.8;">
                  <a class="email-link" href="${escapeHtml(input.managePreferencesUrl)}" style="color: #174ed6; font-weight: 700; text-decoration: none;">${escapeHtml(copy.managePreferences)}</a>
                  &nbsp;·&nbsp; <a class="email-link" href="${escapeHtml(input.unsubscribeUrl)}" style="color: #174ed6; font-weight: 700; text-decoration: none;">${escapeHtml(copy.unsubscribe)}</a>
                  &nbsp;·&nbsp; <a class="email-link" href="${escapeHtml(siteUrl)}" style="color: #174ed6; font-weight: 700; text-decoration: none;">${BRAND_NAME}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    BRAND_NAME,
    "",
    headline,
    intro,
    "",
    `${welcome.emailLabel}: ${input.email}`,
    `${primaryLabel}: ${primaryUrl}`,
    `${welcome.preferencesLink}: ${input.managePreferencesUrl}`,
    `${copy.unsubscribe}: ${input.unsubscribeUrl}`,
    `${copy.labels.homepage}: ${siteUrl}`,
  ].join("\n");

  return { subject, previewText, html, text };
}
