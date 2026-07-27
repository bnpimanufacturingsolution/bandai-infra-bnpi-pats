import { expect } from "chai";
import { config } from "../config/config";

describe("CORS origin contract", () => {
	it("allows the Vite dev origins used by local browser testing", () => {
		expect(config.cors.isAllowedOrigin("http://localhost:5175")).to.equal(true);
		expect(config.cors.isAllowedOrigin("http://127.0.0.1:5175")).to.equal(true);
	});

	it("keeps packaged local app origins allowed", () => {
		expect(config.cors.isAllowedOrigin("http://127.0.0.1:3100")).to.equal(true);
	});

	it("allows the public bnpi-hris.tech app origins used by Cloudflare environments", () => {
		expect(config.cors.isAllowedOrigin("https://bnpi-hris.tech")).to.equal(true);
		expect(config.cors.isAllowedOrigin("https://www.bnpi-hris.tech")).to.equal(true);
		expect(config.cors.isAllowedOrigin("https://app.bnpi-hris.tech")).to.equal(true);
		expect(config.cors.isAllowedOrigin("https://dev.bnpi-hris.tech")).to.equal(true);
		expect(config.cors.isAllowedOrigin("https://uat.bnpi-hris.tech")).to.equal(true);
		expect(config.cors.isAllowedOrigin("https://emp.bnpi-hris.tech")).to.equal(true);
		expect(config.cors.isAllowedOrigin("https://dev-emp.bnpi-hris.tech")).to.equal(true);
		expect(config.cors.isAllowedOrigin("https://uat-emp.bnpi-hris.tech")).to.equal(true);
	});

	it("rejects unrelated origins", () => {
		expect(config.cors.isAllowedOrigin("http://evil.example")).to.equal(false);
	});
});

describe("API activity logging config contract", () => {
	it("keeps apiActivityLogging so middleware does not 500 every /api call", () => {
		// Regression: monorepo snapshot drop removed this object; login failed with
		// TypeError: Cannot read properties of undefined (reading 'enabled').
		expect(config.apiActivityLogging).to.be.an("object");
		expect(config.apiActivityLogging).to.have.property("enabled");
		expect(config.apiActivityLogging).to.have.property("includeReads");
		expect(config.apiActivityLogging).to.have.property("sampleRate");
		expect(config.apiActivityLogging).to.have.property("excludedPaths");
		expect(config.apiActivityLogging).to.have.property("bodyMode");
		expect(config.apiActivityLogging.excludedPaths).to.be.an("array");
	});
});
