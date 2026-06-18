import * as React from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";

interface DatePickerProps {
	value?: string;
	onChange?: (value: string) => void;
	placeholder?: string;
	className?: string;
	disabled?: boolean;
	required?: boolean;
}

export function DatePicker({
	value,
	onChange,
	placeholder = "Select date",
	className,
	disabled = false,
	required = false,
}: DatePickerProps) {
	const [isOpen, setIsOpen] = React.useState(false);
	const [currentMonth, setCurrentMonth] = React.useState(new Date());

	const toLocalDateString = React.useCallback((date: Date) => {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}, []);

	const parseDateValue = React.useCallback((raw?: string) => {
		if (!raw) return null;
		const ymd = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(raw.trim());
		if (ymd) {
			const [, y, m, d] = ymd;
			return new Date(Number(y), Number(m) - 1, Number(d));
		}
		const parsed = new Date(raw);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}, []);

	// Parse initial value
	const selectedDate = React.useMemo(() => parseDateValue(value), [parseDateValue, value]);

	React.useEffect(() => {
		const date = parseDateValue(value);
		if (date) {
			setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
		}
	}, [parseDateValue, value]);

	const handleDateSelect = (date: Date) => {
		const dateString = toLocalDateString(date);
		onChange?.(dateString);
		setIsOpen(false);
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

	const isSelected = (date: Date) => {
		return selectedDate?.toDateString() === date.toDateString();
	};

	const isToday = (date: Date) => {
		const today = new Date();
		return date.toDateString() === today.toDateString();
	};

	const isCurrentMonth = (date: Date) => {
		return date.getMonth() === currentMonth.getMonth();
	};

	const formatDisplayValue = () => {
		if (selectedDate) {
			return selectedDate.toLocaleDateString("en-US", {
				month: "2-digit",
				day: "2-digit",
				year: "numeric",
			});
		}
		return placeholder;
	};

	const navigateMonth = (direction: "prev" | "next") => {
		setCurrentMonth((prev) => {
			const newMonth = new Date(prev);
			if (direction === "prev") {
				newMonth.setMonth(newMonth.getMonth() - 1);
			} else {
				newMonth.setMonth(newMonth.getMonth() + 1);
			}
			return newMonth;
		});
	};

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					className={cn(
						"w-full justify-start text-left font-normal h-9 bg-gray-50 border-gray-200 text-sm",
						!selectedDate && "text-muted-foreground",
						className,
					)}
					disabled={disabled}>
					<Calendar className="mr-2 h-4 w-4" />
					{formatDisplayValue()}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start">
				<div className="p-3">
					{/* Month/Year Navigation */}
					<div className="flex items-center justify-between mb-4">
						<Button
							variant="outline"
							size="sm"
							onClick={() => navigateMonth("prev")}
							className="h-7 w-7 p-0">
							<ChevronLeft className="h-4 w-4" />
						</Button>
						<div className="text-sm font-medium">
							{currentMonth.toLocaleDateString("en-US", {
								month: "long",
								year: "numeric",
							})}
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={() => navigateMonth("next")}
							className="h-7 w-7 p-0">
							<ChevronRight className="h-4 w-4" />
						</Button>
					</div>

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
							<Button
								key={index}
								variant="ghost"
								size="sm"
								onClick={() => handleDateSelect(date)}
								className={cn(
									"h-8 w-8 p-0 text-sm",
									isSelected(date) &&
										"bg-primary text-primary-foreground hover:bg-primary/90",
									!isSelected(date) && isToday(date) && "bg-accent",
									!isCurrentMonth(date) && "text-muted-foreground opacity-50",
								)}
								disabled={!isCurrentMonth(date)}>
								{date.getDate()}
							</Button>
						))}
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
