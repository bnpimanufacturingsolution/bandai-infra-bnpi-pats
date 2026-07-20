import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "chai";

const currentDir = dirname(fileURLToPath(import.meta.url));
const controllerSource = readFileSync(
	resolve(currentDir, "../app/device/device.controller.ts"),
	"utf8",
);

describe("device health fast path contract", () => {
	it("supports quick health without slow Hikvision source-count probes", () => {
		expect(controllerSource).to.contain("quickHealth");
		expect(controllerSource).to.contain('quick || "").toLowerCase() === "true"');
		expect(controllerSource).to.contain("Skipped in quick health mode");
		expect(controllerSource).to.contain("tcpReachability");
		expect(controllerSource).to.match(
			/checkTcpReachability\(healthHost, healthPort, quickHealth \? 1200 : 2500\)/,
		);
		expect(controllerSource).to.match(
			/isZkteco \|\| quickHealth\s*\?\s*Promise\.resolve\(null\)\s*:\s*getHikvisionSourceCounts/s,
		);
		expect(controllerSource).to.match(/if \(quickHealth\)[\s\S]*?deviceApi = {[\s\S]*?provenBy: "tcpReachability"/);
	});
});
