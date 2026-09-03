import { expect } from "chai";
import {
	buildAcsSerialLookupWindow,
	extractAcsSerialFromPayload,
	findExistingDeviceEventByAcsSerial,
} from "../helper/hikvision-device-event-serial-dedupe.helper";

describe("hikvision device event serial dedupe helper", () => {
	it("extracts ACS serial from the four known payload nests", () => {
		expect(extractAcsSerialFromPayload({ serialNo: "5560" })).to.equal("5560");
		expect(extractAcsSerialFromPayload({ AcsEventInfo: { serialNo: 9619 } })).to.equal(
			"9619",
		);
		expect(
			extractAcsSerialFromPayload({
				EventNotificationAlert: { AccessControllerEvent: { serialNo: " 997 " } },
			}),
		).to.equal("997");
		expect(
			extractAcsSerialFromPayload({
				AccessControllerEvent: { serialNo: 1201 },
			}),
		).to.equal("1201");
	});

	it("prefers payload.serialNo over nested serials and treats blank as empty", () => {
		expect(
			extractAcsSerialFromPayload({
				serialNo: "top",
				AcsEventInfo: { serialNo: "nested" },
			}),
		).to.equal("top");
		expect(extractAcsSerialFromPayload({})).to.equal("");
		expect(extractAcsSerialFromPayload(null)).to.equal("");
		expect(extractAcsSerialFromPayload({ serialNo: "   " })).to.equal("");
	});

	it("returns null without querying when serialNo is empty", async () => {
		let called = false;
		const prisma = {
			deviceEvent: {
				findMany: async () => {
					called = true;
					return [];
				},
			},
		};

		const found = await findExistingDeviceEventByAcsSerial(prisma, {
			organizationId: "org-1",
			deviceId: "device-1",
			serialNo: "  ",
			eventTime: new Date("2026-08-17T02:00:00.000Z"),
		});

		expect(found).to.equal(null);
		expect(called).to.equal(false);
	});

	it("looks up same device + ±1 day window without source or employeeNo and prefers oldest receivedAt", async () => {
		const eventTime = new Date("2026-08-17T08:11:00.000Z");
		const window = buildAcsSerialLookupWindow(eventTime);
		let receivedArgs: any = null;
		const prisma = {
			deviceEvent: {
				findMany: async (args: any) => {
					receivedArgs = args;
					return [
						{
							id: "older-empty",
							employeeNo: null,
							source: "EN_HCNETSDK_ALARM",
							receivedAt: new Date("2026-08-17T08:11:00.000Z"),
							payload: { serialNo: "5560" },
						},
						{
							id: "newer-filled",
							employeeNo: "1838",
							source: "HIKVISION_CALLBACK",
							receivedAt: new Date("2026-08-17T08:11:02.000Z"),
							payload: { serialNo: "5560", employeeNo: "1838" },
						},
						{
							id: "other-serial",
							employeeNo: "9",
							receivedAt: new Date("2026-08-17T08:10:00.000Z"),
							payload: { AcsEventInfo: { serialNo: "9999" } },
						},
					];
				},
			},
		};

		const found = await findExistingDeviceEventByAcsSerial(prisma, {
			organizationId: "org-1",
			deviceId: "device-d",
			serialNo: "5560",
			eventTime,
		});

		expect(receivedArgs.where).to.deep.equal({
			organizationId: "org-1",
			deviceId: "device-d",
			eventTime: { gte: window.start, lte: window.end },
		});
		expect(receivedArgs.where).to.not.have.property("source");
		expect(receivedArgs.where).to.not.have.property("employeeNo");
		expect(receivedArgs.orderBy).to.deep.equal({ receivedAt: "asc" });
		expect(found?.id).to.equal("older-empty");
	});
});
