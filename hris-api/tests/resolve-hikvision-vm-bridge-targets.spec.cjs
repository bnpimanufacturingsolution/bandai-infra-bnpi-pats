/**
 * Contract tests for smart reverse-bridge target ranking.
 * Run: node --test tests/resolve-hikvision-vm-bridge-targets.spec.cjs
 * or: npx mocha --no-config tests/resolve-hikvision-vm-bridge-targets.spec.cjs
 */
const { expect } = require("chai");
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const script = path.join(__dirname, "..", "scripts", "resolve-hikvision-vm-bridge-targets.cjs");
const ensureScript = path.join(__dirname, "..", "scripts", "ensure-hikvision-vm-bridge.cjs");
const portOwnershipScript = path.join(__dirname, "..", "scripts", "ensure-dev-port-ownership.cjs");
const devWatchScript = path.join(__dirname, "..", "scripts", "run-dev-api-watch.cjs");
const bridgeScript = path.join(__dirname, "..", "..", "scripts", "start-host-hikvision-vm-ssh-bridge.ps1");
const livePathScript = path.join(__dirname, "..", "..", "scripts", "ensure-device-live-path.ps1");

describe("resolve-hikvision-vm-bridge-targets", () => {
	it("exports a resolver script that ranks host-reachable reverse targets", () => {
		expect(fs.existsSync(script)).to.equal(true);
		const source = fs.readFileSync(script, "utf8");
		expect(source).to.include("hostReachable");
		expect(source).to.include("db-reverse-bridge-host-reachable");
		expect(source).to.include("host-fallback-reachable-over-db-stale");
		expect(source).to.include("192.168.254.102");
		expect(source).to.include("TEST A");
		expect(source).to.include("probeTcp");
	});

	it("ensure script only fast-paths when local bridge matches resolved IPs", () => {
		const source = fs.readFileSync(ensureScript, "utf8");
		expect(source).to.include("localBridgeMatches");
		expect(source).to.include("localMatches");
		expect(source).to.include("host-fallback-102");
		expect(source).to.include('envValue("HIKVISION_VM_BRIDGE_SSH_TARGET", "auto")');
		expect(source).to.include("infra@10.184.37.19");
		expect(source).to.include("project-truth-hris");
		// Must not exit fast solely because VM :59000 is open.
		expect(source).to.match(/remoteSdkOpen && localMatches/);
		expect(source).to.not.match(
			/if \(vmPortOpen\(Number\(sdkListenPort\)\)\) \{\s*console\.log\(\s*`\[hikvision-bridge\] DONE \(fast path\)/,
		);
	});

	it("honors explicit HIKVISION_VM_BRIDGE_DEVICE_IP override without DB", () => {
		const result = spawnSync(
			process.execPath,
			[script],
			{
				encoding: "utf8",
				windowsHide: true,
				env: {
					...process.env,
					HIKVISION_VM_BRIDGE_DEVICE_IP: "192.168.254.102",
					HIKVISION_BRIDGE_PROBE_MS: "200",
				},
			},
		);
		expect(result.status).to.equal(0);
		const parsed = JSON.parse(String(result.stdout || "{}"));
		expect(parsed.ok).to.equal(true);
		expect(parsed.source).to.equal("env:HIKVISION_VM_BRIDGE_DEVICE_IP");
		expect(parsed.targets[0].deviceIp).to.equal("192.168.254.102");
		expect(parsed.targets[0]).to.have.property("hostReachable");
		expect(parsed.targets[0]).to.have.property("openPorts");
	});

	it("keeps device and API reverse forwards independently restartable", () => {
		const bridgeSource = fs.readFileSync(bridgeScript, "utf8");
		const livePathSource = fs.readFileSync(livePathScript, "utf8");

		// A stale API callback forward must not prevent the device SDK bridge from starting.
		expect(bridgeSource).to.not.include('$forwardArgs.Add("${ApiRemotePort}:');
		expect(bridgeSource).to.not.include("remoteListenPorts.Add([int]$ApiRemotePort)");
		expect(bridgeSource).to.include("sudo -n ss -ltnp");
		expect(bridgeSource).to.include("sudo -n kill");
		expect(bridgeSource).to.include("'bash -s'");

		// The live-path helper remains the sole owner of the VM-to-host API callback reverse.
		expect(livePathSource).to.include('"-R", "${ApiRemotePort}:127.0.0.1:${ApiLocalPort}"');
		expect(livePathSource).to.include("Invoke-VmSshScript -Script $retargetScript");
		expect(livePathSource).to.include("Select-VmSshCandidate");
	});

	it("does not fast-ok a healthy old API before the new watcher starts", () => {
		const source = fs.readFileSync(portOwnershipScript, "utf8");
		expect(source).to.include("EADDRINUSE");
		expect(source).to.include("reclaiming it before the new watcher starts");
		expect(source).to.not.include("fast OK (login ready)");
	});

	it("defers socket live-path repair until the dev API is actually listening", () => {
		const livePathSource = fs.readFileSync(path.join(__dirname, "..", "scripts", "ensure-device-live-path.cjs"), "utf8");
		const watchSource = fs.readFileSync(devWatchScript, "utf8");

		expect(livePathSource).to.include("HRIS_DEVICE_LIVE_PATH_REQUIRE_API");
		expect(livePathSource).to.include("DONE (pre-api defer)");
		expect(watchSource).to.include("runLivePathAfterHealth");
		expect(watchSource).to.include("HRIS_DEVICE_LIVE_PATH_REQUIRE_API: \"true\"");
	});
});
