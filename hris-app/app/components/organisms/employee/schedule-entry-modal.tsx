import { useEffect, useMemo, useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Modal } from "~/components/atoms/Modal";
import { Button } from "~/components/atoms/Button";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { ShiftSnapshotFormFields } from "~/components/organisms/schedule/ShiftSnapshotFormFields";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { useCreateEmployeeSchedule, useEmployeeSchedules, useScheduleTemplates } from "~/lib/hooks";
import { useEmployee } from "~/lib/hooks/useEmployees";
import { cn } from "~/lib/utils";
import type {
	EmployeeSchedulesResponse,
	ScheduleTemplatePatternItem,
	ShiftTimeSlot,
} from "~/services/schedules.service";
import { toast } from "sonner";

interface ScheduleEntryModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	employeeId: string;
	employeeName?: string;
	initialScheduleSelector?: string;
	allowedSchedules?: Array<{
		id: string;
		code: string;
		name: string;
		cycleDays?: number | null;
		source?: "department_default" | "department_head_created" | "department_head_linked";
	}>;
	defaultStartDate?: string;
	defaultEndDate?: string;
}

const WEEKDAY_HEADERS = ["M", "T", "W", "TH", "F", "S", "SU"] as const;
const MANUAL_DAY_SHIFT_NAME = "Manual Day Shift";
const MANUAL_DAY_SHIFT_CODE = "MANUAL_DAY_8_5";
const MANUAL_DAY_TIME_SLOTS = [
	{ type: "work", label: "Morning Work", startTime: "08:00", endTime: "12:00" },
	{ type: "break", label: "Lunch Break", startTime: "12:00", endTime: "13:00" },
	{ type: "work", label: "Afternoon Work", startTime: "13:00", endTime: "17:00" },
];

const ShiftSnapshotFormSchema = z.object({
	name: z.string().optional().nullable(),
	code: z.string().optional().nullable(),
	isOvernight: z.boolean().optional(),
	isOff: z.boolean().optional(),
	timeSlots: z
		.array(
			z.object({
				type: z.string().min(1),
				label: z.string().optional().nullable(),
				startTime: z.string().min(1),
				endTime: z.string().min(1),
			}),
		)
		.optional(),
});

const EntryFormSchema = z
	.object({
		scheduleSelector: z.string().min(1),
		reason: z.string().optional(),
		shiftTypeId: z.string().optional().nullable(),
		shiftSnapshot: ShiftSnapshotFormSchema.optional().nullable(),
	})
	.superRefine((value, ctx) => {
		if (value.scheduleSelector === "__manual__" && !value.shiftSnapshot) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Manual Input requires shift snapshot details.",
				path: ["shiftSnapshot"],
			});
		}
		if (value.scheduleSelector === "__manual__" && value.shiftSnapshot?.isOff !== true) {
			const workSlots = Array.isArray(value.shiftSnapshot?.timeSlots)
				? value.shiftSnapshot.timeSlots.filter(
						(slot) => String(slot?.type || "work").toLowerCase() === "work",
					)
				: [];
			const hasValidWorkSlot = workSlots.some((slot) => {
				const [startHour, startMinute] = String(slot?.startTime || "").split(":").map(Number);
				const [endHour, endMinute] = String(slot?.endTime || "").split(":").map(Number);
				if (
					!Number.isFinite(startHour) ||
					!Number.isFinite(startMinute) ||
					!Number.isFinite(endHour) ||
					!Number.isFinite(endMinute)
				) {
					return false;
				}
				const start = startHour * 60 + startMinute;
				const end = endHour * 60 + endMinute;
				return end !== start;
			});
			if (!hasValidWorkSlot) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Manual Input needs at least one work slot with different start and end times.",
					path: ["shiftSnapshot", "timeSlots"],
				});
			}
		}
	});

type EntryFormData = z.infer<typeof EntryFormSchema>;
type TimelineEntry = NonNullable<EmployeeSchedulesResponse["schedules"]>[number];
type ManualShiftSnapshot = ReturnType<typeof buildManualShiftSnapshot>;

