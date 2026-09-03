import * as React from "react";
import { Clock3 } from "lucide-react";
import { cn } from "~/lib/utils";
import { Input } from "~/components/ui/input";

const normalizeTimeValue = (value: string) => {
	const trimmed = value.trim();
	if (!trimmed) return "";

	const amPmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
	if (amPmMatch) {
		const [, hourText, minute, meridiem] = amPmMatch;
		const hour = Number(hourText);
		if (hour >= 1 && hour <= 12) {
			return `${hour.toString().padStart(2, "0")}:${minute} ${meridiem.toUpperCase()}`;
		}
	}

	const militaryMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
	if (militaryMatch) {
		let [, hourText, minute] = militaryMatch;
		let hour = Number(hourText);
		if (hour >= 0 && hour <= 23) {
			const meridiem = hour >= 12 ? "PM" : "AM";
			hour = hour % 12 || 12;
			return `${hour.toString().padStart(2, "0")}:${minute} ${meridiem}`;
		}
	}

	return trimmed.toUpperCase();
};

function TimeInput({ className, onBlur, ...props }: React.ComponentProps<typeof Input>) {
	return (
		<div className="relative">
			<Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
			<Input
				{...props}
				type="text"
				placeholder="hh:mm AM"
				className={cn(
					"h-10 rounded-xl border-neutral-200 bg-white pl-9 shadow-sm",
					className,
				)}
				onBlur={(event) => {
					event.currentTarget.value = normalizeTimeValue(event.currentTarget.value);
					onBlur?.(event);
				}}
			/>
		</div>
	);
}

export { TimeInput, normalizeTimeValue };
