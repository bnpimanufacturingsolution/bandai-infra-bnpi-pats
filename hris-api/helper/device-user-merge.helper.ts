import { extractHikvisionCredentialSummary } from "./device-user-sync.helper";

export const DEVICE_USER_MERGE_FIELDS = [
	"vendorUserId",
	"employeeNo",
	"employeeId",
	"displayName",
	"status",
	"validFrom",
	"validTo",
	"doorRight",
	"accessPlan",
	"face",
	"fingerprint",
	"card",
] as const;

export type DeviceUserMergeField = (typeof DEVICE_USER_MERGE_FIELDS)[number];
export type MergeChoice = "A" | "B" | "KEEP";

export type DeviceUserMergeRecord = {
	deviceId: string;
	deviceName: string;
	vendorUserId: string;
	employeeId?: string | null;
	employeeNo?: string | null;
	displayName?: string | null;
	status?: string | null;
	validFrom?: string | Date | null;
	validTo?: string | Date | null;
	doorRight?: string | null;
	accessPlan?: unknown;
	rawPayload?: unknown;
	biometricEvidence?: {
		fingerprint: {
			status: "raw_blob_present" | "missing_raw_blob" | "not_enrolled" | "not_requested";
			reportedCount: number;
			rawBlobCount: number;
		};
		face: {
			status: "raw_blob_present" | "missing_raw_blob" | "not_enrolled" | "not_requested";
			reportedCount: number;
			rawBlobPresent: boolean;
		};
	};
	manualLink?: boolean;
	identityName?: string | null;
	identityCandidates?: string[];
};

export type DeviceUserMergeConflict = {
	field: DeviceUserMergeField;
	choice: MergeChoice | null;
	deviceA: { id: string; name: string; value: unknown };
	deviceB: { id: string; name: string; value: unknown };
};

export type DeviceUserMergeDuplicateSource = {
	deviceId: string;
	deviceName: string;
	vendorUserId: string;
	sourceRows: number;
	keptRecordId: string | null;
	duplicateRecordIds: string[];
	differingFields: DeviceUserMergeField[];
};

export type DeviceUserMergeGroup = {
	key: string;
	employeeId: string | null;
	employee: unknown;
	vendorUserIds: string[];
	records: DeviceUserMergeRecord[];
	sourceRows: number;
	duplicateSourceRows: DeviceUserMergeDuplicateSource[];
	sourceDeviceId: string;
	targetDeviceIds: string[];
	conflicts: DeviceUserMergeConflict[];
	missingOnDeviceIds: string[];
};

export type DeviceUserCredentialModality = "fingerprint" | "face" | "card";

export type DeviceUserCredentialWrite = {
	id: string;
	userKey: string;
	vendorUserId: string;
	modality: DeviceUserCredentialModality;
	sourceDeviceId: string | null;
	targetDeviceId: string;
	sourceReportedCount: number;
	targetReportedCount: number;
	sourceEvidenceStatus:
		| "raw_blob_present"
		| "missing_raw_blob"
		| "count_reported"
		| "not_enrolled"
		| "not_requested";
	recommended: boolean;
	recommendationReason: string;
	executionEligibility:
		| "ready_from_raw_blob"
		| "sdk_probe_required"
		| "blocked";
	blockingReason:
		| "source_conflict"
		| "source_not_enrolled"
		| "missing_raw_blob"
		| "target_write_unsupported"
		| "credential_only_card_not_supported"
		| null;
	sourceCandidateDeviceIds: string[];
};

const text = (value: unknown) => String(value ?? "").trim();
const stable = (value: unknown) => {
	if (value instanceof Date) return value.toISOString();
	if (value && typeof value === "object") return JSON.stringify(value);
	return text(value);
};
const credentials = (record: DeviceUserMergeRecord) =>
	extractHikvisionCredentialSummary((record.rawPayload || {}) as any);

