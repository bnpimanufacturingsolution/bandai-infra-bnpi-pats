import { extractHikvisionCredentialSummary } from "./device-user-sync.helper";

export const DEVICE_USER_MERGE_FIELDS = [
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
export type MergeChoice = "A" | "B";

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
	manualLink?: boolean;
};

export type DeviceUserMergeConflict = {
	field: DeviceUserMergeField;
	choice: MergeChoice | null;
	deviceA: { id: string; name: string; value: unknown };
	deviceB: { id: string; name: string; value: unknown };
};

export type DeviceUserMergeGroup = {
	key: string;
	employeeId: string | null;
	employee: unknown;
	vendorUserIds: string[];
	records: DeviceUserMergeRecord[];
	sourceDeviceId: string;
	targetDeviceIds: string[];
	conflicts: DeviceUserMergeConflict[];
	missingOnDeviceIds: string[];
};

const text = (value: unknown) => String(value ?? "").trim();
const stable = (value: unknown) => {
	if (value instanceof Date) return value.toISOString();
	if (value && typeof value === "object") return JSON.stringify(value);
	return text(value);
};
const credentials = (record: DeviceUserMergeRecord) =>
	extractHikvisionCredentialSummary((record.rawPayload || {}) as any);

const valueFor = (record: DeviceUserMergeRecord, field: DeviceUserMergeField): unknown => {
	if (field === "face") return credentials(record).faceCount;
	if (field === "fingerprint") return credentials(record).fingerprintCount;
	if (field === "card") return credentials(record).cardCount;
	return record[field];
};

const identityKey = (record: DeviceUserMergeRecord) => {
	if (text(record.employeeId)) return `employee:${text(record.employeeId)}`;
	return `vendor:${text(record.vendorUserId || record.employeeNo)}`;
};

export const buildDeviceUserMergePlan = (params: {
	records: DeviceUserMergeRecord[];
	deviceIds: string[];
}) => {
	const groups = new Map<string, DeviceUserMergeRecord[]>();
	for (const record of params.records) {
		const key = identityKey(record);
		if (!text(key)) continue;
		const group = groups.get(key) || [];
		group.push(record);
		groups.set(key, group);
	}

	const users: DeviceUserMergeGroup[] = [];
	for (const [key, records] of groups) {
		const ordered = [...records].sort((a, b) => a.deviceId.localeCompare(b.deviceId));
		const first = ordered[0];
		const conflicts: DeviceUserMergeConflict[] = [];
		for (const field of DEVICE_USER_MERGE_FIELDS) {
			const populated = ordered.filter((record) => valueFor(record, field) !== null && valueFor(record, field) !== undefined && stable(valueFor(record, field)) !== "");
			const distinct = [...new Set(populated.map((record) => stable(valueFor(record, field))))];
			if (distinct.length < 2) continue;
			const a = populated[0];
			const b = populated.find((record) => stable(valueFor(record, field)) !== stable(valueFor(a, field))) || populated[1];
			conflicts.push({
				field,
				choice: null,
				deviceA: { id: a.deviceId, name: a.deviceName, value: valueFor(a, field) },
				deviceB: { id: b.deviceId, name: b.deviceName, value: valueFor(b, field) },
			});
		}
		const deviceIds = new Set(ordered.map((record) => record.deviceId));
		users.push({
			key,
			employeeId: ordered.find((record) => text(record.employeeId))?.employeeId || null,
			employee: null,
			vendorUserIds: [...new Set(ordered.map((record) => text(record.vendorUserId)).filter(Boolean))],
			records: ordered,
			sourceDeviceId: first.deviceId,
			targetDeviceIds: params.deviceIds.filter((id) => id !== first.deviceId),
			conflicts,
			missingOnDeviceIds: params.deviceIds.filter((id) => !deviceIds.has(id)),
		});
	}
	return {
		deviceIds: params.deviceIds,
		users,
		counts: {
			unionUsers: users.length,
			conflicts: users.reduce((sum, user) => sum + user.conflicts.length, 0),
			missing: users.reduce((sum, user) => sum + user.missingOnDeviceIds.length, 0),
		},
	};
};

export const applyMergeChoices = (plan: ReturnType<typeof buildDeviceUserMergePlan>, params: {
	choices?: Record<string, Record<DeviceUserMergeField, MergeChoice>>;
	applyAll?: MergeChoice;
} = {}) => {
	const unresolved: Array<{ key: string; field: DeviceUserMergeField }> = [];
	const resolved = plan.users.map((user) => ({
		...user,
		conflicts: user.conflicts.map((conflict) => {
			const choice = params.choices?.[user.key]?.[conflict.field] || params.applyAll || conflict.choice;
			if (!choice) unresolved.push({ key: user.key, field: conflict.field });
			return { ...conflict, choice: choice || null };
		}),
	}));
	return { ...plan, users: resolved, unresolved, executable: unresolved.length === 0 };
};

export const shouldPreserveBiometricValue = (source: unknown, target: unknown, field: "face" | "fingerprint" | "card") =>
	Number(valueFor({ rawPayload: source } as DeviceUserMergeRecord, field)) >= Number(valueFor({ rawPayload: target } as DeviceUserMergeRecord, field));
