export interface Holiday {
	id: string;
	name: string;
	description?: string;
	type: "GOVERNMENT" | "COMPANY";
	category: "WORKING_HOLIDAY" | "NON_WORKING_HOLIDAY";
	date: string;
	yearlyScheduleId: string;
	workingType: "NO_WORK_FULL_PAY" | "NO_WORK_NO_PAY" | "WORK_FULL_PAY" | "WORK_HALF_PAY";
	isAppliedToAll: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface CreateHolidayRequest {
	name: string;
	description?: string;
	type: "GOVERNMENT" | "COMPANY";
	category: "WORKING_HOLIDAY" | "NON_WORKING_HOLIDAY";
	date: string;
	yearlyScheduleId: string;
	workingType: "NO_WORK_FULL_PAY" | "NO_WORK_NO_PAY" | "WORK_FULL_PAY" | "WORK_HALF_PAY";
	isAppliedToAll: boolean;
}

export interface UpdateHolidayRequest {
	name?: string;
	description?: string;
	type?: "GOVERNMENT" | "COMPANY";
	category?: "WORKING_HOLIDAY" | "NON_WORKING_HOLIDAY";
	date?: string;
	yearlyScheduleId?: string;
	workingType?: "NO_WORK_FULL_PAY" | "NO_WORK_NO_PAY" | "WORK_FULL_PAY" | "WORK_HALF_PAY";
	isAppliedToAll?: boolean;
}

export interface HolidayResponse {
	status: string;
	message: string;
	data: {
		holiday: Holiday;
	};
}

export interface HolidaysResponse {
	status: string;
	message: string;
	data: {
		holidays: Holiday[];
	};
}
