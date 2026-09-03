import { useQuery } from "@tanstack/react-query";
import eligibilityService, { type EligibilityCandidate } from "~/services/eligibility.service";

export const eligibilityQueryKeys = {
	all: ["eligibilityCandidates"] as const,
};

export const useEligibilityCandidates = () => {
	return useQuery<EligibilityCandidate[]>({
		queryKey: eligibilityQueryKeys.all,
		queryFn: async () => {
			return await eligibilityService.getCandidates();
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};
