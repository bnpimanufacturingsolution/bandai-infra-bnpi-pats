import { useState } from "react";
import { CalendarIcon, ChevronDown } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { cn } from "~/lib/utils";
import { Button } from "~/components/atoms/Button";
import { Calendar } from "~/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";

export interface AttendanceDatePresetOption {
	value: string;
	label: string;
}

interface AttendanceDateFilterPopoverProps {
	triggerLabel: string;
	periodValue: string;
	presetOptions: AttendanceDatePresetOption[];
	onPeriodSelect: (value: string) => void;
	onOpenPresets?: () => void;
	dateRange: DateRange | undefined;
	onCustomRangeChange: (range: DateRange | undefined) => void;
	isDateDisabled?: (date: Date) => boolean;
	className?: string;
}

export function AttendanceDateFilterPopover({
	triggerLabel,
	periodValue,
	presetOptions,
	onPeriodSelect,
	onOpenPresets,
	dateRange,
	onCustomRangeChange,
	isDateDisabled,
	className,
}: AttendanceDateFilterPopoverProps) {
	const [open, setOpen] = useState(false);
	const defaultTab = periodValue === "custom" ? "custom" : "presets";

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (next) onOpenPresets?.();
			}}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					aria-label="Date filter"
					className={cn(
						"h-9 w-auto justify-between gap-2 rounded-md border-gray-200 px-3 text-left text-sm font-medium shadow-sm",
						className,
					)}>
					<span className="flex items-center gap-2">
						<CalendarIcon className="h-4 w-4 shrink-0 text-gray-500" />
						<span className="whitespace-nowrap">{triggerLabel}</span>
					</span>
					<ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start">
				<Tabs defaultValue={defaultTab} className="w-full">
					<TabsList className="m-2">
						<TabsTrigger value="presets">Presets</TabsTrigger>
						<TabsTrigger value="custom">Custom</TabsTrigger>
					</TabsList>
					<TabsContent value="presets" className="m-0 max-h-72 w-96 overflow-y-auto px-2 pb-2">
						<div className="flex flex-col gap-0.5">
							{presetOptions.map((option) => (
								<button
									key={option.value}
									type="button"
									onClick={() => {
										onPeriodSelect(option.value);
										setOpen(false);
									}}
									className={cn(
										"whitespace-nowrap rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-gray-100",
										periodValue === option.value && "bg-orange-50 font-medium text-orange-700",
									)}>
									{option.label}
								</button>
							))}
						</div>
					</TabsContent>
					<TabsContent value="custom" className="m-0 p-2">
						<Calendar
							mode="range"
							captionLayout="dropdown"
							defaultMonth={dateRange?.from}
							selected={dateRange}
							onSelect={onCustomRangeChange}
							numberOfMonths={1}
							disabled={isDateDisabled}
						/>
					</TabsContent>
				</Tabs>
			</PopoverContent>
		</Popover>
	);
}
