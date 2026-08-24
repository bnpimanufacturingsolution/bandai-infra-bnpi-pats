export type AttendanceUtilizationMetrics = {
	totalClockedIn?: number | null;
	totalClockedInObligated?: number | null;
	totalObligatedToWork?: number | null;
	totalScheduledWorkDays?: number | null;
	totalNotClockedIn?: number | null;
	totalAbsent?: number | null;
	totalOnLeave?: number | null;
	totalLate?: number | null;
	totalOnTime?: number | null;
	totalClockedOut?: number | null;
	utilizationRate?: number | null;
	avgAttendanceRate?: number | null;
};

export const ATTENDANCE_UTILIZATION_DENOMINATOR_LABEL = "scheduled to work";

export function getAttendanceUtilizationDisplay(metrics?: AttendanceUtilizationMetrics | null) {
	const reportedObligated = Math.max(
		0,
		Number(metrics?.totalObligatedToWork ?? metrics?.totalScheduledWorkDays ?? 0) || 0,
	);
	const allClockedIn = Math.max(0, Number(metrics?.totalClockedIn || 0) || 0);
	const reportedClockedInObligated = Number(metrics?.totalClockedInObligated);
	const clockedIn =
		Number.isFinite(reportedClockedInObligated) &&
		(reportedClockedInObligated > 0 || reportedObligated > 0)
			? Math.max(0, reportedClockedInObligated)
			: allClockedIn;
	const presenceFallback =
		clockedIn +
		(Number(metrics?.totalNotClockedIn || 0) || 0) +
		(Number(metrics?.totalAbsent || 0) || 0);
	const obligated = reportedObligated > 0 ? reportedObligated : presenceFallback;
	const rate = obligated > 0 ? Math.round((clockedIn / obligated) * 100) : 0;
	const rawRate = obligated > 0 ? (clockedIn / obligated) * 100 : 0;

	return {
		clockedIn,
		obligated,
		rate,
		rateLabel: formatAttendanceRateLabel(rawRate),
		denominatorLabel: ATTENDANCE_UTILIZATION_DENOMINATOR_LABEL,
	};
}

export function formatAttendanceRateLabel(rawPercent: number): string {
	if (!Number.isFinite(rawPercent) || rawPercent <= 0) return "0%";
	return `${Math.max(1, Math.round(rawPercent))}%`;
}

export function getScheduledNotClockedIn(metrics?: AttendanceUtilizationMetrics | null) {
	const utilization = getAttendanceUtilizationDisplay(metrics);
	const absent = Math.max(0, Number(metrics?.totalAbsent || 0) || 0);
	const reported = Math.max(0, Number(metrics?.totalNotClockedIn || 0) || 0);
	if (utilization.obligated <= 0) return reported;
	// Same people as "of N scheduled to work". A leftover obligation-row count
	// (for example 76) must not replace the 1706 scheduled without a punch.
	return Math.max(0, utilization.obligated - utilization.clockedIn - absent);
}

export function getAttendanceCardCounts(metrics?: AttendanceUtilizationMetrics | null) {
	const utilization = getAttendanceUtilizationDisplay(metrics);
	const lateCount = Math.max(0, Number(metrics?.totalLate) || 0);
	const onTimeRaw = metrics?.totalOnTime;
	const onTimeCount = Number.isFinite(Number(onTimeRaw))
		? Math.max(0, Number(onTimeRaw))
		: Math.max(0, utilization.clockedIn - lateCount);
	const clockedIn = Math.max(utilization.clockedIn, onTimeCount + lateCount);
	const clockedOut = Math.max(0, Number(metrics?.totalClockedOut) || 0);
	return {
		clockedIn,
		onTimeCount,
		lateCount,
		clockedOut,
	};
}

export function getAbsenteeismDisplay(metrics?: AttendanceUtilizationMetrics | null) {
	const utilization = getAttendanceUtilizationDisplay(metrics);
	const absent = Math.max(0, Number(metrics?.totalAbsent || 0) || 0);
	const notClockedIn = getScheduledNotClockedIn(metrics);
	const count = absent + notClockedIn;
	const scheduled = utilization.obligated;
	const rate = scheduled > 0 ? Math.round((count / scheduled) * 100) : 0;

	return {
		absent,
		notClockedIn,
		count,
		scheduled,
		rate,
		denominatorLabel: ATTENDANCE_UTILIZATION_DENOMINATOR_LABEL,
	};
}
