import type { CreateJob, Job, Tag, UpdateJob } from "~/zod/job.zod";
import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";

export interface CreateJobRequest extends CreateJob {}

export interface UpdateJobRequest extends UpdateJob {}

interface JobsResponse {
	data: Job[] | { jobs: Job[] };
	pagination?: {
		total: number;
		page: number;
		limit: number;
	};
}

class JobService extends APIService {
	private unwrapJobResponse<T>(payload: any): T {
		if (payload && typeof payload === "object" && "data" in payload) {
			return payload.data as T;
		}
		return payload as T;
	}

	/**
	 * Get all jobs with optional filtering, pagination, and sorting
	 * @returns Promise<JobsResponse> - Jobs response with pagination
	 */
	async getJobs(): Promise<JobsResponse> {
		try {
			const queryString = this.getQueryString();
			const response = await hrisApiClient.get<JobsResponse>(`/api/job${queryString}`);
			return (response.data || response) as JobsResponse;
		} catch (error: any) {
			console.error("Error fetching jobs:", error);
			throw new Error(error.errors?.[0]?.message || error.message || "Error fetching jobs");
		}
	}

	/**
	 * Get job by ID with optional field selection
	 * @param jobId Job ID
	 * @returns Promise<Job> - Job data
	 */
	async getJobById(jobId: string): Promise<Job> {
		try {
			const queryString = this.getQueryString();
			const response = await hrisApiClient.get<Job>(`/api/job/${jobId}${queryString}`);
			const jobData = this.unwrapJobResponse<Job>(response);
			if (!jobData) {
				throw new Error("Job not found");
			}
			return jobData;
		} catch (error: any) {
			console.error("Error fetching job:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching job",
			);
		}
	}

	/**
	 * Get job by position ID
	 * @param positionId Position ID
	 * @returns Promise<Job[]> - Jobs data for the position
	 */
	async getJobsByPositionId(positionId: string): Promise<Job[]> {
		try {
			const queryString = this.getQueryString();
			const response = await hrisApiClient.get<JobsResponse>(
				`/api/job?positionId=${positionId}${queryString}`,
			);
			const data = (response.data || response) as JobsResponse;
			const jobs = Array.isArray(data.data) ? data.data : data.data.jobs || [];

			return jobs;
		} catch (error: any) {
			console.error("Error fetching jobs by position ID:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching jobs by position ID",
			);
		}
	}

	/**
	 * Create a new job
	 * @param data Job creation data
	 * @returns Promise<Job> - Created job data
	 */
	async createJob(data: CreateJobRequest): Promise<Job> {
		try {
			const response = await hrisApiClient.post<Job>("/api/job", data);
			const jobData = this.unwrapJobResponse<Job>(response);
			if (!jobData) {
				throw new Error("Failed to create job");
			}
			return jobData;
		} catch (error: any) {
			console.error("Error creating job:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error creating job",
			);
		}
	}

	/**
	 * Update an existing job
	 * @param jobId Job ID
	 * @param data Job update data
	 * @returns Promise<Job> - Updated job data
	 */
	async updateJob(jobId: string, data: UpdateJobRequest): Promise<Job> {
		try {
			const response = await hrisApiClient.patch<Job>(`/api/job/${jobId}`, data);
			const jobData = this.unwrapJobResponse<Job>(response);
			if (!jobData) {
				throw new Error("Failed to update job");
			}
			return jobData;
		} catch (error: any) {
			console.error("Error updating job:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error updating job",
			);
		}
	}

	/**
	 * Delete a job (soft delete using DELETE)
	 * @param jobId Job ID
	 * @returns Promise<void>
	 */
	async deleteJob(jobId: string): Promise<void> {
		try {
			await hrisApiClient.delete(`/api/job/${jobId}`);
		} catch (error: any) {
			console.error("Error deleting job:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error deleting job",
			);
		}
	}

	/**
	 * Get jobs with specific parameters
	 * @param params Query parameters
	 * @returns Promise<JobsResponse> - Jobs response
	 */
	async getJobsWithParams(params: ApiQueryParams): Promise<JobsResponse> {
		return this.setParams(params).getJobs();
	}

	/**
	 * Search jobs by position ID or location
	 * @param query Search term
	 * @param params Optional query parameters
	 * @returns Promise<JobsResponse> - Jobs response
	 */
	async searchJobs(query: string, params?: ApiQueryParams): Promise<JobsResponse> {
		return this.search(query)
			.setParams(params || {})
			.getJobs();
	}

