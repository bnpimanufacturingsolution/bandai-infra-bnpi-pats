export const ADVANCE_NOTICE_RESTRICTED_LEAVE_TYPES = new Set([
	"VACATION",
	"PERSONAL",
]);

export function resolveLeavePrefillDates(
	initialStartDate?: string,
	initialEndDate?: string,
): { startDate: string; endDate: string } | null {
	const startDate = String(initialStartDate || "").trim();
	if (!startDate) {
		return null;
	}
	const endDate = String(initialEndDate || "").trim() || startDate;
	return { startDate, endDate };
}

export function shouldApplyAdvanceNoticeRestrictions(
	leaveType: string,
	options?: { honorPrefilledDates?: boolean },
): boolean {
	const normalized = String(leaveType || "").trim().toUpperCase();
	if (normalized === "SICK") {
		return false;
	}
	if (!ADVANCE_NOTICE_RESTRICTED_LEAVE_TYPES.has(normalized)) {
		return false;
	}
	if (options?.honorPrefilledDates) {
		return false;
	}
	return true;
}