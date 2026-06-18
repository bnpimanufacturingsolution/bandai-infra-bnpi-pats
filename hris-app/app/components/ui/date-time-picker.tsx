import * as React from "react";
import { Calendar, Clock } from "lucide-react";
import { cn } from "~/lib/utils";

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
	const [selectedDate, setSelectedDate] = React.useState<string>("");
	const [selectedTime, setSelectedTime] = React.useState<string>("");
	const [currentMonth, setCurrentMonth] = React.useState(new Date());
	const containerRef = React.useRef<HTMLDivElement>(null);

	// Parse initial value
	React.useEffect(() => {
		if (value) {
			const date = new Date(value);
			if (!isNaN(date.getTime())) {
				setSelectedDate(date.toISOString().split("T")[0]);
				setSelectedTime(date.toTimeString().split(" ")[0].substring(0, 5));
			}
		}
	}, [value]);

	// Close dropdown when clicking outside
	React.useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
				setIsOpen(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, []);

	const handleDateSelect = (date: string) => {
		setSelectedDate(date);
		updateValue(date, selectedTime);
	};

	const handleTimeSelect = (time: string) => {
		setSelectedTime(time);
		updateValue(selectedDate, time);
	};

	const updateValue = (date: string, time: string) => {
		if (date && time) {
			const dateTime = `${date}T${time}:00.000Z`;
			onChange?.(dateTime);
		}
	};

	const formatDisplayValue = () => {
		if (selectedDate && selectedTime) {
			const date = new Date(`${selectedDate}T${selectedTime}`);
			return date.toLocaleString("en-US", {
				month: "2-digit",
				day: "2-digit",
				year: "numeric",
				hour: "2-digit",
				minute: "2-digit",
				hour12: true,
			});
		}
		return placeholder;
	};

	const generateCalendarDays = () => {
		const year = currentMonth.getFullYear();
		const month = currentMonth.getMonth();
		const firstDay = new Date(year, month, 1);
		const lastDay = new Date(year, month + 1, 0);
		const startDate = new Date(firstDay);
		startDate.setDate(startDate.getDate() - firstDay.getDay());

		const days = [];
		for (let i = 0; i < 42; i++) {
			const date = new Date(startDate);
			date.setDate(startDate.getDate() + i);
			days.push(date);
		}
		return days;
	};

	const isToday = (date: Date) => {
		const today = new Date();
		return (
			date.getDate() === today.getDate() &&
			date.getMonth() === today.getMonth() &&
			date.getFullYear() === today.getFullYear()
		);
	};

	const isSelected = (date: Date) => {
		return selectedDate === date.toISOString().split("T")[0];
	};

	const isCurrentMonth = (date: Date) => {
		return date.getMonth() === currentMonth.getMonth();
	};

	const navigateMonth = (direction: "prev" | "next") => {
		setCurrentMonth((prev) => {
			const newMonth = new Date(prev);
			if (direction === "prev") {
				newMonth.setMonth(prev.getMonth() - 1);
			} else {
				newMonth.setMonth(prev.getMonth() + 1);
			}
			return newMonth;
		});
	};

	return (
		<div ref={containerRef} className="relative">
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				disabled={disabled}
				className={cn(
					"flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
					className,
				)}>
				<span
					className={
						selectedDate && selectedTime ? "text-foreground" : "text-muted-foreground"
					}>
					{formatDisplayValue()}
				</span>
				<div className="flex items-center gap-1">
					<Calendar className="h-4 w-4 text-muted-foreground" />
					<Clock className="h-4 w-4 text-muted-foreground" />
				</div>
			</button>

			{/* Hidden input for form integration */}
			{name && <input type="hidden" name={name} value={value || ""} required={required} />}

			{isOpen && (
				<div className="absolute top-full left-0 z-50 mt-1 w-80 rounded-md border bg-white p-4 shadow-lg">
					{/* Calendar Header */}
					<div className="mb-4 flex items-center justify-between">
						<button
							type="button"
							onClick={() => navigateMonth("prev")}
							className="rounded p-1 hover:bg-gray-100">
							<svg
								className="h-4 w-4"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M15 19l-7-7 7-7"
								/>
							</svg>
						</button>
						<h3 className="text-sm font-medium">
							{currentMonth.toLocaleDateString("en-US", {
								month: "long",
								year: "numeric",
							})}
						</h3>
						<button
							type="button"
							onClick={() => navigateMonth("next")}
							className="rounded p-1 hover:bg-gray-100">
							<svg
								className="h-4 w-4"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M9 5l7 7-7 7"
								/>
							</svg>
						</button>
					</div>

					{/* Calendar Grid */}
					<div className="mb-4">
						{/* Day headers */}
						<div className="grid grid-cols-7 gap-1 mb-2">
							{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
								<div
									key={day}
									className="p-2 text-center text-xs font-medium text-muted-foreground">
									{day}
								</div>
							))}
						</div>

						{/* Calendar days */}
						<div className="grid grid-cols-7 gap-1">
							{generateCalendarDays().map((date, index) => (
								<button
									key={index}
									type="button"
									onClick={() =>
										handleDateSelect(date.toISOString().split("T")[0])
									}
									className={cn(
										"h-8 w-8 rounded text-sm transition-colors",
										isSelected(date) && "bg-orange-500 text-white",
										!isSelected(date) &&
											isToday(date) &&
											"bg-orange-100 text-orange-900 border border-orange-500",
										!isSelected(date) &&
											!isToday(date) &&
											isCurrentMonth(date) &&
											"hover:bg-orange-100 hover:text-orange-900",
										!isCurrentMonth(date) && "text-muted-foreground",
									)}>
									{date.getDate()}
								</button>
							))}
						</div>
					</div>

					{/* Time Picker */}
					<div className="border-t pt-4">
						<label className="block text-sm font-medium mb-2">Time</label>
						<input
							type="time"
							value={selectedTime}
							onChange={(e) => handleTimeSelect(e.target.value)}
							className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
						/>
					</div>

					{/* Actions */}
					<div className="mt-4 flex justify-end gap-2">
						<button
							type="button"
							onClick={() => setIsOpen(false)}
							className="px-3 py-1 text-sm text-muted-foreground hover:text-foreground">
							Cancel
						</button>
						<button
							type="button"
							onClick={() => setIsOpen(false)}
							className="px-3 py-1 text-sm bg-orange-500 text-white rounded hover:bg-orange-600">
							Done
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
