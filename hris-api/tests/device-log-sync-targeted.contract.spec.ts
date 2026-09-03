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
		// Scoped stops: attendance and operations each honor their targets.
		expect(controllerSource).to.contain(
			"attendanceImported >= Number(targetAttendanceCount)",
		);
		expect(controllerSource).to.contain(
			"operationsImported >= Number(targetOperationsCount)",
		);
	});

	it("does not fall back to a full history scan when the preview estimate is zero", () => {
		expect(controllerSource).to.contain("No unsaved device logs found in the dry-run estimate");
		expect(controllerSource).to.contain("processed: 0");
		expect(controllerSource).to.contain("noWorkRequested");
	});

	it("runs independent ZKTeco and Hikvision availability probes concurrently", () => {
		expect(controllerSource).to.contain("HIKVISION_PREVIEW_SEARCH_TIMEOUT_MS || 1800");
		expect(controllerSource).to.contain("const zktecoPreviewPromise =");
		expect(controllerSource).to.contain("const hikvisionTotalsPromise = quickSavedPreview");
		expect(controllerSource).to.contain(": withDeviceUserImportTimeout(");
		expect(controllerSource).to.contain("Promise.allSettled(");
		expect(controllerSource).to.contain("const [zktecoPreview] = await Promise.all([");
		expect(controllerSource).to.contain("zktecoPreviewPromise,");
		expect(controllerSource).to.contain("hikvisionTotalsPromise,");
	});

	it("keeps Sync logs preview fast when peers are unreachable", () => {
		// Modal open budget: no full user inventory, hard per-device race, ZK status only.
		expect(controllerSource).to.contain("HIKVISION_PREVIEW_DEVICE_BUDGET_MS");
		expect(controllerSource).to.contain('mode: "sync-preview"');
		expect(controllerSource).to.contain("includeDirectUserInventory: !syncPreviewMode");
		expect(controllerSource).to.contain("const includeLiveCustody =");
		expect(controllerSource).to.contain("const includeLiveSourceTotals =");
		expect(controllerSource).to.contain("includeLiveCustody &&");
		expect(controllerSource).to.contain("includeLiveSourceTotals &&");
		expect(controllerSource).to.contain(
			"zktecoDevices.length > 0 ? getZktecoBridgeStatus() : Promise.resolve(null)",
		);
		expect(controllerSource).to.contain(
			"Can't reach this device right now (preview timed out)",
		);
		// Must not use long full-history ZK preview for modal open.
		expect(controllerSource).not.to.match(
			/zktecoDevices\.length === 1\s*\?\s*getZktecoBridgePreview/,
		);
	});

	it("reads maintain Information logSearch for enroll/user truth not std-cgi noise", () => {
		// Device UI Log tab uses Information major: Add Fingerprint / Add Person Info.
		expect(controllerSource).to.contain('log.hikvision.com/Information');
		expect(controllerSource).to.contain("sampleClassify");
		expect(controllerSource).to.contain("Ready to add excludes Needs review rows.");
		expect(controllerSource).not.to.contain("extrapolatedByAction");
		expect(controllerSource).not.to.contain("Math.round((Number(sampleCount) / sampleSize) * total)");
	});

	it("syncs both attendance taps and user/enrollment logSearch not ACS-only", () => {
		// Interactive Sync must not be attendance-only when preview shows enroll/user willAdd.
		expect(controllerSource).to.contain("includeOperations");
		expect(controllerSource).to.contain("includeAttendance");
		expect(controllerSource).to.contain("targetOperationsCount");
		expect(controllerSource).to.contain("targetAttendanceCount");
		expect(controllerSource).to.contain("operationsImported");
		expect(controllerSource).to.contain("attendanceImported");
		expect(controllerSource).to.contain("persistNormalizedHikvisionEvidence");
		expect(controllerSource).to.contain(
			"Reading user & enrollment activity from classified device operation logs",
		);
		expect(controllerSource).to.contain("Reading attendance taps from the device access log");
		// Old 200-row cap made large residuals stall at 0/200.
		expect(controllerSource).to.contain("HIKVISION_IMPORT_TARGETED_MAX_SCAN || 5000");
		expect(controllerSource).to.contain("HIKVISION_IMPORT_MAX_OPERATION_EVENTS");
		expect(controllerSource).to.contain('timeWindow');
	});

	it("supports dry-run execution proof for the same Sync endpoint", () => {
		expect(controllerSource).to.contain('"POST /api/device/hikvision/sync"');
		expect(controllerSource).to.contain("Device log sync dry-run ready");
		expect(controllerSource).to.contain("(req.body as any)?.dryRun === true");
		expect(controllerSource).to.contain("(req.body as any)?.execute === false");
		expect(controllerSource).to.contain("sourceGroup");
		expect(controllerSource).to.contain("includeAttendanceSource: includeAttendance");
		expect(controllerSource).to.contain("includeOperationSource: includeOperations");
		expect(controllerSource).to.contain("startTime: windowScope.startTime");
		expect(controllerSource).to.contain("endTime: windowScope.endTime");
		expect(controllerSource).to.contain("AccessControl/AcsEvent");
		expect(controllerSource).to.contain("ContentMgmt/logSearch");
		expect(controllerSource).to.contain("Ready to add excludes Needs review rows.");
		expect(controllerSource).to.contain("Nothing was saved because dryRun=true.");
	});

	it("uses operation log source totals when scanning operation execution", () => {
		expect(controllerSource).to.contain("const operationSourceTotal = Number(params.operationSourceTotal || 0)");
		expect(controllerSource).to.contain(
			"process.env.HIKVISION_IMPORT_OPERATION_SCAN_CAP",
		);
		expect(controllerSource).to.contain(
			"(operationSourceTotal > 0 ? operationSourceTotal : 50000)",
		);
		expect(controllerSource).to.contain("Math.ceil(Number(operationTargetHint) * 1.5)");
		expect(controllerSource).to.contain("operationSourceTotal");
		expect(controllerSource).to.contain("attendanceSourceTotal");
	});

	it("persists device log import progress so runtime restarts do not lose queued jobs", () => {
		expect(controllerSource).to.contain("DEVICE_IMPORT_JOB_DIR");
		expect(controllerSource).to.contain("persistDeviceImportJob(nextJob)");
		expect(controllerSource).to.contain("readDeviceImportJob(jobId)");
		expect(controllerSource).to.contain("markDeviceImportJobStale(job)");
		expect(controllerSource).to.contain("Start Sync logs again; saved rows remain durable");
		expect(controllerSource).to.contain("persistDeviceImportJob(job)");
		expect(controllerSource).to.contain("updatedAt: new Date()");
	});

	it("skips already-saved ACS rows by serial across sources and reuses one attendance searchID", () => {
		expect(controllerSource).to.contain("const findExistingHikvisionDeviceEvent");
		expect(controllerSource).to.contain("if (!serialNo) return null");
		expect(controllerSource).not.to.contain(
			"if (!serialNo || !params.employeeNo) return null",
		);
		expect(controllerSource).to.contain("const attendanceSearchId = `${jobId}-att`");
		expect(controllerSource).not.to.contain("searchID: `${jobId}-att-${position}`");
	});

	it("retries transient Hikvision import page failures before failing the whole job", () => {
		expect(controllerSource).to.contain("fetchHikvisionImportPageWithRetry");
		expect(controllerSource).to.contain("HIKVISION_IMPORT_PAGE_RETRY_LIMIT || 4");
		expect(controllerSource).to.contain("HIKVISION_IMPORT_RETRY_MIN_PAGE_SIZE || 10");
		expect(controllerSource).to.contain("isTransientHikvisionImportError");
		expect(controllerSource).to.contain("status === 401");
		expect(controllerSource).to.contain("unauthorized|aborted|aborterror|timed out|timeout");
		expect(controllerSource).to.contain("body.AcsEventCond.maxResults = pageSize");
		expect(controllerSource).to.contain("Connection: \"close\"");
	});
});
