import { useQuery } from "@tanstack/react-query";
import type { ApiQueryParams } from "~/services/api-service";
import {
	statementOfAccountService,
	type StatementOfAccountListResponse,
} from "~/services/statement-of-account.service";
import type { StatementOfAccount } from "~/zod/statementofaccount.zod";

export const statementOfAccountQueryKeys = {
	soa: {
		all: ["statementOfAccounts"] as const,
		lists: () => [...statementOfAccountQueryKeys.soa.all, "list"] as const,
		list: (params?: ApiQueryParams) =>
			[...statementOfAccountQueryKeys.soa.lists(), { params }] as const,
		details: () => [...statementOfAccountQueryKeys.soa.all, "detail"] as const,
		detail: (id: string) => [...statementOfAccountQueryKeys.soa.details(), id] as const,
	},
};

export const useStatementOfAccounts = (params?: ApiQueryParams) => {
	return useQuery<StatementOfAccountListResponse>({
		queryKey: statementOfAccountQueryKeys.soa.list(params),
		queryFn: () =>
			statementOfAccountService
				.clearQueryParams()
				.select([
					"id",
					"soaNumber",
					"name",
					"startDate",
					"endDate",
					"dueDate",
					"totalAmount",
					"totalRemitted",
					"totalOutstanding",
					"status",
					"eppReconciled",
					"remitteeName",
				])
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort, params?.order)
				.setParams({
					...params,
					document: true,
					pagination: true,
					count: true,
				})
				.getStatementOfAccounts(),
		staleTime: 5 * 60 * 1000,
	});
};

export const useStatementOfAccount = (id: string) => {
	return useQuery<StatementOfAccount | null>({
		queryKey: statementOfAccountQueryKeys.soa.detail(id),
		queryFn: () =>
			statementOfAccountService
				.clearQueryParams()
				.setParams({ document: true })
				.getStatementOfAccountById(id),
		enabled: !!id,
		staleTime: 5 * 60 * 1000,
	});
};
