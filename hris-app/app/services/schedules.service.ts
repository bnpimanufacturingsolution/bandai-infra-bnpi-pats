import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";

export interface ShiftTimeSlot {
	type: string;
	label?: string | null;
	startTime: string;
	endTime: string;
}

export interface ShiftType {
	id: string;
	organizationId: string;
	name: string;
	code: string;
	isOvernight: boolean;
	isOff: boolean;
	timeSlots: ShiftTimeSlot[];
	shiftHour: number;
	isActive: boolean;
	isDeleted: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface ScheduleTemplatePatternItem {
	day: number;
	shiftTypeId?: string | null;
	shiftSnapshot?: {
		name?: string | null;
		code?: string | null;
		description?: string | null;
		startTime?: string | null;
		endTime?: string | null;
		breakMinutes?: number | null;
		isOvernight?: boolean;
		isOff?: boolean;
		timeSlots?: ShiftTimeSlot[];
		shiftHour?: number;
	} | null;
	shiftType?: ShiftType | null;
	shiftHour?: number;
}

export interface ScheduleTemplate {
	id: string;
	organizationId: string;
	name: string;
	code: string;
	description?: string | null;
	cycleDays: number;
	graceLateMinutes: number;
	graceEarlyOutMinutes: number;
	pattern: ScheduleTemplatePatternItem[];
	totalHour: number;
	totalDay: number;
	isActive: boolean;
	isDeleted: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface EmployeeScheduleAssignment {
	id: string;
	organizationId: string;
	employeeId: string;
	scheduleTemplateId?: string | null;
	source?: "template" | "manual" | string | null;
	shiftTypeId?: string | null;
	shiftSnapshot?: {
		name?: string | null;
		code?: string | null;
		description?: string | null;
		startTime?: string | null;
		endTime?: string | null;
		breakMinutes?: number | null;
		isOvernight?: boolean;
		isOff?: boolean;
		timeSlots?: ShiftTimeSlot[];
	} | null;
	reason?: string | null;
	startDate: string;
	endDate?: string | null;
	departmentId?: string | null;
	createdByEmployeeId?: string | null;
	isDeleted?: boolean;
	createdAt?: string;
	updatedAt?: string;
	scheduleTemplate?: ScheduleTemplate | null;
	employee?: {
		id: string;
		employeeId?: string;
		person?: {
			personalInfo?: {
				firstName?: string;
				lastName?: string;
			};
		};
	} | null;
	department?: {
		id: string;
		name: string;
		code?: string;
	} | null;
}

export interface EmployeeScheduleCalendarDay {
	date: string;
	source?: string | null;
	shift?: {
		source?: string | null;
		employeeScheduleId?: string | null;
		scheduleOverrideId?: string | null;
		scheduleTemplateId?: string | null;
		scheduleTemplateName?: string | null;
		shiftTypeId?: string | null;
		shiftTypeCode?: string | null;
		shiftTypeName?: string | null;
		startTime?: string | null;
		endTime?: string | null;
		breakMinutes?: number | null;
		graceLateMinutes?: number | null;
		graceEarlyOutMinutes?: number | null;
		isOvernight?: boolean | null;
		isOff?: boolean | null;
		timeSlots?: Array<{
			type: string;
			label?: string | null;
			startTime: string;
			endTime: string;
		}>;
	} | null;
}

export interface EmployeeScheduleCalendarResponse {
	employeeId: string;
	days: EmployeeScheduleCalendarDay[];
}

export interface ScheduleOverride {
	id: string;
	organizationId: string;
	employeeId: string;
	date: string;
	shiftTypeId?: string | null;
	shiftSnapshot?: ScheduleOverrideShiftSnapshot | null;
	reason?: string | null;
	createdByEmployeeId?: string | null;
	isDeleted: boolean;
	createdAt: string;
	updatedAt: string;
	shiftType?: ShiftType | null;
	previousShift?: ScheduleOverrideShiftSnapshot | null;
	effectiveShift?: ScheduleOverrideShiftSnapshot | null;
	employee?: {
		id: string;
		employeeId?: string;
		person?: {
			personalInfo?: {
				firstName?: string;
				lastName?: string;
			};
		};
	} | null;
	createdByEmployee?: {
		id: string;
		employeeId?: string;
		person?: {
			personalInfo?: {
				firstName?: string;
				lastName?: string;
			};
		};
	} | null;
}

export interface ScheduleOverrideShiftSnapshot {
	source?: "override" | "template" | string | null;
	scheduleOverrideId?: string | null;
	scheduleTemplateId?: string | null;
	scheduleTemplateName?: string | null;
	shiftTypeId?: string | null;
	shiftTypeCode?: string | null;
	shiftTypeName?: string | null;
	name?: string | null;
	code?: string | null;
	isOff?: boolean | null;
	isOvernight?: boolean | null;
	breakMinutes?: number | null;
	startTime?: string | null;
	endTime?: string | null;
	shiftHour?: number | null;
	timeSlots?: ShiftTimeSlot[];
}

export interface ShiftTypesResponse {
	shiftTypes: ShiftType[];
	count?: number;
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages?: number;
		hasNext?: boolean;
		hasPrev?: boolean;
	};
}

export interface ScheduleTemplatesResponse {
	scheduleTemplates: ScheduleTemplate[];
	count?: number;
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages?: number;
		hasNext?: boolean;
		hasPrev?: boolean;
	};
}