const buildManualShiftSnapshot = () => ({
	name: MANUAL_DAY_SHIFT_NAME,
	code: MANUAL_DAY_SHIFT_CODE,
	isOvernight: false,
	isOff: false,
	timeSlots: MANUAL_DAY_TIME_SLOTS,
});

const isZeroTimeSlot = (slot: any) =>
	String(slot?.startTime || "") === "00:00" && String(slot?.endTime || "") === "00:00";

const shouldUseManualDayDefault = (snapshot: any) => {
	if (!snapshot || typeof snapshot !== "object" || snapshot.isOff) return false;
	const slots = Array.isArray(snapshot.timeSlots) ? snapshot.timeSlots : [];
	if (!slots.length) return true;
	const workSlots = slots.filter((slot: any) => String(slot?.type || "work").toLowerCase() === "work");
	return workSlots.length > 0 && workSlots.every(isZeroTimeSlot);
};

const normalizeTimeSlots = (timeSlots?: ShiftTimeSlot[] | null) =>
	Array.isArray(timeSlots) && timeSlots.length > 0
		? timeSlots.map((slot) => ({
				type: String(slot?.type || "work"),
				label: slot?.label ? String(slot.label) : "",
				startTime: String(slot?.startTime || "00:00"),
				endTime: String(slot?.endTime || "00:00"),
			}))
		: buildManualShiftSnapshot().timeSlots;

const normalizeShiftSnapshot = (
	snapshot?: EntryFormData["shiftSnapshot"] | TimelineEntry["shiftSnapshot"] | null,
): ManualShiftSnapshot => ({
	...(shouldUseManualDayDefault(snapshot) ? buildManualShiftSnapshot() : {}),
	name: shouldUseManualDayDefault(snapshot)
		? MANUAL_DAY_SHIFT_NAME
		: snapshot?.name || MANUAL_DAY_SHIFT_NAME,
	code: shouldUseManualDayDefault(snapshot)
		? MANUAL_DAY_SHIFT_CODE
		: snapshot?.code || MANUAL_DAY_SHIFT_CODE,
	isOvernight: shouldUseManualDayDefault(snapshot) ? false : Boolean(snapshot?.isOvernight),
	isOff: Boolean(snapshot?.isOff),
	timeSlots: shouldUseManualDayDefault(snapshot)
		? buildManualShiftSnapshot().timeSlots
		: normalizeTimeSlots(snapshot?.timeSlots),
});

const normalizeEmbeddedPattern = (pattern: any, cycleDays: number) => {
	const normalizedCycleDays = [7, 14, 21, 28].includes(Number(cycleDays)) ? Number(cycleDays) : 7;
	const safePattern = Array.isArray(pattern) ? pattern : [];

	return Array.from({ length: normalizedCycleDays }).map((_, index) => {
		const day = index + 1;
		return (
			safePattern.find((item: any) => Number(item?.day) === day) || safePattern[index] || null
		);
	});
};

const getNextMondayUtc = (value: Date = new Date()) => {
	const current = new Date(value);
	current.setUTCHours(0, 0, 0, 0);
	const day = current.getUTCDay();
	const daysUntilNextMonday = day === 1 ? 7 : day === 0 ? 1 : 8 - day;
	current.setUTCDate(current.getUTCDate() + daysUntilNextMonday);
	return current;
};

const toUtcDateOnlyString = (value: Date) => value.toISOString().slice(0, 10);

const formatUtcDateLabel = (value: Date) =>
	new Intl.DateTimeFormat("en-US", {
		timeZone: "UTC",
		month: "short",
		day: "2-digit",
		year: "numeric",
		weekday: "short",
	}).format(value);

const formatSlotTime12h = (value?: string | null) => {
	const text = String(value || "").trim();
	if (!text) return "";
	const [hourStr, minuteStr] = text.split(":");
	const hour = Number(hourStr);
	const minute = Number(minuteStr || "0");
	if (!Number.isFinite(hour) || !Number.isFinite(minute)) return text;
	const period = hour >= 12 ? "PM" : "AM";
	const normalizedHour = hour % 12 === 0 ? 12 : hour % 12;
	return `${normalizedHour}:${String(minute).padStart(2, "0")} ${period}`;
};

