import { useState, useMemo, useEffect } from "react";
import type { DateRange } from "react-day-picker";
import { format, isSameDay } from "date-fns";
import { CalendarIcon, ChevronDown, Check } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { cn } from "~/lib/utils";
import type { VisibleReportScope } from "~/lib/utils/report-scope";

interface ReportScopeDateFiltersProps {
	scope?: VisibleReportScope;
	activeMonth?: string;
	activeYear?: string;
	yearOptions?: string[];
	dateRange: DateRange | undefined;
	onScopeChange?: (value: string) => void;
	onMonthChange?: (value: string) => void;
	onYearChange?: (value: string) => void;
	onDateRangeChange: (value: DateRange | undefined) => void;
	className?: string;
}

interface PresetOption {
	id: string;
	label: string;
	subLabel: string;
	range: { from: Date; to: Date };
}

function computePresets(now = new Date()): PresetOption[] {
	const currentYear = now.getFullYear();
	const currentMonth = now.getMonth();
	const currentDate = now.getDate();

	// This Month
	const thisMonthFrom = new Date(currentYear, currentMonth, 1);
	const thisMonthTo = new Date(currentYear, currentMonth + 1, 0);

	// Last Month
	const lastMonthFrom = new Date(currentYear, currentMonth - 1, 1);
	const lastMonthTo = new Date(currentYear, currentMonth, 0);

	// 1st Half Cutoff (1st - 15th)
	const firstCutoffFrom = new Date(currentYear, currentMonth, 1);
	const firstCutoffTo = new Date(currentYear, currentMonth, 15);

	// 2nd Half Cutoff (16th - End)
	const secondCutoffFrom = new Date(currentYear, currentMonth, 16);
	const secondCutoffTo = new Date(currentYear, currentMonth + 1, 0);

	const isSecondHalf = currentDate >= 16;
	const currentCutoff = isSecondHalf
		? { from: secondCutoffFrom, to: secondCutoffTo }
		: { from: firstCutoffFrom, to: firstCutoffTo };

	const previousCutoff = isSecondHalf
		? { from: firstCutoffFrom, to: firstCutoffTo }
		: {
				from: new Date(currentYear, currentMonth - 1, 16),
				to: new Date(currentYear, currentMonth, 0),
		  };

	// Last 7 & 30 Days
	const last7DaysFrom = new Date(now);
	last7DaysFrom.setDate(now.getDate() - 6);

	const last30DaysFrom = new Date(now);
	last30DaysFrom.setDate(now.getDate() - 29);

	// YTD
	const ytdFrom = new Date(currentYear, 0, 1);

	return [
		{
			id: "current-cutoff",
			label: `Current Cutoff (${isSecondHalf ? "16th - End" : "1st - 15th"})`,
			subLabel: `${format(currentCutoff.from, "MMM d")} - ${format(currentCutoff.to, "MMM d, yyyy")}`,
			range: currentCutoff,
		},
		{
			id: "previous-cutoff",
			label: `Previous Cutoff (${isSecondHalf ? "1st - 15th" : "16th - End Prev Month"})`,
			subLabel: `${format(previousCutoff.from, "MMM d")} - ${format(previousCutoff.to, "MMM d, yyyy")}`,
			range: previousCutoff,
		},
		{
			id: "this-month",
			label: "This Month",
			subLabel: `${format(thisMonthFrom, "MMMM yyyy")} (${format(thisMonthFrom, "MMM d")} - ${format(thisMonthTo, "MMM d")})`,
			range: { from: thisMonthFrom, to: thisMonthTo },
		},
		{
			id: "last-month",
			label: "Last Month",
			subLabel: `${format(lastMonthFrom, "MMMM yyyy")} (${format(lastMonthFrom, "MMM d")} - ${format(lastMonthTo, "MMM d")})`,
			range: { from: lastMonthFrom, to: lastMonthTo },
		},
		{
			id: "first-cutoff",
			label: `1st Half (${format(thisMonthFrom, "MMM")} 1 - 15)`,
			subLabel: `${format(firstCutoffFrom, "MMM d")} - ${format(firstCutoffTo, "MMM d, yyyy")}`,
			range: { from: firstCutoffFrom, to: firstCutoffTo },
		},
		{
			id: "second-cutoff",
			label: `2nd Half (${format(thisMonthFrom, "MMM")} 16 - ${format(thisMonthTo, "d")})`,
			subLabel: `${format(secondCutoffFrom, "MMM d")} - ${format(secondCutoffTo, "MMM d, yyyy")}`,
			range: { from: secondCutoffFrom, to: secondCutoffTo },
		},
		{
			id: "last-30-days",
			label: "Last 30 Days",
			subLabel: `${format(last30DaysFrom, "MMM d")} - ${format(now, "MMM d, yyyy")}`,
			range: { from: last30DaysFrom, to: now },
		},
		{
			id: "last-7-days",
			label: "Last 7 Days",
			subLabel: `${format(last7DaysFrom, "MMM d")} - ${format(now, "MMM d, yyyy")}`,
			range: { from: last7DaysFrom, to: now },
		},
		{
			id: "ytd",
			label: `Year to Date (${currentYear})`,
			subLabel: `${format(ytdFrom, "MMM d")} - ${format(thisMonthTo, "MMM d, yyyy")}`,
			range: { from: ytdFrom, to: thisMonthTo },
		},
	];
}

