import { useMutation, useQuery } from "@tanstack/react-query";
import { hikvisionService } from "../../services/hikvision.service";
import type {
	HikvisionUserInfoSearchResult,
	AcsEventResult,
	AcsEventCond,
} from "../../types/hikvision";

export interface UseHikvisionUserSearchParams {
	deviceId?: string;
	searchID?: string;
	searchResultPosition?: number;
	maxResults?: number;
	enabled?: boolean;
}

export interface UseAcsEventsParams {
	deviceId?: string;
	acsEventCond: AcsEventCond;
	enabled?: boolean;
}

export function useHikvisionUserSearch(params: UseHikvisionUserSearchParams = {}) {
	const {
		deviceId,
		searchID = "1",
		searchResultPosition = 0,
		maxResults = 100,
		enabled = true,
	} = params;

	const { data, isLoading, error, refetch } = useQuery<HikvisionUserInfoSearchResult>({
		queryKey: ["hikvision", "user-search", deviceId, searchID, searchResultPosition, maxResults],
		queryFn: () =>
			hikvisionService.searchUserInfo(searchID, searchResultPosition, maxResults, deviceId),
		enabled,
		staleTime: 5 * 60 * 1000, // 5 minutes
		retry: 2,
	});

	return {
		data,
		isLoading,
		error: error as Error | null,
		refetch,
	};
}

export function useHikvisionUserSearchMutation() {
	return useMutation({
		mutationFn: (params: UseHikvisionUserSearchParams) =>
			hikvisionService.searchUserInfo(
				params.searchID || "1",
				params.searchResultPosition || 0,
				params.maxResults || 10,
				params.deviceId,
			),
	});
}

export function useAcsEvents(params: UseAcsEventsParams) {
	const { acsEventCond, deviceId, enabled = true } = params;

	const { data, isLoading, error, refetch } = useQuery<AcsEventResult>({
		queryKey: [
			"hikvision",
			"acs-events",
			acsEventCond.searchID,
			acsEventCond.startTime,
			acsEventCond.endTime,
			acsEventCond.searchResultPosition,
			acsEventCond.maxResults,
			deviceId,
		],
		queryFn: () => hikvisionService.getAcsEvents(acsEventCond, deviceId),
		enabled,
		staleTime: 2 * 60 * 1000, // 2 minutes
		refetchInterval: enabled ? 30 * 1000 : false,
		retry: 2,
	});

	return {
		data,
		isLoading,
		error: error as Error | null,
		refetch,
	};
}

export function useAcsEventsMutation() {
	return useMutation({
		mutationFn: (params: { acsEventCond: AcsEventCond; deviceId?: string }) =>
			hikvisionService.getAcsEvents(params.acsEventCond, params.deviceId),
	});
}
