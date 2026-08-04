/**
 * Device-only rawPackage import primitives.
 *
 * Intent (2026-08-03): CSV/device-user package import cares about **device**
 * UserInfo + fingerprint (and later face) custody first. HRIS employee linking
 * is optional and OFF by default — missing HRIS rows must never fail import.
 *
 * Shared by:
 * - controller device-user import execute path
 * - standalone execute scripts under `.runtime/...` (copy or require after build)
 *
 * Keep this file free of Express/Prisma so scripts can reuse the pure planners.
 */

export type RawPackageFingerprintTemplate = {
	fingerPrintId: number;
	fingerType: string | number;
	data: string;
	source?: string;
};

export type DeviceImportConflictField = "displayName" | "employeeNo" | "userType";

export type DeviceImportPlanAction =
	| "create_preview"
	| "match"
	| "review_conflict";

export type DeviceImportPlanRow = {
	vendorUserId: string;
	employeeNo: string;
	displayName: string;
	action: DeviceImportPlanAction;
	conflictFields: DeviceImportConflictField[];
	autoResolvedConflicts: DeviceImportConflictField[];
	/** Always informational only when includeHrisData=false. */
	missingEmployee: boolean;
	fingerprints: RawPackageFingerprintTemplate[];
	hasFaceBlob: boolean;
	rawUser: any;
};

export type DeviceImportHrisOptions = {
	/**
	 * When false (default), preview/execute never block or fail on HRIS employee
	 * presence. missingEmployee is still reported for UI badges only.
	 */
	includeHrisData?: boolean;
};

export const DEFAULT_DEVICE_IMPORT_HRIS_OPTIONS: Required<DeviceImportHrisOptions> = {
	includeHrisData: false,
};

export const resolveDeviceImportHrisOptions = (
	body: Record<string, unknown> | null | undefined,
): Required<DeviceImportHrisOptions> => {
	const raw =
		body?.includeHrisData ??
		body?.linkHrisEmployees ??
		body?.queryHrisEmployees ??
		false;
	const includeHrisData =
		raw === true || raw === "true" || raw === 1 || raw === "1";
	return { includeHrisData };
};

/** Dedupe fingerprint slots by fingerPrintId (prefer longest template data). */
export const dedupeRawPackageFingerprints = (
	templates: Array<Partial<RawPackageFingerprintTemplate> | null | undefined>,
): RawPackageFingerprintTemplate[] => {
	const byId = new Map<number, RawPackageFingerprintTemplate>();
	for (const template of templates || []) {
		if (!template) continue;
		const id = Number(template.fingerPrintId || 0) || 0;
		const data = String(template.data || "").trim();
		if (!id || !data) continue;
		const fingerType =
			template.fingerType === 0 || template.fingerType === "0"
				? "normalFP"
				: template.fingerType != null && template.fingerType !== ""
					? template.fingerType
					: "normalFP";
		const prev = byId.get(id);
		if (!prev || data.length > prev.data.length) {
			byId.set(id, {
				fingerPrintId: id,
				fingerType,
				data,
				source: template.source,
			});
		}
	}
	return Array.from(byId.values()).sort(
		(a, b) => a.fingerPrintId - b.fingerPrintId,
	);
};

export const buildHikvisionUserInfoUpsertBody = (params: {
	employeeNo: string;
	displayName?: string;
	userType?: string;
}): { UserInfo: Record<string, unknown> } => {
	const employeeNo = String(params.employeeNo || "").trim();
	const name = String(params.displayName || employeeNo).trim() || employeeNo;
	return {
		UserInfo: {
			employeeNo,
			name,
			userType: params.userType || "normal",
			Valid: {
				enable: true,
				beginTime: "2020-01-01T00:00:00",
				endTime: "2037-12-31T23:59:59",
				timeType: "local",
			},
			doorRight: "1",
			RightPlan: [{ doorNo: 1, planTemplateNo: "1" }],
		},
	};
};

export const buildHikvisionFingerprintDownloadBody = (params: {
	employeeNo: string;
	fingerPrintId: number;
	fingerType?: string | number;
	fingerData: string;
	enableCardReader?: number[];
}): { FingerPrintCfg: Record<string, unknown> } => ({
	FingerPrintCfg: {
		employeeNo: String(params.employeeNo || "").trim(),
		enableCardReader: params.enableCardReader || [1],
		fingerPrintID: Number(params.fingerPrintId || 1) || 1,
		fingerType:
			params.fingerType === 0 || params.fingerType === "0"
				? "normalFP"
				: params.fingerType != null && params.fingerType !== ""
					? params.fingerType
					: "normalFP",
		fingerData: String(params.fingerData || "").trim(),
	},
});

