import { expect } from "chai";
import fs from "fs";
import path from "path";

describe("hikvision watcher config-truth contract", () => {
	const repoRoot = path.resolve(__dirname, "..", "..");

	it("discovers configured Hikvision devices from HRIS DB instead of hardcoding a watcher IP", () => {
		const script = fs.readFileSync(
			path.join(repoRoot, "hris-api", "scripts", "audit-hikvision-device-events.ts"),
			"utf8",
		);
		const localServices = fs.readFileSync(
			path.join(repoRoot, "hris-api", "scripts", "ensure-local-dev-services.cjs"),
			"utf8",
		);
		const manifest = fs.readFileSync(
			path.join(repoRoot, "gitops", "runtime-k8s", "overlays", "dev", "runtime.yaml"),
			"utf8",
		);

		expect(script).to.contain('"all-hikvision"');
		expect(script).to.contain("No configured Hikvision devices found in HRIS device config.");
		expect(manifest).to.contain("--all-hikvision");
		expect(manifest).not.to.contain("HIKVISION_DEVICE_ADDRESS");
		expect(manifest).not.to.match(/10\.184\.38\.(96|215)/);
		expect(localServices).to.contain("Hikvision watcher is Linux/VM managed and is not started on this host.");
		expect(localServices).not.to.contain("watch:hikvision-device-events");
	});
});
