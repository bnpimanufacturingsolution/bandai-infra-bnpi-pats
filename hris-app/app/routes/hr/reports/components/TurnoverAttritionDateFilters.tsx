import type { DateRange } from "react-day-picker";
import { DatePicker } from "~/components/ui/date-picker";
import { DatePickerWithRange } from "~/components/ui/date-picker-range";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { reportMonthOptions } from "~/lib/utils/report-scope";
import {
	TURNOVER_ATTRITION_SCOPE_VALUES,
	type TurnoverAttritionScope,
} from "../turnover-attrition-scope";

const scopeOptions: Array<{ label: string; value: TurnoverAttritionScope }> = [
	{ label: "Daily", value: TURNOVER_ATTRITION_SCOPE_VALUES.DAILY },
	{ label: "Weekly", value: TURNOVER_ATTRITION_SCOPE_VALUES.WEEKLY },
	{ label: "Monthly", value: TURNOVER_ATTRITION_SCOPE_VALUES.MONTHLY },
	{ label: "Yearly", value: TURNOVER_ATTRITION_SCOPE_VALUES.YEARLY },
	{ label: "Custom", value: TURNOVER_ATTRITION_SCOPE_VALUES.CUSTOM },
];

interface TurnoverAttritionDateFiltersProps {
	scope: TurnoverAttritionScope;
	activeDate: string;
	activeMonth: string;
	activeYear: string;
	yearOptions: string[];
	dateRange: DateRange | undefined;
	onScopeChange: (value: string) => void;
	onDateChange: (value: string) => void;
	onMonthChange: (value: string) => void;
	onYearChange: (value: string) => void;
	onDateRangeChange: (value: DateRange | undefined) => void;
}

export function TurnoverAttritionDateFilters({
	scope,
	activeDate,
	activeMonth,
	activeYear,
	yearOptions,
	dateRange,
	onScopeChange,
	onDateChange,
	onMonthChange,
	onYearChange,
	onDateRangeChange,
}: TurnoverAttritionDateFiltersProps) {
	const isDailyOrWeekly =
		scope === TURNOVER_ATTRITION_SCOPE_VALUES.DAILY ||
		scope === TURNOVER_ATTRITION_SCOPE_VALUES.WEEKLY;
	const isMonthly = scope === TURNOVER_ATTRITION_SCOPE_VALUES.MONTHLY;
	const isYearly = scope === TURNOVER_ATTRITION_SCOPE_VALUES.YEARLY;
	const isCustom = scope === TURNOVER_ATTRITION_SCOPE_VALUES.CUSTOM;

	return (
		<>
			<div className="w-full md:w-[160px]">
				<label className="mb-1 block text-sm font-medium">Report Scope</label>
				<Select value={scope} onValueChange={onScopeChange}>
					<SelectTrigger className="w-full shadow-sm border-gray-200">
						<SelectValue placeholder="Scope" />
					</SelectTrigger>
					<SelectContent>
						{scopeOptions.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{isDailyOrWeekly ? (
				<div className="w-full md:w-[220px]">
					<label className="mb-1 block text-sm font-medium">
						{scope === TURNOVER_ATTRITION_SCOPE_VALUES.DAILY ? "Day" : "Week of"}
					</label>
					<DatePicker value={activeDate} onChange={onDateChange} className="w-full shadow-sm border-gray-200" />
				</div>
			) : null}

			{isMonthly ? (
				<div className="w-full md:w-[130px]">
					<label className="mb-1 block text-sm font-medium">Month</label>
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
			) : null}

			{(isMonthly || isYearly) ? (
				<div className="w-full md:w-[110px]">
					<label className="mb-1 block text-sm font-medium">Year</label>
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
			) : null}

			{isCustom ? (
				<div className="w-full md:w-[240px]">
					<label className="mb-1 block text-sm font-medium">Date Range</label>
					<DatePickerWithRange
						value={dateRange}
						onChange={onDateRangeChange}
						placeholder="Select date range"
						className="w-full shadow-sm border-gray-200"
					/>
				</div>
			) : null}
		</>
	);
}
