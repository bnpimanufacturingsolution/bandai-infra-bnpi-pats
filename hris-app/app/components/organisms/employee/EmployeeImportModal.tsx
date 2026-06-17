import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { GenericImportModal } from "~/components/organisms/shared/GenericImportModal";
import type { DerivePreviewRowValuesContext } from "~/components/organisms/shared/GenericImportModal";
import type {
	ImportField,
	ImportFieldGroup,
} from "~/components/organisms/shared/GenericImportModal";
import type { ResolveFieldSelectOptionsContext } from "~/components/organisms/shared/GenericImportModal";
import { useEmployees, useImportEmployees } from "~/lib/hooks/useEmployees";
import { useRoles } from "~/lib/hooks/useRoles";
import { useWorkSchedules } from "~/lib/hooks/useWorkSchedules";
import { useLevels } from "~/lib/hooks/useLevels";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { usePositions } from "~/lib/hooks/usePositions";
import { useSections } from "~/lib/hooks/useSections";
import { useHikvisionUserSearchMutation } from "~/lib/hooks/use-hikvision";
import { useImportProgress } from "~/lib/hooks/useImportProgress";
import { REQUIRED_FIELDS, OPTIONAL_FIELDS, SYSTEM_FIELDS } from "~/constants/import-fields";
import { generateCSVTemplate } from "~/lib/helpers/import.helpers";
import { buildEmployeeImportPreviewValidation } from "~/lib/utils/employee-import-preview-validation";
import { deriveRoleAndFlags } from "~/lib/utils/role-derivation";
import type { EditableColumnConfig } from "~/components/molecules/employee/ImportPreviewTable";
import type { HikvisionUserInfo } from "~/types/hikvision";

let inFlightDeviceUsersRequest: Promise<HikvisionUserInfo[]> | null = null;

interface EmployeeImportModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function EmployeeImportModal({ open, onOpenChange }: EmployeeImportModalProps) {
	const queryClient = useQueryClient();
	const [importJobId, setImportJobId] = useState<string | null>(null);
	const [handledJobId, setHandledJobId] = useState<string | null>(null);
	const [deviceUsers, setDeviceUsers] = useState<HikvisionUserInfo[]>([]);
	const [isLoadingDeviceUsers, setIsLoadingDeviceUsers] = useState(false);
	const [hasFetchedDeviceUsers, setHasFetchedDeviceUsers] = useState(false);
	const isFetchingDeviceUsersRef = useRef(false);
	const reportToOptionsCacheRef = useRef<{
		previewData: string[][];
		previewHeaders: string[];
		columnMapping?: Record<string, string>;
		empIdIndex: number;
		nameIndex: number;
		options: Array<{ value: string; label: string }>;
	} | null>(null);

	const importEmployeesMutation = useImportEmployees();
	const { progress } = useImportProgress(importJobId, open && !!importJobId);
	const { mutateAsync: searchDeviceUsersAsync } = useHikvisionUserSearchMutation();

	const { data: rolesData, isLoading: isLoadingRoles } = useRoles(true, undefined, {
		enabled: open,
	});
	const { data: workSchedulesData, isLoading: isLoadingWorkSchedules } = useWorkSchedules(open);
	const { data: levelsData, isLoading: isLoadingLevels } = useLevels(
		{ page: 1, limit: 1000, count: true },
		{ enabled: open },
	);
	const { data: departmentsData, isLoading: isLoadingDepartments } = useDepartments(
		{
			page: 1,
			limit: 1000,
			count: true,
		},
		{ enabled: open },
	);
	const { data: positionsData, isLoading: isLoadingPositions } = usePositions(
		{
			page: 1,
			limit: 1000,
			count: true,
		},
		{ enabled: open },
	);
	const { data: sectionsData, isLoading: isLoadingSections } = useSections(
		{
			page: 1,
			limit: 1000,
			count: true,
		},
		{ enabled: open },
	);
	const { data: existingEmployeesData, isLoading: isLoadingExistingEmployees } = useEmployees(
		{
			page: 1,
			limit: 1000,
			count: false,
			fields: ["employeeId", "person.personalInfo"],
		},
		{ enabled: open },
	);

