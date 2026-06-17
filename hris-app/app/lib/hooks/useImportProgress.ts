import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import employeesService from "~/services/employees.service";

export interface ImportProgressLogEntry {
	row: number;
	employeeId: string;
	fullName?: string;
	success: boolean;
	message?: string;
	createdAt?: string;
}

export interface CredentialExportEntry {
	row?: number;
	employeeId: string;
	fullName?: string;
	email: string;
	userName: string;
	password: string;
	role: string;
}

export interface ImportJobProgress {
	jobId: string;
	status: "processing" | "completed" | "failed";
	total: number;
	processed: number;
	success: number;
	failed: number;
	created?: number;
	updated?: number;
	skipped?: number;
	blocked?: number;
	errors: Array<{ row: number; employeeId: string; error: string }>;
	warnings?: Array<{ row?: number; employeeId: string; stage: string; message: string }>;
	/** Live log of recent rows (success + failure) for UI */
	recentLog?: ImportProgressLogEntry[];
	/** Downloadable login credentials for successfully provisioned rows */
	credentialExports?: CredentialExportEntry[];
	phaseTimings?: Array<{
		phase: string;
		startedAt: string;
		completedAt?: string;
		durationMs?: number;
		details?: Record<string, number | string | boolean>;
	}>;
	startedAt: string;
	completedAt?: string;
	durationMs?: number;
}

export const useImportProgress = (jobId: string | null, enabled: boolean = true) => {
	// Track if we should keep polling - stop when job is completed
	const [shouldPoll, setShouldPoll] = useState(true);

	// Reset polling state when jobId changes
	useEffect(() => {
		setShouldPoll(true);
	}, [jobId]);

	const query = useQuery({
		queryKey: ["importProgress", jobId],
		queryFn: async () => {
			if (!jobId) return null;
			return await employeesService.getImportProgress(jobId);
		},
		enabled: enabled && !!jobId && shouldPoll,
		refetchInterval: shouldPoll ? 500 : false,
		retry: false, // Don't retry on failure
		refetchOnWindowFocus: false,
	});

	const progress = query.data as ImportJobProgress | undefined;
	const isCompleted = progress?.status === "completed" || progress?.status === "failed";

	// Stop polling when job completes
	useEffect(() => {
		if (isCompleted && shouldPoll) {
			setShouldPoll(false);
		}
	}, [isCompleted, shouldPoll]);

	return {
		progress: progress || null,
		isPolling: query.isFetching && !isCompleted,
		error: query.error,
		isLoading: query.isLoading && !progress,
	};
};
