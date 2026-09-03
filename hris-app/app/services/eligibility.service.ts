import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";

export interface EligibilityCandidate {
	employeeId: string;
	employeeName: string;
	department: string;
	position: string;
	currentEmploymentStatus: string;
	hireDate: string;
	tenureMonths: number;
	eligibleFor: "PROMOTION" | "REGULARIZATION" | "TERMINATION" | "TRANSFER";
	eligibilityReason: string;
	matchScore: number;
}

export interface EligibilityResponse {
	success: boolean;
	data: EligibilityCandidate[];
}

class EligibilityService extends APIService {
	/**
	 * Get list of eligibility candidates
	 */
	async getCandidates(): Promise<EligibilityCandidate[]> {
		try {

			const endpoint = `/api/eligibility/candidates`;
			const response = await hrisApiClient.get<EligibilityResponse>(endpoint);

			// Handle potentially different response structures
			// Based on API implementation: { success: true, data: [...] }

			let candidates: EligibilityCandidate[] = [];
			if (response.data && response.data.data) {
				candidates = response.data.data;
			} else if (Array.isArray(response.data)) {
				candidates = response.data;
			}

			return candidates;
		} catch (error: any) {
			console.error("Error fetching eligibility candidates:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching eligibility candidates",
			);
		}
	}
}

const eligibilityService = new EligibilityService();
export default eligibilityService;

