import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";

import type { CreateApplicant, Applicant, UpdateApplicant } from "~/zod/applicant";

const stripHtmlTags = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const extractApplicantServiceErrorMessage = (
	error: any,
	fallback: string,
): string => {
	const candidate =
		error?.errors?.[0]?.message ||
		error?.data?.errors?.[0]?.message ||
		error?.message ||
		error?.error ||
		"";

	if (typeof candidate === "string") {
		const trimmed = candidate.trim();
		if (!trimmed) return fallback;
		if (/<!DOCTYPE html>|<html[\s>]/i.test(trimmed)) {
			return fallback;
		}

		const stripped = stripHtmlTags(trimmed);
		if (!stripped || /<!DOCTYPE html>|<html[\s>]/i.test(stripped)) {
			return fallback;
		}

		return stripped;
	}

	return fallback;
};

const createApplicantServiceError = (error: any, fallback: string) => {
	const serviceError = new Error(extractApplicantServiceErrorMessage(error, fallback)) as Error & {
		errors?: Array<{ field?: string; message: string }>;
		data?: unknown;
		status?: number;
	};

	if (Array.isArray(error?.errors)) {
		serviceError.errors = error.errors;
	}
	if (error?.data !== undefined) {
		serviceError.data = error.data;
	}
	if (typeof error?.status === "number") {
		serviceError.status = error.status;
	}

	return serviceError;
};

// Type for paginated response
export interface ApplicantsResponse {
	data: Applicant[] | { applicants: Applicant[] };
	pagination?: {
		total: number;
		page: number;
		limit: number;
	};
}

export type ApplicantActionType =
	| "ADVANCE"
	| "APPROVE_STEP"
	| "REJECT_STEP"
	| "COMPLETE_STEP"
	| "ASSIGN_RECRUITER"
	| "SCHEDULE_INTERVIEW"
	| "SEND_OFFER"
	| "SAVE_PRE_HIRE_SETUP"
	| "MARK_ONBOARDING_READY"
	| "MARK_HIRED";

export interface ApplicantActionRequest {
	action: ApplicantActionType;
	comments?: string;
	stepExecutionId?: string;
	targetStateKey?: string;
	metadata?: Record<string, unknown>;
}

export interface RecruitmentActivityRecord {
	id: string;
	type: string;
	title: string;
	stateKey?: string | null;
	details?: Record<string, unknown> | null;
	occurredAt: string;
}

export interface ApplicantAttachmentRecord {
	id: string;
	type: string;
	name: string;
	url: string;
	mimeType?: string | null;
	size?: number | null;
	uploadedAt: string;
}

class ApplicantService extends APIService {
	/**
	 * Get all applicants with optional filtering, pagination, and sorting
	 * Uses query parameters set via method chaining (select, search, paginate, sort, setParams)
	 * @returns Promise<ApplicantsResponse> - Applicants response with pagination
	 */
	async getApplicants(): Promise<ApplicantsResponse> {
		try {
			// Set the auth token for HRIS API client

			const queryString = this.getQueryString();
			const endpoint = `/api/applicant${queryString}`;

			console.log("Fetching applicants from HRIS API:", endpoint);

			const response = await hrisApiClient.get<ApplicantsResponse>(endpoint);

			// Handle nested data structure if API returns { data: { ... } }
			let applicantsData = response.data;
			if (applicantsData && typeof applicantsData === "object" && "data" in applicantsData) {
				applicantsData = (applicantsData as any).data;
			}

			if (!applicantsData) {
				throw new Error("Failed to fetch applicants");
			}
			return applicantsData as ApplicantsResponse;
		} catch (error: any) {
			console.error("Error fetching applicants:", error);
			throw createApplicantServiceError(error, "Error fetching applicants");
		}
	}

	/**
	 * Get a single applicant by ID
	 * @param id Applicant ID
	 * @returns Promise<Applicant> - Applicant record
	 */
	async getApplicantById(id: string): Promise<Applicant> {
		try {

			const queryString = this.getQueryString();
			const endpoint = `/api/applicant/${id}${queryString}`;

			console.log("Fetching applicant from HRIS API:", endpoint);

			const response = await hrisApiClient.get<{ data: { applicant: Applicant } }>(endpoint);

			if (!response.data) {
				throw new Error("Failed to fetch applicant");
			}

			// Handle nested data structure
			const applicantData = response.data.data?.applicant || response.data;
			return applicantData as Applicant;
		} catch (error: any) {
			console.error("Error fetching applicant:", error);
			throw createApplicantServiceError(error, "Error fetching applicant");
		}
	}

