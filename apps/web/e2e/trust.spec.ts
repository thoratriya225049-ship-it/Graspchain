import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ADMIN_SECRET, as } from "./helpers";
import { FIXTURE, FIXTURE_HASH } from "../../../packages/shared/test/fixture";

const VERIFIER = "http://localhost:5174/";

test("canonicalization cross-check: the shipped verifier bundle in Chromium hashes the fixture exactly like Node", async ({ page }) => {
  await page.goto(VERIFIER);
  await page.fill("#paste", JSON.stringify(FIXTURE));
  await page.getByRole("button", { name: "Verify pasted receipt" }).click();
  await expect(page.locator("#hash")).toHaveText(FIXTURE_HASH);
});

test.describe("tamper demo (E6)", () => {
  test.use(as("DEMO-02"));

  test("tampering our copy fails V1 on our page; the student's own file still verifies independently", async ({ page, browser }) => {
    const profile = await (await page.request.get("/api/profile/me")).json();
    const a = profile.attempts.filter((x: { status: string; chainStatus: string }) => x.status === "done" && x.chainStatus === "mined").at(-1);
    test.skip(!a, "needs a mined attempt (run the journey spec first)");

    // The student downloads their receipt.
    await page.goto(`/attempts/${a.attemptId}/proof`);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download" }).click()]);
    const file = path.join(test.info().outputDir, "receipt.json");
    await download.saveAs(file);
    const receipt = JSON.parse(fs.readFileSync(file, "utf8"));

    // An admin alters the server copy.
    const admin = await browser.newContext(as("ADMIN-01"));
    const r = await admin.request.post("/api/admin/tamper", {
      headers: { "x-admin-secret": ADMIN_SECRET },
      data: { assessmentId: receipt.assessmentId, field: "finalScore" },
    });
    expect(r.ok(), await r.text()).toBe(true);
    try {
      await page.goto(`/verify/${receipt.assessmentId}`);
      await expect(page.getByRole("heading", { name: /Does not match the chain/ })).toBeVisible();
      await expect(page.locator("li", { hasText: "Record integrity" })).toContainText("Fail");

      // The independent verifier, given the student's file, still passes.
      await page.goto(VERIFIER);
      await page.setInputFiles("#file", file);
      await expect(page.locator("#status-title")).toHaveText("Verified on-chain");
      await expect(page.locator("#hosts")).not.toContainText("4000");
    } finally {
      await admin.request.post("/api/admin/restore", { headers: { "x-admin-secret": ADMIN_SECRET }, data: { assessmentId: receipt.assessmentId } });
      await admin.close();
    }
  });
});