	const roles = useMemo(() => rolesData?.data?.roles || [], [rolesData]);
	const schedules = useMemo(
		() => (workSchedulesData as any)?.schedules || [],
		[workSchedulesData],
	);
	const levels = useMemo(() => (levelsData as any)?.levels || [], [levelsData]);
	const departments = useMemo(
		() => (departmentsData as any)?.departments || [],
		[departmentsData],
	);
	const positions = useMemo(() => (positionsData as any)?.positions || [], [positionsData]);
	const sections = useMemo(() => (sectionsData as any)?.sections || [], [sectionsData]);
	const existingEmployees = useMemo(
		() => (existingEmployeesData as any)?.employees || [],
		[existingEmployeesData],
	);
	const employeeImportDisplayOrder = useMemo<readonly string[]>(
		() => [
			"EMP_ID",
			"NAME",
			"REPORT_TO_EMP_ID",
			"DEPARTMENT",
			"SECTION",
			"POSITION",
			"LEVEL",
			"GENDER",
			"NATIONALITY",
			"BASIC_SALARY",
			"PAY_FREQUENCY",
			"HIRE_DATE",
			"START_DATE",
			"EMAIL",
			"ROLE",
			"SCHEDULE",
		],
		[],
	);
	const employeeImportFields = useMemo<ImportField[]>(() => {
		const allFields: ImportField[] = [...REQUIRED_FIELDS, ...SYSTEM_FIELDS, ...OPTIONAL_FIELDS];
		const byKey = new Map(allFields.map((field) => [field.key, field]));
		const ordered = employeeImportDisplayOrder
			.map((key) => byKey.get(key))
			.filter((field): field is ImportField => field !== undefined);
		const alreadyIncluded = new Set(ordered.map((field) => field.key));
		return [
			...ordered,
			...allFields.filter((field) => !alreadyIncluded.has(field.key)),
		];
	}, [employeeImportDisplayOrder]);
	const getImportField = useCallback(
		(key: string, required = false): ImportField => {
			const field = employeeImportFields.find((item) => item.key === key);
			if (!field) return { key, label: key, required };
			return required ? { ...field, required: true } : field;
		},
		[employeeImportFields],
	);
	const requiredImportFields = useMemo<ImportField[]>(
		() =>
			[
				getImportField("EMP_ID", true),
				getImportField("NAME", true),
				getImportField("REPORT_TO_EMP_ID", true),
				getImportField("DEPARTMENT", true),
				getImportField("POSITION", true),
				getImportField("GENDER", true),
				getImportField("NATIONALITY", true),
				getImportField("BASIC_SALARY", true),
				getImportField("PAY_FREQUENCY", true),
				getImportField("HIRE_DATE", true),
				getImportField("START_DATE", true),
			],
		[getImportField],
	);
	const optionalImportFields = useMemo<ImportField[]>(
		() =>
			employeeImportFields.filter(
				(field) =>
					!requiredImportFields.some((requiredField) => requiredField.key === field.key) &&
					!SYSTEM_FIELDS.some((systemField) => systemField.key === field.key),
			),
		[employeeImportFields, requiredImportFields],
	);
	const systemImportFields = useMemo<ImportField[]>(() => SYSTEM_FIELDS, []);
	const employeeImportFieldGroups = useMemo<ImportFieldGroup[]>(
		() => [
			{
				id: "employee-identity",
				title: "Employee Identity",
				subtitle: "Required",
				fieldType: "required",
				fields: [
					getImportField("EMP_ID", true),
					getImportField("NAME", true),
					getImportField("REPORT_TO_EMP_ID", true),
				],
			},
			{
				id: "organization-structure",
				title: "Organization Structure",
				subtitle: "Department and position required",
				fieldType: "optional",
				fields: [
					getImportField("DEPARTMENT", true),
					getImportField("SECTION"),
					getImportField("POSITION", true),
					getImportField("LEVEL"),
				],
			},
			{
				id: "employment-core",
				title: "Employment Details",
				subtitle: "Required",
				fieldType: "required",
				fields: [
					getImportField("GENDER", true),
					getImportField("NATIONALITY", true),
					getImportField("BASIC_SALARY", true),
					getImportField("PAY_FREQUENCY", true),
					getImportField("HIRE_DATE", true),
					getImportField("START_DATE", true),
				],
			},
			{
				id: "system",
				title: "System Configuration",
				subtitle: "Derived except email",
				fieldType: "system",
				fields: systemImportFields,
			},
			{
				id: "optional",
				title: "Optional Fields",
				fieldType: "optional",
				fields: optionalImportFields.filter(
					(field) => !["SECTION", "LEVEL"].includes(field.key),
				),
			},
		],
		[getImportField, optionalImportFields, systemImportFields],
	);

