import { expect } from "chai";
import { extractHikvisionPanelSelectStatus } from "../helper/hikvision-panel-select-status.helper";

describe("hikvision panel select status helper", () => {
	it("reads ISAPI AcsEventInfo attendanceStatus from the biometric event record", () => {
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

	it("reads rawEvidence nests used by Sync import", () => {
		expect(
			extractHikvisionPanelSelectStatus({
				rawEvidence: { AcsEventInfo: { attendanceStatus: "breakOut", label: "Break Out" } },
			}),
		).to.include({ code: "breakOut", label: "Break Out", present: true });
	});

	it("does not invent Check In on a live SDK callback body", () => {
		const status = extractHikvisionPanelSelectStatus({
			source: "EN_HCNETSDK_ALARM",
			major: 5,
			minor: 38,
			employeeNo: "7",
			verifyMode: "",
		});
		expect(status).to.deep.equal({
			code: null,
			label: "Not sent",
			present: false,
		});
	});

	it("does not treat currentVerifyMode as Select Status", () => {
		const status = extractHikvisionPanelSelectStatus({
			currentVerifyMode: "faceOrFpOrCardOrPw",
			AcsEventInfo: { currentVerifyMode: "faceOrFpOrCardOrPw" },
		});
		expect(status.present).to.equal(false);
		expect(status.label).to.equal("Not sent");
	});
});
