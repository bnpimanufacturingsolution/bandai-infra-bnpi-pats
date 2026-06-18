import { apiClient, hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";

export interface Attendance {
	id: string;
	organizationId: string;
	employeeId: string;
	date: string;
	timeIn?: string;
	timeBreak?: string;
	timeOut?: string;
	status: "PRESENT" | "LEAVE" | "INCOMPLETE" | "ABSENT" | "REST_DAY";
	behaviorFlags?: Array<"UNDERTIME" | "OVERTIME">;
	computationMeta?: Record<string, any> | null;
	scheduleSnapshot?: any; // Copy of employee's schedule on this date
	timeInLocation?: any;
	timeOutLocation?: any;
	deviceInfo?: any;
	isManualEntry: boolean;
	approvedBy?: string;
	ledgerType?: "RAW" | "CORRECTION";
	appliedAt?: string;
	appliedBy?: string;
	isEffective?: boolean;
	hoursWorked?: string | null;
	regularHours?: string | null;
	overtimeHours?: string | null;
	undertimeHours?: string | null;
	lateHours?: string | null;
	earlyOutHours?: string | null;
	breakMinutes?: number | null;
	leaveType?: string | null;
	leaveEntries?: Array<{
		requestId?: string;
		leaveType: string;
		label: string;
		durationUnit?: string;
		halfDaySession?: string;
		startDate?: string;
		endDate?: string;
	}>;
	holidayEntries?: Array<{
		calendarItemId: string;
		title: string;
		startDate: string;
		endDate: string;
		tags?: string[];
	}>;
	primaryMarker?: "HOLIDAY" | "LEAVE" | "REST_DAY" | "ABSENT" | "HOURS" | string | null;
	notes?: string;
	isDeleted: boolean;
	createdAt: string;
	updatedAt: string;
	hasCorrection?: boolean;
	rawAttendanceId?: string | null;
	effectiveAttendanceId?: string | null;
	rawAttendance?: Attendance | null;
	effectiveAttendance?: Attendance | null;
	attendanceHistory?: Attendance[];
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
	appliedByEmployee?: {
		id: string;
		employeeId: string;
		name?: string;
		position?: string | null;
		department?: string | null;
	};
}

export interface CreateAttendanceCorrectionPayload {
	attendanceId: string;
	employeeId: string;
	correctionDate: string;
	status: "PRESENT" | "LEAVE" | "INCOMPLETE" | "ABSENT" | "REST_DAY";
	timeIn?: string;
	timeOut?: string;
	reasonCategory: string;
	notes?: string;
}

export interface AttendanceRecord {
	id: string;
	employeeId: string;
	clockInTime?: string;
	clockOutTime?: string;
	date: string;
	status: "present" | "absent" | "late" | "half-day";
	location?: {
		lat: number;
		lng: number;
	};
	notes?: string;
	createdAt: string;
	updatedAt: string;
}

export interface AttendanceSummary {
	totalDays: number;
	presentDays: number;
	absentDays: number;
	lateDays: number;
	totalHours: number;
	averageHoursPerDay: number;
}

export interface AttendanceResponse {
	data: AttendanceRecord[] | { attendance: AttendanceRecord[] };
	pagination?: {
		total: number;
		page: number;
		limit: number;
	};
}

export interface AttendancesResponse {
	data: Attendance[] | { attendances: Attendance[] };
	pagination?: {
		total: number;
		page: number;
		limit: number;
	};
}

export interface ImportAttendanceResponse {
	jobId: string;
	message: string;
	total: number;
}

export interface ImportAttendanceOptions {
	createTimesheets?: boolean;
}

export interface ImportJobProgress {
	jobId: string;
	status: "processing" | "completed" | "failed";
	total: number;
	processed: number;
	success: number;
	failed: number;
	errors: Array<{ row: number; employeeId: string; error: string }>;
	startedAt: string;
	completedAt?: string;
}

class AttendanceService extends APIService {
	/**
	 * Get all attendances with optional filtering, pagination, and sorting
	 * Uses query parameters set via method chaining (select, search, paginate, sort, setParams)
	 * @returns Promise<AttendancesResponse> - Attendances response with pagination
	 */
	async getAttendances(): Promise<AttendancesResponse> {
		try {
			// Set the auth token for HRIS API client

			const queryString = this.getQueryString();
			const endpoint = `/api/attendance${queryString}`;

			console.log("Fetching attendances from HRIS API:", endpoint);

			const response = await hrisApiClient.get<AttendancesResponse>(endpoint);

			// Handle nested data structure if API returns { data: { ... } }
			let attendancesData = response.data;
			if (
				attendancesData &&
				typeof attendancesData === "object" &&
				"data" in attendancesData
			) {
				attendancesData = (attendancesData as any).data;
			}

			if (!attendancesData) {
				throw new Error("Failed to fetch attendances");
			}
			return attendancesData as AttendancesResponse;
		} catch (error: any) {
			console.error("Error fetching attendances:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching attendances",
			);
		}
	}

	/**
	 * Get a single attendance by ID
	 * @param id Attendance ID
	 * @returns Promise<Attendance> - Attendance record
	 */
	async getAttendanceById(id: string): Promise<Attendance> {
		try {

			console.log("Fetching attendance from HRIS API:", id);

			const response = await hrisApiClient.get<{ data: { attendance: Attendance } }>(
				`/api/attendance/${id}`,
			);

			if (!response.data) {
				throw new Error("Failed to fetch attendance");
			}

			// Handle nested data structure
			const attendanceData = response.data.data?.attendance || response.data;
			return attendanceData as Attendance;
		} catch (error: any) {
			console.error("Error fetching attendance:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching attendance",
			);
		}
	}

	async createAttendanceCorrection(payload: CreateAttendanceCorrectionPayload): Promise<Attendance> {
		try {
			const response = await hrisApiClient.post<{ data: { attendance: Attendance } }>(
				"/api/attendance/corrections",
				payload,
			);

			const attendanceData = response.data?.data?.attendance || (response.data as any)?.attendance;
			if (!attendanceData) {
				throw new Error("Failed to apply attendance correction");
			}

			return attendanceData as Attendance;
		} catch (error: any) {
			console.error("Error applying attendance correction:", error);
			if (error && typeof error === "object" && ("status" in error || "errors" in error)) {
				throw error;
			}
			throw {
				message:
					error.data?.errors?.[0]?.message ||
					error.message ||
					"Error applying attendance correction",
			};
		}
	}

	/**
	 * Import attendance from XLSX file
	 * @param file File to upload
	 * @returns Promise<ImportAttendanceResponse> - Returns jobId for progress tracking
	 */
	async importAttendance(
		file: File,
		options?: ImportAttendanceOptions,
	): Promise<ImportAttendanceResponse> {
		try {

			const formData = new FormData();
			formData.append("file", file);
			if (typeof options?.createTimesheets === "boolean") {
				formData.append("createTimesheets", String(options.createTimesheets));
			}

			console.log("Starting attendance import from XLSX file");

			const response = await hrisApiClient.post<{ data: ImportAttendanceResponse }>(
				"/api/attendance/import",
				formData,
			);

			if (!response.data) {
				throw new Error("Failed to start import");
			}

			// Handle nested data structure
			const importData = response.data.data || response.data;
			return importData as ImportAttendanceResponse;
		} catch (error: any) {
			console.error("Error starting import:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error starting import",
			);
		}
	}

	/**
	 * Get import progress by job ID
	 * @param jobId Job ID from import response
	 * @returns Promise<ImportJobProgress> - Current import progress
	 */
	async getImportProgress(jobId: string): Promise<ImportJobProgress> {
		try {

			const response = await hrisApiClient.get<{ data: ImportJobProgress }>(
				`/api/attendance/import/progress/${jobId}`,
			);

			if (!response.data) {
				throw new Error("Failed to get import progress");
			}

			const progressData = response.data.data || response.data;
			return progressData as ImportJobProgress;
		} catch (error: any) {
			console.error("Error getting import progress:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error getting import progress",
			);
		}
	}
	/**
	 * Get all attendance records with optional filtering, pagination, and sorting
	 * @returns Promise<AttendanceResponse> - Attendance response with pagination
	 */
	async getAttendanceRecords(): Promise<AttendanceResponse> {
		try {
			const queryString = this.getQueryString();
			const response = await apiClient.get<AttendanceResponse>(`/attendance${queryString}`);
			return (response.data || response) as AttendanceResponse;
		} catch (error: any) {
			console.error("Error fetching attendance records:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching attendance records",
			);
		}
	}

	/**
	 * Clock in for an employee
	 * @param employeeId Employee ID
	 * @param location Optional location coordinates
	 * @returns Promise<AttendanceRecord> - Created attendance record
	 */
	async clockIn(
		employeeId: string,
		location?: { lat: number; lng: number },
	): Promise<AttendanceRecord> {
		try {
			const response = await apiClient.post<AttendanceRecord>("/attendance/clock-in", {
				employeeId,
				location,
			});
			return (response.data || response) as AttendanceRecord;
		} catch (error: any) {
			console.error("Error clocking in:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error clocking in",
			);
		}
	}

	/**
	 * Clock out for an employee
	 * @param employeeId Employee ID
	 * @param location Optional location coordinates
	 * @returns Promise<AttendanceRecord> - Updated attendance record
	 */
	async clockOut(
		employeeId: string,
		location?: { lat: number; lng: number },
	): Promise<AttendanceRecord> {
		try {
			const response = await apiClient.post<AttendanceRecord>("/attendance/clock-out", {
				employeeId,
				location,
			});
			return (response.data || response) as AttendanceRecord;
		} catch (error: any) {
			console.error("Error clocking out:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error clocking out",
			);
		}
	}

	/**
	 * Get attendance summary for an employee
	 * @param employeeId Employee ID
	 * @param month Month (1-12)
	 * @param year Year
	 * @returns Promise<AttendanceSummary> - Attendance summary data
	 */
	async getAttendanceSummary(params?: {
		employeeId?: string;
		month?: number;
		year?: number;
	}): Promise<AttendanceSummary> {
		try {
			const queryString = this.getQueryString();
			const response = await apiClient.get<AttendanceSummary>(
				`/attendance/summary${queryString}`,
			);
			return (response.data || response) as AttendanceSummary;
		} catch (error: any) {
			console.error("Error fetching attendance summary:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching attendance summary",
			);
		}
	}

	/**
	 * Get my attendance records (legacy method for backward compatibility)
	 */
	async getMyAttendance(params?: {
		page?: number;
		limit?: number;
		startDate?: string;
		endDate?: string;
	}): Promise<AttendanceResponse> {
		return this.setParams(params || {}).getAttendanceRecords();
	}

	/**
	 * Get team attendance records
	 */
	async getTeamAttendance(
		teamId: string,
		params?: {
			page?: number;
			limit?: number;
			startDate?: string;
			endDate?: string;
		},
	): Promise<AttendanceResponse> {
		return this.setParams({ ...params, teamId }).getAttendanceRecords();
	}

	/**
	 * Get team weekly attendance for managers
	 */
	async getTeamWeeklyAttendance(params?: {
		managerId?: string;
		weekStartDate?: string;
		weekEndDate?: string;
		approvalStatus?: string;
	}): Promise<any[]> {
		try {
			const queryString = this.getQueryString();
			const response = await apiClient.get<any[]>(`/attendance/team/weekly${queryString}`);
			return (response.data || response) as any[];
		} catch (error: any) {
			console.error("Error fetching team weekly attendance:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching team weekly attendance",
			);
		}
	}

	/**
	 * Approve weekly attendance
	 */
	async approveWeeklyAttendance(
		employeeId: string,
		weekStartDate: string,
		weekEndDate: string,
		notes?: string,
	): Promise<any> {
		try {
			const response = await apiClient.post("/attendance/approve/weekly", {
				employeeId,
				weekStartDate,
				weekEndDate,
				notes,
			});
			return response.data;
		} catch (error: any) {
			console.error("Error approving weekly attendance:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error approving weekly attendance",
			);
		}
	}

	/**
	 * Reject weekly attendance
	 */
	async rejectWeeklyAttendance(
		employeeId: string,
		weekStartDate: string,
		weekEndDate: string,
		reason: string,
	): Promise<any> {
		try {
			const response = await apiClient.post("/attendance/reject/weekly", {
				employeeId,
				weekStartDate,
				weekEndDate,
				reason,
			});
			return response.data;
		} catch (error: any) {
			console.error("Error rejecting weekly attendance:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error rejecting weekly attendance",
			);
		}
	}

	/**
	 * Approve attendance record
	 */
	async approveAttendanceRecord(recordId: string, notes?: string): Promise<AttendanceRecord> {
		try {
			const response = await apiClient.post<AttendanceRecord>(
				`/attendance/approve/${recordId}`,
				{ notes },
			);
			return (response.data || response) as AttendanceRecord;
		} catch (error: any) {
			console.error("Error approving attendance record:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error approving attendance record",
			);
		}
	}

	/**
	 * Reject attendance record
	 */
	async rejectAttendanceRecord(recordId: string, reason: string): Promise<AttendanceRecord> {
		try {
			const response = await apiClient.post<AttendanceRecord>(
				`/attendance/reject/${recordId}`,
				{ reason },
			);
			return (response.data || response) as AttendanceRecord;
		} catch (error: any) {
			console.error("Error rejecting attendance record:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error rejecting attendance record",
			);
		}
	}
}

// Export singleton instance
export const attendanceService = new AttendanceService();
export default attendanceService;

