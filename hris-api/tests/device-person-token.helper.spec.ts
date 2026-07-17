import { expect } from "chai";
import { readFileSync } from "fs";
import { join } from "path";
import {
	buildEmployeeDisplayName,
	correlateOpaqueToPlainByInventoryDelta,
	extractOpaqueEmployeeNoFromLogEvidence,
	extractPlainEmployeeNoFromUserInfoBody,
	extractPlainUserFromUserInfoRecord,
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

	it("builds employee display name from personalInfo for linked device persons", () => {
		expect(
			buildEmployeeDisplayName({
				person: { personalInfo: { firstName: "Juan", middleName: "D", lastName: "Cruz" } },
			}),
		).to.equal("Juan D Cruz");
		expect(buildEmployeeDisplayName({ person: { personalInfo: {} } })).to.equal(null);
		expect(buildEmployeeDisplayName(null)).to.equal(null);
	});

	it("parses opaque from proven logSearch LogAddInfo shape (panel enroll)", () => {
		// Real TEST A panel create/FP 2026-07-17: plain typed "14" → opaque in log only.
		const opaque = "EmfPTja5gq/kmy/CI1wDHA==";
		expect(
			extractOpaqueEmployeeNoFromLogEvidence({
				employeeNo: opaque,
				information: JSON.stringify({
					LogAddInfo: { EmployeeNo: opaque, ErrorMsg: "OK" },
				}),
			}),
		).to.equal(opaque);
		expect(
			extractOpaqueEmployeeNoFromLogEvidence({
				information: `{\n\t"LogAddInfo":\t{\n\t\t"EmployeeNo":\t"${opaque}",\n\t\t"FingerId":\t1,\n\t\t"ErrorMsg":\t"OK"\n\t}\n}`,
			}),
		).to.equal(opaque);
		expect(extractOpaqueEmployeeNoFromLogEvidence({ employeeNo: "14" })).to.equal(null);
	});

	it("parses plain UserInfo/Search person shape", () => {
		expect(
			extractPlainUserFromUserInfoRecord({
				employeeNo: "14",
				name: "Panel User",
				numOfFP: 1,
				userType: "normal",
			}),
		).to.deep.equal({ employeeNo: "14", displayName: "Panel User", numOfFP: 1 });
		expect(
			extractPlainUserFromUserInfoRecord({
				employeeNo: "EmfPTja5gq/kmy/CI1wDHA==",
				name: "x",
			}),
		).to.equal(null);
	});

	it("correlates single new plain device user to single unmapped opaque (panel 14 case)", () => {
		const hit = correlateOpaqueToPlainByInventoryDelta({
			devicePlains: [
				{ employeeNo: "1", displayName: "ernest" },
				{ employeeNo: "14", displayName: "Panel User" },
			],
			knownPlains: ["1", "01515"],
			unmappedOpaques: ["EmfPTja5gq/kmy/CI1wDHA=="],
		});
		expect(hit).to.deep.equal({
			opaqueToken: "EmfPTja5gq/kmy/CI1wDHA==",
			employeeNo: "14",
			displayName: "Panel User",
		});
		expect(
			correlateOpaqueToPlainByInventoryDelta({
				devicePlains: [
					{ employeeNo: "14", displayName: "A" },
					{ employeeNo: "15", displayName: "B" },
				],
				knownPlains: [],
				unmappedOpaques: ["EmfPTja5gq/kmy/CI1wDHA=="],
			}),
		).to.equal(null);
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
