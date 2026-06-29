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

	it("rejects unrelated origins", () => {
		expect(config.cors.isAllowedOrigin("http://evil.example")).to.equal(false);
	});
});
