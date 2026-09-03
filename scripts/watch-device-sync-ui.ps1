param(
	[string]$BaseUrl = "http://10.184.37.19:3100",
	[string]$Token,
	[int]$Loops = 3,
	[int]$DelaySeconds = 2
)

$ErrorActionPreference = "Stop"

if (-not $Token) {
	throw "Token is required. Pass -Token with a short-lived dev admin JWT."
}

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root ".runtime\browser-evidence\device-sync"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$scriptPath = Join-Path $outDir "watch-device-sync-ui.cjs"
@'
const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(process.env.PT_ROOT, 'hris-app', 'node_modules', 'playwright'));

const baseUrl = process.env.PT_BASE_URL;
const token = process.env.PT_AUTH_TOKEN;
const loops = Number(process.env.PT_LOOPS || 3);
const delaySeconds = Number(process.env.PT_DELAY_SECONDS || 2);
const outDir = process.env.PT_OUT_DIR;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const network = [];
  const consoleMessages = [];
  page.on('console', (message) => {
    consoleMessages.push({
      type: message.type(),
      text: message.text().slice(0, 500),
    });
  });
  page.on('requestfailed', (request) => {
    network.push({
      phase: 'failed',
      method: request.method(),
      url: request.url(),
      error: request.failure()?.errorText || '',
    });
  });
  page.on('response', async (response) => {
    const url = response.url();
    if (!url.includes('/api/') && !url.includes('/auth/')) return;
    network.push({
      phase: 'response',
      method: response.request().method(),
      url,
      status: response.status(),
    });
  });
  await page.addInitScript((jwt) => {
    window.localStorage.setItem('authToken', jwt);
    window.localStorage.setItem('userRole', 'hris-admin');
    window.localStorage.setItem('userSubRole', 'hris-admin');
  }, token);
  await page.route('**/api/**', async (route) => {
    const headers = {
      ...route.request().headers(),
      authorization: `Bearer ${token}`,
    };
    await route.continue({ headers });
  });

  const results = [];
  for (let i = 1; i <= loops; i += 1) {
    const url = `${baseUrl}/admin/configuration/devices/events?view=saved&action=sync-logs`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    const state = await page.evaluate(() => {
      const bodyText = document.body.innerText || '';
      const dialog = document.querySelector('[role="dialog"]') || document.body;
      const buttons = Array.from(dialog.querySelectorAll('button')).map((button) => ({
        text: (button.innerText || button.getAttribute('aria-label') || '').trim(),
        disabled: button.disabled,
        ariaDisabled: button.getAttribute('aria-disabled'),
      }));
      const cards = Array.from(dialog.querySelectorAll('p,span,button')).map((el) =>
        (el.innerText || '').trim()
      ).filter(Boolean);
      return {
        url: window.location.href,
        authTokenPresent: Boolean(window.localStorage.getItem('authToken')),
        authMeProbe: null,
        hasDialog: Boolean(document.querySelector('[role="dialog"]')),
        bodyIncludesCannotGetHealth: bodyText.includes('Cannot GET /api/device//health'),
        bodyIncludesCannotPost: bodyText.includes('Cannot POST'),
        bodyIncludesInSync: bodyText.includes('In sync'),
        bodyIncludesCountsUnavailable: bodyText.includes('Counts unavailable'),
        bodyIncludesSyncUnavailable: bodyText.includes('Sync unavailable'),
        bodyIncludesNotSynced: bodyText.includes('Not synced'),
        bodyIncludesImportLogs: bodyText.includes('Import logs'),
        buttons,
        visibleText: cards.slice(0, 80),
      };
    });
    try {
      state.authMeProbe = await page.evaluate(async () => {
        const token = window.localStorage.getItem('authToken') || '';
        const response = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const text = await response.text();
        return { status: response.status, body: text.slice(0, 500) };
      });
    } catch (error) {
      state.authMeProbe = { error: String(error && error.message ? error.message : error) };
    }
    state.network = network.slice(-40);
    state.consoleMessages = consoleMessages.slice(-40);

    const screenshot = path.join(outDir, `device-sync-loop-${i}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    state.screenshot = screenshot;
    results.push(state);
    await wait(delaySeconds * 1000);
  }

  fs.writeFileSync(path.join(outDir, 'device-sync-state.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
'@ | Set-Content -LiteralPath $scriptPath -Encoding UTF8

$env:PT_BASE_URL = $BaseUrl
$env:PT_AUTH_TOKEN = $Token
$env:PT_LOOPS = [string]$Loops
$env:PT_DELAY_SECONDS = [string]$DelaySeconds
$env:PT_OUT_DIR = $outDir
$env:PT_ROOT = $root
node $scriptPath
