import type { Employee } from "~/services/employees.service";
import type {
	EmployeeSchedulesResponse,
	ScheduleOverrideShiftSnapshot,
} from "~/services/schedules.service";
import {
	Calendar,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Clock,
	Layers3,
	Loader2,
	Pencil,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router";
import { Button } from "~/components/atoms/Button";
import { ChangeWeeklyScheduleModal } from "~/components/organisms/employee-detail/change-weekly-schedule-modal";
import { useAuth } from "~/lib/hooks/use-auth";
import {
	useEmployeeScheduleCalendar,
	useEmployeeSchedules,
	useScheduleOverrides,
} from "~/lib/hooks";

interface ScheduleTabProps {
	employee: Employee;
}

type ScheduleAssignment = NonNullable<EmployeeSchedulesResponse["schedules"]>[number];

const toIsoDate = (value: Date) => {
	const year = value.getFullYear();
	const month = String(value.getMonth() + 1).padStart(2, "0");
	const day = String(value.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
};

const toStartOfWeekMonday = (baseDate: Date) => {
	const date = new Date(baseDate);
	const day = date.getDay();
	const diff = day === 0 ? -6 : 1 - day;
	date.setDate(date.getDate() + diff);
	date.setHours(0, 0, 0, 0);
	return date;
};

const addDays = (baseDate: Date, days: number) => {
	const next = new Date(baseDate);
	next.setDate(next.getDate() + days);
	return next;
};

const formatDateLabel = (value: string) =>
	new Date(value).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});

const formatDateLabelSafe = (value: string) => {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
	return formatDateLabel(value);
};

const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short" });

const formatTime12h = (value?: string | null) => {
	if (!value) return "-";
	const [hourStr, minuteStr] = value.split(":");
	const hours = Number(hourStr);
	const minutes = Number(minuteStr);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return value;
	const period = hours >= 12 ? "PM" : "AM";
	const normalizedHour = hours % 12 === 0 ? 12 : hours % 12;
	return `${String(normalizedHour).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${period}`;
};

type ScheduleTimeSlot = {
	type?: string | null;
	label?: string | null;
	startTime?: string | null;
	endTime?: string | null;
};

const toMinutes = (value?: string | null) => {
	if (!value) return null;
	const [hourStr, minuteStr] = value.split(":");
	const hours = Number(hourStr);
	const minutes = Number(minuteStr);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
	return hours * 60 + minutes;
};

const normalizeOrderedSlots = (timeSlots?: ScheduleTimeSlot[] | null) => {
	let previousEnd: number | null = null;
	return (Array.isArray(timeSlots) ? timeSlots : [])
		.map((slot) => {
			const start = toMinutes(slot.startTime);
			const end = toMinutes(slot.endTime);
			if (start === null || end === null || !slot.startTime || !slot.endTime) {
				return null;
			}
			let absoluteStart = start;
			let absoluteEnd = end <= start ? end + 24 * 60 : end;
			if (previousEnd !== null) {
				while (absoluteStart < previousEnd) {
					absoluteStart += 24 * 60;
					absoluteEnd += 24 * 60;
				}
			}
			previousEnd = absoluteEnd;
			return {
				...slot,
				type: String(slot.type || "").toLowerCase(),
				startTime: slot.startTime,
				endTime: slot.endTime,
				absoluteStart,
				absoluteEnd,
			};
		})
		.filter(Boolean) as Array<
		ScheduleTimeSlot & {
			type: string;
			startTime: string;
			endTime: string;
			absoluteStart: number;
			absoluteEnd: number;
		}
	>;
};

