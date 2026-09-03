import { describe, expect, it } from "vitest";
import { extractHikvisionPanelSelectStatus } from "./hikvision-panel-select-status";

describe("extractHikvisionPanelSelectStatus", () => {
	it("reads ISAPI AcsEventInfo attendanceStatus and label", () => {
		const status = extractHikvisionPanelSelectStatus({
			AcsEventInfo: {
				attendanceStatus: "checkOut",
				label: "Check Out",
			},
		});
		expect(status).to.deep.equal({
			code: "checkOut",
			label: "Check Out",
			present: true,
		});
	});

	it("reads attendanceStatus stored directly on rawEvidence", () => {
		const status = extractHikvisionPanelSelectStatus({
			rawEvidence: { attendanceStatus: "checkIn", label: "Check In" },
		});
		expect(status).to.include({ code: "checkIn", label: "Check In", present: true });
	});

	it("reads nested rawEvidence used on Sync import rows", () => {
		const status = extractHikvisionPanelSelectStatus({
			rawEvidence: {
				AcsEventInfo: {
					attendanceStatus: "breakIn",
					label: "Break In",
				},
			},
		});
		expect(status.code).to.equal("breakIn");
		expect(status.label).to.equal("Break In");
		expect(status.present).to.equal(true);
	});

	it("maps overtimeOut spelling variants and missing label", () => {
		expect(extractHikvisionPanelSelectStatus({ attendanceStatus: "overTimeOut" })).to.include({
			code: "overtimeOut",
			label: "Overtime Out",
			present: true,
		});
	});

	it("shows Unset when the device sent undefined", () => {
		const status = extractHikvisionPanelSelectStatus({
			AcsEventInfo: { attendanceStatus: "undefined" },
		});
		expect(status).to.deep.equal({
			code: "undefined",
			label: "Unset",
			present: true,
		});
	});

	it("shows Not sent on live SDK callback payloads with no status field", () => {
		const status = extractHikvisionPanelSelectStatus({
			source: "EN_HCNETSDK_ALARM",
			major: 5,
			minor: 38,
			employeeNo: "7",
			currentVerifyMode: "",
		});
		expect(status).to.deep.equal({
			code: null,
			label: "Not sent",
			present: false,
		});
	});

	it("reads a live AcsEvent preview object", () => {
		const status = extractHikvisionPanelSelectStatus(undefined, {
			attendanceStatus: "checkIn",
			label: "Check In",
			currentVerifyMode: "faceOrFpOrCardOrPw",
		});
		expect(status).to.include({ code: "checkIn", label: "Check In", present: true });
	});
});