export interface EmployeeSchedulesResponse {
	employeeId?: string;
	activeSchedule?: {
		scheduleCode?: string;
		scheduleName?: string;
		startDate?: string;
		endDate?: string | null;
		gracePeriodMinutes?: number;
		shifts?: Array<{
			label: string;
			isRestDay?: boolean;
			timeSlots?: ShiftTimeSlot[];
		}>;
	} | null;
	schedules?: Array<{
		id: string;
		scheduleCode?: string;
		scheduleName?: string;
		startDate: string;
		endDate?: string | null;
		effectiveDate?: string;
		status?: string;
		source?: string | null;
		reason?: string | null;
		scheduleTemplateId?: string | null;
		shiftTypeId?: string | null;
		shiftSnapshot?: {
			name?: string | null;
			code?: string | null;
			description?: string | null;
			startTime?: string | null;
			endTime?: string | null;
			breakMinutes?: number | null;
			isOvernight?: boolean;
			isOff?: boolean;
			timeSlots?: ShiftTimeSlot[];
		} | null;
		metadata?: Record<string, any> | null;
		department?: {
			id: string;
			name: string;
			code?: string;
		} | null;
		scheduleTemplate?: ScheduleTemplate | null;
	}>;
}

export interface ScheduleOverridesResponse {
	scheduleOverrides: ScheduleOverride[];
	count?: number;
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages?: number;
		hasNext?: boolean;
		hasPrev?: boolean;
	};
}

export interface GeneratedConfigCodeResponse {
	baseCode: string;
	code: string;
	isAvailable: boolean;
}

export interface CreateShiftTypeRequest {
	name: string;
	code: string;
	isOvernight?: boolean;
	isOff?: boolean;
	timeSlots?: ShiftTimeSlot[];
	isActive?: boolean;
}

export interface UpdateShiftTypeRequest extends Partial<CreateShiftTypeRequest> {}

export interface CreateScheduleTemplateRequest {
	name: string;
	code: string;
	description?: string | null;
	cycleDays: number;
	graceLateMinutes?: number;
	graceEarlyOutMinutes?: number;
	pattern: ScheduleTemplatePatternItem[];
	isActive?: boolean;
}

export interface UpdateScheduleTemplateRequest extends Partial<CreateScheduleTemplateRequest> {}

export interface DuplicateScheduleTemplateResponse {
	scheduleTemplate: ScheduleTemplate;
}

export interface CreateEmployeeScheduleRequest {
	employeeId: string;
	scheduleTemplateId?: string;
	shiftTypeId?: string | null;
	shiftSnapshot?: {
		name?: string | null;
		code?: string | null;
		description?: string | null;
		startTime?: string | null;
		endTime?: string | null;
		breakMinutes?: number | null;
		isOvernight?: boolean;
		isOff?: boolean;
		timeSlots?: ShiftTimeSlot[];
	} | null;
	pattern?: Array<{
		day?: number;
		shiftTypeId?: string | null;
		shiftSnapshot?: CreateEmployeeScheduleRequest["shiftSnapshot"];
		isOff?: boolean;
		startTime?: string | null;
		endTime?: string | null;
	}>;
	startDate?: string;
	endDate?: string | null;
	departmentId?: string | null;
	createdByEmployeeId?: string | null;
	reason?: string | null;
	graceLateMinutes?: number;
	graceEarlyOutMinutes?: number;
}

