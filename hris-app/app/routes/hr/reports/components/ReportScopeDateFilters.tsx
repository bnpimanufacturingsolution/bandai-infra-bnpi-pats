import type { DateRange } from "react-day-picker";
import { DatePickerWithRange } from "~/components/ui/date-picker-range";
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

interface ReportScopeDateFiltersProps {
	scope: VisibleReportScope;
	activeMonth: string;
	activeYear: string;
	yearOptions: string[];
	dateRange: DateRange | undefined;
	onScopeChange: (value: string) => void;
	onMonthChange: (value: string) => void;
	onYearChange: (value: string) => void;
	onDateRangeChange: (value: DateRange | undefined) => void;
}

export function ReportScopeDateFilters({
	scope,
	activeMonth,
	activeYear,
	yearOptions,
	dateRange,
	onScopeChange,
	onMonthChange,
	onYearChange,
	onDateRangeChange,
}: ReportScopeDateFiltersProps) {
	return (
		<>
			<div className="w-full md:w-[150px]">
				<label className="block text-sm font-medium mb-1">Report Scope</label>
				<Select value={scope} onValueChange={onScopeChange}>
					<SelectTrigger className="w-full shadow-sm border-gray-200">
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
			<div className="w-full md:w-[130px]">
				<label className="block text-sm font-medium mb-1">Month</label>
				<Select value={activeMonth} onValueChange={onMonthChange}>
					<SelectTrigger className="w-full shadow-sm border-gray-200">
						<SelectValue placeholder="Month" />
					</SelectTrigger>
					<SelectContent>
						{reportMonthOptions.map((option) => (
							<SelectItem key={option.selectValue} value={option.selectValue}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="w-full md:w-[90px]">
				<label className="block text-sm font-medium mb-1">Year</label>
				<Select value={activeYear} onValueChange={onYearChange}>
					<SelectTrigger className="w-full shadow-sm border-gray-200">
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
			<div className="w-full md:w-[240px]">
				<label className="block text-sm font-medium mb-1">Date Range</label>
				<DatePickerWithRange
					value={dateRange}
					onChange={onDateRangeChange}
					placeholder="Select date range"
					className="w-full shadow-sm border-gray-200"
				/>
			</div>
		</>
	);
}