	/**
	 * Create a new applicant
	 * @param data Applicant data or FormData for file uploads
	 * @returns Promise<Applicant> - Created applicant record
	 */
	async createApplicant(data: CreateApplicant | FormData): Promise<Applicant> {
		try {

			console.log("Creating applicant in HRIS API");

			// Don't set Content-Type header manually for FormData - let the browser/axios set it automatically
			// with the correct boundary for multipart/form-data
			const response = await hrisApiClient.post<{ data: Applicant }>("/api/applicant", data);

			if (!response.data) {
				throw new Error("Failed to create applicant");
			}

			// Handle nested data structure
			const applicantData = response.data.data || response.data;
			return applicantData as Applicant;
		} catch (error: any) {
			console.error("Error creating applicant:", error);
			throw createApplicantServiceError(error, "Error creating applicant");
		}
	}

	/**
	 * Update an existing applicant
	 * @param id Applicant ID
	 * @param data Applicant data or FormData for file uploads
	 * @returns Promise<Applicant> - Updated applicant record
	 */
	async updateApplicant(id: string, data: UpdateApplicant | FormData): Promise<Applicant> {
		try {

			console.log("Updating applicant in HRIS API:", id);

			// Don't set Content-Type header manually for FormData - let the browser/axios set it automatically
			// with the correct boundary for multipart/form-data
			const response = await hrisApiClient.patch<{ data: Applicant }>(
				`/api/applicant/${id}`,
				data,
			);

			if (!response.data) {
				throw new Error("Failed to update applicant");
			}

			// Handle nested data structure
			const applicantData = response.data.data || response.data;
			return applicantData as Applicant;
		} catch (error: any) {
			console.error("Error updating applicant:", error);
			throw createApplicantServiceError(error, "Error updating applicant");
		}
	}

	async runAction(id: string, payload: ApplicantActionRequest): Promise<Applicant> {
		try {
			const response = await hrisApiClient.post<{ data: Applicant }>(
				`/api/applicant/${id}/action`,
				payload,
			);

			if (!response.data) {
				throw new Error("Failed to run applicant action");
			}

			const applicantData = response.data.data || response.data;
			return applicantData as Applicant;
		} catch (error: any) {
			console.error("Error running applicant action:", error);
			throw createApplicantServiceError(error, "Error running applicant action");
		}
	}

	async getActivities(id: string): Promise<RecruitmentActivityRecord[]> {
		const response = await hrisApiClient.get<any>(`/api/applicant/${id}/activities`);
		const payload = response?.data?.data || response?.data;
		return (payload?.activities || []) as RecruitmentActivityRecord[];
	}

	async getAttachments(id: string): Promise<ApplicantAttachmentRecord[]> {
		const response = await hrisApiClient.get<any>(`/api/applicant/${id}/attachments`);
		const payload = response?.data?.data || response?.data;
		return (payload?.attachments || []) as ApplicantAttachmentRecord[];
	}

	async uploadAttachment(
		id: string,
		formData: FormData,
	): Promise<ApplicantAttachmentRecord> {
		const response = await hrisApiClient.post<any>(`/api/applicant/${id}/attachments`, formData);
		const payload = response?.data?.data || response?.data;
		return payload as ApplicantAttachmentRecord;
	}

	/**
	 * Delete (soft delete) an applicant
	 * @param id Applicant ID
	 * @returns Promise<Applicant> - Deleted applicant record
	 */
	async deleteApplicant(id: string): Promise<Applicant> {
		try {

			console.log("Deleting applicant in HRIS API:", id);

			const response = await hrisApiClient.put<{ data: Applicant }>(`/api/applicant/${id}`);

			if (!response.data) {
				throw new Error("Failed to delete applicant");
			}

			// Handle nested data structure
			const applicantData = response.data.data || response.data;
			return applicantData as Applicant;
		} catch (error: any) {
			console.error("Error deleting applicant:", error);
			throw createApplicantServiceError(error, "Error deleting applicant");
		}
	}
}

// Export singleton instance
export const applicantService = new ApplicantService();
export default applicantService;

