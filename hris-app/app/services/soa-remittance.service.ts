import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { SOARemittance } from "~/zod/soaremittance.zod";

export interface SoaRemittanceListResponse {
	soaremittances: SOARemittance[];
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

class SoaRemittanceService extends APIService {
	async getSoaRemittances(): Promise<SoaRemittanceListResponse> {
		try {

			const queryString = this.getQueryString();
			const endpoint = `/api/soaremittance${queryString}`;
			const response = await hrisApiClient.get<any>(endpoint);

			const payload = unwrapPayload<any>(response.data);
			return {
				soaremittances: payload?.soaremittances || [],
				pagination: payload?.pagination,
				count: payload?.count,
			};
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching SOA remittances",
			);
		}
	}
}

export const soaRemittanceService = new SoaRemittanceService();

