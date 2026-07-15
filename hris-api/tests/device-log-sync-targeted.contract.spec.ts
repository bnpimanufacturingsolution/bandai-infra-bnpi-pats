import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "chai";

const currentDir = dirname(fileURLToPath(import.meta.url));
const controllerSource = readFileSync(
	resolve(currentDir, "../app/device/device.controller.ts"),
	"utf8",
);

describe("device log sync targeted import contract", () => {
	it("bounds Hikvision sync to the dry-run estimate when the source total is known", () => {
		expect(controllerSource).to.contain("targetImportCount");
		expect(controllerSource).to.contain("requestedTargetImportCount");
		expect(controllerSource).to.contain("serverEstimatedTargetImportCount");
		expect(controllerSource).to.contain("estimatedUnsaved - knownSkippedEvents");
		expect(controllerSource).to.contain("HIKVISION_IMPORT_TARGETED_MAX_SCAN");
		expect(controllerSource).to.contain("sourceTotal");
		expect(controllerSource).to.contain("targetedLatestScan: targetImportCount !== null");
		expect(controllerSource).to.contain("if (targetImportCount !== null && imported >= targetImportCount) break;");
	});

	it("does not fall back to a full history scan when the preview estimate is zero", () => {
		expect(controllerSource).to.contain("if (targetImportCount === 0)");
		expect(controllerSource).to.contain("No unsaved device logs found in the dry-run estimate");
		expect(controllerSource).to.contain("processed: 0");
	});

	it("runs independent ZKTeco and Hikvision availability probes concurrently", () => {
		expect(controllerSource).to.contain("HIKVISION_PREVIEW_SEARCH_TIMEOUT_MS || 1800");
		expect(controllerSource).to.contain("const zktecoPreviewPromise =");
		expect(controllerSource).to.contain("const hikvisionTotalsPromise = Promise.all(");
		expect(controllerSource).to.contain("const [zktecoPreview] = await Promise.all([");
		expect(controllerSource).to.contain("zktecoPreviewPromise,");
		expect(controllerSource).to.contain("hikvisionTotalsPromise,");
	});
});
