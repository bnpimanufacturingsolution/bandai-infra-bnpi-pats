import { expect } from "chai";
import { readFileSync } from "fs";
import path from "path";
import YAML from "yaml";

describe("DEV Hikvision watcher runtime manifest", () => {
	it("discovers configured Hikvision devices from HRIS DB truth", () => {
		const manifestPath = path.resolve(
			__dirname,
			"../../gitops/runtime-k8s/overlays/dev/runtime.yaml",
		);
		const documents = YAML.parseAllDocuments(readFileSync(manifestPath, "utf8"))
			.map((document) => document.toJSON())
			.filter(Boolean);
		const watcher = documents.find(
			(document: any) =>
				document?.kind === "Deployment" &&
				document?.metadata?.name === "hris-hikvision-watcher",
		);
		const container = watcher?.spec?.template?.spec?.containers?.[0];
		const args = String(container?.args?.[0] || "");
		const env = Object.fromEntries(
			(container?.env || []).map((entry: { name: string; value: string }) => [
				entry.name,
				entry.value,
			]),
		);

		expect(args).to.contain("--all-hikvision");
		expect(env).not.to.have.property("HIKVISION_DEVICE_NAME");
		expect(env).not.to.have.property("HIKVISION_DEVICE_ADDRESS");
		expect(env).not.to.have.property("HIKVISION_DEVICE_PORT");
		expect(env.HIKVISION_CALLBACK_URL).to.equal(
			"http://hris-api:3001/api/hikvision/callback",
		);
	});
});
