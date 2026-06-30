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
	});

	it("rejects unrelated origins", () => {
		expect(config.cors.isAllowedOrigin("http://evil.example")).to.equal(false);
	});
});