const buildScheduleSlotDisplay = (timeSlots?: ScheduleTimeSlot[] | null) => {
	const orderedSlots = normalizeOrderedSlots(timeSlots);
	const breaks = orderedSlots
		.filter((slot) => slot.type === "break")
		.map((slot) => `${slot.startTime} to ${slot.endTime}`);
	const workWindows: Array<{
		startTime: string;
		endTime: string;
		coverageEnd: number;
		slots: Array<(typeof orderedSlots)[number]>;
	}> = [];

	for (const slot of orderedSlots) {
		const current = workWindows[workWindows.length - 1];
		if (slot.type === "break") {
			if (current && slot.absoluteStart <= current.coverageEnd) {
				current.coverageEnd = Math.max(current.coverageEnd, slot.absoluteEnd);
				current.slots.push(slot);
			}
			continue;
		}
		if (slot.type !== "work") continue;

		if (!current || slot.absoluteStart > current.coverageEnd) {
			workWindows.push({
				startTime: slot.startTime,
				endTime: slot.endTime,
				coverageEnd: slot.absoluteEnd,
				slots: [slot],
			});
			continue;
		}

		current.endTime = slot.endTime;
		current.coverageEnd = Math.max(current.coverageEnd, slot.absoluteEnd);
		current.slots.push(slot);
	}

	const workText = workWindows
		.map((window) => `${window.startTime} to ${window.endTime}`)
		.join(", ");
	const breaksText = breaks.join(", ");
	const countSummary =
		workWindows.length > 1 || breaks.length > 1
			? `${workWindows.length} work windows, ${breaks.length} breaks`
			: "";
	const summary = countSummary
		? countSummary
		: workText && breaksText
			? `${workWindows.length > 1 ? "Work windows" : "Work"} ${workText}; ${breaks.length > 1 ? "breaks" : "break"} ${breaksText}`
			: workText
				? `${workWindows.length > 1 ? "Work windows" : "Work"} ${workText}`
				: breaksText
					? `${breaks.length > 1 ? "Breaks" : "Break"} ${breaksText}`
					: "";

	return { workWindows, breaks, workText, breaksText, summary };
};

const formatEmployeeName = (employee?: {
	employeeId?: string;
	person?: { personalInfo?: { firstName?: string; lastName?: string } };
} | null) => {
	const firstName = employee?.person?.personalInfo?.firstName || "";
	const lastName = employee?.person?.personalInfo?.lastName || "";
	const fullName = `${firstName} ${lastName}`.trim();
	if (fullName && employee?.employeeId) return `${fullName} (${employee.employeeId})`;
	return fullName || employee?.employeeId || null;
};

const formatShiftTimeRange = (shiftType?: {
	isOff?: boolean | null;
	timeSlots?: Array<{ type?: string | null; startTime?: string | null; endTime?: string | null }>;
} | null) => {
	if (!shiftType) return null;
	if (shiftType.isOff) return "Off Day";
	const slots = Array.isArray(shiftType.timeSlots) ? shiftType.timeSlots : [];
	const workSlots = slots.filter((slot) => String(slot.type || "").toUpperCase() === "WORK");
	const displaySlots = workSlots.length > 0 ? workSlots : slots;
	if (displaySlots.length === 0) return null;
	return displaySlots
		.map((slot) => `${formatTime12h(slot.startTime)} - ${formatTime12h(slot.endTime)}`)
		.join(" + ");
};

const formatScheduleSnapshotTimeRange = (shift?: ScheduleOverrideShiftSnapshot | null) => {
	if (!shift) return null;
	if (shift.isOff) return "Off Day";
	const slots = Array.isArray(shift.timeSlots) ? shift.timeSlots : [];
	const workSlots = slots.filter((slot) => String(slot.type || "").toUpperCase() === "WORK");
	const displaySlots = workSlots.length > 0 ? workSlots : slots;
	if (displaySlots.length > 0) {
		return displaySlots
			.map((slot) => `${formatTime12h(slot.startTime)} - ${formatTime12h(slot.endTime)}`)
			.join(" + ");
	}
	if (shift.startTime || shift.endTime) {
		return `${formatTime12h(shift.startTime)} - ${formatTime12h(shift.endTime)}`;
	}
	return null;
};

const getScheduleSnapshotName = (
	shift?: ScheduleOverrideShiftSnapshot | null,
	fallback = "Unassigned",
) => {
	if (!shift) return fallback;
	if (shift.isOff) return "Off Day";
	return (
		String(shift.shiftTypeName || "").trim() ||
		String(shift.shiftTypeCode || "").trim() ||
		String(shift.scheduleTemplateName || "").trim() ||
		formatScheduleSnapshotTimeRange(shift) ||
		fallback
	);
};

const buildShiftTypeSnapshot = (shiftType?: any): ScheduleOverrideShiftSnapshot | null => {
	if (!shiftType) return null;
	return {
		source: shiftType.source || "override",
		shiftTypeId: shiftType.shiftTypeId || shiftType.id || null,
		shiftTypeCode: shiftType.shiftTypeCode || shiftType.code || null,
		shiftTypeName: shiftType.shiftTypeName || shiftType.name || null,
		isOff: Boolean(shiftType.isOff),
		isOvernight: Boolean(shiftType.isOvernight),
		breakMinutes: shiftType.breakMinutes ?? null,
		startTime: shiftType.startTime || null,
		endTime: shiftType.endTime || null,
		timeSlots: Array.isArray(shiftType.timeSlots) ? shiftType.timeSlots : [],
	};
};