const getPrimaryWorkSlot = (timeSlots?: ShiftTimeSlot[] | null) =>
	(Array.isArray(timeSlots) ? timeSlots : []).find(
		(slot) => String(slot?.type || "").toLowerCase() === "work",
	) || (Array.isArray(timeSlots) ? timeSlots[0] : null);

const getTimeRange = (timeSlots?: ShiftTimeSlot[] | null) => {
	const slot = getPrimaryWorkSlot(timeSlots);
	if (!slot?.startTime || !slot?.endTime) return "";
	return `${formatSlotTime12h(slot.startTime)} - ${formatSlotTime12h(slot.endTime)}`;
};

const getSlotStartHour = (timeSlots?: ShiftTimeSlot[] | null) => {
	const slot = getPrimaryWorkSlot(timeSlots);
	const [hourText] = String(slot?.startTime || "").split(":");
	const hour = Number(hourText);
	return Number.isFinite(hour) ? hour : null;
};

const getToneClass = (code: string, startHour: number | null, isOff?: boolean) => {
	if (isOff || code === "OFF") return "border-slate-200 bg-slate-50 text-slate-500";
	if (startHour === null) return "border-slate-200 bg-white text-slate-700";
	if (startHour >= 5 && startHour < 12) {
		return "border-amber-200 bg-amber-50 text-amber-700";
	}
	if (startHour >= 12 && startHour < 18) {
		return "border-sky-200 bg-sky-50 text-sky-700";
	}
	return "border-violet-200 bg-violet-50 text-violet-700";
};

const getPatternCellMeta = (item?: ScheduleTemplatePatternItem | null) => {
	const snapshot = item?.shiftSnapshot;
	const shiftType = item?.shiftType;
	const isOff = Boolean(snapshot?.isOff || shiftType?.isOff);
	const code = isOff
		? "OFF"
		: String(snapshot?.code || shiftType?.code || snapshot?.name || shiftType?.name || "-")
				.trim()
				.toUpperCase()
				.slice(0, 3) || "-";
	const timeSlots = snapshot?.timeSlots || shiftType?.timeSlots || [];
	const timeRange = isOff ? "" : getTimeRange(timeSlots);
	const tone = getToneClass(code, getSlotStartHour(timeSlots), isOff);
	return { code, timeRange, isOff, tone };
};

const sortTimelineEntries = (entries: TimelineEntry[]) =>
	[...entries].sort((left, right) => {
		const leftOpen = left?.endDate ? 0 : 1;
		const rightOpen = right?.endDate ? 0 : 1;
		if (leftOpen !== rightOpen) return rightOpen - leftOpen;
		return String(right?.startDate || "").localeCompare(String(left?.startDate || ""));
	});

