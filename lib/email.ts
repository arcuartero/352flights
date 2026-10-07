import "server-only";

export { emailLocales, normalizeEmailLocale } from "./email/copy";
export type { EmailLocale } from "./email/copy";
export { getResendFromEmail, sendResendEmail } from "./email/send";
export {
  buildCampaignSubject,
  buildCampaignPreviewText,
  renderCampaignEmail,
} from "./email/campaign";
export { renderWelcomeEmail } from "./email/welcome";
