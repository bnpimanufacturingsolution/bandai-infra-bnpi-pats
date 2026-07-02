import { expect } from "chai";
import { readFileSync } from "fs";
import path from "path";
import YAML from "yaml";

describe("DEV Hikvision watcher runtime manifest", () => {
	it("uses the current Main Entrance Device ISAPI address and port", () => {
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
		const env = Object.fromEntries(
			(
				watcher?.spec?.template?.spec?.containers?.[0]?.env || []
			).map((entry: { name: string; value: string }) => [entry.name, entry.value]),
		);

		expect(env.HIKVISION_DEVICE_NAME).to.equal("Main Entrance Device");
		expect(env.HIKVISION_DEVICE_ADDRESS).to.equal("10.184.38.215");
		expect(env.HIKVISION_DEVICE_PORT).to.equal("80");
		expect(env.HIKVISION_DEVICE_PORT).to.not.equal("800");
		expect(env.HIKVISION_CALLBACK_URL).to.equal(
			"http://hris-api:3001/api/hikvision/callback",
		);
	});
});