export function ScheduleEntryModal({
	open,
	onOpenChange,
	employeeId,
	employeeName,
	initialScheduleSelector,
	allowedSchedules,
}: ScheduleEntryModalProps) {
	const createEmployeeScheduleMutation = useCreateEmployeeSchedule();
	const { data: scheduleTimeline } = useEmployeeSchedules(employeeId, { enabled: !!employeeId });
	const { data: employeeDetail } = useEmployee(employeeId, ["embeddedSchedule"]);
	const { data: templatesData, isLoading: isLoadingTemplates } = useScheduleTemplates(
		{ page: 1, limit: 1000, document: true, count: true },
		{ enabled: !Array.isArray(allowedSchedules) },
	);
	const nextMondayUtc = useMemo(() => getNextMondayUtc(), []);
	const effectiveStartDate = useMemo(() => toUtcDateOnlyString(nextMondayUtc), [nextMondayUtc]);
	const effectiveStartLabel = useMemo(() => formatUtcDateLabel(nextMondayUtc), [nextMondayUtc]);

	const timelineEntries = useMemo(
		(): TimelineEntry[] =>
			sortTimelineEntries(
				Array.isArray(scheduleTimeline?.schedules) ? scheduleTimeline.schedules : [],
			),
		[scheduleTimeline],
	);
	const currentEntry = timelineEntries[0] || null;
	const embeddedSchedule = (employeeDetail as any)?.embeddedSchedule || null;

	const templateList = useMemo(
		() => (Array.isArray(allowedSchedules) ? [] : templatesData?.scheduleTemplates || []),
		[allowedSchedules, templatesData?.scheduleTemplates],
	);
	const templateMap = useMemo(
		() => new Map(templateList.map((template) => [template.id, template])),
		[templateList],
	);

	const defaultManualSnapshot = useMemo(
		() =>
			currentEntry?.shiftSnapshot
				? normalizeShiftSnapshot(currentEntry.shiftSnapshot)
				: buildManualShiftSnapshot(),
		[currentEntry?.shiftSnapshot],
	);
	const resolvedInitialSelector = useMemo(() => {
		if (currentEntry?.shiftSnapshot) return "__manual__";
		if (currentEntry?.source === "manual") return "__manual__";
		if (currentEntry?.scheduleTemplateId) return String(currentEntry.scheduleTemplateId);
		if (initialScheduleSelector) return initialScheduleSelector;
		return "__manual__";
	}, [
		currentEntry?.scheduleTemplateId,
		currentEntry?.shiftSnapshot,
		currentEntry?.source,
		initialScheduleSelector,
	]);
	const manualSnapshotRef = useRef<ManualShiftSnapshot>(defaultManualSnapshot);
	const manualShiftTypeIdRef = useRef(currentEntry?.shiftTypeId || "");

	const form = useForm<EntryFormData, any, EntryFormData>({
		resolver: zodResolver(EntryFormSchema),
		defaultValues: {
			scheduleSelector: resolvedInitialSelector,
			reason: "",
			shiftTypeId: currentEntry?.shiftTypeId || "",
			shiftSnapshot: resolvedInitialSelector === "__manual__" ? defaultManualSnapshot : null,
		},
	});
	const { watch, setValue, handleSubmit, register, control, reset } = form;
	const scheduleSelector = watch("scheduleSelector");
	const selectedTemplate =
		scheduleSelector && scheduleSelector !== "__manual__"
			? templateMap.get(scheduleSelector) || null
			: null;
	const selectedManualSnapshot = watch("shiftSnapshot");
	const normalizedSelectedManualSnapshot = useMemo(
		() => normalizeShiftSnapshot(selectedManualSnapshot),
		[selectedManualSnapshot],
	);
	const selectedManualShiftTypeId = watch("shiftTypeId");

	useEffect(() => {
		if (!open) return;
		manualSnapshotRef.current = defaultManualSnapshot;
		manualShiftTypeIdRef.current = currentEntry?.shiftTypeId || "";
		reset({
			scheduleSelector: resolvedInitialSelector,
			reason: "",
			shiftTypeId: currentEntry?.shiftTypeId || "",
			shiftSnapshot: resolvedInitialSelector === "__manual__" ? defaultManualSnapshot : null,
		});
	}, [currentEntry?.shiftTypeId, defaultManualSnapshot, open, resolvedInitialSelector, reset]);

	useEffect(() => {
		if (scheduleSelector !== "__manual__") return;
		manualSnapshotRef.current = normalizedSelectedManualSnapshot;
		if (typeof selectedManualShiftTypeId === "string") {
			manualShiftTypeIdRef.current = selectedManualShiftTypeId;
		}
	}, [normalizedSelectedManualSnapshot, scheduleSelector, selectedManualShiftTypeId]);

	const templateOptions = useMemo<SelectOption[]>(() => {
		if (Array.isArray(allowedSchedules)) {
			return allowedSchedules.map((schedule) => ({
				value: schedule.id,
				label: `${schedule.name} (${schedule.code})`,
			}));
		}
		return templateList.map((template) => ({
			value: template.id,
			label: `${template.name} (${template.code})`,
		}));
	}, [allowedSchedules, templateList]);

	const scheduleSelectorOptions = [
		{ value: "__manual__", label: "Manual Input" },
		...templateOptions,
	];

	const previewWeeks = useMemo(() => {
		if (!selectedTemplate?.pattern?.length) return [];
		const totalDays = Math.max(7, Number(selectedTemplate.cycleDays || 7));
		const normalizedPattern = Array.from({ length: totalDays }).map((_, index) => {
			return (
				selectedTemplate.pattern.find((item) => Number(item?.day || 0) === index + 1) ||
				null
			);
		});
		return Array.from({ length: Math.ceil(totalDays / 7) }).map((_, weekIndex) =>
			normalizedPattern.slice(weekIndex * 7, weekIndex * 7 + 7),
		);
	}, [selectedTemplate]);
	const embeddedPatternWeeks = useMemo(() => {
		if (!embeddedSchedule?.pattern?.length) return [];
		const normalizedPattern = normalizeEmbeddedPattern(
			embeddedSchedule.pattern,
			Number(embeddedSchedule.cycleDays || 7),
		);
		return Array.from({ length: Math.ceil(normalizedPattern.length / 7) }).map((_, weekIndex) =>
			normalizedPattern.slice(weekIndex * 7, weekIndex * 7 + 7),
		);
	}, [embeddedSchedule]);
	const hasExistingEmbeddedManual = Boolean(currentEntry?.shiftSnapshot || embeddedSchedule);

	const resetAndClose = () => {
		if (createEmployeeScheduleMutation.isPending) return;
		reset({
			scheduleSelector: resolvedInitialSelector,
			reason: "",
			shiftTypeId: currentEntry?.shiftTypeId || "",
			shiftSnapshot: resolvedInitialSelector === "__manual__" ? defaultManualSnapshot : null,
		});
		onOpenChange(false);
	};

	const submitEntry = async (values: EntryFormData) => {
		if (!values.scheduleSelector) {
			toast.error("Please select schedule input mode");
			return;
		}

		try {
			await createEmployeeScheduleMutation.mutateAsync({
				employeeId,
				scheduleTemplateId:
					values.scheduleSelector === "__manual__" ? undefined : values.scheduleSelector,
				shiftSnapshot:
					values.scheduleSelector === "__manual__" ? values.shiftSnapshot || null : null,
				shiftTypeId:
					values.scheduleSelector === "__manual__" ? values.shiftTypeId || null : null,
				startDate: effectiveStartDate,
				...(values.reason?.trim() ? { reason: values.reason.trim() } : {}),
			});
			resetAndClose();
		} catch {
			// toast handled in hook
		}
	};

	return (
		<Modal
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) resetAndClose();
			}}
			title="Set Employee Schedule"
			description={
				employeeName
					? `Assign a schedule template for ${employeeName}`
					: "Assign a schedule template"
			}
			className="max-w-4xl border border-gray-200 bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.12)] sm:p-6">
			<form onSubmit={handleSubmit(submitEntry)} className="space-y-3.5">
				<div>
					<Label htmlFor="schedule-template">Schedule</Label>
					<Select
						options={scheduleSelectorOptions}
						value={scheduleSelector}
						onChange={(value) => {
							const next = value || "__manual__";
							setValue("scheduleSelector", next, { shouldDirty: true });
							if (next === "__manual__") {
								setValue(
									"shiftSnapshot",
									manualSnapshotRef.current || defaultManualSnapshot,
									{
										shouldDirty: true,
									},
								);
								setValue("shiftTypeId", manualShiftTypeIdRef.current || "", {
									shouldDirty: true,
								});
								return;
							}
						}}
						placeholder={
							isLoadingTemplates
								? "Loading templates..."
								: "Manual Input or Select Template"
						}
						className="mt-1 h-10 text-sm"
					/>
				</div>

				{scheduleSelector === "__manual__" ? (
					<div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
						<div className="border-b border-slate-200 bg-slate-50/80 px-3 py-2">
							<div className="flex items-center justify-between gap-3">
								<div>
									<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
										Manual Input
									</p>
									<p className="mt-0.5 text-sm font-medium text-slate-800">
										{hasExistingEmbeddedManual
											? "Current embedded schedule copy for this assignment."
											: "Build one embedded schedule copy for this assignment."}
									</p>
								</div>
								{currentEntry?.shiftSnapshot ? (
									<span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
										Current embedded copy
									</span>
								) : null}
							</div>
							{selectedManualSnapshot?.timeSlots?.length ? (
								<div className="mt-2 flex flex-wrap gap-1.5">
									{normalizedSelectedManualSnapshot.timeSlots.map(
										(slot, index) => (
											<span
												key={`${slot.type}-${slot.startTime}-${index}`}
												className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600">
												{slot.label || slot.type}:{" "}
												{formatSlotTime12h(slot.startTime)} -{" "}
												{formatSlotTime12h(slot.endTime)}
											</span>
										),
									)}
								</div>
							) : null}
						</div>
						{embeddedPatternWeeks.length > 0 ? (
							<div className="space-y-3 border-b border-slate-200 px-3 py-3">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<div>
										<p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
											Embedded Pattern
										</p>
										<p className="mt-0.5 text-xs text-slate-500">
											Current embedded weekly rotation for this employee.
										</p>
									</div>
									<p className="text-[11px] text-slate-400">
										{embeddedSchedule?.cycleDays || 7} day cycle
									</p>
								</div>
								{embeddedPatternWeeks.map((week, weekIndex) => (
									<div
										key={`embedded-week-${weekIndex + 1}`}
										className="space-y-1.5">
										<div className="flex items-center justify-between">
											<p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
												Week {weekIndex + 1}
											</p>
											<p className="text-[11px] text-slate-400">
												Days {weekIndex * 7 + 1}-
												{weekIndex * 7 + week.length}
											</p>
										</div>
										<div className="overflow-x-auto">
											<div className="min-w-[700px] rounded-lg border border-slate-200">
												<div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80">
													{WEEKDAY_HEADERS.map((label) => (
														<div
															key={`embedded-header-${label}`}
															className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
															{label}
														</div>
													))}
												</div>
												<div className="grid grid-cols-7">
													{Array.from({ length: 7 }).map(
														(_, localIndex) => {
															const item = week[localIndex] || null;
															const dayNumber =
																weekIndex * 7 + localIndex + 1;
															const meta = getPatternCellMeta(item);
															return (
																<div
																	key={`embedded-pattern-${weekIndex}-${localIndex}`}
																	className="border-r border-slate-100 last:border-r-0">
																	<div className="p-1">
																		<div
																			className={cn(
																				"flex min-h-[64px] flex-col items-center justify-center border px-1 py-1 text-center",
																				meta.tone,
																			)}>
																			<p className="text-[9px] font-medium text-slate-400">
																				Day {dayNumber}
																			</p>
																			<p className="mt-1 truncate text-[11px] font-semibold leading-none tracking-[0.04em]">
																				{meta.code}
																			</p>
																			<p className="mt-0.5 min-h-[18px] whitespace-normal text-[9px] leading-[1.15] text-slate-500">
																				{meta.timeRange ||
																					(meta.isOff
																						? "Off day"
																						: "")}
																			</p>
																		</div>
																	</div>
																</div>
															);
														},
													)}
												</div>
											</div>
										</div>
									</div>
								))}
							</div>
						) : null}
						{hasExistingEmbeddedManual ? (
							<div className="border-t border-slate-200 bg-slate-50/60 px-3 py-2.5"></div>
						) : (
							<div className="p-3">
								<ShiftSnapshotFormFields
									control={control}
									register={register}
									setValue={setValue}
									watch={watch}
									basePath="shiftSnapshot"
									defaultTimeSlots={buildManualShiftSnapshot().timeSlots}
								/>
							</div>
						)}
					</div>
				) : selectedTemplate ? (
					<div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
						<div className="border-b border-slate-200 bg-slate-50/80 px-3 py-2.5">
							<div className="flex flex-wrap items-start justify-between gap-2">
								<div className="min-w-0">
									<div className="flex flex-wrap items-center gap-2">
										<span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
											Template
										</span>
										{currentEntry?.scheduleTemplateId ===
										selectedTemplate.id ? (
											<span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
												Current assignment
											</span>
										) : null}
									</div>
									<p className="mt-2 text-sm font-semibold text-slate-900">
										{selectedTemplate.name}
									</p>
									<p className="mt-0.5 text-xs text-slate-500">
										{selectedTemplate.code} • {selectedTemplate.cycleDays} day
										cycle
									</p>
								</div>
								<p className="text-[11px] text-slate-500">
									Repeats weekly from the effective start date.
								</p>
							</div>
						</div>
						<div className="space-y-3 px-3 py-3">
							{previewWeeks.map((week, weekIndex) => (
								<div key={`week-${weekIndex + 1}`} className="space-y-1.5">
									<div className="flex items-center justify-between">
										<p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
											Week {weekIndex + 1}
										</p>
										<p className="text-[11px] text-slate-400">
											Days {weekIndex * 7 + 1}-{weekIndex * 7 + week.length}
										</p>
									</div>
									<div className="overflow-x-auto">
										<div className="min-w-[700px] rounded-lg border border-slate-200">
											<div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80">
												{WEEKDAY_HEADERS.map((label) => (
													<div
														key={label}
														className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
														{label}
													</div>
												))}
											</div>
											<div className="grid grid-cols-7">
												{Array.from({ length: 7 }).map((_, localIndex) => {
													const item = week[localIndex] || null;
													const dayNumber =
														weekIndex * 7 + localIndex + 1;
													const meta = getPatternCellMeta(item);
													return (
														<div
															key={`pattern-${weekIndex}-${localIndex}`}
															className="border-r border-slate-100 last:border-r-0">
															<div className="p-1">
																<div
																	className={cn(
																		"flex min-h-[64px] flex-col items-center justify-center border px-1 py-1 text-center",
																		meta.tone,
																	)}>
																	<p className="text-[9px] font-medium text-slate-400">
																		Day {dayNumber}
																	</p>
																	<p className="mt-1 truncate text-[11px] font-semibold leading-none tracking-[0.04em]">
																		{meta.code}
																	</p>
																	<p className="mt-0.5 min-h-[18px] whitespace-normal text-[9px] leading-[1.15] text-slate-500">
																		{meta.timeRange ||
																			(meta.isOff
																				? "Off day"
																				: "")}
																	</p>
																</div>
															</div>
														</div>
													);
												})}
											</div>
										</div>
									</div>
								</div>
							))}
						</div>
					</div>
				) : null}

				<div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
					<p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
						Effective Start
					</p>
					<p className="mt-1 text-sm font-medium text-slate-800">{effectiveStartLabel}</p>
					<p className="mt-1 text-[11px] text-slate-500">
						This assignment starts on the next Monday in UTC.
					</p>
				</div>

				<div>
					<Label htmlFor="schedule-reason">Reason</Label>
					<Textarea
						id="schedule-reason"
						value={watch("reason") || ""}
						onChange={(event) => setValue("reason", event.target.value)}
						rows={3}
						placeholder="Optional context for this assignment"
					/>
				</div>

				{timelineEntries.length > 0 && (
					<div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
						<p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-900">
							Existing assignments
						</p>
						<div className="mt-2 space-y-1.5">
							{timelineEntries.slice(0, 3).map((entry) => (
								<div
									key={entry.id}
									className="flex flex-wrap items-center gap-2 text-xs text-amber-800">
									<span className="font-medium">
										{entry.scheduleName ||
											entry.scheduleTemplate?.name ||
											entry.scheduleTemplateId ||
											entry.scheduleCode ||
											"Schedule"}
									</span>
									<span>{String(entry.startDate).slice(0, 10)}</span>
									{entry.endDate ? (
										<span>to {String(entry.endDate).slice(0, 10)}</span>
									) : null}
								</div>
							))}
							{timelineEntries.length > 3 && (
								<p className="text-xs text-amber-700">
									+{timelineEntries.length - 3} more assignments
								</p>
							)}
						</div>
					</div>
				)}
			</form>

			<div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
				<Button
					variant="outline"
					onClick={resetAndClose}
					disabled={createEmployeeScheduleMutation.isPending}>
					Cancel
				</Button>
				<Button
					onClick={handleSubmit(submitEntry)}
					disabled={createEmployeeScheduleMutation.isPending}>
					{createEmployeeScheduleMutation.isPending ? "Saving..." : "Assign Schedule"}
				</Button>
			</div>
		</Modal>
	);
}
