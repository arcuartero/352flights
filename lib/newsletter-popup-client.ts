export const newsletterSubscribedKey = "352flights-newsletter-subscribed";
export const newsletterSubscribedEvent = "352flights:newsletter-subscribed";

export function rememberNewsletterSubscription() {
  try {
    window.localStorage.setItem(newsletterSubscribedKey, "1");
  } catch {
    // Subscription still works when browser storage is unavailable.
  }
  window.dispatchEvent(new Event(newsletterSubscribedEvent));
}
