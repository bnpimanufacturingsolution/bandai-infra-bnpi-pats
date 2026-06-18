import { useState, useEffect } from "react";
import { Button } from "~/components/ui/button"; // Using UI button for consistency
import { SearchableSelect, type SearchableSelectOption } from "~/components/ui/searchable-select";
import { CircleAlert, Calendar, Clock, FileText } from "lucide-react";
import { useAuth } from "~/lib/hooks/use-auth";
import { useEmployee } from "~/lib/hooks/useEmployees";
import { useHolidays } from "~/lib/hooks/useHolidays";
import { useLeaveSettings } from "~/lib/hooks/useLeaveSettings";
import { useEmployeeScheduleCalendar } from "~/lib/hooks/useSchedules";
import { Link } from "react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { CalendarDatePicker } from "~/components/ui/calendar-date-picker";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { buildCalendarViewDeepLink } from "~/lib/utils/deep-linking";
import type { LeaveHolidayItem } from "~/lib/hooks/useHolidays";

interface LeaveRequestModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (leaveRequest: LeaveRequestData) => void;
	isPending?: boolean;
	initialLeaveType?: string;
	initialStartDate?: string;
	initialEndDate?: string;
	hideCalendarPreview?: boolean;
}

interface LeaveRequestData {
	leaveType: string;
	startDate: string;
	endDate: string;
	durationUnit: "FULL_DAY" | "HALF_DAY";
	halfDaySession?: "AM" | "PM";
	totalDays: number;
	description: string;
	notes?: string;
}

const MANILA_TIME_ZONE = "Asia/Manila";

const getManilaDateTimeParts = () => {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: MANILA_TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(new Date());
	const valueFor = (type: string) => parts.find((part) => part.type === type)?.value || "";

	return {
		year: valueFor("year"),
		month: valueFor("month"),
		day: valueFor("day"),
		hour: Number(valueFor("hour") || 0),
		minute: Number(valueFor("minute") || 0),
	};
};

// Helper function to get today's Manila date in YYYY-MM-DD format
const getTodayDate = () => {
	const today = getManilaDateTimeParts();
	const year = today.year;
	const month = today.month;
	const day = today.day;
	return `${year}-${month}-${day}`;
};

const getCurrentManilaHalfDaySession = (): "AM" | "PM" => {
	const { hour } = getManilaDateTimeParts();
	return hour < 12 ? "AM" : "PM";
};

const parseDateString = (value: string) => {
	const [year, month, day] = value.split("-").map(Number);
	return new Date(year, month - 1, day);
};