const getOverrideDisplayName = (override: any) => {
	const snapshot =
		override?.effectiveShift ||
		buildShiftTypeSnapshot(override?.shiftSnapshot) ||
		buildShiftTypeSnapshot(override?.shiftType);
	const snapshotName = getScheduleSnapshotName(snapshot, "");
	if (snapshotName) return snapshotName;
	const shiftType = override?.shiftType;
	const name = String(shiftType?.name || "").trim();
	if (name) return name;
	const code = String(shiftType?.code || "").trim();
	if (code) return code;
	return formatShiftTimeRange(shiftType) || "Schedule Override";
};

const getAssignmentStatusTone = (status?: string | null) => {
	switch (String(status || "").toUpperCase()) {
		case "ACTIVE":
			return "border-emerald-200 bg-emerald-50 text-emerald-700";
		case "SUPERSEDED":
			return "border-slate-200 bg-slate-100 text-slate-700";
		case "SCHEDULED":
			return "border-orange-200 bg-orange-50 text-orange-700";
		default:
			return "border-gray-200 bg-gray-100 text-gray-700";
	}
};

const getAssignmentSourceTone = (source?: string | null) => {
	switch (String(source || "").toLowerCase()) {
		case "template":
			return "border-sky-200 bg-sky-50 text-sky-700";
		case "manual":
			return "border-violet-200 bg-violet-50 text-violet-700";
		default:
			return "border-gray-200 bg-gray-100 text-gray-700";
	}
};

const getAssignmentSourceLabel = (assignment: ScheduleAssignment) => {
	if (String(assignment.source || "").toLowerCase() === "manual") return "Manual Shift";
	return "Default Schedule";
};

const normalizeScheduleLabel = (value?: string | null) => {
	const text = String(value || "").trim();
	if (!text) return "";
	if (/^unknown(?:\s+schedule)?$/i.test(text)) return "";
	return text;
};

const getEmbeddedScheduleDisplay = (employee?: Employee | null) => {
	const embedded = employee?.embeddedSchedule;
	const firstShift = Array.isArray(embedded?.pattern)
		? embedded.pattern.find((day) => day?.shiftSnapshot && !day.shiftSnapshot.isOff)
				?.shiftSnapshot
		: null;
	if (!firstShift) return null;
	const slotDisplay = buildScheduleSlotDisplay(firstShift.timeSlots);
	if (!slotDisplay.summary) return null;
	const templateName = normalizeScheduleLabel(embedded?.templateName);
	const prefixMatch = templateName.match(/^(.*?)(?:\s+\d{1,2}:\d{2}\s+to\b|,\s*breaks?\b)/i);
	const prefix = (prefixMatch?.[1] || templateName.split(",")[0] || "Schedule").trim();
	return {
		code: embedded?.templateCode || null,
		label: `${prefix}: ${slotDisplay.summary}`,
	};
};

const getAssignmentDisplayName = (assignment: ScheduleAssignment, employee?: Employee | null) => {
	const embeddedDisplay = getEmbeddedScheduleDisplay(employee);
	const assignmentCode = getAssignmentDisplayCode(assignment);
	if (embeddedDisplay?.label && embeddedDisplay.code === assignmentCode) {
		return embeddedDisplay.label;
	}
	return (
		normalizeScheduleLabel(assignment.scheduleName) ||
		normalizeScheduleLabel(assignment.scheduleTemplate?.name) ||
		getAssignmentSourceLabel(assignment)
	);
};

const getAssignmentDisplayCode = (assignment: ScheduleAssignment) =>
	normalizeScheduleLabel(assignment.scheduleCode) ||
	normalizeScheduleLabel(assignment.scheduleTemplate?.code) ||
	getAssignmentSourceLabel(assignment);

const getVisibleAssignmentReason = (reason?: string | null) => {
	const normalizedReason = typeof reason === "string" ? reason.trim() : "";
	if (!normalizedReason) return null;
	if (
		normalizedReason === "employee_form_template_pattern" ||
		normalizedReason === "employee_form_manual"
	) {
		return null;
	}
	return normalizedReason;
};

