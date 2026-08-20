import { hrisApiClient } from "~/lib/api-client";
import { APIService, type ApiQueryParams } from "./api-service";

export interface Timesheetline {
	id: string;
	organizationId: string;
	employeeId: string;
	timesheetId: string;
	payrollPeriodId: string;
	attendanceId?: string | null;
	date: string;
	timeIn?: string | null;
	timeBreak?: string | null;
	timeOut?: string | null;
	status: string;
	behaviorFlags?: string[];
	scheduleSnapshot?: any;
	hoursWorked?: string | null;
	regularHours?: string | null;
	overtimeHours?: string | null;
	undertimeHours?: string | null;
	lateHours?: string | null;
	earlyOutHours?: string | null;
	breakMinutes?: number | null;
	employeeNotes?: string | null;
	approverNotes?: string | null;
	notes?: string | null;
	metadata?: Record<string, any> | null;
	primaryMarker?: string | null;
	isManualEntry?: boolean;
	isVirtual?: boolean;
	isDeleted?: boolean;
	employeeCodeSnapshot?: string | null;
	employeeNameSnapshot?: string | null;
	departmentIdSnapshot?: string | null;
	departmentNameSnapshot?: string | null;
	reportToIdSnapshot?: string | null;
	dayLaborType?: "DIRECT" | "INDIRECT" | null;
	timesheet?: {
		id: string;
		code?: string;
		status?: string;
	};
	employee?: {
		id: string;
		employeeId: string;
		person?: {
			personalInfo?: {
				firstName?: string;
				lastName?: string;
			};
		};
		position?: { title?: string };
		department?: { name?: string };
	};
	payrollPeriod?: {
		id: string;
		name?: string;
		code?: string;
		startDate?: string;
		endDate?: string;
	};
}

export interface TimesheetlinesResponse {
	timesheetlines: Timesheetline[];
	count?: number;
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages: number;
	};
}

class TimesheetlineService extends APIService {
	async getTimesheetlines(params?: ApiQueryParams): Promise<TimesheetlinesResponse> {
		if (params) {
			this.setParams(params);
		}
		const queryString = this.getQueryString();
		const response = await hrisApiClient.get<TimesheetlinesResponse>(
			`/api/timesheetline${queryString}`,
		);
		if (!response.data) {
			throw new Error(response.message || "Failed to fetch timesheet lines");
		}
		return response.data;
	}
}

const timesheetlineService = new TimesheetlineService();
export default timesheetlineService;