const formatDateString = (value: Date) => {
	const year = value.getFullYear();
	const month = String(value.getMonth() + 1).padStart(2, "0");
	const day = String(value.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
};

const addDaysToDateString = (value: string, days: number) => {
	const nextDate = parseDateString(value);
	nextDate.setDate(nextDate.getDate() + days);
	return formatDateString(nextDate);
};

const getDateDifferenceInDays = (from: string, to: string) => {
	const fromDate = parseDateString(from);
	const toDate = parseDateString(to);
	return Math.floor((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
};

const isDateBefore = (value: string, compareTo: string) =>
	getDateDifferenceInDays(value, compareTo) > 0;

const isDateAfter = (value: string, compareTo: string) =>
	getDateDifferenceInDays(compareTo, value) > 0;

const enumerateDateRange = (start: string, end: string) => {
	const dates: string[] = [];
	if (!start || !end || isDateAfter(start, end)) return dates;

	let cursor = parseDateString(start);
	const endDate = parseDateString(end);

	while (cursor.getTime() <= endDate.getTime()) {
		dates.push(formatDateString(cursor));
		cursor = new Date(cursor);
		cursor.setDate(cursor.getDate() + 1);
	}

	return dates;
};

const getDateOnlyFromIso = (value: string) => {
	const isoDateMatch = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
	if (isoDateMatch?.[1]) {
		return isoDateMatch[1];
	}
	const date = new Date(value);
	return formatDateString(date);
};

const expandHolidayDates = (holiday: LeaveHolidayItem) => {
	const dates: string[] = [];
	let cursor = parseDateString(getDateOnlyFromIso(holiday.startDate));
	const endDate = parseDateString(getDateOnlyFromIso(holiday.endDate));

	while (cursor.getTime() <= endDate.getTime()) {
		dates.push(formatDateString(cursor));
		cursor = new Date(cursor);
		cursor.setDate(cursor.getDate() + 1);
	}

	return dates;
};

const isNonWorkingHoliday = (holiday: LeaveHolidayItem) =>
	holiday.holidayType === "regular" || holiday.holidayType === "special-non-working";

const findEarliestAllowedDate = (params: { baseDate: string; blockedDates: Set<string> }) => {
	const { baseDate, blockedDates } = params;
	let candidate = baseDate;
	while (blockedDates.has(candidate)) {
		candidate = addDaysToDateString(candidate, 1);
	}
	return candidate;
};

const timeToMinutes = (time: string): number => {
	const [hour, minute] = time.split(":").map(Number);
	return hour * 60 + minute;
};

const getCalendarDayShift = (calendarDay: any | null): any | null =>
	calendarDay?.shift || calendarDay?.shiftType || null;

const getWorkSlots = (shift: any | null) =>
	(Array.isArray(shift?.timeSlots) ? shift.timeSlots : []).filter(
		(slot: any) => slot?.type === "work" && slot?.startTime && slot?.endTime,
	);

const isOffScheduleDay = (calendarDay: any | null): boolean => {
	const shift = getCalendarDayShift(calendarDay);
	if (!shift) {
		return false;
	}

	return Boolean(shift.isOff) || getWorkSlots(shift).length === 0;
};

const findShiftForDate = (calendarDay: any | null): any | null => {
	const shift = getCalendarDayShift(calendarDay);
	if (!shift) {
		return null;
	}

	return {
		label:
			shift.name ||
			shift.code ||
			shift.shiftTypeName ||
			shift.shiftTypeCode ||
			(shift.isOff ? "Off Day" : "Assigned Shift"),
		isRestDay: Boolean(shift.isOff) || getWorkSlots(shift).length === 0,
		timeSlots: Array.isArray(shift.timeSlots) ? shift.timeSlots : [],
	};
};

const resolveHalfDaySessionStart = (
	calendarDay: any | null,
	session: "AM" | "PM",
): string | null => {
	const shift = findShiftForDate(calendarDay);
	if (!shift || shift.isRestDay) {
		return null;
	}

	const workSlots = (shift.timeSlots || [])
		.filter((slot: any) => slot?.type === "work" && slot?.startTime && slot?.endTime)
		.map((slot: any) => ({
			startTime: String(slot.startTime),
			endTime: String(slot.endTime),
			startMinute: timeToMinutes(String(slot.startTime)),
			endMinute: timeToMinutes(String(slot.endTime)),
		}))
		.sort((a: any, b: any) => a.startMinute - b.startMinute);

	if (workSlots.length === 0) {
		return null;
	}

	if (workSlots.length === 1) {
		const [slot] = workSlots;
		const sessionStartMinute =
			session === "AM"
				? slot.startMinute
				: slot.startMinute + (slot.endMinute - slot.startMinute) / 2;
		const hour = Math.floor(sessionStartMinute / 60)
			.toString()
			.padStart(2, "0");
		const minute = Math.floor(sessionStartMinute % 60)
			.toString()
			.padStart(2, "0");
		return `${hour}:${minute}`;
	}

	let largestGap = Number.NEGATIVE_INFINITY;
	let boundaryAfterIndex = 0;
	for (let i = 0; i < workSlots.length - 1; i++) {
		const gap = workSlots[i + 1].startMinute - workSlots[i].endMinute;
		if (gap > largestGap) {
			largestGap = gap;
			boundaryAfterIndex = i;
		}
	}

	if (largestGap <= 0) {
		const durations = workSlots.map((slot: any) => slot.endMinute - slot.startMinute);
		const total = durations.reduce((sum: number, minutes: number) => sum + minutes, 0);
		let consumed = 0;
		let nearestDelta = Number.POSITIVE_INFINITY;
		for (let i = 0; i < workSlots.length - 1; i++) {
			consumed += durations[i];
			const delta = Math.abs(total / 2 - consumed);
			if (delta < nearestDelta) {
				nearestDelta = delta;
				boundaryAfterIndex = i;
			}
		}
	}

	const amSlots = workSlots.slice(0, boundaryAfterIndex + 1);
	const pmSlots = workSlots.slice(boundaryAfterIndex + 1);
	const selectedSlots = session === "AM" ? amSlots : pmSlots;
	return selectedSlots.length > 0 ? selectedSlots[0].startTime : null;
};

const isSessionDisabledForToday = (
	calendarDay: any | null,
	dateStr: string,
	session: "AM" | "PM",
): boolean => {
	if (dateStr !== getTodayDate()) {
		return false;
	}

	const sessionStart = resolveHalfDaySessionStart(calendarDay, session);
	if (!sessionStart) {
		return false;
	}

	const currentSession = getCurrentManilaHalfDaySession();

	if (session === "AM") {
		return currentSession === "PM";
	}

	return false;
};

export function LeaveRequestModal({
	isOpen,
	onClose,
	onSubmit,
	isPending = false,
	initialLeaveType,
	initialStartDate,
	initialEndDate,
	hideCalendarPreview = false,
}: LeaveRequestModalProps) {
	const { user } = useAuth();
	const reportTo = user?.metadata?.employee?.reportTo;
	const hasAssignedApprover = Boolean(reportTo?.id);
	const managerName = `${reportTo?.firstName || ""} ${reportTo?.lastName || ""}`.trim();
	const employeeId = user?.metadata?.employee?.id;
	const organizationId = user?.organizationId ?? undefined;

	// Fetch current employee data to get leave balances - only fetch what we need
	const { data: employee, isLoading: isLoadingEmployee } = useEmployee(employeeId || "", [
		"id",
		"leaveBalances",
	]);
	const { data: leavePolicies, isLoading: isLoadingLeavePolicies } = useLeaveSettings();
	const { data: holidays = [], isLoading: isLoadingHolidays } = useHolidays(organizationId);

	const [selectedLeaveType, setSelectedLeaveType] = useState("");
	const [startDate, setStartDate] = useState(getTodayDate());
	const [endDate, setEndDate] = useState(getTodayDate());
	const [description, setDescription] = useState("");
	const [notes, setNotes] = useState("");
	const [durationUnit, setDurationUnit] = useState<"FULL_DAY" | "HALF_DAY">("HALF_DAY");
	const [halfDaySession, setHalfDaySession] = useState<"AM" | "PM" | "">(
		getCurrentManilaHalfDaySession(),
	);
	const [calculatedDays, setCalculatedDays] = useState(1);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const normalizedSelectedLeaveType = String(selectedLeaveType || "")
		.trim()
		.toUpperCase();
	const selectedPolicy = leavePolicies?.find(
		(policy) => policy.leaveType === normalizedSelectedLeaveType,
	);
	// Leave settings currently have no per-policy holiday toggle; block non-working holidays by default.
	const shouldBlockNonWorkingHolidays = true;
	const blockedHolidayDateValues = (holidays || [])
		.filter((holiday) => shouldBlockNonWorkingHolidays && isNonWorkingHoliday(holiday))
		.flatMap((holiday) => expandHolidayDates(holiday));
	const blockedHolidayDateKey = blockedHolidayDateValues.join("|");
	const blockedHolidayDates = new Set(blockedHolidayDateValues);
	const minAdvanceNoticeDays = selectedPolicy?.minAdvanceNoticeDays ?? 0;
	const earliestPolicyDate = addDaysToDateString(getTodayDate(), minAdvanceNoticeDays);
	const earliestPolicyStartDate = findEarliestAllowedDate({
		baseDate: earliestPolicyDate,
		blockedDates: blockedHolidayDates,
	});
	const scheduleLookupEndDate = addDaysToDateString(earliestPolicyStartDate, 370);
	const { data: scheduleCalendar, isLoading: isLoadingScheduleCalendar } =
		useEmployeeScheduleCalendar(
			{
				employeeId: employeeId || "",
				start: earliestPolicyStartDate,
				end: scheduleLookupEndDate,
			},
			{ enabled: !!employeeId && !!earliestPolicyStartDate },
		);
	const scheduleDays = scheduleCalendar?.days || [];
	const offScheduleDateValues = scheduleDays
		.filter((day: any) => isOffScheduleDay(day))
		.map((day: any) => getDateOnlyFromIso(day.date));
	const offScheduleDateKey = offScheduleDateValues.join("|");
	const offScheduleDates = new Set(offScheduleDateValues);
	const blockedRequestDates = new Set([...blockedHolidayDateValues, ...offScheduleDateValues]);
	const earliestAllowedStartDate = findEarliestAllowedDate({
		baseDate: earliestPolicyStartDate,
		blockedDates: blockedRequestDates,
	});
	const selectedScheduleDay =
		scheduleDays.find((day: any) => getDateOnlyFromIso(day.date) === startDate) || null;
	const isAmSessionDisabled = isSessionDisabledForToday(selectedScheduleDay, startDate, "AM");
	const isPmSessionDisabled = isSessionDisabledForToday(selectedScheduleDay, startDate, "PM");
	const allowHalfDayByPolicy = selectedPolicy?.allowHalfDay ?? true;
	const startDateIsBlockedHoliday = blockedHolidayDates.has(startDate);
	const endDateIsBlockedHoliday = blockedHolidayDates.has(endDate);
	const startDateIsOffSchedule = offScheduleDates.has(startDate);
	const endDateIsOffSchedule = offScheduleDates.has(endDate);
	const rangeBlockedDates =
		startDate && endDate
			? enumerateDateRange(startDate, endDate).filter((date) => blockedRequestDates.has(date))
			: [];
	const rangeOffScheduleDates =
		startDate && endDate
			? enumerateDateRange(startDate, endDate).filter((date) => offScheduleDates.has(date))
			: [];
	const hasBlockedDateInRange = rangeBlockedDates.length > 0;
	const hasOffScheduleDateInRange = rangeOffScheduleDates.length > 0;
	const rangeBlockedReason = hasBlockedDateInRange
		? hasOffScheduleDateInRange
			? `This leave range includes an off day on ${rangeOffScheduleDates[0]}.`
			: `This leave range includes a non-working holiday on ${rangeBlockedDates[0]}.`
		: "";

	// Update states from initial props when modal opens
	useEffect(() => {
		if (isOpen) {
			if (initialLeaveType) {
				setSelectedLeaveType(initialLeaveType);
			}
			if (initialStartDate) {
				setStartDate(initialStartDate);
			}
			if (initialEndDate) {
				setEndDate(initialEndDate);
			}
		}
	}, [isOpen, initialLeaveType, initialStartDate, initialEndDate]);

	// Get available leave types from employee's leave balances
	const leaveBalances = employee?.leaveBalances || [];
	const enabledLeaveTypes = new Set<string>(
		(leavePolicies || []).filter((policy) => policy.enabled).map((policy) => policy.leaveType),
	);
	const isSickLeaveType = (leaveType: string) =>
		String(leaveType).trim().toUpperCase().includes("SICK");
	const availableLeaveTypes: SearchableSelectOption[] = leaveBalances
		.filter(
			(balance) =>
				balance.available > 0 &&
				(enabledLeaveTypes.size === 0 || enabledLeaveTypes.has(balance.leaveType)),
		)
		.sort((a, b) => {
			const aIsSick = isSickLeaveType(a.leaveType);
			const bIsSick = isSickLeaveType(b.leaveType);
			if (aIsSick !== bIsSick) {
				return aIsSick ? -1 : 1;
			}
			return a.leaveType.localeCompare(b.leaveType);
		})
		.map((balance) => ({
			value: balance.leaveType,
			label: `${balance.leaveType.charAt(0).toUpperCase()}${balance.leaveType.slice(1).toLowerCase()} Leave (${balance.available} days available)`,
		}));
	const defaultLeaveType =
		availableLeaveTypes.find((option) => isSickLeaveType(option.value))?.value ||
		availableLeaveTypes[0]?.value ||
		"";

	// Calculate days between start and end date
	const calculateDays = (
		start: string,
		end: string,
		selectedDurationUnit: "FULL_DAY" | "HALF_DAY",
	) => {
		if (selectedDurationUnit === "HALF_DAY") {
			return 0.5;
		}
		if (start && end) {
			// Parse dates explicitly to avoid timezone issues
			const [startYear, startMonth, startDay] = start.split("-").map(Number);
			const [endYear, endMonth, endDay] = end.split("-").map(Number);

			const startDate = new Date(startYear, startMonth - 1, startDay);
			const endDate = new Date(endYear, endMonth - 1, endDay);

			const timeDiff = endDate.getTime() - startDate.getTime();
			const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24)) + 1; // +1 to include both start and end days
			return daysDiff > 0 ? daysDiff : 1; // Always at least 1 day
		}
		return 1;
	};

	useEffect(() => {
		if (!isOpen || selectedLeaveType || !defaultLeaveType) {
			return;
		}

		setSelectedLeaveType(initialLeaveType || defaultLeaveType);
	}, [defaultLeaveType, initialLeaveType, isOpen, selectedLeaveType]);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		const today = getTodayDate();
		setStartDate(initialStartDate || today);
		setEndDate(initialEndDate || initialStartDate || today);
		setDurationUnit("HALF_DAY");
		setHalfDaySession(getCurrentManilaHalfDaySession());
	}, [initialEndDate, initialStartDate, isOpen]);

	useEffect(() => {
		setCalculatedDays(calculateDays(startDate, endDate, durationUnit));
	}, [startDate, endDate, durationUnit]);

	useEffect(() => {
		if (durationUnit === "HALF_DAY" && !allowHalfDayByPolicy) {
			setDurationUnit("FULL_DAY");
			setHalfDaySession("");
		}
	}, [allowHalfDayByPolicy, durationUnit]);

	useEffect(() => {
		if (durationUnit === "HALF_DAY") {
			setEndDate(startDate);
		}
	}, [durationUnit, startDate]);

	useEffect(() => {
		if (durationUnit !== "HALF_DAY") {
			return;
		}

		if (halfDaySession === "AM" && isAmSessionDisabled) {
			setHalfDaySession("");
		}
		if (halfDaySession === "PM" && isPmSessionDisabled) {
			setHalfDaySession("");
		}
	}, [durationUnit, halfDaySession, isAmSessionDisabled, isPmSessionDisabled]);

	// Initialize calculated days when modal opens
	useEffect(() => {
		if (isOpen) {
			setCalculatedDays(calculateDays(getTodayDate(), getTodayDate(), durationUnit));
		}
	}, [isOpen, durationUnit]);

	// Reset form when modal closes
	useEffect(() => {
		if (!isOpen) {
			resetForm();
		}
	}, [isOpen]);

	useEffect(() => {
		if (!selectedLeaveType) {
			return;
		}

		let nextStartDate = startDate;
		let nextEndDate = endDate;
		let didAdjustStartDate = false;
		let didAdjustEndDate = false;

		if (!nextStartDate || isDateBefore(nextStartDate, earliestAllowedStartDate)) {
			nextStartDate = earliestAllowedStartDate;
		}

		if (blockedRequestDates.has(nextStartDate)) {
			nextStartDate = findEarliestAllowedDate({
				baseDate: nextStartDate,
				blockedDates: blockedRequestDates,
			});
		}

		if (nextStartDate !== startDate) {
			setStartDate(nextStartDate);
			didAdjustStartDate = true;
		}

		if (durationUnit === "HALF_DAY") {
			if (nextEndDate !== nextStartDate) {
				nextEndDate = nextStartDate;
				setEndDate(nextStartDate);
				didAdjustEndDate = true;
			}
		} else {
			const endBeforeStart = isDateAfter(nextStartDate, nextEndDate);
			const endHitsBlockedDate = blockedRequestDates.has(nextEndDate);
			const rangeContainsBlockedDate = enumerateDateRange(nextStartDate, nextEndDate).some(
				(date) => blockedRequestDates.has(date),
			);

			if (endBeforeStart || endHitsBlockedDate || rangeContainsBlockedDate) {
				nextEndDate = nextStartDate;
				setEndDate(nextStartDate);
				didAdjustEndDate = true;
			}
		}

		if (didAdjustStartDate || didAdjustEndDate) {
			setErrors((prev) => {
				const next = { ...prev };
				if (didAdjustStartDate) {
					delete next.startDate;
				}
				if (didAdjustEndDate) {
					delete next.endDate;
				}
				return next;
			});
		}
	}, [
		blockedHolidayDateKey,
		offScheduleDateKey,
		durationUnit,
		earliestAllowedStartDate,
		endDate,
		selectedLeaveType,
		startDate,
	]);

	const resetForm = () => {
		setSelectedLeaveType("");
		setStartDate(getTodayDate());
		setEndDate(getTodayDate());
		setDescription("");
		setNotes("");
		setDurationUnit("HALF_DAY");
		setHalfDaySession(getCurrentManilaHalfDaySession());
		setCalculatedDays(0.5);
		setErrors({});
	};

	const validateForm = () => {
		const newErrors: Record<string, string> = {};

		if (!selectedLeaveType) {
			newErrors.leaveType = "Leave type is required";
		}

		if (!startDate) {
			newErrors.startDate = "Start date is required";
		}

		if (!endDate) {
			newErrors.endDate = "End date is required";
		}

		if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
			newErrors.endDate = "End date must be after start date";
		}

		if (selectedLeaveType && isDateBefore(startDate, earliestAllowedStartDate)) {
			newErrors.startDate =
				minAdvanceNoticeDays > 0
					? `Leave must be filed at least ${minAdvanceNoticeDays} day(s) in advance.`
					: "Start date is no longer selectable.";
		}

		if (selectedLeaveType && startDateIsBlockedHoliday) {
			newErrors.startDate = "Non-working holidays cannot be selected for leave requests.";
		}

		if (selectedLeaveType && endDateIsBlockedHoliday) {
			newErrors.endDate = "Non-working holidays cannot be selected for leave requests.";
		}

		if (selectedLeaveType && startDateIsOffSchedule) {
			newErrors.startDate = "Off days cannot be selected for leave requests.";
		}

		if (selectedLeaveType && endDateIsOffSchedule) {
			newErrors.endDate = "Off days cannot be selected for leave requests.";
		}

		if (selectedLeaveType && durationUnit === "FULL_DAY" && hasBlockedDateInRange) {
			newErrors.endDate = rangeBlockedReason;
		}

		if (durationUnit === "HALF_DAY") {
			if (startDate !== endDate) {
				newErrors.endDate = "Half-day leave must be for one date only";
			}
			if (!halfDaySession) {
				newErrors.halfDaySession = "Session is required for half-day leave";
			}
		}

		if (!description.trim()) {
			newErrors.description = "Description is required";
		}

		// Check if user has enough leave balance
		if (selectedLeaveType && calculatedDays > 0) {
			const balance = leaveBalances.find((b) => b.leaveType === normalizedSelectedLeaveType);
			if (balance && calculatedDays > balance.available) {
				newErrors.leaveType = `Insufficient balance. You only have ${balance.available} days available`;
			}
		}

		if (durationUnit === "HALF_DAY" && !allowHalfDayByPolicy) {
			newErrors.halfDaySession = `${selectedLeaveType} leave does not allow half-day requests.`;
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		if (!hasAssignedApprover) {
			return;
		}

		if (!validateForm()) {
			return;
		}

		const leaveRequest: LeaveRequestData = {
			leaveType: selectedLeaveType,
			startDate,
			endDate,
			durationUnit,
			halfDaySession:
				durationUnit === "HALF_DAY" ? (halfDaySession as "AM" | "PM") : undefined,
			totalDays: calculatedDays,
			description,
			notes: notes || undefined,
		};

		onSubmit(leaveRequest);
	};

	const getSelectedBalance = () => {
		return leaveBalances.find((b) => b.leaveType === normalizedSelectedLeaveType);
	};

	const selectedBalance = getSelectedBalance();
	// const remainingAfterRequest = selectedBalance ? selectedBalance.available - calculatedDays : 0; // Unused for now
	const leavePolicyNoticeText =
		selectedLeaveType && minAdvanceNoticeDays > 0
			? `Earliest available start date for this leave type is ${earliestAllowedStartDate}.`
			: "";
	const holidayPolicyText = shouldBlockNonWorkingHolidays
		? "Non-working holidays are not selectable for leave requests."
		: "";
	const schedulePolicyText = "Off days are not selectable for leave requests.";
	const isStartDateDisabled = (date: Date) => {
		const dateKey = formatDateString(date);
		if (isDateBefore(dateKey, earliestAllowedStartDate)) {
			return true;
		}
		return blockedRequestDates.has(dateKey);
	};
	const isEndDateDisabled = (date: Date) => {
		const dateKey = formatDateString(date);
		if (durationUnit === "HALF_DAY") {
			return dateKey !== startDate;
		}
		if (blockedRequestDates.has(dateKey)) {
			return true;
		}
		if (startDate && isDateAfter(startDate, dateKey)) {
			return true;
		}
		return enumerateDateRange(startDate, dateKey).some((currentDate) =>
			blockedRequestDates.has(currentDate),
		);
	};
	const isSubmitDisabled =
		isPending ||
		!hasAssignedApprover ||
		startDateIsBlockedHoliday ||
		endDateIsBlockedHoliday ||
		startDateIsOffSchedule ||
		endDateIsOffSchedule ||
		(durationUnit === "FULL_DAY" && hasBlockedDateInRange);

	// Helper for label rendering
	const FieldLabel = ({
		children,
		required,
	}: {
		children: React.ReactNode;
		required?: boolean;
	}) => (
		<Label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-2 block">
			{children} {required && <span className="text-red-500 ml-0.5">*</span>}
		</Label>
	);

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="max-h-[88vh] overflow-y-auto border-gray-200 bg-white p-0 shadow-lg sm:max-w-[1040px]">
				<div>
					<DialogHeader>
						<div className="border-b border-gray-200 px-6 py-5">
						<DialogTitle className="text-xl font-semibold flex items-center gap-2 text-gray-950">
							<FileText className="w-5 h-5 text-primary" />
							New Leave Request
						</DialogTitle>
						</div>
					</DialogHeader>

					{isLoadingEmployee ||
					isLoadingScheduleCalendar ||
					isLoadingHolidays ||
					isLoadingLeavePolicies ? (
						<div className="py-10 text-center text-gray-500 flex flex-col items-center gap-2">
							<div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
							Loading leave balances, schedule, and policy dates...
						</div>
					) : availableLeaveTypes.length === 0 ? (
						<div className="py-8 text-center bg-white/50 rounded-lg border border-dashed border-gray-200 my-4">
							<p className="text-gray-600 mb-2 font-medium">
								No leave balances available
							</p>
							<p className="text-sm text-gray-500">
								Contact HR to set up your leave entitlements
							</p>
						</div>
					) : (
						<form
							onSubmit={handleSubmit}
							className="grid gap-4 px-6 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.78fr)]">
							{/* Leave Type Select */}
							<div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4">
								<div className="space-y-1">
									<FieldLabel required>
										<span className="text-xs font-medium text-gray-600">
											Leave Type
										</span>
									</FieldLabel>
								</div>
								<SearchableSelect
									options={availableLeaveTypes}
									value={selectedLeaveType}
									onValueChange={(value: string) => setSelectedLeaveType(value)}
									placeholder="Select leave type"
									searchPlaceholder="Search leave types..."
									className={`w-full ${errors.leaveType ? "border-red-500" : ""}`}
								/>
								{errors.leaveType && (
									<p className="text-sm text-red-600 mt-1">{errors.leaveType}</p>
								)}

								{/* Balance Check Display */}
								{selectedBalance && (
									<div className="mt-3 flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
										<CircleAlert className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
										<div className="flex-1">
											<p className="text-sm font-medium text-gray-900">
												Current Balance: {selectedBalance.leaveType}
											</p>
											<p className="text-sm text-orange-700 mt-0.5">
												You have{" "}
												<span className="font-semibold text-orange-600">
													{selectedBalance.available} days
												</span>{" "}
												remaining this year
											</p>
										</div>
									</div>
								)}
							</div>

							{/* Duration Section */}
							<div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 lg:row-span-2">
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div className="space-y-1.5">
										<label className="block text-xs font-medium text-gray-600  tracking-wide">
											Duration Type
										</label>
										<Select
											value={durationUnit}
											onValueChange={(value) =>
												setDurationUnit(value as "FULL_DAY" | "HALF_DAY")
											}>
											<SelectTrigger className="h-11 border-gray-300 bg-white focus-visible:ring-orange-500/30 focus-visible:border-orange-500">
												<SelectValue placeholder="Select duration type" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="FULL_DAY">Full Day</SelectItem>
												<SelectItem
													value="HALF_DAY"
													disabled={!allowHalfDayByPolicy}>
													Half Day
												</SelectItem>
											</SelectContent>
										</Select>
										{selectedLeaveType && !allowHalfDayByPolicy && (
											<p className="mt-1 text-xs text-amber-700">
												This leave type is currently limited to full-day
												requests.
											</p>
										)}
									</div>

									{durationUnit === "HALF_DAY" ? (
										<div className="space-y-1.5">
											<label className="block text-xs font-medium text-gray-600  tracking-wide">
												Session
											</label>
											<Select
												value={halfDaySession}
												onValueChange={(value) =>
													setHalfDaySession(value as "AM" | "PM" | "")
												}>
												<SelectTrigger
													className={`h-11 bg-white focus-visible:ring-orange-500/30 focus-visible:border-orange-500 ${
														errors.halfDaySession
															? "border-red-300"
															: "border-gray-300"
													}`}>
													<SelectValue placeholder="Select session" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem
														value="AM"
														disabled={isAmSessionDisabled}>
														AM Session
													</SelectItem>
													<SelectItem
														value="PM"
														disabled={isPmSessionDisabled}>
														PM Session
													</SelectItem>
												</SelectContent>
											</Select>
											{startDate === getTodayDate() &&
												(isAmSessionDisabled || isPmSessionDisabled) && (
													<p className="mt-1 text-xs text-amber-700">
														{isAmSessionDisabled && isPmSessionDisabled
															? "No half-day sessions are available for today based on current time."
															: isAmSessionDisabled
																? "AM session is no longer available for today."
																: "PM session is no longer available for today."}
													</p>
												)}
											{errors.halfDaySession && (
												<p className="mt-1 text-sm text-red-600">
													{errors.halfDaySession}
												</p>
											)}
										</div>
									) : (
										<div className="hidden md:block" />
									)}
								</div>

								{durationUnit === "HALF_DAY" && (
									<div className="rounded-md border border-orange-200 bg-orange-50/80 px-3 py-2 text-xs text-orange-800">
										Half-day requests use your schedule work slots only. Select
										the session you want to apply for.
									</div>
								)}

								<div className="grid grid-cols-2 gap-4">
									<div>
										<label className="block text-xs font-medium text-gray-600 mb-1.5">
											Start Date
										</label>
										<CalendarDatePicker
											value={startDate}
											onChange={setStartDate}
											minDate={parseDateString(earliestAllowedStartDate)}
											isDateDisabled={isStartDateDisabled}
											className={
												errors.startDate
													? "border-red-300 focus:border-red-500"
													: ""
											}
										/>
										{!errors.startDate && leavePolicyNoticeText && (
											<p className="mt-1 text-xs text-amber-700">
												{leavePolicyNoticeText}
											</p>
										)}
										{!errors.startDate && holidayPolicyText && (
											<p className="mt-1 text-xs text-gray-500">
												{holidayPolicyText}
											</p>
										)}
										{!errors.startDate && (
											<p className="mt-1 text-xs text-gray-500">
												{schedulePolicyText}
											</p>
										)}
										{errors.startDate && (
											<p className="mt-1 text-sm text-red-600">
												{errors.startDate}
											</p>
										)}
									</div>
									<div>
										<label className="block text-xs font-medium text-gray-600 mb-1.5">
											End Date
										</label>
										<CalendarDatePicker
											value={endDate}
											onChange={setEndDate}
											disabled={durationUnit === "HALF_DAY"}
											minDate={parseDateString(
												isDateAfter(getTodayDate(), startDate)
													? getTodayDate()
													: startDate,
											)}
											isDateDisabled={isEndDateDisabled}
											className={
												errors.endDate
													? "border-red-300 focus:border-red-500"
													: ""
											}
										/>
										{durationUnit === "HALF_DAY" && !errors.endDate && (
											<p className="mt-1 text-xs text-gray-500">
												End date is fixed to the selected start date.
											</p>
										)}
										{durationUnit === "FULL_DAY" &&
											!errors.endDate &&
											selectedLeaveType &&
											shouldBlockNonWorkingHolidays && (
												<p className="mt-1 text-xs text-gray-500">
													End dates that cross a non-working holiday or off
													day are disabled.
												</p>
											)}
										{errors.endDate && (
											<p className="mt-1 text-sm text-red-600">
												{errors.endDate}
											</p>
										)}
									</div>
								</div>

								{/* Visualise on Calendar + Total Estimate */}
								{selectedLeaveType && !hideCalendarPreview && (
									<div className="mt-3 flex items-center justify-between gap-3 text-sm bg-white/70 p-2.5 rounded-md border border-gray-200/70">
										<Link
											to={buildCalendarViewDeepLink(
												selectedLeaveType,
												startDate,
												endDate,
												"employee-requests-leave",
												"create",
											)}
											className="text-sm text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1 transition-colors">
											<Calendar className="w-3.5 h-3.5" />
											Preview on Calendar
										</Link>
										<div className="flex items-center gap-1.5">
											<Clock className="w-4 h-4 text-gray-400" />
											<span className="text-gray-600">Estimate:</span>
											<span className="font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded text-xs border border-red-100">
												{calculatedDays > 0
													? `${calculatedDays} ${calculatedDays === 1 ? "Day" : "Days"}`
													: "0 Days"}
											</span>
										</div>
									</div>
								)}
							</div>

							{/* Reason / Notes */}
							<div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4">
								<div className="space-y-1">
									<label className="block text-sm font-medium text-gray-900">
										Reason for Leave
									</label>
									<p className="text-xs text-gray-500">
										Add enough context so approvers can review quickly.
									</p>
								</div>
								<Textarea
									value={description}
									onChange={(e) => setDescription(e.target.value)}
									placeholder="E.g., Taking time off for my sister's wedding..."
									maxLength={200}
									className={`w-full px-3 py-2.5 border ${
										errors.description
											? "border-red-300 focus:border-red-500"
											: "border-gray-300"
									} rounded-md bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 min-h-[100px] resize-none`}
								/>
								<div className="flex items-center justify-between mt-1.5">
									{errors.description ? (
										<p className="text-sm text-red-600">{errors.description}</p>
									) : (
										<div />
									)}
									<p className="text-xs text-gray-500">
										{description.length}/200 characters
									</p>
								</div>
							</div>

							{/* Manager Approval Info */}
							<div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
								<CircleAlert className="w-4 h-4" />
								<span>
									{hasAssignedApprover ? (
										<>
											Your request will be reviewed by your manager,{" "}
											<strong>{managerName || "your assigned manager"}</strong>
											. You will be notified once it&apos;s approved.
										</>
									) : (
										<>
											You do not have a reporting manager assigned yet. Request
											submission is disabled until HR assigns your reporting
											manager.
										</>
									)}
								</span>
							</div>

							{/* Actions */}
							<div className="flex justify-end gap-3 border-t border-gray-100 pt-4 lg:col-span-2">
								<Button
									type="button"
									variant="outline"
									onClick={onClose}
									disabled={isPending}>
									Cancel
								</Button>
								<Button
									type="submit"
									className="bg-primary hover:bg-primary/90 text-white px-6"
									disabled={isSubmitDisabled}>
									{isPending ? "Submitting..." : "Submit Request"}
								</Button>
							</div>
						</form>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
