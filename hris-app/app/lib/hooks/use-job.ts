import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ApiQueryParams } from "~/services/api-service";
import jobService, { type CreateJobRequest, type UpdateJobRequest } from "~/services/job.service";
import type { Job, Tag } from "~/zod/job.zod";
import { usePositions } from "./usePositions";
import { useLevels } from "./useLevels";

// Query keys
export const jobKeys = {
	all: ["jobs"] as const,
	lists: () => [...jobKeys.all, "list"] as const,
	list: (params?: ApiQueryParams) => [...jobKeys.lists(), { params }] as const,
	details: () => [...jobKeys.all, "detail"] as const,
	detail: (id: string) => [...jobKeys.details(), id] as const,
	byPosition: (positionId: string) => [...jobKeys.all, "byPosition", positionId] as const,
	byLocation: (location: string, params?: ApiQueryParams) =>
		[...jobKeys.all, "byLocation", location, { params }] as const,
	byType: (type: string, params?: ApiQueryParams) =>
		[...jobKeys.all, "byType", type, { params }] as const,
};

// Get all jobs
export function useJobs(params?: ApiQueryParams) {
	return useQuery({
		queryKey: jobKeys.list(params),
		queryFn: () => {
			return jobService
				.clearQueryParams()
				.select(params?.fields)
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort, params?.order)
				.setParams(params || {})
				.getJobs();
		},
		select: (data) => {
			// Handle different response structures
			if (Array.isArray(data.data)) {
				return { ...data, jobs: data.data };
			}
			if (data.data && "jobs" in data.data) {
				return { ...data, jobs: data.data.jobs };
			}
			return data;
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}

// Get job by ID
export function useJob(id: string, enabled = true, params?: ApiQueryParams) {
	return useQuery({
		queryKey: [...jobKeys.detail(id), { params }],
		queryFn: () =>
			jobService.clearQueryParams().select(params?.fields).setParams(params || {}).getJobById(id),
		enabled: enabled && !!id,
	});
}

// Get jobs by position ID
export function useJobsByPosition(positionId: string, enabled = true) {
	return useQuery({
		queryKey: jobKeys.byPosition(positionId),
		queryFn: () => jobService.getJobsByPositionId(positionId),
		enabled: enabled && !!positionId,
	});
}

// Get jobs by location
export function useJobsByLocation(location: string, params?: ApiQueryParams) {
	return useQuery({
		queryKey: jobKeys.byLocation(location, params),
		queryFn: () => jobService.getJobsByLocation(location, params),
		enabled: !!location,
		select: (data) => {
			// Handle different response structures
			if (Array.isArray(data.data)) {
				return { ...data, jobs: data.data };
			}
			if (data.data && "jobs" in data.data) {
				return { ...data, jobs: data.data.jobs };
			}
			return data;
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}

// Get jobs by type
export function useJobsByType(type: string, params?: ApiQueryParams) {
	return useQuery({
		queryKey: jobKeys.byType(type, params),
		queryFn: () => jobService.getJobsByType(type, params),
		enabled: !!type,
		select: (data) => {
			// Handle different response structures
			if (Array.isArray(data.data)) {
				return { ...data, jobs: data.data };
			}
			if (data.data && "jobs" in data.data) {
				return { ...data, jobs: data.data.jobs };
			}
			return data;
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}

// Get active jobs
export function useActiveJobs(params?: ApiQueryParams) {
	return useQuery({
		queryKey: [...jobKeys.lists(), "active", { params }],
		queryFn: () => jobService.getActiveJobs(params),
		select: (data) => {
			// Handle different response structures
			if (Array.isArray(data.data)) {
				return { ...data, jobs: data.data };
			}
			if (data.data && "jobs" in data.data) {
				return { ...data, jobs: data.data.jobs };
			}
			return data;
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}

// Create job mutation
export function useCreateJob() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: CreateJobRequest) => jobService.createJob(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
			toast.success("Job created successfully");
		},
		onError: (error: any) => {
			toast.error(error.message || "Failed to create job");
		},
	});
}

// Update job mutation
export function useUpdateJob() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: UpdateJobRequest }) =>
			jobService.updateJob(id, data),
		onSuccess: (_, { id }) => {
			queryClient.invalidateQueries({ queryKey: jobKeys.detail(id) });
			queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
			toast.success("Job updated successfully");
		},
		onError: (error: any) => {
			toast.error(error.message || "Failed to update job");
		},
	});
}

// Delete job mutation
export function useDeleteJob() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => jobService.deleteJob(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
			toast.success("Job deleted successfully");
		},
		onError: (error: any) => {
			toast.error(error.message || "Failed to delete job");
		},
	});
}