	/**
	 * Get jobs grouped by a specific field
	 * @param groupBy Field to group by
	 * @param params Optional query parameters
	 * @returns Promise<JobsResponse> - Jobs response
	 */
	async getJobsGrouped(groupBy: string, params?: ApiQueryParams): Promise<JobsResponse> {
		return this.setParams({
			...params,
			groupBy,
		}).getJobs();
	}

	/**
	 * Update job tags
	 * @param jobId Job ID
	 * @param tags Tags array to update
	 * @returns Promise<Job> - Updated job data
	 */
	async updateJobTags(jobId: string, tags: Tag[]): Promise<Job> {
		try {
			const response = await hrisApiClient.patch<Job>(`/api/job/${jobId}`, {
				tags,
			});
			const jobData = this.unwrapJobResponse<Job>(response);
			if (!jobData) {
				throw new Error("Failed to update job tags");
			}
			return jobData;
		} catch (error: any) {
			console.error("Error updating job tags:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error updating job tags",
			);
		}
	}

	/**
	 * Update job location
	 * @param jobId Job ID
	 * @param location Location to update
	 * @returns Promise<Job> - Updated job data
	 */
	async updateJobLocation(jobId: string, location: string | null): Promise<Job> {
		try {
			const response = await hrisApiClient.patch<Job>(`/api/job/${jobId}`, {
				location,
			});
			const jobData = this.unwrapJobResponse<Job>(response);
			if (!jobData) {
				throw new Error("Failed to update job location");
			}
			return jobData;
		} catch (error: any) {
			console.error("Error updating job location:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error updating job location",
			);
		}
	}

	/**
	 * Update job type
	 * @param jobId Job ID
	 * @param type Type to update
	 * @returns Promise<Job> - Updated job data
	 */
	async updateJobType(jobId: string, type: string | null): Promise<Job> {
		try {
			const response = await hrisApiClient.patch<Job>(`/api/job/${jobId}`, {
				type,
			});
			const jobData = this.unwrapJobResponse<Job>(response);
			if (!jobData) {
				throw new Error("Failed to update job type");
			}
			return jobData;
		} catch (error: any) {
			console.error("Error updating job type:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error updating job type",
			);
		}
	}

	/**
	 * Get active jobs only (not deleted)
	 * @param params Optional query parameters
	 * @returns Promise<JobsResponse> - Active jobs response
	 */
	async getActiveJobs(params?: ApiQueryParams): Promise<JobsResponse> {
		const activeFilter =
			typeof params?.filter === "string"
				? `isDeleted:false,${params.filter}`
				: Array.isArray(params?.filter)
					? [{ isDeleted: false }, ...params.filter]
					: { isDeleted: false, ...(params?.filter || {}) };

		return this.clearQueryParams().setParams({
			...params,
			filter: activeFilter,
		}).getJobs();
	}

	/**
	 * Get jobs by location
	 * @param location Location to filter by
	 * @param params Optional query parameters
	 * @returns Promise<JobsResponse> - Jobs response
	 */
	async getJobsByLocation(location: string, params?: ApiQueryParams): Promise<JobsResponse> {
		return this.setParams({
			...params,
			filter: { location },
		}).getJobs();
	}

	/**
	 * Get jobs by type
	 * @param type Type to filter by
	 * @param params Optional query parameters
	 * @returns Promise<JobsResponse> - Jobs response
	 */
	async getJobsByType(type: string, params?: ApiQueryParams): Promise<JobsResponse> {
		return this.setParams({
			...params,
			filter: { type },
		}).getJobs();
	}

	/**
	 * Soft delete a job (mark as deleted)
	 * @param jobId Job ID
	 * @returns Promise<Job> - Updated job data
	 */
	async softDeleteJob(jobId: string): Promise<Job> {
		try {
			const response = await hrisApiClient.patch<Job>(`/api/job/${jobId}`, {
				isDeleted: true,
			});
			const jobData = this.unwrapJobResponse<Job>(response);
			if (!jobData) {
				throw new Error("Failed to soft delete job");
			}
			return jobData;
		} catch (error: any) {
			console.error("Error soft deleting job:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error soft deleting job",
			);
		}
	}

	/**
	 * Restore a soft-deleted job
	 * @param jobId Job ID
	 * @returns Promise<Job> - Updated job data
	 */
	async restoreJob(jobId: string): Promise<Job> {
		try {
			const response = await hrisApiClient.patch<Job>(`/api/job/${jobId}`, {
				isDeleted: false,
			});
			const jobData = this.unwrapJobResponse<Job>(response);
			if (!jobData) {
				throw new Error("Failed to restore job");
			}
			return jobData;
		} catch (error: any) {
			console.error("Error restoring job:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error restoring job",
			);
		}
	}
}

// Export singleton instance
const jobService = new JobService();
export default jobService;
