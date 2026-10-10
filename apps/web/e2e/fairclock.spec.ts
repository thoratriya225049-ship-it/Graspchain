import { expect, test } from "@playwright/test";
import { as, clearTickets } from "./helpers";

const ANSWER_A2 =
  "Retrieval-augmented generation lets a language model answer from documents. The question is turned into an embedding, the closest passages are retrieved from an index and added to the prompt, so the model can cite its sources. Knowledge can be updated by adding documents instead of retraining, but answers are only as good as what was retrieved.";

test.use(as("DEMO-04"));

/**
 * E5b (scripted): delay delivery of the article by N seconds and check that the fair clock
 * gives the delay back, capped at FAIRCLOCK_CAP_S (10 s). Prints the measurement table.
 */
for (const delayS of [1, 3, 12]) {
  test(`fair clock compensates a ${delayS}s delivery delay`, async ({ page }) => {
    await clearTickets(page.request, "A2");
    await page.route(/\/api\/session\/[^/]+\/article$/, async (route) => {
      const response = await route.fetch();
      await new Promise((r) => setTimeout(r, delayS * 1000));
      await route.fulfill({ response });
    });
    await page.goto("/start/A2");
    await page.getByRole("button", { name: "Open the article" }).click();
    await page.waitForURL(/\/session\//, { timeout: 60_000 });
    await expect(page.getByText(/delivery delay of/)).toBeVisible({ timeout: 30_000 });
    const sid = page.url().split("/").pop()!;
    const s = await (await page.request.get(`/api/session/${sid}`)).json();
    const comp = s.latencyCompMs / 1000;
    const expected = Math.min(delayS, 10);
    console.log(
      `  delay ${delayS}s → measured ${(s.measuredDelayMs / 1000).toFixed(2)}s, compensated ${comp.toFixed(2)}s, loss ${(s.measuredDelayMs / 1000 - comp).toFixed(2)}s`,
    );
    expect(comp).toBeGreaterThanOrEqual(expected - 0.05);
    expect(comp).toBeLessThanOrEqual(10);
    // Finish like a student would, so the session releases its admission slot.
    await page.getByRole("button", { name: /done reading/ }).click();
    await page.fill("#answer", ANSWER_A2);
    await page.getByRole("button", { name: "Submit for assessment" }).click();
    await page.waitForURL(/\/attempts\//);
  });
}
