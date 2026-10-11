import { expect, test } from "@playwright/test";
import { as, clearTickets } from "./helpers";

test.use(as("DEMO-02"));

const ARTICLE_SENTENCE =
  "Because every level depends on the one below it, changing even one character in one record changes that record's hash, every parent hash above it, and finally the root.";
const ANSWER_A1 =
  "A Merkle tree makes a log tamper-evident. Each record is hashed and pairs of hashes are combined level by level until one root is left. If any record changes, its hash and every parent hash change, so the root changes and anyone holding the old root notices. A record can be proven with a few sibling hashes, and publishing only the root keeps the data private.";

/**
 * Assessment integrity in a real browser: the article cannot be copied, pasting into the answer
 * is blocked, a blocked paste of the article text is detected on the server, and the result
 * separates the comprehension score from the integrity outcome.
 */
test("copy and paste are blocked and recorded; pasting the article makes the result not certified", async ({ page }) => {
  await clearTickets(page.request, "A1");
  await page.goto("/start/A1");
  await page.getByRole("button", { name: "Open the article" }).click();
  await page.waitForURL(/\/session\//, { timeout: 60_000 });
  const sessionId = page.url().split("/").pop()!;
  const article = page.locator("article");
  await expect(article.locator(".prose-article p").first()).toBeVisible();

  // The article is not selectable and a copy is cancelled by the page.
  await expect(article).toHaveCSS("user-select", "none");
  const copyBlocked = await page.evaluate(() => {
    const e = new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });
    document.querySelector("article p")!.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(copyBlocked).toBe(true);
  await expect(page.getByText("Copying is disabled during the assessment.").filter({ visible: true })).toBeVisible();

  await page.getByRole("button", { name: /done reading/ }).click();
  await expect(page.getByRole("heading", { name: /What is it about/ })).toBeVisible();

  // Pasting the article text into the answer is blocked (the box stays empty)…
  const pasteBlocked = await page.evaluate((text) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    const e = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt });
    document.querySelector("#answer")!.dispatchEvent(e);
    return e.defaultPrevented;
  }, ARTICLE_SENTENCE);
  expect(pasteBlocked).toBe(true);
  await expect(page.locator("#answer")).toHaveValue("");
  await expect(page.getByText("Pasting is disabled during the assessment.").filter({ visible: true })).toBeVisible();

  // …and a request for the closed article is refused and recorded by the server (after the 5 s
  // grace window, so it is weighed rather than treated as a timing race).
  await page.waitForTimeout(5_500);
  expect((await page.request.get(`/api/session/${sessionId}/article`)).status()).toBe(403);

  await page.fill("#answer", ANSWER_A1);
  await page.getByRole("button", { name: "Submit for assessment" }).click();
  await page.waitForURL(/\/attempts\/[0-9a-f-]{36}$/);

  // The comprehension score is still shown — but the result is not certified, with the evidence.
  await expect(page.getByLabel(/^Score \d+(\.\d)? out of 10$/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("out of 10 · not certified")).toBeVisible();
  await expect(page.getByText(/Assessment conditions: Compromised/)).toBeVisible();
  await expect(page.getByText("This result is not certified.", { exact: false })).toBeVisible();
  await page.getByText("Assessment conditions", { exact: true }).click();
  const conditions = page.locator('section[aria-label="Assessment conditions"]');
  await expect(conditions).toContainText("Tried to paste text that matches the article");
  await expect(conditions).toContainText("Requested the article after it closed");
  await expect(conditions).toContainText("Tried to copy article text");
});
