import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { StatusBadge } from "~/components/atoms/StatusBadge";
import { Button } from "~/components/atoms/Button";
import { Eye, MoreVertical } from "lucide-react";
import { useBoardingProcesses, useBoardingProcessByEmployee } from "~/lib/hooks/useBoardingProcess";
import type { BoardingProcess } from "~/zod/boarding-process";
import { TaskDetailModal } from "~/components/organisms/hr/task-detail-modal";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

// Extended type to include potential joined relations
type ApiBoardingProcess = BoardingProcess & {
	employee?: {
		id: string; // Employee Model ID (from response `employee.id` which is `698...`)
		employeeId: string; // custom ID like EMP-2026...
		role?: string;
		employmentStatus?: string;
		employmentType?: string;
		employmentHireDate?: string | Date;
		employmentStartDate?: string | Date | null;
		employmentTerminationDate?: string | Date | null;
		probationEndDate?: string | Date | null;
		person?: {
			personalInfo?: {
				firstName?: string;
				lastName?: string;
				middleName?: string;
			};
		};
		position?: {
			title?: string;
		};
		department?: {
			name?: string;
		};
	};
};

export default function HRTasksPage() {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();

	const viewTaskId = searchParams.get("viewTask");
	const onboardEmployeeId = searchParams.get("onboardEmployeeId");
	const category = searchParams.get("category");

	// Fetch boarding process if onboardEmployeeId is present
	const { data: employeeProcess } = useBoardingProcessByEmployee(
		onboardEmployeeId || "",
		undefined,
		false, // Don't need checklist items yet, just the ID
	);
	const employeeProcessId =
		(employeeProcess as any)?.id ||
		(employeeProcess as any)?._id ||
		(employeeProcess as any)?.data?.id ||
		null;

	// Redirect to viewTask when process is found
	useEffect(() => {
		if (onboardEmployeeId && employeeProcessId) {
			setSearchParams((prev) => {
				const next = new URLSearchParams(prev);
				next.delete("onboardEmployeeId");
				next.set("viewTask", employeeProcessId);
				return next;
			});
		}
	}, [onboardEmployeeId, employeeProcessId, setSearchParams]);

	// Pagination & Search state
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const searchQuery = searchParams.get("search") || undefined;
	const statusFilter = searchParams.get("status") || undefined;

	// Fetch data with specific fields as requested by user
	const { data, isLoading, isFetching } = useBoardingProcesses({
		page: pageParam,
		limit: limitParam,
		document: true,
		// Exact fields provided by user
		fields: "checklistItems,type,status,startDate,targetDate,actualCompleteDate,exitReason,metadata,lastViewedAt,completionPercentage,employee.employeeId,employee.role,employee.employmentHireDate,employee.employmentStartDate,employee.employmentTerminationDate,employee.employmentStatus,employee.employmentType,employee.probationEndDate,employee.id",
		...(statusFilter && statusFilter !== "all" ? { filter: { status: statusFilter } } : {}),
		// Add category filter if present
		...(category ? { filter: { "checklistItems.category": category } } : {}),
	});

	const items = ((data as any)?.boardingProcesss || []) as ApiBoardingProcess[];
	const pagination = (data as any)?.pagination;

	// Handlers
	const handlePageChange = (page: number) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			next.set("page", page.toString());
			return next;
		});
	};

	const handleSearch = (query: string) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			if (query) next.set("search", query);
			else next.delete("search");
			next.set("page", "1");
			return next;
		});
	};

	const handleViewTask = (item: ApiBoardingProcess) => {
		// Open modal via URL param
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			next.set("viewTask", item.id);
			return next;
		});
	};

	const handleCloseModal = () => {
		navigate("/hr/tasks");
	};

	// Columns
	const columns: Column<ApiBoardingProcess>[] = [
		{
			key: "employeeId", // Virtual key
			label: "Employee",
			render: (_, item) => (
				<div className="flex items-center gap-3">
					<div>
						<div className="font-medium text-gray-900">
							{/* Display Employee ID as name is not available in provided fields */}
							{item.employee?.employeeId || "Unknown ID"}
						</div>
						<div className="text-xs text-gray-500">
							{item.employee?.role || "No Role"}
						</div>
					</div>
				</div>
			),
		},
		{
			key: "type",
			label: "Process Type",
			render: (value) => (
				<span
					className={`px-2 py-1 rounded-full text-xs font-medium ${
						value === "OFFBOARDING"
							? "bg-red-100 text-red-700"
							: "bg-blue-100 text-blue-700"
					}`}>
					{value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()}
				</span>
			),
		},
		{
			key: "employee", // accessing nested property for display
			label: "Status",
			render: (_, item) => <StatusBadge status={item.status} />,
		},
		{
			key: "completionPercentage",
			label: "Progress",
			render: (value) => (
				<div className="w-full max-w-[140px]">
					<div className="flex justify-between text-xs mb-1">
						<span className="text-gray-600">{value !== undefined ? value : 0}%</span>
					</div>
					<div className="w-full bg-gray-200 rounded-full h-2">
						<div
							className="bg-orange-500 h-2 rounded-full"
							style={{ width: `${value !== undefined ? value : 0}%` }}
						/>
					</div>
				</div>
			),
		},
		{
			key: "startDate",
			label: "Start Date",
			render: (value) =>
				value ? (
					new Date(value).toLocaleDateString()
				) : (
					<span className="text-gray-400">-</span>
				),
		},
		{
			key: "targetDate",
			label: "Target Date",
			render: (value) =>
				value ? (
					new Date(value).toLocaleDateString()
				) : (
					<span className="text-gray-400">-</span>
				),
		},
	];

	const filters = [
		{
			key: "status",
			label: "Status",
			options: [
				{ value: "all", label: "All Statuses" },
				{ value: "NOT_STARTED", label: "Not Started" },
				{ value: "IN_PROGRESS", label: "In Progress" },
				{ value: "COMPLETED", label: "Completed" },
			],
		},
	];

	return (
		<div className="space-y-6">
			<DataTable
				title="Employee Tasks Overview"
				description="Monitor onboarding and offboarding progress for all employees."
				data={items}
				columns={columns}
				filters={filters}
				searchFields={["name" as any]}
				onSearch={handleSearch}
				isLoading={isLoading || isFetching}
				onPageChange={handlePageChange}
				currentPage={pageParam}
				totalItems={pagination?.total || 0}
				itemsPerPage={limitParam}
				searchValue={searchQuery || ""}
				renderActions={(item) => (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="sm">
								<MoreVertical className="w-4 h-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem
								className="cursor-pointer"
								onClick={() => handleViewTask(item)}>
								<Eye className="w-4 h-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			/>

			{/* Modal for Details */}
			<TaskDetailModal
				processId={viewTaskId || null}
				category={searchParams.get("category") || undefined}
				onClose={handleCloseModal}
			/>
		</div>
	);
}