const sourceScore = (record: DeviceUserMergeRecord) => {
	const summary = credentials(record);
	const evidence = record.biometricEvidence;
	const populatedFields = DEVICE_USER_MERGE_FIELDS.filter((field) => {
		if (field === "face" || field === "fingerprint" || field === "card") return false;
		const value = valueFor(record, field);
		return value !== null && value !== undefined && stable(value) !== "";
	}).length;
	return (
		populatedFields +
		Number(evidence?.fingerprint.rawBlobCount || 0) * 6 +
		Number(evidence?.face.rawBlobPresent || false) * 4 +
		summary.cardCount * 2
	);
};

const valueFor = (record: DeviceUserMergeRecord, field: DeviceUserMergeField): unknown => {
	if (field === "face") return credentials(record).faceCount;
	if (field === "fingerprint") return credentials(record).fingerprintCount;
	if (field === "card") return credentials(record).cardCount;
	return record[field];
};

const identityKey = (record: DeviceUserMergeRecord) => {
	if (record.manualLink && text(record.employeeId)) return `manual:${text(record.employeeId)}`;
	if (text(record.vendorUserId)) return `vendor:${text(record.vendorUserId)}`;
	if (text(record.employeeNo)) return `employee-no:${text(record.employeeNo)}`;
	if (text(record.employeeId)) return `employee:${text(record.employeeId)}`;
	if (text(record.identityName))
		return `identity:${text(record.identityName).toLocaleLowerCase()}`;
	return `unmatched:${text(record.deviceId)}:${text(record.vendorUserId)}`;
};

const credentialEvidenceStatus = (
	record: DeviceUserMergeRecord,
	modality: DeviceUserCredentialModality,
): DeviceUserCredentialWrite["sourceEvidenceStatus"] => {
	if (modality === "fingerprint") {
		const evidence = record.biometricEvidence?.fingerprint;
		if (evidence?.status) return evidence.status;
		return credentials(record).fingerprintCount > 0 ? "count_reported" : "not_enrolled";
	}
	if (modality === "face") {
		const evidence = record.biometricEvidence?.face;
		if (evidence?.status) return evidence.status;
		return credentials(record).faceCount > 0 ? "count_reported" : "not_enrolled";
	}
	return credentials(record).cardCount > 0 ? "count_reported" : "not_enrolled";
};

const credentialCount = (
	record: DeviceUserMergeRecord,
	modality: DeviceUserCredentialModality,
) => {
	const summary = credentials(record);
	if (modality === "fingerprint") return Number(summary.fingerprintCount || 0);
	if (modality === "face") return Number(summary.faceCount || 0);
	return Number(summary.cardCount || 0);
};

