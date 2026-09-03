import * as React from "react";
import { Clock } from "lucide-react";
import { cn } from "~/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";

interface TimePickerProps {
	value?: string; // Expecting "HH:mm" in 24-hour format
	onChange?: (value: string) => void;
	className?: string;
	disabled?: boolean;
}

export function TimePicker({ value, onChange, className, disabled = false }: TimePickerProps) {
	const [isOpen, setIsOpen] = React.useState(false);
	const hourButtonRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
	const minuteButtonRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
	const hourListRef = React.useRef<HTMLDivElement | null>(null);
	const minuteListRef = React.useRef<HTMLDivElement | null>(null);

	// Parse value to 12h format
	const {
		hours: initialHours,
		minutes: initialMinutes,
		ampm: initialAmpm,
	} = React.useMemo(() => {
		if (!value) return { hours: 12, minutes: 0, ampm: "AM" as const };
		const [h, m] = value.split(":").map(Number);
		let hours = h % 12;
		if (hours === 0) hours = 12;
		const ampm = h >= 12 ? "PM" : "AM";
		return { hours, minutes: m, ampm: ampm as "AM" | "PM" };
	}, [value]);

	const [selectedHours, setSelectedHours] = React.useState(initialHours);
	const [selectedMinutes, setSelectedMinutes] = React.useState(initialMinutes);
	const [selectedAmpm, setSelectedAmpm] = React.useState<"AM" | "PM">(initialAmpm);

	// Sync state with props when value changes externally
	React.useEffect(() => {
		if (!value) return;
		const [h, m] = value.split(":").map(Number);
		let hours = h % 12;
		if (hours === 0) hours = 12;
		const ampm = h >= 12 ? "PM" : "AM";
		setSelectedHours(hours);
		setSelectedMinutes(m);
		setSelectedAmpm(ampm as "AM" | "PM");
	}, [value]);

	// Convert back to 24h string and trigger onChange
	const updateTime = (h: number, m: number, ap: "AM" | "PM") => {
		let hours24 = h;
		if (ap === "PM" && h !== 12) hours24 += 12;
		if (ap === "AM" && h === 12) hours24 = 0;
		const timeStr = `${hours24.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
		onChange?.(timeStr);
	};

	const handleHoursChange = (h: number) => {
		setSelectedHours(h);
		updateTime(h, selectedMinutes, selectedAmpm);
	};

	const handleMinutesChange = (m: number) => {
		setSelectedMinutes(m);
		updateTime(selectedHours, m, selectedAmpm);
	};

	const handleAmpmChange = (ap: "AM" | "PM") => {
		setSelectedAmpm(ap);
		updateTime(selectedHours, selectedMinutes, ap);
	};

	const hoursArray = Array.from({ length: 12 }, (_, i) => i + 1);
	const minutesArray = Array.from({ length: 60 }, (_, i) => i);

	React.useEffect(() => {
		if (!isOpen) return;
		const hourIndex = Math.max(0, Math.min(11, selectedHours - 1));
		const minuteIndex = Math.max(0, Math.min(59, selectedMinutes));
		const scrollToCenter = (
			container: HTMLDivElement | null,
			target: HTMLButtonElement | null,
		) => {
			if (!container || !target) return;
			const desiredTop = Math.max(
				0,
				target.offsetTop - (container.clientHeight - target.clientHeight) / 2,
			);
			container.scrollTop = desiredTop;
		};

		const applyScroll = () => {
			scrollToCenter(hourListRef.current, hourButtonRefs.current[hourIndex] || null);
			scrollToCenter(minuteListRef.current, minuteButtonRefs.current[minuteIndex] || null);
		};

		const rafId = window.requestAnimationFrame(() => {
			// Extra defer for popover mount/position cycle.
			window.setTimeout(applyScroll, 0);
		});

		return () => window.cancelAnimationFrame(rafId);
	}, [isOpen, selectedHours, selectedMinutes]);

	return (
		<Popover
			open={disabled ? false : isOpen}
			onOpenChange={(open) => {
				if (disabled) return;
				setIsOpen(open);
			}}>
			<PopoverTrigger asChild>
				<div
					className={cn(
						"flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer hover:bg-accent/50",
						disabled && "cursor-not-allowed opacity-60 hover:bg-background",
						className,
					)}>
					<div className="flex items-center gap-2 w-full">
						<span className="flex-1 text-left">
							{value ? (
								<>
									{selectedHours.toString().padStart(2, "0")}:
									{selectedMinutes.toString().padStart(2, "0")} {selectedAmpm}
								</>
							) : (
								<span className="text-muted-foreground">--:-- --</span>
							)}
						</span>
						<Clock className="h-4 w-4 text-muted-foreground" />
					</div>
				</div>
			</PopoverTrigger>
			<PopoverContent
				className="w-auto p-0 bg-white border-gray-100 shadow-xl rounded-md"
				align="end">
				<div className="border border-gray-100 rounded-sm bg-white">
					<div className="sticky top-0 z-10 flex items-center justify-center gap-1 border-b border-gray-100 bg-white px-2 py-1.5">
						<span className="text-[10px] font-semibold text-gray-700 tracking-wide">
							{selectedHours.toString().padStart(2, "0")}
						</span>
						<span className="text-[10px] font-semibold text-gray-400">:</span>
						<span className="text-[10px] font-semibold text-gray-700 tracking-wide">
							{selectedMinutes.toString().padStart(2, "0")}
						</span>
						<span className="text-[9px] font-bold text-gray-500 ml-1">
							{selectedAmpm}
						</span>
					</div>
					<div className="flex h-[170px] divide-x divide-gray-100">
						{/* Hours */}
						<div
							ref={hourListRef}
							className="flex flex-col overflow-y-scroll w-14 py-1 [scrollbar-width:thin] [scrollbar-color:#fdba74_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-orange-200 [&::-webkit-scrollbar-thumb]:hover:bg-orange-300">
							{hoursArray.map((hour) => (
								<button
									key={hour}
									ref={(el) => {
										hourButtonRefs.current[hour - 1] = el;
									}}
									type="button"
									onClick={() => handleHoursChange(hour)}
									className={cn(
										"px-1 py-1.5 mx-1 my-0.5 text-xs transition-colors text-center rounded-sm outline-none border border-transparent hover:bg-gray-50 hover:border-gray-100",
										selectedHours === hour &&
											"bg-orange-50 text-orange-700 border-orange-200 font-medium",
									)}>
									{hour.toString().padStart(2, "0")}
								</button>
							))}
						</div>

						{/* Minutes */}
						<div
							ref={minuteListRef}
							className="flex flex-col overflow-y-scroll w-14 py-1 [scrollbar-width:thin] [scrollbar-color:#fdba74_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-orange-200 [&::-webkit-scrollbar-thumb]:hover:bg-orange-300">
							{minutesArray.map((minute) => (
								<button
									key={minute}
									ref={(el) => {
										minuteButtonRefs.current[minute] = el;
									}}
									type="button"
									onClick={() => handleMinutesChange(minute)}
									className={cn(
										"px-1 py-1.5 mx-1 my-0.5 text-xs transition-colors text-center rounded-sm outline-none border border-transparent hover:bg-gray-50 hover:border-gray-100",
										selectedMinutes === minute &&
											"bg-orange-50 text-orange-700 border-orange-200 font-medium",
									)}>
									{minute.toString().padStart(2, "0")}
								</button>
							))}
						</div>

						{/* AM/PM */}
						<div className="flex flex-col justify-start gap-1 w-12 bg-gray-50/30 p-1">
							{["AM", "PM"].map((ampm) => (
								<button
									key={ampm}
									type="button"
									onClick={() => handleAmpmChange(ampm as "AM" | "PM")}
									className={cn(
										"py-1.5 text-[10px] font-bold transition-all rounded-sm outline-none border border-transparent hover:bg-white hover:border-gray-200 hover:shadow-sm",
										selectedAmpm === ampm
											? "bg-white text-gray-900 border-gray-200 shadow-sm ring-1 ring-gray-100"
											: "text-gray-400",
									)}>
									{ampm}
								</button>
							))}
						</div>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
