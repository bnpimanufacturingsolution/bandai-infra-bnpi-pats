import { useQuery } from "@tanstack/react-query";
import type { ApiQueryParams } from "~/services/api-service";
import {
	soaLineItemService,
	type SoaLineItemListResponse,
} from "~/services/soa-line-item.service";

export const soaLineItemQueryKeys = {
	lineItems: {
		all: ["soaLineItems"] as const,
		lists: () => [...soaLineItemQueryKeys.lineItems.all, "list"] as const,
		list: (params?: ApiQueryParams) =>
			[...soaLineItemQueryKeys.lineItems.lists(), { params }] as const,
		bySoa: (statementOfAccountId: string) =>
			[...soaLineItemQueryKeys.lineItems.all, "bySoa", statementOfAccountId] as const,
	},
};

export const useSoaLineItems = (
	params?: ApiQueryParams,
	options?: {
		enabled?: boolean;
	},
) => {
	return useQuery<SoaLineItemListResponse>({
		queryKey: soaLineItemQueryKeys.lineItems.list(params),
		queryFn: () =>
			soaLineItemService
				.clearQueryParams()
				.select([
					"id",
					"statementOfAccountId",
					"category",
					"description",
					"employeeId",
					"employeePayrollId",
					"employeeLoanId",
					"employeeBenefitId",
					"taxableAmount",
					"taxAmount",
					"employeeShare",
					"employerShare",
					"totalAmount",
					"metadata",
					"createdAt",
					"updatedAt",
				])
				.search(params?.query)
				.paginate(params?.page, params?.limit)
				.sort(params?.sort, params?.order)
				.setParams({
					...params,
					document: true,
					pagination: params?.pagination ?? true,
					count: params?.count ?? true,
				})
				.getSoaLineItems(),
		enabled: options?.enabled ?? true,
		staleTime: 5 * 60 * 1000,
	});
};

export const useSoaLineItemsBySoaId = (statementOfAccountId: string) => {
	return useSoaLineItems(
		{
			page: 1,
			limit: 200,
			filter: `statementOfAccountId:${statementOfAccountId}`,
			sort: "createdAt",
			order: "desc",
			pagination: true,
			count: true,
		},
		{ enabled: !!statementOfAccountId },
	);
};
