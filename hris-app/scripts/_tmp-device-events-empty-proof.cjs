const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const outDir = process.argv[2];
const base = process.env.DEVICE_EVENTS_BASE_URL || "https://dev.bnpi-hris.tech";

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const network = [];
  const failed = [];
  const consoleMsgs = [];
  page.on("console", (msg) => consoleMsgs.push({ type: msg.type(), text: msg.text() }));
  page.on("requestfailed", (req) => failed.push({ url: req.url(), error: req.failure()?.errorText }));
  page.on("response", async (res) => {
    const url = res.url();
    if (!/\/api\//.test(url)) return;
    const entry = { url, status: res.status(), method: res.request().method() };
    if (url.includes("/device/events") && !url.includes("live-readiness") && !url.includes("reset")) {
      try {
        const json = await res.json();
        const data = json?.data || json;
        entry.eventsLen = Array.isArray(data?.events) ? data.events.length : null;
        entry.total = data?.pagination?.total ?? data?.summary?.total ?? null;
        entry.keys = data && typeof data === "object" ? Object.keys(data).slice(0, 12) : [];
      } catch (e) {
        entry.parseError = String(e?.message || e);
      }
    }
    network.push(entry);
  });

  await page.goto(`${base}/auth/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByPlaceholder("EMP-HR-MGR-001 or hr-manager@seed.local").fill("admin@bandai.local");
  await page.getByPlaceholder("Enter your password").fill("password123");
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/auth/login"), { timeout: 60000 });

  const eventsWait = page.waitForResponse(
    (res) => res.url().includes("/api/device/events") && !res.url().includes("live-readiness") && res.request().method() === "GET",
    { timeout: 90000 },
  ).catch(() => null);

  await page.goto(`${base}/admin/configuration/devices/events?view=saved`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  const firstEventsRes = await eventsWait;
  await page.waitForTimeout(12000);

  const metrics = await page.evaluate(() => {
    const dataRows = document.querySelectorAll("[data-datatable-row]");
    const tbodyRows = Array.from(document.querySelectorAll("table tbody tr")).map((tr) =>
      (tr.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
    );
    const bodyViewport = document.querySelector("[data-datatable-body-viewport]");
    const bodyRect = bodyViewport ? bodyViewport.getBoundingClientRect() : null;
    const text = document.body?.innerText || "";
    const savedMatch = text.match(/Saved\s*\n?\s*([\d,]+)/);
    const paginationMatch = text.match(/Showing\s+\d+\s+to\s+\d+\s+of\s+([\d,]+)\s+results/i);
    return {
      dataRowCount: dataRows.length,
      tbodyPreview: tbodyRows.slice(0, 12),
      tbodyTrCount: tbodyRows.length,
      bodyViewportHeight: bodyRect ? Math.round(bodyRect.height) : null,
      savedChip: savedMatch ? savedMatch[1] : null,
      paginationTotal: paginationMatch ? paginationMatch[1] : null,
      hasEmptyMessage: /No data found|No saved events|0 saved rows/i.test(text),
      pageUrl: location.href,
    };
  });

  await page.screenshot({ path: path.join(outDir, "browser-saved-events-detail.png"), fullPage: true });
  const proof = {
    base,
    firstEventsStatus: firstEventsRes ? firstEventsRes.status() : null,
    firstEventsUrl: firstEventsRes ? firstEventsRes.url() : null,
    metrics,
    eventsNetwork: network.filter((n) => n.url.includes("/device/events")),
    apiSample: network.filter((n) => /auth|device\/events|device\?|health/.test(n.url)).slice(0, 30),
    failed: failed.slice(0, 20),
    consoleErrors: consoleMsgs.filter((m) => m.type === "error").slice(0, 20),
  };
  fs.writeFileSync(path.join(outDir, "browser-proof-detail.json"), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});