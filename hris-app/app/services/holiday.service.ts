import { hrisApiClient } from "~/lib/api-client";
import type {
	Holiday,
	CreateHolidayRequest,
	UpdateHolidayRequest,
	HolidayResponse,
	HolidaysResponse,
} from "~/types/holiday";
import { APIService } from "./api-service";

class HolidayService extends APIService {
	async getHolidays(): Promise<HolidaysResponse> {
		const response = await hrisApiClient.get<HolidaysResponse>("/api/holiday");
		if (!response?.data) throw new Error("Invalid holidays response");
		return response.data;
	}

	async getHoliday(id: string): Promise<HolidayResponse> {
		const response = await hrisApiClient.get<HolidayResponse>(`/api/holiday/${id}`);
		if (!response?.data) throw new Error("Invalid holiday response");
		return response.data;
	}

	async createHoliday(payload: CreateHolidayRequest): Promise<HolidayResponse> {
		const response = await hrisApiClient.post<HolidayResponse>("/api/holiday", payload);
		if (!response?.data) throw new Error("Invalid create holiday response");
		return response.data;
	}

	async updateHoliday(id: string, payload: UpdateHolidayRequest): Promise<HolidayResponse> {
		const response = await hrisApiClient.patch<HolidayResponse>(`/api/holiday/${id}`, payload);
		if (!response?.data) throw new Error("Invalid update holiday response");
		return response.data;
	}

	async deleteHoliday(id: string): Promise<void> {
		await hrisApiClient.delete(`/api/holiday/${id}`);
	}
}

const holidayService = new HolidayService();
export default holidayService;

