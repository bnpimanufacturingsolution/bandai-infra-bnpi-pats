import { hrisApiClient } from "../lib/api-client";

export interface LeaveCreditUploadRow {
	employeeId: string;
	leaveType: string;
	totalEntitled: number;
}

export interface LeaveCreditUploadResult {
	status: string;
	message: string;
	data: {
		year: number;
		execute: boolean;
		total: number;
		wouldUpdate: number;
		errors: number;
		results: Array<{
			employeeId: string;
			leaveType: string;
			ok: boolean;
			error: string | null;
			action?: string;
			beforeAvailable?: number | null;
			wouldBeAvailable?: number;
		}>;
	};
}

class LeaveCreditsService {
	async bulkUpload(params: {
		year: number;
		execute: boolean;
		rows: LeaveCreditUploadRow[];
	}): Promise<LeaveCreditUploadResult> {
		const response = await hrisApiClient.post<LeaveCreditUploadResult>(
			"/api/request/leave-credits/bulk-upload",
			params,
		);
		if (!response?.data) throw new Error("Invalid leave credits upload response");
		return response.data;
	}
}

export default new LeaveCreditsService();
