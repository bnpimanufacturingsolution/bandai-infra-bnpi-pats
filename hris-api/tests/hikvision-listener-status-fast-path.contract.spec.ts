import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "chai";

const currentDir = dirname(fileURLToPath(import.meta.url));
const controllerSource = readFileSync(
	resolve(currentDir, "../app/device/device.controller.ts"),
	"utf8",
);

describe("hikvision listener status fast path contract", () => {
	it("uses one SSH status round-trip with a hard budget", () => {
		expect(controllerSource).to.contain("HIKVISION_LISTENER_STATUS_TIMEOUT_MS");
		expect(controllerSource).to.contain("HIKVISION_LISTENER_STATUS_TIMEOUT_MS || 4500");
		expect(controllerSource).to.contain("ACTIVE=");
		expect(controllerSource).to.contain("---SHOW---");
		expect(controllerSource).to.contain("---LOG---");
		// Must not open three independent SSH sessions for status.
		expect(controllerSource).not.to.match(
			/Promise\.all\(\[\s*runHikvisionListenerVmCommand\(\s*\[\s*"systemctl",\s*"is-active"/,
		);
	});

	it("prefers Cloudflare SSH alias before dead LAN SSH on host operators", () => {
		expect(controllerSource).to.contain("alias:${configuredAlias}");
		expect(controllerSource).to.contain("Prefer the SSH alias first");
		// Alias target is pushed before the LAN target in the builder.
		const aliasIndex = controllerSource.indexOf("label: `alias:${configuredAlias}`");
		const lanIndex = controllerSource.indexOf("label: `lan:${host}`");
		expect(aliasIndex).to.be.greaterThan(-1);
		expect(lanIndex).to.be.greaterThan(-1);
		expect(aliasIndex).to.be.lessThan(lanIndex);
	});

	it("treats SDK receiving / restarting unit as service-enabled for the admin toggle", () => {
		// Must not only use active+not-failed — Keep ready restarts flip deactivating
		// while TEST A still receives, which previously left Service enabled OFF.
		expect(controllerSource).to.contain("systemdLooksUp");
		expect(controllerSource).to.contain("sdk?.receivingCallbacks");
		expect(controllerSource).to.contain('activeState === "deactivating"');
		expect(controllerSource).to.contain('activeState === "activating"');
	});
});
