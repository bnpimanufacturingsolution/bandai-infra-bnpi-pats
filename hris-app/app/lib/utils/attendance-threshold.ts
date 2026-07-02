import type { AttendanceRecord } from "~/services/metrics.service";
import { getAttendanceFilterBucket } from "~/lib/utils/attendance-status";

const DEFAULT_PRESENT_DAY_THRESHOLD = 10;

const getAttendanceThresholdEmployeeKey = (record: AttendanceRecord): string =>
	String(record.employeeRefId || record.employeeId || record.employeeName || "").trim();

export const getEmployeesWithPresentDaysOverThreshold = (
	records: AttendanceRecord[],
	threshold = DEFAULT_PRESENT_DAY_THRESHOLD,
): Set<string> => {
	const presentDaysByEmployee = new Map<string, Set<string>>();

	records.forEach((record) => {
		const employeeKey = getAttendanceThresholdEmployeeKey(record);
		if (!employeeKey) return;
		if (getAttendanceFilterBucket(record) !== "WORK_DAY") return;

		const employeeDays = presentDaysByEmployee.get(employeeKey) || new Set<string>();
		employeeDays.add(record.date);
		presentDaysByEmployee.set(employeeKey, employeeDays);
	});

	return new Set(
		Array.from(presentDaysByEmployee.entries())
			.filter(([, days]) => days.size > threshold)
			.map(([employeeKey]) => employeeKey),
	);
};

export const filterAttendanceRecordsByPresentDayThreshold = (
	records: AttendanceRecord[],
	threshold = DEFAULT_PRESENT_DAY_THRESHOLD,
): AttendanceRecord[] => {
	const qualifyingEmployees = getEmployeesWithPresentDaysOverThreshold(records, threshold);
	if (!qualifyingEmployees.size) return [];

	return records.filter((record) =>
		qualifyingEmployees.has(getAttendanceThresholdEmployeeKey(record)),
	);
};