	const normalizeLookupKey = (value?: string | null) =>
		(value || "").trim().toLowerCase().replace(/\s+/g, " ");

	const departmentLookup = useMemo(() => {
		const map = new Map<string, any>();
		departments.forEach((department: any) => {
			const nameKey = normalizeLookupKey(department?.name);
			if (nameKey) map.set(nameKey, department);
			const codeKey = normalizeLookupKey(department?.code);
			if (codeKey) map.set(codeKey, department);
			const idKey = normalizeLookupKey(department?.id);
			if (idKey) map.set(idKey, department);
		});
		return map;
	}, [departments]);

	const levelLookup = useMemo(() => {
		const map = new Map<string, any>();
		levels.forEach((level: any) => {
			const nameKey = normalizeLookupKey(level?.name);
			if (nameKey) map.set(nameKey, level);
			const idKey = normalizeLookupKey(level?.id);
			if (idKey) map.set(idKey, level);
		});
		return map;
	}, [levels]);

	const scheduleIdToName = useMemo(() => {
		const map = new Map<string, string>();
		schedules.forEach((schedule: any) => {
			if (schedule?.id && schedule?.name) {
				map.set(String(schedule.id), String(schedule.name));
			}
		});
		return map;
	}, [schedules]);

	const departmentToSchedule = useMemo(() => {
		const map = new Map<string, string>();
		departments.forEach((department: any) => {
			const scheduleName =
				department?.schedule?.name ||
				(department?.scheduleId ? scheduleIdToName.get(String(department.scheduleId)) : "");
			if (!scheduleName) return;

			const departmentNameKey = normalizeLookupKey(department?.name);
			if (departmentNameKey) map.set(departmentNameKey, String(scheduleName));
			const departmentCodeKey = normalizeLookupKey(department?.code);
			if (departmentCodeKey) map.set(departmentCodeKey, String(scheduleName));
		});
		return map;
	}, [departments, scheduleIdToName]);

	const handleDownloadTemplate = (count: number = 1) => {
		const dataArray: Record<string, string>[] = [];

		for (let i = 0; i < count; i++) {
			const indexStr = String(i + 1).padStart(3, "0");
			const nameSuffix = String.fromCharCode(65 + (i % 26));
			dataArray.push({
				EMP_ID: `EMP-${indexStr}`,
				NAME: `Dela Cruz, Juan ${nameSuffix}.`,
				REPORT_TO_EMP_ID: "",
				DEPARTMENT: "Information Technology",
				SECTION: "",
				POSITION: "Software Engineer",
				LEVEL: "",
				GENDER: i % 2 === 0 ? "MALE" : "FEMALE",
				NATIONALITY: "Filipino",
				BASIC_SALARY: "50000",
				PAY_FREQUENCY: "SEMI_MONTHLY",
				HIRE_DATE: "2025-01-15",
				START_DATE: "2025-01-15",
				EMAIL: `j.delacruz${i > 0 ? i + 1 : ""}@bandai.com`,
				ROLE: "hris-employee",
				SCHEDULE: "Regular 8-5",
				TIN: `123-456-789-${indexStr}`,
				SSS: `12-3456789-${(i % 9) + 1}`,
				PHILHEALTH: `12-345678901-${(i % 9) + 1}`,
				PAGIBIG: `1234-5678-${indexStr.padStart(4, "0")}`,
				DEVICE_ID: `12345${i > 0 ? i : ""}`,
				PHONE: `0917123${String(4567 + i).padStart(4, "0")}`,
				BIRTHDAY: "1990-05-10",
				PLACE_OF_BIRTH: "Manila",
				STREET: "123 Main Street",
				CITY: "Quezon City",
				STATE: "Metro Manila",
				COUNTRY: "Philippines",
				POSTAL_CODE: "1100",
				WORK_LOCATION: "ONSITE",
				WORKFORCE_SOURCE: "DIRECT",
				AGENCY_CODE: "",
				CURRENCY: "PHP",
			});
		}

		generateCSVTemplate(employeeImportFields, dataArray);
	};

