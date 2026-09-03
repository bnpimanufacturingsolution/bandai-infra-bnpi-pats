import { useState } from "react";
import type { CalendarItem } from "@/types/calendar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarIcon } from "lucide-react";
import { EventDetailsModal } from "./event-details-modal";
import { DayEventsModal } from "./day-events-modal";
import { Badge } from "~/components/atoms";

interface CalendarProps {
	items: CalendarItem[];
	year: number;
}

export function CalendarView({ items, year }: CalendarProps) {
	// Initialize to January (month 0) for the given year, not current month
	const [currentMonth, setCurrentMonth] = useState(0);
	const [selectedEvent, setSelectedEvent] = useState<CalendarItem | null>(null);
	const [dayEventsModal, setDayEventsModal] = useState<{
		isOpen: boolean;
		events: CalendarItem[];
		date: string;
	}>({ isOpen: false, events: [], date: "" });

	const monthNames = [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December",
	];

	const prevMonth = () => {
		setCurrentMonth((prev) => (prev === 0 ? 11 : prev - 1));
	};

	const nextMonth = () => {
		setCurrentMonth((prev) => (prev === 11 ? 0 : prev + 1));
	};

	const getEventsForDate = (day: number) => {
		const currentDate = new Date(year, currentMonth, day);
		currentDate.setHours(0, 0, 0, 0);
		return items.filter((item) => {
			const startDate = new Date(item.startDate);
			const endDate = new Date(item.endDate);
			startDate.setHours(0, 0, 0, 0);
			endDate.setHours(23, 59, 59, 999);
			return currentDate >= startDate && currentDate <= endDate;
		});
	};

	const getEventColor = (type: CalendarItem["type"]) => {
		switch (type) {
			case "EVENT":
				return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20";
			case "HOLIDAY":
				return "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20";
			case "COMPANY_EVENT":
				return "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20";
			case "MEETING":
				return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
			case "DEADLINE":
				return "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20";
			case "REMINDER":
				return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
			default:
				return "bg-muted text-muted-foreground border-border";
		}
	};

	// Calculate days in month and first day of month
	const daysInMonth = new Date(year, currentMonth + 1, 0).getDate();
	const firstDayOfMonth = new Date(year, currentMonth, 1).getDay();

	const renderDays = () => {
		const days = [];

		// Empty slots before the 1st day
		for (let i = 0; i < firstDayOfMonth; i++) {
			days.push(
				<div
					key={`empty-${i}`}
					className="min-h-24 border border-border p-2 bg-muted/30"
				/>,
			);
		}

		// Actual days of the month
		for (let day = 1; day <= daysInMonth; day++) {
			const events = getEventsForDate(day);
			const today = new Date();
			const isToday =
				day === today.getDate() &&
				currentMonth === today.getMonth() &&
				year === today.getFullYear();

			days.push(
				<div
					key={day}
					className="min-h-24 border border-border p-2 bg-card hover:bg-accent/50 transition-colors">
					<div
						className={`text-sm font-medium mb-1 ${
							isToday
								? "bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center"
								: "text-foreground"
						}`}>
						{day}
					</div>
					<div className="space-y-1">
						{events.slice(0, 3).map((event) => (
							<button
								key={event.id}
								onClick={() => setSelectedEvent(event)}
								className={`w-full text-left text-xs px-1.5 py-0.5 rounded border truncate ${getEventColor(
									event.type,
								)} hover:opacity-80 transition-opacity`}>
								{event.title}
							</button>
						))}
						{events.length > 3 && (
							<button
								onClick={() => {
									const dateStr = `${year}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
									setDayEventsModal({
										isOpen: true,
										events: events,
										date: dateStr,
									});
								}}
								className="text-xs text-muted-foreground pl-1.5 hover:text-foreground hover:underline transition-colors">
								+{events.length - 3} more
							</button>
						)}
					</div>
				</div>,
			);
		}

		return days;
	};

	return (
		<>
			<Card className="p-3 sm:p-6">
				<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
					<div className="flex items-center gap-2 sm:gap-3">
						<CalendarIcon className="w-5 h-5 sm:w-6 sm:h-6 text-foreground" />
						<h2 className="text-xl sm:text-2xl font-semibold text-foreground">
							{monthNames[currentMonth]} {year}
						</h2>
					</div>
					<div className="flex items-center gap-2 w-full sm:w-auto">
						<Button
							variant="outline"
							size="icon"
							className="h-9 w-9 sm:h-10 sm:w-10"
							onClick={prevMonth}>
							<ChevronLeft className="w-4 h-4" />
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="flex-1 sm:flex-none"
							onClick={() => {
								const now = new Date();
								// Only go to "today" if the year matches
								if (year === now.getFullYear()) {
									setCurrentMonth(now.getMonth());
								} else {
									// Otherwise go to January of the target year
									setCurrentMonth(0);
								}
							}}>
							Today
						</Button>
						<Button
							variant="outline"
							size="icon"
							className="h-9 w-9 sm:h-10 sm:w-10"
							onClick={nextMonth}>
							<ChevronRight className="w-4 h-4" />
						</Button>
					</div>
				</div>
				<div className="flex flex-wrap gap-2 sm:gap-3 mb-3 sm:mb-4">
					<Badge
						variant="outline"
						className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20 text-xs">
						Event
					</Badge>
					<Badge
						variant="outline"
						className="bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20 text-xs">
						Holiday
					</Badge>
					<Badge
						variant="outline"
						className="bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20 text-xs">
						Company Event
					</Badge>
					<Badge
						variant="outline"
						className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-xs">
						Meeting
					</Badge>
					<Badge
						variant="outline"
						className="bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20 text-xs">
						Deadline
					</Badge>
					<Badge
						variant="outline"
						className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 text-xs">
						Reminder
					</Badge>
				</div>
				{/* Calendar Grid */}
				<div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
					{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
						<div
							key={day}
							className="bg-muted p-1 sm:p-2 text-center text-[10px] sm:text-sm font-semibold text-muted-foreground">
							<span className="hidden sm:inline">{day}</span>
							<span className="sm:hidden">{day.slice(0, 1)}</span>
						</div>
					))}
					{renderDays()}
				</div>
			</Card>
			<EventDetailsModal
				event={selectedEvent}
				onClose={() => setSelectedEvent(null)}
				getEventColor={getEventColor}
			/>
			<DayEventsModal
				isOpen={dayEventsModal.isOpen}
				onClose={() => setDayEventsModal({ isOpen: false, events: [], date: "" })}
				events={dayEventsModal.events}
				date={dayEventsModal.date}
				onEventClick={setSelectedEvent}
				getEventColor={getEventColor}
			/>
		</>
	);
}
