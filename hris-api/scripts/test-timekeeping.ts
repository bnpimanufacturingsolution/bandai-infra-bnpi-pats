/**
 * Test script for timekeeping calculations
 * Run with: npx tsx scripts/test-timekeeping.ts
 */

import { calculateTimekeeping, formatTimekeepingSummary } from "../helper/timekeeping.helper";
import { EmployeeSchedule } from "../generated/prisma";

// Sample schedule: 9-to-5 job with 1-hour lunch break
const sampleSchedule: EmployeeSchedule = {
	scheduleCode: "REGULAR",
	scheduleName: "Regular Schedule",
	startDate: new Date("2026-01-01"),
	endDate: new Date("2026-12-31"),
	shifts: [
		{
			label: "Sunday",
			isRestDay: true,
			timeSlots: [],
		},
		{
			label: "Monday",
			isRestDay: false,
			timeSlots: [
				{ type: "work", label: "Morning", startTime: "09:00", endTime: "12:00" },
				{ type: "break", label: "Lunch", startTime: "12:00", endTime: "13:00" },
				{ type: "work", label: "Afternoon", startTime: "13:00", endTime: "17:00" },
			],
		},
		{
			label: "Tuesday",
			isRestDay: false,
			timeSlots: [
				{ type: "work", label: "Morning", startTime: "09:00", endTime: "12:00" },
				{ type: "break", label: "Lunch", startTime: "12:00", endTime: "13:00" },
				{ type: "work", label: "Afternoon", startTime: "13:00", endTime: "17:00" },
			],
		},
		{
			label: "Wednesday",
			isRestDay: false,
			timeSlots: [
				{ type: "work", label: "Morning", startTime: "09:00", endTime: "12:00" },
				{ type: "break", label: "Lunch", startTime: "12:00", endTime: "13:00" },
				{ type: "work", label: "Afternoon", startTime: "13:00", endTime: "17:00" },
			],
		},
		{
			label: "Thursday",
			isRestDay: false,
			timeSlots: [
				{ type: "work", label: "Morning", startTime: "09:00", endTime: "12:00" },
				{ type: "break", label: "Lunch", startTime: "12:00", endTime: "13:00" },
				{ type: "work", label: "Afternoon", startTime: "13:00", endTime: "17:00" },
			],
		},
		{
			label: "Friday",
			isRestDay: false,
			timeSlots: [
				{ type: "work", label: "Morning", startTime: "09:00", endTime: "12:00" },
				{ type: "break", label: "Lunch", startTime: "12:00", endTime: "13:00" },
				{ type: "work", label: "Afternoon", startTime: "13:00", endTime: "17:00" },
			],
		},
		{
			label: "Saturday",
			isRestDay: true,
			timeSlots: [],
		},
	],
};

console.log("=== TIMEKEEPING CALCULATION TEST ===\n");

// Test 1: Perfect attendance (on time, 7 hours scheduled work)
console.log("Test 1: Perfect Attendance");
const test1Date = new Date("2026-01-12"); // Monday
const test1TimeIn = new Date("2026-01-12T09:00:00");
const test1TimeOut = new Date("2026-01-12T17:00:00");
const test1Result = calculateTimekeeping(test1TimeIn, test1TimeOut, sampleSchedule, test1Date);
console.log(formatTimekeepingSummary(test1Result));
console.log("Expected: 7 hours regular (schedule has 7 hours work time), 0 overtime, 0 late, 0 early out");
console.log("Note: Total clock time is 8 hours, but 1 hour is break, leaving 7 hours worked\n");

// Test 2: Late arrival (15 minutes late)
console.log("Test 2: Late Arrival (15 minutes)");
const test2Date = new Date("2026-01-13"); // Tuesday
const test2TimeIn = new Date("2026-01-13T09:15:00"); // 15 min late
const test2TimeOut = new Date("2026-01-13T17:00:00");
const test2Result = calculateTimekeeping(test2TimeIn, test2TimeOut, sampleSchedule, test2Date);
console.log(formatTimekeepingSummary(test2Result));
console.log("Expected: 6.75 hours regular, 0 overtime, 15 minutes late, 0.25 hours undertime\n");

// Test 3: Overtime (2 hours)
console.log("Test 3: Overtime (2 hours)");
const test3Date = new Date("2026-01-14"); // Wednesday
const test3TimeIn = new Date("2026-01-14T09:00:00");
const test3TimeOut = new Date("2026-01-14T19:00:00"); // 2 hours overtime
const test3Result = calculateTimekeeping(test3TimeIn, test3TimeOut, sampleSchedule, test3Date);
console.log(formatTimekeepingSummary(test3Result));
console.log("Expected: 7 hours regular, 2 hours overtime, 0 late, 0 early out\n");

// Test 4: Early departure (30 minutes early)
console.log("Test 4: Early Departure (30 minutes)");
const test4Date = new Date("2026-01-15"); // Thursday
const test4TimeIn = new Date("2026-01-15T09:00:00");
const test4TimeOut = new Date("2026-01-15T16:30:00"); // 30 min early
const test4Result = calculateTimekeeping(test4TimeIn, test4TimeOut, sampleSchedule, test4Date);
console.log(formatTimekeepingSummary(test4Result));
console.log("Expected: 6.5 hours regular, 0 overtime, 0 late, 30 minutes early out, 0.5 hours undertime\n");

// Test 5: Late arrival + overtime
console.log("Test 5: Late Arrival + Overtime");
const test5Date = new Date("2026-01-16"); // Friday
const test5TimeIn = new Date("2026-01-16T09:30:00"); // 30 min late
const test5TimeOut = new Date("2026-01-16T18:00:00"); // 1 hour overtime
const test5Result = calculateTimekeeping(test5TimeIn, test5TimeOut, sampleSchedule, test5Date);
console.log(formatTimekeepingSummary(test5Result));
console.log("Expected: 7 hours regular, 0.5 hours overtime, 30 minutes late\n");

// Test 6: Rest day work
console.log("Test 6: Rest Day Work (Sunday)");
const test6Date = new Date("2026-01-18"); // Sunday
const test6TimeIn = new Date("2026-01-18T09:00:00");
const test6TimeOut = new Date("2026-01-18T17:00:00");
const test6Result = calculateTimekeeping(test6TimeIn, test6TimeOut, sampleSchedule, test6Date);
console.log(formatTimekeepingSummary(test6Result));
console.log("Expected: 0 regular hours, 8 hours overtime (all rest day hours = overtime)\n");

// Test 7: Clock in only (no clock out yet)
console.log("Test 7: Clock In Only (No Clock Out)");
const test7Date = new Date("2026-01-13"); // Tuesday
const test7TimeIn = new Date("2026-01-13T09:15:00"); // 15 min late
const test7Result = calculateTimekeeping(test7TimeIn, null, sampleSchedule, test7Date);
console.log(formatTimekeepingSummary(test7Result));
console.log("Expected: 0 hours worked, 15 minutes late\n");

console.log("=== ALL TESTS COMPLETED ===");