	const handleImport = async (
		file: File,
		options: { autoCreate: boolean; applyDefaultLeaveBalances?: boolean },
	) => {
		try {
			const response = await importEmployeesMutation.mutateAsync({
				file,
				options: {
					autoCreate: options.autoCreate,
					applyDefaultLeaveBalances: options.applyDefaultLeaveBalances,
				},
			});

			if (response?.jobId) {
				setImportJobId(response.jobId);
				setHandledJobId(null);
				return response;
			}

			toast.error("Import failed to start");
			throw new Error("No jobId returned from employee import");
		} catch (error: any) {
			const message =
				error?.message || error?.errors?.[0]?.message || "Failed to import employees.";
			toast.error(message);
			throw error;
		}
	};

	useEffect(() => {
		if (!progress?.jobId || handledJobId === progress.jobId) return;
		if (progress.status !== "completed" && progress.status !== "failed") return;

		queryClient.invalidateQueries({ queryKey: ["employees"] });
		setHandledJobId(progress.jobId);

		if ((progress.failed ?? 0) > 0 || (progress.errors?.length ?? 0) > 0) {
			toast.warning(
				`Import completed: ${progress.success} succeeded, ${progress.failed} failed.`,
				{ duration: 6000 },
			);
			return;
		}

		toast.success(
			`Import completed: ${progress.success} employee${progress.success !== 1 ? "s" : ""} imported.`,
		);
	}, [handledJobId, progress, queryClient]);

	const loadDeviceUsers = useCallback(() => {
		if (!open || hasFetchedDeviceUsers || isFetchingDeviceUsersRef.current) return;

		isFetchingDeviceUsersRef.current = true;
		setHasFetchedDeviceUsers(true);
		setIsLoadingDeviceUsers(true);

		if (!inFlightDeviceUsersRequest) {
			inFlightDeviceUsersRequest = searchDeviceUsersAsync({
				searchID: "1",
				searchResultPosition: 0,
				maxResults: 1000,
			})
				.then((data) => data?.data?.UserInfoSearch?.UserInfo || [])
				.finally(() => {
					inFlightDeviceUsersRequest = null;
				});
		}

		inFlightDeviceUsersRequest
			.then((users) => {
				setDeviceUsers(users);
			})
			.catch(() => {
				setDeviceUsers([]);
			})
			.finally(() => {
				setIsLoadingDeviceUsers(false);
				isFetchingDeviceUsersRef.current = false;
			});
	}, [hasFetchedDeviceUsers, open, searchDeviceUsersAsync]);

	useEffect(() => {
		if (!open) {
			setDeviceUsers([]);
			setIsLoadingDeviceUsers(false);
			setHasFetchedDeviceUsers(false);
			isFetchingDeviceUsersRef.current = false;
		}
	}, [open]);

	const payFrequencyOptions = [
		{ value: "DAILY", label: "Daily" },
		{ value: "WEEKLY", label: "Weekly" },
		{ value: "BIWEEKLY", label: "Bi-weekly" },
		{ value: "SEMI_MONTHLY", label: "Semi-Monthly" },
		{ value: "MONTHLY", label: "Monthly" },
		{ value: "QUARTERLY", label: "Quarterly" },
		{ value: "ANNUALLY", label: "Annually" },
	];

	const workLocationOptions = [
		{ value: "ONSITE", label: "Onsite" },
		{ value: "REMOTE", label: "Remote" },
		{ value: "HYBRID", label: "Hybrid" },
	];

	const workforceSourceOptions = [
		{ value: "DIRECT", label: "Direct" },
		{ value: "AGENCY", label: "Agency (Indirect)" },
	];

	const genderOptions = [
		{ value: "male", label: "Male" },
		{ value: "female", label: "Female" },
		{ value: "other", label: "Other" },
		{ value: "prefer_not_to_say", label: "Prefer not to say" },
		{ value: "unknown", label: "Unknown" },
		{ value: "not_applicable", label: "Not applicable" },
	];

