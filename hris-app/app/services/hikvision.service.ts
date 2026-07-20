import { hrisApiClient } from "../lib/api-client";
import type {
	HikvisionUserInfoSearchRequest,
	HikvisionUserInfoSearchResult,
	AcsEventRequest,
	AcsEventResult,
	AcsEventCond,
} from "../types/hikvision";

export class HikvisionService {
	private baseUrl = "/api/hikvision/access-control/user-info";
	private acsEventsUrl = "/api/hikvision/access-control/acs-events";

	/**
	 * Search for user info from Hikvision device
	 * @param searchID - Search session ID
	 * @param searchResultPosition - Starting position for results (default: 0)
	 * @param maxResults - Maximum number of results to return (default: 10)
	 * @returns Promise with paginated user info results
	 */
	async searchUserInfo(
		searchID: string,
		searchResultPosition: number = 0,
		maxResults: number = 10,
		deviceId?: string,
	): Promise<HikvisionUserInfoSearchResult> {
		const payload: HikvisionUserInfoSearchRequest = {
			...(deviceId ? { deviceId } : {}),
			UserInfoSearchCond: {
				searchID,
				searchResultPosition,
				maxResults,
			},
		};

		const response = await hrisApiClient.post<HikvisionUserInfoSearchResult>(
			`${this.baseUrl}/search`,
			payload,
		);

		return (response.data || response) as unknown as HikvisionUserInfoSearchResult;
	}

	/**
	 * Fetch ACS events from Hikvision device
	 * @param acsEventCond - ACS event search conditions
	 * @returns Promise with ACS event results
	 */
	async getAcsEvents(acsEventCond: AcsEventCond, deviceId?: string): Promise<AcsEventResult> {
		const payload: AcsEventRequest = {
			...(deviceId ? { deviceId } : {}),
			AcsEventCond: acsEventCond,
		};

		const response = await hrisApiClient.post<AcsEventResult>(this.acsEventsUrl, payload);

		return (response.data || response) as unknown as AcsEventResult;
	}
}

export const hikvisionService = new HikvisionService();
