import { Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "~/lib/utils";

interface AttendanceClockProps {
	variant?: "centered" | "split";
}

export function AttendanceClock({ variant = "centered" }: AttendanceClockProps) {
	const [currentTime, setCurrentTime] = useState<Date | null>(null);

	useEffect(() => {
		setCurrentTime(new Date()); // Set initial client-side time
		const timer = setInterval(() => {
			setCurrentTime(new Date());
		}, 1000);
		return () => clearInterval(timer);
	}, []);

	// Formatters
	const timeString = currentTime?.toLocaleTimeString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: true,
	});

	// Split date components for the "split" variant
	const dayName = currentTime?.toLocaleDateString("en-US", { weekday: "long" })?.toUpperCase();
	const fullDate = currentTime
		?.toLocaleDateString("en-US", {
			month: "long",
			day: "numeric",
			year: "numeric",
		})
		?.toUpperCase();

	// Combined string for "centered" variant
	const combinedDateString = currentTime?.toLocaleDateString("en-US", {
		weekday: "long",
		month: "long",
		day: "numeric",
		year: "numeric",
	});

	if (variant === "split") {
		return (
			<div className="flex items-center justify-between w-full mb-2 px-1">
				<div className="flex flex-col items-start gap-0.5 leading-none">
					<div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
						<span>{dayName || "..."}</span>
					</div>
					<span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
						{fullDate || "..."}
					</span>
				</div>
				<div className="text-3xl font-bold text-gray-800 tracking-tight font-heading tabular-nums leading-none">
					{timeString || "--:-- --"}
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center justify-center mb-8 text-center space-y-1">
			<div className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
				<Clock className="w-3 h-3" />
				{combinedDateString || "Loading..."}
			</div>
			<div className="text-3xl font-bold text-gray-700 tracking-tight font-heading tabular-nums">
				{timeString || "--:--:-- --"}
			</div>
		</div>
	);
}