const buildCredentialWritesForUser = (
	user: DeviceUserMergeGroup,
): DeviceUserCredentialWrite[] => {
	const vendorUserId = text(user.vendorUserIds[0]);
	if (!vendorUserId) return [];
	const writes: DeviceUserCredentialWrite[] = [];
	for (const modality of ["fingerprint", "face", "card"] as const) {
		const records = user.records.map((record) => ({
			record,
			count: credentialCount(record, modality),
			evidenceStatus: credentialEvidenceStatus(record, modality),
		}));
		const maxCount = records.reduce((max, item) => Math.max(max, item.count), 0);
		if (maxCount <= 0) continue;
		const maxSources = records.filter((item) => item.count === maxCount);
		const rawSources =
			modality === "card"
				? []
				: maxSources.filter((item) => item.evidenceStatus === "raw_blob_present");
		const preferredSources = rawSources.length === 1 ? rawSources : maxSources;
		const uniqueSource = preferredSources.length === 1 ? preferredSources[0] : null;
		const sourceDeviceId = uniqueSource?.record.deviceId || null;
		const sourceEvidenceStatus =
			uniqueSource?.evidenceStatus ||
			(maxSources[0]?.evidenceStatus as DeviceUserCredentialWrite["sourceEvidenceStatus"]) ||
			"not_enrolled";
		for (const target of records.filter((item) => item.count < maxCount)) {
			const blockingReason =
				modality === "card"
					? "credential_only_card_not_supported"
					: !uniqueSource
						? "source_conflict"
						: sourceEvidenceStatus !== "raw_blob_present"
							? "missing_raw_blob"
							: modality === "face"
								? "target_write_unsupported"
						: null;
			const executionEligibility = blockingReason
				? "blocked"
				: "ready_from_raw_blob";
			const sourceCandidateDeviceIds = preferredSources.map(
				(item) => item.record.deviceId,
			);
			writes.push({
				id: [
					user.key,
					modality,
					sourceDeviceId || sourceCandidateDeviceIds.join("+") || "none",
					target.record.deviceId,
				].join(":"),
				userKey: user.key,
				vendorUserId,
				modality,
				sourceDeviceId,
				targetDeviceId: target.record.deviceId,
				sourceReportedCount: maxCount,
				targetReportedCount: target.count,
				sourceEvidenceStatus,
				recommended:
					Boolean(sourceDeviceId) &&
					executionEligibility === "ready_from_raw_blob",
				recommendationReason: blockingReason
					? blockingReason === "source_conflict"
						? `Multiple devices report the same highest ${modality} count; template equality is not proven.`
						: blockingReason === "missing_raw_blob"
							? `The source reports a ${modality} enrollment count but has no reviewed portable bytes.`
							: blockingReason === "target_write_unsupported"
								? "Credential-only face writes from stored custody are not implemented."
								: "Credential-only card writes are not implemented."
					: `A single highest-count source has evidenced raw ${modality} custody and a credential-only target write path.`,
				executionEligibility,
				blockingReason,
				sourceCandidateDeviceIds,
			});
		}
	}
	return writes;
};


const recordId = (record: DeviceUserMergeRecord, index: number) =>
	text((record as any).id) ||
	`${text(record.deviceId) || "device"}:${text(record.vendorUserId) || text(record.employeeNo) || "unknown"}:${index}`;

const buildIdentityGroups = (records: DeviceUserMergeRecord[]) => {
	const parent = records.map((_, index) => index);
	const find = (index: number): number => {
		let current = index;
		while (parent[current] !== current) {
			parent[current] = parent[parent[current]];
			current = parent[current];
		}
		return current;
	};
	const union = (left: number, right: number) => {
		const leftRoot = find(left);
		const rightRoot = find(right);
		if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
	};
	const seen = new Map<string, number>();
	const connect = (key: string, index: number) => {
		if (!text(key)) return;
		const existing = seen.get(key);
		if (existing === undefined) seen.set(key, index);
		else union(existing, index);
	};

	records.forEach((record, index) => {
		if (text(record.vendorUserId)) connect(`vendor:${text(record.vendorUserId)}`, index);
		if (text(record.employeeNo)) connect(`employee-no:${text(record.employeeNo)}`, index);
		if (!text(record.vendorUserId) && !text(record.employeeNo) && text(record.employeeId)) {
			connect(`employee:${text(record.employeeId)}`, index);
		}
		if (
			!text(record.vendorUserId) &&
			!text(record.employeeNo) &&
			!text(record.employeeId) &&
			text(record.identityName)
		) {
			connect(`identity:${text(record.identityName).toLocaleLowerCase()}`, index);
		}
	});

	const groups = new Map<number, DeviceUserMergeRecord[]>();
	records.forEach((record, index) => {
		const root = find(index);
		const group = groups.get(root) || [];
		group.push(record);
		groups.set(root, group);
	});
	return groups;
};

const groupKeyForRecords = (records: DeviceUserMergeRecord[]) => {
	const vendorIds = [...new Set(records.map((record) => text(record.vendorUserId)).filter(Boolean))];
	if (vendorIds.length === 1) return `vendor:${vendorIds[0]}`;
	const employeeNos = [...new Set(records.map((record) => text(record.employeeNo)).filter(Boolean))];
	if (employeeNos.length === 1) return `employee-no:${employeeNos[0]}`;
	const employeeIds = [...new Set(records.map((record) => text(record.employeeId)).filter(Boolean))];
	if (employeeIds.length === 1) return `employee:${employeeIds[0]}`;
	return identityKey(records[0]);
};

