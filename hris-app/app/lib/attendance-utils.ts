export interface AttendanceRecord {
	id: string;
	date: string;
	fullDate: string; // e.g. "July 16th, 2022"
	totalHours: string;
	timeRange: string;
	status: "Present" | "Late" | "Absent" | "Half Day" | string;
	rejectedBy?: string;
	approvedBy?: string;
}

export function parseTimeRange(timeRange: string): [string, string] {
	if (!timeRange) return ["", ""];
	return timeRange.includes("...") 
		? (timeRange.split("...") as [string, string])
		: [timeRange, ""];
}
