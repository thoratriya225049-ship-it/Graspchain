import { expect, type APIRequestContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

export const as = (code: string) => ({ storageState: `e2e/.auth/${code}.json` });

export const ADMIN_SECRET = (() => {
  const env = fs.readFileSync(path.resolve(import.meta.dirname, "../../api/.env"), "utf8");
  return /^ADMIN_SECRET=(.*)$/m.exec(env)?.[1]?.trim() ?? "";
})();

export const ANSWER_A3 =
  "The article explains how servers survive a rush and why fairness depends on queue order. When requests arrive faster than capacity, a queue makes them wait their turn instead of the server slowing down and crashing. Rate limiting caps how many requests each client can send, so one aggressive client cannot crowd out others. But serving strictly by arrival favours users with fast connections, so fairer designs group arrivals in a short window and order them randomly.";

/** Leave any open ticket so a test can join afresh. */
export async function clearTickets(request: APIRequestContext, articleId: string) {
  const r = await request.post("/api/queue/join", { data: { articleId } });
  const body = await r.json();
  const id = body.ticketId ?? body.details?.ticketId;
  if (id) await request.post(`/api/queue/${id}/leave`);
}

/** Library → start → queue → read → close → write → submit; returns the attempt id. */
export async function takeAssessment(page: Page, articleId: string, answer: string, opts: { onReading?: () => Promise<void> } = {}) {
  await clearTickets(page.request, articleId);
  await page.goto(`/start/${articleId}`);
  await page.getByRole("button", { name: "Open the article" }).click();
  await page.waitForURL(/\/session\//, { timeout: 60_000 });
  await expect(page.getByRole("timer")).toBeVisible();
  await expect(page.locator("article .prose-article p").first()).toBeVisible();
  await opts.onReading?.();
  await page.getByRole("button", { name: /done reading/ }).click();
  await expect(page.getByRole("heading", { name: /What is this article about/ })).toBeVisible();
  await page.fill("#answer", answer);
  await page.getByRole("button", { name: "Submit for assessment" }).click();
  await page.waitForURL(/\/attempts\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}
