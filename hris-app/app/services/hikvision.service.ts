import { hrisApiClient } from "../lib/api-client";
import type {
	HikvisionUserInfoSearchRequest,
	HikvisionUserInfoSearchResult,
	HikvisionUserInfo,
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
	 * Page through UserInfoSearch until MORE is exhausted (enroll/source pickers).
	 */
	async searchAllUsers(deviceId?: string): Promise<HikvisionUserInfo[]> {
		const allUsers: HikvisionUserInfo[] = [];
		const pageSize = 200;
		let searchResultPosition = 0;
		let hasMore = true;
		let pageGuard = 0;
		let lastSignature = "";

		while (hasMore && pageGuard < 10) {
			pageGuard += 1;
			const response = await this.searchUserInfo(
				`device-users-${Date.now()}-${searchResultPosition}`,
				searchResultPosition,
				pageSize,
				deviceId,
			);
			const searchData =
				(response as any)?.data?.UserInfoSearch ||
				(response as any)?.UserInfoSearch ||
				{};
			const users = Array.isArray(searchData?.UserInfo) ? searchData.UserInfo : [];
			const responseStatus = String(searchData?.responseStatusStrg || "").toUpperCase();
			const numOfMatches = Number(searchData?.numOfMatches || users.length || 0);
			const signature = `${users[0]?.employeeNo || "none"}:${users.length}:${responseStatus}`;

			if (signature === lastSignature) break;
			lastSignature = signature;
			allUsers.push(...users);

			if (responseStatus !== "MORE" || numOfMatches <= 0) {
				hasMore = false;
			} else {
				searchResultPosition += numOfMatches;
			}
		}

		return Array.from(
			new Map(
				allUsers
					.filter((user) => String(user?.employeeNo || "").trim())
					.map((user) => [String(user.employeeNo).trim(), user]),
			).values(),
		);
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
