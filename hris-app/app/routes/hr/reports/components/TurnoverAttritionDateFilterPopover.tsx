import { useMemo, useState } from "react";
import { CalendarIcon, ChevronDown } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "~/components/atoms/Button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { cn } from "~/lib/utils";
import { formatDate } from "~/lib/utils/text-utils";
import {
	TURNOVER_ATTRITION_SCOPE_VALUES,
	type TurnoverAttritionScope,
} from "../turnover-attrition-scope";
import { TurnoverAttritionDateFilters } from "./TurnoverAttritionDateFilters";

const scopeLabels: Record<TurnoverAttritionScope, string> = {
	[TURNOVER_ATTRITION_SCOPE_VALUES.DAILY]: "Daily",
	[TURNOVER_ATTRITION_SCOPE_VALUES.WEEKLY]: "Weekly",
	[TURNOVER_ATTRITION_SCOPE_VALUES.MONTHLY]: "Monthly",
	[TURNOVER_ATTRITION_SCOPE_VALUES.YEARLY]: "Yearly",
	[TURNOVER_ATTRITION_SCOPE_VALUES.CUSTOM]: "Custom Range",
};

interface TurnoverAttritionDateFilterPopoverProps {
	scope: TurnoverAttritionScope;
	activeDate: string;
	activeMonth: string;
	activeYear: string;
	yearOptions: string[];
	dateRange: DateRange | undefined;
	fromIso: string;
	toIso: string;
	onScopeChange: (value: string) => void;
	onDateChange: (value: string) => void;
	onMonthChange: (value: string) => void;
	onYearChange: (value: string) => void;
	onDateRangeChange: (value: DateRange | undefined) => void;
	onResetDateFilters: () => void;
}

export function TurnoverAttritionDateFilterPopover({
	scope,
	activeDate,
	activeMonth,
	activeYear,
	yearOptions,
	dateRange,
	fromIso,
	toIso,
	onScopeChange,
	onDateChange,
	onMonthChange,
	onYearChange,
	onDateRangeChange,
	onResetDateFilters,
}: TurnoverAttritionDateFilterPopoverProps) {
	const [open, setOpen] = useState(false);

	const triggerLabel = useMemo(() => {
		const fromLabel = formatDate(fromIso, "short");
		const toLabel = formatDate(toIso, "short");
		const rangeLabel = fromLabel === toLabel ? fromLabel : `${fromLabel} - ${toLabel}`;
		return `${scopeLabels[scope]} · ${rangeLabel}`;
	}, [fromIso, scope, toIso]);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					aria-label="Date filter"
					data-testid="turnover-attrition-date-filter-trigger"
					className={cn(
						"h-9 w-auto justify-between gap-2 rounded-md border-gray-200 px-3 text-left text-sm font-medium shadow-sm",
					)}>
					<span className="flex items-center gap-2">
						<CalendarIcon className="h-4 w-4 shrink-0 text-gray-500" />
						<span className="whitespace-nowrap">{triggerLabel}</span>
					</span>
					<ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-80" align="end">
				<div className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
					Date Range
				</div>
				<div className="flex flex-col gap-3">
					<TurnoverAttritionDateFilters
						scope={scope}
						activeDate={activeDate}
						activeMonth={activeMonth}
						activeYear={activeYear}
						yearOptions={yearOptions}
						dateRange={dateRange}
						onScopeChange={onScopeChange}
						onDateChange={onDateChange}
						onMonthChange={onMonthChange}
						onYearChange={onYearChange}
						onDateRangeChange={onDateRangeChange}
					/>
				</div>
				<p className="mt-3 text-xs text-gray-500">
					Showing {fromIso} to {toIso}
				</p>
				<div className="mt-4 flex justify-end border-t border-neutral-100 pt-4">
					<Button
						type="button"
						variant="ghost"
						className="h-8 px-2 text-xs font-medium text-neutral-500 hover:text-neutral-900"
						onClick={() => {
							onResetDateFilters();
							setOpen(false);
						}}>
						Reset date
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}