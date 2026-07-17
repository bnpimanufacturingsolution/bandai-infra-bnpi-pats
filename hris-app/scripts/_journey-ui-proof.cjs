const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const base = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5175";
const outDir = process.argv[2];
const deviceId = "cmrlgqsjv000oob01165tbd8n";
const emp = "t18stay63721";
const syncUrl = `/admin/configuration/devices?action=device-users&deviceId=${deviceId}&syncPanel=users&deviceUserView=hris&deviceUserSearch=${encodeURIComponent(emp)}`;
const eventsUrl = `/admin/configuration/devices/events?view=saved&deviceId=${deviceId}&eventAction=USER_CREATED`;
fs.mkdirSync(outDir, { recursive: true });
const report = { base, emp, syncUrl, eventsUrl, steps: [] };
async function shot(page, name) {
  await page.screenshot({ path: path.join(outDir, name), fullPage: true });
  report.steps.push({ shot: name });
}
(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox","--disable-gpu"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(base + "/auth/login", { waitUntil: "domcontentloaded", timeout: 60000 });
    await shot(page, "01-login.png");
    await page.fill('input[type="email"], input[name="email"]', "admin@bandai.local");
    await page.fill('input[type="password"], input[name="password"]', "password123");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(2500);
    await shot(page, "02-after-login.png");
    report.afterLoginUrl = page.url();

    await page.goto(base + syncUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(7000);
    await shot(page, "03-sync-center-hris-search.png");
    const bodyText = await page.locator("body").innerText();
    report.syncCenter = {
      url: page.url(),
      hasStay: bodyText.includes(emp),
      empty: /No device users found/i.test(bodyText),
      hasDeviceUserViewHris: page.url().includes("deviceUserView=hris"),
      hasSearch: page.url().includes("t18stay63721"),
      bodySnippet: bodyText.slice(0, 1500),
    };

    await page.goto(base + eventsUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(6000);
    await shot(page, "04-events-user-created.png");
    const evText = await page.locator("body").innerText();
    report.events = {
      url: page.url(),
      hasStay: evText.includes(emp),
      hasOpaqueStay: evText.includes("ATimlZ595gyYZifrO573DA=="),
    };

    const links = page.locator('a:has-text("Device user")');
    report.deviceUserLinkCount = await links.count();
    if (report.deviceUserLinkCount > 0) {
      await links.first().click();
      await page.waitForTimeout(6000);
      await shot(page, "05-after-device-user-click.png");
      const after = await page.locator("body").innerText();
      report.afterClick = {
        url: page.url(),
        hasHrisView: page.url().includes("deviceUserView=hris"),
        hasStay: after.includes(emp) || /t18stay|t18live|t18tmp/.test(after),
        empty: /No device users found/i.test(after),
        bodySnippet: after.slice(0, 1500),
      };
    } else {
      report.afterClick = { skipped: true };
    }
    fs.writeFileSync(path.join(outDir, "ui-proof.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    const ok = report.syncCenter?.hasStay === true && report.syncCenter?.empty === false && report.syncCenter?.hasDeviceUserViewHris === true;
    process.exit(ok ? 0 : 2);
  } catch (e) {
    report.error = String(e && e.stack || e);
    fs.writeFileSync(path.join(outDir, "ui-proof.json"), JSON.stringify(report, null, 2));
    try { await page.screenshot({ path: path.join(outDir, "99-error.png"), fullPage: true }); } catch {}
    console.error(report.error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