	const nationalityOptions = [
		{ value: "Filipino", label: "Filipino" },
		{ value: "American", label: "American" },
		{ value: "Australian", label: "Australian" },
		{ value: "British", label: "British" },
		{ value: "Canadian", label: "Canadian" },
		{ value: "Chinese", label: "Chinese" },
		{ value: "Indian", label: "Indian" },
		{ value: "Indonesian", label: "Indonesian" },
		{ value: "Japanese", label: "Japanese" },
		{ value: "Korean", label: "Korean" },
		{ value: "Malaysian", label: "Malaysian" },
		{ value: "Singaporean", label: "Singaporean" },
		{ value: "Thai", label: "Thai" },
		{ value: "Vietnamese", label: "Vietnamese" },
	];

	const roleOptions = useMemo(
		() =>
			roles.map((role: any) => ({
				value: role.name.toLowerCase(),
				label: role.name,
			})),
		[roles],
	);

	const scheduleOptions = useMemo(
		() =>
			schedules.map((sched: any) => ({
				value: sched.name,
				label: sched.name,
			})),
		[schedules],
	);

	const levelOptions = useMemo(
		() =>
			levels.map((level: any) => ({
				value: level.name,
				label: `${level.name}${level?.isManager ? " (Manager)" : ""}`,
			})),
		[levels],
	);

	const departmentOptions = useMemo(
		() =>
			departments.map((department: any) => ({
				value: department.name,
				label: `${department.name}${department?.code ? ` (${department.code})` : ""}`,
			})),
		[departments],
	);

	const positionOptions = useMemo(
		() =>
			positions.map((position: any) => ({
				value: position.title,
				label: `${position.title}${position?.code ? ` (${position.code})` : ""}`,
			})),
		[positions],
	);

	const sectionOptions = useMemo(
		() =>
			sections.map((section: any) => ({
				value: section.name,
				label: `${section.name}${section?.department?.name ? ` (${section.department.name})` : ""}`,
			})),
		[sections],
	);

	const deviceUserIdOptions = useMemo(() => {
		if (isLoadingDeviceUsers && deviceUsers.length === 0) return [];

		const byEmployeeNo = new Map<string, { value: string; label: string }>();

		deviceUsers.forEach((deviceUser) => {
			const employeeNo = String(deviceUser?.employeeNo || "").trim();
			if (!employeeNo || byEmployeeNo.has(employeeNo)) return;

			byEmployeeNo.set(employeeNo, {
				value: employeeNo,
				label: String(deviceUser?.name || employeeNo),
			});
		});

		return Array.from(byEmployeeNo.values());
	}, [deviceUsers, isLoadingDeviceUsers]);

	const reportToStaticOptions = useMemo(() => {
		const byEmployeeId = new Map<string, { value: string; label: string }>();

		existingEmployees.forEach((employee: any) => {
			const employeeId = String(employee?.employeeId || "").trim();
			if (!employeeId || byEmployeeId.has(employeeId)) return;

			const firstName = String(employee?.person?.personalInfo?.firstName || "").trim();
			const lastName = String(employee?.person?.personalInfo?.lastName || "").trim();
			const fullName = `${firstName} ${lastName}`.trim();

			byEmployeeId.set(employeeId, {
				value: employeeId,
				label: fullName || employeeId,
			});
		});

		return Array.from(byEmployeeId.values());
	}, [existingEmployees]);

	const existingReportToOptions = useMemo(
		() =>
			existingEmployees
				.map((employee: any) => {
					const firstName = employee.person?.personalInfo?.firstName || "";
					const lastName = employee.person?.personalInfo?.lastName || "";
					const fullName = `${firstName} ${lastName}`.trim() || employee.employeeId;
					return {
						value: String(employee.employeeId || "").trim(),
						label: fullName,
					};
				})
				.filter((option: { value: string; label: string }) => option.value),
		[existingEmployees],
	);

