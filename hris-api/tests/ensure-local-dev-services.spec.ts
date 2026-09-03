import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, describe, it } from "mocha";

const childProcess = require("node:child_process") as any;
const originalSpawnSync = childProcess.spawnSync;
const scriptPath = path.resolve(__dirname, "../scripts/ensure-local-dev-services.cjs");

function loadLocalDevServices() {
	delete require.cache[require.resolve(scriptPath)];
	return require(scriptPath) as {
		dockerInfoWorks: () => boolean;
		ensureDockerReady: (
			timeoutMs: number,
			dependencies?: {
				checkDockerInfo?: () => boolean | Promise<boolean>;
				startDockerDesktop?: () => boolean | void;
				wait?: (ms: number) => Promise<void> | void;
				now?: () => number;
			},
		) => Promise<boolean>;
	};
}

describe("ensure-local-dev-services", () => {
	afterEach(() => {
		childProcess.spawnSync = originalSpawnSync;
		delete require.cache[require.resolve(scriptPath)];
	});

	it("caps docker info probes so a loading Docker Desktop cannot block forever", () => {
		let capturedTimeout: number | undefined;
		childProcess.spawnSync = ((command: string, args: string[], options: any = {}) => {
			if (command === "docker" && Array.isArray(args) && args[0] === "info") {
				capturedTimeout = options.timeout;
				return {
					status: null,
					stdout: "",
					stderr: "",
					error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }),
				};
			}

			return { status: 0, stdout: "", stderr: "" };
		}) as any;

		const { dockerInfoWorks } = loadLocalDevServices();

		assert.equal(dockerInfoWorks(), false);
		assert.equal(capturedTimeout, 5000);
	});

	it("stops waiting once the overall Docker readiness timeout is reached", async () => {
		const { ensureDockerReady } = loadLocalDevServices();
		let startDesktopCalls = 0;
		let currentTime = 0;
		const waitIntervals: number[] = [];

		const ready = await ensureDockerReady(5000, {
			checkDockerInfo: () => false,
			startDockerDesktop: () => {
				startDesktopCalls += 1;
				return true;
			},
			wait: async (ms: number) => {
				waitIntervals.push(ms);
				currentTime += ms;
			},
			now: () => currentTime,
		});

		assert.equal(ready, false);
		assert.equal(startDesktopCalls, 1);
		assert.deepEqual(waitIntervals, [2500, 2500]);
	});
});