export interface UpdateEmployeeScheduleRequest extends Partial<CreateEmployeeScheduleRequest> {}

export interface CreateScheduleOverrideRequest {
	employeeId: string;
	organizationId?: string;
	date: string;
	shiftTypeId?: string | null;
	shiftSnapshot?: ScheduleOverrideShiftSnapshot | null;
	reason?: string | null;
	createdByEmployeeId?: string | null;
}

export interface UpdateScheduleOverrideRequest extends Partial<CreateScheduleOverrideRequest> {}

export type SchedulesResponse = ScheduleTemplatesResponse;

const unwrapEnvelope = <T>(payload: any): T => {
	const data = payload?.data ?? payload;
	if (data?.data !== undefined) {
		return data.data as T;
	}
	return data as T;
};

const unwrapEntity = <T>(payload: any, key: string): T => {
	const data = unwrapEnvelope<any>(payload);
	if (data && typeof data === "object" && key in data) {
		return data[key] as T;
	}
	return data as T;
};

class SchedulesService extends APIService {
	async getShiftTypes(params?: ApiQueryParams): Promise<ShiftTypesResponse> {
		const response = await hrisApiClient.get<any>(
			`/api/shiftType${this.clearQueryParams()
				.setParams(params || {})
				.getQueryString()}`,
		);
		return unwrapEnvelope<ShiftTypesResponse>(response.data);
	}

	async getShiftType(id: string): Promise<ShiftType> {
		const response = await hrisApiClient.get<any>(`/api/shiftType/${id}`);
		return unwrapEntity<ShiftType>(response.data, "shiftType");
	}

	async createShiftType(payload: CreateShiftTypeRequest): Promise<ShiftType> {
		const response = await hrisApiClient.post<any>("/api/shiftType", payload);
		return unwrapEntity<ShiftType>(response.data, "shiftType");
	}

	async updateShiftType(id: string, payload: UpdateShiftTypeRequest): Promise<ShiftType> {
		const response = await hrisApiClient.patch<any>(`/api/shiftType/${id}`, payload);
		return unwrapEntity<ShiftType>(response.data, "shiftType");
	}

	async deleteShiftType(id: string): Promise<void> {
		await hrisApiClient.delete(`/api/shiftType/${id}`);
	}

	async importShiftTypes(file: File): Promise<any> {
		const formData = new FormData();
		formData.append("file", file);
		const response = await hrisApiClient.post<any>("/api/shiftType/import", formData, {
			headers: { "Content-Type": "multipart/form-data" },
		});
		return unwrapEnvelope<any>(response.data);
	}

	async generateShiftTypeCode(name: string): Promise<GeneratedConfigCodeResponse> {
		const response = await hrisApiClient.get<any>(
			`/api/shiftType/generate-code?name=${encodeURIComponent(name)}`,
		);
		return unwrapEnvelope<GeneratedConfigCodeResponse>(response.data);
	}

	async getScheduleTemplates(params?: ApiQueryParams): Promise<ScheduleTemplatesResponse> {
		const response = await hrisApiClient.get<any>(
			`/api/scheduleTemplate${this.clearQueryParams()
				.setParams(params || {})
				.getQueryString()}`,
		);
		return unwrapEnvelope<ScheduleTemplatesResponse>(response.data);
	}

	async getScheduleTemplate(id: string): Promise<ScheduleTemplate> {
		const response = await hrisApiClient.get<any>(`/api/scheduleTemplate/${id}`);
		return unwrapEntity<ScheduleTemplate>(response.data, "scheduleTemplate");
	}

	async createScheduleTemplate(
		payload: CreateScheduleTemplateRequest,
	): Promise<ScheduleTemplate> {
		const response = await hrisApiClient.post<any>("/api/scheduleTemplate", payload);
		return unwrapEntity<ScheduleTemplate>(response.data, "scheduleTemplate");
	}

	async updateScheduleTemplate(
		id: string,
		payload: UpdateScheduleTemplateRequest,
	): Promise<ScheduleTemplate> {
		const response = await hrisApiClient.patch<any>(`/api/scheduleTemplate/${id}`, payload);
		return unwrapEntity<ScheduleTemplate>(response.data, "scheduleTemplate");
	}

