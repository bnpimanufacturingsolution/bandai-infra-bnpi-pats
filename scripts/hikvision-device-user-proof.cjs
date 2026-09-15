const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");
const { chromium } = require(path.join(process.env.PT_ROOT, "bnpi-pats-app", "node_modules", "playwright"));

const requiredEnv = [
  "PT_BASE_URL",
  "PT_AUTH_TOKEN",
  "PT_DEVICE_ID",
  "PT_VENDOR_USER_ID",
  "PT_EVIDENCE_DIR",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable ${key}`);
  }
}

const baseUrl = process.env.PT_BASE_URL;
const token = process.env.PT_AUTH_TOKEN;
const deviceId = process.env.PT_DEVICE_ID;
const vendorUserId = process.env.PT_VENDOR_USER_ID;
const expectedSyntheticFaceCount = Number(process.env.PT_EXPECTED_SYNTHETIC_FACE_COUNT || "0");
const evidenceDir = process.env.PT_EVIDENCE_DIR;

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const network = [];
  const consoleMessages = [];

  page.on("console", (message) => {
    consoleMessages.push({
      type: message.type(),
      text: message.text().slice(0, 500),
    });
  });

  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/api/")) return;
    network.push({
      method: response.request().method(),
      status: response.status(),
      url,
    });
  });

  await page.addInitScript((jwt) => {
    window.localStorage.setItem("authToken", jwt);
    window.localStorage.setItem("userRole", "bnpi-pats-admin");
    window.localStorage.setItem("userSubRole", "bnpi-pats-admin");
  }, token);

  await page.route("**/api/**", async (route) => {
    await route.continue({
      headers: {
        ...route.request().headers(),
        authorization: `Bearer ${token}`,
      },
    });
  });

  const targetUrl = `${baseUrl}/admin/configuration/devices?deviceId=${encodeURIComponent(
    deviceId,
  )}&action=device-users&syncPanel=users`;
  const startedAt = performance.now();
  await page.goto(targetUrl, { waitUntil: "networkidle" });
  await page.getByText("Device Users", { exact: true }).waitFor({ timeout: 15000 });

  const fallbackDisplayName = `User ${vendorUserId}`;
  const directActionButton = page.locator(
    `button[aria-label="More actions for device user ${fallbackDisplayName}"]`,
  );
  const row = page
    .locator("tr")
    .filter({ hasText: `${vendorUserId} - normal` })
    .first();

  if (await directActionButton.count()) {
    await directActionButton.first().click();
  } else {
    await row.waitFor({ timeout: 15000 });
    await row.locator('button[aria-label*="More actions"]').click();
  }
  await page.getByRole("menuitem", { name: "Details", exact: true }).click();

  await page.getByText(`Vendor user ID ${vendorUserId}`, { exact: true }).waitFor({ timeout: 15000 });
  if (expectedSyntheticFaceCount > 0) {
    await page.getByText(/dev mock face tally/i).waitFor({ timeout: 15000 });
  }

  const screenshot = path.join(evidenceDir, `device-user-${vendorUserId}-details.png`);
  await page.screenshot({ path: screenshot, fullPage: true });

  const bodyText = await page.locator("body").innerText();
  const result = {
    targetUrl,
    finalUrl: page.url(),
    durationMs: Math.round(performance.now() - startedAt),
    vendorUserId,
    expectedSyntheticFaceCount,
    foundSyntheticFaceTally: bodyText.toLowerCase().includes("dev mock face tally"),
    foundVendorUserText: bodyText.includes(`Vendor user ID ${vendorUserId}`),
    network: network.slice(-60),
    consoleMessages: consoleMessages.slice(-60),
    screenshot,
  };

  fs.writeFileSync(
    path.join(evidenceDir, `device-user-${vendorUserId}-playwright-proof.json`),
    JSON.stringify(result, null, 2),
  );

  await browser.close();
})();
