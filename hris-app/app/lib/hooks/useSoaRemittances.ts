import { useQuery } from "@tanstack/react-query";
import type { ApiQueryParams } from "~/services/api-service";
import {
	soaRemittanceService,
	type SoaRemittanceListResponse,
} from "~/services/soa-remittance.service";

export const soaRemittanceQueryKeys = {
	remittances: {
		all: ["soaRemittances"] as const,
		lists: () => [...soaRemittanceQueryKeys.remittances.all, "list"] as const,
		list: (params?: ApiQueryParams) =>
			[...soaRemittanceQueryKeys.remittances.lists(), { params }] as const,
		bySoa: (statementOfAccountId: string) =>
			[...soaRemittanceQueryKeys.remittances.all, "bySoa", statementOfAccountId] as const,
	},
};

export const useSoaRemittances = (
	params?: ApiQueryParams,
	options?: {
		enabled?: boolean;
	},
) => {
	return useQuery<SoaRemittanceListResponse>({
		queryKey: soaRemittanceQueryKeys.remittances.list(params),
		queryFn: () =>
			soaRemittanceService
				.clearQueryParams()
				.select([
					"id",
					"statementOfAccountId",
					"amount",
					"paymentMethod",
					"referenceNumber",
					"paymentDate",
					"category",
					"status",
					"notes",
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
				.getSoaRemittances(),
		enabled: options?.enabled ?? true,
		staleTime: 5 * 60 * 1000,
	});
};

export const useSoaRemittancesBySoaId = (statementOfAccountId: string) => {
	return useSoaRemittances(
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
