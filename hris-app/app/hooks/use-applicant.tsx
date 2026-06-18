import { useMutation, useQuery } from "@tanstack/react-query";
import type { ApiQueryParams } from "~/services/api-service";
import { queryClient } from "~/lib/query-client";
import type { CreateApplicant, Applicant, UpdateApplicant } from "~/zod/applicant";
import applicantService from "~/services/applicant.service";

import { toast } from "sonner";

export const useGetApplicants = (apiParams?: ApiQueryParams) => {
	return useQuery({
		queryKey: ["applicants", apiParams],
		queryFn: () => {
			const service = applicantService
				.select(apiParams?.fields || "")
				.search(apiParams?.query || "")
				.paginate(apiParams?.page || 1, apiParams?.limit || 10)
				.sort(apiParams?.sort, apiParams?.order);

			// Only apply filter if it's an object or array (not a string)
			if (apiParams?.filter && typeof apiParams.filter !== "string") {
				service.filter(apiParams.filter);
			}

			return service.getApplicants();
		},
	});
};

export const useGetApplicantById = (applicantId: string, apiParams?: ApiQueryParams) => {
	return useQuery<Applicant>({
		queryKey: ["applicant-by-id", applicantId, apiParams],
		queryFn: async () => {
			const result = await applicantService
				.select(apiParams?.fields || "")
				.getApplicantById(applicantId);
			if (!result) {
				throw new Error("Applicant not found");
			}
			return result;
		},
		enabled: !!applicantId,
	});
};

export const useCreateApplicant = () => {
	return useMutation({
		mutationFn: (data: CreateApplicant | FormData) => {
			return applicantService.createApplicant(data);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["applicants"] });
		},
	});
};

export const useUpdateApplicant = () => {
	return useMutation({
		mutationFn: ({
			applicantId,
			data,
		}: {
			applicantId: string;
			data: UpdateApplicant | FormData;
		}) => {
			return applicantService.updateApplicant(applicantId, data);
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["applicants"] });
			queryClient.invalidateQueries({ queryKey: ["applicant-by-id", variables.applicantId] });
		},
	});
};

export const useDeleteApplicant = () => {
	return useMutation({
		mutationFn: (applicantId: string) => {
			return applicantService.deleteApplicant(applicantId);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["applicants"] });
		},
	});
};
