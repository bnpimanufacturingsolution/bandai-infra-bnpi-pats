import { useSearchParams } from "react-router";
import { formatDate } from "~/lib/utils/text-utils";
import {
	useCreatePayrollCorrection,
	useRequestTimesheetEditPermission,
	useTimesheet,
	useTimesheetAction,
	useTimesheets,
	useUpdateTimesheet,
} from "~/lib/hooks/useTimesheets";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { Badge } from "~/components/atoms/Badge";
import { Calendar, FileText, MoreVertical, Eye } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Button } from "~/components/atoms/Button";
import { TimesheetViewModal } from "~/components/organisms/TimesheetViewModal";
import { EmployeeTableCell } from "~/components/molecules/EmployeeTableCell";
import type {
	CreatePayrollCorrectionPayload,
	Timesheet,
	TimesheetBreakdown,
} from "~/services/timesheet.service";
import type { TimesheetBreakdownDay } from "~/components/molecules/TimesheetCalendarApproval";

interface TimesheetsTabProps {
	employeeIdOverride?: string;
	showActions?: boolean;
}

export default function TimesheetsTab({
	employeeIdOverride,
	showActions = true,
}: TimesheetsTabProps) {
	const [searchParams, setSearchParams] = useSearchParams();

	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const action = searchParams.get("action");
	const id = searchParams.get("id");

	const {
		data: timesheetsData,
		isLoading,
		error,
	} = useTimesheets({
		page: pageParam,
		limit: limitParam,
		sort: "createdAt",
		order: "desc",
		document: "true",
		pagination: "true",
		count: "true",
		fields:
			"id,totalHoursWorked,totalRegularHours,totalOvertimeHours,status,submittedAt,lockedAt,lockedEmployeePayrollId,lockReason,payrollPeriod.name,payrollPeriod.startDate,payrollPeriod.endDate,employee.id,employee.employeeId,employee.user.avatar,employee.person.personalInfo.firstName,employee.person.personalInfo.lastName",
		...(employeeIdOverride && { filter: `employeeId:${employeeIdOverride}` }),
	});

	// Match departments.tsx pattern for active item logic
	const activeTimesheetId = action === "view" ? id : null;
	const { data: activeTimesheet, isLoading: isViewLoading } = useTimesheet(
		activeTimesheetId || "",
	);
	const timesheetActionMutation = useTimesheetAction();
	const updateTimesheetMutation = useUpdateTimesheet();
	const requestEditPermissionMutation = useRequestTimesheetEditPermission();
	const createPayrollCorrectionMutation = useCreatePayrollCorrection();

	const timesheets = timesheetsData?.timesheets || [];
	const pagination = timesheetsData?.pagination;
	const selectedTimesheetSummary = timesheets.find((item: any) => item.id === activeTimesheetId);
	const modalTimesheet: Timesheet | null =
		activeTimesheet || selectedTimesheetSummary
			? ({
					...(selectedTimesheetSummary ?? {}),
					...(activeTimesheet ?? {}),
					payrollPeriod:
						activeTimesheet?.payrollPeriod ?? selectedTimesheetSummary?.payrollPeriod,
					// Prefer detail id, then list row, then URL — required for correction CTA
					id:
						activeTimesheet?.id ||
						selectedTimesheetSummary?.id ||
						activeTimesheetId ||
						null,
				} as Timesheet)
			: null;

	// Pagination handlers
	const handlePageChange = (page: number) => {
		updateSearchParams((next) => {
			next.set("page", page.toString());
		});
	};

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const handleView = (timesheetId: string) => {
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", timesheetId);
		});
	};

	const closeView = () => {
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("id");
		});
	};

	const handleSubmit = async ({
		breakdown,
		editedDayKeys,
	}: {
		breakdown: TimesheetBreakdownDay[];
		editedDayKeys: string[];
	}) => {
		if (!activeTimesheet?.id) return;
		const canPreUpdateBeforeSubmit =
			activeTimesheet.status === "DRAFT" ||
			activeTimesheet.status === "REVISED" ||
			(activeTimesheet.status === "SUBMITTED" &&
				(activeTimesheet.editPermissionStatus === "APPROVED" ||
					activeTimesheet.editPermissionStatus === "CONSUMED"));
		if (breakdown?.length) {
			if (canPreUpdateBeforeSubmit) {
				await updateTimesheetMutation.mutateAsync({
					id: activeTimesheet.id,
					payload: {
						breakdown: breakdown as TimesheetBreakdown[],
						editedDayKeys,
					},
				});
			}
		}

		await timesheetActionMutation.mutateAsync({
			id: activeTimesheet.id,
			action: {
				action: "SUBMIT",
				editedDayKeys,
			},
		});
		closeView();
	};

	const handleRequestEditPermission = async (reason: string) => {
		if (!activeTimesheet?.id) return;
		await requestEditPermissionMutation.mutateAsync({
			timesheetId: activeTimesheet.id,
			payload: { reason },
		});
	};

	const handleRequestPayrollCorrection = async (payload: CreatePayrollCorrectionPayload) => {
		if (!activeTimesheet?.id) return;
		await createPayrollCorrectionMutation.mutateAsync({
			timesheetId: activeTimesheet.id,
			payload,
		});
	};

	const isTimesheetPayrollLocked = (item: {
		lockedAt?: string | null;
		lockedEmployeePayrollId?: string | null;
		lockReason?: string | null;
	}) => Boolean(item?.lockedAt || item?.lockedEmployeePayrollId || item?.lockReason);

	const getStatusBadgeColor = (status: string) => {
		// Single primary badge treatment per design-system categorical guidance
		switch (status) {
			case "APPROVED":
				return "bg-emerald-100 text-emerald-800 border-emerald-200";
			case "SUBMITTED":
				return "bg-sky-100 text-sky-800 border-sky-200";
			case "REJECTED":
				return "bg-rose-100 text-rose-800 border-rose-200";
			case "REVISED":
				return "bg-amber-100 text-amber-800 border-amber-200";
			case "DRAFT":
			default:
				return "bg-gray-100 text-gray-700 border-gray-200";
		}
	};

	const renderActions = (item: any) => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="sm" className="h-8 w-8 p-0">
					<MoreVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={() => handleView(item.id)}>
					<Eye className="h-4 w-4 mr-2" />
					View Details
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	const columns: Column<any>[] = [
		{
			key: "employee",
			label: "Employee",
			width: "17%",
			render: (_: any, row: any) => {
				const emp = row.employee;
				const firstName = emp?.person?.personalInfo?.firstName || "";
				const lastName = emp?.person?.personalInfo?.lastName || "";
				const fileAs = `${firstName} ${lastName}`.trim() || "Unknown";

				if (!emp) return <span className="text-gray-400">-</span>;

				return (
					<EmployeeTableCell
						profileId={emp.id}
						fullName={fileAs}
						employeeId={row.employeeId || emp.employeeId || "-"}
						avatar={emp?.user?.avatar ?? null}
						stopPropagation
					/>
				);
			},
		},
		{
			key: "period",
			label: "Period",
			width: "19%",
			render: (_: any, row: any) => {
				const period = row.payrollPeriod;
				if (!period) return <span className="text-gray-400">-</span>;

				return (
					<div className="min-w-0">
						<div className="truncate text-sm font-medium">{period.name}</div>
						<div className="truncate text-xs text-gray-500">
							{formatDate(period.startDate, "short")} -{" "}
							{formatDate(period.endDate, "short")}
						</div>
					</div>
				);
			},
		},
		{
			key: "totalRegularHours",
			label: "Regular",
			width: "9%",
			render: (value: string) => (
				<span className="text-sm font-medium text-gray-700">{value || "0:00"}</span>
			),
		},
		{
			key: "totalOvertimeHours",
			label: "Overtime",
			width: "9%",
			render: (value: string) => (
				<span
					className={`text-sm font-medium ${value !== "0:00" ? "text-green-600" : "text-gray-400"}`}>
					{value || "0:00"}
				</span>
			),
		},
		{
			key: "totalHoursWorked",
			label: "Total",
			width: "9%",
			render: (value: string) => (
				<span className="font-semibold text-gray-900">{value || "0:00"}</span>
			),
		},
		{
			key: "status",
			label: "Status",
			width: "11%",
			render: (value: string, row: any) => (
				<div className="flex flex-col gap-1">
					<Badge className={getStatusBadgeColor(value)}>{value}</Badge>
					{isTimesheetPayrollLocked(row) ? (
						<span className="text-[11px] font-medium text-neutral-600">
							Processed in payroll
						</span>
					) : null}
				</div>
			),
		},
		{
			key: "submittedAt",
			label: "Submitted",
			width: "11%",
			render: (value: string) => {
				if (!value) return <span className="text-gray-400">-</span>;
				return (
					<span className="text-sm text-gray-600">
						{new Date(value).toLocaleDateString()}
					</span>
				);
			},
		},
	];

	if (error) {
		return (
			<div className="text-center py-8">
				<p className="text-red-600">Failed to load timesheets</p>
			</div>
		);
	}

	return (
		<div className="min-w-0 space-y-4">
			<DataTable
				title="Timesheets"
				columns={columns}
				data={timesheets}
				isLoading={isLoading}
				emptyMessage="No timesheets found"
				emptyDescription="Timesheet records will appear here."
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={pagination?.total}
				onPageChange={handlePageChange}
				showSearch={false}
				showFilters={false}
				showExport={false}
				className="min-w-0 overflow-hidden"
				renderActions={renderActions}
			/>

			{/* View Modal */}
			<TimesheetViewModal
				isOpen={action === "view"}
				onClose={closeView}
				timesheet={modalTimesheet}
				isLoading={isViewLoading}
				showActions={showActions}
				onSubmit={handleSubmit}
				onRequestEditPermission={handleRequestEditPermission}
				isSubmitting={
					updateTimesheetMutation.isPending || timesheetActionMutation.isPending
				}
				isRequestingPermission={requestEditPermissionMutation.isPending}
				onRequestPayrollCorrection={handleRequestPayrollCorrection}
				isRequestingPayrollCorrection={createPayrollCorrectionMutation.isPending}
			/>
		</div>
	);
}
