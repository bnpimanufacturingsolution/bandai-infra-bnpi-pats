import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { StatementOfAccount } from "~/zod/statementofaccount.zod";

export interface StatementOfAccountListResponse {
	statementofaccounts: StatementOfAccount[];
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

class StatementOfAccountService extends APIService {
	async getStatementOfAccounts(): Promise<StatementOfAccountListResponse> {
		try {

			const queryString = this.getQueryString();
			const endpoint = `/api/statementofaccount${queryString}`;
			const response = await hrisApiClient.get<any>(endpoint);

			const payload = unwrapPayload<any>(response.data);
			return {
				statementofaccounts: payload?.statementofaccounts || [],
				pagination: payload?.pagination,
				count: payload?.count,
			};
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching statement of account records",
			);
		}
	}

	async getStatementOfAccountById(id: string): Promise<StatementOfAccount | null> {
		try {

			const queryString = this.getQueryString();
			const endpoint = `/api/statementofaccount/${id}${queryString}`;
			const response = await hrisApiClient.get<any>(endpoint);

			const payload = unwrapPayload<any>(response.data);
			if (!payload) return null;
			if (payload.statementofaccount) return payload.statementofaccount as StatementOfAccount;
			return payload as StatementOfAccount;
		} catch (error: any) {
			if (error?.status === 404) return null;
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching statement of account details",
			);
		}
	}
}

export const statementOfAccountService = new StatementOfAccountService();

