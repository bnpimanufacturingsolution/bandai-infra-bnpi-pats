import { hrisApiClient } from "~/lib/api-client";

export type EmploymentType =
	| "REGULAR"
	| "PROBATIONARY"
	| "CONTRACTUAL"
	| "PART_TIME"
	| "CONSULTANT"
	| "INTERN";

export type LeaveType =
	| "VACATION"
	| "SICK"
	| "PERSONAL"
	| "MATERNITY"
	| "PATERNITY"
	| "BEREAVEMENT"
	| "UNPAID"
	| "COMPENSATORY";

export interface LeavePolicyConfig {
	id: string;
	organizationId: string;
	leaveType: LeaveType;
	enabled: boolean;
	isPaid: boolean;
	requiresApproval: boolean;
	minAdvanceNoticeDays: number;
	maxDaysPerRequest: number;
	allowHalfDay: boolean;
	requireAttachment: boolean;
	allowedEmploymentTypes: EmploymentType[];
	createdAt: string;
	updatedAt: string;
}

export interface UpdateLeavePolicyPayload {
	enabled?: boolean;
	isPaid?: boolean;
	requiresApproval?: boolean;
	minAdvanceNoticeDays?: number;
	maxDaysPerRequest?: number;
	allowHalfDay?: boolean;
	requireAttachment?: boolean;
	allowedEmploymentTypes?: EmploymentType[];
}

class LeaveSettingsService {
	async getLeaveSettings(): Promise<LeavePolicyConfig[]> {
		try {
			const response = await hrisApiClient.get<LeavePolicyConfig[]>("/api/leave-settings");
			if (!response.data) throw new Error(response.message || "Failed to fetch leave settings");
			return response.data;
		} catch (error: any) {
			throw new Error(error?.message || "Failed to fetch leave settings");
		}
	}

	async updateLeaveSetting(
		leaveType: LeaveType,
		payload: UpdateLeavePolicyPayload,
	): Promise<LeavePolicyConfig> {
		try {
			const response = await hrisApiClient.patch<LeavePolicyConfig>(
				`/api/leave-settings/${leaveType}`,
				payload,
			);
			if (!response.data) throw new Error(response.message || "Failed to update leave setting");
			return response.data;
		} catch (error: any) {
			throw new Error(error?.message || "Failed to update leave setting");
		}
	}
}

export default new LeaveSettingsService();

