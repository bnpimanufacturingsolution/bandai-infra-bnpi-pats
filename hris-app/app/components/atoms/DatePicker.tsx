import { CalendarDatePicker } from "~/components/ui/calendar-date-picker";

interface DatePickerProps {
	value?: string;
	onChange?: (date: string) => void;
	placeholder?: string;
	className?: string;
	disabled?: boolean;
	minDate?: string | Date;
	maxDate?: string | Date;
}

export function DatePicker({
	value,
	onChange,
	placeholder = "MM/DD/YYYY",
	className,
	disabled,
	minDate,
	maxDate,
}: DatePickerProps) {
	const minDateObj = minDate
		? typeof minDate === "string"
			? new Date(minDate)
			: minDate
		: undefined;
	const maxDateObj = maxDate
		? typeof maxDate === "string"
			? new Date(maxDate)
			: maxDate
		: undefined;

	return (
		<CalendarDatePicker
			value={value}
			onChange={(date) => onChange?.(date)}
			placeholder={placeholder}
			className={className}
			disabled={disabled}
			minDate={minDateObj}
			maxDate={maxDateObj}
		/>
	);
}
