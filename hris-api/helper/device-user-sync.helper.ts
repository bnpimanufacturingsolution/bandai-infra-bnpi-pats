type DeviceUserStatus = "ACTIVE" | "UNMATCHED" | "CONFLICT" | "DISABLED";

export type DeviceUserCandidate = {
	vendorUserId: string;
	employeeNo: string;
	displayName: string | null;
	userType: string | null;
	status: DeviceUserStatus;
	validFrom: Date | null;
	validTo: Date | null;
	doorRight: string | null;
	accessPlan: unknown;
	rawPayload: unknown;
	vendorMetadata?: unknown;
};

export type EmployeeMatchCandidate = {
	id: string;
	employeeId?: string | null;
	deviceEmpId?: string | null;
};

export type DeviceUserLinkDecision = {
	status: DeviceUserStatus;
	employeeId: string | null;
	matchCount: number;
	matchReason: "deviceEmpId" | "employeeId" | "none" | "ambiguous" | "disabled";
};

const normalizeText = (value: unknown) => String(value ?? "").trim();

export const buildDeviceUserEmployeeNoCandidates = (value: string) => {
	const text = normalizeText(value);
	if (!text) return [];
	const candidates = new Set<string>([text]);
	if (/^\d+$/.test(text)) {
		const stripped = text.replace(/^0+/, "") || "0";
		candidates.add(stripped);
		candidates.add(stripped.padStart(5, "0"));
	}
	return [...candidates].filter(Boolean);
};

