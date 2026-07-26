import { expect } from "chai";
import { readFileSync } from "fs";
import { join } from "path";

describe("Hikvision FDLib delivery route contract", () => {
	it("mounts the token-and-target authenticated route before request logging", () => {
		const source = readFileSync(join(process.cwd(), "index.ts"), "utf8");
		const route = source.indexOf("/hikvision/fdlib-face-delivery/:token");
		const debugLogging = source.indexOf("app.use(apiDebugLoggingMiddleware)");
		expect(route).to.be.greaterThan(-1);
		expect(debugLogging).to.be.greaterThan(route);
		expect(source).to.include("hikvisionFdlibFaceDeliveryRegistry.consume");
		expect(source).to.include("requesterAddress: req.ip || req.socket.remoteAddress");
		expect(source).to.include('"Cache-Control", "no-store, no-cache, must-revalidate, private"');
		expect(source).to.include("res.status(404).end()");
	});
});
