import { expect } from "chai";
import { readFileSync } from "fs";
import { join } from "path";
import {
	buildDeviceUserEmployeeNoCandidates,
	extractHikvisionCredentialSummary,
	normalizeHikvisionDeviceUser,
	resolveDeviceUserLinkDecision,
	summarizeDeviceUserStatuses,
	type DeviceUserCandidate,
} from "../helper/device-user-sync.helper";

const candidate = (employeeNo: string, status: DeviceUserCandidate["status"] = "UNMATCHED") => ({
	employeeNo,
	status,
});

describe("DeviceUser sync helper", () => {
	it("keeps DeviceUser as the direct device-to-employee identity model", () => {
		const schema = readFileSync(join(process.cwd(), "prisma/schema-postgres/device.prisma"), "utf8");
		expect(schema).to.include("model DeviceUser");
		expect(schema).to.include("employee       Employee?");
		expect(schema).to.include("employeeId     String?");
		expect(schema).to.include("vendorMetadata Json?");
		expect(schema).to.include("@@unique([organizationId, deviceId, vendorUserId])");
		expect(schema).to.include("deviceUserId   String?");
	});

	it("normalizes Hikvision UserInfo/Search records", () => {
		const normalized = normalizeHikvisionDeviceUser({
			employeeNo: "1360",
			name: "Rio",
			numOfFP: 2,
			userType: "normal",
			Valid: {
				enable: true,
				beginTime: "2026-01-01T00:00:00+08:00",
				endTime: "2030-01-01T00:00:00+08:00",
			},
			doorRight: "1",
			RightPlan: [{ doorNo: 1, planTemplateNo: "1" }],
		});
		expect(normalized?.vendorUserId).to.equal("1360");
		expect(normalized?.displayName).to.equal("Rio");
		expect(normalized?.status).to.equal("UNMATCHED");
		expect(normalized?.validFrom).to.be.instanceOf(Date);
		expect(normalized?.rawPayload?._hrisDeviceMetadata?.credentialSummary?.fingerprintCount).to.equal(2);
		expect(normalized?.vendorMetadata?.rawVendorPayload?.employeeNo).to.equal("1360");
		expect(normalized?.vendorMetadata?.credentialSummary?.fingerprintCount).to.equal(2);
	});

	it("extracts Hikvision credential counts for device-user metadata", () => {
		const summary = extractHikvisionCredentialSummary({
			numOfFP: 1,
			cardNo: "123456",
			Faces: [{ id: 1 }],
		});
		expect(summary).to.deep.equal({
			fingerprintCount: 1,
			cardCount: 1,
			faceCount: 1,
			hasFingerprint: true,
			hasCard: true,
			hasFace: true,
		});
	});

	it("auto-links exactly one safe deviceEmpId match", () => {
		const decision = resolveDeviceUserLinkDecision(candidate("1360"), [
			{ id: "emp-db-1", employeeId: "01360", deviceEmpId: "1360" },
		]);
		expect(decision).to.deep.equal({
			status: "ACTIVE",
			employeeId: "emp-db-1",
			matchCount: 1,
			matchReason: "deviceEmpId",
		});
	});

	it("auto-links device person 15 to Employee.deviceEmpId 15 (plain, not padded)", () => {
		// Operator truth: deviceEmpId IS "15" same as vendorUserId; employeeId may be "00015".
		const byDeviceEmpId = resolveDeviceUserLinkDecision(candidate("15"), [
			{ id: "emp-15", employeeId: "00015", deviceEmpId: "15" },
		]);
		expect(byDeviceEmpId).to.deep.equal({
			status: "ACTIVE",
			employeeId: "emp-15",
			matchCount: 1,
			matchReason: "deviceEmpId",
		});
		// Pad applies to Employee.employeeId org code, not deviceEmpId.
		const byEmployeeIdOnly = resolveDeviceUserLinkDecision(candidate("15"), [
			{ id: "emp-15b", employeeId: "00015", deviceEmpId: null },
		]);
		expect(byEmployeeIdOnly.status).to.equal("ACTIVE");
		expect(byEmployeeIdOnly.employeeId).to.equal("emp-15b");
		expect(byEmployeeIdOnly.matchReason).to.equal("employeeId");
		expect(buildDeviceUserEmployeeNoCandidates("15")).to.include.members(["15", "00015"]);
	});

	it("uses employeeId candidates when a direct deviceEmpId match is absent", () => {
		expect(buildDeviceUserEmployeeNoCandidates("1360")).to.include("01360");
		const decision = resolveDeviceUserLinkDecision(candidate("1360"), [
			{ id: "emp-db-2", employeeId: "01360", deviceEmpId: null },
		]);
		expect(decision.status).to.equal("ACTIVE");
		expect(decision.employeeId).to.equal("emp-db-2");
		expect(decision.matchReason).to.equal("employeeId");
	});

	it("links numeric vendor IDs to five-digit padded Employee.employeeId records", () => {
		expect(buildDeviceUserEmployeeNoCandidates("21")).to.include("00021");
		expect(buildDeviceUserEmployeeNoCandidates("989")).to.include("00989");

		const shortIdDecision = resolveDeviceUserLinkDecision(candidate("21"), [
			{ id: "emp-21", employeeId: "00021", deviceEmpId: null },
		]);
		expect(shortIdDecision.status).to.equal("ACTIVE");
		expect(shortIdDecision.employeeId).to.equal("emp-21");
		expect(shortIdDecision.matchReason).to.equal("employeeId");

		const threeDigitDecision = resolveDeviceUserLinkDecision(candidate("989"), [
			{ id: "emp-989", employeeId: "00989", deviceEmpId: null },
		]);
		expect(threeDigitDecision.status).to.equal("ACTIVE");
		expect(threeDigitDecision.employeeId).to.equal("emp-989");
		expect(threeDigitDecision.matchReason).to.equal("employeeId");
	});

	it("marks users without a safe employee match as unmatched", () => {
		const decision = resolveDeviceUserLinkDecision(candidate("9999"), [
			{ id: "emp-db-1", employeeId: "01360", deviceEmpId: "1360" },
		]);
		expect(decision).to.deep.equal({
			status: "UNMATCHED",
			employeeId: null,
			matchCount: 0,
			matchReason: "none",
		});
	});

	it("marks ambiguous matches as conflict", () => {
		const decision = resolveDeviceUserLinkDecision(candidate("1360"), [
			{ id: "emp-db-1", employeeId: "01360", deviceEmpId: "1360" },
			{ id: "emp-db-2", employeeId: "1360", deviceEmpId: "1360" },
		]);
		expect(decision.status).to.equal("CONFLICT");
		expect(decision.employeeId).to.equal(null);
		expect(decision.matchCount).to.equal(2);
	});

	it("does not link disabled device users", () => {
		const disabled = normalizeHikvisionDeviceUser({
			employeeNo: "2000",
			status: "DISABLED",
			Valid: { enable: false },
		});
		const decision = resolveDeviceUserLinkDecision(candidate("2000", disabled?.status), [
			{ id: "emp-db-1", employeeId: "02000", deviceEmpId: "2000" },
		]);
		expect(decision.status).to.equal("DISABLED");
		expect(decision.employeeId).to.equal(null);
	});

	it("summarizes matched, unmatched, conflict, and disabled rows", () => {
		const summary = summarizeDeviceUserStatuses([
			{ status: "ACTIVE", employeeId: "emp-db-1" },
			{ status: "UNMATCHED", employeeId: null },
			{ status: "CONFLICT", employeeId: null },
			{ status: "DISABLED", employeeId: null },
		]);
		expect(summary).to.deep.equal({
			total: 4,
			active: 1,
			matched: 1,
			unmatched: 1,
			conflict: 1,
			disabled: 1,
		});
	});
});
