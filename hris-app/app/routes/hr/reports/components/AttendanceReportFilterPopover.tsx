import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { Filter as FilterIcon } from "lucide-react";

import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { DepartmentSectionPicker } from "~/components/molecules/DepartmentSectionPicker";
import { DatePickerWithRange } from "~/components/ui/date-picker-range";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import {
	reportMonthOptions,
	visibleReportScopeOptions,
	type VisibleReportScope,
} from "~/lib/utils/report-scope";
import type { Department } from "~/services/departments.service";

export interface AttendanceReportFilterManagerOption {
	id: string;
	label: string;
}

interface AttendanceReportFilterPopoverProps {
	scope: VisibleReportScope;
	activeMonth: string;
	activeYear: string;
	yearOptions: string[];
	dateRange: DateRange | undefined;
	onScopeChange: (value: string) => void;
	onMonthChange: (value: string) => void;
	onYearChange: (value: string) => void;
	onDateRangeChange: (value: DateRange | undefined) => void;
	departments: Department[];
	selectedDepartment: string;
	onDepartmentChange: (value: string) => void;
	managerOptions: AttendanceReportFilterManagerOption[];
	selectedManager: string;
	onManagerChange: (value: string) => void;
	activeFiltersCount: number;
	onClearAll: () => void;
	testIdPrefix?: string;
}

/**
 * Compact Filter button + popover for attendance report tabs
 * (scope/date + department + manager). Matches payroll report filter pattern.
 */
export function AttendanceReportFilterPopover({
	scope,
	activeMonth,
	activeYear,
	yearOptions,
	dateRange,
	onScopeChange,
	onMonthChange,
	onYearChange,
	onDateRangeChange,
	departments,
	selectedDepartment,
	onDepartmentChange,
	managerOptions,
	selectedManager,
	onManagerChange,
	activeFiltersCount,
	onClearAll,
	testIdPrefix = "attendance-report",
}: AttendanceReportFilterPopoverProps) {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					data-testid={`${testIdPrefix}-filter-trigger`}
					className="h-9 gap-2 rounded-md border-gray-200 px-3 text-sm font-medium shadow-sm">
					<FilterIcon className="h-4 w-4 text-gray-500" />
					Filter
					{activeFiltersCount > 0 ? (
						<Badge
							variant="secondary"
							className="h-5 min-w-5 justify-center px-1.5"
							data-testid={`${testIdPrefix}-active-filter-badge`}>
							{activeFiltersCount}
						</Badge>
					) : null}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[22rem] p-4" align="end">
				<div className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
					Report Filters
				</div>

				<div className="flex max-h-[min(70vh,36rem)] flex-col gap-3 overflow-y-auto pr-1">
					<div className="min-w-0">
						<label className="mb-1 block text-xs font-medium text-neutral-700">
							Report Scope
						</label>
						<Select value={scope} onValueChange={onScopeChange}>
							<SelectTrigger className="h-9 w-full rounded-md border-gray-200 shadow-sm">
								<SelectValue placeholder="Scope" />
							</SelectTrigger>
							<SelectContent>
								{visibleReportScopeOptions.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="min-w-0">
							<label className="mb-1 block text-xs font-medium text-neutral-700">
								Month
							</label>
							<Select value={activeMonth} onValueChange={onMonthChange}>
								<SelectTrigger className="h-9 w-full rounded-md border-gray-200 shadow-sm">
									<SelectValue placeholder="Month" />
								</SelectTrigger>
								<SelectContent>
									{reportMonthOptions.map((option) => (
										<SelectItem
											key={option.selectValue}
											value={option.selectValue}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="min-w-0">
							<label className="mb-1 block text-xs font-medium text-neutral-700">
								Year
							</label>
							<Select value={activeYear} onValueChange={onYearChange}>
								<SelectTrigger className="h-9 w-full rounded-md border-gray-200 shadow-sm">
									<SelectValue placeholder="Year" />
								</SelectTrigger>
								<SelectContent>
									{yearOptions.map((option) => (
										<SelectItem key={option} value={option}>
											{option}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="min-w-0">
						<label className="mb-1 block text-xs font-medium text-neutral-700">
							Date Range
						</label>
						<DatePickerWithRange
							value={dateRange}
							onChange={onDateRangeChange}
							placeholder="Select date range"
							className="w-full shadow-sm border-gray-200"
						/>
					</div>

					<div className="min-w-0">
						<label className="mb-1 block text-xs font-medium text-neutral-700">
							Department
						</label>
						<DepartmentSectionPicker
							variant="report"
							departments={departments}
							sections={[]}
							departmentId={selectedDepartment}
							onDepartmentChange={onDepartmentChange}
							onSectionChange={(departmentId) => onDepartmentChange(departmentId)}
						/>
					</div>

					<div className="min-w-0">
						<label
							htmlFor={`${testIdPrefix}-manager-filter`}
							className="mb-1 block text-xs font-medium text-neutral-700">
							Manager
						</label>
						<Select value={selectedManager} onValueChange={onManagerChange}>
							<SelectTrigger
								id={`${testIdPrefix}-manager-filter`}
								className="h-9 w-full rounded-md border-neutral-200 bg-white text-sm shadow-sm">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Managers</SelectItem>
								{managerOptions.map((manager) => (
									<SelectItem key={`manager-${manager.id}`} value={manager.id}>
										{manager.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				{activeFiltersCount > 0 ? (
					<div className="mt-4 flex justify-end border-t border-neutral-100 pt-4">
						<Button
							type="button"
							variant="ghost"
							className="h-8 px-2 text-xs font-medium text-neutral-500 hover:text-neutral-900"
							onClick={() => {
								onClearAll();
								setOpen(false);
							}}>
							Clear all filters
						</Button>
					</div>
				) : null}
			</PopoverContent>
		</Popover>
	);
}
