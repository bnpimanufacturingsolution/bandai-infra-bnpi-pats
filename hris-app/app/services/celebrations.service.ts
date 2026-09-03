import { hrisApiClient } from "../lib/api-client";
import type {
	BirthdayCelebrantsResponseData,
	BirthdayFilterType,
} from "../types/celebrations";

export interface GetBirthdayCelebrantsParams {
	month: number;
	year: number;
	type?: BirthdayFilterType;
	search?: string;
}

class CelebrationsService {
	async getBirthdayCelebrants(
		params: GetBirthdayCelebrantsParams,
	): Promise<BirthdayCelebrantsResponseData> {
		try {

			const searchParams = new URLSearchParams({
				month: String(params.month),
				year: String(params.year),
				type: params.type || "ALL",
			});

			if (params.search && params.search.trim()) {
				searchParams.set("search", params.search.trim());
			}

			const response = await hrisApiClient.get<any>(
				`/api/celebrations/birthdays?${searchParams.toString()}`,
			);

			const payload = response?.data;
			if (!payload) {
				throw new Error("Failed to fetch birthday celebrations");
			}

			return payload as BirthdayCelebrantsResponseData;
		} catch (error: any) {
			console.error("Error fetching birthday celebrations:", error);
			throw new Error(
				error?.errors?.[0]?.message ||
					error?.message ||
					"Error fetching birthday celebrations",
			);
		}
	}
}

const celebrationsService = new CelebrationsService();
export default celebrationsService;

