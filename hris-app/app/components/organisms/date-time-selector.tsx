import { useState, useEffect } from "react";
import { Text } from "@/components/atoms/Text";

import { Calendar } from "@/components/ui/calendar";
import type { AvailableDate, TimeSlot } from "@/types/interview";
import { parseISO, format, isEqual, startOfDay } from "date-fns";
import { CalendarDays, Clock, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeSlotItem } from "../molecules/time-slot-item";
import { ScheduleCalendar } from "../atoms/schedule-calendar";

interface DateTimeSelectorProps {
	availableDates: AvailableDate[];
	selectedDate: string | null;
	selectedSlot: TimeSlot | null;
	onDateSelect: (date: string) => void;
	onSlotSelect: (slot: TimeSlot) => void;
	timezone?: string;
}

export const DateTimeSelector = ({
	availableDates,
	selectedDate,
	selectedSlot,
	onDateSelect,
	onSlotSelect,
	timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
}: DateTimeSelectorProps) => {
	const [currentSlots, setCurrentSlots] = useState<TimeSlot[]>([]);
	const [isLoadingSlots, setIsLoadingSlots] = useState(false);

	// Get available date objects for the calendar
	const availableDateObjects = availableDates.map((d) => parseISO(d.date));

	// Handle date selection
	const handleDateSelect = (date: Date | undefined) => {
		if (date) {
			const formattedDate = format(date, "yyyy-MM-dd");
			onDateSelect(formattedDate);
		}
	};

	// Load slots when date changes
	useEffect(() => {
		if (selectedDate) {
			setIsLoadingSlots(true);
			// Simulate API call delay
			const timer = setTimeout(() => {
				const dateData = availableDates.find((d) => d.date === selectedDate);
				setCurrentSlots(dateData?.slots || []);
				setIsLoadingSlots(false);
			}, 300);
			return () => clearTimeout(timer);
		} else {
			setCurrentSlots([]);
		}
	}, [selectedDate, availableDates]);

	// Check if a date is available
	const isDateAvailable = (date: Date): boolean => {
		return availableDateObjects.some((availableDate) =>
			isEqual(startOfDay(date), startOfDay(availableDate)),
		);
	};

	// Disable dates that are not available
	const isDateDisabled = (date: Date): boolean => {
		return !isDateAvailable(date);
	};

	const availableSlots = currentSlots.filter((s) => s.isAvailable);

	return (
		<section
			aria-labelledby="datetime-selector-heading"
			className="card-elevated p-6 animate-fade-in"
			style={{ animationDelay: "0.1s" }}>
			<div className="flex items-center gap-3 mb-6">
				<div className="h-10 w-10 rounded-full bg-accent/10 flex items-center justify-center">
					<CalendarDays className="h-5 w-5 text-accent" />
				</div>
				<div>
					<Text as="h2" id="datetime-selector-heading">
						Select Date & Time
					</Text>
					<Text variant="caption">Choose a convenient time for your interview</Text>
				</div>
			</div>

			{/* Timezone indicator */}
			<div className="flex items-center gap-2 p-3 bg-muted rounded-lg mb-6">
				<Globe className="h-4 w-4 text-muted-foreground" />
				<Text variant="caption">
					All times shown in your timezone: <strong>{timezone}</strong>
				</Text>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
				{/* Calendar Section */}
				<div>
					<Text variant="label" className="mb-3 flex items-center gap-2">
						<CalendarDays className="h-4 w-4" />
						Select a Date
					</Text>
					<ScheduleCalendar
						mode="single"
						selected={selectedDate ? parseISO(selectedDate) : undefined}
						onSelect={handleDateSelect}
						disabled={isDateDisabled}
						className="rounded-lg border p-3 pointer-events-auto"
						modifiers={{
							available: availableDateObjects,
						}}
						modifiersStyles={{
							available: {
								fontWeight: "bold",
							},
						}}
					/>
					<Text variant="caption" className="mt-3 text-muted-foreground">
						Only dates with available slots are selectable
					</Text>
				</div>

				{/* Time Slots Section */}
				<div>
					<Text variant="label" className="mb-3 flex items-center gap-2">
						<Clock className="h-4 w-4" />
						Select a Time Slot
					</Text>

					{!selectedDate ? (
						<div className="flex flex-col items-center justify-center h-48 bg-muted/50 rounded-lg border-2 border-dashed border-border">
							<Clock className="h-8 w-8 text-muted-foreground mb-2" />
							<Text variant="caption" className="text-center">
								Please select a date first to view available time slots
							</Text>
						</div>
					) : isLoadingSlots ? (
						<div className="flex flex-col items-center justify-center h-48 bg-muted/50 rounded-lg">
							<div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
							<Text variant="caption">Loading available slots...</Text>
						</div>
					) : currentSlots.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-48 bg-muted/50 rounded-lg border-2 border-dashed border-border">
							<Clock className="h-8 w-8 text-muted-foreground mb-2" />
							<Text variant="caption" className="text-center">
								No time slots available for this date
							</Text>
						</div>
					) : (
						<div className="space-y-3">
							<Text variant="caption" className="text-muted-foreground">
								{availableSlots.length} slot{availableSlots.length !== 1 ? "s" : ""}{" "}
								available
							</Text>
							<div className="grid gap-2">
								{currentSlots.map((slot) => (
									<TimeSlotItem
										key={slot.id}
										slot={slot}
										isSelected={selectedSlot?.id === slot.id}
										onSelect={onSlotSelect}
									/>
								))}
							</div>
						</div>
					)}
				</div>
			</div>
		</section>
	);
};
