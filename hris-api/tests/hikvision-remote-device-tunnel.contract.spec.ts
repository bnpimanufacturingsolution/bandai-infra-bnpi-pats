import { expect } from "chai";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../..");

const readRepoFile = (relativePath: string) =>
	readFileSync(path.join(repoRoot, relativePath), "utf8");

describe("Hikvision remote device tunnel contract", () => {
	const ensureScript = readRepoFile("hris-api/scripts/ensure-hikvision-remote-device-tunnel.cjs");
	const tunnelScript = readRepoFile("scripts/start-hikvision-remote-device-tunnel.ps1");
	const accessControlRouter = readRepoFile("hris-api/app/hikvision/routes/access.control.router.ts");
	const deviceController = readRepoFile("hris-api/app/device/device.controller.ts");
	const restartLocalApiScript = readRepoFile("scripts/restart-local-hris-api-dev.ps1");
	const predevScript = readRepoFile("hris-api/scripts/predev-run.cjs");
	const dbWatchScript = readRepoFile("scripts/watch-k8s-dev-db-access.ps1");
	const vmBridgeEnsureScript = readRepoFile("hris-api/scripts/ensure-hikvision-vm-bridge.cjs");
	const overnightMergeScript = readRepoFile("scripts/merge-users-overnight-loop.ps1");

	it("passes the six current Hikvision device IPs as one normalized PowerShell argument", () => {
		expect(ensureScript).to.include(
			'"10.184.37.20,10.184.37.21,10.184.37.22,10.184.37.23,10.184.37.24,10.184.37.25"',
		);
		expect(ensureScript).to.include('"-DeviceIps"');
		expect(ensureScript).to.include("deviceIps.join(\",\")");
		expect(ensureScript).to.not.include("...deviceIps");
	});

	it("defaults the PowerShell helper to all six devices and all required local ports", () => {
		for (const ip of [
			"10.184.37.20",
			"10.184.37.21",
			"10.184.37.22",
			"10.184.37.23",
			"10.184.37.24",
			"10.184.37.25",
		]) {
			expect(tunnelScript).to.include(ip);
		}
		expect(tunnelScript).to.include("[int]$LocalHttpPortBase = 10080");
		expect(tunnelScript).to.include("[int]$LocalHttpsPortBase = 10443");
		expect(tunnelScript).to.include("[int]$LocalSdkPortBase = 18000");
		expect(tunnelScript).to.include("RemotePort = 80");
		expect(tunnelScript).to.include("RemotePort = 443");
		expect(tunnelScript).to.include("RemotePort = 8000");
	});

	it("writes one PROJECT_TRUTH_HIKVISION_TUNNEL_MAP value with every forward", () => {
		expect(tunnelScript).to.include("$tunnelMap = (($forwardSpecs | ForEach-Object");
		expect(tunnelScript).to.include('"$($_.DeviceIp):$($_.RemotePort)=127.0.0.1:$($_.LocalPort)"');
		expect(tunnelScript).to.include("}) -join ','");
		expect(tunnelScript).to.include('Env = "PROJECT_TRUTH_HIKVISION_TUNNEL_MAP=$tunnelMap"');
		expect(tunnelScript).to.include("Set-LocalApiTunnelEnv -Value $envValue");
	});

	it("repairs stale or partial tunnel state instead of reusing it", () => {
		expect(tunnelScript).to.include("$expectedLocalPorts = @($forwardSpecs | Select-Object -ExpandProperty LocalPort)");
		expect(tunnelScript).to.include("$listeningCount -eq $expectedLocalPorts.Count");
		expect(tunnelScript).to.include("if (-not $active -and (Test-Path -LiteralPath $pidFile))");
		expect(tunnelScript).to.include("Stop-ExistingTunnel");
		expect(tunnelScript).to.include("Neither SSH target is reachable");
		expect(tunnelScript).to.include("No active state was recorded");
	});

	it("scopes Hikvision UserInfo count cache entries by organization and device", () => {
		expect(accessControlRouter).to.include("const organizationId = String((req as any).organizationId || \"unknown\")");
		expect(accessControlRouter).to.include("const deviceId = String(req.query?.deviceId || \"default\").trim() || \"default\"");
		expect(accessControlRouter).to.include("cache:hikvision:userinfo:count:${organizationId}:${deviceId}");
		expect(accessControlRouter).to.not.include("return `cache:hikvision:userinfo:count`;");
	});

	it("uses bounded live UserInfo counts during quick Sync Center preview", () => {
		expect(deviceController).to.include("quickSavedPreview");
		expect(deviceController).to.include("await getHikvisionFastDeviceUserSourceCount(req, device.id)");
		expect(deviceController).to.include("Promise.allSettled(");
		expect(deviceController).to.include("HIKVISION_FAST_USER_COUNT_TIMEOUT_MS");
		expect(deviceController).to.not.include("Live source counts skipped for quick Sync Center preview");
	});

	it("falls back to the lighter UserInfo count endpoint when UserInfo/Search does not yield a count", () => {
		expect(deviceController).to.include(
			"const userSearch = searchCount !== null ? searchResult : await readUserCountEndpoint();",
		);
		expect(deviceController).to.not.include(
			"searchCount !== null || isHikvisionTransportFailure(searchResult.error)",
		);
	});

	it("counts saved DeviceUser inventory by distinct vendor user id for Sync Center and Device Users totals", () => {
		expect(deviceController).to.include('by: ["deviceId", "status", "vendorUserId"]');
		expect(deviceController).to.include('by: ["deviceId", "vendorUserId"]');
		expect(deviceController).to.include('by: ["vendorUserId"]');
		expect(deviceController).to.include("total: Array.isArray(totalGroups) ? totalGroups.length : 0");
	});

	it("ensures the six-device tunnel before a manual local API restart loads env", () => {
		expect(restartLocalApiScript).to.include("ensure-hikvision-remote-device-tunnel.cjs");
		expect(restartLocalApiScript).to.include("Ensuring Hikvision remote device tunnels (.20-.25)");
		expect(restartLocalApiScript.indexOf("ensure-hikvision-remote-device-tunnel.cjs")).to.be.lessThan(
			restartLocalApiScript.indexOf("run-dev-api-watch.cjs"),
		);
	});

	it("keeps the canonical DEV DB wire handshake under a bounded self-repair watcher", () => {
		expect(predevScript).to.include('id: "ensure-k8s-db-watch"');
		expect(restartLocalApiScript).to.include("watch-k8s-dev-db-access.ps1");
		expect(dbWatchScript).to.include("Test-PostgresHandshake");
		expect(dbWatchScript).to.include("$consecutiveFailures -ge $FailureThreshold");
		expect(dbWatchScript).to.include("start-k8s-dev-db-access.ps1");
		expect(dbWatchScript).to.include("-WindowStyle Hidden");
		expect(dbWatchScript).to.include("for ($attempt = 1; $attempt -le 5");
	});

	it("does not let optional TEST A bridge stderr fail the local restart after API health is green", () => {
		expect(restartLocalApiScript).to.include("optional TEST A bridge exited");
		expect(restartLocalApiScript).to.include("2>&1 | ForEach-Object { Write-Host $_ }");
		expect(restartLocalApiScript.indexOf("Local hris-api is healthy")).to.be.lessThan(
			restartLocalApiScript.indexOf("Ensuring TEST A SSH reverse bridge"),
		);
	});

	it("requires an explicit live scope and reviewed choices before overnight writes", () => {
		expect(overnightMergeScript).to.include("[string[]]$DeviceIds = @()");
		expect(overnightMergeScript).to.include("[switch]$ExecuteReviewedPlan");
		expect(overnightMergeScript).to.include("ReviewedChoicesPath");
		expect(overnightMergeScript).to.include("This script has no hardcoded merge scope");
		expect(overnightMergeScript).to.include("automatic broad replan/restart is forbidden");
		expect(overnightMergeScript).to.not.include("Build-RichestChoices");
		expect(overnightMergeScript).to.not.include("tie_prefer_A");
	});

	it("keeps optional TEST A bridge failures compact and non-blocking during npm run dev predev", () => {
		expect(vmBridgeEnsureScript).to.include('stdio: "pipe"');
		expect(vmBridgeEnsureScript).to.include("Continuing API boot");
		expect(vmBridgeEnsureScript).to.include("process.exit(0);");
		expect(vmBridgeEnsureScript).to.include("slice(-6)");
		expect(vmBridgeEnsureScript).to.include("timeout: 45_000");
	});
});
