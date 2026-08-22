const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const evidenceDir = process.argv[2];
const targetUrl = 'http://localhost:5175/admin/configuration/devices/events?view=saved&deviceId=cmpxw13hx002h7zwso7dyedrn&source=EN_HCNETSDK_ALARM';
const apiBase = 'http://localhost:3001';

(async () => {
  const loginRes = await fetch(`${apiBase}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@bandai.local', identifier: 'admin@bandai.local', password: 'password123', appCode: 'hris' }),
  });
  const loginJson = await loginRes.json();
  const token = loginJson?.data?.token;
  if (!loginRes.ok || !token) throw new Error(`login failed ${loginRes.status}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, baseURL: 'http://localhost:5175' });
  await context.addCookies([{ name: 'token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await context.addInitScript((actor) => {
    localStorage.setItem('authToken', actor.token);
    localStorage.setItem('userRole', actor.role || 'hris-admin');
    if (actor.subRole) localStorage.setItem('userSubRole', actor.subRole);
    localStorage.setItem('e2eAuthUser', JSON.stringify(actor.user || {}));
  }, { token, role: loginJson?.data?.role, subRole: loginJson?.data?.subRole, user: loginJson?.data });

  const page = await context.newPage();
  const network = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/device/events') || url.includes('/socket.io/')) {
      let text = '';
      try { text = await response.text(); } catch {}
      network.push({ url, status: response.status(), method: response.request().method(), bodyPreview: text.slice(0, 1000) });
    }
  });
  const consoleMessages = [];
  page.on('console', (msg) => consoleMessages.push({ type: msg.type(), text: msg.text() }));

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {});
  await page.getByText('Device attendance').waitFor({ timeout: 30000 });
  await page.getByText('Main Entrance Device').first().waitFor({ timeout: 30000 });
  await page.getByText('Ernst tey Malasa').first().waitFor({ timeout: 30000 });
  const text = await page.locator('body').innerText({ timeout: 10000 });
  const screenshot = path.join(evidenceDir, 'playwright-saved-events-hcnetsdk-filter.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  fs.writeFileSync(path.join(evidenceDir, 'playwright-saved-events-hcnetsdk-filter-proof.json'), JSON.stringify({
    targetUrl,
    capturedAt: new Date().toISOString(),
    title: await page.title(),
    finalUrl: page.url(),
    contains: {
      deviceAttendance: text.includes('Device attendance'),
      mainEntranceDevice: text.includes('Main Entrance Device'),
      ernstTeyMalasa: text.includes('Ernst tey Malasa'),
      savedRowsLive: text.includes('Saved rows live') || text.includes('Saved-row updates on'),
    },
    bodyPreview: text.slice(0, 3000),
    network,
    consoleMessages: consoleMessages.slice(-30),
    screenshot,
  }, null, 2));
  await browser.close();
})();