	async duplicateScheduleTemplate(id: string): Promise<ScheduleTemplate> {
		const response = await hrisApiClient.post<any>(`/api/scheduleTemplate/${id}/duplicate`);
		return unwrapEntity<ScheduleTemplate>(response.data, "scheduleTemplate");
	}

	async deleteScheduleTemplate(id: string): Promise<void> {
		await hrisApiClient.delete(`/api/scheduleTemplate/${id}`);
	}

	async generateScheduleTemplateCode(name: string): Promise<GeneratedConfigCodeResponse> {
		const response = await hrisApiClient.get<any>(
			`/api/scheduleTemplate/generate-code?name=${encodeURIComponent(name)}`,
		);
		return unwrapEnvelope<GeneratedConfigCodeResponse>(response.data);
	}

	async getEmployeeSchedules(params?: {
		employeeId?: string;
	}): Promise<EmployeeSchedulesResponse> {
		const query = new URLSearchParams();
		if (params?.employeeId) query.set("employeeId", params.employeeId);
		const suffix = query.toString() ? `?${query.toString()}` : "";
		const response = await hrisApiClient.get<any>(`/api/employee-schedules${suffix}`);
		return unwrapEnvelope<EmployeeSchedulesResponse>(response.data);
	}

	async createEmployeeSchedule(
		payload: CreateEmployeeScheduleRequest,
	): Promise<EmployeeScheduleAssignment> {
		const response = await hrisApiClient.post<any>("/api/employee-schedules", payload);
		return unwrapEnvelope<EmployeeScheduleAssignment>(response.data);
	}

	async updateEmployeeSchedule(
		id: string,
		payload: UpdateEmployeeScheduleRequest,
	): Promise<EmployeeScheduleAssignment> {
		const response = await hrisApiClient.patch<any>(`/api/employee-schedules/${id}`, payload);
		return unwrapEnvelope<EmployeeScheduleAssignment>(response.data);
	}

	async getEmployeeScheduleCalendar(params: {
		employeeId: string;
		start: string;
		end: string;
	}): Promise<EmployeeScheduleCalendarResponse> {
		const query = new URLSearchParams({
			start: params.start,
			end: params.end,
		});
		const response = await hrisApiClient.get<any>(
			`/api/employees/${params.employeeId}/schedule?${query.toString()}`,
		);
		return unwrapEnvelope<EmployeeScheduleCalendarResponse>(response.data);
	}

	async getScheduleOverrides(params?: ApiQueryParams): Promise<ScheduleOverridesResponse> {
		const response = await hrisApiClient.get<any>(
			`/api/scheduleOverride${this.clearQueryParams()
				.setParams(params || {})
				.getQueryString()}`,
		);
		return unwrapEnvelope<ScheduleOverridesResponse>(response.data);
	}

	async getScheduleOverride(id: string): Promise<ScheduleOverride> {
		const response = await hrisApiClient.get<any>(`/api/scheduleOverride/${id}`);
		return unwrapEntity<ScheduleOverride>(response.data, "scheduleOverride");
	}

	async createScheduleOverride(
		payload: CreateScheduleOverrideRequest,
	): Promise<ScheduleOverride> {
		const response = await hrisApiClient.post<any>("/api/scheduleOverride", payload);
		return unwrapEntity<ScheduleOverride>(response.data, "scheduleOverride");
	}

	async updateScheduleOverride(
		id: string,
		payload: UpdateScheduleOverrideRequest,
	): Promise<ScheduleOverride> {
		const response = await hrisApiClient.patch<any>(`/api/scheduleOverride/${id}`, payload);
		return unwrapEntity<ScheduleOverride>(response.data, "scheduleOverride");
	}

	async deleteScheduleOverride(id: string): Promise<void> {
		await hrisApiClient.delete(`/api/scheduleOverride/${id}`);
	}

	async importSchedules(file: File): Promise<any> {
		const formData = new FormData();
		formData.append("file", file);
		const response = await hrisApiClient.post<any>("/api/scheduleTemplate/import", formData, {
			headers: { "Content-Type": "multipart/form-data" },
		});
		return unwrapEnvelope<any>(response.data);
	}
}

const schedulesService = new SchedulesService();
export default schedulesService;
