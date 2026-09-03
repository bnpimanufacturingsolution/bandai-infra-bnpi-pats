/**
 * Decide whether a VM SDK manual peer-copy attempt succeeded.
 *
 * Peer person create (mode=users) finishes when the user row is on the target.
 * Face/card modality failures after userOk must not fail the whole peer create —
 * those residuals belong to credential recovery.
 *
 * Live DEV 2026-07-30: userOk=true + fingerprintOk=true + faceOk=false still
 * created people on Main E (From 740→749) while the old gate counted full failure.
 */
export type HikvisionManualCopyEventProof = {
	exitCode: number;
	peerUserWriteOk: boolean;
	completed: boolean;
	fingerprintWriteOk: boolean;
	faceWriteOk: boolean;
	cardWriteOk: boolean;
};

export type HikvisionManualCopySuccessOptions = {
	credentialOnly?: boolean;
	includeFingerprints?: boolean;
};

export function isHikvisionManualCopyAttemptSuccess(
	proof: HikvisionManualCopyEventProof,
	options: HikvisionManualCopySuccessOptions = {},
): boolean {
	if (proof.exitCode !== 0 || !proof.completed || !proof.peerUserWriteOk) {
		return false;
	}
	if (options.credentialOnly === true) {
		return proof.fingerprintWriteOk && proof.faceWriteOk && proof.cardWriteOk;
	}
	if (options.includeFingerprints && !proof.fingerprintWriteOk) {
		return false;
	}
	return true;
}