/**
 * Soft conflicts (displayName / userType) → match (overwrite biometrics).
 * Hard conflict (employeeNo mismatch on existing vendorUserId) → review_conflict.
 */
export const resolveDeviceImportPlanAction = (params: {
	current: { displayName?: string; name?: string; employeeNo?: string; userType?: string } | null;
	employeeNo: string;
	displayName: string;
	userType?: string;
}): {
	action: DeviceImportPlanAction;
	conflictFields: DeviceImportConflictField[];
	autoResolvedConflicts: DeviceImportConflictField[];
} => {
	const current = params.current;
	if (!current) {
		return { action: "create_preview", conflictFields: [], autoResolvedConflicts: [] };
	}
	const conflictFields: DeviceImportConflictField[] = [];
	const currentName = String(current.displayName || current.name || "").trim();
	const importedName = String(params.displayName || "").trim();
	if (currentName && importedName && currentName !== importedName) {
		conflictFields.push("displayName");
	}
	const currentEmp = String(current.employeeNo || "").trim();
	const importedEmp = String(params.employeeNo || "").trim();
	if (currentEmp && importedEmp && currentEmp !== importedEmp) {
		conflictFields.push("employeeNo");
	}
	const currentType = String(current.userType || "").trim();
	const importedType = String(params.userType || "normal").trim();
	if (currentType && importedType && currentType !== importedType) {
		conflictFields.push("userType");
	}
	const hard = conflictFields.filter((f) => f === "employeeNo");
	const softOnly = conflictFields.length > 0 && hard.length === 0;
	if (hard.length) {
		return {
			action: "review_conflict",
			conflictFields,
			autoResolvedConflicts: [],
		};
	}
	if (softOnly) {
		return {
			action: "match",
			conflictFields: [],
			autoResolvedConflicts: conflictFields,
		};
	}
	return { action: "match", conflictFields: [], autoResolvedConflicts: [] };
};

export const isAlreadyExistFingerprintError = (value: unknown) => {
	const text = String(value || "").toLowerCase();
	return (
		text.includes("alreadyexistfp") ||
		text.includes("already exist fp") ||
		text.includes("0x6000601c")
	);
};

export const isHikvisionWriteAccepted = (response: any) => {
	if (!response || typeof response !== "object") return false;
	if (Number(response.statusCode) === 1) return true;
	const status = String(response.statusString || "").toUpperCase();
	const sub = String(response.subStatusCode || "").toLowerCase();
	if (status === "OK" || sub === "ok") return true;
	return isAlreadyExistFingerprintError(
		`${response.subStatusCode || ""} ${response.errorMsg || ""} ${response.statusString || ""}`,
	);
};

/** Progress weights for device-only import jobs (UI bar). */
export const buildDeviceOnlyImportProgress = (params: {
	status: string;
	planned: number;
	processed: number;
}) => {
	const planned = Math.max(0, Number(params.planned || 0));
	const processed = Math.max(0, Number(params.processed || 0));
	const stages = [
		{ key: "queue", weight: 5, label: "Queued" },
		{ key: "write", weight: 85, label: "Writing biometrics" },
		{ key: "finalize", weight: 10, label: "Finalizing" },
	];
	let progressPercent = 2;
	if (params.status === "completed") progressPercent = 100;
	else if (params.status === "failed") {
		progressPercent = Math.min(
			99,
			Math.max(8, planned > 0 ? Math.round((processed / planned) * 100) : 8),
		);
	} else if (planned > 0) {
		const writeShare = Math.min(1, processed / planned);
		progressPercent = Math.min(95, Math.round(5 + writeShare * 85 + (processed > 0 ? 2 : 0)));
	}
	return {
		processed,
		progressPercent,
		progressLabel:
			params.status === "completed"
				? "Import complete"
				: params.status === "failed"
					? "Import failed"
					: planned > 0
						? `Writing ${processed} of ${planned} users`
						: "Import running",
		progressWeights: {
			waveNumerator: processed,
			waveDenominator: planned || 1,
			stages,
		},
	};
};
