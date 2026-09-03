import { useQuery } from "@tanstack/react-query";
import attendanceService, { type ImportJobProgress } from "~/services/attendance.service";

export const useAttendanceImportProgress = (jobId: string | null, enabled: boolean = true) => {
	const query = useQuery({
		queryKey: ["attendanceImportProgress", jobId],
		queryFn: async () => {
			if (!jobId) return null;
			return await attendanceService.getImportProgress(jobId);
		},
		enabled: enabled && !!jobId,
		refetchInterval: (query) => {
			const data = query.state.data as ImportJobProgress | undefined;
			// Stop polling when job is completed or failed
			if (data?.status === "completed" || data?.status === "failed") {
				return false;
			}
			// Poll every 500ms while processing
			return 500;
		},
		retry: false, // Don't retry on failure
		refetchOnWindowFocus: false,
	});

	return {
		progress: query.data,
		isPolling: query.isFetching,
		error: query.error,
		isLoading: query.isLoading,
	};
};
