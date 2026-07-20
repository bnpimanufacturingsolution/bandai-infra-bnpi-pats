import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.env.PROOF_DIR;
const base = process.env.APP_BASE || "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const log = [];
try {
  await page.goto(base + "/auth/login", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.fill('input[type="email"], input[name="email"]', "admin@bandai.local");
  await page.fill('input[type="password"], input[name="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  const url = base + "/admin/configuration/devices/events?view=saved&deviceId=cmrlgqsjv000oob01165tbd8n&window=today";
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(outDir, "01-events.png"), fullPage: true });
  const combos = page.getByRole("combobox");
  const count = await combos.count();
  log.push({ comboboxCount: count });
  let actionIdx = -1;
  for (let i = 0; i < count; i++) {
    const t = (await combos.nth(i).innerText()).trim();
    log.push({ i, text: t.slice(0, 80) });
    if (/Any event action|All actions/i.test(t)) actionIdx = i;
  }
  if (actionIdx < 0 && count >= 4) actionIdx = 3;
  if (actionIdx < 0) throw new Error("Action combobox not found count=" + count);
  await combos.nth(actionIdx).click({ force: true });
  await page.waitForTimeout(700);
  const options = page.getByRole("option");
  const optCount = await options.count();
  const labels = [];
  for (let i = 0; i < Math.min(optCount, 30); i++) labels.push((await options.nth(i).innerText()).trim());
  log.push({ open: optCount > 0, optCount, labels });
  await page.screenshot({ path: path.join(outDir, "02-action-open.png"), fullPage: true });
  if ((await page.getByRole("option", { name: /User created/i }).count()) > 0) {
    await page.getByRole("option", { name: /User created/i }).first().click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(outDir, "03-user-created-filter.png"), fullPage: true });
    log.push({ selectedUserCreated: true, url: page.url() });
  }
  fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(log, null, 2));
  console.log(JSON.stringify({ ok: optCount > 0, optCount, labels: labels.slice(0, 15) }, null, 2));
  await browser.close();
  process.exit(optCount > 0 ? 0 : 2);
} catch (e) {
  fs.writeFileSync(path.join(outDir, "error.txt"), String(e && e.stack || e));
  await page.screenshot({ path: path.join(outDir, "error.png"), fullPage: true }).catch(() => {});
  console.error(String(e && e.stack || e));
  await browser.close();
  process.exit(1);
}
