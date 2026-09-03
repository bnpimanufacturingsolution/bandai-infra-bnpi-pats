import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { format, isValid } from "date-fns";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Input } from "~/components/ui/input";

interface DateTimePickerProps {
	value?: string;
	onChange?: (value: string) => void;
	placeholder?: string;
	className?: string;
	disabled?: boolean;
	required?: boolean;
	name?: string;
}

export function DateTimePicker({
	value,
	onChange,
	placeholder = "Select date and time",
	className,
	disabled = false,
	required = false,
	name,
}: DateTimePickerProps) {
	const [isOpen, setIsOpen] = React.useState(false);
	const today = React.useMemo(() => new Date(), []);
	const parsed = React.useMemo(() => {
		if (!value) return null;
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	}, [value]);

	const selectedDate = parsed || undefined;
	const selectedTime = parsed ? format(parsed, "HH:mm") : "";

	const emit = (date: Date | undefined, time: string) => {
		if (!date || !time) return;
		const [hours, minutes] = time.split(":").map(Number);
		const next = new Date(date);
		next.setHours(hours || 0, minutes || 0, 0, 0);
		onChange?.(next.toISOString());
	};

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					disabled={disabled}
					className={cn(
						"w-full justify-between text-left font-normal h-9",
						!parsed && "text-muted-foreground",
						className,
					)}>
					<span>
						{parsed && isValid(parsed)
							? format(parsed, "MM/dd/yyyy hh:mm a")
							: placeholder}
					</span>
					<CalendarIcon className="h-4 w-4 text-muted-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-3" align="start">
				<Calendar
					mode="single"
					selected={selectedDate}
					onSelect={(date) => emit(date, selectedTime || "09:00")}
					defaultMonth={selectedDate || today}
					captionLayout="dropdown"
					navLayout="after"
					reverseYears
					initialFocus
				/>
				<div className="mt-3 border-t pt-3">
					<Input
						type="time"
						value={selectedTime}
						onChange={(event) => emit(selectedDate, event.target.value)}
						disabled={disabled}
					/>
				</div>
			</PopoverContent>
			{name && <input type="hidden" name={name} value={value || ""} required={required} />}
		</Popover>
	);
}