// Soft delete job mutation
export function useSoftDeleteJob() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => jobService.softDeleteJob(id),
		onSuccess: (_, id) => {
			queryClient.invalidateQueries({ queryKey: jobKeys.detail(id) });
			queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
			toast.success("Job deleted successfully");
		},
		onError: (error: any) => {
			toast.error(error.message || "Failed to delete job");
		},
	});
}

// Restore job mutation
export function useRestoreJob() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => jobService.restoreJob(id),
		onSuccess: (_, id) => {
			queryClient.invalidateQueries({ queryKey: jobKeys.detail(id) });
			queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
			toast.success("Job restored successfully");
		},
		onError: (error: any) => {
			toast.error(error.message || "Failed to restore job");
		},
	});
}

// Update job tags mutation
export function useUpdateJobTags() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, tags }: { id: string; tags: Tag[] }) =>
			jobService.updateJobTags(id, tags),
		onSuccess: (_, { id }) => {
			queryClient.invalidateQueries({ queryKey: jobKeys.detail(id) });
			queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
			toast.success("Job tags updated successfully");
		},
		onError: (error: any) => {
			toast.error(error.message || "Failed to update job tags");
		},
	});
}

// Update job location mutation
export function useUpdateJobLocation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, location }: { id: string; location: string | null }) =>
			jobService.updateJobLocation(id, location),
		onSuccess: (_, { id }) => {
			queryClient.invalidateQueries({ queryKey: jobKeys.detail(id) });
			queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
			toast.success("Job location updated successfully");
		},
		onError: (error: any) => {
			toast.error(error.message || "Failed to update job location");
		},
	});
}

// Update job type mutation
export function useUpdateJobType() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, type }: { id: string; type: string | null }) =>
			jobService.updateJobType(id, type),
		onSuccess: (_, { id }) => {
			queryClient.invalidateQueries({ queryKey: jobKeys.detail(id) });
			queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
			toast.success("Job type updated successfully");
		},
		onError: (error: any) => {
			toast.error(error.message || "Failed to update job type");
		},
	});
}

export const useJobManagementData = () => {
	const { data: jobsData, isLoading: isLoadingJobs } = useJobs();
	const { data: positionsData } = usePositions({
		limit: 1000,
		document: true,
		fields: "id,code,title,description,departmentId,minSalary,maxSalary,levels.id,levels.levelId,levels.level.id,levels.level.name,levels.level.rank",
	});
	const { data: levelsData } = useLevels({ limit: 1000 });

	const jobsArray = (jobsData as any)?.jobs || jobsData?.data || [];
	const jobs = (Array.isArray(jobsArray) ? jobsArray : []) as Job[];
	const positions = (positionsData?.positions || []) as any[];
	const levels = (levelsData as any)?.levels || (levelsData as any)?.data?.levels || [];

	console.log("=== useJobManagementData Debug ===");
	console.log("Positions data:", positions);
	console.log("Sample position with levels:", positions[0]);
	console.log("=================================");

	return {
		jobs,
		positions,
		levels,
		isLoadingJobs,
	};
};

export const useJobManagementActions = () => {
	const createJobMutation = useCreateJob();
	const updateJobMutation = useUpdateJob();
	const softDeleteJobMutation = useSoftDeleteJob();

	const handleSubmit = (
		data: CreateJobRequest,
		editingJob: Job | null,
		onSuccess: () => void,
	) => {
		if (editingJob) {
			updateJobMutation.mutate({ id: editingJob.id, data: data as any }, { onSuccess });
		} else {
			createJobMutation.mutate(data, { onSuccess });
		}
	};

	const handleDelete = (id: string, onConfirm?: () => void) => {
		if (confirm("Are you sure you want to delete this job opening?")) {
			softDeleteJobMutation.mutate(id);
			onConfirm?.();
		}
	};

	return {
		handleSubmit,
		handleDelete,
		isLoading: createJobMutation.isPending || updateJobMutation.isPending,
	};
};
