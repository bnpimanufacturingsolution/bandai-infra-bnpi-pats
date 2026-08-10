/**
 * Pure patch decisions for applying BNPI approved OT workbook rows onto
 * effective Timesheetline snapshots.
 *
 * Product rule (2026-08-11):
 * - OT source with zero regular/OT/premium buckets on a scheduled workday → ABSENT
 *   (not REST_DAY). REST_DAY only when schedule isOff / true rest / LEAVE preserved.
 * - Always stamp bandaiPayrollSourceRepair.approvedBuckets so payroll can pay OT.
 */

export type BandaiOtSourceRow = {
	rowNumber: number;
	date: string;
	employeeNo: string;
	regularDays: number;
	regOtHrs: number;
	regNdHrs: number;
	spclHrs: number;
	spclOtHrs: number;
	rholHrs: number;
	rholOtHrs: number;
	rdHrs: number;
	rdOtHrs: number;
};

export type BandaiOtLineLike = {
	status?: string | null;
	hoursWorked?: string | null;
	regularHours?: string | null;
	overtimeHours?: string | null;
	lateHours?: string | null;
	earlyOutHours?: string | null;
	undertimeHours?: string | null;
	primaryMarker?: string | null;
	metadata?: Record<string, any> | null;
	scheduleSnapshot?: Record<string, any> | null;
	timeIn?: Date | string | null;
	timeOut?: Date | string | null;
};

const APPROVED_BUCKET_KEYS = [
	"regularDays",
	"regOtHrs",
	"regNdHrs",
	"spclHrs",
	"spclOtHrs",
	"rholHrs",
	"rholOtHrs",
	"rdHrs",
	"rdOtHrs",
] as const;

export function timeToMinutes(value: unknown): number {
	const raw = String(value ?? "").trim();
	if (!raw) return 0;
	const [hours, minutes = 0] = raw.split(":").map(Number);
	return (hours || 0) * 60 + (minutes || 0);
}

