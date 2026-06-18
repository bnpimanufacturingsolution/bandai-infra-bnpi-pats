import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import EventSidebar from "./event-sidebar";
import { useCalendarEvents, type CalendarEvent } from "~/lib/hooks/use-calendar";
import type { CalendarWithRelations } from "~/zod/calendar.zod";

interface FullCalendarViewProps {
	calendarId: string;
	calendarData?: CalendarWithRelations;
	isLoading?: boolean;
	onBack: () => void;
}

const MONTHS = [
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

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function FullCalendarView({
	calendarId,
	calendarData,
	isLoading,
	onBack,
}: FullCalendarViewProps) {
	const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
	const [currentYear, setCurrentYear] = useState(calendarData?.year || new Date().getFullYear());
	const [selectedDate, setSelectedDate] = useState(new Date().getDate());

	// Use the new hook to transform calendar items into events
	const events = useCalendarEvents(calendarData?.items);

	const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
	const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
	const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

	const days = [
		...Array.from(
			{ length: firstDayOfMonth },
			(_, i) => daysInPrevMonth - firstDayOfMonth + i + 1,
		),
		...Array.from({ length: daysInMonth }, (_, i) => i + 1),
	];

	const dayEvents = (day: number) =>
		events.filter((e) => e.date === day && e.month === currentMonth && e.year === currentYear);

	const handlePrevMonth = () => {
		if (currentMonth === 0) {
			setCurrentMonth(11);
			setCurrentYear(currentYear - 1);
		} else {
			setCurrentMonth(currentMonth - 1);
		}
	};

	const handleNextMonth = () => {
		if (currentMonth === 11) {
			setCurrentMonth(0);
			setCurrentYear(currentYear + 1);
		} else {
			setCurrentMonth(currentMonth + 1);
		}
	};

	const dateEvents = dayEvents(selectedDate);

	if (isLoading) {
		return (
			<div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 p-8">
				<div className="mb-8">
					<button
						onClick={onBack}
						className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6">
						<ArrowLeft className="w-5 h-5" />
						<span className="text-sm font-medium">Back to Calendars</span>
					</button>
					<h1 className="text-4xl font-bold text-foreground">Calendar Management</h1>
				</div>
				<div className="flex items-center justify-center py-12">
					<p className="text-muted-foreground">Loading calendar...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 p-8">
			<div className="mb-8">
				<button
					onClick={onBack}
					className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6">
					<ArrowLeft className="w-5 h-5" />
					<span className="text-sm font-medium">Back to Calendars</span>
				</button>
				<h1 className="text-4xl font-bold text-foreground">Calendar Management</h1>
				<p className="text-muted-foreground mt-2">
					{calendarData?.name || "Company Calendar"} • {calendarData?.country || "PH"} •{" "}
					{calendarData?.year || currentYear}
				</p>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
				<div className="lg:col-span-3">
					<Card className="p-8 rounded-2xl backdrop-blur-lg border border-white/20 dark:border-white/10 bg-white/80 dark:bg-slate-900/50 shadow-lg dark:shadow-2xl">
						<div className="flex items-center justify-between mb-8">
							<div>
								<h2 className="text-2xl font-bold text-foreground">
									{MONTHS[currentMonth]} {currentYear}
								</h2>
							</div>
							<div className="flex gap-3">
								<Button
									variant="outline"
									size="icon"
									onClick={handlePrevMonth}
									className="rounded-lg bg-transparent">
									<ChevronLeft className="w-4 h-4" />
								</Button>
								<Button
									variant="outline"
									size="icon"
									onClick={handleNextMonth}
									className="rounded-lg bg-transparent">
									<ChevronRight className="w-4 h-4" />
								</Button>
							</div>
						</div>
						<div className="grid grid-cols-7 gap-2 mb-4">
							{DAYS.map((day, index) => (
								<div
									key={`day-${index}`}
									className="text-center font-semibold text-sm text-yellow-400/80 py-2">
									{day}
								</div>
							))}
						</div>{" "}
						<div className="grid grid-cols-7 gap-2">
							{days.map((day, index) => {
								const isCurrentMonth =
									index >= firstDayOfMonth &&
									index < firstDayOfMonth + daysInMonth;
								const isSelected = isCurrentMonth && day === selectedDate;
								const hasEvents = isCurrentMonth && dayEvents(day).length > 0;
								const events = isCurrentMonth ? dayEvents(day) : [];

								return (
									<div
										key={`${index}-${day}`}
										onClick={() => isCurrentMonth && setSelectedDate(day)}
										className={`aspect-square flex flex-col items-center justify-center rounded-xl transition-all duration-200 cursor-pointer relative group
                      ${
							!isCurrentMonth
								? "text-muted-foreground/30 bg-transparent"
								: isSelected
									? "bg-yellow-400 text-slate-900 font-bold shadow-[0_0_20px_rgba(252,238,33,0.3)] hover:shadow-[0_0_30px_rgba(252,238,33,0.5)] scale-100"
									: hasEvents
										? "bg-muted/50 dark:bg-slate-800/50 border border-yellow-400/30 hover:bg-muted dark:hover:bg-slate-800"
										: "bg-muted/20 dark:bg-slate-800/20 hover:bg-muted/40 dark:hover:bg-slate-800/40 text-foreground/70"
						}
                    `}>
										<span className="text-sm font-semibold">{day}</span>
										{hasEvents && (
											<div className="flex gap-1 mt-1">
												{events.slice(0, 3).map((event, i) => (
													<div
														key={i}
														className={`w-1.5 h-1.5 rounded-full ${event.color}`}
													/>
												))}
											</div>
										)}
									</div>
								);
							})}
						</div>
						<div className="mt-8 pt-8 border-t border-border/50">
							<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
								Event Types
							</p>
							<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
								<div className="flex items-center gap-2">
									<div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
									<span className="text-sm text-muted-foreground">Holidays</span>
								</div>
								<div className="flex items-center gap-2">
									<div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
									<span className="text-sm text-muted-foreground">Meetings</span>
								</div>
								<div className="flex items-center gap-2">
									<div className="w-2.5 h-2.5 rounded-full bg-red-500" />
									<span className="text-sm text-muted-foreground">Deadlines</span>
								</div>
								<div className="flex items-center gap-2">
									<div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
									<span className="text-sm text-muted-foreground">Other</span>
								</div>
							</div>
						</div>
					</Card>
				</div>

				<EventSidebar selectedDate={selectedDate} events={dateEvents} />
			</div>
		</div>
	);
}
