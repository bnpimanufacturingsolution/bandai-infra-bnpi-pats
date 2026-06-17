import * as React from "react";
import { Calendar } from "~/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Input } from "~/components/atoms/Input";
import { CalendarIcon } from "lucide-react";
import { format, parse, isValid } from "date-fns";
import { parseDateInputAsUtcDate } from "~/lib/utils/date-validation";
import { cn } from "~/lib/utils";

interface CalendarDatePickerProps {
	value?: string;
	onChange: (value: string) => void;
	minDate?: Date;
	maxDate?: Date;
	isDateDisabled?: (date: Date) => boolean;
	placeholder?: string;
	className?: string;
	disabled?: boolean;
}

export function CalendarDatePicker({
	value,
	onChange,
	minDate,
	maxDate,
	isDateDisabled,
	placeholder = "MM/DD/YYYY",
	className,
	disabled,
}: CalendarDatePickerProps) {
	const [open, setOpen] = React.useState(false);
	const [inputValue, setInputValue] = React.useState("");
	const today = React.useMemo(() => new Date(), []);

	const formatDateInput = React.useCallback((rawValue: string) => {
		const digits = rawValue.replace(/\D/g, "").slice(0, 8);
		if (!digits) return "";
		if (digits.length <= 2) return digits;
		if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
		return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
	}, []);

	const formatValueForDisplay = React.useCallback((rawValue?: string) => {
		if (!rawValue) return "";
		const parsedDate =
			parseDateInputAsUtcDate(rawValue) ||
			(() => {
				const fallbackDate = new Date(rawValue);
				return Number.isNaN(fallbackDate.getTime()) ? null : fallbackDate;
			})();
		return parsedDate ? format(parsedDate, "MM/dd/yyyy") : rawValue;
	}, []);

	// Parse the value if it's a string (YYYY-MM-DD format)
	const parsedValue = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
	const selectedDate = parsedValue && isValid(parsedValue) ? parsedValue : undefined;
	const defaultCalendarMonth = selectedDate || today;

	const calendarRange = React.useMemo(() => {
		const start = minDate || new Date(today.getFullYear() - 125, 0, 1);
		const end = maxDate || new Date(today.getFullYear() + 50, 11, 31);
		const selected = selectedDate;

		const startMonth =
			selected && selected < start
				? new Date(selected.getFullYear(), selected.getMonth(), 1)
				: new Date(start.getFullYear(), start.getMonth(), 1);
		const endMonth =
			selected && selected > end
				? new Date(selected.getFullYear(), selected.getMonth(), 1)
				: new Date(end.getFullYear(), end.getMonth(), 1);

		return { startMonth, endMonth };
	}, [maxDate, minDate, selectedDate, today]);

	React.useEffect(() => {
		setInputValue(formatValueForDisplay(value));
	}, [formatValueForDisplay, value]);

	const parseInputValue = React.useCallback((rawValue: string) => {
		const trimmedValue = rawValue.trim();
		if (!trimmedValue) return null;

		const parsedCanonical = parseDateInputAsUtcDate(trimmedValue);
		if (parsedCanonical) return parsedCanonical;

		const displayMatch = trimmedValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
		if (!displayMatch) return null;

		const month = Number(displayMatch[1]);
		const day = Number(displayMatch[2]);
		const year = Number(displayMatch[3]);
		const parsedDisplayDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

		const isCalendarValid =
			parsedDisplayDate.getUTCFullYear() === year &&
			parsedDisplayDate.getUTCMonth() + 1 === month &&
			parsedDisplayDate.getUTCDate() === day;

		return isCalendarValid ? parsedDisplayDate : null;
	}, []);

	const handleSelect = (date: Date | undefined) => {
		if (date) {
			const formattedDate = format(date, "yyyy-MM-dd");
			setInputValue(format(date, "MM/dd/yyyy"));
			onChange(formattedDate);
			setOpen(false);
		}
	};

	// Disable dates before minDate or after maxDate
	const disabledMatcher = (date: Date) => {
		if (minDate && date < minDate) return true;
		if (maxDate && date > maxDate) return true;
		if (isDateDisabled?.(date)) return true;
		return false;
	};

	const handleInputChange = (nextValue: string) => {
		const formattedInput = formatDateInput(nextValue);
		setInputValue(formattedInput);

		if (!formattedInput) {
			onChange("");
			return;
		}

		const parsedInputDate = parseInputValue(formattedInput);
		if (!parsedInputDate || disabledMatcher(parsedInputDate)) {
			return;
		}

		onChange(format(parsedInputDate, "yyyy-MM-dd"));
	};

	const handleInputBlur = () => {
		if (!inputValue.trim()) {
			setInputValue("");
			onChange("");
			return;
		}

		const parsedInputDate = parseInputValue(inputValue);
		if (!parsedInputDate || disabledMatcher(parsedInputDate)) {
			return;
		}

		const normalizedValue = format(parsedInputDate, "yyyy-MM-dd");
		setInputValue(format(parsedInputDate, "MM/dd/yyyy"));
		if (normalizedValue !== value) {
			onChange(normalizedValue);
		}
	};

	return (
		<div className="relative w-full">
			<Input
				type="text"
				inputMode="numeric"
				value={inputValue}
				onChange={(event) => handleInputChange(event.target.value)}
				onBlur={handleInputBlur}
				placeholder={placeholder}
				maxLength={10}
				disabled={disabled}
				aria-label="Date"
				className={cn("h-[42px] min-h-[42px] pr-10", className)}
			/>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						disabled={disabled}
						className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50">
						<CalendarIcon className="h-4 w-4" />
					</button>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="end">
					<Calendar
						mode="single"
						selected={selectedDate}
						onSelect={handleSelect}
						disabled={disabledMatcher}
						defaultMonth={defaultCalendarMonth}
						startMonth={calendarRange.startMonth}
						endMonth={calendarRange.endMonth}
						captionLayout="dropdown"
						navLayout="after"
						reverseYears
						initialFocus
					/>
				</PopoverContent>
			</Popover>
		</div>
	);
}
