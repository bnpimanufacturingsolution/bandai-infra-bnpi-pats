export interface YearlySchedulePayload {
	name: string;
	year: number;
	description?: string;
	defaultWorkScheduleId: string;
	effectiveFrom: string; // ISO date
	effectiveTo: string; // ISO date
	overtimeEligible: boolean;
	overtimePayMultiplier: number; // e.g., 1.5
	maxOvertimeHoursPerDay: number; // hours as float
	allowUndertimeRecovery: boolean;
	undertimeDeductionPercentage: number; // 0-100
	status: "DRAFT" | "ACTIVE" | "ARCHIVED";
}

export interface YearlySchedule extends YearlySchedulePayload {
	id: string;
	organizationId: string;
	createdAt: string;
	updatedAt: string;
}

export interface YearlyScheduleResponse {
	status: string;
	message: string;
	data: {
		yearlyschedule: YearlySchedule;
	};
	code: number;
	timestamp: string;
}

export interface YearlySchedulesResponse {
	status: string;
	message: string;
	data: {
		yearlyschedules: YearlySchedule[];
	};
	code: number;
	timestamp: string;
}
