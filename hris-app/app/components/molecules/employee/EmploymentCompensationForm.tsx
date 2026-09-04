import type { UseFormReturn } from "react-hook-form";
import { Controller, useForm } from "react-hook-form";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Loader2, RotateCcw, ShieldCheck, Building2, Award, ArrowRight } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { Select } from "~/components/atoms/Select";
import { SearchableSelect } from "~/components/ui/searchable-select";
import { CalendarDatePicker } from "~/components/ui/calendar-date-picker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/atoms/Card";
import { ShiftSnapshotFormFields } from "~/components/organisms/schedule/ShiftSnapshotFormFields";
import type { FormData } from "~/types/employee-form.types";
import { useDepartment, useDepartments } from "~/lib/hooks/useDepartments";
import { useSections } from "~/lib/hooks/useSections";
import { usePositions } from "~/lib/hooks/usePositions";
import { useLevel, useLevels } from "~/lib/hooks/useLevels";
import { useAgencies } from "~/lib/hooks/useAgencies";
import { useScheduleTemplates, useShiftTypes } from "~/lib/hooks/useSchedules";
import { deriveRoleAndFlags } from "~/lib/utils/role-derivation";
import { EmployeePickerSelect } from "~/components/molecules/employee/EmployeePickerSelect";

interface EmploymentCompensationFormProps {
	form: UseFormReturn<FormData>;
	employeeId?: string;
	isEmployeeIdLoading?: boolean;
	onRegenerateEmployeeId?: () => void;
	onCreateDepartment?: () => void;
	onCreatePosition?: () => void;
}

const employmentStatusOptions = [
	{ value: "ACTIVE", label: "Active" },
	{ value: "ONBOARDING", label: "Onboarding" },
	{ value: "INACTIVE", label: "Inactive" },
	{ value: "ON_LEAVE", label: "On Leave" },
	{ value: "TERMINATED", label: "Terminated" },
	{ value: "RESIGNED", label: "Resigned" },
	{ value: "RETIRED", label: "Retired" },
];

const employmentTypeOptions = [
	{ value: "PROBATIONARY", label: "Probationary" },
	{ value: "REGULAR", label: "Regular" },
	{ value: "CONTRACTUAL", label: "Contractual" },
	{ value: "PART_TIME", label: "Part-Time" },
	{ value: "CONSULTANT", label: "Consultant" },
	{ value: "INTERN", label: "Intern" },
];

const currencyOptions = [
	{ value: "PHP", label: "PHP" },
	{ value: "USD", label: "USD" },
	{ value: "EUR", label: "EUR" },
];

const payFrequencyOptions = [
	{ value: "SEMI_MONTHLY", label: "Semi-Monthly" },
	{ value: "MONTHLY", label: "Monthly" },
	{ value: "BIWEEKLY", label: "Bi-weekly" },
	{ value: "WEEKLY", label: "Weekly" },
	{ value: "DAILY", label: "Daily" },
];

const workLocationOptions = [
	{ value: "ONSITE", label: "Onsite" },
	{ value: "REMOTE", label: "Remote" },
	{ value: "HYBRID", label: "Hybrid" },
];

const workforceSourceOptions = [
	{ value: "DIRECT", label: "Direct" },
	{ value: "AGENCY", label: "Agency" },
];

const WEEK_OPTIONS = [
	{ value: "7", label: "1 week" },
	{ value: "14", label: "2 weeks" },
	{ value: "21", label: "3 weeks" },
	{ value: "28", label: "4 weeks" },
];

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MANUAL_DAY_SHIFT_NAME = "Manual Day Shift";
const MANUAL_DAY_SHIFT_CODE = "MANUAL_DAY_8_5";
const MANUAL_DAY_TIME_SLOTS = [
	{ type: "work", label: "Morning Work", startTime: "08:00", endTime: "12:00" },
	{ type: "break", label: "Lunch Break", startTime: "12:00", endTime: "13:00" },
	{ type: "work", label: "Afternoon Work", startTime: "13:00", endTime: "17:00" },
];

type EditableShiftTimeSlot = {
	type: string;
	label?: string;
	startTime: string;
	endTime: string;
};

type EditableShiftSnapshot = {
	name?: string | null;
	code?: string | null;
	isOvernight?: boolean;
	isOff?: boolean;
	timeSlots: EditableShiftTimeSlot[];
};

type ShiftTypeOptionSource = {
	id?: string;
	_id?: string;
	name?: string | null;
	code?: string | null;
	isOvernight?: boolean;
	isOff?: boolean;
	timeSlots?: EditableShiftTimeSlot[] | null;
};

