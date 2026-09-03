/**
 * Mock Data for Interview Scheduling
 * In production, this would be fetched from an API
 */

import type { InterviewDetails, AvailableDate, TimeSlot } from "@/types/interview";
import { addDays, format, setHours, setMinutes } from "date-fns";

// Generate mock time slots for a given date
const generateTimeSlots = (date: Date, bookedSlots: number[] = []): TimeSlot[] => {
	const slots: TimeSlot[] = [];
	const slotTimes = [9, 10, 11, 14, 15, 16]; // Available hours

	slotTimes.forEach((hour, index) => {
		const startTime = setMinutes(setHours(date, hour), 0);
		const endTime = setMinutes(setHours(date, hour + 1), 0);

		slots.push({
			id: `slot-${format(date, "yyyy-MM-dd")}-${hour}`,
			startTime: startTime.toISOString(),
			endTime: endTime.toISOString(),
			isAvailable: !bookedSlots.includes(index),
		});
	});

	return slots;
};

// Generate available dates for the next 14 days (excluding weekends and some random unavailable days)
export const generateAvailableDates = (): AvailableDate[] => {
	const dates: AvailableDate[] = [];
	const today = new Date();

	for (let i = 1; i <= 14; i++) {
		const date = addDays(today, i);
		const dayOfWeek = date.getDay();

		// Skip weekends
		if (dayOfWeek === 0 || dayOfWeek === 6) continue;

		// Random booked slots for demo
		const bookedSlots = [Math.floor(Math.random() * 6)];
		if (Math.random() > 0.7) {
			bookedSlots.push(Math.floor(Math.random() * 6));
		}

		dates.push({
			date: format(date, "yyyy-MM-dd"),
			slots: generateTimeSlots(date, bookedSlots),
		});
	}

	return dates;
};

export const mockInterviewDetails: InterviewDetails = {
	candidateName: "Sarah Johnson",
	positionTitle: "Senior Frontend Engineer",
	interviewType: "Technical",
	interviewMode: "Online",
	estimatedDuration: 60,
	interviewers: [
		{
			id: "int-001",
			name: "Michael Chen",
			role: "Engineering Manager",
		},
		{
			id: "int-002",
			name: "Emily Rodriguez",
			role: "Senior Engineer",
		},
	],
	applicationRefId: "APP-2025-001847",
	meetingLink: "Meeting link will be sent upon confirmation",
};

export const mockAvailableDates = generateAvailableDates();
