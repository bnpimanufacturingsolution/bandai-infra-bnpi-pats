import { useQuery } from "@tanstack/react-query";
import type { ApiQueryParams } from "~/services/api-service";
import requestTransactionsService, {
	type RequestTransactionsResponse,
} from "~/services/request-transactions.service";

export const requestTransactionsQueryKeys = {
	all: ["requestTransactions"] as const,
	lists: () => [...requestTransactionsQueryKeys.all, "list"] as const,
	list: (params?: ApiQueryParams) =>
		[...requestTransactionsQueryKeys.lists(), { params }] as const,
};

export const useRequestTransactions = (params?: ApiQueryParams) =>
	useQuery<RequestTransactionsResponse>({
		queryKey: requestTransactionsQueryKeys.list(params),
		queryFn: () =>
			requestTransactionsService
				.select(
					params?.fields
						? (params.fields as string).split(",")
						: [
								"id",
								"requestId",
								"sequenceNumber",
								"eventCategory",
								"eventKey",
								"actorType",
								"actorRole",
								"actorDisplayName",
								"title",
								"description",
								"comments",
								"fromStateKey",
								"toStateKey",
								"fieldChanges",
								"metadata",
								"isSystemGenerated",
								"occurredAt",
								"actorEmployee.id",
								"actorEmployee.employeeId",
								"actorEmployee.person.personalInfo",
								"request.id",
								"request.code",
								"request.type",
								"request.description",
								"request.metadata",
								"request.currentWorkflowStateKey",
								"request.requesterId",
								"request.requester.id",
								"request.requester.employeeId",
								"request.requester.person.personalInfo",
								"request.targetEmployee.id",
								"request.targetEmployee.employeeId",
								"request.targetEmployee.person.personalInfo",
								"request.currentStepExecution.stepName",
								"request.currentStepExecution.stepNumber",
								"request.lastCompletedStepExecution.stepName",
								"request.lastCompletedStepExecution.completedAt",
							],
				)
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort || "occurredAt", params?.order || "desc")
				.setParams(params || {})
				.getRequestTransactions(),
		staleTime: 60 * 1000,
	});