	const selectOptionsMap: Record<string, Array<{ value: string; label: string }>> = useMemo(
		() => ({
			LEVEL: levelOptions,
			DEPARTMENT: departmentOptions,
			SECTION: sectionOptions,
			POSITION: positionOptions,
			REPORT_TO_EMP_ID: reportToStaticOptions,
			GENDER: genderOptions,
			NATIONALITY: nationalityOptions,
			PAY_FREQUENCY: payFrequencyOptions,
			WORK_LOCATION: workLocationOptions,
			WORKFORCE_SOURCE: workforceSourceOptions,
			ROLE: roleOptions,
			SCHEDULE: scheduleOptions,
			DEVICE_ID: deviceUserIdOptions,
		}),
		[
			levelOptions,
			departmentOptions,
			sectionOptions,
			positionOptions,
			reportToStaticOptions,
			genderOptions,
			nationalityOptions,
			payFrequencyOptions,
			workLocationOptions,
			workforceSourceOptions,
			roleOptions,
			scheduleOptions,
			deviceUserIdOptions,
		],
	);

	const resolveFieldSelectOptions = useCallback(
		({
			fieldKey,
			previewHeaders,
			previewData,
			columnMapping,
			baseOptions,
		}: ResolveFieldSelectOptionsContext) => {
			if (fieldKey !== "REPORT_TO_EMP_ID") return undefined;

			const resolvedNameHeader =
				columnMapping.NAME || (previewHeaders.includes("NAME") ? "NAME" : "");
			const resolvedEmpIdHeader =
				columnMapping.EMP_ID || (previewHeaders.includes("EMP_ID") ? "EMP_ID" : "");

			const nameIndex = resolvedNameHeader ? previewHeaders.indexOf(resolvedNameHeader) : -1;
			const empIdIndex = resolvedEmpIdHeader
				? previewHeaders.indexOf(resolvedEmpIdHeader)
				: -1;

			const importedOptions = new Map<string, { value: string; label: string }>();

			previewData.forEach((row) => {
				const mappedName = nameIndex >= 0 ? String(row[nameIndex] || "").trim() : "";
				const mappedEmpId = empIdIndex >= 0 ? String(row[empIdIndex] || "").trim() : "";
				const value = mappedEmpId || mappedName;
				const label = mappedName || mappedEmpId;
				if (!value || !label) return;
				if (!importedOptions.has(value)) {
					importedOptions.set(value, { value, label });
				}
			});

			const merged = new Map<string, { value: string; label: string }>();
			Array.from(importedOptions.values()).forEach((option) =>
				merged.set(option.value, option),
			);
			(baseOptions || []).forEach((option) => {
				if (!merged.has(option.value)) {
					merged.set(option.value, option);
				}
			});

			return Array.from(merged.values());
		},
		[],
	);

	const autoGenerateEmployeeFields = useCallback(
		({
			mappedRow,
		}: {
			mappedRow: Record<string, string>;
			rawRow: Record<string, any>;
			rowIndex: number;
		}) => {
			const generated: Record<string, string> = {};

			if (mappedRow.DEPARTMENT) {
				const departmentRecord = departmentLookup.get(
					normalizeLookupKey(mappedRow.DEPARTMENT),
				);
				const levelRecord = mappedRow.LEVEL
					? levelLookup.get(normalizeLookupKey(mappedRow.LEVEL))
					: undefined;
				if (departmentRecord) {
					const derivedRole = deriveRoleAndFlags({
						department: {
							isHr: departmentRecord?.isHr,
						},
						level: {
							isManager: levelRecord?.isManager ?? false,
						},
					});
					generated.ROLE = derivedRole.role;
				}
			}

			if (!mappedRow.SCHEDULE && mappedRow.DEPARTMENT) {
				const scheduleFromDepartment = departmentToSchedule.get(
					normalizeLookupKey(mappedRow.DEPARTMENT),
				);
				if (scheduleFromDepartment) {
					generated.SCHEDULE = scheduleFromDepartment;
				}
			}

			return generated;
		},
		[departmentLookup, departmentToSchedule, levelLookup],
	);