const collapseDuplicateDeviceRows = (records: DeviceUserMergeRecord[]) => {
	const byDeviceAndVendor = new Map<string, DeviceUserMergeRecord[]>();
	for (const record of records) {
		const key = `${text(record.deviceId)}:${text(record.vendorUserId) || text(record.employeeNo)}`;
		const group = byDeviceAndVendor.get(key) || [];
		group.push(record);
		byDeviceAndVendor.set(key, group);
	}
	const keptRecords: DeviceUserMergeRecord[] = [];
	const duplicateSourceRows: DeviceUserMergeDuplicateSource[] = [];
	for (const group of byDeviceAndVendor.values()) {
		const ordered = [...group].sort(
			(a, b) =>
				sourceScore(b) - sourceScore(a) ||
				text(a.deviceId).localeCompare(text(b.deviceId)) ||
				text(a.vendorUserId).localeCompare(text(b.vendorUserId)),
		);
		const kept = ordered[0];
		keptRecords.push(kept);
		if (ordered.length <= 1) continue;
		const differingFields = DEVICE_USER_MERGE_FIELDS.filter((field) => {
			const distinct = new Set(ordered.map((record) => stable(valueFor(record, field))));
			return distinct.size > 1;
		});
		duplicateSourceRows.push({
			deviceId: kept.deviceId,
			deviceName: kept.deviceName,
			vendorUserId: kept.vendorUserId,
			sourceRows: ordered.length,
			keptRecordId: recordId(kept, 0),
			duplicateRecordIds: ordered.slice(1).map((record, index) => recordId(record, index + 1)),
			differingFields,
		});
	}
	return { records: keptRecords, duplicateSourceRows };
};

