import { expect } from "chai";
import {
	HIKVISION_FDLIB_FACE_DATA_RECORD_ENDPOINT,
	HikvisionFdlibFaceDeliveryRegistry,
	assertHikvisionCredentialWriteLease,
	assertHikvisionFdlibPrewriteEvidence,
	assertHikvisionFdlibWriteAccepted,
	buildHikvisionFdlibFaceDataRecordBody,
	classifyHikvisionFdlibPictureTarget,
	validateHikvisionFdlibFacePicture,
	verifyHikvisionFdlibPhysicalReread,
} from "../helper/hikvision-fdlib-face.helper";

const jpegBase64 = (marker = 0x41) =>
	Buffer.concat([
		Buffer.from([0xff, 0xd8]),
		Buffer.alloc(128, marker),
		Buffer.from([0xff, 0xd9]),
	]).toString("base64");

const testedTarget = (overrides: Record<string, unknown> = {}) => ({
	status: "tested",
	testedBuildAttestation: "build-123",
	endpoint: HIKVISION_FDLIB_FACE_DATA_RECORD_ENDPOINT,
	uploadMode: "url",
	fdId: "1",
	faceLibType: "blackFD",
	allowedRequesterAddresses: ["10.184.37.20"],
	...overrides,
});

describe("Hikvision FDLib picture face contract", () => {
	it("makes a currently capable, exact-build-attested target actionable without a toggle", () => {
		const result = classifyHikvisionFdlibPictureTarget({
			capabilityProbe: {
				status: "supported",
				response: { SupportUploadPictureType: { opt: "binary,url" } },
			},
			attestation: testedTarget(),
			currentBuildAttestation: "build-123",
		});
		expect(result).to.include({
			actionable: true,
			writer: "fdlib_picture_import",
			reason: "ready",
			fdId: "1",
			faceLibType: "blackFD",
		});
		expect(result.allowedRequesterAddresses).to.deep.equal(["10.184.37.20"]);
		expect(result.capabilityEvidenceSha256).to.match(/^[a-f0-9]{64}$/);
	});

	it("recognizes the general FDLib MinMoe capability shape for one authorized canary", () => {
		const result = classifyHikvisionFdlibPictureTarget({
			capabilityProbe: {
				status: "supported",
				response: {
					supportFDFunction: "post,delete,put,get,setUp",
					faceURLLen: 1024,
				},
			},
			currentBuildAttestation: "build-123",
			authorizedCanary: {
				authorized: true,
				fdId: "1",
				faceLibType: "blackFD",
				allowedRequesterAddresses: ["10.184.37.20"],
			},
		});
		expect(result).to.include({
			actionable: true,
			writer: "fdlib_picture_import",
			reason: "authorized_canary_ready",
			fdId: "1",
			faceLibType: "blackFD",
		});
		expect(result.allowedRequesterAddresses).to.deep.equal(["10.184.37.20"]);
	});

	it("keeps unproven capability, upload mode, and build mismatches blocked", () => {
		expect(
			classifyHikvisionFdlibPictureTarget({
				capabilityProbe: { status: "unsupported" },
				attestation: testedTarget(),
				currentBuildAttestation: "build-123",
			}).reason,
		).to.equal("capability_probe_not_supported");
		expect(
			classifyHikvisionFdlibPictureTarget({
				capabilityProbe: {
					status: "supported",
					response: { SupportUploadPictureType: "binary" },
				},
				attestation: testedTarget(),
				currentBuildAttestation: "build-123",
			}).reason,
		).to.equal("url_upload_not_supported");
		expect(
			classifyHikvisionFdlibPictureTarget({
				capabilityProbe: {
					status: "supported",
					response: { faceURL: { supported: true } },
				},
				attestation: testedTarget(),
				currentBuildAttestation: "different-build",
			}).reason,
		).to.equal("build_attestation_mismatch");
	});

	it("validates canonical bounded image bytes and rejects HTML masquerading as a face", () => {
		const picture = validateHikvisionFdlibFacePicture(jpegBase64());
		expect(picture.contentType).to.equal("image/jpeg");
		expect(picture.size).to.equal(132);
		expect(picture.sha256).to.match(/^[a-f0-9]{64}$/);
		expect(() =>
			validateHikvisionFdlibFacePicture(
				Buffer.from(`<html>${"Unauthorized".repeat(16)}</html>`).toString("base64"),
			),
		).to.throw("neither a validated JPEG nor PNG");
		expect(() => validateHikvisionFdlibFacePicture("not-base64")).to.throw(
			"canonical base64",
		);
	});

	it("requires an exact fresh shared source-target lease", () => {
		const lease = {
			leaseId: "lease-1",
			organizationId: "org-1",
			scopeHash: "scope-1",
			deviceIds: ["source", "target"],
			acquiredAt: "2026-07-23T12:00:00.000Z",
		};
		expect(() =>
			assertHikvisionCredentialWriteLease({
				lease,
				organizationId: "org-1",
				scopeHash: "scope-1",
				sourceDeviceId: "source",
				targetDeviceId: "target",
				now: Date.parse("2026-07-23T12:00:30.000Z"),
			}),
		).not.to.throw();
		expect(() =>
			assertHikvisionCredentialWriteLease({
				lease,
				organizationId: "org-1",
				scopeHash: "different",
				sourceDeviceId: "source",
				targetDeviceId: "target",
				now: Date.parse("2026-07-23T12:00:30.000Z"),
			}),
		).to.throw("fresh shared credential lease");
	});

	it("refuses owner ambiguity, target overwrite, and duplicate face custody", () => {
		expect(() =>
			assertHikvisionFdlibPrewriteEvidence({
				expectedVendorUserId: "13",
				targetIdentityVendorUserId: "13",
				targetCardOwnerVendorUserId: "13",
				targetFaceCount: 0,
				duplicateFaceOwnerVendorUserIds: [],
			}),
		).not.to.throw();
		expect(() =>
			assertHikvisionFdlibPrewriteEvidence({
				expectedVendorUserId: "13",
				targetIdentityVendorUserId: "13",
				targetCardOwnerVendorUserId: "14",
				targetFaceCount: 0,
				duplicateFaceOwnerVendorUserIds: [],
			}),
		).to.throw("card ownership");
		expect(() =>
			assertHikvisionFdlibPrewriteEvidence({
				expectedVendorUserId: "13",
				targetIdentityVendorUserId: "13",
				targetCardOwnerVendorUserId: "13",
				targetFaceCount: 1,
				duplicateFaceOwnerVendorUserIds: [],
			}),
		).to.throw("will not overwrite");
		expect(() =>
			assertHikvisionFdlibPrewriteEvidence({
				expectedVendorUserId: "13",
				targetIdentityVendorUserId: "13",
				targetCardOwnerVendorUserId: "13",
				targetFaceCount: 0,
				duplicateFaceOwnerVendorUserIds: ["88"],
			}),
		).to.throw("another target user");
	});

	it("creates an official bounded FaceDataRecord body without embedding image bytes", () => {
		const body = buildHikvisionFdlibFaceDataRecordBody({
			faceUrl: "https://10.184.37.19/internal/fdlib/opaque-token",
			fdId: "1",
			faceLibType: "blackFD",
			vendorUserId: "13",
			name: "Employee 13",
		});
		expect(body).to.deep.equal({
			faceURL: "https://10.184.37.19/internal/fdlib/opaque-token",
			faceLibType: "blackFD",
			FDID: "1",
			FPID: "13",
			name: "Employee 13",
		});
		expect(JSON.stringify(body)).not.to.include("base64");
	});

	it("requires an explicit FaceDataRecord success body before reread", () => {
		expect(
			assertHikvisionFdlibWriteAccepted({
				ResponseStatus: { statusCode: 1, statusString: "OK" },
			}),
		).to.deep.equal({ statusCode: 1, statusText: "ok" });
		expect(
			assertHikvisionFdlibWriteAccepted({
				ResponseStatus: { statusString: "OK" },
			}),
		).to.deep.equal({ statusCode: null, statusText: "ok" });
		expect(() => assertHikvisionFdlibWriteAccepted({})).to.throw(
			"explicit success status",
		);
		expect(() =>
			assertHikvisionFdlibWriteAccepted({
				ResponseStatus: { statusCode: 6, statusString: "Invalid Content" },
			}),
		).to.throw("invalid content");
	});

	it("serves an image once, only to the attested physical target address", () => {
		const registry = new HikvisionFdlibFaceDeliveryRegistry();
		const picture = validateHikvisionFdlibFacePicture(jpegBase64());
		const lease = registry.create({
			picture,
			allowedRequesterAddresses: ["10.184.37.20"],
			now: 1_000,
		});
		expect(() =>
			registry.consume({
				token: lease.token,
				requesterAddress: "10.184.37.99",
				now: 2_000,
			}),
		).to.throw("requester does not match");
		const consumed = registry.consume({
			token: lease.token,
			requesterAddress: "::ffff:10.184.37.20",
			now: 2_000,
		});
		expect(consumed.sha256).to.equal(picture.sha256);
		expect(() =>
			registry.consume({
				token: lease.token,
				requesterAddress: "10.184.37.20",
				now: 2_001,
			}),
		).to.throw("consumed");
	});

	it("counts success only after exact image reread and credential isolation", () => {
		const sourcePicture = validateHikvisionFdlibFacePicture(jpegBase64());
		const result = verifyHikvisionFdlibPhysicalReread({
			sourcePicture,
			reread: {
				vendorUserId: "13",
				faceCount: 1,
				pictureBase64: jpegBase64(),
				identityDigestBefore: "identity",
				identityDigestAfter: "identity",
				fingerprintDigestBefore: "finger",
				fingerprintDigestAfter: "finger",
				cardDigestBefore: "card",
				cardDigestAfter: "card",
			},
		});
		expect(result.retained).to.equal(true);
		expect(() =>
			verifyHikvisionFdlibPhysicalReread({
				sourcePicture,
				reread: {
					vendorUserId: "13",
					faceCount: 1,
					pictureBase64: jpegBase64(0x42),
					identityDigestBefore: "identity",
					identityDigestAfter: "identity",
					fingerprintDigestBefore: "finger",
					fingerprintDigestAfter: "finger",
					cardDigestBefore: "card",
					cardDigestAfter: "card",
				},
			}),
		).to.throw("did not prove exact image retention");
	});
});
