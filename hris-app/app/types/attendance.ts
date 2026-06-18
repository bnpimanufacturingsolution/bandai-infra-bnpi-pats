// Attendance-related types
export interface AttendanceRecord {
	id: string;
	employeeId: string;
	employeeName?: string;
	date: string;
	clockIn?: string;
	clockOut?: string;
	hoursWorked: number;
	status: AttendanceStatus;
	location?: string;
	device?: string;
	notes?: string;
	approvedBy?: string;
	approvedAt?: string;
	approvalStatus?: AttendanceApprovalStatus;
	managerNotes?: string;
}

export type AttendanceStatus =
	| "present"
	| "absent"
	| "late"
	| "half_day"
	| "overtime"
	| "holiday"
	| "sick"
	| "vacation";

export type AttendanceApprovalStatus =
	| "pending_approval"
	| "approved"
	| "rejected"
	| "pending_hr_review";

export interface TimeEntry {
	id: string;
	employeeId: string;
	date: string;
	clockIn: string;
	clockOut?: string;
	breakStart?: string;
	breakEnd?: string;
	totalHours: number;
	overtimeHours: number;
	status: AttendanceStatus;
	location: string;
	device: string;
}

export interface AttendanceSummary {
	employeeId: string;
	period: string;
	totalDays: number;
	workingDays: number;
	presentDays: number;
	absentDays: number;
	lateDays: number;
	totalHours: number;
	overtimeHours: number;
	attendancePercentage: number;
}

export interface AttendancePolicy {
	id: string;
	name: string;
	description: string;
	workingHours: {
		start: string;
		end: string;
	};
	breakDuration: number;
	lateThreshold: number;
	overtimeThreshold: number;
	flexibleHours: boolean;
	remoteWorkAllowed: boolean;
	locations: string[];
}

export interface Shift {
	id: string;
	name: string;
	startTime: string;
	endTime: string;
	breakDuration: number;
	department?: string;
	isActive: boolean;
}

export interface Schedule {
	id: string;
	employeeId: string;
	date: string;
	shiftId: string;
	shiftName: string;
	startTime: string;
	endTime: string;
	status: "scheduled" | "completed" | "cancelled";
}

export interface WeeklyAttendanceApproval {
	employeeId: string;
	employeeName: string;
	department: string;
	weekStartDate: string;
	weekEndDate: string;
	records: AttendanceRecord[];
	totalHours: number;
	totalDays: number;
	presentDays: number;
	lateDays: number;
	absentDays: number;
	approvalStatus: AttendanceApprovalStatus;
}