	const derivePreviewRowValues = useCallback(
		({ mappedRow, changedFieldKey }: DerivePreviewRowValuesContext) => {
			const derived: Record<string, string> = {};

			const shouldRecalculateRole =
				mappedRow.DEPARTMENT &&
				(!String(mappedRow.ROLE || "").trim() ||
					changedFieldKey === "DEPARTMENT" ||
					changedFieldKey === "LEVEL");

			if (shouldRecalculateRole) {
				const departmentRecord = departmentLookup.get(
					normalizeLookupKey(mappedRow.DEPARTMENT),
				);
				const levelRecord = mappedRow.LEVEL
					? levelLookup.get(normalizeLookupKey(mappedRow.LEVEL))
					: undefined;
				if (departmentRecord) {
					const roleResult = deriveRoleAndFlags({
						department: { isHr: departmentRecord?.isHr },
						level: { isManager: levelRecord?.isManager ?? false },
					});
					if (roleResult.role) {
						derived.ROLE = roleResult.role;
					}
				}
			}

			if (!String(mappedRow.SCHEDULE || "").trim() && mappedRow.DEPARTMENT) {
				const scheduleFromDepartment = departmentToSchedule.get(
					normalizeLookupKey(mappedRow.DEPARTMENT),
				);
				if (scheduleFromDepartment) {
					derived.SCHEDULE = scheduleFromDepartment;
				}
			}

			return derived;
		},
		[departmentLookup, departmentToSchedule, levelLookup],
	);

	const validatePreviewData = useCallback(
		({
			previewHeaders,
			previewData,
			columnMapping,
			autoCreateResources,
		}: {
			previewHeaders: string[];
			previewData: string[][];
			columnMapping: Record<string, string>;
			autoCreateResources: boolean;
		}) =>
			buildEmployeeImportPreviewValidation({
				previewHeaders,
				previewData,
				columnMapping,
				autoCreateResources,
				departmentOptions,
				levelOptions,
				positionOptions,
				sectionOptions,
				roleOptions,
				scheduleOptions,
			}),
		[departmentOptions, levelOptions, positionOptions, roleOptions, scheduleOptions, sectionOptions],
	);

	const editableColumns = useMemo<Record<string, EditableColumnConfig>>(
		() => ({
			REPORT_TO_EMP_ID: {
				type: "select",
				getOptions: ({ rowIndex, rowData, previewData, previewHeaders, columnMapping }) => {
					type ReportToOption = { value: string; label: string };
					const cached = reportToOptionsCacheRef.current;
					let cache =
						cached &&
						cached.previewData === previewData &&
						cached.previewHeaders === previewHeaders &&
						cached.columnMapping === columnMapping
							? cached
							: null;

					if (!cache) {
						const resolvedEmpIdHeader =
							columnMapping?.EMP_ID ||
							(previewHeaders.includes("EMP_ID") ? "EMP_ID" : "");
						const resolvedNameHeader =
							columnMapping?.NAME ||
							(previewHeaders.includes("NAME") ? "NAME" : "");
						const empIdIndex = resolvedEmpIdHeader
							? previewHeaders.indexOf(resolvedEmpIdHeader)
							: -1;
						const nameIndex = resolvedNameHeader
							? previewHeaders.indexOf(resolvedNameHeader)
							: -1;

						const options: ReportToOption[] =
							empIdIndex >= 0 && nameIndex >= 0
								? previewData
										.map((previewRow) => ({
											value: String(previewRow[empIdIndex] || "").trim(),
											label: String(previewRow[nameIndex] || "").trim(),
										}))
										.filter(
											(option: ReportToOption) =>
												Boolean(option.value) && Boolean(option.label),
										)
								: [];

						cache = {
							previewData,
							previewHeaders,
							columnMapping,
							empIdIndex,
							nameIndex,
							options,
						};
						reportToOptionsCacheRef.current = cache;
					}

					const currentRowEmpId =
						cache.empIdIndex >= 0 ? rowData[cache.empIdIndex] || "" : "";
					const currentValueIndex = previewHeaders.indexOf("REPORT_TO_EMP_ID");
					const currentValue =
						currentValueIndex >= 0
							? String(rowData[currentValueIndex] || "").trim()
							: "";

					const csvOptions = cache.options.filter((option, optionIndex) => {
						if (optionIndex === rowIndex) return false;
						if (currentRowEmpId && option.value === currentRowEmpId) return false;
						return true;
					});

					const existingOptions = existingReportToOptions.filter(
						(option: ReportToOption) => option.value !== currentRowEmpId,
					);

					const mergedOptions: ReportToOption[] = [...csvOptions, ...existingOptions];
					const deduped = new Map<string, ReportToOption>();
					mergedOptions.forEach((option: ReportToOption) => {
						if (!deduped.has(option.value)) {
							deduped.set(option.value, option);
						}
					});
					if (currentValue && !deduped.has(currentValue)) {
						deduped.set(currentValue, {
							value: currentValue,
							label: `${currentValue} (Unresolved)`,
						});
					}

					return Array.from(deduped.values());
				},
			},
			LEVEL: { type: "select", options: levelOptions },
			DEPARTMENT: { type: "select", options: departmentOptions },
			SECTION: { type: "select", options: sectionOptions },
			POSITION: { type: "select", options: positionOptions },
			GENDER: { type: "select", options: genderOptions },
			NATIONALITY: { type: "select", options: nationalityOptions },
			PAY_FREQUENCY: { type: "select", options: payFrequencyOptions },
			WORK_LOCATION: { type: "select", options: workLocationOptions },
			WORKFORCE_SOURCE: { type: "select", options: workforceSourceOptions },
			ROLE: { type: "select", options: roleOptions },
			SCHEDULE: { type: "select", options: scheduleOptions },
			DEVICE_ID: {
				type: "select",
				options: deviceUserIdOptions,
				isLoadingOptions: isLoadingDeviceUsers,
				loadingOptionsLabel: "Loading device users...",
				onOpen: loadDeviceUsers,
			},
			HIRE_DATE: { type: "text" },
			START_DATE: { type: "text" },
		}),
		[
			departmentOptions,
			sectionOptions,
			deviceUserIdOptions,
			isLoadingDeviceUsers,
			loadDeviceUsers,
			existingReportToOptions,
			levelOptions,
			genderOptions,
			nationalityOptions,
			payFrequencyOptions,
			workLocationOptions,
			workforceSourceOptions,
			positionOptions,
			roleOptions,
			scheduleOptions,
		],
	);

