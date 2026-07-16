import { expect } from "chai";
import {
	buildHikvisionDeviceEventDedupeKey,
	buildHikvisionLogSearchXml,
	classifyHikvisionLogSearchRow,
	DEFAULT_HIKVISION_MIN_PUNCH_PAIR_GAP_MINUTES,
	extractHikvisionSystemLocalTime,
	extractHikvisionEventData,
	getHikvisionObservedDeviceIp,
	getHikvisionClockSkewSecondsFromSystemTime,
	getHikvisionObservedClockSkewSeconds,
	hikvisionEventMatchesConfiguredDevice,
	isHikvisionBiometricVerificationEvent,
	isHikvisionAttendancePunchEvent,
	normalizeHikvisionAcsEventListTimes,
	normalizeHikvisionAddress,
	normalizeHikvisionDeviceEventSource,
	normalizeHikvisionFutureSkewedEventTime,
	normalizeHikvisionLogSearchRow,
	normalizeHikvisionSdkCallbackEvidence,
	normalizeHikvisionStateTransitionEvidence,
	paginateHikvisionLogSearch,
	parseHikvisionBusinessDateBound,
	parseHikvisionBodyPayload,
	parseHikvisionEventTime,
	selectHikvisionPunchPair,
	parseHikvisionLogSearchResponse,
} from "../helper/hikvision-event-contract.helper";

