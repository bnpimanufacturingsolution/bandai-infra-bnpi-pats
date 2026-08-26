// Leave-related types
export interface LeaveRequest {
	id: string;
	employeeId: string;
	employeeName: string;
	type: LeaveType;
	startDate: string;
	endDate: string;
	days: number;
	status: LeaveStatus;
	reason: string;
	submittedAt: string;
	reviewedAt?: string;
	reviewedBy?: string;
	comments?: string;
}

export type LeaveType =
	| "vacation"
	| "sick"
	| "personal"
	| "emergency"
	| "maternity"
	| "paternity"
	| "bereavement"
	| "jury_duty"
	| "military";

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface LeaveBalance {
	employeeId: string;
	year: number;
	leaveTypes: {
		[K in LeaveType]: {
			allocated: number;
			used: number;
			remaining: number;
		};
	};
}

export interface LeavePolicy {
	id: string;
	type: LeaveType;
	name: string;
	description: string;
	maxDaysPerYear: number;
	maxConsecutiveDays: number;
	requiresApproval: boolean;
	advanceNoticeDays: number;
	carryOverDays: number;
	isActive: boolean;
}

export interface LeaveCalendar {
	date: string;
	events: LeaveEvent[];
}

export interface LeaveEvent {
	id: string;
	employeeId: string;
	employeeName: string;
	type: LeaveType;
	startDate: string;
	endDate: string;
	status: LeaveStatus;
}