export const buildDeviceUserMergePlan = (params: {
	records: DeviceUserMergeRecord[];
	deviceIds: string[];
	/**
	 * Devices with a successful inventory read in this same plan run.
	 * Failed/unavailable devices must not be treated as "0 IDs read" or
	 * "missing every unique ID" — only successful reads define the union gap.
	 * Defaults to all selected deviceIds when omitted (backward compatible).
	 */
	validDeviceIds?: string[];
}) => {
	const sourceRowCount = params.records.length;
	const selectedDeviceIds = params.deviceIds.map((id) => text(id)).filter(Boolean);
	const validDeviceIds = (
		Array.isArray(params.validDeviceIds) && params.validDeviceIds.length > 0
			? params.validDeviceIds
			: selectedDeviceIds
	)
		.map((id) => text(id))
		.filter(Boolean);
	const validDeviceIdSet = new Set(validDeviceIds);
	const ambiguousMatches: Array<{ record: DeviceUserMergeRecord; candidates: string[] }> = [];
	const mergeableRecords: DeviceUserMergeRecord[] = [];
	for (const record of params.records) {
		if ((record.identityCandidates || []).length > 1) {
			ambiguousMatches.push({ record, candidates: [...(record.identityCandidates || [])] });
			continue;
		}
		mergeableRecords.push(record);
	}

	const users: DeviceUserMergeGroup[] = [];
	for (const records of buildIdentityGroups(mergeableRecords).values()) {
		const key = groupKeyForRecords(records);
		const collapsed = collapseDuplicateDeviceRows(records);
		const ordered = [...collapsed.records].sort((a, b) => a.deviceId.localeCompare(b.deviceId));
		const source =
			[...ordered].sort((a, b) => {
				const score = sourceScore(b) - sourceScore(a);
				return score || a.deviceId.localeCompare(b.deviceId);
			})[0] || ordered[0];
		const conflicts: DeviceUserMergeConflict[] = [];
		for (const field of DEVICE_USER_MERGE_FIELDS) {
			const populated = ordered.filter(
				(record) =>
					valueFor(record, field) !== null &&
					valueFor(record, field) !== undefined &&
					stable(valueFor(record, field)) !== "",
			);
			const distinct = [
				...new Set(populated.map((record) => stable(valueFor(record, field)))),
			];
			if (distinct.length < 2) continue;
			const a = populated[0];
			const b =
				populated.find(
					(record) => stable(valueFor(record, field)) !== stable(valueFor(a, field)),
				) || populated[1];
			conflicts.push({
				field,
				choice: null,
				deviceA: { id: a.deviceId, name: a.deviceName, value: valueFor(a, field) },
				deviceB: { id: b.deviceId, name: b.deviceName, value: valueFor(b, field) },
			});
		}
		const presentOnDeviceIds = new Set(ordered.map((record) => record.deviceId));
		const missingOnDeviceIds = validDeviceIds.filter((id) => !presentOnDeviceIds.has(id));
		// A write is an evidenced missing physical record, not every theoretical
		// source/peer permutation. Existing conflicts remain review decisions and
		// may not inflate the executable write matrix.
		const targetDeviceIds = [...missingOnDeviceIds];
		users.push({
			key,
			employeeId: ordered.find((record) => text(record.employeeId))?.employeeId || null,
			employee: null,
			vendorUserIds: [
				...new Set(ordered.map((record) => text(record.vendorUserId)).filter(Boolean)),
			],
			records: ordered,
			sourceRows: records.length,
			duplicateSourceRows: collapsed.duplicateSourceRows,
			sourceDeviceId: source.deviceId,
			targetDeviceIds,
			conflicts,
			missingOnDeviceIds,
		});
	}
	const idsReadByDevice: Record<string, number> = {};
	for (const id of selectedDeviceIds) idsReadByDevice[id] = 0;
	for (const user of users) {
		const seen = new Set(user.records.map((record) => record.deviceId));
		for (const deviceId of seen) {
			if (deviceId in idsReadByDevice) idsReadByDevice[deviceId] += 1;
			else idsReadByDevice[deviceId] = 1;
		}
	}
	const credentialWrites = users.flatMap(buildCredentialWritesForUser);
	return {
		deviceIds: selectedDeviceIds,
		validDeviceIds,
		failedDeviceIds: selectedDeviceIds.filter((id) => !validDeviceIdSet.has(id)),
		idsReadByDevice,
		users,
		unionUsers: users,
		onlyOnOneDevice: users.filter((user) => user.missingOnDeviceIds.length > 0),
		ambiguousMatches,
		missingHrisLinks: users.filter((user) => !user.employeeId),
		unreachableDevices: [],
		sdkErrors: [],
		plannedWrites: users.flatMap((user) =>
			user.targetDeviceIds.map((targetDeviceId) => ({ userKey: user.key, targetDeviceId })),
		),
		credentialWrites,
		unresolvedDecisions: [],
		counts: {
			unionUsers: users.length,
			sourceRows: sourceRowCount,
			dedupedDeviceRecords: users.reduce((sum, user) => sum + user.records.length, 0),
			duplicateSourceRows: users.reduce(
				(sum, user) =>
					sum +
					user.duplicateSourceRows.reduce(
						(total, duplicate) => total + Math.max(0, duplicate.sourceRows - 1),
						0,
					),
				0,
			),
			conflicts: users.reduce((sum, user) => sum + user.conflicts.length, 0),
			missing: users.reduce((sum, user) => sum + user.missingOnDeviceIds.length, 0),
			ambiguous: ambiguousMatches.length,
			missingHrisLinks: users.filter((user) => !user.employeeId).length,
			credentialWrites: credentialWrites.length,
			actionableCredentialWrites: credentialWrites.filter(
				(write) => write.executionEligibility === "ready_from_raw_blob",
			).length,
			blockedCredentialWrites: credentialWrites.filter(
				(write) => write.executionEligibility !== "ready_from_raw_blob",
			).length,
			validDevices: validDeviceIds.length,
			failedDevices: selectedDeviceIds.filter((id) => !validDeviceIdSet.has(id)).length,
		},
	};
};