const buildManualShiftSnapshot = (): EditableShiftSnapshot => ({
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

const buildPatternDay = (day: number, snapshot?: ReturnType<typeof buildManualShiftSnapshot>) => ({
	day,
	shiftTypeId: "",
	shiftSnapshot: snapshot || buildManualShiftSnapshot(),
});

const normalizePatternForCycleDays = (pattern: any, cycleDays: number) => {
	const safePattern = Array.isArray(pattern) ? pattern : [];
	return Array.from({ length: cycleDays }).map((_, index) => {
		const day = index + 1;
		const existing =
			safePattern.find((item: any) => Number(item?.day) === day) ||
			safePattern[index] ||
			null;
		if (!existing) return buildPatternDay(day);
		return {
			day,
			shiftTypeId: existing?.shiftTypeId ? String(existing.shiftTypeId) : "",
			shiftSnapshot: existing?.shiftSnapshot
				? cloneManualShiftSnapshot(existing.shiftSnapshot)
				: buildManualShiftSnapshot(),
		};
	});
};

const buildDefaultActiveSchedule = (effectiveStartDate = "") => ({
	effectiveStartDate,
	scheduleTemplateId: "",
	scheduleTemplateCode: "",
	scheduleTemplateName: "",
	cycleDays: 7,
	graceLateMinutes: 15,
	graceEarlyOutMinutes: 0,
	pattern: normalizePatternForCycleDays([], 7),
});

const addMonthsToDateInputValue = (value: string, months: number) => {
	const [year, month, day] = String(value || "")
		.split("-")
		.map((part) => Number(part));
	if (!year || !month || !day) return "";
	const date = new Date(Date.UTC(year, month - 1, day));
	if (Number.isNaN(date.getTime())) return "";
	date.setUTCMonth(date.getUTCMonth() + months);
	return date.toISOString().slice(0, 10);
};

const mapTemplatePatternToEmployeePattern = (template: any, cycleDays: number) =>
	normalizePatternForCycleDays(
		Array.isArray(template?.pattern)
			? template.pattern.map((item: any) => ({
					day: Number(item?.day || 0),
					shiftTypeId: item?.shiftTypeId ? String(item.shiftTypeId) : "",
					shiftSnapshot: item?.shiftSnapshot || buildManualShiftSnapshot(),
				}))
			: [],
		cycleDays,
	);

const cloneManualShiftSnapshot = (snapshot: any) => {
	const useManualDayDefault = shouldUseManualDayDefault(snapshot);

	return {
		...(useManualDayDefault ? buildManualShiftSnapshot() : {}),
		name: useManualDayDefault
			? MANUAL_DAY_SHIFT_NAME
			: snapshot?.name || MANUAL_DAY_SHIFT_NAME,
		code: useManualDayDefault
			? MANUAL_DAY_SHIFT_CODE
			: snapshot?.code || MANUAL_DAY_SHIFT_CODE,
		isOvernight: useManualDayDefault ? false : Boolean(snapshot?.isOvernight),
		isOff: Boolean(snapshot?.isOff),
		timeSlots: useManualDayDefault
			? buildManualShiftSnapshot().timeSlots
			: Array.isArray(snapshot?.timeSlots) && snapshot.timeSlots.length > 0
				? snapshot.timeSlots.map((slot: any) => ({
						type: String(slot?.type || "work"),
						label: slot?.label ? String(slot.label) : "",
						startTime: String(slot?.startTime || "00:00"),
						endTime: String(slot?.endTime || "00:00"),
					}))
				: buildManualShiftSnapshot().timeSlots,
	};
};

export function EmploymentCompensationForm({
	form,
	employeeId,
	isEmployeeIdLoading = false,
	onRegenerateEmployeeId,
	onCreateDepartment,
	onCreatePosition,
}: EmploymentCompensationFormProps) {
	const {
		register,
		control,
		formState: { errors },
		watch,
		setValue,
		getValues,
		clearErrors,
	} = form;

	const { data: departmentsData } = useDepartments({ page: 1, limit: 1000 });
	const { data: sectionsData } = useSections({ page: 1, limit: 1000, count: true });
	const { data: positionsData } = usePositions({ page: 1, limit: 1000 });
	const { data: levelsData } = useLevels({ page: 1, limit: 1000 });
	const { data: agenciesData } = useAgencies({ page: 1, limit: 1000, filter: "status:ACTIVE" });
	const getEmployeeErrorMessage = (field: keyof FormData["employee"]) => {
		const message = (errors.employee as Record<string, { message?: unknown }> | undefined)?.[
			field
		]?.message;
		return typeof message === "string" ? message : "";
	};
	const { data: scheduleTemplatesData } = useScheduleTemplates({
		page: 1,
		limit: 1000,
	});
	const { data: shiftTypesData } = useShiftTypes(
		{ page: 1, limit: 1000, document: true, count: true },
		{ enabled: true },
	);

	const departments = (departmentsData as any)?.departments || [];
	const sectionsLoaded = Array.isArray((sectionsData as any)?.sections);
	const sections = sectionsLoaded ? (sectionsData as any).sections : [];
	const positions = (positionsData as any)?.positions || [];
	const levels = useMemo(() => (levelsData as any)?.levels || [], [levelsData]);
	const agencies = useMemo(() => (agenciesData as any)?.agencies || [], [agenciesData]);
	const scheduleTemplates = useMemo(() => {
		const payload = scheduleTemplatesData as any;
		if (Array.isArray(payload)) return payload;
		if (Array.isArray(payload?.scheduleTemplates)) return payload.scheduleTemplates;
		if (Array.isArray(payload?.data)) return payload.data;
		if (Array.isArray(payload?.data?.scheduleTemplates)) return payload.data.scheduleTemplates;
		return [];
	}, [scheduleTemplatesData]);
	const shiftTypes = useMemo<ShiftTypeOptionSource[]>(() => {
		const payload = shiftTypesData as any;
		if (Array.isArray(payload)) return payload;
		if (Array.isArray(payload?.shiftTypes)) return payload.shiftTypes;
		if (Array.isArray(payload?.data)) return payload.data;
		if (Array.isArray(payload?.data?.shiftTypes)) return payload.data.shiftTypes;
		return [];
	}, [shiftTypesData]);
	const shiftTypeOptions = useMemo(
		() => [
			{ value: "__manual__", label: "Manual Input" },
			...shiftTypes.map((shiftType: any) => ({
				value: String(shiftType._id || shiftType.id),
				label: `${shiftType.name} (${shiftType.code})`,
			})),
		],
		[shiftTypes],
	);
	const shiftTypeMap = useMemo<Map<string, ShiftTypeOptionSource>>(
		() =>
			new Map(
				shiftTypes.map((shiftType: any) => [
					String(shiftType._id || shiftType.id),
					shiftType,
				]),
			),
		[shiftTypes],
	);
	const selectedWorkforceSource = watch("employee.workforceSource") || "DIRECT";
	const selectedEmploymentType = watch("employee.employmentType") || "";
	const hireDate = watch("employee.employmentHireDate") || "";
	const employmentStartDate = watch("employee.employmentStartDate") || "";
	const activeSchedule = watch("employee.activeSchedule");
	const lastAutoProbationEndDateRef = useRef("");

	// Custom schedule state - DEBUG MODE: set ?debug=true in URL to enable
	const [searchParams] = useSearchParams();
	const DEBUG = searchParams.get("debug") === "true";
	const [manualDayModalIndex, setManualDayModalIndex] = useState<number | null>(null);
	const manualDayModalForm = useForm({
		defaultValues: buildManualShiftSnapshot(),
	});
	const {
		control: manualDayModalControl,
		register: manualDayModalRegister,
		setValue: setManualDayModalValue,
		watch: watchManualDayModal,
		reset: resetManualDayModal,
		handleSubmit: handleManualDayModalSubmit,
	} = manualDayModalForm;

	// Auto-select first level (for DEBUG mode)
	useEffect(() => {
		if (DEBUG && levels.length > 0 && !watch("employee.levelId")) {
			const firstLevel = levels[0];
			setValue("employee.levelId", firstLevel._id || firstLevel.id);
			console.log("[ok] Auto-selected first level:", firstLevel.name);
		}
	}, [levels, DEBUG, setValue, watch]);


	useEffect(() => {
		const current = getValues("employee.activeSchedule");
		if (current) return;
		setValue(
			"employee.activeSchedule",
			buildDefaultActiveSchedule(employmentStartDate || hireDate),
			{ shouldDirty: false },
		);
	}, [employmentStartDate, hireDate, getValues, setValue]);

	useEffect(() => {
		if (!activeSchedule) return;
		const cycleDays = [7, 14, 21, 28].includes(Number(activeSchedule.cycleDays))
			? Number(activeSchedule.cycleDays)
			: 7;
		const normalizedPattern = normalizePatternForCycleDays(activeSchedule.pattern, cycleDays);
		const shouldNormalize =
			Number(activeSchedule.cycleDays || 0) !== cycleDays ||
			normalizedPattern.some((item, index) => {
				const currentItem = activeSchedule.pattern?.[index];
				return (
					Number(currentItem?.day || 0) !== item.day ||
					String(currentItem?.shiftTypeId || "") !== String(item.shiftTypeId || "") ||
					Boolean(currentItem?.shiftSnapshot) !== Boolean(item.shiftSnapshot)
				);
			}) ||
			(activeSchedule.pattern?.length || 0) !== normalizedPattern.length;
		if (!shouldNormalize) return;
		setValue(
			"employee.activeSchedule",
			{
				...activeSchedule,
				cycleDays,
				pattern: normalizedPattern,
			} as any,
			{ shouldDirty: false },
		);
	}, [activeSchedule, setValue]);

	useEffect(() => {
		if (manualDayModalIndex === null) return;
		const snapshot =
			activeSchedule?.pattern?.[manualDayModalIndex]?.shiftSnapshot ||
			buildManualShiftSnapshot();
		resetManualDayModal(cloneManualShiftSnapshot(snapshot));
	}, [activeSchedule?.pattern, manualDayModalIndex, resetManualDayModal]);

	useEffect(() => {
		if (selectedWorkforceSource !== "AGENCY") {
			setValue("employee.agencyId", null);
		}
	}, [selectedWorkforceSource, setValue]);

	useEffect(() => {
		const currentProbationEndDate = String(
			getValues("employee.probationEndDate") || "",
		).trim();
		if (selectedEmploymentType !== "PROBATIONARY") {
			if (currentProbationEndDate === lastAutoProbationEndDateRef.current) {
				setValue("employee.probationEndDate", undefined, { shouldDirty: false });
			}
			lastAutoProbationEndDateRef.current = "";
			return;
		}

		const baseDate = employmentStartDate || hireDate;
		const nextProbationEndDate = addMonthsToDateInputValue(baseDate, 6);
		if (!nextProbationEndDate) return;

		if (
			!currentProbationEndDate ||
			currentProbationEndDate === lastAutoProbationEndDateRef.current
		) {
			setValue("employee.probationEndDate", nextProbationEndDate, {
				shouldDirty: false,
			});
			lastAutoProbationEndDateRef.current = nextProbationEndDate;
		}
	}, [
		employmentStartDate,
		getValues,
		hireDate,
		selectedEmploymentType,
		setValue,
	]);

	if (DEBUG) {
		console.log("EmploymentCompensationForm Debug:", activeSchedule);
	}

	const MANUAL_TEMPLATE_VALUE = "__manual__";

	const templateDropdownOptions = useMemo(
		() => [
			{ value: MANUAL_TEMPLATE_VALUE, label: "Manual Shift" },
			...scheduleTemplates.map((sched: any) => ({
				value: String(sched._id || sched.id),
				label: `${sched.name} (${sched.code})`,
			})),
		],
		[scheduleTemplates],
	);

	const applyTemplateSelection = (scheduleId: string) => {
		setManualDayModalIndex(null);
		if (!scheduleId || scheduleId === MANUAL_TEMPLATE_VALUE) {
			const clearedValue = {
				...(activeSchedule || buildDefaultActiveSchedule(employmentStartDate || hireDate)),
				scheduleTemplateId: "",
				scheduleTemplateCode: "",
				scheduleTemplateName: "",
			};
			setValue("employee.activeSchedule", clearedValue as any, { shouldDirty: true });
			clearErrors("employee.activeSchedule");
			return;
		}
		const selectedTemplate = scheduleTemplates.find(
			(s: any) => String(s._id || s.id) === String(scheduleId),
		);
		if (!selectedTemplate) return;
		const cycleDays = [7, 14, 21, 28].includes(Number(selectedTemplate.cycleDays))
			? Number(selectedTemplate.cycleDays)
			: 7;
		const nextValue = {
			...(activeSchedule || buildDefaultActiveSchedule(employmentStartDate || hireDate)),
			effectiveStartDate: employmentStartDate || hireDate || "",
			scheduleTemplateId: String(selectedTemplate._id || selectedTemplate.id),
			scheduleTemplateCode: selectedTemplate.code || "",
			scheduleTemplateName: selectedTemplate.name || "",
			cycleDays,
			graceLateMinutes: Number(selectedTemplate.graceLateMinutes ?? 15),
			graceEarlyOutMinutes: Number(selectedTemplate.graceEarlyOutMinutes ?? 0),
			pattern: mapTemplatePatternToEmployeePattern(selectedTemplate, cycleDays),
		};
		setValue("employee.activeSchedule", nextValue as any, { shouldDirty: true });
		clearErrors("employee.activeSchedule");
	};

	const handleWeekChange = (value: string) => {
		setManualDayModalIndex(null);
		const cycleDays = [7, 14, 21, 28].includes(Number(value)) ? Number(value) : 7;
		const nextValue = {
			...(activeSchedule || buildDefaultActiveSchedule(employmentStartDate || hireDate)),
			cycleDays,
			pattern: normalizePatternForCycleDays(activeSchedule?.pattern, cycleDays),
		};
		setValue("employee.activeSchedule", nextValue as any, { shouldDirty: true });
		clearErrors("employee.activeSchedule");
	};

	const handleDaySourceChange = (index: number, value: string) => {
		if (value === "__manual__") {
			setValue(`employee.activeSchedule.pattern.${index}.shiftTypeId`, "", {
				shouldDirty: true,
			});
			if (!watch(`employee.activeSchedule.pattern.${index}.shiftSnapshot`)) {
				setValue(
					`employee.activeSchedule.pattern.${index}.shiftSnapshot`,
					buildManualShiftSnapshot(),
					{ shouldDirty: true },
				);
			}
			setManualDayModalIndex(index);
			return;
		}

		// Copy shift-type template into day snapshot (no assignment link).
		const selectedShiftType = value ? shiftTypeMap.get(String(value)) : null;
		if (selectedShiftType) {
			setValue(
				`employee.activeSchedule.pattern.${index}.shiftSnapshot`,
				{
					name: selectedShiftType.name || "",
					code: selectedShiftType.code || "",
					isOvernight: Boolean(selectedShiftType.isOvernight),
					isOff: Boolean(selectedShiftType.isOff),
					timeSlots: Array.isArray(selectedShiftType.timeSlots)
						? selectedShiftType.timeSlots.map((slot: any) => ({
								type: String(slot?.type || "work"),
								label: slot?.label ? String(slot.label) : "",
								startTime: String(slot?.startTime || "00:00"),
								endTime: String(slot?.endTime || "00:00"),
							}))
						: buildManualShiftSnapshot().timeSlots,
				},
				{ shouldDirty: true },
			);
		}
		setValue(`employee.activeSchedule.pattern.${index}.shiftTypeId`, "", {
			shouldDirty: true,
		});
		if (manualDayModalIndex === index) {
			setManualDayModalIndex(null);
		}
	};

	const handleDayCardClick = (index: number) => {
		const dayConfig = activeSchedule?.pattern?.[index];
		if (!dayConfig) return;
		setManualDayModalIndex(index);
	};

	const closeManualDayModal = () => {
		setManualDayModalIndex(null);
		resetManualDayModal(buildManualShiftSnapshot());
	};

	const applyManualDayChanges = handleManualDayModalSubmit((values) => {
		if (manualDayModalIndex === null) return;
		setValue(`employee.activeSchedule.pattern.${manualDayModalIndex}.shiftTypeId`, "", {
			shouldDirty: true,
		});
		setValue(
			`employee.activeSchedule.pattern.${manualDayModalIndex}.shiftSnapshot`,
			cloneManualShiftSnapshot(values),
			{ shouldDirty: true },
		);
		setManualDayModalIndex(null);
	});

	// Watch department + level IDs, fetch the exact records by ID, then derive role.
	const watchedDeptId = watch("employee.departmentId");
	const watchedSectionId = watch("employee.sectionId");
	const watchedPositionId = watch("employee.positionId");
	const watchedLevelId = watch("employee.levelId");
	const { data: selectedDeptData } = useDepartment(watchedDeptId || "");
	const { data: selectedLevelData } = useLevel(watchedLevelId || "");

	const selectedDept = useMemo(() => {
		const record = selectedDeptData as any;
		if (!record) return null;
		const recordId = record._id || record.id;
		return String(recordId || "") === String(watchedDeptId || "") ? record : null;
	}, [selectedDeptData, watchedDeptId]);

	const selectedLevel = useMemo(() => {
		const record = selectedLevelData as any;
		if (!record) return null;
		const recordId = record._id || record.id;
		return String(recordId || "") === String(watchedLevelId || "") ? record : null;
	}, [selectedLevelData, watchedLevelId]);

	const selectedPosition = useMemo(
		() =>
			positions.find(
				(position: any) =>
					String(position._id || position.id || "") === String(watchedPositionId || ""),
			) || null,
		[positions, watchedPositionId],
	);

	const derivedResult = useMemo(
		() =>
			selectedDept && (selectedLevel || selectedPosition)
				? deriveRoleAndFlags({
						department: selectedDept as { isHr?: boolean | string | null },
						level: selectedLevel as { isManager?: boolean | string | null },
						position: selectedPosition as { isManager?: boolean | string | null },
					})
				: null,
		[selectedDept, selectedLevel, selectedPosition],
	);

	const filteredSections = useMemo(
		() =>
			sections.filter(
				(section: any) =>
					section.isActive !== false &&
					(!watchedDeptId || String(section.departmentId) === String(watchedDeptId)),
			),
		[sections, watchedDeptId],
	);

	useEffect(() => {
		if (!sectionsLoaded) return;
		const currentSectionId = getValues("employee.sectionId");
		if (
			currentSectionId &&
			!filteredSections.some(
				(section: any) => String(section._id || section.id || "") === String(currentSectionId),
			)
		) {
			setValue("employee.sectionId", null, { shouldDirty: true });
		}
	}, [filteredSections, getValues, sectionsLoaded, setValue]);

	useEffect(() => {
		if (!watchedDeptId) return;
		if (!selectedDept?.scheduleId) return;
		const currentActiveSchedule = getValues("employee.activeSchedule");
		if (currentActiveSchedule?.scheduleTemplateId) return;
		applyTemplateSelection(String(selectedDept.scheduleId));
	}, [selectedDept, watchedDeptId, getValues]);

	useEffect(() => {
		if (!watchedDeptId || (!watchedLevelId && !watchedPositionId) || !derivedResult) {
			setValue("employee.isManager", false);
			setValue("employee.isHrManager" as any, false);
			setValue("employee.derivedRole" as any, undefined);
			return;
		}

		setValue("employee.isManager", derivedResult.isManager);
		setValue("employee.isHrManager" as any, derivedResult.isHrManager);
		setValue("employee.derivedRole" as any, derivedResult.role);

		console.info("[ROLE_DERIVATION][UI][Employment]", {
			departmentId: watchedDeptId,
			levelId: watchedLevelId,
			positionId: watchedPositionId,
			departmentKeys: selectedDept ? Object.keys(selectedDept) : [],
			levelKeys: selectedLevel ? Object.keys(selectedLevel) : [],
			positionKeys: selectedPosition ? Object.keys(selectedPosition) : [],
			departmentIsHr: selectedDept?.isHr,
			levelIsManager: selectedLevel?.isManager,
			positionIsManager: selectedPosition?.isManager,
			derivedRole: derivedResult.role,
			derivedFlags: {
				isManager: derivedResult.isManager,
				isHrManager: derivedResult.isHrManager,
			},
		});

		if (DEBUG) console.log("Derived role:", derivedResult.role, "flags:", derivedResult);
	}, [
		derivedResult,
		setValue,
		DEBUG,
		watchedDeptId,
		watchedLevelId,
		watchedPositionId,
		selectedDept,
		selectedLevel,
		selectedPosition,
	]);

	return (
		<div className="space-y-8">
			{/* Header */}
			<div>
				<h2 className="text-2xl font-bold tracking-tight text-foreground">
					Employment Info
				</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Job assignment, salary, and pay rules
				</p>
			</div>
			{/* Employment Details Section */}
			<div className="space-y-6">
				<h3 className="text-lg font-semibold text-foreground">Employment Details</h3>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
					<div data-field-path="employee.employeeId">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Employee ID *
						</label>
						<div className="mt-1 flex items-center gap-2">
							<input
								id="employeeId"
								type="text"
								placeholder={
									isEmployeeIdLoading ? "Generating Employee ID..." : "EMP001"
								}
								disabled={isEmployeeIdLoading}
								className={`w-full rounded-md border ${
									errors.employee?.employeeId
										? "border-red-300 focus:border-red-500"
										: "border-border"
								} bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-70`}
								{...register("employee.employeeId", {
									required: true,
								})}
							/>
							<button
								type="button"
								onClick={onRegenerateEmployeeId}
								disabled={isEmployeeIdLoading || !onRegenerateEmployeeId}
								aria-label="Regenerate employee ID"
								className={`h-10 w-10 shrink-0 rounded-md border flex items-center justify-center ${
									isEmployeeIdLoading
										? "border-orange-200 bg-orange-50"
										: "border-border bg-muted/20 hover:bg-muted/40"
								}`}>
								{isEmployeeIdLoading ? (
									<Loader2 className="h-4 w-4 animate-spin text-orange-500" />
								) : (
									<RotateCcw className="h-4 w-4 text-muted-foreground" />
								)}
							</button>
						</div>
						{getEmployeeErrorMessage("employeeId") ? (
							<p className="mt-1 text-sm text-red-600">
								{getEmployeeErrorMessage("employeeId")}
							</p>
						) : null}
						{isEmployeeIdLoading && (
							<p className="mt-1 text-xs text-muted-foreground">
								Reserving unique employee ID...
							</p>
						)}
					</div>

					<div data-field-path="employee.employmentHireDate">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Hire Date *
						</label>
						<Controller
							name="employee.employmentHireDate"
							control={control}
							rules={{ required: true }}
							render={({ field }) => (
								<CalendarDatePicker
									value={field.value || ""}
									onChange={field.onChange}
									className={
										errors.employee?.employmentHireDate
											? "mt-1 border-red-300 focus:border-red-500 focus-visible:ring-red-500/20"
											: "mt-1"
									}
								/>
							)}
						/>
						{getEmployeeErrorMessage("employmentHireDate") ? (
							<p className="mt-1 text-sm text-red-600">
								{getEmployeeErrorMessage("employmentHireDate")}
							</p>
						) : null}
					</div>

					<div data-field-path="employee.employmentStartDate">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Start Date *
						</label>
						<Controller
							name="employee.employmentStartDate"
							control={control}
							rules={{ required: true }}
							render={({ field }) => (
								<CalendarDatePicker
									value={field.value || ""}
									onChange={field.onChange}
									className={
										errors.employee?.employmentStartDate
											? "mt-1 border-red-300 focus:border-red-500 focus-visible:ring-red-500/20"
											: "mt-1"
									}
								/>
							)}
						/>
						{getEmployeeErrorMessage("employmentStartDate") ? (
							<p className="mt-1 text-sm text-red-600">
								{getEmployeeErrorMessage("employmentStartDate")}
							</p>
						) : null}
					</div>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div data-field-path="employee.employmentStatus">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Employment Status *
						</label>
						<Controller
							name="employee.employmentStatus"
							control={control}
							rules={{ required: true }}
							render={({ field }) => (
								<SearchableSelect
									options={employmentStatusOptions}
									value={field.value}
									onValueChange={field.onChange}
									placeholder="Select status"
									searchPlaceholder="Search status..."
									className={
										errors.employee?.employmentStatus
											? "border-red-300 focus:border-red-500 focus:ring-red-500"
											: ""
									}
								/>
							)}
						/>
						{getEmployeeErrorMessage("employmentStatus") ? (
							<p className="mt-1 text-sm text-red-600">
								{getEmployeeErrorMessage("employmentStatus")}
							</p>
						) : null}
					</div>

					<div data-field-path="employee.employmentType">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Employment Type *
						</label>
						<Controller
							name="employee.employmentType"
							control={control}
							rules={{ required: true }}
							render={({ field }) => (
								<SearchableSelect
									options={employmentTypeOptions}
									value={field.value}
									onValueChange={field.onChange}
									placeholder="Select type"
									searchPlaceholder="Search type..."
									className={
										errors.employee?.employmentType
											? "border-red-300 focus:border-red-500 focus:ring-red-500"
											: ""
									}
								/>
							)}
						/>
						{getEmployeeErrorMessage("employmentType") ? (
							<p className="mt-1 text-sm text-red-600">
								{getEmployeeErrorMessage("employmentType")}
							</p>
						) : null}
					</div>

					{selectedEmploymentType === "PROBATIONARY" && (
						<div data-field-path="employee.probationEndDate">
							<label className="block text-sm font-normal text-muted-foreground/70">
								Probation End Date *
							</label>
							<Controller
								name="employee.probationEndDate"
								control={control}
								rules={{
									required: "Probation end date is required for probationary hires",
								}}
								render={({ field }) => (
									<CalendarDatePicker
										value={field.value || ""}
										onChange={field.onChange}
										minDate={
											employmentStartDate || hireDate
												? new Date(employmentStartDate || hireDate)
												: undefined
										}
										placeholder="Select probation end date"
										className={
											errors.employee?.probationEndDate
												? "mt-1 border-red-300 focus:border-red-500 focus-visible:ring-red-500/20"
												: "mt-1"
										}
									/>
								)}
							/>
							{errors.employee?.probationEndDate && (
								<p className="mt-1 text-sm text-red-600">
									{errors.employee.probationEndDate.message}
								</p>
							)}
						</div>
					)}
				</div>

				{employeeId && (
					<div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
						<div className="flex items-center gap-2 text-blue-950">
							<Building2 className="h-4 w-4 text-blue-600 shrink-0" />
							<div>
								<span className="font-semibold block">Need to change department or position?</span>
								<span className="text-blue-800/80">
									Organizational reassignments must be submitted through a Personnel Action Notice (PAN).
								</span>
							</div>
						</div>
						<Link
							to={`/hr/personnel-actions/transfer?employeeId=${employeeId}`}
							className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors shrink-0">
							Initiate Transfer (PAN) <ArrowRight className="h-3.5 w-3.5" />
						</Link>
					</div>
				)}

				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div data-field-path="employee.departmentId">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Department *
						</label>
						<Controller
							name="employee.departmentId"
							control={control}
							rules={{ required: true }}
							render={({ field }) => (
								<SearchableSelect
									options={departments.map((dept: any) => ({
										value: String(dept._id || dept.id),
										label: dept.name,
									}))}
									value={field.value ? String(field.value) : ""}
									onValueChange={field.onChange}
									placeholder="Select department"
									searchPlaceholder="Search department..."
									emptyText="No departments found."
									emptyActionLabel={
										onCreateDepartment ? "Create new department" : undefined
									}
									onEmptyActionSelect={onCreateDepartment}
									className={
										errors.employee?.departmentId
											? "border-red-300 focus:border-red-500 focus:ring-red-500"
											: ""
									}
								/>
							)}
						/>
						{getEmployeeErrorMessage("departmentId") ? (
							<p className="mt-1 text-sm text-red-600">
								{getEmployeeErrorMessage("departmentId")}
							</p>
						) : null}
					</div>

					<div data-field-path="employee.sectionId">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Section
						</label>
						<Controller
							name="employee.sectionId"
							control={control}
							render={({ field }) => (
								<SearchableSelect
									options={[
										{ value: "__none__", label: "No section" },
										...filteredSections.map((section: any) => ({
											value: String(section._id || section.id),
											label: section.code
												? `${section.name} (${section.code})`
												: section.name,
										})),
									]}
									value={field.value ? String(field.value) : "__none__"}
									onValueChange={(value) =>
										field.onChange(value === "__none__" ? null : value)
									}
									placeholder="Select section"
									searchPlaceholder="Search section..."
									emptyText={
										watchedDeptId
											? "No sections in this department."
											: "Select a department first."
									}
									className={
										errors.employee?.sectionId
											? "border-red-300 focus:border-red-500 focus:ring-red-500"
											: ""
									}
								/>
							)}
						/>
					</div>

					<div data-field-path="employee.reportToId">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Reports To
						</label>
						<Controller
							name="employee.reportToId"
							control={control}
							render={({ field }) => (
								<EmployeePickerSelect
									value={field.value || ""}
									onValueChange={field.onChange}
									placeholder="Select manager/supervisor"
									searchPlaceholder="Search employee..."
									departmentId={watchedDeptId || null}
									sectionId={watchedSectionId || null}
									agencyId={watch("employee.agencyId") || null}
									excludeEmployeeId={employeeId || null}
									error={Boolean(errors.employee?.reportToId)}
								/>
							)}
						/>
					</div>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div data-field-path="employee.positionId">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Position *
						</label>
						<Controller
							name="employee.positionId"
							control={control}
							rules={{ required: true }}
							render={({ field }) => (
								<SearchableSelect
									options={positions.map((pos: any) => ({
										value: String(pos._id || pos.id),
										label: pos.code ? `${pos.title} (${pos.code})` : pos.title,
									}))}
									value={field.value ? String(field.value) : ""}
									onValueChange={field.onChange}
									placeholder="Select position"
									searchPlaceholder="Search position..."
									emptyText="No positions found."
									emptyActionLabel={
										onCreatePosition ? "Create new position" : undefined
									}
									onEmptyActionSelect={onCreatePosition}
									className={
										errors.employee?.positionId
											? "border-red-300 focus:border-red-500 focus:ring-red-500"
											: ""
									}
								/>
							)}
						/>
						{getEmployeeErrorMessage("positionId") ? (
							<p className="mt-1 text-sm text-red-600">
								{getEmployeeErrorMessage("positionId")}
							</p>
						) : null}
					</div>

					<div data-field-path="employee.levelId">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Level
						</label>
						<Controller
							name="employee.levelId"
							control={control}
							render={({ field }) => (
								<SearchableSelect
									options={levels.map((level: any) => ({
										value: String(level._id || level.id),
										label: level.name,
									}))}
									value={field.value ? String(field.value) : ""}
									onValueChange={field.onChange}
									placeholder="Select level"
									searchPlaceholder="Search level..."
									className={
										errors.employee?.levelId
											? "border-red-300 focus:border-red-500 focus:ring-red-500"
											: ""
									}
								/>
							)}
						/>
					</div>
				</div>
			</div>
			{/* Compensation Section */}
			<div className="space-y-6 pt-6 border-t border-border">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h3 className="text-lg font-semibold text-foreground">Compensation</h3>
					{employeeId && (
						<Link
							to={`/hr/personnel-actions/promotion?employeeId=${employeeId}`}
							className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors">
							<Award className="h-3.5 w-3.5" /> Request Promotion / Salary Increase (PAN) <ArrowRight className="h-3.5 w-3.5" />
						</Link>
					)}
				</div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
					<div data-field-path="employee.basicSalary">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Basic Salary *
						</label>
						<input
							id="basicSalary"
							type="number"
							placeholder="50000"
							className={`mt-1 w-full rounded-md border ${
								errors.employee?.basicSalary
									? "border-red-300 focus:border-red-500"
									: "border-border"
							} bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary`}
							{...register("employee.basicSalary", {
								required: true,
								valueAsNumber: true,
								min: 0,
							})}
						/>
						{getEmployeeErrorMessage("basicSalary") ? (
							<p className="mt-1 text-sm text-red-600">
								{getEmployeeErrorMessage("basicSalary")}
							</p>
						) : null}
					</div>

					<div data-field-path="employee.currency">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Currency *
						</label>
						<Controller
							name="employee.currency"
							control={control}
							rules={{ required: true }}
							render={({ field }) => (
								<SearchableSelect
									options={currencyOptions}
									value={field.value}
									onValueChange={field.onChange}
									placeholder="Select currency"
									searchPlaceholder="Search currency..."
									className={
										errors.employee?.currency
											? "border-red-300 focus:border-red-500 focus:ring-red-500"
											: ""
									}
								/>
							)}
						/>
						{getEmployeeErrorMessage("currency") ? (
							<p className="mt-1 text-sm text-red-600">
								{getEmployeeErrorMessage("currency")}
							</p>
						) : null}
					</div>

					<div data-field-path="employee.payFrequency">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Pay Frequency *
						</label>
						<Controller
							name="employee.payFrequency"
							control={control}
							rules={{ required: true }}
							render={({ field }) => (
								<SearchableSelect
									options={payFrequencyOptions}
									value={field.value}
									onValueChange={field.onChange}
									placeholder="Select frequency"
									searchPlaceholder="Search frequency..."
									className={
										errors.employee?.payFrequency
											? "border-red-300 focus:border-red-500 focus:ring-red-500"
											: ""
									}
								/>
							)}
						/>
						{getEmployeeErrorMessage("payFrequency") ? (
							<p className="mt-1 text-sm text-red-600">
								{getEmployeeErrorMessage("payFrequency")}
							</p>
						) : null}
					</div>
				</div>
			</div>
			{/* Work Arrangement Section */}
			<div className="space-y-6 pt-6 border-t border-border">
				<h3 className="text-lg font-semibold text-foreground">Work Arrangement</h3>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div data-field-path="employee.workLocation">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Work Location *
						</label>
						<Controller
							name="employee.workLocation"
							control={control}
							rules={{ required: true }}
							render={({ field }) => (
								<SearchableSelect
									options={workLocationOptions}
									value={field.value}
									onValueChange={field.onChange}
									placeholder="Select location"
									searchPlaceholder="Search location..."
									className={
										errors.employee?.workLocation
											? "border-red-300 focus:border-red-500 focus:ring-red-500"
											: ""
									}
								/>
							)}
						/>
						{getEmployeeErrorMessage("workLocation") ? (
							<p className="mt-1 text-sm text-red-600">
								{getEmployeeErrorMessage("workLocation")}
							</p>
						) : null}
					</div>
					<div data-field-path="employee.workforceSource">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Workforce Source *
						</label>
						<Controller
							name="employee.workforceSource"
							control={control}
							rules={{ required: true }}
							render={({ field }) => (
								<SearchableSelect
									options={workforceSourceOptions}
									value={field.value || "DIRECT"}
									onValueChange={field.onChange}
									placeholder="Select workforce source"
									searchPlaceholder="Search source..."
									className={
										errors.employee?.workforceSource
											? "border-red-300 focus:border-red-500 focus:ring-red-500"
											: ""
									}
								/>
							)}
						/>
						{getEmployeeErrorMessage("workforceSource") ? (
							<p className="mt-1 text-sm text-red-600">
								{getEmployeeErrorMessage("workforceSource")}
							</p>
						) : null}
					</div>
				</div>

				{selectedWorkforceSource === "AGENCY" && (
					<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div data-field-path="employee.agencyId">
							<label className="block text-sm font-normal text-muted-foreground/70">
								Agency *
							</label>
							<Controller
								name="employee.agencyId"
								control={control}
								rules={{ required: selectedWorkforceSource === "AGENCY" }}
								render={({ field }) => (
									<SearchableSelect
										options={agencies.map((agency: any) => ({
											value: agency.id,
											label: `${agency.name} (${agency.code})`,
										}))}
										value={field.value || ""}
										onValueChange={field.onChange}
										placeholder="Select agency"
										searchPlaceholder="Search agency..."
										emptyText="No active agencies found."
										className={
											errors.employee?.agencyId
												? "border-red-300 focus:border-red-500 focus:ring-red-500"
												: ""
										}
									/>
								)}
							/>
							{getEmployeeErrorMessage("agencyId") ? (
								<p className="mt-1 text-sm text-red-600">
									{getEmployeeErrorMessage("agencyId")}
								</p>
							) : null}
						</div>
					</div>
				)}
			</div>
			{/* Schedule Section */}
			<div className="space-y-6 pt-6 border-t border-border">
				<div>
					<h3 className="text-lg font-semibold text-foreground">Active Schedule</h3>
					<p className="text-sm text-muted-foreground mt-1">
						Set one schedule pattern for this employee.
					</p>
				</div>

				{errors.employee?.activeSchedule?.message ? (
					<div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
						{String(errors.employee.activeSchedule.message)}
					</div>
				) : null}

				<Card
					className="border-border py-0 gap-0 shadow-none"
					data-field-path="employee.activeSchedule">
					<CardHeader className="border-b border-border px-4 py-3">
						<CardTitle className="text-sm font-medium text-foreground">
							Embedded Schedule
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4 p-4">
						<div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
							<div className="col-span-2 xl:col-span-1">
								<label className="mb-1.5 block text-xs font-medium text-muted-foreground/70">
									Source
								</label>
								<SearchableSelect
									options={templateDropdownOptions}
									value={
										activeSchedule?.scheduleTemplateId
											? String(activeSchedule.scheduleTemplateId)
											: MANUAL_TEMPLATE_VALUE
									}
									onValueChange={(value) => applyTemplateSelection(value)}
									placeholder="Select source..."
									searchPlaceholder="Search templates..."
									emptyText="No schedule templates found."
									className="mt-0 h-9 min-h-[36px] py-1.5"
								/>
							</div>
							<div>
								<label className="mb-1.5 block text-xs font-medium text-muted-foreground/70">
									Cycle Length
								</label>
								<Select
									options={WEEK_OPTIONS}
									value={String(activeSchedule?.cycleDays || 7)}
									onChange={(value) => handleWeekChange(value || "7")}
									placeholder="Select weeks"
								/>
							</div>
							<div>
								<label className="mb-1.5 block text-xs font-medium text-muted-foreground/70">
									Late Grace (min)
								</label>
								<input
									type="number"
									min={0}
									step={1}
									value={Number(activeSchedule?.graceLateMinutes ?? 15)}
									onChange={(event) =>
										setValue(
											"employee.activeSchedule.graceLateMinutes",
											Math.max(
												0,
												Math.round(Number(event.target.value || 0)),
											),
											{ shouldDirty: true },
										)
									}
									className="h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
								/>
							</div>
							<div>
								<label className="mb-1.5 block text-xs font-medium text-muted-foreground/70">
									Early-Out Grace (min)
								</label>
								<input
									type="number"
									min={0}
									step={1}
									value={Number(activeSchedule?.graceEarlyOutMinutes ?? 0)}
									onChange={(event) =>
										setValue(
											"employee.activeSchedule.graceEarlyOutMinutes",
											Math.max(
												0,
												Math.round(Number(event.target.value || 0)),
											),
											{ shouldDirty: true },
										)
									}
									className="h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
								/>
							</div>
						</div>

						<div className="space-y-3">
							<p className="text-xs font-medium text-foreground">Weekly Pattern</p>

							{Array.from({
								length: Math.max(
									1,
									Math.ceil(Number(activeSchedule?.cycleDays || 7) / 7),
								),
							}).map((_, weekIndex) => {
								const weekPattern = (activeSchedule?.pattern || []).slice(
									weekIndex * 7,
									weekIndex * 7 + 7,
								);

								return (
									<div
										key={`week-${weekIndex + 1}`}
										className="rounded-lg border border-border bg-muted/20 p-3">
										<p className="mb-2 text-xs font-medium text-muted-foreground">
											Week {weekIndex + 1}
										</p>

										<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
											{weekPattern.map(
												(dayConfig: any, localIndex: number) => {
													const patternIndex = weekIndex * 7 + localIndex;
													const selectedSource = dayConfig?.shiftTypeId
														? String(dayConfig.shiftTypeId)
														: "__manual__";
													const selectedShiftType = dayConfig?.shiftTypeId
														? shiftTypeMap.get(
																String(dayConfig.shiftTypeId),
															)
														: null;
													const manualSnapshot =
														dayConfig?.shiftSnapshot ||
														buildManualShiftSnapshot();
													const isEditingDay =
														manualDayModalIndex === patternIndex;
													const displayName =
														selectedSource === "__manual__"
															? manualSnapshot?.name || "Manual Shift"
															: selectedShiftType?.name ||
																"Shift type";
													const displayCode =
														selectedSource === "__manual__"
															? manualSnapshot?.code || ""
															: selectedShiftType?.code || "";
													const displaySlots =
														selectedSource === "__manual__"
															? manualSnapshot?.timeSlots
															: selectedShiftType?.timeSlots;
													const isOff =
														selectedSource === "__manual__"
															? manualSnapshot?.isOff
															: selectedShiftType?.isOff;

													return (
														<div
															key={`day-${patternIndex + 1}`}
															className={`min-w-0 overflow-hidden rounded-lg border bg-white p-2 transition-all ${
																isEditingDay
																	? "border-primary ring-1 ring-primary/20"
																	: "border-border"
															}`}>
															<div className="mb-1.5 flex items-center justify-between">
																<div>
																	<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
																		{WEEKDAY_LABELS[localIndex]}
																	</span>
																	<p className="text-xs font-medium text-foreground leading-tight">
																		Day {patternIndex + 1}
																	</p>
																</div>
															</div>

															<Select
																options={shiftTypeOptions}
																value={selectedSource}
																onChange={(value) =>
																	handleDaySourceChange(
																		patternIndex,
																		value || "__manual__",
																	)
																}
																placeholder="Select"
																className="min-w-0"
															/>

															<button
																type="button"
																onClick={() =>
																	handleDayCardClick(patternIndex)
																}
																className={`group mt-1.5 w-full min-w-0 overflow-hidden rounded-md border p-1.5 text-left transition-all ${
																	isEditingDay
																		? "border-primary/40 bg-primary/[0.04]"
																		: "border-border bg-muted/20 hover:border-primary/30 hover:bg-primary/[0.02] hover:shadow-sm"
																}`}>
																<div className="flex min-w-0 items-center justify-between gap-1">
																	<p
																		className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground"
																		title={displayName}>
																		{displayName}
																	</p>
																	<span
																		className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-medium transition-colors ${
																			isEditingDay
																				? "bg-primary/10 text-primary"
																				: "bg-transparent text-muted-foreground/50 group-hover:bg-primary/10 group-hover:text-primary"
																		}`}>
																		{isEditingDay
																			? "editing"
																			: "edit"}
																	</span>
																</div>
																{displayCode ? (
																	<p
																		className="truncate text-[10px] text-muted-foreground"
																		title={displayCode}>
																		{displayCode}
																	</p>
																) : null}
																{isOff ? (
																	<span className="mt-0.5 inline-block rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
																		Off day
																	</span>
																) : Array.isArray(displaySlots) &&
																  displaySlots.length > 0 ? (
																	<p
																		className="mt-0.5 truncate text-[10px] text-muted-foreground"
																		title={`${displaySlots[0]?.startTime || ""}-${displaySlots[displaySlots.length - 1]?.endTime || ""}`}>
																		{displaySlots[0]?.startTime}-
																		{displaySlots[displaySlots.length - 1]?.endTime}
																	</p>
																) : null}
															</button>
														</div>
													);
												},
											)}
										</div>
									</div>
								);
							})}
						</div>
					</CardContent>
				</Card>
			</div>
			<Modal
				open={manualDayModalIndex !== null}
				onOpenChange={(open) => {
					if (!open) closeManualDayModal();
				}}
				title={
					manualDayModalIndex !== null
						? `Edit Day ${manualDayModalIndex + 1} - ${WEEKDAY_LABELS[manualDayModalIndex % 7]} - Week ${Math.floor(manualDayModalIndex / 7) + 1}`
						: "Edit Manual Shift"
				}
				description="Configure shift details for this day."
				className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto custom-scrollbar bg-slate-50 border-none shadow-[0_20px_50px_rgba(0,0,0,0.1)]">
				<div className="space-y-3">
					<div className="rounded-lg border border-border bg-white p-3">
						<ShiftSnapshotFormFields
							control={manualDayModalControl}
							register={manualDayModalRegister}
							setValue={setManualDayModalValue}
							watch={watchManualDayModal}
							defaultTimeSlots={buildManualShiftSnapshot().timeSlots}
						/>
					</div>

					<div className="flex justify-end gap-2 border-t border-border pt-3">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={closeManualDayModal}>
							Cancel
						</Button>
						<Button type="button" size="sm" onClick={applyManualDayChanges}>
							Apply Changes
						</Button>
					</div>
				</div>
			</Modal>
		</div>
	);
}
