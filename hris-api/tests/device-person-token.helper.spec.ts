import { expect } from "chai";
import { readFileSync } from "fs";
import { join } from "path";
import {
	extractPlainEmployeeNoFromUserInfoBody,
	formatHikvisionPlus08,
} from "../helper/device-person-token.helper";
import {
	classifyHikvisionLogSearchRow,
	isOpaqueHikvisionPersonToken,
} from "../helper/hikvision-event-contract.helper";

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

	it("operation-log resolve source uses proven device metaIds (clearUserInfo, not deleteUserInfo)", () => {
		// Live TEST A 2026-07-17: deleteUserInfo is ISAPI-invalid; clearUserInfo is the delete leaf.
		const source = readFileSync(
			join(__dirname, "../helper/device-person-token.helper.ts"),
			"utf8",
		);
		expect(source).to.include("log.hikvision.com/Information/clearUserInfo");
		expect(source).to.include("log.hikvision.com/Information/addUserInfo");
		expect(source).to.include("log.hikvision.com/Information/addFpByEmployeeNo");
		expect(source).to.not.match(/Information\/deleteUserInfo/);
		expect(source).to.not.match(/Information\/addFaceByEmployeeNo/);
		expect(source).to.not.match(/Information\/addCardInfo/);
		expect(classifyHikvisionLogSearchRow({ metaId: "log.hikvision.com/Information/clearUserInfo" }))
			.to.include({ eventAction: "USER_DELETED" });
		expect(classifyHikvisionLogSearchRow({ metaId: "log.hikvision.com/Information/addUserInfo" }))
			.to.include({ eventAction: "USER_CREATED" });
		expect(
			classifyHikvisionLogSearchRow({
				metaId: "log.hikvision.com/Information/addFpByEmployeeNo",
			}),
		).to.include({ eventAction: "FINGERPRINT_ENROLLED" });
	});
});
