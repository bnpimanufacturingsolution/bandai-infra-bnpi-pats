import { expect } from "chai";
import {
	buildHikvisionManualTimePut,
	extractHikvisionTimeSnapshot,
	formatHikvisionManilaLocalTime,
	HIKVISION_MANILA_OFFSET,
	HIKVISION_MANILA_TIME_ZONE,
	HIKVISION_MANUAL_TIME_MODE,
	hikvisionClockSkewSeconds,
	hikvisionTimePutSucceeded,
} from "../helper/hikvision-device-time.helper";

describe("hikvision device time helper", () => {
	it("formats a Manila localTime with +08:00 and no Z", () => {
		const stamp = formatHikvisionManilaLocalTime(new Date("2026-08-19T06:30:15.000Z"));
		expect(stamp).to.equal("2026-08-19T14:30:15+08:00");
		expect(stamp.endsWith(HIKVISION_MANILA_OFFSET)).to.equal(true);
		expect(stamp.includes("Z")).to.equal(false);
	});

	it("reads Time JSON and XML timeMode/timeZone", () => {
		const json = extractHikvisionTimeSnapshot({
			Time: {
				timeMode: "manual",
				localTime: "2026-08-17T09:02:44+08:00",
				timeZone: "CST-8:00:00",
			},
		});
		expect(json).to.deep.equal({
			localTime: "2026-08-17T09:02:44+08:00",
			timeMode: "manual",
			timeZone: "CST-8:00:00",
		});

		const xml = extractHikvisionTimeSnapshot({
			raw: [
				"<Time>",
				"<timeMode>manual</timeMode>",
				"<localTime>2026-07-01T15:35:56+08:00</localTime>",
				"<timeZone>CST-8:00:00</timeZone>",
				"</Time>",
			].join(""),
		});
		expect(xml.localTime).to.equal("2026-07-01T15:35:56+08:00");
		expect(xml.timeMode).to.equal("manual");
		expect(xml.timeZone).to.equal("CST-8:00:00");
	});

	it("computes signed skew in seconds", () => {
		const reference = new Date("2026-08-17T01:02:13.000Z");
		expect(hikvisionClockSkewSeconds("2026-08-17T09:02:44+08:00", reference)).to.equal(31);
		expect(hikvisionClockSkewSeconds("2026-08-17T09:01:43+08:00", reference)).to.equal(-30);
		expect(hikvisionClockSkewSeconds(null, reference)).to.equal(null);
	});

	it("builds manual Manila PUT JSON and XML", () => {
		const { jsonBody, xmlBody } = buildHikvisionManualTimePut("2026-08-19T14:30:00+08:00");
		expect(jsonBody.Time).to.deep.equal({
			timeMode: HIKVISION_MANUAL_TIME_MODE,
			localTime: "2026-08-19T14:30:00+08:00",
			timeZone: HIKVISION_MANILA_TIME_ZONE,
		});
		expect(xmlBody).to.contain("<timeMode>manual</timeMode>");
		expect(xmlBody).to.contain("<localTime>2026-08-19T14:30:00+08:00</localTime>");
		expect(xmlBody).to.contain("<timeZone>CST-8:00:00</timeZone>");
	});

	it("treats ISAPI ResponseStatus 1 / ok as a successful PUT", () => {
		expect(hikvisionTimePutSucceeded({ ResponseStatus: { statusCode: 1, subStatusCode: "ok" } })).to.equal(
			true,
		);
		expect(hikvisionTimePutSucceeded({ statusCode: 4, statusString: "Invalid Operation" })).to.equal(
			false,
		);
	});
});
