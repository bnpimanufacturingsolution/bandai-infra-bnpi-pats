import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent,
	type ReactNode,
} from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import {
	DndContext,
	type DragCancelEvent,
	closestCenter,
	type DragEndEvent,
	type DragStartEvent,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "~/components/atoms/Button";
import { CategoricalText } from "~/components/atoms/CategoricalText";
import { Badge } from "~/components/atoms/Badge";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { ConfigurationEmptyGuide } from "~/components/molecules/ConfigurationEmptyGuide";
import { ConstraintTokenRow } from "~/components/molecules/ConstraintTokens";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Select } from "~/components/atoms/Select";
import { ShiftSnapshotFormFields } from "~/components/organisms/schedule/ShiftSnapshotFormFields";
import { GenericImportModal } from "~/components/organisms/shared/GenericImportModal";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	useCreateShiftType,
	useCreateScheduleTemplate,
	useDeleteShiftType,
	useDeleteScheduleTemplate,
	useDuplicateScheduleTemplate,
	useImportSchedules,
	useImportShiftTypes,
	useShiftType,
	useScheduleTemplate,
	useScheduleTemplates,
	useShiftTypes,
	useUpdateShiftType,
	useUpdateScheduleTemplate,
} from "~/lib/hooks";
import {
	ChevronDown,
	ChevronRight,
	Copy,
	Eye,
	GripVertical,
	Loader2,
	MoreVertical,
	Pencil,
	Trash2,
} from "lucide-react";
import { useSearchParams } from "react-router";
import { HR_MODAL_BASE_CLASS } from "~/lib/ui/admin-configuration-modal";
import { useAdminFormErrorNavigation } from "~/lib/ui/admin-configuration-form";
import { useDebouncedGeneratedCodeField } from "~/lib/ui/admin-configuration-code";
import schedulesService from "~/services/schedules.service";
import {
	AdminConfigCodeChip,
	AdminConfigLongText,
	AdminConfigMutedDash,
	AdminConfigPolicyChip,
	AdminConfigPrimaryCell,
	AdminConfigStatusBadge,
} from "~/lib/ui/admin-configuration-table";

const SCHEDULE_MODAL_WIDE_CLASS = `sm:max-w-[820px] ${HR_MODAL_BASE_CLASS}`;
const SCHEDULE_MODAL_STANDARD_CLASS = `sm:max-w-[680px] ${HR_MODAL_BASE_CLASS}`;
const SCHEDULE_MODAL_NARROW_CLASS = `sm:max-w-[520px] ${HR_MODAL_BASE_CLASS}`;

const ALLOWED_CYCLE_DAYS = [7, 14, 21, 28, 35, 42] as const;
const WEEKDAY_LABELS = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
];

const SHIFT_TYPE_IMPORT_FIELDS = {
	required: [
		{
			key: "CODE",
			label: "Shift Code",
			required: true,
			aliases: ["ShiftCode", "Shift Code"],
		},
	],
	optional: [
		{
			key: "TIME_SLOTS",
			label: "Time Slots",
			aliases: ["Slots", "Pattern", "Work()", "WORK", "Break()", "BREAK"],
		},
		{
			key: "NAME",
			label: "Shift Name",
			aliases: ["Shift Name", "Description"],
		},
		{
			key: "SHIFT_HRS",
			label: "Shift Hours",
			aliases: ["ShiftHrs", "Shift Hrs", "Shift Hours"],
		},
		{
			key: "IS_OVERNIGHT",
			label: "Overnight",
			aliases: ["Overnight"],
		},
		{
			key: "IS_OFF",
			label: "Off Day",
			aliases: ["Off Day", "Is Off"],
		},
		{
			key: "IS_ACTIVE",
			label: "Active",
			aliases: ["Active", "Status"],
		},
	],
	system: [],
};

const SCHEDULE_TEMPLATE_IMPORT_FIELDS = {
	required: [
		{
			key: "NAME",
			label: "Template Name",
			required: true,
			aliases: ["Template Name", "TEMPLATE_NAME"],
		},
	],
	optional: [
		{
			key: "CODE",
			label: "Template Code",
			aliases: ["Template Code", "TEMPLATE_CODE"],
		},
		{ key: "DESCRIPTION", label: "Description", aliases: ["Notes"] },
		{ key: "CYCLE_DAYS", label: "Cycle Days", aliases: ["Cycle", "Cycle Days"] },
		{
			key: "GRACE_LATE_MINUTES",
			label: "Late Grace",
			aliases: ["Late Grace", "Grace Late Minutes", "Grace Period Minutes"],
		},
		{
			key: "GRACE_EARLY_OUT_MINUTES",
			label: "Early-Out Grace",
			aliases: ["Early Out Grace", "Grace Early Out Minutes"],
		},
		{ key: "IS_ACTIVE", label: "Active", aliases: ["Active", "Status"] },
		...Array.from({ length: 42 }, (_, index) => {
			const day = index + 1;
			const weekdayAliases =
				day === 1
					? ["Monday", "Mon", "MONDAY"]
					: day === 2
						? ["Tuesday", "Tue", "TUESDAY"]
						: day === 3
							? ["Wednesday", "Wed", "WEDNESDAY"]
							: day === 4
								? ["Thursday", "Thu", "THURSDAY"]
								: day === 5
									? ["Friday", "Fri", "FRIDAY"]
									: day === 6
										? ["Saturday", "Sat", "SATURDAY"]
										: day === 7
											? ["Sunday", "Sun", "SUNDAY"]
											: [];
			return {
				key: `DAY_${day}`,
				label: `Day ${day}`,
				aliases: [`Day ${day}`, `DAY${day}`, `D${day}`, ...weekdayAliases],
			};
		}),
	],
	system: [],
};

const normalizeCycleDays = (value: number) =>
	ALLOWED_CYCLE_DAYS.includes(value as (typeof ALLOWED_CYCLE_DAYS)[number]) ? value : 7;

const getWeekdayLabel = (index: number) => WEEKDAY_LABELS[index % 7] || WEEKDAY_LABELS[0];

const formatHour = (value?: number | null) => {
	const hours = Math.max(0, Number(value || 0));
	return `${hours.toLocaleString()} hr${hours === 1 ? "" : "s"}`;
};

const toMinutes = (value?: string | null): number | null => {
	const text = String(value || "")
		.trim()
		.toUpperCase()
		.replace(/\s+/g, "");
	if (!text) return null;
	const match = text.match(/^(\d{1,2}):(\d{2})(AM|PM)?$/);
	if (!match) return null;
	let hours = Number(match[1]);
	const minutes = Number(match[2]);
	const meridiem = match[3];
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
	if (minutes < 0 || minutes > 59) return null;
	if (meridiem) {
		if (hours < 1 || hours > 12) return null;
		if (meridiem === "AM") hours = hours === 12 ? 0 : hours;
		if (meridiem === "PM") hours = hours === 12 ? 12 : hours + 12;
	} else if (hours < 0 || hours > 23) {
		return null;
	}
	return hours * 60 + minutes;
};

