import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { SOALineItem } from "~/zod/soalineitem.zod";

export interface SoaLineItemListResponse {
	soalineitems: SOALineItem[];
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages?: number;
		hasNext?: boolean;
		hasPrev?: boolean;
	};
	count?: number;
}

const unwrapPayload = <T>(payload: unknown): T => {
	let next: any = payload;
	let depth = 0;
	while (next && typeof next === "object" && "data" in next && depth < 3) {
		next = next.data;
		depth += 1;
	}
	return next as T;
};

class SoaLineItemService extends APIService {
	async getSoaLineItems(): Promise<SoaLineItemListResponse> {
		try {

			const queryString = this.getQueryString();
			const endpoint = `/api/soalineitem${queryString}`;
			const response = await hrisApiClient.get<any>(endpoint);

			const payload = unwrapPayload<any>(response.data);
			return {
				soalineitems: payload?.soalineitems || [],
				pagination: payload?.pagination,
				count: payload?.count,
			};
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching SOA line items",
			);
		}
	}
}

export const soaLineItemService = new SoaLineItemService();

