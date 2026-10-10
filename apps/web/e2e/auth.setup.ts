import { expect, test as setup } from "@playwright/test";

/** Sign each role in once and save the session (login is rate-limited to 10/min). */
const ROLES = [
  ["DEMO-02", "student"],
  ["DEMO-04", "student"],
  ["TEACH-01", "teacher"],
  ["ADMIN-01", "admin"],
] as const;

for (const [code] of ROLES) {
  setup(`sign in ${code}`, async ({ page }) => {
    await page.goto("/login");
    await page.fill("#code", code);
    await page.click("button[type=submit]");
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
    if (page.url().includes("/consent")) {
      await page.getByRole("button", { name: "I understand and agree" }).click();
      await page.waitForURL((u) => !u.pathname.startsWith("/consent"));
    }
    await expect(page.getByRole("banner")).toContainText(code);
    await page.context().storageState({ path: `e2e/.auth/${code}.json` });
  });
}