const formatTime = (value: number) => {
	const normalized = ((value % (24 * 60)) + 24 * 60) % (24 * 60);
	const hours = Math.floor(normalized / 60);
	const minutes = normalized % 60;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const normalizeTimeValue = (value?: string | null, fallback = "00:00") => {
	const minutes = toMinutes(value);
	return minutes === null ? fallback : formatTime(minutes);
};

const normalizeTimeSlots = (
	timeSlots?: Array<{
		type?: string | null;
		label?: string | null;
		startTime?: string | null;
		endTime?: string | null;
	}> | null,
) =>
	(Array.isArray(timeSlots) ? timeSlots : []).map((slot) => ({
		type: String(slot?.type || "work"),
		label: slot?.label ? String(slot.label) : "",
		startTime: normalizeTimeValue(slot?.startTime, "00:00"),
		endTime: normalizeTimeValue(slot?.endTime, "00:00"),
	}));

const calculateShiftHourFromSlots = (
	timeSlots?: Array<{
		type?: string | null;
		startTime?: string | null;
		endTime?: string | null;
	}> | null,
) => {
	let previousEnd: number | null = null;
	const intervals = (Array.isArray(timeSlots) ? timeSlots : [])
		.map((slot) => {
			const start = toMinutes(slot.startTime);
			const end = toMinutes(slot.endTime);
			if (start === null || end === null) return null;
			let absoluteStart = start;
			let absoluteEnd = end <= start ? end + 24 * 60 : end;
			if (previousEnd !== null) {
				const isNestedSameDaySlot = absoluteEnd <= previousEnd;
				const isLikelyPostMidnightSlot =
					previousEnd > 24 * 60 && absoluteStart < previousEnd % (24 * 60);
				if (isNestedSameDaySlot && isLikelyPostMidnightSlot) {
					absoluteStart += 24 * 60;
					absoluteEnd += 24 * 60;
				} else {
					while (absoluteStart < previousEnd && !isNestedSameDaySlot) {
						absoluteStart += 24 * 60;
						absoluteEnd += 24 * 60;
					}
				}
			}
			previousEnd = previousEnd === null ? absoluteEnd : Math.max(previousEnd, absoluteEnd);
			return {
				type: String(slot?.type || "").toLowerCase(),
				start: absoluteStart,
				end: absoluteEnd,
			};
		})
		.filter((interval): interval is { type: string; start: number; end: number } =>
			Boolean(interval),
		);
	const workIntervals = intervals.filter((interval) => interval.type === "work");
	const breakIntervals = intervals.filter((interval) => interval.type === "break");
	const workMinutes = workIntervals.reduce(
		(total, interval) => total + Math.max(0, interval.end - interval.start),
		0,
	);
	const breakOverlapMinutes = breakIntervals.reduce(
		(total, breakInterval) =>
			total +
			workIntervals.reduce((overlapTotal, workInterval) => {
				const overlapStart = Math.max(breakInterval.start, workInterval.start);
				const overlapEnd = Math.min(breakInterval.end, workInterval.end);
				return overlapTotal + Math.max(0, overlapEnd - overlapStart);
			}, 0),
		0,
	);
	return Number((Math.max(0, workMinutes - breakOverlapMinutes) / 60).toFixed(2));
};

const calculatePatternRowHour = (row: PatternRow, shiftTypeMap: Map<string, any>) => {
	if (row.mode === "use_shift_type") {
		const shiftTypeId = row.shiftTypeId ? String(row.shiftTypeId) : "";
		const shiftType = shiftTypeId ? shiftTypeMap.get(shiftTypeId) : null;
		return Number(shiftType?.shiftHour || 0);
	}

	const snapshot = row.shiftSnapshot;
	if (!snapshot || snapshot.isOff) return 0;
	const storedHour = Number(snapshot.shiftHour || 0);
	if (storedHour > 0) return storedHour;
	return calculateShiftHourFromSlots(snapshot.timeSlots);
};

const summarizeShiftSnapshot = (snapshot?: PatternRow["shiftSnapshot"] | null) => {
	if (!snapshot) return "Manual shift";
	if (snapshot.isOff) return "Off day";
	const code = snapshot.code?.trim();
	const name = snapshot.name?.trim();
	const timeSlots = Array.isArray(snapshot.timeSlots) ? snapshot.timeSlots : [];
	const primarySlot = timeSlots.find((slot) => slot?.startTime && slot?.endTime);
	const slotSummary = primarySlot
		? `${normalizeTimeValue(primarySlot.startTime)}-${normalizeTimeValue(primarySlot.endTime)}`
		: null;
	return [code || name || "Manual shift", slotSummary].filter(Boolean).join(" • ");
};

const summarizePatternRow = (row: PatternRow, shiftTypeMap: Map<string, any>) => {
	if (row.mode === "manual") return summarizeShiftSnapshot(row.shiftSnapshot);
	const shiftTypeId = row.shiftTypeId ? String(row.shiftTypeId) : "";
	const shiftType = shiftTypeId ? shiftTypeMap.get(shiftTypeId) : undefined;
	if (!shiftType) return "No shift selected";
	if (shiftType.isOff) return `${shiftType.code || shiftType.name || "Shift"} • Off day`;
	const primarySlot = Array.isArray(shiftType.timeSlots)
		? shiftType.timeSlots.find((slot: any) => slot?.startTime && slot?.endTime)
		: null;
	const slotSummary = primarySlot
		? `${normalizeTimeValue(primarySlot.startTime)}-${normalizeTimeValue(primarySlot.endTime)}`
		: null;
	return [shiftType.code || shiftType.name || "Assigned shift", slotSummary]
		.filter(Boolean)
		.join(" • ");
};

const summarizeTemplatePatternItem = (item: any, shiftTypeMap: Map<string, any>) => {
	if (item?.shiftSnapshot) return summarizeShiftSnapshot(item.shiftSnapshot);

	const shiftType =
		(item?.shiftTypeId ? shiftTypeMap.get(String(item.shiftTypeId)) : undefined) ||
		item?.shiftType;

	if (!shiftType) return "No shift selected";
	if (shiftType.isOff) return `${shiftType.code || shiftType.name || "Shift"} | Off day`;

	const primarySlot = Array.isArray(shiftType.timeSlots)
		? shiftType.timeSlots.find((slot: any) => slot?.startTime && slot?.endTime)
		: null;
	const slotSummary = primarySlot
		? `${normalizeTimeValue(primarySlot.startTime)}-${normalizeTimeValue(primarySlot.endTime)}`
		: null;

	return [shiftType.code || shiftType.name || "Assigned shift", slotSummary]
		.filter(Boolean)
		.join(" | ");
};

const buildTemplatePatternWeeks = (pattern: any[] = []) => {
	const safePattern = Array.isArray(pattern) ? pattern : [];
	const totalWeeks = Math.max(1, Math.ceil(safePattern.length / 7));

	return Array.from({ length: totalWeeks }, (_, weekIndex) => ({
		id: `view-week-${weekIndex}`,
		weekIndex,
		rows: safePattern.slice(weekIndex * 7, weekIndex * 7 + 7).map((item, localIndex) => ({
			item,
			localIndex,
			label: getWeekdayLabel(localIndex),
		})),
	}));
};

const TemplateFormSchema = z.object({
	name: z.string().min(1),
	code: z.string().min(1),
	description: z.string().optional().nullable(),
	cycleDays: z.coerce
		.number()
		.int()
		.refine(
			(value) => ALLOWED_CYCLE_DAYS.includes(value as (typeof ALLOWED_CYCLE_DAYS)[number]),
			"Cycle must be between 1 and 6 weeks.",
		),
	graceLateMinutes: z.coerce.number().int().min(0).default(15),
	graceEarlyOutMinutes: z.coerce.number().int().min(0).default(0),
	isActive: z.boolean().default(true),
	pattern: z
		.array(
			z
				.object({
					day: z.coerce.number().int().min(1),
					mode: z.enum(["use_shift_type", "manual"]).default("manual"),
					shiftTypeId: z.string().optional().nullable(),
					shiftSnapshot: z
						.object({
							name: z.string().optional().nullable(),
							code: z.string().optional().nullable(),
							isOvernight: z.boolean().optional(),
							isOff: z.boolean().optional(),
							shiftHour: z.number().min(0).optional(),
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
						})
						.optional()
						.nullable(),
				})
				.refine((item) => {
					if (item.mode === "manual") return Boolean(item.shiftSnapshot);
					return Boolean(item.shiftTypeId);
				}),
		)
		.default([]),
});

type TemplateFormInput = z.input<typeof TemplateFormSchema>;
type TemplateFormData = z.output<typeof TemplateFormSchema>;
type PatternRow = NonNullable<TemplateFormInput["pattern"]>[number];
type PatternRowWithMeta = PatternRow & {
	fieldId: string;
	rowKey: string;
	globalIndex: number;
	localIndex: number;
	weekIndex: number;
};
type WeekBlock = {
	id: string;
	weekIndex: number;
	rows: PatternRowWithMeta[];
};

const buildPattern = (cycleDays: number): TemplateFormInput["pattern"] =>
	Array.from({ length: cycleDays }).map((_, index) => ({
		day: index + 1,
		mode: "manual" as const,
		shiftTypeId: "",
		shiftSnapshot: buildManualShiftSnapshot(),
	}));

const buildManualShiftSnapshot = () => ({
	name: "",
	code: "",
	isOvernight: false,
	isOff: false,
	shiftHour: 0,
	timeSlots: [{ type: "work", label: "Work Slot", startTime: "00:00", endTime: "00:00" }],
});

const buildShiftSnapshotFromShiftType = (shiftType: any) => ({
	name: shiftType?.name || "",
	code: shiftType?.code || "",
	isOvernight: Boolean(shiftType?.isOvernight),
	isOff: Boolean(shiftType?.isOff),
	shiftHour: Number(shiftType?.shiftHour || 0),
	timeSlots: Array.isArray(shiftType?.timeSlots)
		? normalizeTimeSlots(shiftType.timeSlots)
		: buildManualShiftSnapshot().timeSlots,
});

const ShiftTypeFormSchema = z.object({
	name: z.string().min(1),
	code: z.string().min(1),
	isOvernight: z.boolean().default(false),
	isOff: z.boolean().default(false),
	isActive: z.boolean().default(true),
	timeSlots: z
		.array(
			z.object({
				type: z.string().min(1),
				label: z.string().optional().nullable(),
				startTime: z.string().min(1),
				endTime: z.string().min(1),
			}),
		)
		.default([]),
});

type ShiftTypeFormInput = z.input<typeof ShiftTypeFormSchema>;
type ShiftTypeFormData = z.output<typeof ShiftTypeFormSchema>;

const defaultShiftTypeValues: ShiftTypeFormInput = {
	name: "",
	code: "",
	isOvernight: false,
	isOff: false,
	isActive: true,
	timeSlots: [{ type: "work", label: "Work Slot", startTime: "00:00", endTime: "00:00" }],
};

const buildWeekBlocks = (fields: Array<{ id: string }>, pattern: PatternRow[]): WeekBlock[] => {
	const safeLength = Math.min(fields.length, pattern.length);
	const totalWeeks = Math.max(1, Math.ceil(safeLength / 7));

	return Array.from({ length: totalWeeks }, (_, weekIndex) => {
		const start = weekIndex * 7;
		const rows = Array.from({ length: 7 }, (_, localIndex) => {
			const globalIndex = start + localIndex;
			if (globalIndex >= safeLength) return null;
			const field = fields[globalIndex];
			const patternRow = pattern[globalIndex];
			if (!field || !patternRow) return null;
			return {
				...patternRow,
				fieldId: field.id,
				rowKey: `week-${weekIndex}-row-${localIndex}`,
				globalIndex,
				localIndex,
				weekIndex,
			} satisfies PatternRowWithMeta;
		}).filter(Boolean) as PatternRowWithMeta[];

		return {
			id: `week-${weekIndex}`,
			weekIndex,
			rows,
		};
	});
};

const syncCollapseState = (
	prev: Record<string, boolean>,
	keys: string[],
): Record<string, boolean> => {
	const nextEntries = keys.map((key) => [key, prev[key] ?? false] as const);
	const hasSameKeys =
		Object.keys(prev).length === nextEntries.length &&
		nextEntries.every(([key]) => Object.prototype.hasOwnProperty.call(prev, key));

	if (hasSameKeys) return prev;
	return Object.fromEntries(nextEntries);
};

const syncActiveWeekDayState = (
	prev: Record<string, string>,
	weeks: WeekBlock[],
): Record<string, string> =>
	Object.fromEntries(
		weeks.map((week) => {
			const fallbackRowKey = week.rows[0]?.rowKey || "";
			const isStillValid = week.rows.some((row) => row.rowKey === prev[week.id]);
			return [week.id, isStillValid ? prev[week.id] : fallbackRowKey] as const;
		}),
	);

function SortableWeekBlock({
	id,
	children,
	isActiveDrag,
}: {
	id: string;
	children: (handle: {
		attributes: ReturnType<typeof useSortable>["attributes"];
		listeners: ReturnType<typeof useSortable>["listeners"];
		onPointerDown?: () => void;
	}) => ReactNode;
	isActiveDrag: boolean;
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`relative rounded-lg border border-border bg-white p-3 shadow-sm transition-shadow ${
				isDragging ? "shadow-md" : ""
			} ${isActiveDrag ? "ring-1 ring-primary/30" : ""}`}>
			<div className="space-y-2">{children({ attributes, listeners })}</div>
		</div>
	);
}