describe("hikvision event contract helper", () => {
	it("normalizes live ACS event fields used by the device events page", () => {
		const event = extractHikvisionEventData({
			deviceId: "device-1",
			AcsEventInfo: {
				major: 5,
				minor: 75,
				time: "2026-06-05T08:01:02+08:00",
				employeeNoString: "EMP-001",
				userType: "normal",
				currentVerifyMode: "card",
				doorNo: 1,
				serialNo: 987,
			},
		});

		expect(event).to.deep.equal({
			deviceId: "device-1",
			source: undefined,
			eventType: "normal",
			major: 5,
			minor: 75,
			actionCode: undefined,
			time: "2026-06-05T08:01:02+08:00",
			employeeNo: "EMP-001",
			name: undefined,
			deviceIP: undefined,
			doorNo: 1,
			verifyMode: "card",
			serialNo: 987,
			deviceTime: undefined,
			timeAdjusted: false,
			deviceClockSkewSeconds: 0,
		});
	});

	it("keeps EN HCNETSDK alarm source distinct from normal callback source", () => {
		expect(normalizeHikvisionDeviceEventSource("EN_HCNETSDK_ALARM")).to.equal(
			"EN_HCNETSDK_ALARM",
		);
		expect(normalizeHikvisionDeviceEventSource("anything_else")).to.equal(
			"HIKVISION_CALLBACK",
		);
	});

	it("requires Hikvision observed IP to match the configured device address when present", () => {
		expect(normalizeHikvisionAddress("http://10.184.37.139:80/path")).to.equal(
			"10.184.37.139",
		);
		expect(
			hikvisionEventMatchesConfiguredDevice(
				{ deviceIP: "10.184.37.139" },
				{ address: "10.184.37.139" },
			),
		).to.equal(true);
		expect(
			hikvisionEventMatchesConfiguredDevice(
				{ deviceIP: "10.184.37.139" },
				{ address: "192.168.1.40" },
			),
		).to.equal(false);
		expect(
			hikvisionEventMatchesConfiguredDevice(
				{ deviceIP: "10.184.37.250" },
				{
					address: "192.168.1.40",
					config: { hikvisionSdkRuntimeAddress: "10.184.37.250" },
				},
			),
		).to.equal(true);
		expect(
			hikvisionEventMatchesConfiguredDevice({ deviceIP: undefined }, { address: "192.168.1.40" }),
		).to.equal(true);
	});

	it("extracts observed Hikvision alarm IP from raw alarm payloads", () => {
		expect(
			getHikvisionObservedDeviceIp({
				rawAlarm: { deviceIp: "10.184.37.139" },
				socketCandidate: { deviceIP: "192.168.1.40" },
			}),
		).to.equal("10.184.37.139");
	});

	it("uses serial number in dedupe keys so same-second device events do not collapse", () => {
		const base = {
			deviceId: "device-1",
			source: "HIKVISION_CALLBACK",
			eventTime: parseHikvisionEventTime("2026-06-05T08:01:02+08:00"),
			employeeNo: "EMP-001",
		};

		const first = buildHikvisionDeviceEventDedupeKey({
			...base,
			event: { employeeNo: "EMP-001", serialNo: 1 },
		});
		const second = buildHikvisionDeviceEventDedupeKey({
			...base,
			event: { employeeNo: "EMP-001", serialNo: 2 },
		});

		expect(first).to.not.equal(second);
	});

	it("treats device timestamps without timezone as Philippine local time", () => {
		const parsed = parseHikvisionEventTime("2026-06-05T14:28:51");

		expect(parsed.toISOString()).to.equal("2026-06-05T06:28:51.000Z");
	});

	it("builds saved-event date filters from Philippine business-day bounds", () => {
		expect(parseHikvisionBusinessDateBound("2026-06-05")?.toISOString()).to.equal(
			"2026-06-04T16:00:00.000Z",
		);
		expect(parseHikvisionBusinessDateBound("2026-06-05", true)?.toISOString()).to.equal(
			"2026-06-05T15:59:59.999Z",
		);
	});

	it("preserves live ACS vendor timestamps by default", () => {
		const adjusted = normalizeHikvisionAcsEventListTimes(
			[
				{ time: "2026-06-05T14:42:20+08:00", serialNo: 954 },
				{ time: "2026-06-05T14:28:49+08:00", serialNo: 950 },
			],
			new Date("2026-06-05T06:40:20.000Z"),
		);

		expect(adjusted[0].time).to.equal("2026-06-05T14:42:20+08:00");
		expect(adjusted[0].deviceTime).to.equal(undefined);
		expect(adjusted[0].timeAdjusted).to.equal(undefined);
		expect(adjusted[1].time).to.equal("2026-06-05T14:28:49+08:00");
	});

	it("adjusts live ACS lists only when clock-skew correction is explicitly enabled", () => {
		const adjusted = normalizeHikvisionAcsEventListTimes(
			[
				{ time: "2026-06-05T14:42:20+08:00", serialNo: 954 },
				{ time: "2026-06-05T14:28:49+08:00", serialNo: 950 },
			],
			new Date("2026-06-05T06:40:20.000Z"),
			undefined,
			{ allowAutoAdjust: true },
		);

		expect(adjusted[0].time).to.equal("2026-06-05T14:40:20+08:00");
		expect(adjusted[0].deviceTime).to.equal("2026-06-05T14:42:20+08:00");
		expect(adjusted[0].timeAdjusted).to.equal(true);
		expect(adjusted[1].time).to.equal("2026-06-05T14:26:49+08:00");
	});

	it("does not reuse stored device clock skew after the row is no longer future-skewed", () => {
		const adjusted = normalizeHikvisionAcsEventListTimes(
			[{ time: "2026-06-05T14:42:20+08:00", serialNo: 954 }],
			new Date("2026-06-05T06:49:20.000Z"),
			120,
			{ allowStoredSkew: true, allowAutoAdjust: true },
		);

		expect(getHikvisionObservedClockSkewSeconds(adjusted)).to.equal(0);
		expect(adjusted[0].time).to.equal("2026-06-05T14:42:20+08:00");
		expect(adjusted[0].deviceTime).to.equal(undefined);
	});

	it("does not apply stale stored clock skew when the device time is already current", () => {
		const normalized = normalizeHikvisionFutureSkewedEventTime(
			"2026-06-08T23:38:22+08:00",
			new Date("2026-06-08T15:38:27.860Z"),
			180,
			{ allowStoredSkew: true, allowAutoAdjust: true },
		);
		const list = normalizeHikvisionAcsEventListTimes(
			[{ time: "2026-06-08T23:38:22+08:00", serialNo: 662 }],
			new Date("2026-06-08T15:38:27.860Z"),
			180,
			{ allowStoredSkew: true, allowAutoAdjust: true },
		);

		expect(normalized.adjusted).to.equal(false);
		expect(normalized.eventTime.toISOString()).to.equal("2026-06-08T15:38:22.000Z");
		expect(list[0].time).to.equal("2026-06-08T23:38:22+08:00");
		expect(list[0].timeAdjusted).to.equal(undefined);
	});

	it("reads Hikvision XML system time and computes device clock skew", () => {
		const payload = {
			raw: `<Time><localTime>2026-06-05T15:01:51+08:00</localTime></Time>`,
		};

		expect(extractHikvisionSystemLocalTime(payload)).to.equal(
			"2026-06-05T15:01:51+08:00",
		);
		expect(
			getHikvisionClockSkewSecondsFromSystemTime(
				payload,
				new Date("2026-06-05T06:57:24.000Z"),
			),
		).to.equal(300);
	});

	it("parses XML callback bodies with ACS field aliases", () => {
		const payload = parseHikvisionBodyPayload(`
			<EventNotificationAlert>
				<employeeNoString>EMP-002</employeeNoString>
				<currentVerifyMode>face</currentVerifyMode>
				<serialNo>12345</serialNo>
			</EventNotificationAlert>
		`);

		expect(payload.employeeNoString).to.equal("EMP-002");
		expect(payload.currentVerifyMode).to.equal("face");
		expect(payload.serialNo).to.equal("12345");
	});

	it("parses Hikvision HTTP host XML date and IP aliases for device matching", () => {
		const payload = parseHikvisionBodyPayload(`
			<EventNotificationAlert version="2.0">
				<ipAddress>10.184.37.139</ipAddress>
				<dateTime>2026-07-08T10:04:12+08:00</dateTime>
				<AccessControllerEvent>
					<major>5</major>
					<minor>38</minor>
					<employeeNoString>1</employeeNoString>
					<currentVerifyMode>faceOrFpOrCardOrPw</currentVerifyMode>
					<serialNo>997</serialNo>
				</AccessControllerEvent>
			</EventNotificationAlert>
		`);
		const event = extractHikvisionEventData(payload);

		expect(event.deviceIP).to.equal("10.184.37.139");
		expect(event.time).to.equal("2026-07-08T10:04:12+08:00");
		expect(event.employeeNo).to.equal("1");
		expect(event.major).to.equal("5");
		expect(event.minor).to.equal("38");
		expect(isHikvisionAttendancePunchEvent(event)).to.equal(true);
	});

	it("does not treat fingerprint enrollment as an attendance punch", () => {
		expect(
			isHikvisionAttendancePunchEvent({
				major: 3,
				minor: 1055,
				actionCode: "MINOR_ADD_FINGER_BY_EMPLOYEE_NO",
			}),
		).to.equal(false);
		expect(
			isHikvisionAttendancePunchEvent({
				major: 5,
				minor: 38,
				actionCode: "MINOR_FINGERPRINT_COMPARE_PASS",
			}),
		).to.equal(true);
		expect(
			isHikvisionAttendancePunchEvent({
				major: 5,
				minor: 75,
			}),
		).to.equal(true);
		expect(
			isHikvisionAttendancePunchEvent({
				major: 5,
				employeeNo: "1",
				verifyMode: "faceOrFpOrCardOrPw",
			}),
		).to.equal(true);
		expect(
			isHikvisionAttendancePunchEvent({
				actionCode: "MINOR_FACE_COMPARE_PASS",
			}),
		).to.equal(true);
	});

	it("keeps facial verification attempts visible without turning missing employee numbers into attendance", () => {
		const facialAttempt = {
			major: 5,
			minor: 39,
			verifyMode: "faceOrFpOrCardOrPw",
		};

		expect(isHikvisionBiometricVerificationEvent(facialAttempt)).to.equal(true);
		expect(isHikvisionAttendancePunchEvent(facialAttempt)).to.equal(false);
	});

	it("does not shift callback event time from stale stored skew unless explicitly enabled", () => {
		const normalized = normalizeHikvisionFutureSkewedEventTime(
			"2026-07-01T17:42:00+08:00",
			new Date("2026-07-01T09:43:00.000Z"),
			480,
		);

		expect(normalized.adjusted).to.equal(false);
		expect(normalized.eventTime.toISOString()).to.equal("2026-07-01T09:42:00.000Z");
	});

	it("selects earliest biometric punch as time in and latest as time out", () => {
		const pair = selectHikvisionPunchPair([
			{
				eventTime: new Date("2026-06-08T15:02:11.000Z"),
				payload: { major: 5, minor: 38, actionCode: "MINOR_FINGERPRINT_COMPARE_PASS" },
			},
			{
				eventTime: new Date("2026-06-08T14:54:20.000Z"),
				payload: { major: 5, minor: 38, actionCode: "MINOR_FINGERPRINT_COMPARE_PASS" },
			},
			{
				eventTime: new Date("2026-06-08T14:00:00.000Z"),
				payload: { major: 3, minor: 1055, actionCode: "MINOR_ADD_FINGER_BY_EMPLOYEE_NO" },
			},
		]);

		expect(pair.count).to.equal(2);
		expect(pair.timeIn?.toISOString()).to.equal("2026-06-08T14:54:20.000Z");
		expect(pair.timeOut?.toISOString()).to.equal("2026-06-08T15:02:11.000Z");
	});

	it("does not create a clock out from one accepted punch", () => {
		const pair = selectHikvisionPunchPair([
			{
				eventTime: new Date("2026-06-08T15:41:29.000Z"),
				payload: { major: 5, minor: 38, actionCode: "MINOR_FINGERPRINT_COMPARE_PASS" },
			},
		]);

		expect(pair.count).to.equal(1);
		expect(pair.timeIn?.toISOString()).to.equal("2026-06-08T15:41:29.000Z");
		expect(pair.timeOut).to.equal(null);
	});

	it("uses no default minute gap for accepted punch pairing", () => {
		expect(DEFAULT_HIKVISION_MIN_PUNCH_PAIR_GAP_MINUTES).to.equal(0);

		const pair = selectHikvisionPunchPair([
			{
				eventTime: new Date("2026-06-08T15:41:29.000Z"),
				payload: { major: 5, minor: 38, actionCode: "MINOR_FINGERPRINT_COMPARE_PASS" },
			},
			{
				eventTime: new Date("2026-06-08T15:41:39.000Z"),
				payload: { major: 5, minor: 38, actionCode: "MINOR_FINGERPRINT_COMPARE_PASS" },
			},
		]);

		expect(pair.count).to.equal(2);
		expect(pair.timeIn?.toISOString()).to.equal("2026-06-08T15:41:29.000Z");
		expect(pair.timeOut?.toISOString()).to.equal("2026-06-08T15:41:39.000Z");
	});

	it("allows a later accepted punch to become clock out", () => {
		const pair = selectHikvisionPunchPair([
			{
				eventTime: new Date("2026-06-08T15:41:29.000Z"),
				payload: { major: 5, minor: 38, actionCode: "MINOR_FINGERPRINT_COMPARE_PASS" },
			},
			{
				eventTime: new Date("2026-06-08T15:44:10.000Z"),
				payload: { major: 5, minor: 38, actionCode: "MINOR_FINGERPRINT_COMPARE_PASS" },
			},
		]);

		expect(pair.count).to.equal(2);
		expect(pair.timeIn?.toISOString()).to.equal("2026-06-08T15:41:29.000Z");
		expect(pair.timeOut?.toISOString()).to.equal("2026-06-08T15:44:10.000Z");
	});

	it("does not pair rapid repeat accepted punches as clock out", () => {
		const pair = selectHikvisionPunchPair(
			[
				{
					eventTime: new Date("2026-06-08T15:21:29.000Z"),
					payload: { major: 5, minor: 38, actionCode: "MINOR_FINGERPRINT_COMPARE_PASS" },
				},
				{
					eventTime: new Date("2026-06-08T15:21:39.000Z"),
					payload: { major: 5, minor: 38, actionCode: "MINOR_FINGERPRINT_COMPARE_PASS" },
				},
			],
			{ minPairGapMinutes: 30 },
		);

		expect(pair.count).to.equal(2);
		expect(pair.timeIn?.toISOString()).to.equal("2026-06-08T15:21:29.000Z");
		expect(pair.timeOut).to.equal(null);
	});

	it("pairs accepted punches only after the configured minimum gap", () => {
		const pair = selectHikvisionPunchPair(
			[
				{
					eventTime: new Date("2026-06-08T08:01:00.000Z"),
					payload: { major: 5, minor: 38, actionCode: "MINOR_FINGERPRINT_COMPARE_PASS" },
				},
				{
					eventTime: new Date("2026-06-08T08:10:00.000Z"),
					payload: { major: 5, minor: 38, actionCode: "MINOR_FINGERPRINT_COMPARE_PASS" },
				},
				{
					eventTime: new Date("2026-06-08T17:03:00.000Z"),
					payload: { major: 5, minor: 38, actionCode: "MINOR_FINGERPRINT_COMPARE_PASS" },
				},
			],
			{ minPairGapMinutes: 30 },
		);

		expect(pair.count).to.equal(3);
		expect(pair.timeIn?.toISOString()).to.equal("2026-06-08T08:01:00.000Z");
		expect(pair.timeOut?.toISOString()).to.equal("2026-06-08T17:03:00.000Z");
	});

	it("normalizes SDK callback evidence without losing the raw payload", () => {
		const payload = {
			source: "EN_HCNETSDK_ALARM",
			actionCode: "MINOR_ADD_FINGER_BY_EMPLOYEE_NO",
			major: 3,
			minor: 1055,
			employeeNo: "42",
			time: "2026-07-15T10:00:00+08:00",
		};
		const event = normalizeHikvisionSdkCallbackEvidence(payload);
		expect(event).to.deep.include({
			evidenceSource: "SDK_CALLBACK",
			directDeviceEvidence: true,
			eventCategory: "ENROLLMENT",
			eventAction: "FINGERPRINT_ENROLLED",
			eventConfidence: "SUPPORTED",
		});
		expect(event.rawEvidence).to.equal(payload);
	});

	it("builds native XML logSearch requests with the vendor pagination spelling", () => {
		const xml = buildHikvisionLogSearchXml({
			searchId: "search<&>",
			startTime: "2026-07-15T00:00:00+08:00",
			endTime: "2026-07-15T23:59:59+08:00",
			maxResults: 25,
			searchResultPosition: 50,
		});
		expect(xml).to.include("<searchResultPostion>50</searchResultPostion>");
		expect(xml).to.include("<maxResults>25</maxResults>");
		expect(xml).to.include("search&lt;&amp;&gt;");
	});

	it("parses namespaced ISAPI logSearch rows and preserves raw XML", () => {
		const xml = `<?xml version="1.0" encoding="UTF-8"?>
			<CMSearchResult xmlns="http://www.hikvision.com/ver20/XMLSchema">
				<responseStatusStrg>MORE</responseStatusStrg><numOfMatches>2</numOfMatches>
				<matchList><searchMatchItem><time>2026-07-15T10:01:02+08:00</time>
				<majorType>Operation</majorType><minorType>Add fingerprint</minorType>
				<localOrRemote>remote</localOrRemote><remoteHost>10.184.37.19</remoteHost>
				<parameter>employeeNo=42</parameter><information>Fingerprint enrolled for employee 42</information>
				<employeeNoString>42</employeeNoString></searchMatchItem></matchList>
			</CMSearchResult>`;
		const parsed = parseHikvisionLogSearchResponse(xml);
		expect(parsed.responseStatus).to.equal("MORE");
		expect(parsed.totalMatches).to.equal(2);
		expect(parsed.rows).to.have.length(1);
		expect(parsed.rows[0]).to.deep.include({
			majorType: "Operation",
			minorType: "Add fingerprint",
			employeeNo: "42",
			remoteHost: "10.184.37.19",
		});
		expect(parsed.rows[0].rawXml).to.include("Fingerprint enrolled");
	});

	it("paginates logSearch using the returned row count and MORE status", async () => {
		const calls: Array<[number, number]> = [];
		const page = (status: string, total: number, label: string) => `
			<CMSearchResult><responseStatusStrg>${status}</responseStatusStrg><numOfMatches>${total}</numOfMatches>
			<searchMatchItem><time>2026-07-15T10:00:00+08:00</time><majorType>Operation</majorType>
			<minorType>${label}</minorType></searchMatchItem></CMSearchResult>`;
		const result = await paginateHikvisionLogSearch({
			pageSize: 1,
			maxRows: 5,
			fetchPage: async (position, maxResults) => {
				calls.push([position, maxResults]);
				return position === 0 ? page("MORE", 2, "Add person") : page("OK", 2, "Add fingerprint");
			},
		});
		expect(calls).to.deep.equal([[0, 1], [1, 1]]);
		expect(result.rows).to.have.length(2);
		expect(result.nextSearchResultPosition).to.equal(2);
	});

	it("maps explicit fingerprint-enrollment log evidence but not Add Person", () => {
		expect(
			classifyHikvisionLogSearchRow({
				majorType: "Operation",
				minorType: "Add fingerprint",
				information: "Fingerprint enrolled",
				parameter: "employeeNo=42",
			}),
		).to.deep.include({
			eventCategory: "ENROLLMENT",
			eventAction: "FINGERPRINT_ENROLLED",
			eventConfidence: "PROVEN",
		});
		expect(
			classifyHikvisionLogSearchRow({
				majorType: "Operation",
				minorType: "Add Person",
				information: "User created",
				parameter: "employeeNo=42",
			}),
		).to.deep.include({
			eventCategory: "USER_MANAGEMENT",
			eventAction: "USER_CREATED",
		});
	});

	it("maps the exact verified 10.184.38.177 logSearch metaIds", () => {
		expect(
			classifyHikvisionLogSearchRow({
				metaId: "log.hikvision.com/Information/addFpByEmployeeNo",
				majorType: "Information",
				minorType: "addFpByEmployeeNo",
			}),
		).to.deep.include({
			eventCategory: "ENROLLMENT",
			eventAction: "FINGERPRINT_ENROLLED",
			eventConfidence: "PROVEN",
		});
		expect(
			classifyHikvisionLogSearchRow({
				metaId: "log.hikvision.com/Information/addUserInfo",
				majorType: "Information",
				minorType: "addUserInfo",
			}),
		).to.deep.include({
			eventCategory: "USER_MANAGEMENT",
			eventAction: "USER_CREATED",
			eventConfidence: "PROVEN",
		});
	});

	it("normalizes ISAPI rows with direct evidence provenance", () => {
		const event = normalizeHikvisionLogSearchRow(
			{
				index: 7,
				time: "2026-07-15T10:00:00+08:00",
				majorType: "Operation",
				minorType: "Add Person",
				information: "User created",
				employeeNo: "42",
				rawXml: "<searchMatchItem />",
				raw: {},
			},
			{ id: "device-1", address: "10.184.38.177" },
		);
		expect(event).to.deep.include({
			evidenceSource: "ISAPI_LOGSEARCH",
			directDeviceEvidence: true,
			eventCategory: "USER_MANAGEMENT",
			eventAction: "USER_CREATED",
			eventConfidence: "PROVEN",
		});
	});

	it("maps explicit face, card, user-update, and rejected-tap evidence", () => {
		expect(
			classifyHikvisionLogSearchRow({
				metaId: "log.hikvision.com/Information/localFaceDataAppend",
			}),
		).to.deep.include({
			eventCategory: "ENROLLMENT",
			eventAction: "FACE_ENROLLED",
			eventConfidence: "PROVEN",
		});
		expect(
			classifyHikvisionLogSearchRow({ minorType: "Update face", information: "Face updated" }),
		).to.deep.include({ eventAction: "FACE_UPDATED" });
		expect(
			classifyHikvisionLogSearchRow({ minorType: "Delete card", information: "Card deleted" }),
		).to.deep.include({ eventAction: "CARD_DELETED" });
		expect(
			classifyHikvisionLogSearchRow({
				metaId: "log.hikvision.com/Information/modifyUserInfo",
			}),
		).to.deep.include({ eventAction: "USER_UPDATED" });

		const rejected = normalizeHikvisionSdkCallbackEvidence({
			source: "EN_HCNETSDK_ALARM",
			actionCode: "MINOR_FINGERPRINT_COMPARE_FAIL",
			eventKind: "attendance_fingerprint_failed",
		});
		expect(rejected).to.deep.include({
			eventCategory: "ATTENDANCE",
			eventAction: "TAP_REJECTED",
		});
	});

	it("refuses lifecycle inference from current state alone", () => {
		expect(
			normalizeHikvisionStateTransitionEvidence({
				afterSnapshot: [{ vendorUserId: "42", fingerprintCount: 1 }],
				afterCapturedAt: "2026-07-15T10:00:00+08:00",
			}),
		).to.deep.equal([]);
	});

	it("infers only verified user and fingerprint before/after transitions", () => {
		const events = normalizeHikvisionStateTransitionEvidence({
			beforeSnapshot: [{ vendorUserId: "41", fingerprintCount: 0 }],
			afterSnapshot: [
				{ vendorUserId: "41", fingerprintCount: 1 },
				{ vendorUserId: "42", fingerprintCount: 2 },
			],
			beforeCapturedAt: "2026-07-15T09:00:00+08:00",
			afterCapturedAt: "2026-07-15T10:00:00+08:00",
		});
		expect(events.map((event) => event.eventAction)).to.deep.equal([
			"FINGERPRINT_ENROLLED",
			"USER_CREATED",
		]);
		expect(events.every((event) => event.eventConfidence === "INFERRED")).to.equal(true);
		expect(events.every((event) => event.directDeviceEvidence === false)).to.equal(true);
	});

	it("infers face and card lifecycle only from complete before/after snapshots", () => {
		const events = normalizeHikvisionStateTransitionEvidence({
			beforeSnapshot: [{ vendorUserId: "42", faceCount: 0, cardCount: 1 }],
			afterSnapshot: [{ vendorUserId: "42", faceCount: 1, cardCount: 0 }],
			beforeCapturedAt: "2026-07-15T09:00:00+08:00",
			afterCapturedAt: "2026-07-15T10:00:00+08:00",
		});
		expect(events.map((event) => event.eventAction)).to.deep.equal([
			"FACE_ENROLLED",
			"CARD_DELETED",
		]);
		expect(
			events.every((event) => event.evidenceSource === "STATE_TRANSITION_INFERRED"),
		).to.equal(true);
	});
});
