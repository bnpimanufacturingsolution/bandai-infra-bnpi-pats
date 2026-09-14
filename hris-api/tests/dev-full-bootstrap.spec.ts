import { expect } from "chai";
import fs from "fs";
import os from "os";
import path from "path";
import lib from "../scripts/dev-full-bootstrap-lib.cjs";

describe("dev-full bootstrap lib (one-command npm run dev)", () => {
	it("extracts the quick-tunnel URL from real cloudflared output shapes", () => {
		const boxed = [
			"+--------------------------------------------------------------------------------------------+",
			"|  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |",
			"|  https://tight-thunder-c664.trycloudflare.com                                              |",
			"+--------------------------------------------------------------------------------------------+",
		].join("\n");
		expect(lib.extractTryCloudflareUrl(boxed)).to.equal(
			"https://tight-thunder-c664.trycloudflare.com",
		);
		expect(lib.extractTryCloudflareUrl("no url here")).to.equal(null);
		expect(lib.extractTryCloudflareUrl("")).to.equal(null);
		expect(lib.extractTryCloudflareUrl(null)).to.equal(null);
	});

	it("respects the Cloudflare skip escape hatches", () => {
		expect(lib.shouldSkipCloudflare({})).to.equal(false);
		expect(lib.shouldSkipCloudflare({ HRIS_SKIP_CLOUDFLARE: "true" })).to.equal(true);
		expect(lib.shouldSkipCloudflare({ HRIS_SKIP_CLOUDFLARE_TUNNEL: "true" })).to.equal(true);
		expect(lib.shouldSkipCloudflare({ HRIS_DEV_TUNNEL: "off" })).to.equal(true);
		expect(lib.shouldSkipCloudflare({ HRIS_DEV_TUNNEL: "none" })).to.equal(true);
		expect(lib.shouldSkipCloudflare({ HRIS_DEV_TUNNEL: "quick" })).to.equal(false);
	});

	it("resolves cloudflared via override then candidates, refusing missing paths", () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dev-full-bootstrap-"));
		const fakeBin = path.join(tempDir, "cloudflared.exe");
		fs.writeFileSync(fakeBin, "stub");

		expect(lib.resolveCloudflaredBin({ pathOverride: fakeBin })).to.equal(fakeBin);
		expect(lib.resolveCloudflaredBin({ pathOverride: path.join(tempDir, "missing.exe") })).to.equal(
			null,
		);
		expect(lib.resolveCloudflaredBin({ candidates: [fakeBin] })).to.equal(fakeBin);
		expect(lib.resolveCloudflaredBin({ candidates: [path.join(tempDir, "missing.exe")] })).to.equal(
			null,
		);
		expect(lib.resolveCloudflaredBin({})).to.equal(null);

		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it("reports missing required env keys by name only, never values", () => {
		const result = lib.validateEnvPresence(
			{ PORT: "3001", JWT_SECRET: "super-secret-value" },
			["PORT", "JWT_SECRET", "DATABASE_URL"],
		);
		expect(result.ok).to.equal(false);
		expect(result.missing).to.deep.equal(["DATABASE_URL"]);

		const okResult = lib.validateEnvPresence(
			{ PORT: "3001", JWT_SECRET: "set" },
			["PORT", "JWT_SECRET"],
		);
		expect(okResult.ok).to.equal(true);
	});

	it("applies the /health readiness contract used by the watcher", () => {
		expect(lib.isApiHealthy(200, '{"status":"healthy"}')).to.equal(true);
		expect(lib.isApiHealthy(200, '{"status":"unhealthy"}')).to.equal(false);
		expect(lib.isApiHealthy(500, '{"status":"healthy"}')).to.equal(false);
		expect(lib.isApiHealthy(0, "")).to.equal(false);
	});

	it("treats the dependency tree as complete only when every required module file exists", () => {
		const fakeExists = (file: string) => !file.includes("argon2");
		expect(
			lib.isDependencyTreeComplete("C:\\api", ["tsx/dist/cli.mjs", "argon2"], fakeExists),
		).to.equal(false);
		expect(lib.isDependencyTreeComplete("C:\\api", ["tsx/dist/cli.mjs"], fakeExists)).to.equal(
			true,
		);
	});

	it("renders a banner with local, swagger, and tunnel URLs and no secrets", () => {
		const banner = lib.buildBanner({
			apiPort: 3001,
			tunnelUrl: "https://abc-def.trycloudflare.com",
			bannerLines: [" Status:", "   API        READY"],
		});
		expect(banner).to.contain("http://localhost:3001");
		expect(banner).to.contain("http://localhost:3001/api/swagger");
		expect(banner).to.contain("https://abc-def.trycloudflare.com");
		expect(banner.toLowerCase()).to.not.contain("password");
		expect(banner.toLowerCase()).to.not.contain("jwt");

		const skipped = lib.buildBanner({ apiPort: 3001, skipCloudflare: true });
		expect(skipped).to.contain("HRIS_SKIP_CLOUDFLARE=true");
		expect(skipped).to.not.contain("trycloudflare.com");
	});
});
