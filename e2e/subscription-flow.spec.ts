import { expect, test, type Page } from "@playwright/test";

const MOCK = "http://127.0.0.1:54329";

type SentEmail = { to: string[]; subject: string; text: string; html: string };
type Subscriber = { email: string; status: string; email_confirmed: boolean };

async function sentEmails(page: Page): Promise<SentEmail[]> {
  return (await page.request.get(`${MOCK}/__emails`)).json();
}

async function subscriberRow(page: Page, email: string): Promise<Subscriber | undefined> {
  const tables = await (await page.request.get(`${MOCK}/__tables`)).json();
  return (tables.newsletter_subscribers ?? []).find((row: Subscriber) => row.email === email);
}

function linkFrom(email: SentEmail, path: string) {
  const match = email.text.match(new RegExp(`https?://[^\\s]+${path}\\?token=[0-9a-f-]{36}`));
  if (!match) throw new Error(`No ${path} link in email:\n${email.text}`);
  return new URL(match[0]);
}

async function dismissCookieBanner(page: Page) {
  // Without a stored choice the banner always opens, but only after its config loads;
  // wait for it instead of racing it, or its backdrop swallows the next click.
  const cookies = await page.context().cookies();
  if (cookies.some((cookie) => cookie.name === "352flights-cookie-consent")) return;
  const reject = page.getByRole("button", { name: /reject all/i });
  await reject.waitFor({ state: "visible" });
  await reject.click();
  await expect(reject).toBeHidden();
}

async function subscribeFromHome(page: Page, email: string) {
  await page.goto("/");
  await dismissCookieBanner(page);
  await page.getByRole("button", { name: /my alerts/i }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill(email);
  await dialog.getByRole("textbox").press("Enter");
  return dialog.getByRole("status");
}

test.beforeEach(async ({ request }) => {
  await request.post(`${MOCK}/__reset`);
});

test("a visitor subscribes, confirms, reaches preferences and unsubscribes", async ({ page }) => {
  const email = "e2e-reader@example.test";

  // 1. Sign up from the home page alerts modal.
  const status = await subscribeFromHome(page, email);
  await expect(status).toHaveClass(/v2-modal__status--success/);
  await expect.poll(async () => (await sentEmails(page)).length).toBe(1);
  const [welcome] = await sentEmails(page);
  expect(welcome.to).toEqual([email]);
  expect((await subscriberRow(page, email))?.status).toBe("pending");

  // 2. A repeat signup within the cooldown does not mail the address again.
  await subscribeFromHome(page, email);
  await page.waitForTimeout(1000);
  expect(await sentEmails(page)).toHaveLength(1);

  // 3. Opening the confirmation link alone changes nothing; the button confirms.
  const confirmUrl = linkFrom(welcome, "/confirm");
  await page.goto(confirmUrl.pathname + confirmUrl.search);
  expect((await subscriberRow(page, email))?.email_confirmed).toBe(false);
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await page.waitForURL(/\/preferences\?token=/);
  const subscriber = await subscriberRow(page, email);
  expect(subscriber?.status).toBe("active");
  expect(subscriber?.email_confirmed).toBe(true);

  // 4. The preferences page loads for the confirmed subscriber.
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByText(/could not find that preference link/i)).toHaveCount(0);

  // 5. Unsubscribe through the link in the email.
  const unsubscribeUrl = linkFrom(welcome, "/unsubscribe");
  await page.goto(unsubscribeUrl.pathname + unsubscribeUrl.search);
  await page.getByRole("button", { name: "Unsubscribe me" }).click();
  await expect(page.getByText(/you have been unsubscribed/i)).toBeVisible();
  expect((await subscriberRow(page, email))?.status).toBe("unsubscribed");
});

test("an invalid email is rejected without storing or sending anything", async ({ page }) => {
  const status = await subscribeFromHome(page, "reader@localhost");
  await expect(status).toHaveClass(/v2-modal__status--error/);
  expect(await sentEmails(page)).toHaveLength(0);
});
