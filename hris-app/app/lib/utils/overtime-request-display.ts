export type OvertimeRequestMetadata = Record<string, unknown>;

const formatMinutesAsTime = (minutes: number): string => {
	const safeMinutes = Math.max(0, Math.round(minutes));
	const hours = Math.floor(safeMinutes / 60);
	const remainder = safeMinutes % 60;
	return `${hours}:${String(remainder).padStart(2, "0")}`;
};

const parseDurationToMinutes = (timeStr?: string | null): number => {
	if (!timeStr || timeStr === "0:00") return 0;
	const [hours, minutes] = String(timeStr).split(":").map(Number);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
	return hours * 60 + minutes;
};

export const getOvertimeRequestHoursLabel = (
	metadata?: OvertimeRequestMetadata | null,
): string | null => {
	if (!metadata) return null;

	const hhmmCandidate =
		metadata.detectedOvertimeHours ??
		metadata.pendingOvertimeHours ??
		metadata.overtimeHours;
	if (typeof hhmmCandidate === "string" && hhmmCandidate.trim() && hhmmCandidate !== "0:00") {
		return hhmmCandidate.trim();
	}

	const minutes = Math.max(
		0,
		Number(
			metadata.detectedOvertimeMinutes ??
				metadata.pendingOvertimeMinutes ??
				metadata.overtimeMinutes ??
				0,
		),
	);
	if (minutes > 0) return formatMinutesAsTime(minutes);

	const decimalHours = metadata.hours ?? metadata.totalHours;
	if (decimalHours != null && decimalHours !== "") {
		const parsed = Number(decimalHours);
		if (Number.isFinite(parsed) && parsed > 0) {
			return formatMinutesAsTime(Math.round(parsed * 60));
		}
	}

	return null;
};

export const getOvertimeRequestMinutes = (
	metadata?: OvertimeRequestMetadata | null,
): number => {
	if (!metadata) return 0;

	const minutes = Number(
		metadata.detectedOvertimeMinutes ??
			metadata.pendingOvertimeMinutes ??
			metadata.overtimeMinutes ??
			0,
	);
	if (Number.isFinite(minutes) && minutes > 0) return minutes;

	const hoursLabel = getOvertimeRequestHoursLabel(metadata);
	return hoursLabel ? parseDurationToMinutes(hoursLabel) : 0;
};

export const getOvertimeCandidateReasonLabel = (reason?: unknown): string | null => {
	const normalized = String(reason || "").trim().toUpperCase();
	if (!normalized) return null;

	const labels: Record<string, string> = {
		POST_SHIFT_EXCESS: "Post-shift excess",
		REST_DAY: "Rest day work",
		HOLIDAY: "Holiday work",
	};

	return labels[normalized] || normalized.replace(/_/g, " ").toLowerCase();
};