export function ReportScopeDateFilters({
	dateRange,
	onDateRangeChange,
	className,
}: ReportScopeDateFiltersProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [activeTab, setActiveTab] = useState<"presets" | "custom">("presets");
	const [draftRange, setDraftRange] = useState<DateRange | undefined>(dateRange);
	const [displayMonth, setDisplayMonth] = useState<Date>(() => dateRange?.from || new Date());

	const presets = useMemo(() => computePresets(), []);

	// Keep draftRange and displayMonth in sync when dateRange changes
	useEffect(() => {
		setDraftRange(dateRange);
		if (dateRange?.from) {
			setDisplayMonth(dateRange.from);
		}
	}, [dateRange]);

	const formattedLabel = useMemo(() => {
		if (!dateRange?.from) return "Select date range";
		if (!dateRange.to || isSameDay(dateRange.from, dateRange.to)) {
			return format(dateRange.from, "MMM dd, yyyy");
		}
		return `${format(dateRange.from, "MMM dd, yyyy")} - ${format(dateRange.to, "MMM dd, yyyy")}`;
	}, [dateRange]);

	const matchedPresetId = useMemo(() => {
		if (!dateRange?.from || !dateRange?.to) return null;
		const found = presets.find(
			(p) =>
				isSameDay(p.range.from, dateRange.from!) &&
				isSameDay(p.range.to, dateRange.to!),
		);
		return found?.id || null;
	}, [dateRange, presets]);

	const handleSelectPreset = (preset: PresetOption) => {
		onDateRangeChange(preset.range);
		setDraftRange(preset.range);
		setDisplayMonth(preset.range.from);
		setIsOpen(false);
	};

	const handleCalendarSelect = (range: DateRange | undefined) => {
		setDraftRange(range);
		if (range?.from && range?.to) {
			onDateRangeChange(range);
			setIsOpen(false);
		}
	};

	const handleApplyCustom = () => {
		if (draftRange?.from) {
			const finalRange = {
				from: draftRange.from,
				to: draftRange.to || draftRange.from,
			};
			onDateRangeChange(finalRange);
			setIsOpen(false);
		}
	};

	const handleClearCustom = () => {
		setDraftRange(undefined);
	};

	return (
		<div className={cn("shrink-0 w-[240px]", className)}>
			<label className="block text-[11px] font-medium text-neutral-500 mb-0.5">Date Range</label>
			<Popover
				open={isOpen}
				onOpenChange={(next) => {
					setIsOpen(next);
					if (next && dateRange?.from) {
						setDisplayMonth(dateRange.from);
					}
				}}>
				<PopoverTrigger asChild>
					<button
						type="button"
						aria-label="Date range filter"
						className="h-8 w-full flex items-center justify-between gap-2 rounded-md border border-neutral-200 bg-white px-2.5 text-left text-xs font-medium text-neutral-800 shadow-sm transition-colors hover:bg-neutral-50 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400">
						<span className="flex items-center gap-1.5 min-w-0 overflow-hidden text-neutral-800">
							<CalendarIcon className="h-3.5 w-3.5 shrink-0 text-amber-600" />
							<span className="truncate font-medium text-neutral-800">{formattedLabel}</span>
						</span>
						<ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
					</button>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0 shadow-lg border-neutral-200 bg-white rounded-lg" align="start">
					<Tabs
						value={activeTab}
						onValueChange={(val) => setActiveTab(val as "presets" | "custom")}
						className="w-full">
						<div className="border-b border-neutral-200 px-3 pt-2">
							<TabsList className="grid grid-cols-2 h-8 w-full bg-neutral-100 p-0.5 rounded-md">
								<TabsTrigger value="presets" className="text-xs font-medium py-1">
									Periods & Presets
								</TabsTrigger>
								<TabsTrigger value="custom" className="text-xs font-medium py-1">
									Custom Range
								</TabsTrigger>
							</TabsList>
						</div>

						{/* Presets Tab */}
						<TabsContent value="presets" className="m-0 max-h-80 w-80 overflow-y-auto p-2 no-scrollbar">
							<div className="flex flex-col gap-1">
								{presets.map((preset) => {
									const isSelected = matchedPresetId === preset.id;
									return (
										<button
											key={preset.id}
											type="button"
											onClick={() => handleSelectPreset(preset)}
											className={cn(
												"flex items-center justify-between w-full rounded-md px-3 py-2 text-left transition-colors",
												isSelected
													? "bg-amber-50 text-amber-900 border border-amber-200 font-semibold"
													: "hover:bg-neutral-100 text-neutral-800",
											)}>
											<div className="min-w-0">
												<div className="text-xs font-medium leading-none mb-1 text-neutral-900">
													{preset.label}
												</div>
												<div className="text-[10px] text-neutral-500 leading-none">
													{preset.subLabel}
												</div>
											</div>
											{isSelected && (
												<Check className="h-3.5 w-3.5 text-amber-600 shrink-0 ml-2" />
											)}
										</button>
									);
								})}
							</div>
						</TabsContent>

						{/* Custom Range Tab */}
						<TabsContent value="custom" className="m-0 p-3 space-y-3">
							<div className="rounded-md border border-neutral-100 p-1 flex justify-center bg-white">
								<Calendar
									mode="range"
									month={displayMonth}
									onMonthChange={setDisplayMonth}
									selected={draftRange}
									onSelect={handleCalendarSelect}
									numberOfMonths={1}
									captionLayout="dropdown"
								/>
							</div>
							<div className="flex items-center justify-between pt-1 border-t border-neutral-100">
								<div className="text-[11px] text-neutral-600 font-medium truncate max-w-[170px]">
									{draftRange?.from ? (
										draftRange.to ? (
											`${format(draftRange.from, "MMM d")} - ${format(draftRange.to, "MMM d, yyyy")}`
										) : (
											`From: ${format(draftRange.from, "MMM d, yyyy")}`
										)
									) : (
										"Click start & end dates"
									)}
								</div>
								<div className="flex items-center gap-1.5">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="h-7 px-2 text-xs text-neutral-600 hover:text-neutral-900"
										onClick={handleClearCustom}>
										Clear
									</Button>
									<Button
										type="button"
										size="sm"
										disabled={!draftRange?.from}
										className="h-7 px-3 text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium disabled:opacity-50"
										onClick={handleApplyCustom}>
										Apply
									</Button>
								</div>
							</div>
						</TabsContent>
					</Tabs>
				</PopoverContent>
			</Popover>
		</div>
	);
}
