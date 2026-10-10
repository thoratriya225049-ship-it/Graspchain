import { expect, test } from "@playwright/test";
import { ANSWER_A3, as, takeAssessment } from "./helpers";

test.use(as("DEMO-02"));

test("student journey: read → hide (403) → write → score → feedback → X-Ray → verified on-chain", async ({ page }) => {
  let sessionId = "";
  const attemptId = await takeAssessment(page, "A3", ANSWER_A3, {
    onReading: async () => {
      sessionId = page.url().split("/").pop()!;
      await expect(page.locator("article")).toContainText("rate");
    },
  });

  // F1: once closed, the text is gone from the DOM and the server refuses it.
  const hidden = await page.request.get(`/api/session/${sessionId}/article`);
  expect(hidden.status()).toBe(403);
  expect((await hidden.json()).code).toBe("ARTICLE_HIDDEN");

  // F7: score first, then feedback, then the X-Ray link and the receipt.
  const score = page.getByLabel(/^Score \d+(\.\d)? out of 10$/);
  await expect(score).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("How this number was made")).toBeVisible();
  await expect(
    page
      .getByRole("heading", { name: "What you understood" })
      .or(page.getByRole("heading", { name: "What you missed" }))
      .first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "See it on the article" })).toBeVisible();
  await expect(page.getByText("Recorded on-chain")).toBeVisible({ timeout: 30_000 });

  // F8: X-Ray
  await page.getByRole("link", { name: "See it on the article" }).click();
  await expect(page).toHaveURL(new RegExp(`/attempts/${attemptId}/xray$`));
  await expect(page.getByRole("heading", { name: "Your claims · your exact words" })).toBeVisible();
  // Keyboard path (also proves the links are reachable without a mouse); retried until hydrated.
  const firstClaim = page.locator("aside ol button").first();
  await expect(async () => {
    await page.keyboard.press("Escape");
    await firstClaim.blur();
    await firstClaim.focus();
    await expect(firstClaim).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
  }).toPass({ timeout: 15_000 });

  // F9: our Verify page passes V1–V3 against the chain.
  await page.goBack();
  await page.getByRole("link", { name: "Verify this record" }).click();
  await expect(page.getByRole("heading", { name: /Verified on-chain/ })).toBeVisible();
  await expect(page.locator("li", { hasText: "Record integrity" })).toContainText("Pass");
});
