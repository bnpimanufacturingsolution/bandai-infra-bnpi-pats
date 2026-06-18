import { useState, useEffect } from "react";
import {
	useViewTimesheets,
	useSubmitTimesheet,
	useUpdateTimesheet,
	useRequestTimesheetEditPermission,
	useRequestTimesheetEditPermissionCurrent,
} from "~/lib/hooks/useTimesheets";
import type {
	ApprovedEditedDaysSummary,
	Timesheet,
	TimesheetBreakdown,
} from "~/services/timesheet.service";
import { TimesheetViewModal } from "./TimesheetViewModal";
import type { TimesheetBreakdownDay } from "~/components/molecules/TimesheetCalendarApproval";

interface TimesheetModalProps {
	isOpen: boolean;
	onClose: () => void;
	employeeId?: string;
	deepLinkDay?: string | null;
	onDeepLinkDayChange?: (day: string | null) => void;
}

export function TimesheetModal({
	isOpen,
	onClose,
	employeeId,
	deepLinkDay,
	onDeepLinkDayChange,
}: TimesheetModalProps) {
	const [currentTimesheet, setCurrentTimesheet] = useState<Timesheet | null>(null);
	const [approvedEditedDaysSummary, setApprovedEditedDaysSummary] =
		useState<ApprovedEditedDaysSummary | null>(null);

	// View timesheets query (auto-filtered by authenticated employee)
	// Only fetch when modal is open
	const {
		data: timesheetsData,
		isLoading: isLoadingView,
		error: viewError,
		refetch,
	} = useViewTimesheets({
		enabled: isOpen,
	});

	// Submit timesheet mutation (auto-generates if needed)
	const submitMutation = useSubmitTimesheet();
	const updateTimesheetMutation = useUpdateTimesheet();
	const requestEditPermissionMutation = useRequestTimesheetEditPermission();
	const requestEditPermissionCurrentMutation = useRequestTimesheetEditPermissionCurrent();

	// When modal opens, refetch timesheets
	useEffect(() => {
		if (isOpen) {
			refetch();
		}
	}, [isOpen, refetch]);

	// Update current timesheet when data changes
	useEffect(() => {
		if (timesheetsData && "timesheet" in timesheetsData) {
			setCurrentTimesheet(timesheetsData.timesheet);
			setApprovedEditedDaysSummary(timesheetsData.approvedEditedDaysSummary || null);
		} else if (!isLoadingView && timesheetsData) {
			// No timesheets found - only reset if we're not loading
			setCurrentTimesheet(null);
			setApprovedEditedDaysSummary(null);
		}
	}, [timesheetsData, isLoadingView]);

	const handleSubmit = async (updatedBreakdown: TimesheetBreakdownDay[]) => {
		try {
			const isSubmittedCorrectionFlow =
				currentTimesheet?.status === "SUBMITTED" &&
				(currentTimesheet?.editPermissionStatus === "APPROVED" ||
					currentTimesheet?.editPermissionStatus === "CONSUMED");
			const canPreUpdateBeforeSubmit =
				currentTimesheet?.status === "DRAFT" ||
				currentTimesheet?.status === "REVISED" ||
				isSubmittedCorrectionFlow;

			if (currentTimesheet?.id && canPreUpdateBeforeSubmit && updatedBreakdown?.length) {
				await updateTimesheetMutation.mutateAsync({
					id: currentTimesheet.id,
					payload: {
						breakdown: updatedBreakdown as TimesheetBreakdown[],
					},
				});
			}

			const submittedTimesheet = await submitMutation.mutateAsync(
				isSubmittedCorrectionFlow
					? {}
					: {
							breakdown: updatedBreakdown as TimesheetBreakdown[],
						},
			);

			// Instant UI feedback: reflect submitted status without requiring page refresh.
			setCurrentTimesheet((prev) =>
				prev
					? {
							...prev,
							...submittedTimesheet,
							status: submittedTimesheet?.status || "SUBMITTED",
						}
					: submittedTimesheet,
			);

			void refetch();
			onClose();
		} catch (error) {
			console.error("Failed to submit timesheet:", error);
		}
	};

	const handleRequestEditPermission = async (reason: string) => {
		if (!currentTimesheet) {
			throw new Error("Timesheet is not available");
		}

		if (currentTimesheet.id) {
			await requestEditPermissionMutation.mutateAsync({
				timesheetId: currentTimesheet.id,
				payload: { reason },
			});
		} else {
			await requestEditPermissionCurrentMutation.mutateAsync({
				reason,
				periodCode: currentTimesheet.payrollPeriod?.code,
			});
		}

		// Apply immediate local status update so UI feedback is instant,
		// then sync from server in the background.
		setCurrentTimesheet((prev) =>
			prev
				? {
						...prev,
						editPermissionStatus: "REQUESTED",
						editPermissionRequestedAt:
							prev.editPermissionRequestedAt || new Date().toISOString(),
					}
				: prev,
		);
		void refetch();
	};

	return (
		<TimesheetViewModal
			isOpen={isOpen}
			onClose={onClose}
			timesheet={currentTimesheet}
			isLoading={isLoadingView && !currentTimesheet}
			error={viewError}
			showActions={true}
			title="My Timesheet"
			onSubmit={handleSubmit}
			isSubmitting={submitMutation.isPending || updateTimesheetMutation.isPending}
			onRequestEditPermission={handleRequestEditPermission}
			isRequestingPermission={
				requestEditPermissionMutation.isPending ||
				requestEditPermissionCurrentMutation.isPending
			}
			approvedEditedDaysSummary={approvedEditedDaysSummary}
			deepLinkDay={deepLinkDay}
			onDeepLinkDayChange={onDeepLinkDayChange}
		/>
	);
}