	const handleModalOpenChange = (newOpen: boolean) => {
		if (!newOpen) {
			setImportJobId(null);
			setHandledJobId(null);
			setDeviceUsers([]);
			setIsLoadingDeviceUsers(false);
			setHasFetchedDeviceUsers(false);
			isFetchingDeviceUsersRef.current = false;
		}
		onOpenChange(newOpen);
	};

	const isLoadingReferenceData =
		open &&
		(isLoadingRoles ||
			isLoadingWorkSchedules ||
			isLoadingLevels ||
			isLoadingDepartments ||
			isLoadingPositions ||
			isLoadingSections ||
			isLoadingExistingEmployees);

	return (
		<GenericImportModal
			open={open}
			onOpenChange={handleModalOpenChange}
			persistenceKey="admin-migration::employees"
			title="Import Employees"
			description="Upload a CSV/Excel file to bulk import employee records. Email is preserved only when supplied by the source file."
			fields={{
				required: requiredImportFields,
				optional: optionalImportFields,
				system: systemImportFields,
			}}
			fieldGroups={employeeImportFieldGroups}
			previewFields={employeeImportFields}
			selectOptionsMap={selectOptionsMap}
			resolveFieldSelectOptions={resolveFieldSelectOptions}
			onDownloadTemplate={handleDownloadTemplate}
			onImport={handleImport}
			isImporting={importEmployeesMutation.isPending}
			showAutoCreateResources={true}
			showApplyDefaultLeaveBalances={true}
			importProgress={progress}
			showLiveProgressLog={true}
			autoDownloadMappedOnSuccess={true}
			autoDownloadCredentialsOnSuccess={true}
			autoGenerateFields={autoGenerateEmployeeFields}
			autoGeneratedFieldKeys={["ROLE", "SCHEDULE"]}
			derivePreviewRowValues={derivePreviewRowValues}
			validatePreviewData={validatePreviewData}
			editableColumns={editableColumns}
			showTemplateCount={true}
			clientStateLoading={isLoadingReferenceData}
			clientStateLoadingLabel="Loading import reference data..."
			clientStateLoadingDetail="Role, schedule, hierarchy, and reporting options are being prepared."
		/>
	);
}