export default function ScheduleTemplatesPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const action = searchParams.get("action");
	const id = searchParams.get("id") || "";
	const search = searchParams.get("search") || undefined;
	const statusFilter = searchParams.get("status") || undefined;
	const page = Number(searchParams.get("page") || 1);
	const limit = Number(searchParams.get("limit") || 10);
	const filterString = statusFilter ? `isActive:${statusFilter}` : undefined;
	const shiftTypeAction = searchParams.get("shiftTypeAction") || "";
	const shiftTypeId = searchParams.get("shiftTypeId") || "";
	const shiftTypeSearch = searchParams.get("shiftTypeSearch") || undefined;
	const shiftTypePage = Number(searchParams.get("shiftTypePage") || 1);
	const shiftTypeLimit = Number(searchParams.get("shiftTypeLimit") || 10);
	const isEditing = action === "edit";
	const isViewing = action === "view";
	const isDeleting = action === "delete";
	const isImportingTemplates = action === "import";
	const isFormOpen = action === "create" || action === "edit";
	const isShiftTypeManagerOpen = ["list", "create", "edit", "view", "delete"].includes(
		shiftTypeAction,
	);
	const isShiftTypeEditing = shiftTypeAction === "edit";
	const isShiftTypeViewing = shiftTypeAction === "view";
	const isShiftTypeDeleting = shiftTypeAction === "delete";
	const isShiftTypeFormOpen = shiftTypeAction === "create" || shiftTypeAction === "edit";

	const { data, isLoading } = useScheduleTemplates(
		{
			page,
			limit,
			query: search,
			filter: filterString,
			document: true,
			count: true,
			pagination: true,
		},
		{ enabled: true },
	);
	const { data: activeItem, isLoading: isLoadingActive } = useScheduleTemplate(id, {
		enabled: !!id && (isEditing || isViewing || isDeleting),
	});
	const { data: shiftTypesData } = useShiftTypes(
		{ page: 1, limit: 1000, document: true, count: true },
		{ enabled: true },
	);
	const { data: shiftTypeManagerData, isLoading: isLoadingShiftTypeManager } = useShiftTypes(
		{
			page: shiftTypePage,
			limit: shiftTypeLimit,
			query: shiftTypeSearch,
			document: true,
			count: true,
			pagination: true,
		},
		{ enabled: isShiftTypeManagerOpen },
	);
	const { data: activeShiftType, isLoading: isLoadingActiveShiftType } = useShiftType(
		shiftTypeId,
		{
			enabled:
				!!shiftTypeId && (isShiftTypeEditing || isShiftTypeViewing || isShiftTypeDeleting),
		},
	);
	const createMutation = useCreateScheduleTemplate();
	const updateMutation = useUpdateScheduleTemplate();
	const deleteMutation = useDeleteScheduleTemplate();
	const duplicateMutation = useDuplicateScheduleTemplate();
	const importSchedulesMutation = useImportSchedules();
	const createShiftTypeMutation = useCreateShiftType();
	const updateShiftTypeMutation = useUpdateShiftType();
	const deleteShiftTypeMutation = useDeleteShiftType();
	const importShiftTypesMutation = useImportShiftTypes();
	const [collapsedWeeks, setCollapsedWeeks] = useState<Record<string, boolean>>({});
	const [activeWeekDayTabs, setActiveWeekDayTabs] = useState<Record<string, string>>({});
	const [activeWeekDragId, setActiveWeekDragId] = useState<string | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const dragCollapseSnapshotRef = useRef<Record<string, boolean> | null>(null);
	const pendingPreviewWeekRef = useRef<string | null>(null);
	const shiftTypeOptions = (shiftTypesData?.shiftTypes || []).map((shiftType) => ({
		value: shiftType.id,
		label: `${shiftType.name} (${shiftType.code})`,
	}));
	const shiftTypeMap = new Map<string, any>(
		(shiftTypesData?.shiftTypes || []).map((shiftType) => [String(shiftType.id), shiftType]),
	);
	const shiftTypeManagerItems = shiftTypeManagerData?.shiftTypes || [];

	const shiftTypeForm = useForm<ShiftTypeFormInput, any, ShiftTypeFormData>({
		resolver: zodResolver(ShiftTypeFormSchema),
		defaultValues: defaultShiftTypeValues,
	});

	const form = useForm<TemplateFormInput, any, TemplateFormData>({
		resolver: zodResolver(TemplateFormSchema),
		defaultValues: {
			name: "",
			code: "",
			description: "",
			cycleDays: 7,
			graceLateMinutes: 15,
			graceEarlyOutMinutes: 0,
			isActive: true,
			pattern: buildPattern(7),
		},
	});
	const {
		register,
		control,
		handleSubmit,
		reset,
		setValue,
		watch,
		formState: { errors: templateErrors },
	} = form;
	const {
		register: registerShiftType,
		control: shiftTypeControl,
		handleSubmit: handleShiftTypeSubmit,
		reset: resetShiftTypeForm,
		setValue: setShiftTypeValue,
		watch: watchShiftType,
	} = shiftTypeForm;
	const { fields, replace } = useFieldArray({
		control,
		name: "pattern",
	});
	const watchedCycleDays = normalizeCycleDays(Number(watch("cycleDays") || 7));
	const watchedTemplateName = watch("name") || "";
	const watchedTemplateCode = watch("code") || "";
	const watchedTemplateDescription = watch("description") || "";
	const watchedGraceLateMinutes = watch("graceLateMinutes");
	const watchedGraceEarlyOutMinutes = watch("graceEarlyOutMinutes");
	const handleInvalidSubmit = useAdminFormErrorNavigation();
	const watchedPatternRaw = (watch("pattern") || []) as NonNullable<TemplateFormInput["pattern"]>;
	const watchedShiftTypeName = watchShiftType("name") || "";
	const watchedShiftTypeCode = watchShiftType("code") || "";

	useDebouncedGeneratedCodeField({
		enabled: isFormOpen && !isEditing,
		sourceValue: watchedTemplateName,
		currentCodeValue: watchedTemplateCode,
		generateCode: async (source) =>
			(await schedulesService.generateScheduleTemplateCode(source)).code,
		onGeneratedCode: (nextCode) =>
			setValue("code", nextCode, { shouldDirty: true, shouldValidate: true }),
	});

	useDebouncedGeneratedCodeField({
		enabled: shiftTypeAction === "create",
		sourceValue: watchedShiftTypeName,
		currentCodeValue: watchedShiftTypeCode,
		generateCode: async (source) => (await schedulesService.generateShiftTypeCode(source)).code,
		onGeneratedCode: (nextCode) =>
			setShiftTypeValue("code", nextCode, { shouldDirty: true, shouldValidate: true }),
	});
	const watchedPattern = useMemo(
		() => watchedPatternRaw.filter(Boolean) as PatternRow[],
		[watchedPatternRaw],
	);
	const patternTotals = useMemo(() => {
		const totalHour = Number(
			watchedPattern
				.reduce((total, row) => total + calculatePatternRowHour(row, shiftTypeMap), 0)
				.toFixed(2),
		);
		const totalDay = watchedPattern.filter(
			(row) => calculatePatternRowHour(row, shiftTypeMap) > 0,
		).length;
		return { totalDay, totalHour };
	}, [shiftTypeMap, watchedPattern]);
	const weekBlocks = useMemo(
		() => buildWeekBlocks(fields, watchedPattern),
		[fields, watchedPattern],
	);
	const weekIds = useMemo(() => weekBlocks.map((week) => week.id), [weekBlocks]);
	const totalCollapsedWeeks = useMemo(
		() => weekBlocks.filter((week) => collapsedWeeks[week.id] === true).length,
		[collapsedWeeks, weekBlocks],
	);
	useEffect(() => {
		setCollapsedWeeks((prev) => syncCollapseState(prev, weekIds));
	}, [weekIds]);

	useEffect(() => {
		setActiveWeekDayTabs((prev) => syncActiveWeekDayState(prev, weekBlocks));
	}, [weekBlocks]);

	useEffect(() => {
		if (!watchedCycleDays || watchedCycleDays < 1) return;
		const existing = watchedPatternRaw;
		if (existing.length === watchedCycleDays) return;
		const nextPattern: PatternRow[] = Array.from({
			length: watchedCycleDays,
		}).map((_, index) => ({
			day: index + 1,
			mode: existing[index]?.mode || "manual",
			shiftTypeId: existing[index]?.shiftTypeId || "",
			shiftSnapshot: existing[index]?.shiftSnapshot || buildManualShiftSnapshot(),
		}));
		replace(nextPattern);
	}, [replace, watchedCycleDays, watchedPatternRaw]);

	const captureDragCollapseSnapshot = () => {
		if (dragCollapseSnapshotRef.current) return;
		dragCollapseSnapshotRef.current = collapsedWeeks;
	};

	const restoreDragCollapseSnapshot = () => {
		const snapshot = dragCollapseSnapshotRef.current;
		if (snapshot) {
			setCollapsedWeeks(snapshot);
			dragCollapseSnapshotRef.current = null;
		}
		pendingPreviewWeekRef.current = null;
		setIsDragging(false);
		setActiveWeekDragId(null);
	};

	const finishDragKeepingCollapsedState = () => {
		dragCollapseSnapshotRef.current = null;
		pendingPreviewWeekRef.current = null;
		setIsDragging(false);
		setActiveWeekDragId(null);
	};

	const previewWeekDrag = (activeId: string) => {
		captureDragCollapseSnapshot();
		pendingPreviewWeekRef.current = activeId;
		setActiveWeekDragId(activeId);
		setCollapsedWeeks(Object.fromEntries(weekIds.map((weekId) => [weekId, true])));
	};

	useEffect(() => {
		const handlePointerUp = () => {
			if (pendingPreviewWeekRef.current && !isDragging) {
				restoreDragCollapseSnapshot();
			}
		};

		window.addEventListener("pointerup", handlePointerUp);
		return () => window.removeEventListener("pointerup", handlePointerUp);
	}, [isDragging]);

	const handleWeekDragStart = (event: DragStartEvent) => {
		const activeId = String(event.active.id);
		setIsDragging(true);
		previewWeekDrag(activeId);
	};

	const handleWeekDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) {
			finishDragKeepingCollapsedState();
			return;
		}

		const fromIndex = weekBlocks.findIndex((week) => week.id === active.id);
		const toIndex = weekBlocks.findIndex((week) => week.id === over.id);
		if (fromIndex < 0 || toIndex < 0) {
			finishDragKeepingCollapsedState();
			return;
		}

		const reordered: PatternRow[] = arrayMove(weekBlocks, fromIndex, toIndex)
			.flatMap((week) => week.rows)
			.map(
				(
					{
						fieldId: _fieldId,
						globalIndex: _globalIndex,
						localIndex: _localIndex,
						weekIndex: _weekIndex,
						...item
					},
					index,
				) => ({
					...item,
					day: index + 1,
				}),
			);
		replace(reordered);
		finishDragKeepingCollapsedState();
	};

	const handleWeekDragCancel = (_event: DragCancelEvent) => {
		restoreDragCollapseSnapshot();
	};

	useEffect(() => {
		if (isEditing && activeItem) {
			const normalizedCycleDays = normalizeCycleDays(Number(activeItem.cycleDays || 7));
			reset({
				name: activeItem.name || "",
				code: activeItem.code || "",
				description: activeItem.description || "",
				cycleDays: normalizedCycleDays,
				graceLateMinutes: Number(activeItem.graceLateMinutes || 0),
				graceEarlyOutMinutes: Number(activeItem.graceEarlyOutMinutes || 0),
				isActive: activeItem.isActive !== false,
				pattern:
					activeItem.pattern?.length > 0
						? activeItem.pattern.map((item) => ({
								day: Number(item.day),
								mode: item.shiftSnapshot
									? "manual"
									: item.shiftTypeId
										? "use_shift_type"
										: "manual",
								shiftTypeId: item.shiftSnapshot ? "" : item.shiftTypeId || "",
								shiftSnapshot: item.shiftSnapshot || null,
							}))
						: buildPattern(normalizedCycleDays),
			});
		} else if (action === "create") {
			reset({
				name: "",
				code: "",
				description: "",
				cycleDays: 7,
				graceLateMinutes: 15,
				graceEarlyOutMinutes: 0,
				isActive: true,
				pattern: buildPattern(7),
			});
		}
	}, [action, activeItem, isEditing, reset]);

	useEffect(() => {
		if (isShiftTypeEditing && activeShiftType) {
			resetShiftTypeForm({
				name: activeShiftType.name || "",
				code: activeShiftType.code || "",
				isOvernight: !!activeShiftType.isOvernight,
				isOff: !!activeShiftType.isOff,
				isActive: activeShiftType.isActive !== false,
				timeSlots:
					activeShiftType.timeSlots && activeShiftType.timeSlots.length > 0
						? activeShiftType.timeSlots.map((slot) => ({
								type: slot.type,
								label: slot.label || "",
								startTime: slot.startTime,
								endTime: slot.endTime,
							}))
						: defaultShiftTypeValues.timeSlots,
			});
		} else if (shiftTypeAction === "create") {
			resetShiftTypeForm(defaultShiftTypeValues);
		}
	}, [activeShiftType, isShiftTypeEditing, resetShiftTypeForm, shiftTypeAction]);

	const closeModal = () => {
		reset({
			name: "",
			code: "",
			description: "",
			cycleDays: 7,
			graceLateMinutes: 15,
			graceEarlyOutMinutes: 0,
			isActive: true,
			pattern: buildPattern(7),
		});
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			next.delete("action");
			next.delete("id");
			return next;
		});
	};

	const openShiftTypeAction = (nextAction: string, nextId?: string) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			next.set("shiftTypeAction", nextAction);
			if (nextId) next.set("shiftTypeId", nextId);
			else next.delete("shiftTypeId");
			if (!next.get("shiftTypePage")) next.set("shiftTypePage", "1");
			if (!next.get("shiftTypeLimit")) next.set("shiftTypeLimit", "10");
			return next;
		});
	};

	const closeShiftTypeManager = () => {
		resetShiftTypeForm(defaultShiftTypeValues);
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			next.delete("shiftTypeAction");
			next.delete("shiftTypeId");
			return next;
		});
	};

	const openAction = (nextAction: string, nextId?: string) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			next.set("action", nextAction);
			if (nextId) next.set("id", nextId);
			else next.delete("id");
			return next;
		});
	};

	const onSubmitShiftType = (values: ShiftTypeFormData) => {
		const timeSlots = normalizeTimeSlots(values.timeSlots).map((slot) => ({
			...slot,
			type: slot.type === "break" ? "break" : "work",
			label: slot.label || (slot.type === "break" ? "Break" : "Work Slot"),
		}));
		const payload = {
			...values,
			timeSlots: values.isOff ? [] : timeSlots,
		};

		if (isShiftTypeEditing && shiftTypeId) {
			updateShiftTypeMutation.mutate(
				{ id: shiftTypeId, payload },
				{
					onSuccess: () => openShiftTypeAction("list"),
				},
			);
			return;
		}

		createShiftTypeMutation.mutate(payload, {
			onSuccess: () => openShiftTypeAction("list"),
		});
	};

	const handleShiftTypeSearch = (query: string) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			if (query) next.set("shiftTypeSearch", query);
			else next.delete("shiftTypeSearch");
			next.set("shiftTypePage", "1");
			if (!next.get("shiftTypeAction")) next.set("shiftTypeAction", "list");
			return next;
		});
	};

	const handleShiftTypePageChange = (nextPage: number) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			next.set("shiftTypePage", String(nextPage));
			if (!next.get("shiftTypeAction")) next.set("shiftTypeAction", "list");
			return next;
		});
	};

	const handleImportScheduleTemplates = async (file: File) => {
		const result = await importSchedulesMutation.mutateAsync(file);
		const data = (result as any)?.data || result;
		const envelope = data?.data || (result as any)?.data?.data;
		const summary =
			data?.summary ||
			envelope?.summary ||
			(result as any)?.summary ||
			(result as any)?.data?.summary ||
			(result as any)?.data?.data?.summary;
		const hasErrors = Array.isArray(summary?.errors) && summary.errors.length > 0;
		const hasFailures = Number(summary?.failed || 0) > 0;
		const hasSkipped = Number(summary?.skipped || 0) > 0;

		if (!hasErrors && !hasFailures && !hasSkipped) {
			closeModal();
		}

		return result;
	};

	const handleDownloadScheduleTemplateTemplate = () => {
		const template = `CODE,NAME,DESCRIPTION,CYCLE_DAYS,GRACE_LATE_MINUTES,GRACE_EARLY_OUT_MINUTES,IS_ACTIVE,DAY_1,DAY_2,DAY_3,DAY_4,DAY_5,DAY_6,DAY_7,DAY_8,DAY_9,DAY_10,DAY_11,DAY_12,DAY_13,DAY_14
BNPI_MON_FRI_DAY_8_5,BNPI Mon-Fri Day 8-5,Default BNPI 2026 migration schedule,7,0,0,TRUE,WORK(8:00AM-12:00PM);BREAK(12:00PM-1:00PM);WORK(1:00PM-5:00PM),WORK(8:00AM-12:00PM);BREAK(12:00PM-1:00PM);WORK(1:00PM-5:00PM),WORK(8:00AM-12:00PM);BREAK(12:00PM-1:00PM);WORK(1:00PM-5:00PM),WORK(8:00AM-12:00PM);BREAK(12:00PM-1:00PM);WORK(1:00PM-5:00PM),WORK(8:00AM-12:00PM);BREAK(12:00PM-1:00PM);WORK(1:00PM-5:00PM),OFF,OFF,,,,,,,
REGULAR_5DAY,Regular 5 Day,Default office week,7,15,0,TRUE,DS0800-1736,DS0800-1736,DS0800-1736,DS0800-1736,DS0800-1736,OFF,OFF,,,,,,,
CUSTOM_SPLIT,Custom Split Manual,Manual token slots,7,10,0,TRUE,WORK(8:00AM-12:00PM);BREAK(12:00PM-1:00PM);WORK(1:00PM-5:00PM),WORK(8:00AM-12:00PM);BREAK(12:00PM-1:00PM);WORK(1:00PM-5:00PM),WORK(8:00AM-12:00PM);BREAK(12:00PM-1:00PM);WORK(1:00PM-5:00PM),WORK(8:00AM-12:00PM);BREAK(12:00PM-1:00PM);WORK(1:00PM-5:00PM),WORK(8:00AM-12:00PM);BREAK(12:00PM-1:00PM);WORK(1:00PM-5:00PM),OFF,OFF,,,,,,,
NIGHT_14DAY,Night Rotation,Two-week night pattern,14,15,0,TRUE,NS2115-515,NS2115-515,NS2115-515,NS2115-515,NS2115-515,OFF,OFF,DS0800-1736,DS0800-1736,DS0800-1736,DS0800-1736,DS0800-1736,OFF,OFF`;

		const blob = new Blob([template], { type: "text/csv" });
		const url = window.URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "schedule-templates-template.csv";
		link.click();
		window.URL.revokeObjectURL(url);
	};

	const handleImportShiftTypes = async (file: File) => {
		const result = await importShiftTypesMutation.mutateAsync(file);
		const data = (result as any)?.data || result;
		const envelope = data?.data || (result as any)?.data?.data;
		const summary =
			data?.summary ||
			envelope?.summary ||
			(result as any)?.summary ||
			(result as any)?.data?.summary ||
			(result as any)?.data?.data?.summary;
		const hasErrors = Array.isArray(summary?.errors) && summary.errors.length > 0;
		const hasFailures = Number(summary?.failed || 0) > 0;
		const hasSkipped = Number(summary?.skipped || 0) > 0;

		if (!hasErrors && !hasFailures && !hasSkipped) {
			openShiftTypeAction("list");
		}

		return result;
	};

	const handleDownloadShiftTypeTemplate = () => {
		const template = `CODE,NAME,SHIFT_HRS,TIME_SLOTS,IS_OVERNIGHT,IS_OFF,IS_ACTIVE
BNPI_MON_FRI_DAY_8_5,BNPI Mon-Fri Day 8-5,8,WORK(8:00AM-12:00PM);BREAK(12:00PM-1:00PM);WORK(1:00PM-5:00PM),FALSE,FALSE,TRUE
NS2115-515,NS2115-515,8,WORK(9:15PM-5:15AM),TRUE,FALSE,TRUE
DS0800-1700,DS0800-1700,9,WORK(08:00-17:00),FALSE,FALSE,TRUE
DS0800-1400,DS0800-1400,6,WORK(08:00-14:00),FALSE,FALSE,TRUE
SPLIT0800,Split 8 Hour,8,WORK(8:00AM-12:00PM);BREAK(12:00PM-1:00PM);WORK(1:00PM-5:00PM),FALSE,FALSE,TRUE`;

		const blob = new Blob([template], { type: "text/csv" });
		const url = window.URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "shift-types-template.csv";
		link.click();
		window.URL.revokeObjectURL(url);
	};

	const handleDuplicate = (templateId: string) => {
		duplicateMutation.mutate(templateId, {
			onSuccess: (duplicatedTemplate) => {
				if (!duplicatedTemplate?.id) return;
				openAction("edit", duplicatedTemplate.id);
			},
		});
	};

	const onSubmit = (values: TemplateFormData) => {
		const payload = {
			...values,
			description: values.description?.trim() ? values.description.trim() : undefined,
			pattern: values.pattern.map((item, index) => ({
				day: index + 1,
				shiftTypeId: item.mode === "use_shift_type" ? item.shiftTypeId || null : null,
				shiftSnapshot:
					item.mode === "manual"
						? {
								name: item.shiftSnapshot?.name || null,
								code: item.shiftSnapshot?.code || null,
								isOvernight: item.shiftSnapshot?.isOvernight || false,
								isOff: item.shiftSnapshot?.isOff || false,
								shiftHour: Number(item.shiftSnapshot?.shiftHour || 0),
								timeSlots: Array.isArray(item.shiftSnapshot?.timeSlots)
									? normalizeTimeSlots(item.shiftSnapshot.timeSlots)
									: [],
							}
						: null,
			})),
		};
		if (isEditing && id) {
			updateMutation.mutate(
				{ id, payload },
				{
					onSuccess: () => closeModal(),
				},
			);
			return;
		}

		createMutation.mutate(payload, {
			onSuccess: () => closeModal(),
		});
	};

	const items = data?.scheduleTemplates || [];
	const columns: Column<any>[] = [
		{
			key: "name",
			label: "Template",
			required: true,
			priority: "critical",
			render: (_value, item) => (
				<AdminConfigPrimaryCell
					primary={item.name}
					secondary={item.code ? <AdminConfigCodeChip>{item.code}</AdminConfigCodeChip> : null}
					title={item.name}
				/>
			),
		},
		{
			key: "cycleDays",
			label: "Cycle",
			required: true,
			priority: "high",
			render: (value) => <AdminConfigPolicyChip>{value} days</AdminConfigPolicyChip>,
		},
		{
			key: "pattern",
			label: "Pattern",
			priority: "medium",
			hideBelow: "lg",
			render: (value) => (
				<AdminConfigLongText>
					{Array.isArray(value) ? `${value.length} assigned days` : "0 assigned days"}
				</AdminConfigLongText>
			),
		},
		{
			key: "totalDay",
			label: "Work Days",
			priority: "medium",
			hideBelow: "xl",
			render: (value) => <AdminConfigCodeChip>{Number(value || 0)}</AdminConfigCodeChip>,
		},
		{
			key: "totalHour",
			label: "Total Hours",
			priority: "high",
			render: (value) => <AdminConfigCodeChip>{formatHour(value)}</AdminConfigCodeChip>,
		},
		{
			key: "isActive",
			label: "Status",
			required: true,
			priority: "critical",
			render: (value) => <CategoricalText value={value ? "Active" : "Inactive"} />,
		},
	];
	const filterOptions: FilterOption[] = [
		{
			key: "isActive",
			label: "Status",
			options: [
				{ value: "true", label: "Active" },
				{ value: "false", label: "Inactive" },
			],
		},
	];
	const shiftTypeColumns: Column<any>[] = [
		{
			key: "name",
			label: "Shift Type",
			required: true,
			priority: "critical",
			render: (_value, item) => (
				<AdminConfigPrimaryCell
					primary={item.name}
					secondary={item.code ? <AdminConfigCodeChip>{item.code}</AdminConfigCodeChip> : null}
					title={item.name}
				/>
			),
		},
		{
			key: "window",
			label: "Time Window",
			priority: "high",
			render: (_value, item) => {
				if (item.isOff) return <AdminConfigPolicyChip>Off day</AdminConfigPolicyChip>;
				const workSlots = Array.isArray(item.timeSlots)
					? item.timeSlots.filter((slot: any) => slot.type === "work")
					: [];
				if (!workSlots.length) {
					return <AdminConfigMutedDash label="Pattern-based" />;
				}
				const start = workSlots[0]?.startTime;
				const end = workSlots[workSlots.length - 1]?.endTime;
				return (
					<AdminConfigCodeChip>
						{start && end ? `${start} - ${end}` : "Pattern-based"}
					</AdminConfigCodeChip>
				);
			},
		},
		{
			key: "shiftHour",
			label: "Shift Hour",
			priority: "medium",
			hideBelow: "lg",
			render: (value) => <AdminConfigCodeChip>{formatHour(value)}</AdminConfigCodeChip>,
		},
		{
			key: "isActive",
			label: "Status",
			required: true,
			priority: "critical",
			render: (value, item) => (
				<CategoricalText value={item.isOff ? "Off" : value ? "Active" : "Inactive"} />
			),
		},
	];

	return (
		<div className="space-y-6">
			<DataTable
				title="Schedule Templates"
				data={items}
				columns={columns}
				filters={filterOptions}
				titleActions={
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-9 rounded-xl border-orange-200 text-orange-700 hover:bg-orange-50"
						onClick={() => openShiftTypeAction("list")}>
						Manage Shift Types
					</Button>
				}
				isLoading={isLoading}
				searchPlaceholder="Search schedule templates..."
				searchValue={search || ""}
				onSearch={(query) =>
					setSearchParams((prev) => {
						const next = new URLSearchParams(prev);
						if (query) next.set("search", query);
						else next.delete("search");
						next.set("page", "1");
						return next;
					})
				}
				currentPage={page}
				itemsPerPage={limit}
				totalItems={data?.pagination?.total || data?.count || items.length}
				onPageChange={(nextPage) =>
					setSearchParams((prev) => {
						const next = new URLSearchParams(prev);
						next.set("page", String(nextPage));
						return next;
					})
				}
				onAdd={() => openAction("create")}
				onImport={() => openAction("import")}
				onFilterChange={(filters) =>
					setSearchParams((prev) => {
						const next = new URLSearchParams(prev);
						if (filters.isActive) next.set("status", filters.isActive);
						else next.delete("status");
						next.set("page", "1");
						return next;
					})
				}
				filterValues={{ isActive: statusFilter || "" }}
				emptyMessage="No schedule templates yet"
				emptyDescription="Create a template or start from Migration."
				emptyActions={
					<ConfigurationEmptyGuide
						label="New template"
						to="/admin/configuration/schedule-templates?action=create"
					/>
				}
				renderActions={(item) => (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" size="sm" className="h-8 w-8 p-0">
								<MoreVertical className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-44">
							<DropdownMenuItem onClick={() => openAction("view", item.id)}>
								<Eye className="mr-2 h-4 w-4" />
								View
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => openAction("edit", item.id)}>
								<Pencil className="mr-2 h-4 w-4" />
								Edit
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => handleDuplicate(String(item.id))}>
								<Copy className="mr-2 h-4 w-4" />
								Duplicate
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => openAction("delete", item.id)}
								className="text-red-600">
								<Trash2 className="mr-2 h-4 w-4" />
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
				containedScroll
			/>

			<GenericImportModal
				open={isImportingTemplates}
				onOpenChange={(open) => {
					if (!open) closeModal();
				}}
				persistenceKey="admin-configuration-schedule-templates"
				title="Import Schedule Templates"
				description="Upload a CSV/Excel file to create or update schedule templates"
				fields={SCHEDULE_TEMPLATE_IMPORT_FIELDS}
				onDownloadTemplate={handleDownloadScheduleTemplateTemplate}
				onImport={handleImportScheduleTemplates}
				isImporting={importSchedulesMutation.isPending}
			/>

			<Modal
				open={isFormOpen}
				onOpenChange={(open) => {
					if (!open) closeModal();
				}}
				title={isEditing ? "Edit Schedule Template" : "Create Schedule Template"}
				className={SCHEDULE_MODAL_WIDE_CLASS}>
				{isEditing && isLoadingActive ? (
					<div className="py-8 text-center text-gray-500">
						Loading schedule template...
					</div>
				) : (
					<form
						onSubmit={handleSubmit(onSubmit, handleInvalidSubmit)}
						className="space-y-4">
						<div className="rounded-lg border border-border bg-white p-4 space-y-3">
							<div className="grid gap-3 sm:grid-cols-2">
								<div data-field-path="name">
									<label className="mb-0.5 block text-xs font-medium text-muted-foreground/70">
										Name
									</label>
									<Input
										{...register("name")}
										aria-invalid={Boolean(templateErrors.name)}
										placeholder="Morning Rotation"
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "1+",
												tone: watchedTemplateName.trim()
													? "default"
													: "invalid",
											},
											{ label: "A-Z", tone: "subtle" },
										]}
									/>
								</div>
								<div data-field-path="code">
									<label className="mb-0.5 block text-xs font-medium text-muted-foreground/70">
										Code
									</label>
									<Input
										{...register("code")}
										aria-invalid={Boolean(templateErrors.code)}
										placeholder="ROT_14"
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "1+",
												tone: watchedTemplateCode.trim()
													? "default"
													: "invalid",
											},
											{ label: "Aa1", tone: "subtle" },
										]}
									/>
								</div>
							</div>
							<div data-field-path="description">
								<label className="mb-0.5 block text-xs font-medium text-muted-foreground/70">
									Description
								</label>
								<Input
									{...register("description")}
									aria-invalid={Boolean(templateErrors.description)}
									placeholder="Optional description"
								/>
								<ConstraintTokenRow
									tokens={[
										{
											label: "0-160",
											tone:
												watchedTemplateDescription.length > 160
													? "invalid"
													: "subtle",
										},
									]}
								/>
							</div>
							<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_112px_132px]">
								<div data-field-path="cycleDays">
									<label className="mb-0.5 block text-xs font-medium text-muted-foreground/70">
										Cycle Days
									</label>
									<Select
										options={[
											{ value: "7", label: "1 week (7 days)" },
											{ value: "14", label: "2 weeks (14 days)" },
											{ value: "21", label: "3 weeks (21 days)" },
											{ value: "28", label: "4 weeks (28 days)" },
											{ value: "35", label: "5 weeks (35 days)" },
											{ value: "42", label: "6 weeks (42 days)" },
										]}
										value={String(watchedCycleDays || 7)}
										onChange={(value) =>
											setValue(
												"cycleDays",
												normalizeCycleDays(Number(value || 7)),
											)
										}
										name="cycleDays"
										error={Boolean(templateErrors.cycleDays)}
									/>
									<ConstraintTokenRow
										tokens={[{ label: "7-42d", tone: "default" }]}
									/>
								</div>
								<div data-field-path="graceLateMinutes">
									<label className="mb-0.5 block text-xs font-medium text-muted-foreground/70">
										Late Grace (min)
									</label>
									<Input
										type="number"
										min={0}
										aria-invalid={Boolean(templateErrors.graceLateMinutes)}
										{...register("graceLateMinutes")}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "0+",
												tone:
													watchedGraceLateMinutes == null ||
													Number(watchedGraceLateMinutes) >= 0
														? "subtle"
														: "invalid",
											},
											{ label: "+1m", tone: "subtle" },
										]}
									/>
								</div>
								<div data-field-path="graceEarlyOutMinutes">
									<label className="mb-0.5 block text-xs font-medium text-muted-foreground/70">
										Early-Out (min)
									</label>
									<Input
										type="number"
										min={0}
										aria-invalid={Boolean(templateErrors.graceEarlyOutMinutes)}
										{...register("graceEarlyOutMinutes")}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "0+",
												tone:
													watchedGraceEarlyOutMinutes == null ||
													Number(watchedGraceEarlyOutMinutes) >= 0
														? "subtle"
														: "invalid",
											},
											{ label: "+1m", tone: "subtle" },
										]}
									/>
								</div>
								<div>
									<label className="mb-0.5 block text-xs font-medium text-muted-foreground/70">
										Work Days
									</label>
									<Input
										value={String(patternTotals.totalDay)}
										disabled
										readOnly
										className="bg-muted/35"
									/>
									<ConstraintTokenRow
										tokens={[{ label: "computed", tone: "subtle" }]}
									/>
								</div>
								<div>
									<label className="mb-0.5 block text-xs font-medium text-muted-foreground/70">
										Total Hours
									</label>
									<Input
										value={formatHour(patternTotals.totalHour)}
										disabled
										readOnly
										className="bg-muted/35"
									/>
									<ConstraintTokenRow
										tokens={[{ label: "computed", tone: "subtle" }]}
									/>
								</div>
							</div>
							<label className="flex items-center gap-1.5 text-xs text-gray-700">
								<input
									type="checkbox"
									className="accent-primary h-3.5 w-3.5 rounded"
									checked={watch("isActive")}
									onChange={(event) => setValue("isActive", event.target.checked)}
								/>
								Active
							</label>
						</div>

						<div className="rounded-lg border border-border bg-white p-4 space-y-3">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-sm font-medium text-foreground">
										Pattern Builder
									</p>
								</div>
								{weekBlocks.length > 1 ? (
									<div className="flex items-center gap-1.5">
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="h-8 px-2.5 text-xs"
											onClick={() =>
												setCollapsedWeeks(
													Object.fromEntries(
														weekBlocks.map((week) => [week.id, true]),
													),
												)
											}>
											Collapse all weeks
										</Button>
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="h-8 px-2.5 text-xs"
											onClick={() =>
												setCollapsedWeeks(
													Object.fromEntries(
														weekBlocks.map((week) => [week.id, false]),
													),
												)
											}>
											Expand all
										</Button>
									</div>
								) : null}
							</div>
							{totalCollapsedWeeks > 0 ? (
								<p className="text-[11px] text-muted-foreground">
									{totalCollapsedWeeks} week{totalCollapsedWeeks > 1 ? "s" : ""}{" "}
									collapsed for faster block dragging.
								</p>
							) : null}
							<DndContext
								collisionDetection={closestCenter}
								onDragStart={handleWeekDragStart}
								onDragCancel={handleWeekDragCancel}
								onDragEnd={handleWeekDragEnd}>
								<SortableContext
									items={weekBlocks.map((week) => week.id)}
									strategy={verticalListSortingStrategy}>
									<div className="space-y-3">
										{weekBlocks.map((week) => (
											<SortableWeekBlock
												key={week.id}
												id={week.id}
												isActiveDrag={activeWeekDragId === week.id}>
												{({ attributes, listeners }) => {
													const weekPointerDownListener = (
														listeners as {
															onPointerDown?: (
																event: ReactPointerEvent,
															) => void;
														}
													).onPointerDown;
													const {
														onPointerDown: _ignoredWeekPointerDown,
														...weekDragListeners
													} =
														(listeners as {
															onPointerDown?: (
																event: ReactPointerEvent,
															) => void;
														}) || {};
													return (
														<Collapsible
															open={collapsedWeeks[week.id] !== true}
															onOpenChange={(open) =>
																setCollapsedWeeks((prev) => ({
																	...prev,
																	[week.id]: !open,
																}))
															}>
															<div className="mb-2 flex items-center justify-between rounded-md border border-dashed border-border bg-muted/25 px-2.5 py-1.5">
																<div className="flex min-w-0 items-center gap-2">
																	<button
																		type="button"
																		{...attributes}
																		{...weekDragListeners}
																		onPointerDown={(event) => {
																			previewWeekDrag(
																				week.id,
																			);
																			weekPointerDownListener?.(
																				event,
																			);
																		}}
																		className="inline-flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground active:cursor-grabbing"
																		aria-label={`Reorder Week ${week.weekIndex + 1}`}>
																		<GripVertical className="h-4 w-4" />
																	</button>
																	<div className="min-w-0">
																		<p className="text-xs font-semibold text-foreground">
																			Week{" "}
																			{week.weekIndex + 1}
																		</p>
																		<p className="text-[11px] text-muted-foreground">
																			{collapsedWeeks[
																				week.id
																			] === true
																				? "Compact block"
																				: "Monday - Sunday block"}
																		</p>
																	</div>
																</div>
																<div className="flex items-center gap-1.5">
																	<CollapsibleTrigger asChild>
																		<button
																			type="button"
																			className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground"
																			aria-label={
																				collapsedWeeks[
																					week.id
																				] === true
																					? `Expand Week ${week.weekIndex + 1}`
																					: `Collapse Week ${week.weekIndex + 1}`
																			}>
																			{collapsedWeeks[
																				week.id
																			] === true ? (
																				<ChevronRight className="h-3.5 w-3.5" />
																			) : (
																				<ChevronDown className="h-3.5 w-3.5" />
																			)}
																		</button>
																	</CollapsibleTrigger>
																	<span className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground">
																		{week.rows.length} days
																	</span>
																</div>
															</div>
															<CollapsibleContent className="space-y-2">
																<Tabs
																	value={
																		activeWeekDayTabs[
																			week.id
																		] || week.rows[0]?.rowKey
																	}
																	onValueChange={(value) =>
																		setActiveWeekDayTabs(
																			(prev) => ({
																				...prev,
																				[week.id]: value,
																			}),
																		)
																	}
																	className="w-full">
																	<div className="w-full">
																		<TabsList className="!grid !h-auto w-full grid-cols-2 gap-1 rounded-lg bg-red-50/80 p-1 sm:grid-cols-4 md:grid-cols-7">
																			{week.rows.map(
																				(row) => {
																					const rowValue =
																						watchedPattern[
																							row
																								.globalIndex
																						] || row;
																					const isManual =
																						(watch(
																							`pattern.${row.globalIndex}.mode`,
																						) ||
																							"use_shift_type") ===
																						"manual";
																					const rowSummary =
																						summarizePatternRow(
																							rowValue,
																							shiftTypeMap,
																						);
																					return (
																						<TabsTrigger
																							key={
																								row.rowKey
																							}
																							value={
																								row.rowKey
																							}
																							className="flex h-auto min-h-[68px] w-full min-w-0 flex-col items-start justify-center gap-1 overflow-hidden rounded-md border border-red-100 bg-white/70 px-2 py-2 text-left text-red-700 hover:border-red-200 hover:bg-red-50 data-[state=active]:border-red-300 data-[state=active]:bg-red-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:[&_.weekday-pill]:border-white/20 data-[state=active]:[&_.weekday-pill]:bg-white/15 data-[state=active]:[&_.weekday-pill]:text-white/90 sm:px-2.5">
																							<span className="block w-full truncate text-[11px] font-semibold leading-tight sm:text-xs">
																								{getWeekdayLabel(
																									row.localIndex,
																								)}
																							</span>
																							<span className="weekday-pill inline-flex max-w-full items-center rounded-full border border-current/10 bg-red-100/70 px-2 py-0.5 text-[10px] leading-none text-current/80 sm:text-[11px]">
																								<span className="block truncate">
																									{isManual
																										? "Manual input"
																										: rowSummary}
																								</span>
																							</span>
																						</TabsTrigger>
																					);
																				},
																			)}
																		</TabsList>
																	</div>
																	{week.rows.map((row) => {
																		const index =
																			row.globalIndex;
																		const isManual =
																			(watch(
																				`pattern.${index}.mode`,
																			) ||
																				"use_shift_type") ===
																			"manual";
																		const rowValue =
																			watchedPattern[index] ||
																			row;
																		const rowSummary =
																			summarizePatternRow(
																				rowValue,
																				shiftTypeMap,
																			);
																		return (
																			<TabsContent
																				key={row.rowKey}
																				value={row.rowKey}
																				className="mt-3">
																				<div className="rounded-lg border border-red-100 bg-red-50/40 p-3">
																					<div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
																						<div>
																							<p className="text-sm font-semibold text-red-800">
																								{getWeekdayLabel(
																									row.localIndex,
																								)}
																							</p>
																							<p className="text-[11px] text-muted-foreground">
																								Week{" "}
																								{week.weekIndex +
																									1}{" "}
																								-
																								Day{" "}
																								{index +
																									1}
																							</p>
																						</div>
																						<span className="text-[11px] text-muted-foreground">
																							{
																								rowSummary
																							}
																						</span>
																					</div>
																					<div>
																						<Select
																							options={[
																								{
																									value: "__manual__",
																									label: "Manual Input",
																								},
																								...shiftTypeOptions,
																							]}
																							value={
																								isManual
																									? "__manual__"
																									: watch(
																											`pattern.${index}.shiftTypeId`,
																										) ||
																										""
																							}
																							onChange={(
																								value,
																							) => {
																								setActiveWeekDayTabs(
																									(
																										prev,
																									) => ({
																										...prev,
																										[week.id]:
																											row.rowKey,
																									}),
																								);
																								if (
																									value ===
																									"__manual__"
																								) {
																									setValue(
																										`pattern.${index}.mode`,
																										"manual",
																									);
																									setValue(
																										`pattern.${index}.shiftTypeId`,
																										"",
																									);
																									setValue(
																										`pattern.${index}.shiftSnapshot`,
																										watch(
																											`pattern.${index}.shiftSnapshot`,
																										) ||
																											buildManualShiftSnapshot(),
																									);
																									return;
																								}
																								const nextValue =
																									String(
																										value ||
																											"",
																									);
																								setValue(
																									`pattern.${index}.mode`,
																									"use_shift_type",
																								);
																								setValue(
																									`pattern.${index}.shiftTypeId`,
																									nextValue,
																								);
																								setValue(
																									`pattern.${index}.shiftSnapshot`,
																									null,
																								);
																							}}
																							placeholder="Select shift type or Manual Input"
																						/>
																						<div className="mt-2 flex justify-end">
																							<Button
																								type="button"
																								variant="outline"
																								size="sm"
																								className="h-7 shrink-0 px-2.5 text-[11px]"
																								onClick={() =>
																									openShiftTypeAction(
																										"list",
																									)
																								}>
																								Manage
																								Shift
																								Types
																							</Button>
																						</div>
																					</div>
																					{isManual ? (
																						<div className="mt-3 rounded-md border border-red-100 bg-white p-3">
																							<ShiftSnapshotFormFields
																								control={
																									control
																								}
																								register={
																									register
																								}
																								setValue={
																									setValue
																								}
																								watch={
																									watch
																								}
																								basePath={`pattern.${index}.shiftSnapshot`}
																								defaultTimeSlots={
																									buildManualShiftSnapshot()
																										.timeSlots
																								}
																							/>
																						</div>
																					) : null}
																				</div>
																			</TabsContent>
																		);
																	})}
																</Tabs>
															</CollapsibleContent>
														</Collapsible>
													);
												}}
											</SortableWeekBlock>
										))}
									</div>
								</SortableContext>
							</DndContext>
						</div>

						<div className="flex justify-end gap-2 border-t border-border pt-3">
							<Button type="button" variant="outline" size="sm" onClick={closeModal}>
								Cancel
							</Button>
							<Button
								type="submit"
								size="sm"
								disabled={createMutation.isPending || updateMutation.isPending}>
								{(createMutation.isPending || updateMutation.isPending) && (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								)}
								{isEditing ? "Update Template" : "Create Template"}
							</Button>
						</div>
					</form>
				)}
			</Modal>

			<Modal
				open={isShiftTypeManagerOpen}
				onOpenChange={(open) => {
					if (!open) closeShiftTypeManager();
				}}
				title={
					shiftTypeAction === "create"
						? "Create Shift Type"
						: shiftTypeAction === "edit"
							? "Edit Shift Type"
							: shiftTypeAction === "view"
								? "Shift Type Details"
								: shiftTypeAction === "delete"
									? "Delete Shift Type"
									: "Manage Shift Types"
				}
				className={SCHEDULE_MODAL_WIDE_CLASS}>
				{shiftTypeAction === "list" ? (
					<div className="space-y-4">
						<DataTable
							title="Shift Types"
							data={shiftTypeManagerItems}
							columns={shiftTypeColumns}
							isLoading={isLoadingShiftTypeManager}
							searchPlaceholder="Search shift types..."
							searchValue={shiftTypeSearch || ""}
							onSearch={handleShiftTypeSearch}
							currentPage={shiftTypePage}
							itemsPerPage={shiftTypeLimit}
							totalItems={
								shiftTypeManagerData?.pagination?.total ||
								shiftTypeManagerData?.count ||
								shiftTypeManagerItems.length
							}
							onPageChange={handleShiftTypePageChange}
							onAdd={() => openShiftTypeAction("create")}
							onImport={() => openShiftTypeAction("import")}
							emptyMessage="No shift types yet"
							emptyDescription="Add a shift type, then attach it to templates."
							emptyActions={
								<ConfigurationEmptyGuide
									label="Add shift type"
									onClick={() => openShiftTypeAction("create")}
								/>
							}
							noCard
							renderActions={(item) => (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button variant="outline" size="sm" className="h-8 w-8 p-0">
											<MoreVertical className="h-4 w-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" className="w-44">
										<DropdownMenuItem
											onClick={() => openShiftTypeAction("view", item.id)}>
											<Eye className="mr-2 h-4 w-4" />
											View
										</DropdownMenuItem>
										<DropdownMenuItem
											onClick={() => openShiftTypeAction("edit", item.id)}>
											<Pencil className="mr-2 h-4 w-4" />
											Edit
										</DropdownMenuItem>
										<DropdownMenuItem
											onClick={() => openShiftTypeAction("delete", item.id)}
											className="text-red-600">
											<Trash2 className="mr-2 h-4 w-4" />
											Delete
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							)}
							containedScroll
						/>
						<div className="flex justify-end border-t border-border pt-3">
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={closeShiftTypeManager}>
								Close
							</Button>
						</div>
					</div>
				) : null}

				{isShiftTypeFormOpen ? (
					isShiftTypeEditing && isLoadingActiveShiftType ? (
						<div className="py-8 text-center text-gray-500">Loading shift type...</div>
					) : (
						<form
							onSubmit={handleShiftTypeSubmit(onSubmitShiftType)}
							className="space-y-4">
							<div className="rounded-lg border border-border bg-white p-3">
								<ShiftSnapshotFormFields
									control={shiftTypeControl}
									register={registerShiftType}
									setValue={setShiftTypeValue}
									watch={watchShiftType}
									includeIsActive
									defaultTimeSlots={(defaultShiftTypeValues.timeSlots || []).map(
										(slot) => ({
											...slot,
											label: slot.label || undefined,
										}),
									)}
								/>
							</div>

							<div className="flex justify-end gap-2 border-t border-border pt-3">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => openShiftTypeAction("list")}>
									Back
								</Button>
								<Button
									type="submit"
									size="sm"
									disabled={
										createShiftTypeMutation.isPending ||
										updateShiftTypeMutation.isPending
									}>
									{(createShiftTypeMutation.isPending ||
										updateShiftTypeMutation.isPending) && (
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									)}
									{isShiftTypeEditing ? "Update Shift Type" : "Create Shift Type"}
								</Button>
							</div>
						</form>
					)
				) : null}

				{isShiftTypeViewing ? (
					isLoadingActiveShiftType ? (
						<div className="py-8 text-center text-gray-500">Loading shift type...</div>
					) : activeShiftType ? (
						<div className="space-y-4">
							<div className="rounded-xl border border-slate-200 bg-white p-4">
								<p className="truncate text-lg font-semibold text-gray-900">
									{activeShiftType.name}
								</p>
								<p className="truncate text-sm text-gray-500">
									{activeShiftType.code}
								</p>
							</div>
							<div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 text-sm text-gray-700">
								<div className="flex items-center gap-2">
									<span>Overnight:</span>
									<CategoricalText
										value={activeShiftType.isOvernight ? "Yes" : "No"}
									/>
								</div>
								<div className="flex items-center gap-2">
									<span>Off Day:</span>
									<CategoricalText value={activeShiftType.isOff ? "Yes" : "No"} />
								</div>
								<p>Shift Hour: {formatHour(activeShiftType.shiftHour)}</p>
							</div>
							<div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
								<p className="text-sm font-medium text-gray-900">Time Slots</p>
								{activeShiftType.timeSlots?.length ? (
									activeShiftType.timeSlots.map((slot, index) => (
										<div
											key={`${slot.type}-${index}`}
											className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-gray-700">
											{slot.type} • {slot.label || "No label"} •{" "}
											{slot.startTime} - {slot.endTime}
										</div>
									))
								) : (
									<p className="text-sm text-gray-500">
										No time slots configured.
									</p>
								)}
							</div>
							<div className="flex justify-end gap-2 border-t border-border pt-3">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => openShiftTypeAction("list")}>
									Back
								</Button>
							</div>
						</div>
					) : (
						<div className="space-y-4">
							<div className="py-8 text-center text-gray-500">
								Shift type not found.
							</div>
							<div className="flex justify-end border-t border-border pt-3">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => openShiftTypeAction("list")}>
									Back
								</Button>
							</div>
						</div>
					)
				) : null}

				{isShiftTypeDeleting ? (
					isLoadingActiveShiftType ? (
						<div className="py-8 text-center text-gray-500">Loading shift type...</div>
					) : activeShiftType ? (
						<div className="space-y-5">
							<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
								Delete <strong>{activeShiftType.name}</strong> (
								{activeShiftType.code})?
							</div>
							<div className="flex justify-end gap-3">
								<Button
									type="button"
									variant="outline"
									onClick={() => openShiftTypeAction("list")}>
									Cancel
								</Button>
								<Button
									type="button"
									variant="destructive"
									disabled={deleteShiftTypeMutation.isPending}
									onClick={() =>
										deleteShiftTypeMutation.mutate(activeShiftType.id, {
											onSuccess: () => openShiftTypeAction("list"),
										})
									}>
									{deleteShiftTypeMutation.isPending ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											Deleting...
										</>
									) : (
										"Delete Shift Type"
									)}
								</Button>
							</div>
						</div>
					) : (
						<div className="space-y-4">
							<div className="py-8 text-center text-gray-500">
								Shift type not found.
							</div>
							<div className="flex justify-end border-t border-border pt-3">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => openShiftTypeAction("list")}>
									Back
								</Button>
							</div>
						</div>
					)
				) : null}
			</Modal>

			<GenericImportModal
				open={shiftTypeAction === "import"}
				onOpenChange={(open) => {
					if (!open) {
						setSearchParams((prev) => {
							const next = new URLSearchParams(prev);
							next.delete("shiftTypeAction");
							next.delete("shiftTypeId");
							return next;
						});
					}
				}}
				persistenceKey="admin-configuration-shift-types"
				title="Import Shift Types"
				description="Upload a CSV/Excel file to create or update shift types"
				fields={SHIFT_TYPE_IMPORT_FIELDS}
				onDownloadTemplate={handleDownloadShiftTypeTemplate}
				onImport={handleImportShiftTypes}
				isImporting={importShiftTypesMutation.isPending}
			/>

			<Modal
				open={isViewing}
				onOpenChange={(open) => {
					if (!open) closeModal();
				}}
				title="Schedule Template Details"
				description="Review the selected template and its pattern."
				className={SCHEDULE_MODAL_STANDARD_CLASS}>
				{isLoadingActive ? (
					<div className="py-8 text-center text-gray-500">Loading template...</div>
				) : activeItem ? (
					<div className="space-y-4">
						<div className="rounded-xl border border-slate-200 bg-white p-4">
							<p className="text-lg font-semibold text-gray-900">{activeItem.name}</p>
							<p className="text-sm text-gray-500">{activeItem.code}</p>
							<p className="mt-2 text-sm text-gray-700">
								{activeItem.description || "No description"}
							</p>
						</div>
						<div className="grid grid-cols-3 gap-3">
							<div className="rounded-xl border border-slate-200 bg-white p-4">
								<p className="text-xs font-medium uppercase tracking-wide text-gray-500">
									Cycle
								</p>
								<p className="mt-1 text-sm font-semibold text-gray-900">
									{activeItem.cycleDays} day{activeItem.cycleDays > 1 ? "s" : ""}
								</p>
							</div>
							<div className="rounded-xl border border-slate-200 bg-white p-4">
								<p className="text-xs font-medium uppercase tracking-wide text-gray-500">
									Late Grace
								</p>
								<p className="mt-1 text-sm font-semibold text-gray-900">
									{Number(activeItem.graceLateMinutes || 0)} min
								</p>
							</div>
							<div className="rounded-xl border border-slate-200 bg-white p-4">
								<p className="text-xs font-medium uppercase tracking-wide text-gray-500">
									Early-Out
								</p>
								<p className="mt-1 text-sm font-semibold text-gray-900">
									{Number(activeItem.graceEarlyOutMinutes || 0)} min
								</p>
							</div>
						</div>
						<div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
							<div className="flex items-center justify-between gap-3">
								<p className="text-sm font-medium text-gray-900">Pattern Summary</p>
								<CategoricalText
									value={activeItem.isActive ? "Active" : "Inactive"}
								/>
							</div>
							<div className="space-y-3">
								{buildTemplatePatternWeeks(activeItem.pattern).map((week) => (
									<div
										key={week.id}
										className="rounded-xl border border-slate-200 bg-slate-50 p-3">
										<div className="mb-2 flex items-center justify-between gap-2">
											<p className="text-sm font-semibold text-gray-900">
												Week {week.weekIndex + 1}
											</p>
											<p className="text-xs text-gray-500">
												{week.rows.length} day
												{week.rows.length > 1 ? "s" : ""}
											</p>
										</div>
										<div className="grid gap-2 md:grid-cols-2">
											{week.rows.map(({ item, label }, rowIndex) => (
												<div
													key={`${week.id}-${rowIndex}-${item?.day ?? rowIndex}`}
													className="rounded-lg border border-slate-200 bg-white px-3 py-2">
													<div className="flex items-center justify-between gap-2">
														<p className="text-sm font-medium text-gray-900">
															{label}
														</p>
														<p className="text-xs text-gray-500">
															Day {Number(item?.day || rowIndex + 1)}
														</p>
													</div>
													<p className="mt-1 text-sm text-gray-700">
														{summarizeTemplatePatternItem(
															item,
															shiftTypeMap,
														)}
													</p>
												</div>
											))}
										</div>
									</div>
								))}
							</div>
						</div>
						<div className="flex justify-end">
							<Button onClick={closeModal}>Close</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Template not found.</div>
				)}
			</Modal>

			<Modal
				open={isDeleting}
				onOpenChange={(open) => {
					if (!open) closeModal();
				}}
				title="Delete Schedule Template"
				description="This permanently removes the selected schedule template."
				className={SCHEDULE_MODAL_NARROW_CLASS}>
				{activeItem ? (
					<div className="space-y-5">
						<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
							Delete <strong>{activeItem.name}</strong> ({activeItem.code})?
						</div>
						<div className="flex justify-end gap-3">
							<Button type="button" variant="outline" onClick={closeModal}>
								Cancel
							</Button>
							<Button
								type="button"
								variant="destructive"
								disabled={deleteMutation.isPending}
								onClick={() =>
									deleteMutation.mutate(activeItem.id, {
										onSuccess: () => closeModal(),
									})
								}>
								{deleteMutation.isPending ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Deleting...
									</>
								) : (
									"Delete Template"
								)}
							</Button>
						</div>
					</div>
				) : null}
			</Modal>
		</div>
	);
}