const parseOptionalDeviceDate = (value: unknown) => {
	const text = normalizeText(value);
	if (!text) return null;
	const parsed = new Date(text);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const readFirstFiniteNumber = (...values: unknown[]) => {
	for (const value of values) {
		if (value === null || value === undefined || value === "") continue;
		const numeric = Number(value);
		if (Number.isFinite(numeric)) return numeric;
	}
	return null;
};

const readArrayCount = (...values: unknown[]) => {
	for (const value of values) {
		if (Array.isArray(value)) return value.length;
	}
	return null;
};

const isUserEnabled = (rawUser: any) => {
	const valid = rawUser?.Valid || rawUser?.valid || {};
	const enabled = valid?.enable;
	if (enabled === false) return false;
	if (String(rawUser?.status || "").toUpperCase() === "DISABLED") return false;
	return true;
};

export const extractHikvisionCredentialSummary = (rawUser: any) => {
	const fingerprintCount =
		readFirstFiniteNumber(
			rawUser?.numOfFP,
			rawUser?.numOfFingerPrint,
			rawUser?.fingerPrintNum,
			rawUser?.fingerprintCount,
			rawUser?.numOfFingerprint,
		) ??
		readArrayCount(
			rawUser?.FingerPrintList,
			rawUser?.FingerPrint,
			rawUser?.fingerPrint,
			rawUser?.fingerprints,
		) ??
		0;
	const cardCount =
		readFirstFiniteNumber(
			rawUser?.numOfCard,
			rawUser?.cardNum,
			rawUser?.cardCount,
		) ??
		readArrayCount(rawUser?.CardList, rawUser?.Cards, rawUser?.cards) ??
		(normalizeText(rawUser?.cardNo) ? 1 : 0);
	const faceCount =
		readFirstFiniteNumber(
			rawUser?.numOfFace,
			rawUser?.faceNum,
			rawUser?.faceCount,
		) ??
		readArrayCount(rawUser?.FaceList, rawUser?.Faces, rawUser?.faces) ??
		0;
	return {
		fingerprintCount,
		cardCount,
		faceCount,
		hasFingerprint: fingerprintCount > 0,
		hasCard: cardCount > 0,
		hasFace: faceCount > 0,
	};
};

export const normalizeHikvisionDeviceUser = (rawUser: any): DeviceUserCandidate | null => {
	const vendorUserId = normalizeText(rawUser?.employeeNo || rawUser?.employeeNoString || rawUser?.userId);
	if (!vendorUserId) return null;
	const valid = rawUser?.Valid || rawUser?.valid || {};
	const credentialSummary = extractHikvisionCredentialSummary(rawUser);
	return {
		vendorUserId,
		employeeNo: vendorUserId,
		displayName: normalizeText(rawUser?.name || rawUser?.employeeName) || null,
		userType: normalizeText(rawUser?.userType) || null,
		status: isUserEnabled(rawUser) ? "UNMATCHED" : "DISABLED",
		validFrom: parseOptionalDeviceDate(valid?.beginTime),
		validTo: parseOptionalDeviceDate(valid?.endTime),
		doorRight: normalizeText(rawUser?.doorRight) || null,
		accessPlan: rawUser?.RightPlan || rawUser?.rightPlan || null,
		rawPayload: {
			...(rawUser || {}),
			_hrisDeviceMetadata: {
				vendor: "Hikvision",
				source: "UserInfo/Search",
				credentialSummary,
			},
		},
		vendorMetadata: {
			vendor: "Hikvision",
			source: "UserInfo/Search",
			vendorUserId,
			employeeNo: vendorUserId,
			capturedAt: new Date().toISOString(),
			credentialSummary,
			rawVendorPayload: rawUser || {},
		},
	};
};

export const resolveDeviceUserLinkDecision = (
	candidate: Pick<DeviceUserCandidate, "employeeNo" | "status">,
	employees: EmployeeMatchCandidate[],
): DeviceUserLinkDecision => {
	if (candidate.status === "DISABLED") {
		return {
			status: "DISABLED",
			employeeId: null,
			matchCount: 0,
			matchReason: "disabled",
		};
	}

	const employeeNo = normalizeText(candidate.employeeNo);
	// Truth: DeviceUser.vendorUserId / device person plain id is "15".
	// Employee.deviceEmpId is the same plain id ("15"), not padded.
	// Employee.employeeId may be zero-padded org code ("00015" / "01029") — pad variants apply there.
	const personIdCandidates = new Set(buildDeviceUserEmployeeNoCandidates(employeeNo));
	const directMatches = employees.filter((employee) => {
		const deviceEmpId = normalizeText(employee.deviceEmpId);
		if (!deviceEmpId) return false;
		// Prefer exact plain match (deviceEmpId "15" === vendor "15").
		if (deviceEmpId === employeeNo) return true;
		if (personIdCandidates.has(deviceEmpId)) return true;
		return buildDeviceUserEmployeeNoCandidates(deviceEmpId).some((c) =>
			personIdCandidates.has(c),
		);
	});
	if (directMatches.length === 1) {
		return {
			status: "ACTIVE",
			employeeId: directMatches[0].id,
			matchCount: 1,
			matchReason: "deviceEmpId",
		};
	}
	if (directMatches.length > 1) {
		return {
			status: "CONFLICT",
			employeeId: null,
			matchCount: directMatches.length,
			matchReason: "ambiguous",
		};
	}

	const employeeNoCandidates = [...personIdCandidates];
	const employeeIdMatches = employees.filter((employee) =>
		employeeNoCandidates.includes(normalizeText(employee.employeeId)),
	);
	if (employeeIdMatches.length === 1) {
		return {
			status: "ACTIVE",
			employeeId: employeeIdMatches[0].id,
			matchCount: 1,
			matchReason: "employeeId",
		};
	}
	if (employeeIdMatches.length > 1) {
		return {
			status: "CONFLICT",
			employeeId: null,
			matchCount: employeeIdMatches.length,
			matchReason: "ambiguous",
		};
	}

	return {
		status: "UNMATCHED",
		employeeId: null,
		matchCount: 0,
		matchReason: "none",
	};
};

export const summarizeDeviceUserStatuses = (
	rows: Array<{ status?: string | null; employeeId?: string | null }>,
) => {
	const summary = {
		total: rows.length,
		active: 0,
		matched: 0,
		unmatched: 0,
		conflict: 0,
		disabled: 0,
	};
	for (const row of rows) {
		const status = String(row.status || "").toUpperCase();
		if (status === "CONFLICT") summary.conflict += 1;
		else if (status === "DISABLED") summary.disabled += 1;
		else if (row.employeeId || status === "ACTIVE") {
			summary.active += 1;
			summary.matched += 1;
		}
		else summary.unmatched += 1;
	}
	return summary;
};
