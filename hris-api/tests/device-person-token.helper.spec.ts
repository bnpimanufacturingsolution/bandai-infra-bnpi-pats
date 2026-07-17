import { expect } from "chai";
import {
	extractPlainEmployeeNoFromUserInfoBody,
	formatHikvisionPlus08,
} from "../helper/device-person-token.helper";
import { isOpaqueHikvisionPersonToken } from "../helper/hikvision-event-contract.helper";

describe("device-person-token helper", () => {
	it("extracts plain employeeNo from UserInfo record body", () => {
		expect(
			extractPlainEmployeeNoFromUserInfoBody({
				UserInfo: { employeeNo: "ptmap001", name: "Probe" },
			}),
		).to.equal("ptmap001");
		expect(
			extractPlainEmployeeNoFromUserInfoBody({
				UserInfo: { employeeNo: "ckC6ilTx9CdZvFg/hOy23Q==" },
			}),
		).to.equal(null);
	});

	it("formats +08:00 timestamps for logSearch windows", () => {
		const formatted = formatHikvisionPlus08(Date.UTC(2026, 6, 17, 3, 53, 6));
		expect(formatted).to.match(/^2026-07-17T11:53:06\+08:00$/);
	});

	it("classifies opaque log tokens the same way as contract helper", () => {
		expect(isOpaqueHikvisionPersonToken("ckC6ilTx9CdZvFg/hOy23Q==")).to.equal(true);
		expect(isOpaqueHikvisionPersonToken("1")).to.equal(false);
		expect(isOpaqueHikvisionPersonToken("ptmap001")).to.equal(false);
	});
});