const buildFallbackAssignmentsFromEmployee = (employee: Employee): ScheduleAssignment[] => {
	if (Array.isArray(employee.schedules) && employee.schedules.length > 0) {
		return employee.schedules.map((assignment: any, index: number) => ({
			id:
				String(assignment.id || assignment.entryId || "").trim() ||
				`${employee.id}:embedded:${index}`,
			scheduleCode: assignment.scheduleCode || assignment.scheduleTemplate?.code || "UNKNOWN",
			scheduleName:
				assignment.scheduleName || assignment.scheduleTemplate?.name || "Unknown Schedule",
			startDate:
				assignment.startDate ||
				assignment.effectiveDate ||
				employee.embeddedSchedule?.effectiveStartDate ||
				employee.employmentStartDate ||
				employee.employmentHireDate,
			endDate: assignment.endDate || null,
			status: assignment.status || (assignment.isActive ? "ACTIVE" : "SCHEDULED"),
			source:
				assignment.source ||
				(assignment.scheduleTemplateId || assignment.scheduleId ? "template" : "manual"),
			reason: assignment.reason || employee.embeddedSchedule?.reason || null,
			scheduleTemplateId: assignment.scheduleTemplateId || assignment.scheduleId || null,
			shiftTypeId: assignment.shiftTypeId || null,
			shiftSnapshot: assignment.shiftSnapshot || null,
			metadata: assignment.metadata || null,
			department: assignment.department || employee.department || null,
			scheduleTemplate: assignment.scheduleTemplate || null,
		}));
	}

	if (!employee.embeddedSchedule) return [];

	return [
		{
			id: `${employee.id}:embedded`,
			scheduleCode: employee.embeddedSchedule.templateCode || "MANUAL",
			scheduleName: employee.embeddedSchedule.templateName || "Manual Input",
			startDate:
				employee.embeddedSchedule.effectiveStartDate ||
				employee.embeddedSchedule.assignedAt ||
				employee.employmentStartDate ||
				employee.employmentHireDate,
			endDate: null,
			status: "SCHEDULED",
			source: employee.embeddedSchedule.templateId ? "template" : "manual",
			reason: employee.embeddedSchedule.reason || null,
			scheduleTemplateId: employee.embeddedSchedule.templateId || null,
			shiftTypeId:
				employee.embeddedSchedule.pattern?.find((item) => item?.shiftTypeId)?.shiftTypeId ||
				null,
			shiftSnapshot:
				employee.embeddedSchedule.pattern?.find((item) => item?.shiftSnapshot)
					?.shiftSnapshot || null,
			metadata: {
				version: employee.embeddedSchedule.version || null,
				source: "employee_payload_fallback",
			},
			department: employee.department || null,
			scheduleTemplate: employee.embeddedSchedule.templateId
				? {
						id: employee.embeddedSchedule.templateId,
						name: employee.embeddedSchedule.templateName || "Unknown Schedule",
						code: employee.embeddedSchedule.templateCode || "UNKNOWN",
						cycleDays: employee.embeddedSchedule.cycleDays,
						graceLateMinutes: Number(employee.embeddedSchedule.graceLateMinutes ?? 0),
						graceEarlyOutMinutes: Number(
							employee.embeddedSchedule.graceEarlyOutMinutes ?? 0,
						),
						pattern: employee.embeddedSchedule.pattern || [],
						totalHour: 0,
						totalDay: 0,
						organizationId: employee.organizationId,
						isActive: true,
						isDeleted: false,
						createdAt: "",
						updatedAt: "",
					}
				: null,
		},
	];
};

const SCHEDULE_EDIT_ROLES = new Set([
	"hris-hr-manager",
	"hris-hr-user",
	"hris-employee-manager",
	"admin",
	"hris-admin",
]);

const employeeDisplayName = (employee?: Employee | null) => {
	const firstName = employee?.person?.personalInfo?.firstName || "";
	const lastName = employee?.person?.personalInfo?.lastName || "";
	return `${firstName} ${lastName}`.trim() || employee?.employeeId || "";
};

