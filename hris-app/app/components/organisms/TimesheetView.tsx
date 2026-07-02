import { Loader2, FileText } from "lucide-react";
import type { ReactNode } from "react";
import { themeColors } from "~/lib/config/theme";
import {
	TimesheetEmployeeCard,
	type TimesheetEmployeeData,
} from "~/components/molecules/TimesheetEmployeeCard";
import {
	TimesheetHoursOverview,
	type TimesheetHoursData,
} from "~/components/molecules/TimesheetHoursOverview";
import {
	TimesheetCalendar,
	type TimesheetBreakdownDay,
	type TimesheetDayRequestAction,
} from "~/components/molecules/TimesheetCalendar";

export interface TimesheetViewProps {
	/** Employee data to display */
	employee?: TimesheetEmployeeData;
	/** Hours summary data */
	hours: TimesheetHoursData;
	/** Daily breakdown data for the calendar */
	breakdown?: TimesheetBreakdownDay[];
	/** Loading state */
	isLoading?: boolean;
	/** Error object */
	error?: any;
	/** Optional custom empty message */
	emptyMessage?: string;
	/** Optional class name */
	className?: string;
	/** Show employee card */
	showEmployee?: boolean;
	/** Callback when a day is clicked */
	onDayClick?: (day: TimesheetBreakdownDay) => void;
	onDayRequestAction?: (action: TimesheetDayRequestAction, day: TimesheetBreakdownDay) => void;
	/** Day keys that were edited in-memory and not yet submitted */
	modifiedDayKeys?: string[];
	/** Payroll period start date for week-label clamping */
	payrollPeriodStartDate?: string | null;
	/** Payroll period end date for week-label clamping */
	payrollPeriodEndDate?: string | null;
	/** Optional content rendered under employee + hours row */
	belowSummaryContent?: ReactNode;
	/** Optional callback to open employee profile */
	onOpenEmployeeProfile?: (employeeId: string) => void;
	/** Resolved employee profile id for deep-linking */
	employeeProfileId?: string;
}

function unwrapScheduleEnvelope(value: unknown) {
	if (
		value &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		"set" in value
	) {
		const envelope = value as { set?: unknown };
		if (envelope.set) {
			return envelope.set;
		}
	}
	return value;
}

export function TimesheetView({
	employee,
	hours,
	breakdown,
	isLoading = false,
	error,
	emptyMessage = "No timesheet data available",
	className = "",
	showEmployee = true,
	onDayClick,
	onDayRequestAction,
	modifiedDayKeys,
	payrollPeriodStartDate,
	payrollPeriodEndDate,
	belowSummaryContent,
	onOpenEmployeeProfile,
	employeeProfileId,
}: TimesheetViewProps) {
	const activeSchedule = unwrapScheduleEnvelope(employee?.embeddedSchedule);
	const hasEmployeeSchedule =
		Boolean(activeSchedule) &&
		!(
			typeof activeSchedule === "object" &&
			!Array.isArray(activeSchedule) &&
			Object.keys(activeSchedule as Record<string, unknown>).length === 0
		);
	const hasSnapshotBreakdown = Array.isArray(breakdown) && breakdown.length > 0;
	const showMissingScheduleNotice = Boolean(employee && !hasEmployeeSchedule && !hasSnapshotBreakdown);

	// Loading state
	if (isLoading) {
		return (
			<div className={`flex items-center justify-center py-12 ${className}`}>
				<Loader2 className="w-8 h-8 animate-spin" style={{ color: themeColors.orange }} />
				<span className="ml-3 text-gray-600">Loading timesheet...</span>
			</div>
		);
	}

	// Error state
	if (error) {
		return (
			<div className={`flex flex-col items-center justify-center py-16 ${className}`}>
				<div className="text-center space-y-6 max-w-md">
					<div className="flex justify-center">
						<FileText className="w-16 h-16 text-gray-300" />
					</div>
					<div className="space-y-4">
						<div>
							<p className="text-lg font-semibold text-red-600 mb-2">
								Error Loading Timesheet
							</p>
							<div className="bg-red-50 border border-red-200 rounded-lg p-4 text-left">
								<div className="space-y-2 text-sm">
									<div>
										<span className="font-semibold text-red-900">Status: </span>
										<span className="text-red-700">
											{(error as any)?.status || "error"}
										</span>
									</div>
									<div>
										<span className="font-semibold text-red-900">
											Message:{" "}
										</span>
										<span className="text-red-700">
											{(error as any)?.message ||
												"Failed to load timesheet data"}
										</span>
									</div>
								</div>
							</div>
						</div>
						<p className="text-sm text-gray-600">
							Please contact your administrator if this issue persists.
						</p>
					</div>
				</div>
			</div>
		);
	}

	// Empty state
	if ((!breakdown || breakdown.length === 0) && !payrollPeriodStartDate && !payrollPeriodEndDate) {
		return (
			<div className={`flex flex-col items-center justify-center py-16 ${className}`}>
				<div className="text-center space-y-6 max-w-md">
					<div className="flex justify-center">
						<FileText className="w-16 h-16 text-gray-300" />
					</div>
					<div>
						<p className="text-lg font-semibold text-gray-700 mb-2">{emptyMessage}</p>
						<p className="text-sm text-gray-500">
							The timesheet data could not be loaded.
						</p>
					</div>
				</div>
			</div>
		);
	}

	if (showMissingScheduleNotice) {
		return (
			<div className={`space-y-3 ${className}`}>
				<div className="flex gap-4">
					{showEmployee && employee && (
						<TimesheetEmployeeCard
							employee={employee}
							profileId={employeeProfileId}
							className="flex-[1] min-w-0"
							onOpenProfile={onOpenEmployeeProfile}
						/>
					)}

					<TimesheetHoursOverview
						hours={hours}
						className={showEmployee && employee ? "flex-[2] min-w-0" : "w-full"}
					/>
				</div>

				{belowSummaryContent}

				<div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
					<span className="font-semibold">No schedule assignment found.</span>{" "}
					Timesheet days cannot be projected until this employee has an active schedule.
				</div>
			</div>
		);
	}

	return (
		<div className={`space-y-4 ${className}`}>
			{/* Employee Details + Hours Overview Row */}
			<div className="flex gap-4">
				{/* Employee Details - Left (1/3 width) */}
				{showEmployee && employee && (
					<TimesheetEmployeeCard
						employee={employee}
						profileId={employeeProfileId}
						className="flex-[1] min-w-0"
						onOpenProfile={onOpenEmployeeProfile}
					/>
				)}

				{/* Hours Overview - Right (2/3 width) */}
				<TimesheetHoursOverview
					hours={hours}
					className={showEmployee && employee ? "flex-[2] min-w-0" : "w-full"}
				/>
			</div>

			{belowSummaryContent}

			{/* Calendar Table */}
			<TimesheetCalendar
				breakdown={breakdown}
				onDayClick={onDayClick}
				onDayRequestAction={onDayRequestAction}
				modifiedDayKeys={modifiedDayKeys}
				payrollPeriodStartDate={payrollPeriodStartDate}
				payrollPeriodEndDate={payrollPeriodEndDate}
			/>
		</div>
	);
}
