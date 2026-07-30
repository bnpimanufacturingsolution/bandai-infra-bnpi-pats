import { expect } from "chai";
import { isHikvisionManualCopyAttemptSuccess } from "../helper/hikvision-manual-copy-success.helper";

describe("isHikvisionManualCopyAttemptSuccess", () => {
	const baseOk = {
		exitCode: 0,
		peerUserWriteOk: true,
		completed: true,
		fingerprintWriteOk: true,
		faceWriteOk: true,
		cardWriteOk: true,
	};

	it("accepts peer person create when userOk even if faceOk=false (Main E live defect)", () => {
		const ok = isHikvisionManualCopyAttemptSuccess(
			{
				...baseOk,
				faceWriteOk: false,
				cardWriteOk: false,
			},
			{ credentialOnly: false, includeFingerprints: true },
		);
		expect(ok).to.equal(true);
	});

	it("rejects peer create when fingerprint was requested but fingerprintOk=false", () => {
		const ok = isHikvisionManualCopyAttemptSuccess(
			{
				...baseOk,
				fingerprintWriteOk: false,
				faceWriteOk: false,
			},
			{ credentialOnly: false, includeFingerprints: true },
		);
		expect(ok).to.equal(false);
	});

	it("rejects when userOk=false even if modalities look green", () => {
		const ok = isHikvisionManualCopyAttemptSuccess(
			{
				...baseOk,
				peerUserWriteOk: false,
			},
			{ credentialOnly: false, includeFingerprints: true },
		);
		expect(ok).to.equal(false);
	});

	it("credential-only still requires face when face is part of the bundle", () => {
		const ok = isHikvisionManualCopyAttemptSuccess(
			{
				...baseOk,
				faceWriteOk: false,
			},
			{ credentialOnly: true, includeFingerprints: true },
		);
		expect(ok).to.equal(false);
	});

	it("credential-only accepts full modality green", () => {
		const ok = isHikvisionManualCopyAttemptSuccess(baseOk, {
			credentialOnly: true,
			includeFingerprints: true,
		});
		expect(ok).to.equal(true);
	});
});