export function ScheduleTab({ employee }: ScheduleTabProps) {
	const { user } = useAuth();
	const location = useLocation();
	const [weekOffset, setWeekOffset] = useState(0);
	const [expandedOverrideId, setExpandedOverrideId] = useState<string | null>(null);
	const [changeScheduleOpen, setChangeScheduleOpen] = useState(false);
	const canChangeSchedule = SCHEDULE_EDIT_ROLES.has(String(user?.role || ""));
	const employeeEditHref = location.pathname.startsWith("/admin/configuration/employees")
		? `/admin/configuration/employees/${employee.id}/edit`
		: `/hr/employees/${employee.id}/edit`;
	const weekStartDate = useMemo(() => {
		const start = toStartOfWeekMonday(new Date());
		return addDays(start, weekOffset * 7);
	}, [weekOffset]);
	const weekEndDate = useMemo(() => addDays(weekStartDate, 6), [weekStartDate]);
	const weekStartIso = toIsoDate(weekStartDate);
	const weekEndIso = toIsoDate(weekEndDate);

	const { data: assignmentsResponse } = useEmployeeSchedules(employee.id, {
		enabled: !!employee.id,
	});
	const {
		data: calendarResponse,
		error: calendarError,
		isLoading: isCalendarLoading,
		isFetching: isCalendarFetching,
	} = useEmployeeScheduleCalendar(
		{
			employeeId: employee.id,
			start: weekStartIso,
			end: weekEndIso,
		},
		{ enabled: !!employee.id },
	);
	const { data: overridesResponse } = useScheduleOverrides(
		{
			page: 1,
			limit: 1000,
			document: true,
			count: true,
			sort: "date",
			order: "desc",
			filter: `employeeId:${employee.id}`,
			fields: [
				"employeeId",
				"id",
				"organizationId",
				"date",
				"shiftTypeId",
				"shiftSnapshot",
				"reason",
				"createdByEmployeeId",
				"createdAt",
				"updatedAt",
				"shiftType.name",
				"shiftType.code",
				"shiftType.isOvernight",
				"shiftType.isOff",
				"shiftType.timeSlots",
				"createdByEmployee.employeeId",
				"createdByEmployee.person.personalInfo.firstName",
				"createdByEmployee.person.personalInfo.lastName",
			],
		},
		{ enabled: true },
	);

	const fallbackAssignments = useMemo(
		() => buildFallbackAssignmentsFromEmployee(employee),
		[employee],
	);
	const assignments = useMemo(
		() =>
			[
				...((assignmentsResponse?.schedules || []).length > 0
					? assignmentsResponse?.schedules || []
					: fallbackAssignments),
			].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()),
		[assignmentsResponse?.schedules, fallbackAssignments],
	);
	const activeAssignment =
		assignments.find((assignment) => {
			const start = new Date(assignment.startDate).getTime();
			const end = assignment.endDate
				? new Date(assignment.endDate).getTime()
				: Number.POSITIVE_INFINITY;
			const now = Date.now();
			return start <= now && end >= now;
		}) || assignments[0];

	const daysByDate = new Map(
		(calendarResponse?.days || []).map((day) => [String(day.date).slice(0, 10), day]),
	);
	const weekDays = Array.from({ length: 7 }).map((_, index) => {
		const date = addDays(weekStartDate, index);
		const iso = toIsoDate(date);
		const dayPayload = daysByDate.get(iso);
		return {
			date: iso,
			weekday: weekdayFormatter.format(date).toUpperCase(),
			shift: dayPayload?.shift || null,
		};
	});

	const formatShiftSummary = (day: (typeof weekDays)[number]) => {
		if (!day.shift) return "No shift";
		if (day.shift.isOff) return "Off Day";
		const slotDisplay = buildScheduleSlotDisplay(day.shift.timeSlots);
		if (slotDisplay.workWindows.length > 0) {
			return slotDisplay.workWindows
				.map(
					(window) =>
						`${formatTime12h(window.startTime)} - ${formatTime12h(window.endTime)}`,
				)
				.join(" + ");
		}
		return `${formatTime12h(day.shift.startTime)} - ${formatTime12h(day.shift.endTime)}`;
	};

	const formatSlotSummary = (day: (typeof weekDays)[number]) => {
		if (!day.shift || !Array.isArray(day.shift.timeSlots) || day.shift.timeSlots.length === 0) {
			return day.shift?.isOff ? "Off Day" : "No slots";
		}

		return day.shift.timeSlots
			.map((slot) => {
				const type = String(slot.type || "slot").toUpperCase();
				return `${type} ${formatTime12h(slot.startTime)} to ${formatTime12h(slot.endTime)}`;
			})
			.join(" | ");
	};

	const getSlotTone = (slotType: string) => {
		if (slotType === "BREAK") return "border-amber-200 bg-amber-50 text-amber-800";
		if (slotType === "WORK") return "border-orange-200 bg-orange-50 text-orange-700";
		return "border-gray-200 bg-gray-100 text-gray-700";
	};

	const renderScheduleSlotGroups = (day: (typeof weekDays)[number]) => {
		if (!day.shift || !Array.isArray(day.shift.timeSlots) || day.shift.timeSlots.length === 0) {
			return (
				<span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
					{formatSlotSummary(day)}
				</span>
			);
		}

		const slotDisplay = buildScheduleSlotDisplay(day.shift.timeSlots);
		if (slotDisplay.workWindows.length <= 1) {
			return day.shift.timeSlots.map((slot, index) => {
				const type = String(slot.type || "slot").toUpperCase();
				return (
					<span
						key={`${day.date}-slot-${index}`}
						className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getSlotTone(
							type,
						)}`}>
						{type} {formatTime12h(slot.startTime)} to {formatTime12h(slot.endTime)}
					</span>
				);
			});
		}

		return (
			<div className="flex min-w-0 flex-col gap-1.5">
				{slotDisplay.workWindows.map((window, windowIndex) => (
					<div
						key={`${day.date}-window-${windowIndex}`}
						className="flex min-w-0 flex-wrap items-center gap-1.5">
						<span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
							Window {windowIndex + 1} {formatTime12h(window.startTime)} to{" "}
							{formatTime12h(window.endTime)}
						</span>
						{window.slots.map((slot, slotIndex) => {
							const type = String(slot.type || "slot").toUpperCase();
							return (
								<span
									key={`${day.date}-window-${windowIndex}-slot-${slotIndex}`}
									className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getSlotTone(
										type,
									)}`}>
									{type} {formatTime12h(slot.startTime)} to {formatTime12h(slot.endTime)}
								</span>
							);
						})}
					</div>
				))}
			</div>
		);
	};

	const weekOverrides = (overridesResponse?.scheduleOverrides || [])
		.filter((override) => override.employeeId === employee.id)
		.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
		.filter((override) => {
			const date = String(override.date).slice(0, 10);
			return date >= weekStartIso && date <= weekEndIso;
		});

	const overrides = (
		weekOverrides.length > 0
			? weekOverrides
			: (overridesResponse?.scheduleOverrides || [])
					.filter((override) => override.employeeId === employee.id)
					.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
	).slice(0, 5);

	const isWeekLoading = isCalendarLoading || isCalendarFetching;

	return (
		<div className="space-y-8">
			{canChangeSchedule ? (
				<ChangeWeeklyScheduleModal
					open={changeScheduleOpen}
					onOpenChange={setChangeScheduleOpen}
					employee={employee}
					employeeName={employeeDisplayName(employee)}
				/>
			) : null}
			<section>
				<div className="mb-4 flex flex-wrap items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100">
							<Layers3 className="h-4 w-4 text-orange-600" />
						</div>
						<h3 className="text-base font-semibold text-gray-900">Active Assignment</h3>
					</div>
					{canChangeSchedule ? (
						<div className="flex flex-wrap items-center gap-2">
							<Button
								type="button"
								size="sm"
								onClick={() => setChangeScheduleOpen(true)}
								data-testid="change-weekly-hours">
								<Pencil className="h-4 w-4" />
								Change schedule
							</Button>
							<Button type="button" size="sm" variant="outline" asChild>
								<Link to={employeeEditHref}>Full editor</Link>
							</Button>
						</div>
					) : null}
				</div>
				<div className="rounded-xl border border-gray-200 bg-white p-4">
					{activeAssignment ? (
						<div className="space-y-2">
							<p className="text-lg font-semibold text-gray-900">
								{getAssignmentDisplayName(activeAssignment, employee)}
							</p>
							<div className="flex flex-wrap gap-2">
								<span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-700">
									{getAssignmentDisplayCode(activeAssignment)}
								</span>
								{activeAssignment.status ? (
									<span
										className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getAssignmentStatusTone(activeAssignment.status)}`}>
										{activeAssignment.status}
									</span>
								) : null}
								{activeAssignment.source ? (
									<span
										className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getAssignmentSourceTone(activeAssignment.source)}`}>
										{getAssignmentSourceLabel(activeAssignment)}
									</span>
								) : null}
							</div>
							<p className="text-sm text-gray-700">
								Start: {formatDateLabelSafe(String(activeAssignment.startDate))}
							</p>
							<p className="text-sm text-gray-700">
								End:{" "}
								{activeAssignment.endDate
									? formatDateLabelSafe(String(activeAssignment.endDate))
									: "Open-ended"}
							</p>
							{getVisibleAssignmentReason(activeAssignment.reason) ? (
								<p className="text-sm text-gray-600">
									Reason: {getVisibleAssignmentReason(activeAssignment.reason)}
								</p>
							) : null}
						</div>
					) : (
						<p className="text-sm text-gray-500">No active schedule assignment yet.</p>
					)}
				</div>
			</section>

			<section>
				<div className="mb-4 flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100">
						<Clock className="h-4 w-4 text-orange-600" />
					</div>
					<h3 className="text-base font-semibold text-gray-900">Weekly Schedule</h3>
				</div>
				<div className="rounded-xl border border-gray-200 bg-white p-4">
					<div className="mb-4 flex flex-wrap items-center justify-between gap-2">
						<div className="text-sm font-medium text-gray-700">
							{formatDateLabel(weekStartIso)} - {formatDateLabel(weekEndIso)}
						</div>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() => setWeekOffset((prev) => prev - 1)}
								disabled={isWeekLoading}
								className="inline-flex items-center gap-1 rounded-md border border-orange-200 px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60">
								<ChevronLeft className="h-3.5 w-3.5" />
								Prev Week
							</button>
							<button
								type="button"
								onClick={() => setWeekOffset(0)}
								disabled={isWeekLoading}
								className="rounded-md border border-orange-300 bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60">
								Current
							</button>
							<button
								type="button"
								onClick={() => setWeekOffset((prev) => prev + 1)}
								disabled={isWeekLoading}
								className="inline-flex items-center gap-1 rounded-md border border-orange-200 px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60">
								Next Week
								<ChevronRight className="h-3.5 w-3.5" />
							</button>
						</div>
					</div>

					{isWeekLoading ? (
						<div className="mb-3 inline-flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700">
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
							Loading week schedule...
						</div>
					) : null}

					{calendarError ? (
						<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
							Failed to load resolved weekly schedule. Assignment timeline is still
							available below.
						</div>
					) : isWeekLoading ? (
						<div className="space-y-2">
							{Array.from({ length: 7 }).map((_, index) => (
								<div
									key={`week-loading-${index}`}
									className="h-11 animate-pulse rounded-lg border border-orange-100 bg-orange-50"
								/>
							))}
						</div>
					) : weekDays.every((day) => !day.shift) ? (
						<p className="text-sm text-gray-500">No resolved shifts this week.</p>
					) : (
						<div className="space-y-2">
							{weekDays.map((day) => (
								<div
									key={day.date}
									className={`rounded-xl border px-3 py-2 ${
										day.shift?.isOff
											? "border-amber-200 bg-amber-50"
											: "border-orange-100 bg-white"
									}`}>
									<div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
										<span className="min-w-[48px] text-base font-semibold tracking-wide text-orange-700">
											{day.weekday}
										</span>
										<span className="text-xs font-medium text-gray-600">
											{formatDateLabel(day.date)}
										</span>
										<span className="font-semibold text-gray-900">
											{day.shift
												? buildScheduleSlotDisplay(day.shift.timeSlots).summary ||
													day.shift.shiftTypeName ||
													day.shift.shiftTypeCode ||
													"No shift"
												: "No shift"}
										</span>
										<span className="text-xs text-gray-700">
											{formatShiftSummary(day)}
										</span>
										<span className="text-xs text-gray-700">
											Break {day.shift?.breakMinutes ?? 0}m
										</span>
										<div className="flex min-w-0 flex-wrap gap-1.5">
											{renderScheduleSlotGroups(day)}
										</div>
										<span className="ml-auto flex flex-wrap gap-1.5">
											<span
												className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
													day.shift?.isOff
														? "border-amber-200 bg-amber-100 text-amber-800"
														: "border-orange-200 bg-orange-50 text-orange-700"
												}`}>
												{day.shift?.isOff ? "Off Day" : "Work Day"}
											</span>
											<span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
												{day.shift?.isOvernight ? "Overnight" : "Day Shift"}
											</span>
										</span>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</section>

			<section>
				<div className="mb-4 flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100">
						<Calendar className="h-4 w-4 text-orange-600" />
					</div>
					<h3 className="text-base font-semibold text-gray-900">Assignment Timeline</h3>
				</div>
				{assignments.length === 0 ? (
					<div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500">
						No schedule assignments yet.
					</div>
				) : (
					<div className="space-y-3">
						{assignments.map((assignment) => (
							<div
								key={assignment.id}
								className="rounded-xl border border-gray-200 bg-white p-4">
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="space-y-2">
										<p className="text-sm font-semibold text-gray-900">
											{getAssignmentDisplayName(assignment)}
										</p>
										<div className="flex flex-wrap gap-2">
											<span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-700">
												{getAssignmentDisplayCode(assignment)}
											</span>
											{assignment.status ? (
												<span
													className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getAssignmentStatusTone(assignment.status)}`}>
													{assignment.status}
												</span>
											) : null}
											{assignment.source ? (
												<span
													className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getAssignmentSourceTone(assignment.source)}`}>
													{getAssignmentSourceLabel(assignment)}
												</span>
											) : null}
										</div>
									</div>
									<div className="min-w-[160px] text-right text-xs text-gray-500">
										<p>
											Start:{" "}
											{formatDateLabelSafe(String(assignment.startDate))}
										</p>
										<p className="mt-1">
											End:{" "}
											{assignment.endDate
												? formatDateLabelSafe(String(assignment.endDate))
												: "Open-ended"}
										</p>
									</div>
								</div>
								<div className="mt-3 grid gap-2 text-xs text-gray-600 md:grid-cols-2">
									{assignment.department?.name ? (
										<p>Department: {assignment.department.name}</p>
									) : null}
									{getVisibleAssignmentReason(assignment.reason) ? (
										<p>Reason: {assignment.reason}</p>
									) : null}
								</div>
							</div>
						))}
					</div>
				)}
			</section>

			<section>
				<div className="mb-4 flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100">
						<Calendar className="h-4 w-4 text-orange-600" />
					</div>
					<h3 className="text-base font-semibold text-gray-900">Recent Overrides</h3>
				</div>
				{overrides.length === 0 ? (
					<div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500">
						No recent overrides for this employee.
					</div>
				) : (
					<div className="space-y-3">
						{overrides.map((override) => (
							<div
								key={override.id}
								className="rounded-xl border border-gray-200 bg-white p-4">
								<button
									type="button"
									aria-expanded={expandedOverrideId === override.id}
									onClick={() =>
										setExpandedOverrideId((current) =>
											current === override.id ? null : override.id,
										)
									}
									className="flex w-full items-start justify-between gap-3 text-left">
									<div className="min-w-0">
										<p className="text-sm font-semibold text-gray-900">
											{getOverrideDisplayName(override)}
										</p>
										<div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
											<span>{formatDateLabelSafe(String(override.date))}</span>
											{formatScheduleSnapshotTimeRange(
												override.effectiveShift ||
													buildShiftTypeSnapshot(override.shiftSnapshot) ||
													buildShiftTypeSnapshot(override.shiftType),
											) ||
											formatShiftTimeRange(override.shiftType) ? (
												<span>
													{formatScheduleSnapshotTimeRange(
														override.effectiveShift ||
															buildShiftTypeSnapshot(
																override.shiftSnapshot,
															) ||
															buildShiftTypeSnapshot(override.shiftType),
													) || formatShiftTimeRange(override.shiftType)}
												</span>
											) : null}
											{(
												override.effectiveShift ||
												buildShiftTypeSnapshot(override.shiftSnapshot) ||
												buildShiftTypeSnapshot(override.shiftType)
											)?.isOvernight ? (
												<span>Overnight</span>
											) : null}
										</div>
									</div>
									<span className="mt-0.5 inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600">
										Details
										<ChevronDown
											className={`h-3.5 w-3.5 transition-transform ${
												expandedOverrideId === override.id
													? "rotate-180"
													: ""
											}`}
										/>
									</span>
								</button>
								<div className="mt-2 space-y-1 text-xs text-gray-600">
									<p>
										Reason:{" "}
										{typeof override.reason === "string" &&
										override.reason.trim()
											? override.reason
											: "No reason recorded"}
									</p>
									<p>
										Changed by:{" "}
										{formatEmployeeName(override.createdByEmployee) ||
											(override.createdByEmployeeId
												? `Employee ${override.createdByEmployeeId}`
												: "Not recorded")}
									</p>
								</div>
								{expandedOverrideId === override.id ? (
									<div className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-600">
										<p>
											Changed from{" "}
											<span className="font-semibold text-gray-900">
												{getScheduleSnapshotName(override.previousShift)}
											</span>{" "}
											to{" "}
											<span className="font-semibold text-gray-900">
												{getScheduleSnapshotName(
													override.effectiveShift ||
														buildShiftTypeSnapshot(override.shiftSnapshot) ||
														buildShiftTypeSnapshot(override.shiftType),
													getOverrideDisplayName(override),
												)}
											</span>
											.
										</p>
										<div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-gray-500">
											{formatScheduleSnapshotTimeRange(
												override.previousShift,
											) ? (
												<span>
													From:{" "}
													{formatScheduleSnapshotTimeRange(
														override.previousShift,
													)}
												</span>
											) : null}
											{formatScheduleSnapshotTimeRange(
												override.effectiveShift ||
													buildShiftTypeSnapshot(override.shiftSnapshot) ||
													buildShiftTypeSnapshot(override.shiftType),
											) ? (
												<span>
													Now:{" "}
													{formatScheduleSnapshotTimeRange(
														override.effectiveShift ||
															buildShiftTypeSnapshot(
																override.shiftSnapshot,
															) ||
															buildShiftTypeSnapshot(override.shiftType),
													)}
												</span>
											) : null}
										</div>
									</div>
								) : null}
							</div>
						))}
					</div>
				)}
			</section>
		</div>
	);
}
