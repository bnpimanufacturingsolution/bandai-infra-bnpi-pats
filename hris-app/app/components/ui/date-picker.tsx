import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { format, isValid, parse } from "date-fns";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";

interface DatePickerProps {
	value?: string;
	onChange?: (value: string) => void;
	placeholder?: string;
	className?: string;
	disabled?: boolean;
	required?: boolean;
	minDate?: Date;
	maxDate?: Date;
}

export function DatePicker({
	value,
	onChange,
	placeholder = "Select date",
	className,
	disabled = false,
	minDate,
	maxDate,
}: DatePickerProps) {
	const [isOpen, setIsOpen] = React.useState(false);
	const today = React.useMemo(() => new Date(), []);

	const selectedDate = React.useMemo(() => {
		if (!value) return undefined;
		const ymd = parse(value, "yyyy-MM-dd", new Date());
		if (isValid(ymd)) return ymd;
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime()) ? undefined : parsed;
	}, [value]);

	const calendarRange = React.useMemo(() => {
		const start = minDate || new Date(today.getFullYear() - 125, 0, 1);
		const end = maxDate || new Date(today.getFullYear() + 50, 11, 31);
		return {
			startMonth: new Date(start.getFullYear(), start.getMonth(), 1),
			endMonth: new Date(end.getFullYear(), end.getMonth(), 1),
		};
	}, [maxDate, minDate, today]);

	const handleSelect = (date: Date | undefined) => {
		if (!date) return;
		onChange?.(format(date, "yyyy-MM-dd"));
		setIsOpen(false);
	};

	const disabledMatcher = (date: Date) => {
		if (minDate && date < minDate) return true;
		if (maxDate && date > maxDate) return true;
		return false;
	};

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					className={cn(
						"w-full justify-start text-left font-normal h-9 bg-white border-gray-200 text-sm",
						!selectedDate && "text-muted-foreground",
						className,
					)}
					disabled={disabled}>
					<CalendarIcon className="mr-2 h-4 w-4" />
					{selectedDate ? format(selectedDate, "MM/dd/yyyy") : placeholder}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start">
				<Calendar
					mode="single"
					selected={selectedDate}
					onSelect={handleSelect}
					disabled={disabledMatcher}
					defaultMonth={selectedDate || today}
					startMonth={calendarRange.startMonth}
					endMonth={calendarRange.endMonth}
					captionLayout="dropdown"
					navLayout="after"
					reverseYears
					initialFocus
				/>
			</PopoverContent>
		</Popover>
	);
}
