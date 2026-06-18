import { Button } from "~/components/atoms/Button";
import { Loader2 } from "lucide-react";
import { cn } from "~/lib/utils";

interface AttendanceActionProps {
	status: "in" | "out";
	onClockIn: () => void;
	onClockOut: () => void;
	isLoading: boolean;
	disabled?: boolean;
}

export function AttendanceAction({
	status,
	onClockIn,
	onClockOut,
	isLoading,
	disabled,
}: AttendanceActionProps) {
	const isClockedIn = status === "in";

	return (
		<div className="w-full mb-4">
			<Button
				onClick={isClockedIn ? onClockOut : onClockIn}
				disabled={isLoading || disabled}
				className={cn(
					"w-full h-16 text-lg font-bold uppercase tracking-widest transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0",
					isClockedIn
						? "bg-white text-gray-900 border-2 border-neutral-200 hover:bg-neutral-50"
						: "bg-primary text-primary-foreground hover:bg-primary/90",
				)}>
				{isLoading ? (
					<Loader2 className="w-6 h-6 animate-spin mr-2" />
				) : isClockedIn ? (
					"Clock Out"
				) : (
					"Clock In"
				)}
			</Button>
		</div>
	);
}