const compactMergeRecordForReview = (record: DeviceUserMergeRecord) => {
	const summary = credentials(record);
	return {
		...record,
		rawPayload: {
			numOfFP: summary.fingerprintCount,
			numOfFace: summary.faceCount,
			numOfCard: summary.cardCount,
		},
	};
};

/**
 * Keep raw SDK payloads in the server-side plan used by apply, but never repeat
 * biometric template material in the browser review response. The former
 * unionUsers/onlyOnOneDevice/missingHrisLinks aliases duplicated the complete
 * user array during JSON serialization and made large six-panel plans unsafe to
 * inspect or download.
 */
export const serializeDeviceUserMergePlanForReview = (plan: any) => ({
	deviceIds: plan.deviceIds || [],
	validDeviceIds: plan.validDeviceIds || plan.deviceIds || [],
	failedDeviceIds: plan.failedDeviceIds || [],
	idsReadByDevice: plan.idsReadByDevice || {},
	devices: plan.devices || [],
	users: (plan.users || []).map((user: DeviceUserMergeGroup) => ({
		...user,
		records: (user.records || []).map(compactMergeRecordForReview),
	})),
	ambiguousMatches: (plan.ambiguousMatches || []).map((match: any) => ({
		...match,
		record: match?.record ? compactMergeRecordForReview(match.record) : match?.record,
	})),
	unreachableDevices: plan.unreachableDevices || [],
	sdkErrors: plan.sdkErrors || [],
	plannedWrites: plan.plannedWrites || [],
	credentialWrites: plan.credentialWrites || [],
	unresolvedDecisions: plan.unresolvedDecisions || [],
	counts: plan.counts || {},
	errors: plan.errors || [],
});

export const applyMergeChoices = (
	plan: ReturnType<typeof buildDeviceUserMergePlan>,
	params: {
		choices?: Record<string, Record<DeviceUserMergeField, MergeChoice>>;
		applyAll?: MergeChoice;
		selectedUserKeys?: string[];
	} = {},
) => {
	const unresolved: Array<{ key: string; field: DeviceUserMergeField }> = [];
	const selectedUserKeys = Array.isArray(params.selectedUserKeys)
		? new Set(params.selectedUserKeys.map((key) => text(key)).filter(Boolean))
		: null;
	const selectedUsers = selectedUserKeys
		? plan.users.filter((user) => selectedUserKeys.has(user.key))
		: plan.users;
	const resolved = selectedUsers.map((user) => ({
		...user,
		conflicts: user.conflicts.map((conflict) => {
			const choice =
				params.choices?.[user.key]?.[conflict.field] || params.applyAll || conflict.choice;
			if (!choice) unresolved.push({ key: user.key, field: conflict.field });
			return { ...conflict, choice: choice || null };
		}),
	}));
	const plannedWrites = (plan.plannedWrites || []).filter((write) =>
		selectedUserKeys ? selectedUserKeys.has(write.userKey) : true,
	);
	return {
		...plan,
		users: resolved,
		plannedWrites,
		unresolved,
		unresolvedDecisions: unresolved,
		executable:
			resolved.length > 0 &&
			unresolved.length === 0 &&
			plan.ambiguousMatches.length === 0 &&
			((plan as any).errors || []).length === 0,
		counts: {
			...plan.counts,
			unionUsers: resolved.length,
			conflicts: resolved.reduce((sum, user) => sum + user.conflicts.length, 0),
			missing: resolved.reduce((sum, user) => sum + user.missingOnDeviceIds.length, 0),
			missingHrisLinks: resolved.filter((user) => !user.employeeId).length,
		},
	};
};

export const shouldPreserveBiometricValue = (
	source: unknown,
	target: unknown,
	field: "face" | "fingerprint" | "card",
) =>
	Number(valueFor({ rawPayload: source } as DeviceUserMergeRecord, field)) >=
	Number(valueFor({ rawPayload: target } as DeviceUserMergeRecord, field));
