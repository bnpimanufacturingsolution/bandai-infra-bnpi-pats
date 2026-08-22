import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";
import type {
	Request,
	RequestTransaction,
	RequestTransactionActorType,
	RequestTransactionEventCategory,
	RequestTransactionEventKey,
} from "./requests.service";

export interface RequestTransactionListItem extends RequestTransaction {
	request?: Pick<
		Request,
		| "id"
		| "code"
		| "type"
		| "description"
		| "metadata"
		| "currentWorkflowStateKey"
		| "createdAt"
		| "updatedAt"
		| "requesterId"
		| "requester"
		| "targetEmployee"
		| "currentStepExecution"
		| "lastCompletedStepExecution"
	>;
}

export interface RequestTransactionsResponse {
	requestTransactions: RequestTransactionListItem[];
	count?: number;
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages?: number;
	};
}

export type MovementFilterState = {
	requestType?: string;
	eventCategory?: RequestTransactionEventCategory | "all";
	eventKey?: RequestTransactionEventKey | "all";
	actorType?: RequestTransactionActorType | "all";
	currentState?: string;
	dateFrom?: string;
	dateTo?: string;
	hasFieldChanges?: boolean;
	hasArtifact?: boolean;
	hrOnly?: boolean;
};

class RequestTransactionsService extends APIService {
	async getRequestTransactions(params?: ApiQueryParams): Promise<RequestTransactionsResponse> {
		try {
			if (params) {
				this.setParams(params);
			}

			const queryString = this.getQueryString();
			const response =
				await hrisApiClient.get<RequestTransactionsResponse>(
					`/api/requestTransaction${queryString}`,
				);

			let responseData: any = response.data;
			if (responseData && typeof responseData === "object" && "data" in responseData) {
				responseData = responseData.data;
			}

			if (!responseData) {
				throw new Error("Failed to fetch request transactions");
			}

			return responseData as RequestTransactionsResponse;
		} catch (error: any) {
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching request transactions",
			);
		}
	}
}

const requestTransactionsService = new RequestTransactionsService();

export default requestTransactionsService;
