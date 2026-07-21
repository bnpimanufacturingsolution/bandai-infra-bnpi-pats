import { expect } from "chai";
import {
	applyRawFingerprintCustodyToRow,
	buildRawFingerprintCustody,
	captureRawFingerprintsForEnrollment,
	classifyHikvisionRawFaceBinaryResponse,
	isRawFingerprintEnrollCaptureEnabled,
	normalizeIsapiFingerprintList,
	parseFingerPrintProgress,
	RAW_FINGERPRINT_SCHEMA,
	shouldCaptureRawFingerprintForEventAction,
} from "../helper/device-user-raw-fingerprint.helper";

describe("device-user-raw-fingerprint helper", () => {
	it("normalizes ISAPI FingerPrintList into raw base64 templates", () => {
		// Proven TEST A shape (FingerPrintInfo.FingerPrintList[]).
		const proven = normalizeIsapiFingerprintList({
			FingerPrintInfo: {
				searchID: "probe",
				status: "OK",
				FingerPrintList: [
					{
						cardReaderNo: 1,
						fingerPrintID: 1,
						fingerType: "normalFP",
						fingerData: "MzAxHxodJvh8gh9xJuiE0CZlFVhUkkgFJjhsgVSZJThkC2SR",
					},
				],
			},
		});
		expect(proven).to.have.length(1);
		expect(proven[0].fingerPrintId).to.equal(1);
		expect(proven[0].data).to.include("MzAxHxod");

		const list = normalizeIsapiFingerprintList({
			FingerPrintList: {
				FingerPrint: [
					{
						fingerPrintID: 1,
						fingerType: "normalFP",
						fingerData: "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=",
					},
					{
						fingerPrintID: 2,
						fingerType: 0,
						data: "c29tZS1vdGhlci10ZW1wbGF0ZS1ieXRlcw==",
					},
				],
			},
		});
		expect(list).to.have.length(2);
		expect(list[0].fingerPrintId).to.equal(1);
		expect(list[0].data).to.equal("QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=");
		expect(list[1].data.length).to.be.greaterThan(8);
	});

	it("parses FingerPrintProgress status 6 as ok and status 5 as clone/reject fail", () => {
		const ok = parseFingerPrintProgress({
			FingerPrintStatus: {
				StatusList: [{ id: 1, cardReaderRecvStatus: 6 }],
				totalStatus: 1,
			},
		});
		expect(ok.ok).to.equal(true);
		expect(ok.cardReaderRecvStatus).to.equal(6);

		const fail = parseFingerPrintProgress({
			FingerPrintStatus: {
				StatusList: [{ id: 1, cardReaderRecvStatus: 5, errorMsg: "15" }],
				totalStatus: 1,
			},
		});
		expect(fail.ok).to.equal(false);
		expect(fail.cardReaderRecvStatus).to.equal(5);
		expect(fail.errorMsg).to.equal("15");
		expect(fail.reason).to.include("errorMsg=15");
	});

	it("keeps raw fingerprint fallback enabled even when env tries to disable it", () => {
		const previousFallback = process.env.HIKVISION_ENROLL_RAW_FINGERPRINT;
		try {
			delete process.env.HIKVISION_ENROLL_RAW_FINGERPRINT;
			expect(isRawFingerprintEnrollCaptureEnabled()).to.equal(true);

			process.env.HIKVISION_ENROLL_RAW_FINGERPRINT = "false";
			expect(isRawFingerprintEnrollCaptureEnabled()).to.equal(true);

			process.env.HIKVISION_ENROLL_RAW_FINGERPRINT = "off";
			expect(isRawFingerprintEnrollCaptureEnabled()).to.equal(true);
		} finally {
			if (previousFallback === undefined) delete process.env.HIKVISION_ENROLL_RAW_FINGERPRINT;
			else process.env.HIKVISION_ENROLL_RAW_FINGERPRINT = previousFallback;
		}
	});

	it("builds and applies raw fingerprint custody onto DeviceUser row", () => {
		const custody = buildRawFingerprintCustody({
			deviceId: "dev-1",
			vendorUserId: "15",
			fingerprints: [
				{
					fingerPrintId: 1,
					fingerType: 0,
					length: 32,
					data: "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=",
				},
			],
			source: "unit_test",
		});
		expect(custody.schema).to.equal(RAW_FINGERPRINT_SCHEMA);
		expect(custody.rawPresent).to.equal(true);
		expect(custody.fingerprintCount).to.equal(1);

		const row: any = {
			rawPayload: { employeeNo: "15", numOfFP: 1 },
			vendorMetadata: { credentialSummary: { fingerprintCount: 1 } },
		};
		applyRawFingerprintCustodyToRow(row, custody);
		expect(row.vendorMetadata.rawFingerprintPresent).to.equal(true);
		expect(row.vendorMetadata.rawFingerprintCount).to.equal(1);
		expect(row.vendorMetadata.rawFingerprints.templates[0].data).to.equal(
			"QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=",
		);
		// Actual raw blob path operators open in Device User details JSON.
		expect(row.rawPayload._hrisDeviceMetadata.rawFingerprints.templates[0].data).to.include(
			"QUJD",
		);
	});

	it("captures raw fingerprints with injectable fetch and persists DeviceUser", async () => {
		const previousFallback = process.env.HIKVISION_ENROLL_RAW_FINGERPRINT;
		process.env.HIKVISION_ENROLL_RAW_FINGERPRINT = "true";
		const updates: any[] = [];
		const eventUpdates: any[] = [];
		const prisma = {
			deviceUser: {
				findFirst: async () => ({
					id: "du-15",
					vendorUserId: "15",
					employeeNo: "15",
					rawPayload: {},
					vendorMetadata: {},
				}),
				update: async (input: any) => {
					updates.push(input);
					return {
						id: "du-15",
						vendorUserId: "15",
						employeeNo: "15",
						vendorMetadata: input.data.vendorMetadata,
						rawPayload: input.data.rawPayload,
						updatedAt: new Date(),
					};
				},
				findUnique: async () => ({
					id: "du-15",
					vendorMetadata: {},
				}),
			},
			deviceEvent: {
				findUnique: async () => ({
					id: "evt-fp-1",
					payload: { enrollmentSnapshot: {} },
					deviceUserId: "du-15",
					employeeId: null,
				}),
				update: async (input: any) => {
					eventUpdates.push(input);
					return {
						id: "evt-fp-1",
						...input.data,
						device: { id: "dev-1" },
						deviceUser: { id: "du-15", vendorUserId: "15" },
					};
				},
			},
		};

		let result: Awaited<ReturnType<typeof captureRawFingerprintsForEnrollment>>;
		try {
			result = await captureRawFingerprintsForEnrollment({
				prisma: prisma as any,
				req: { io: null },
				organizationId: "org-1",
				deviceId: "dev-1",
				eventId: "evt-fp-1",
				employeeNo: "15",
				deviceUserId: "du-15",
				fetchFingerprints: async () => ({
					fingerprints: [
						{
							fingerPrintId: 1,
							fingerType: 0,
							length: 24,
							data: "cmF3LWZpbmdlci10ZW1wbGF0ZS1kYXRh",
						},
					],
					attempts: 1,
				}),
			});
		} finally {
			if (previousFallback === undefined) delete process.env.HIKVISION_ENROLL_RAW_FINGERPRINT;
			else process.env.HIKVISION_ENROLL_RAW_FINGERPRINT = previousFallback;
		}

		expect(result.ok).to.equal(true);
		expect(result.rawPresent).to.equal(true);
		expect(result.fingerprintCount).to.equal(1);
		expect(result.totalDataChars).to.be.greaterThan(8);
		expect(updates.length).to.be.greaterThan(0);
		const fingerprintUpdate = updates.find((update) =>
			Boolean(update.data.vendorMetadata?.rawFingerprints?.templates?.length),
		);
		expect(fingerprintUpdate).to.exist;
		const savedMeta = fingerprintUpdate.data.vendorMetadata;
		expect(savedMeta.rawFingerprints.templates[0].data).to.equal(
			"cmF3LWZpbmdlci10ZW1wbGF0ZS1kYXRh",
		);
		// Not AES envelope shape.
		expect(savedMeta.rawFingerprints.templates[0].data).to.not.include("ciphertext");
		expect(eventUpdates[0].data.payload.rawFingerprintCustody.status).to.equal(
			"raw_on_event_and_device_user",
		);
		expect(eventUpdates[0].data.payload.rawFingerprints.templates[0].data).to.equal(
			"cmF3LWZpbmdlci10ZW1wbGF0ZS1kYXRh",
		);
		expect(eventUpdates[0].data.payload.enrollmentSnapshot.biometricCustody.status).to.equal(
			"raw_on_event_and_device_user",
		);
	});

	it("selects fingerprint enroll/update and user create for raw capture", () => {
		expect(shouldCaptureRawFingerprintForEventAction("FINGERPRINT_ENROLLED")).to.equal(true);
		expect(shouldCaptureRawFingerprintForEventAction("FINGERPRINT_UPDATED")).to.equal(true);
		expect(shouldCaptureRawFingerprintForEventAction("USER_CREATED")).to.equal(true);
		expect(shouldCaptureRawFingerprintForEventAction("TAP")).to.equal(false);
	});

	it("classifies Hikvision faceURL HTML/XML failures without treating them as images", () => {
		const notFound = classifyHikvisionRawFaceBinaryResponse({
			contentType: "text/html",
			status: 404,
			buffer: Buffer.from(`<!DOCTYPE html><html><body>Can't locate document: /LOCALS/pic/enrlFace/0/0000000200.jpg@WEB000000060622</body></html>`),
		});
		expect(notFound.ok).to.equal(false);
		expect(notFound.reason).to.equal("face_image_not_found_on_device");

		const unauthorized = classifyHikvisionRawFaceBinaryResponse({
			contentType: "application/xml",
			status: 401,
			buffer: Buffer.from(`<?xml version="1.0"?><userCheck><statusValue>401</statusValue><statusString>Unauthorized</statusString></userCheck>`),
		});
		expect(unauthorized.ok).to.equal(false);
		expect(unauthorized.reason).to.equal("face_image_unauthorized");

		const validJpeg = classifyHikvisionRawFaceBinaryResponse({
			contentType: "image/jpeg",
			status: 200,
			buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(128, 1)]),
		});
		expect(validJpeg.ok).to.equal(true);
	});

	it("persists raw templates from C++ callback fingerprints array without AES", async () => {
		const { persistRawFingerprintsFromSdkCallback, normalizeCallbackFingerprintArray } =
			await import("../helper/device-user-raw-fingerprint.helper");
		const list = normalizeCallbackFingerprintArray([
			{ fingerPrintId: 1, fingerType: 0, length: 20, data: "cmF3LWZyb20tY3BwLWNhbGxiYWNr" },
		]);
		expect(list[0].data).to.equal("cmF3LWZyb20tY3BwLWNhbGxiYWNr");

		const updates: any[] = [];
		const prisma = {
			deviceUser: {
				findFirst: async () => ({
					id: "du-15",
					vendorUserId: "15",
					employeeNo: "15",
					rawPayload: {},
					vendorMetadata: {},
				}),
				update: async (input: any) => {
					updates.push(input);
					return {
						id: "du-15",
						vendorUserId: "15",
						vendorMetadata: input.data.vendorMetadata,
						rawPayload: input.data.rawPayload,
					};
				},
			},
			deviceEvent: {
				findUnique: async () => null,
			},
		};
		const result = await persistRawFingerprintsFromSdkCallback({
			prisma: prisma as any,
			organizationId: "org-1",
			deviceId: "dev-1",
			employeeNo: "15",
			fingerprints: [
				{ fingerPrintId: 1, data: "cmF3LWZyb20tY3BwLWNhbGxiYWNr" },
			],
			source: "cpp_sdk_callback_raw",
		});
		expect(result.ok).to.equal(true);
		expect(result.fingerprintCount).to.equal(1);
		expect(updates[0].data.vendorMetadata.rawFingerprints.templates[0].data).to.equal(
			"cmF3LWZyb20tY3BwLWNhbGxiYWNr",
		);
		expect(JSON.stringify(updates[0].data)).to.not.include("ciphertext");
	});
});
