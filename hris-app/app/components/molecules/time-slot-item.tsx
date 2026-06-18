import { cn } from "@/lib/utils";
import type { TimeSlot } from "@/types/interview";
import { format, parseISO } from "date-fns";
import { Clock } from "lucide-react";

interface TimeSlotItemProps {
	slot: TimeSlot;
	isSelected: boolean;
	onSelect: (slot: TimeSlot) => void;
}

export const TimeSlotItem = ({ slot, isSelected, onSelect }: TimeSlotItemProps) => {
	const startTime = parseISO(slot.startTime);
	const endTime = parseISO(slot.endTime);

	const handleClick = () => {
		if (slot.isAvailable) {
			onSelect(slot);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if ((e.key === "Enter" || e.key === " ") && slot.isAvailable) {
			e.preventDefault();
			onSelect(slot);
		}
	};

	return (
		<button
			type="button"
			onClick={handleClick}
			onKeyDown={handleKeyDown}
			disabled={!slot.isAvailable}
			aria-pressed={isSelected}
			aria-label={`Time slot ${format(startTime, "h:mm a")} to ${format(endTime, "h:mm a")}${!slot.isAvailable ? ", unavailable" : ""}`}
			className={cn(
				"flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all duration-200",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
				slot.isAvailable
					? isSelected
						? "border-primary bg-primary/5 text-primary shadow-sm"
						: "border-border bg-card hover:border-primary/50 hover:bg-primary/5 cursor-pointer"
					: "border-border/50 bg-muted/50 text-muted-foreground cursor-not-allowed opacity-60",
			)}>
			<Clock className="h-4 w-4 shrink-0" />
			<span className="font-medium">
				{format(startTime, "h:mm a")} - {format(endTime, "h:mm a")}
			</span>
			{!slot.isAvailable && (
				<span className="text-xs ml-auto text-muted-foreground">Booked</span>
			)}
		</button>
	);
};
