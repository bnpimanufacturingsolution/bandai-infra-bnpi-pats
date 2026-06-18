import { hrisApiClient } from "~/lib/api-client";
import type {
	CreateWorkScheduleRequest,
	UpdateWorkScheduleRequest,
	WorkSchedule,
	WorkScheduleResponse,
	WorkSchedulesResponse,
} from "~/types/workSchedule";
import { APIService } from "./api-service";

const unwrapData = <T>(payload: any): T => {
	const data = payload?.data ?? payload;
	if (data?.data !== undefined) {
		return data.data as T;
	}
	return data as T;
};

class WorkScheduleService extends APIService {
	async getWorkSchedules(): Promise<WorkSchedulesResponse> {
		const queryString = this.getQueryString();
		const response = await hrisApiClient.get<any>(`/api/scheduleTemplate${queryString}`);
		const data = unwrapData<any>(response.data);
		return {
			...data,
			schedules: data?.scheduleTemplates || data?.schedules || [],
			scheduleTemplates: data?.scheduleTemplates || data?.schedules || [],
		};
	}

	async getWorkSchedule(id: string): Promise<WorkScheduleResponse> {
		const response = await hrisApiClient.get<any>(`/api/scheduleTemplate/${id}`);
		const data = unwrapData<any>(response.data);
		const scheduleTemplate = data?.scheduleTemplate || data?.schedule || data;
		return {
			data: {
				scheduleTemplate,
				schedule: scheduleTemplate,
			},
		};
	}

	async createWorkSchedule(
		workScheduleData: CreateWorkScheduleRequest,
	): Promise<WorkScheduleResponse> {
		const response = await hrisApiClient.post<any>("/api/scheduleTemplate", workScheduleData);
		const data = unwrapData<any>(response.data);
		const scheduleTemplate = data?.scheduleTemplate || data?.schedule || data;
		return {
			data: {
				scheduleTemplate,
				schedule: scheduleTemplate,
			},
		};
	}

	async updateWorkSchedule(
		id: string,
		workScheduleData: UpdateWorkScheduleRequest,
	): Promise<WorkScheduleResponse> {
		const response = await hrisApiClient.patch<any>(`/api/scheduleTemplate/${id}`, workScheduleData);
		const data = unwrapData<any>(response.data);
		const scheduleTemplate = data?.scheduleTemplate || data?.schedule || data;
		return {
			data: {
				scheduleTemplate,
				schedule: scheduleTemplate,
			},
		};
	}

	async deleteWorkSchedule(id: string): Promise<void> {
		await hrisApiClient.delete(`/api/scheduleTemplate/${id}`);
	}
}

const workScheduleService = new WorkScheduleService();
export default workScheduleService;
