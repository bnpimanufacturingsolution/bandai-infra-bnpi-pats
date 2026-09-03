import { hrisApiClient } from "~/lib/api-client";
import type {
	YearlySchedule,
	YearlySchedulePayload,
	YearlyScheduleResponse,
	YearlySchedulesResponse,
} from "~/types/yearlySchedule";
import { APIService } from "./api-service";

class YearlyScheduleService extends APIService {
	async getYearlySchedules(): Promise<YearlySchedulesResponse> {
		const response = await hrisApiClient.get<YearlySchedulesResponse>(
			"/api/yearlyschedule?document=true",
		);
		if (!response?.data) throw new Error("Invalid yearly schedules response");
		return response.data;
	}

	async getYearlySchedule(id: string): Promise<YearlyScheduleResponse> {
		const response = await hrisApiClient.get<YearlyScheduleResponse>(
			`/api/yearlyschedule/${id}`,
		);
		if (!response?.data) throw new Error("Invalid yearly schedule response");
		return response.data;
	}

	async createYearlySchedule(payload: YearlySchedulePayload): Promise<YearlyScheduleResponse> {
		const response = await hrisApiClient.post<YearlyScheduleResponse>(
			"/api/yearlyschedule",
			payload,
		);
		if (!response?.data) throw new Error("Invalid create yearly schedule response");
		return response.data;
	}

	async updateYearlySchedule(
		id: string,
		payload: Partial<YearlySchedulePayload>,
	): Promise<YearlyScheduleResponse> {
		const response = await hrisApiClient.patch<YearlyScheduleResponse>(
			`/api/yearlyschedule/${id}`,
			payload,
		);
		if (!response?.data) throw new Error("Invalid update yearly schedule response");
		return response.data;
	}

	async deleteYearlySchedule(id: string): Promise<void> {
		await hrisApiClient.delete(`/api/yearlyschedule/${id}`);
	}
}

const yearlyScheduleService = new YearlyScheduleService();
export default yearlyScheduleService;