export function hoursToTime(hours: number): string {
	const totalMinutes = Math.max(0, Math.round(hours * 60));
	return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

export function approvedOvertimeHours(source: BandaiOtSourceRow): number {
	return source.regOtHrs + source.spclOtHrs + source.rholOtHrs + source.rdOtHrs;
}

export function approvedPremiumHours(source: BandaiOtSourceRow): number {
	return (
		source.spclHrs +
		source.spclOtHrs +
		source.rholHrs +
		source.rholOtHrs +
		source.rdHrs +
		source.rdOtHrs
	);
}

export function hasAnyApprovedPayBucket(source: BandaiOtSourceRow): boolean {
	return (
		source.regularDays > 0 ||
		source.regOtHrs > 0 ||
		source.regNdHrs > 0 ||
		source.spclHrs > 0 ||
		source.spclOtHrs > 0 ||
		source.rholHrs > 0 ||
		source.rholOtHrs > 0 ||
		source.rdHrs > 0 ||
		source.rdOtHrs > 0
	);
}

export function approvedBucketsDiffer(
	current: unknown,
	source: BandaiOtSourceRow,
): boolean {
	if (!current || typeof current !== "object" || Array.isArray(current)) return true;
	const bucket = current as Record<string, unknown>;
	return APPROVED_BUCKET_KEYS.some(
		(key) => Math.abs(Number(bucket[key] || 0) - Number(source[key] || 0)) > 0.001,
	);
}

export function hasPayrollPremiumMarker(line: BandaiOtLineLike): boolean {
	const marker = String(line.primaryMarker || line.metadata?.primaryMarker || "").toUpperCase();
	return (
		marker === "HOLIDAY" ||
		marker === "REST_DAY" ||
		Array.isArray(line.metadata?.holidayEntries) ||
		Boolean(line.metadata?.holidayType || line.metadata?.holidayTitle)
	);
}

export function withoutPremiumMetadata(metadata: Record<string, any>): Record<string, any> {
	const {
		holidayEntries: _holidayEntries,
		holidayType: _holidayType,
		holidayTitle: _holidayTitle,
		isDoubleHoliday: _isDoubleHoliday,
		...rest
	} = metadata;
	return rest;
}

/**
 * True when the line's schedule snapshot says the day is an off/rest day.
 * Falls back to existing REST_DAY status when snapshot is missing.
 */
export function isScheduledRestDay(line: BandaiOtLineLike): boolean {
	const snap =
		line.scheduleSnapshot ||
		(line.metadata && typeof line.metadata === "object"
			? (line.metadata as any).scheduleSnapshot
			: null) ||
		null;
	if (snap && typeof snap === "object") {
		if (snap.isOff === true) return true;
		if (String(snap.code || "").toUpperCase() === "OFF") return true;
		if (String(snap.shiftTypeCode || "").toUpperCase() === "OFF") return true;
		if (snap.isOff === false) return false;
	}
	// Without a schedule snapshot, only treat explicit OFF codes as rest.
	// Do not treat status=REST_DAY alone as authoritative (prior OT bug mislabeled absences).
	return false;
}

export function buildApprovedBuckets(source: BandaiOtSourceRow) {
	return {
		regularDays: source.regularDays,
		regOtHrs: source.regOtHrs,
		regNdHrs: source.regNdHrs,
		spclHrs: source.spclHrs,
		spclOtHrs: source.spclOtHrs,
		rholHrs: source.rholHrs,
		rholOtHrs: source.rholOtHrs,
		rdHrs: source.rdHrs,
		rdOtHrs: source.rdOtHrs,
	};
}

export function buildBandaiOtRepairMetadata(params: {
	line: BandaiOtLineLike;
	source: BandaiOtSourceRow;
	sourceLabel?: string;
	appliedAt?: string;
}): Record<string, any> {
	const sourceLabel = params.sourceLabel || "rptOvertimeDetails.xlsx";
	return {
		...(params.line.metadata || {}),
		bandaiPayrollSourceRepair: {
			source: sourceLabel,
			sourceRow: params.source.rowNumber,
			employeeNo: params.source.employeeNo,
			date: params.source.date,
			appliedAt: params.appliedAt || new Date().toISOString(),
			previous: {
				status: params.line.status,
				hoursWorked: params.line.hoursWorked,
				regularHours: params.line.regularHours,
				overtimeHours: params.line.overtimeHours,
				primaryMarker: params.line.primaryMarker,
			},
			approvedBuckets: buildApprovedBuckets(params.source),
		},
	};
}

export type BandaiOtLinePatch = {
	changes: Record<string, any>;
	reasons: string[];
};

/**
 * Decide Timesheetline field updates from one OT source row.
 */
export function buildBandaiOtLinePatch(params: {
	line: BandaiOtLineLike;
	source: BandaiOtSourceRow;
	isCalendarHoliday?: boolean;
	sourceLabel?: string;
	appliedAt?: string;
}): BandaiOtLinePatch | null {
	const { line, source } = params;
	const isCalendarHoliday = Boolean(params.isCalendarHoliday);
	const currentOvertime = timeToMinutes(line.overtimeHours) / 60;
	const targetOvertime = approvedOvertimeHours(source);
	const sourceHasPayBucket = hasAnyApprovedPayBucket(source);
	const sourceHasPremiumBucket = approvedPremiumHours(source) > 0;
	const status = String(line.status || "").toUpperCase();
	const changes: Record<string, any> = {};
	const reasons: string[] = [];
	const metadata = buildBandaiOtRepairMetadata({
		line,
		source,
		sourceLabel: params.sourceLabel,
		appliedAt: params.appliedAt,
	});

	// Always refresh approved bucket metadata when source differs or is missing.
	// Payroll pays OT from approvedBuckets, not raw biometric overtimeHours alone.
	if (approvedBucketsDiffer(line.metadata?.bandaiPayrollSourceRepair?.approvedBuckets, source)) {
		changes.metadata = metadata;
		reasons.push("approved bucket metadata refreshed from overtime source");
	}

	if (Math.abs(currentOvertime - targetOvertime) > 0.01) {
		changes.overtimeHours = hoursToTime(targetOvertime);
		reasons.push(`overtime ${currentOvertime.toFixed(2)}h -> ${targetOvertime.toFixed(2)}h`);
	}

	if (!sourceHasPayBucket) {
		// Preserve leave; true rest stays REST_DAY; scheduled workdays become ABSENT.
		if (status === "LEAVE") {
			// no status change
		} else if (isScheduledRestDay(line)) {
			// True schedule off-day only. Do NOT trust existing status=REST_DAY alone —
			// OT apply previously mislabeled absences as REST_DAY.
			if (status !== "REST_DAY") {
				changes.status = "REST_DAY";
				changes.primaryMarker = "REST_DAY";
				reasons.push(`${line.status} -> REST_DAY (schedule off / rest day, zero pay buckets)`);
			}
			changes.hoursWorked = "0:00";
			changes.regularHours = "0:00";
			changes.overtimeHours = "0:00";
			changes.lateHours = "0:00";
			changes.earlyOutHours = "0:00";
			changes.undertimeHours = "0:00";
			if (status === "REST_DAY" && !reasons.some((r) => r.includes("REST_DAY"))) {
				reasons.push("zero pay buckets on rest day: hours cleared");
			}
		} else {
			// Scheduled workday with no OT pay buckets:
			// - No punch evidence → ABSENT (full-day no-show)
			// - Has punch evidence but source pays nothing → INCOMPLETE (do not invent a 4th absent day)
			const hasPunchEvidence = Boolean(line.timeIn || line.timeOut);
			const targetStatus = hasPunchEvidence ? "INCOMPLETE" : "ABSENT";
			if (status !== targetStatus) {
				changes.status = targetStatus;
				changes.primaryMarker = targetStatus;
				reasons.push(
					`${line.status || "UNKNOWN"} -> ${targetStatus} because source has zero regular/OT/premium buckets on scheduled workday`,
				);
			} else {
				reasons.push(
					`${targetStatus} confirmed: source has zero regular/OT/premium buckets`,
				);
			}
			changes.hoursWorked = "0:00";
			changes.regularHours = "0:00";
			changes.overtimeHours = "0:00";
			// Keep late/early evidence on incomplete punch days; clear on pure no-show.
			if (!hasPunchEvidence) {
				changes.lateHours = "0:00";
				changes.earlyOutHours = "0:00";
				changes.undertimeHours = "0:00";
			}
			changes.notes = hasPunchEvidence
				? "BNPI OT source: zero regular/OT/premium buckets with punch evidence; marked incomplete (unpaid)."
				: "BNPI OT source: scheduled workday with zero regular/OT/premium buckets; marked absent.";
		}
	} else if (
		source.regularDays > 0 &&
		!sourceHasPremiumBucket &&
		status === "PRESENT" &&
		(isCalendarHoliday || hasPayrollPremiumMarker(line))
	) {
		changes.status = "HOLIDAY";
		changes.primaryMarker = "HOLIDAY";
		changes.metadata = {
			...withoutPremiumMetadata(metadata),
			primaryMarker: "HOLIDAY",
		};
		reasons.push(
			"cleared premium marker because source has regular day but zero holiday/rest premium buckets",
		);
	}

	// If we only cleared hours on rest day with no other delta and buckets already matched,
	// still ensure metadata is stamped when missing.
	if (!Object.keys(changes).length) {
		// Force stamp approvedBuckets even when hours already match, so payroll can pay OT.
		if (!line.metadata?.bandaiPayrollSourceRepair?.approvedBuckets) {
			return {
				changes: { metadata },
				reasons: ["approved bucket metadata stamped for payroll OT pay"],
			};
		}
		return null;
	}

	changes.metadata = changes.metadata || metadata;
	return { changes, reasons };
}
