export interface TimeSlot {
	type: string;
	label?: string | null;
	startTime: string;
	endTime: string;
}

export interface Shift {
	id?: string;
	name?: string;
	code?: string;
	isOff?: boolean;
	isOvernight?: boolean;
	breakMinutes?: number;
	graceLateMinutes?: number;
	graceEarlyOutMinutes?: number;
	timeSlots?: TimeSlot[];
}

export interface ScheduleTemplatePatternItem {
	day: number;
	shiftTypeId: string;
	shiftType?: Shift | null;
}

export interface WorkSchedule {
	id: string;
	organizationId: string;
	name: string;
	code: string;
	description?: string | null;
	cycleDays: number;
	pattern: ScheduleTemplatePatternItem[];
	isActive: boolean;
	isDeleted: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface CreateWorkScheduleRequest {
	name: string;
	code: string;
	description?: string | null;
	cycleDays: number;
	pattern: ScheduleTemplatePatternItem[];
	isActive?: boolean;
}

export interface UpdateWorkScheduleRequest extends Partial<CreateWorkScheduleRequest> {}

export interface WorkScheduleResponse {
	status?: string;
	message?: string;
	data: {
		scheduleTemplate?: WorkSchedule;
		schedule?: WorkSchedule;
	};
	code?: number;
	timestamp?: string;
}

export interface WorkSchedulesResponse {
	data?: WorkSchedule[] | { schedules?: WorkSchedule[]; scheduleTemplates?: WorkSchedule[] };
	schedules?: WorkSchedule[];
	scheduleTemplates?: WorkSchedule[];
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages?: number;
		hasNext?: boolean;
		hasPrev?: boolean;
	};
}

export interface DailySchedule {}
export interface LegacyTimeSlot {}
