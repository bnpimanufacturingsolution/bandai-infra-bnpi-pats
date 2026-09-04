import { expect } from "chai";

const {
	findReachableDevK8sForwardHost,
	shouldOfferInteractiveSshSetup,
	buildSshSetupGuidance,
} = require("../scripts/ensure-bnpi-db-access.cjs");

describe("ensure-bnpi-db-access", () => {
	it("does not probe a LAN-bound alias when localhost is unavailable", async () => {
		const attempts: string[] = [];
		const host = await findReachableDevK8sForwardHost({
			port: 55435,
			connect: async (port: number, candidate: string) => {
				attempts.push(`${candidate}:${port}`);
				return false;
			},
		});

		expect(host).to.equal(null);
		expect(attempts).to.deep.equal(["127.0.0.1:55435"]);
	});

	it("prefers a dedicated localhost forward when one is already healthy", async () => {
		const attempts: string[] = [];
		const host = await findReachableDevK8sForwardHost({
			port: 55435,
			connect: async (port: number, candidate: string) => {
				attempts.push(`${candidate}:${port}`);
				return candidate === "127.0.0.1";
			},
		});

		expect(host).to.equal("127.0.0.1");
		expect(attempts).to.deep.equal(["127.0.0.1:55435"]);
	});
});

describe("dev workstation ssh onboarding hooks", () => {
	it("offers interactive setup only on a TTY and only when not explicitly skipped", () => {
		expect(shouldOfferInteractiveSshSetup({ stdinIsTTY: true, skipEnv: "false" })).to.equal(true);
		expect(shouldOfferInteractiveSshSetup({ stdinIsTTY: true, skipEnv: undefined })).to.equal(true);
		expect(shouldOfferInteractiveSshSetup({ stdinIsTTY: false, skipEnv: "false" })).to.equal(false);
		// CI/agent safety: the skip flag must always suppress the prompt.
		expect(shouldOfferInteractiveSshSetup({ stdinIsTTY: true, skipEnv: "true" })).to.equal(false);
		expect(shouldOfferInteractiveSshSetup({ stdinIsTTY: false, skipEnv: "true" })).to.equal(false);
	});

	it("default env path suppresses prompts when HRIS_SKIP_DEV_SSH_SETUP=true", () => {
		process.env.HRIS_SKIP_DEV_SSH_SETUP = "true";
		try {
			expect(shouldOfferInteractiveSshSetup({ stdinIsTTY: true })).to.equal(false);
		} finally {
			delete process.env.HRIS_SKIP_DEV_SSH_SETUP;
		}
	});

	it("onboarding guidance names the setup script, the expected key, and the sign-in flow", () => {
		const lines = buildSshSetupGuidance({
			sshKeyPath: "C:\\Users\\dev\\.ssh\\node-health-appliance_ed25519",
			setupScriptPath: "C:\\repo\\scripts\\setup-dev-ssh-access.ps1",
		});
		const joined = lines.join("\n");
		expect(joined).to.contain("setup-dev-ssh-access.ps1");
		expect(joined).to.contain("node-health-appliance_ed25519");
		expect(joined).to.contain("1bis.solutions.tech");
		expect(joined).to.contain("npm run dev:local");
		expect(lines.every((line: string) => line.startsWith("[bnpi-db-access]"))).to.equal(true);
	});
});
