import { expect } from "chai";
import {
	buildHikvisionSourceChecks,
	buildHikvisionSyncLogsEventRows,
	countAlreadyInHrisByAction,
} from "../helper/sync-logs-event-rows.helper";

describe("sync-logs-event-rows.helper", () => {
	it("builds event-first Hikvision rows with dual source proof and filters", () => {
		const alreadyByAction = countAlreadyInHrisByAction([
			{ eventAction: "FINGERPRINT_ENROLLED", count: 3 },
			{ eventAction: "TAP", count: 23 },
			{ eventAction: "USER_CREATED", count: 0 },
		]);
		const operationDeviceByAction = new Map<string, number>([
			["FINGERPRINT_ENROLLED", 27],
			["USER_CREATED", 20],
			["FACE_ENROLLED", 12],
		]);
		const operationDeviceLabelsByAction = new Map<string, string[]>([
			["FINGERPRINT_ENROLLED", ["Add Fingerprint (By Employee ID)"]],
			["USER_CREATED", ["Add Person Information"]],
		]);

		const rows = buildHikvisionSyncLogsEventRows({
			deviceId: "dev-a",
			alreadyByAction,
			operationDeviceByAction,
			operationDeviceLabelsByAction,
			operationSourceOk: true,
			operationSourceTotal: 70,
			attendanceSourceOk: true,
			attendanceSourceTotal: 2108,
			hideSilentZeros: true,
		});

		const fingerprint = rows.find((row) => row.eventAction === "FINGERPRINT_ENROLLED");
		const userCreated = rows.find((row) => row.eventAction === "USER_CREATED");
		const tap = rows.find((row) => row.eventAction === "TAP");
		const unknownOp = rows.find((row) => row.eventAction === "UNKNOWN_OPERATION");

		expect(fingerprint?.willAdd).to.equal(24);
		expect(fingerprint?.alreadyInHris).to.equal(3);
		expect(fingerprint?.businessArea).to.equal("Enrollment");
		expect(fingerprint?.sourceProof).to.equal("Operation logs");
		expect(fingerprint?.filterAfterSync).to.equal("Enrollment > Fingerprint enrolled");
		expect(fingerprint?.whereToFind).to.equal("Device Events > Enrollment > Fingerprint enrolled");
		expect(fingerprint?.sourceDetail).to.contain("Device label: Add Fingerprint (By Employee ID)");
		expect(fingerprint?.status).to.equal("Ready");

		expect(userCreated?.willAdd).to.equal(20);
		expect(userCreated?.businessArea).to.equal("User Management");
		expect(userCreated?.filterAfterSync).to.equal("User Management > User created");
		expect(userCreated?.sourceDetail).to.contain("Device label: Add Person Information");

		expect(tap?.willAdd).to.equal(2085);
		expect(tap?.businessArea).to.equal("Attendance");
		expect(tap?.sourceProof).to.equal("Attendance/access events");
		expect(tap?.filterAfterSync).to.equal("Attendance > Tap");

		expect(unknownOp?.status).to.equal("Needs review");
		expect(unknownOp?.businessArea).to.equal("Needs review");
		expect(unknownOp?.eventLabel).to.equal("Unclassified device operation");
		expect(unknownOp?.reviewReason).to.equal("HRIS could not identify this device action yet.");
		expect(unknownOp?.filterAfterSync).to.equal("Needs review > Unclassified device operation");

		// Never invent lifecycle rows from DeviceUser inventory — only DeviceEvent already + log sources.
		expect(rows.every((row) => row.evidenceSource !== "DEVICE_USER_INVENTORY")).to.equal(true);
	});

	it("does not treat residual unknown volume as ready enroll truth", () => {
		const alreadyByAction = countAlreadyInHrisByAction([
			{ eventAction: "TAP", count: 23 },
		]);
		const rows = buildHikvisionSyncLogsEventRows({
			deviceId: "dev-a",
			alreadyByAction,
			operationSourceOk: true,
			operationSourceTotal: 20550,
			attendanceSourceOk: true,
			attendanceSourceTotal: 4752,
			hideSilentZeros: true,
		});
		const unknownOp = rows.find((row) => row.eventAction === "UNKNOWN_OPERATION");
		const fingerprint = rows.find((row) => row.eventAction === "FINGERPRINT_ENROLLED");
		const userCreated = rows.find((row) => row.eventAction === "USER_CREATED");
		expect(unknownOp?.willAdd).to.equal(20550);
		expect(unknownOp?.status).to.equal("Needs review");
		expect(unknownOp?.eventLabel).to.equal("Unclassified device operation");
		// Without logSearch classification sample, do not invent enroll will-add.
		expect(fingerprint?.willAdd ?? 0).to.equal(0);
		expect(userCreated?.willAdd ?? 0).to.equal(0);
	});

	it("uses classified logSearch estimates for fingerprint enroll and user created willAdd", () => {
		// Device maintain log shows alternating Add Fingerprint / Add Person (~half each).
		const alreadyByAction = countAlreadyInHrisByAction([
			{ eventAction: "FINGERPRINT_ENROLLED", count: 0 },
			{ eventAction: "USER_CREATED", count: 2 },
			{ eventAction: "TAP", count: 25 },
		]);
		const operationDeviceByAction = new Map<string, number>([
			["FINGERPRINT_ENROLLED", 10275],
			["USER_CREATED", 10275],
		]);
		const rows = buildHikvisionSyncLogsEventRows({
			deviceId: "test-a",
			alreadyByAction,
			operationDeviceByAction,
			operationSourceOk: true,
			operationSourceTotal: 20550,
			attendanceSourceOk: true,
			attendanceSourceTotal: 4781,
			hideSilentZeros: true,
		});
		const fingerprint = rows.find((row) => row.eventAction === "FINGERPRINT_ENROLLED");
		const userCreated = rows.find((row) => row.eventAction === "USER_CREATED");
		const unknownOp = rows.find((row) => row.eventAction === "UNKNOWN_OPERATION");
		const tap = rows.find((row) => row.eventAction === "TAP");

		expect(fingerprint?.willAdd).to.equal(10275);
		expect(fingerprint?.status).to.equal("Ready");
		expect(userCreated?.willAdd).to.equal(10273);
		expect(userCreated?.status).to.equal("Ready");
		// No residual dump when classified estimates cover the operation total.
		expect(unknownOp?.willAdd ?? 0).to.equal(0);
		expect(tap?.willAdd).to.equal(4756);
	});

	it("keeps Needs review out of Ready to add totals", () => {
		const alreadyByAction = countAlreadyInHrisByAction([]);
		const rows = buildHikvisionSyncLogsEventRows({
			deviceId: "test-a",
			alreadyByAction,
			operationDeviceByAction: new Map<string, number>([
				["FINGERPRINT_ENROLLED", 12],
				["UNKNOWN_OPERATION", 20],
			]),
			operationDeviceLabelsByAction: new Map<string, string[]>([
				["FINGERPRINT_ENROLLED", ["Add Fingerprint (By Card No.)"]],
				["UNKNOWN_OPERATION", ["Vendor-specific operation"]],
			]),
			operationSourceOk: true,
			operationSourceTotal: 32,
			attendanceSourceOk: false,
			attendanceSourceTotal: null,
			hideSilentZeros: true,
		});
		const readyToAdd = rows.reduce(
			(sum, row) =>
				sum +
				(row.status === "Ready" && typeof row.willAdd === "number" ? row.willAdd : 0),
			0,
		);
		const needsReview = rows.reduce(
			(sum, row) =>
				sum +
				(row.status === "Needs review" && typeof row.willAdd === "number"
					? row.willAdd
					: 0),
			0,
		);
		const fingerprint = rows.find((row) => row.eventAction === "FINGERPRINT_ENROLLED");
		expect(fingerprint?.businessArea).to.equal("Enrollment");
		expect(fingerprint?.eventLabel).to.equal("Fingerprint enrolled");
		expect(fingerprint?.sourceDetail).to.contain("Device label: Add Fingerprint (By Card No.)");
		expect(readyToAdd).to.equal(12);
		expect(needsReview).to.equal(20);
	});

	it("maps employee-id fingerprint labels to Enrollment > Fingerprint enrolled", () => {
		const rows = buildHikvisionSyncLogsEventRows({
			deviceId: "test-a",
			alreadyByAction: countAlreadyInHrisByAction([]),
			operationDeviceByAction: new Map<string, number>([["FINGERPRINT_ENROLLED", 7]]),
			operationDeviceLabelsByAction: new Map<string, string[]>([
				["FINGERPRINT_ENROLLED", ["Add Fingerprint (By Employee ID)"]],
			]),
			operationSourceOk: true,
			operationSourceTotal: 7,
			attendanceSourceOk: false,
			attendanceSourceTotal: null,
			hideSilentZeros: true,
		});
		const fingerprint = rows.find((row) => row.eventAction === "FINGERPRINT_ENROLLED");
		expect(fingerprint?.businessArea).to.equal("Enrollment");
		expect(fingerprint?.eventLabel).to.equal("Fingerprint enrolled");
		expect(fingerprint?.filterAfterSync).to.equal("Enrollment > Fingerprint enrolled");
		expect(fingerprint?.sourceDetail).to.contain("Device label: Add Fingerprint (By Employee ID)");
	});

	it("reports dual source checks for Sync logs summary", () => {
		const sources = buildHikvisionSourceChecks({
			operationOk: true,
			operationTotal: 70,
			attendanceOk: true,
			attendanceTotal: 2112,
		});
		expect(sources).to.have.length(2);
		expect(sources.filter((source) => source.ok)).to.have.length(2);
		expect(sources[0].readsFrom).to.equal("ContentMgmt/logSearch");
		expect(sources[1].readsFrom).to.equal("AccessControl/AcsEvent");
	});
});
