import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm, type FieldPath, type Resolver } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useNavigate, useSearchParams, useParams } from "react-router";
import {
	User,
	Briefcase,
	FileCheck,
	Gift,
	Lock,
	Dices,
	ArrowLeft,
	Clock,
	Trash2,
} from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { EmployeeDataStepper } from "~/components/molecules/employee/EmployeeDataStepper";
import type { StepConfig } from "~/components/molecules/employee/EmployeeDataStepper";
import { PersonalIDsForm } from "~/components/molecules/employee/PersonalIDsForm";
import { EmploymentCompensationForm } from "~/components/molecules/employee/EmploymentCompensationForm";
import { ComplianceTaxForm } from "~/components/molecules/employee/ComplianceTaxForm";
import { BenefitsLeaveForm } from "~/components/molecules/employee/BenefitsLeaveForm";
import { SystemAccessForm } from "~/components/molecules/employee/SystemAccessForm";
import {
	useCreateEmployeeWithAccount,
	useEmployee,
	useEmployees,
	useReserveEmployeeId,
	useUpdateEmployeeWithAccount,
} from "~/lib/hooks/useEmployees";
import { queryKeys as applicantQueryKeys, useApplicant } from "~/lib/hooks/useApplicants";
import { useAuth } from "~/lib/hooks/useAuth";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useDocumentTypes } from "~/lib/hooks/useDocumentTypes";
import { usePositions } from "~/lib/hooks/usePositions";
import { useWorkSchedules } from "~/lib/hooks/useWorkSchedules";
import { useLevels } from "~/lib/hooks/useLevels";
import { useRoles } from "~/lib/hooks/useRoles";
import { useShiftTypes } from "~/lib/hooks/useSchedules";
import {
	buildEmployeeFormDraftEntityKey,
	buildEmployeeFormDraftSnapshot,
	cleanupExpiredEmployeeFormDraftSnapshots,
	deleteEmployeeFormDraftSnapshot,
	getEmployeeFormDraftSnapshot,
	hasMeaningfulEmployeeFormDraftData,
	sanitizeEmployeeFormDraftData,
	setEmployeeFormDraftSnapshot,
	validateEmployeeFormDraftSnapshot,
} from "~/lib/utils/employee-form-draft-idb";
import {
	buildEmployeeFormCreateHref,
	buildEmployeeFormReturnTo,
} from "~/lib/utils/import-setup-redirect";
import { getTodayDateInput, validateStrictDateInput } from "~/lib/utils/date-validation";
import { validateDocumentFieldValue } from "~/lib/utils/document-field-validation";
import type { DocumentType } from "~/services/document-types.service";
import { toast } from "sonner";
import type { FormData } from "~/types/employee-form.types";
import { EmployeeFormRhfSchema } from "~/zod/employee-form.rhf.zod";

type ActiveScheduleForm = NonNullable<FormData["employee"]["activeSchedule"]>;
type OptionalActiveScheduleForm = FormData["employee"]["activeSchedule"];
type ContactPhoneFormEntry = FormData["person"]["contactInfo"]["phones"][number];
type LegacyScheduleFormEntry = {
	entryId: string;
	assignmentType: "template" | "manual";
	scheduleId: string | null;
	scheduleCode: string;
	scheduleName: string;
	startDate: string;
	endDate: string | null;
	isActive: boolean;
	shifts: any[];
	gracePeriodMinutes: number;
	source: string;
	shiftSnapshot?: any;
	metadata?: any;
};

const steps: StepConfig[] = [
	{ id: "personal-ids", label: "Personal Info", icon: User },
	{ id: "employment", label: "Employment", icon: Briefcase },
	{ id: "compliance", label: "Compliance", icon: FileCheck },
	{ id: "benefits", label: "Benefits", icon: Gift },
	{ id: "system-access", label: "System Access", icon: Lock },
];

const COMPLIANCE_STEP_INDEX = 2;
const DEFAULT_DEBUG_ISSUE_DATE = "2025-01-15";
const DEFAULT_DEBUG_EXPIRY_DATE = "2028-12-31";
const EMPLOYEE_FORM_DRAFT_DEBOUNCE_MS = 600;
const RESERVED_DOCUMENT_FIELDS = new Set(["number", "issueDate", "expiryDate"]);
const FIELD_NAVIGATION_RETRY_LIMIT = 8;
const FIELD_NAVIGATION_RETRY_DELAY_MS = 90;
const MANUAL_DAY_SHIFT_NAME = "Manual Day Shift";
const MANUAL_DAY_SHIFT_CODE = "MANUAL_DAY_8_5";
const MANUAL_DAY_TIME_SLOTS = [
	{ type: "work", label: "Morning Work", startTime: "08:00", endTime: "12:00" },
	{ type: "break", label: "Lunch Break", startTime: "12:00", endTime: "13:00" },
	{ type: "work", label: "Afternoon Work", startTime: "13:00", endTime: "17:00" },
];
const STEP_FIELD_NAVIGATION_ORDER: Record<number, string[]> = {
	0: [
		"person.personalInfo.firstName",
		"person.personalInfo.lastName",
		"person.personalInfo.dateOfBirth",
		"person.personalInfo.gender",
		"person.personalInfo.nationality",
		"person.contactInfo.email",
		"person.contactInfo.phones.0.type",
		"person.contactInfo.phones.0.countryCode",
		"person.contactInfo.phones.0.number",
		"person.contactInfo.address.0.street",
		"person.contactInfo.address.0.houseNumber",
		"person.contactInfo.address.0.city",
		"person.contactInfo.address.0.state",
		"person.contactInfo.address.0.country",
		"person.contactInfo.address.0.postalCode",
		"person.contactInfo.address.0.zipCode",
		"person.identification.type",
		"person.identification.number",
		"person.identification.issuingCountry",
		"person.identification.expiryDate",
	],
	1: [
		"employee.employeeId",
		"employee.employmentHireDate",
		"employee.employmentStartDate",
		"employee.employmentStatus",
		"employee.employmentType",
		"employee.probationEndDate",
		"employee.departmentId",
		"employee.sectionId",
		"employee.reportToId",
		"employee.levelId",
		"employee.positionId",
		"employee.basicSalary",
		"employee.currency",
		"employee.payFrequency",
		"employee.workLocation",
		"employee.workforceSource",
		"employee.agencyId",
		"employee.activeSchedule",
	],
	2: [
		"employee.documents.*.number",
		"employee.documents.*.issueDate",
		"employee.documents.*.expiryDate",
		"employee.documents.*.fieldValues.*",
		"employee.documents.*.fileUrl",
		"employee.documents.*",
	],
	3: [
		"employee.leaveBalances.*.leaveType",
		"employee.leaveBalances.*.totalEntitled",
		"employee.leaveBalances.*.periodStart",
		"employee.leaveBalances.*.periodEnd",
		"employee.leaveBalances.*",
		"employee.employeeBenefits.*.benefitTypeId",
		"employee.employeeBenefits.*.payrollPeriodId",
		"employee.employeeBenefits.*.description",
		"employee.employeeBenefits.*.amount",
		"employee.employeeBenefits.*.startDate",
		"employee.employeeBenefits.*.endDate",
		"employee.employeeBenefits.*",
	],
	4: ["user.email", "user.userName", "user.password", "user.roleId"],
};

const normalizeDocumentDebugKey = (value: unknown) =>
	String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "");

const documentMatchesDebugToken = (documentType: DocumentType, tokens: string[]) => {
	const normalizedCode = normalizeDocumentDebugKey(documentType.code);
	const normalizedName = normalizeDocumentDebugKey(documentType.name);
	return tokens.some((token) => {
		const normalizedToken = normalizeDocumentDebugKey(token);
		return normalizedCode.includes(normalizedToken) || normalizedName.includes(normalizedToken);
	});
};

const buildFallbackDebugDocumentNumber = (documentType: DocumentType) => {
	const baseToken = normalizeDocumentDebugKey(documentType.code || documentType.name || "doc")
		.toUpperCase()
		.slice(0, 12);
	return `${baseToken || "DOC"}-DBG-001`;
};

const buildDebugDocumentDefaults = (documentType: DocumentType) => {
	if (documentMatchesDebugToken(documentType, ["employment contract", "contract"])) {
		return {
			number: "EMP-CONTRACT-2026-001",
			issueDate: "2025-01-15",
			expiryDate: "2027-01-15",
		};
	}

	if (documentMatchesDebugToken(documentType, ["tin", "tax identification number"])) {
		return {
			number: "123-456-789-000",
			issueDate: "2018-01-15",
			expiryDate: "",
		};
	}

	if (documentMatchesDebugToken(documentType, ["sss", "social security system"])) {
		return {
			number: "12-3456789-0",
			issueDate: "2018-01-15",
			expiryDate: "",
		};
	}

	if (documentMatchesDebugToken(documentType, ["philhealth"])) {
		return {
			number: "12-345678901-0",
			issueDate: "2018-01-15",
			expiryDate: "",
		};
	}

	if (documentMatchesDebugToken(documentType, ["pagibig", "pag-ibig"])) {
		return {
			number: "1234-5678-9012",
			issueDate: "2018-01-15",
			expiryDate: "",
		};
	}

	if (
		documentMatchesDebugToken(documentType, [
			"valid id",
			"passport",
			"national id",
			"company id",
			"drivers license",
		])
	) {
		return {
			number: "ID-DBG-2026-001",
			issueDate: "2025-02-01",
			expiryDate: "2030-12-31",
		};
	}

	return {
		number: buildFallbackDebugDocumentNumber(documentType),
		issueDate: DEFAULT_DEBUG_ISSUE_DATE,
		expiryDate: DEFAULT_DEBUG_EXPIRY_DATE,
	};
};

const getReservedDocumentField = (
	documentType: DocumentType,
	fieldKey: "number" | "issueDate" | "expiryDate",
): DocumentType["fields"][number] | undefined => {
	if (!Array.isArray(documentType.fields)) {
		return undefined;
	}

	return documentType.fields.find((field) => String(field.key || "").trim() === fieldKey);
};

const isDynamicFieldValueEmpty = (value: unknown) => {
	if (value === null || value === undefined) return true;
	if (value instanceof File) return false;
	if (typeof value === "string") return value.trim() === "";
	if (Array.isArray(value)) return value.length === 0;
	return false;
};

const sanitizeUsername = (value: string) =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");

const getRoleFlags = (roleName?: string | null) => ({
	isManager: roleName === "hris-employee-manager" || roleName === "hris-line-leader",
	isHrManager: roleName === "hris-hr-manager",
});

const escapeSelectorValue = (value: string) => {
	if (typeof window !== "undefined" && window.CSS?.escape) {
		return window.CSS.escape(value);
	}

	return value.replace(/["\\]/g, "\\$&");
};

const normalizePhoneEntries = (phones: any[] | null | undefined): ContactPhoneFormEntry[] => {
	if (!Array.isArray(phones) || phones.length === 0) {
		return [{ type: "mobile", countryCode: "+63", number: "", isPrimary: true }];
	}

	return phones.map((phone) => ({
		type: normalizePhoneTypeForForm(phone?.type),
		countryCode: normalizeCountryCodeForForm(phone?.countryCode),
		number: phone?.number || "",
		isPrimary: typeof phone?.isPrimary === "boolean" ? phone.isPrimary : true,
	}));
};

const normalizeChoiceToken = (value: unknown) =>
	String(value || "")
		.trim()
		.toLowerCase()
		.replace(/&/g, "and")
		.replace(/[^a-z0-9]+/g, "");

const normalizeChoiceValueForForm = (
	value: unknown,
	options: Array<{ value: string; label: string }>,
	fallback: string,
) => {
	const rawValue = String(value || "").trim();
	if (!rawValue) return fallback;

	const rawToken = normalizeChoiceToken(rawValue);
	const matchedOption = options.find(
		(option) =>
			option.value === rawValue ||
			normalizeChoiceToken(option.value) === rawToken ||
			normalizeChoiceToken(option.label) === rawToken,
	);

	return matchedOption?.value || fallback;
};

const normalizePhoneTypeForForm = (value: unknown): ContactPhoneFormEntry["type"] =>
	normalizeChoiceValueForForm(
		value,
		[
			{ value: "mobile", label: "Mobile" },
			{ value: "home", label: "Home" },
			{ value: "work", label: "Work" },
			{ value: "emergency", label: "Emergency" },
		],
		"mobile",
	) as ContactPhoneFormEntry["type"];

const normalizeCountryCodeForForm = (value: unknown) => {
	const rawValue = String(value || "").trim();
	if (!rawValue) return "+63";
	if (/^\+\d+/.test(rawValue)) return rawValue.match(/^\+\d+/)?.[0] || "+63";
	if (/^\d+$/.test(rawValue)) return `+${rawValue}`;
	return "+63";
};

const normalizeIdentificationTypeForForm = (
	value: unknown,
): FormData["person"]["identification"]["type"] =>
	normalizeChoiceValueForForm(
		value,
		[
			{ value: "passport", label: "Passport" },
			{ value: "drivers_license", label: "Driver's License" },
			{ value: "national_id", label: "National ID" },
			{ value: "postal_id", label: "Postal ID" },
			{ value: "voters_id", label: "Voter's ID" },
			{ value: "senior_citizen_id", label: "Senior Citizen ID" },
			{ value: "company_id", label: "Company ID" },
			{ value: "school_id", label: "School ID" },
		],
		"national_id",
	) as FormData["person"]["identification"]["type"];

const normalizeCountryForForm = (value: unknown): string => {
	const country = String(value || "").trim();
	if (!country) return "Philippines";

	const normalized = country.toLowerCase();
	if (normalized === "phl" || normalized === "ph" || normalized === "philippines") {
		return "Philippines";
	}

	return country;
};

const normalizeNationalityForForm = (value: unknown): string => {
	const nationality = String(value || "").trim();
	if (!nationality) return "Filipino";

	const normalized = nationality.toLowerCase();
	if (normalized === "phl" || normalized === "ph" || normalized === "philippines") {
		return "Filipino";
	}

	return nationality;
};

const appendEmployeeIdToReturnTarget = (returnTarget: string, employeeId: string) => {
	if (!returnTarget || !employeeId) return returnTarget;
	const [pathname, queryString = ""] = returnTarget.split("?");
	const params = new URLSearchParams(queryString);
	params.set("employeeId", employeeId);
	const nextQueryString = params.toString();
	return nextQueryString ? `${pathname}?${nextQueryString}` : pathname;
};

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

const buildEmptyAddressEntry = () => ({
	street: "",
	address2: "",
	city: "",
	state: "",
	country: "Philippines",
	postalCode: "",
	zipCode: "",
	houseNumber: "",
});

const normalizeAddressEntry = (address: unknown) => {
	if (typeof address === "string") {
		return {
			...buildEmptyAddressEntry(),
			street: address.trim(),
		};
	}

	if (!address || typeof address !== "object") {
		return buildEmptyAddressEntry();
	}

	const addressRecord = address as Record<string, unknown>;

	return {
		street: String(
			addressRecord.street ||
				addressRecord.address ||
				addressRecord.addressLine1 ||
				addressRecord.line1 ||
				"",
		).trim(),
		address2: String(
			addressRecord.address2 || addressRecord.addressLine2 || addressRecord.line2 || "",
		).trim(),
		city: String(addressRecord.city || "").trim(),
		state: String(addressRecord.state || addressRecord.province || "").trim(),
		country: normalizeCountryForForm(addressRecord.country),
		postalCode: String(addressRecord.postalCode || "").trim(),
		zipCode: String(addressRecord.zipCode || addressRecord.zip || "").trim(),
		houseNumber: String(addressRecord.houseNumber || addressRecord.number || "").trim(),
	};
};

const normalizeAddressEntries = (addresses: unknown) => {
	const firstAddress = Array.isArray(addresses) ? addresses[0] : addresses;
	return [normalizeAddressEntry(firstAddress)];
};

const normalizeIssuingCountryForForm = (value: unknown): string => {
	return normalizeCountryForForm(value);
};

const formatDateForInput = (dateStr: string | null | undefined) => {
	if (!dateStr) return "";
	const date = new Date(dateStr);
	if (Number.isNaN(date.getTime())) return "";
	return date.toISOString().split("T")[0];
};

const buildManualShiftSnapshot = () => ({
	name: MANUAL_DAY_SHIFT_NAME,
	code: MANUAL_DAY_SHIFT_CODE,
	description: "",
	startTime: "08:00",
	endTime: "17:00",
	breakMinutes: 60,
	graceLateMinutes: 0,
	graceEarlyOutMinutes: 0,
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

const buildActiveSchedulePatternDay = (day: number, snapshot?: any) => ({
	day,
	shiftTypeId: "",
	shiftSnapshot: normalizeShiftSnapshot(snapshot),
});

const normalizeActiveSchedulePattern = (pattern: any, cycleDays: number) => {
	const normalizedCycleDays = [7, 14, 21, 28].includes(Number(cycleDays)) ? Number(cycleDays) : 7;
	const safePattern = Array.isArray(pattern) ? pattern : [];

	return Array.from({ length: normalizedCycleDays }).map((_, index) => {
		const day = index + 1;
		const existing =
			safePattern.find((item: any) => Number(item?.day) === day) ||
			safePattern[index] ||
			null;
		if (!existing) return buildActiveSchedulePatternDay(day);

		if (existing?.shiftTypeId) {
			return {
				day,
				shiftTypeId: String(existing.shiftTypeId),
				shiftSnapshot: existing?.shiftSnapshot
					? normalizeShiftSnapshot(existing.shiftSnapshot)
					: null,
			};
		}

		return buildActiveSchedulePatternDay(day, existing?.shiftSnapshot);
	});
};

const buildDefaultActiveSchedule = (effectiveStartDate = ""): ActiveScheduleForm => ({
	effectiveStartDate,
	scheduleTemplateId: "",
	scheduleTemplateCode: "",
	scheduleTemplateName: "",
	cycleDays: 7,
	graceLateMinutes: 15,
	graceEarlyOutMinutes: 0,
	pattern: normalizeActiveSchedulePattern([], 7),
});

const documentTypeMatchesFormDocument = (
	documentType: DocumentType,
	document: Record<string, any> | null | undefined,
) => {
	if (!document) return false;

	const documentTypeId = String(document.documentTypeId || "").trim();
	const documentCode = normalizeDocumentDebugKey(document.type);
	const configuredCode = normalizeDocumentDebugKey(documentType.code);
	const documentName = normalizeDocumentDebugKey(document.name);
	const configuredName = normalizeDocumentDebugKey(documentType.name);

	return (
		(documentTypeId && documentTypeId === String(documentType.id || "").trim()) ||
		(documentCode && documentCode === configuredCode) ||
		(documentName && documentName === configuredName)
	);
};

const buildEmptyCustomDocumentFieldValue = (field: DocumentType["fields"][number]) => {
	if (field.type === "boolean") return false;
	return "";
};

const buildDebugCustomDocumentFieldValue = (
	documentType: DocumentType,
	field: DocumentType["fields"][number],
) => {
	if (field.type === "boolean") return true;
	if (field.type === "number") return 1001;
	if (field.type === "date") return DEFAULT_DEBUG_ISSUE_DATE;
	if (field.type === "select") return field.options?.[0]?.value || "";
	if (field.type === "file") {
		const docToken = normalizeDocumentDebugKey(documentType.code || documentType.name || "doc");
		return `${docToken || "doc"}-${field.key}.pdf`;
	}
	return `${documentType.name} ${field.label}`.trim();
};

const normalizeDocumentCustomFieldValueForForm = (
	field: DocumentType["fields"][number],
	value: unknown,
) => {
	if (value === null || value === undefined) {
		return buildEmptyCustomDocumentFieldValue(field);
	}

	if (field.type === "date") {
		return formatDateForInput(String(value || ""));
	}

	if (field.type === "boolean") {
		return Boolean(value);
	}

	return value;
};

const buildDocumentFieldValuesForForm = (
	documentType: DocumentType,
	existingFieldValues?: Record<string, unknown> | null,
	mode: "empty" | "debug" = "empty",
) => {
	const sourceValues =
		existingFieldValues && typeof existingFieldValues === "object" ? existingFieldValues : {};
	const nextFieldValues: Record<string, unknown> = {};

	Object.entries(sourceValues).forEach(([key, value]) => {
		if (!RESERVED_DOCUMENT_FIELDS.has(key)) {
			nextFieldValues[key] = value;
		}
	});

	for (const field of documentType.fields || []) {
		if (RESERVED_DOCUMENT_FIELDS.has(field.key)) continue;

		const rawValue = sourceValues[field.key];
		if (!isDynamicFieldValueEmpty(rawValue)) {
			nextFieldValues[field.key] = normalizeDocumentCustomFieldValueForForm(field, rawValue);
			continue;
		}

		nextFieldValues[field.key] =
			mode === "debug"
				? buildDebugCustomDocumentFieldValue(documentType, field)
				: buildEmptyCustomDocumentFieldValue(field);
	}

	return nextFieldValues;
};

const buildComplianceDocumentFormValue = (
	documentType: DocumentType,
	existingDocument?: Record<string, any> | null,
	mode: "empty" | "debug" = "empty",
) => {
	const existing = existingDocument || null;
	const debugDefaults = mode === "debug" ? buildDebugDocumentDefaults(documentType) : null;
	const hasIssueDateField = Boolean(getReservedDocumentField(documentType, "issueDate"));
	const hasExpiryDateField = Boolean(getReservedDocumentField(documentType, "expiryDate"));

	return {
		name: existing?.name || documentType.name,
		type: existing?.type || documentType.code,
		documentTypeId: existing?.documentTypeId || existing?.documentType?.id || documentType.id,
		number: existing?.number || debugDefaults?.number || "",
		issueDate: existing?.issueDate
			? formatDateForInput(existing.issueDate)
			: existing
				? ""
			: debugDefaults && hasIssueDateField
				? debugDefaults.issueDate
				: hasIssueDateField
					? getTodayDateInput()
					: "",
		expiryDate: existing?.expiryDate
			? formatDateForInput(existing.expiryDate)
			: debugDefaults && hasExpiryDateField
				? debugDefaults.expiryDate
				: null,
		fileUrl: existing?.fileUrl || "",
		ext: existing?.ext || "",
		fieldValues: buildDocumentFieldValuesForForm(
			documentType,
			existing?.fieldValues || null,
			mode,
		),
		metadata: existing?.metadata || null,
	};
};

const buildDefaultEmployeeFormValues = (organizationId: string, todayDate: string): FormData => ({
	person: {
		organizationId,
		personalInfo: {
			prefix: "",
			firstName: "",
			middleName: "",
			lastName: "",
			dateOfBirth: "",
			placeOfBirth: "",
			age: 0,
			nationality: "Filipino",
			primaryLanguage: "",
			gender: "male",
			currency: "PHP",
			vipCode: "",
		},
		contactInfo: {
			email: "",
			phones: [{ type: "mobile", countryCode: "+63", number: "", isPrimary: true }],
			fax: "",
			address: [
				{
					street: "",
					address2: "",
					city: "",
					state: "",
					country: "Philippines",
					postalCode: "",
					zipCode: "",
					houseNumber: "",
				},
			],
		},
		identification: {
			type: "national_id",
			number: "",
			issuingCountry: "Philippines",
			expiryDate: "",
		},
	},
	employee: {
		organizationId,
		employeeId: "",
		deviceEmpId: "",
		employmentHireDate: todayDate,
		employmentStartDate: todayDate,
		employmentTerminationDate: null,
		employmentStatus: "ONBOARDING",
		employmentType: "PROBATIONARY",
		probationEndDate: addMonthsToDateInputValue(todayDate, 6),
		departmentId: "",
		sectionId: null,
		positionId: "",
		levelId: "",
		activeSchedule: buildDefaultActiveSchedule(todayDate),
		basicSalary: 0,
		currency: "PHP",
		payFrequency: "SEMI_MONTHLY",
		documents: [],
		leaveBalances: [],
		workLocation: "ONSITE",
		workforceSource: "DIRECT",
		agencyId: null,
		isManager: false,
		isHrManager: false,
		derivedRole: undefined,
		reportToId: null,
		employeeBenefits: [],
	},
	user: {
		email: "",
		userName: "",
		password: "",
		avatar: "",
		status: "active",
		loginMethod: "email",
		roleId: "",
		organizationId,
	},
});

const normalizeShiftSnapshot = (snapshot: any) => {
	if (!snapshot || typeof snapshot !== "object") return buildManualShiftSnapshot();
	if (shouldUseManualDayDefault(snapshot)) return buildManualShiftSnapshot();
	const timeSlots = Array.isArray(snapshot.timeSlots)
		? snapshot.timeSlots
				.filter(
					(slot: any) =>
						slot &&
						typeof slot.startTime === "string" &&
						typeof slot.endTime === "string" &&
						slot.startTime &&
						slot.endTime,
				)
				.map((slot: any) => ({
					type: String(slot.type || "work"),
					label: slot.label ? String(slot.label) : "",
					startTime: String(slot.startTime),
					endTime: String(slot.endTime),
				}))
		: [];

	return {
		name: snapshot.name || MANUAL_DAY_SHIFT_NAME,
		code: snapshot.code || MANUAL_DAY_SHIFT_CODE,
		startTime: snapshot.startTime || "",
		endTime: snapshot.endTime || "",
		breakMinutes: Math.max(0, Number(snapshot.breakMinutes || 0)),
		graceLateMinutes: Math.max(0, Number(snapshot.graceLateMinutes || 0)),
		graceEarlyOutMinutes: Math.max(0, Number(snapshot.graceEarlyOutMinutes || 0)),
		isOvernight: Boolean(snapshot.isOvernight),
		isOff: Boolean(snapshot.isOff),
		timeSlots: timeSlots.length ? timeSlots : buildManualShiftSnapshot().timeSlots,
	};
};

const buildShiftSnapshotFromShiftType = (shiftType: any) => {
	if (!shiftType || typeof shiftType !== "object") return null;
	const timeSlots = Array.isArray(shiftType.timeSlots)
		? shiftType.timeSlots
				.filter(
					(slot: any) =>
						slot &&
						typeof slot.startTime === "string" &&
						typeof slot.endTime === "string" &&
						slot.startTime &&
						slot.endTime,
				)
				.map((slot: any) => ({
					type: String(slot.type || "work"),
					label: slot.label ? String(slot.label) : "",
					startTime: String(slot.startTime),
					endTime: String(slot.endTime),
				}))
		: [];

	return {
		name: shiftType.name || "",
		code: shiftType.code || "",
		startTime: shiftType.startTime || "",
		endTime: shiftType.endTime || "",
		breakMinutes: Math.max(0, Number(shiftType.breakMinutes || 0)),
		graceLateMinutes: Math.max(0, Number(shiftType.graceLateMinutes || 0)),
		graceEarlyOutMinutes: Math.max(0, Number(shiftType.graceEarlyOutMinutes || 0)),
		isOvernight: Boolean(shiftType.isOvernight),
		isOff: Boolean(shiftType.isOff),
	timeSlots: timeSlots.length
		? timeSlots
		: buildManualShiftSnapshot().timeSlots,
	};
};

export type EmployeeFormProps = {
	presentation?: "page" | "modal";
	onRequestClose?: () => void;
};

export function EmployeeForm({ presentation = "page", onRequestClose }: EmployeeFormProps = {}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const location = useLocation();
	const { user } = useAuth();
	const [searchParams, setSearchParams] = useSearchParams();
	const { id } = useParams();
	const todayDate = getTodayDateInput();
	const sourceApplicantId =
		String(searchParams.get("sourceApplicantId") || searchParams.get("applicantId") || "").trim();
	const sourceApplicantReturnTo = String(searchParams.get("returnTo") || "").trim();

	// Check if we're in edit mode
	const isEditMode = !!id;
	const { data: employeeCountData } = useEmployees(
		{ page: 1, limit: 1, count: true },
		{
			enabled: !isEditMode && Boolean(user?.organizationId || user?.organization?.id),
		},
	);
	const employeeTotalForOrg =
		typeof (employeeCountData as any)?.pagination?.total === "number"
			? (employeeCountData as any).pagination.total
			: null;
	const showFirstEmployeeGuide = !isEditMode && employeeTotalForOrg === 0;
	const [isPrefillNavigationUnlocked, setIsPrefillNavigationUnlocked] = useState(false);
	const hasAttemptedInitialReserveRef = useRef(false);
	const hasFailedAutoReserveRef = useRef(false);
	const reserveEmployeeIdPromiseRef = useRef<Promise<string> | null>(null);
	const initializedEditEmployeeIdRef = useRef<string | null>(null);
	const pendingFieldNavigationRef = useRef<{
		fieldPath: string;
		source: "frontend" | "backend";
		originalFieldPath?: string;
	} | null>(null);
	const organizationId = user?.organizationId || user?.organization?.id || "";
	const draftUserId = String(user?.id || "unknown-user");
	const draftOrganizationId = organizationId || "unknown-org";
	const employeeListPath = useMemo(
		() =>
			location.pathname.startsWith("/admin/configuration/employees")
				? "/admin/configuration/employees"
				: "/hr/employees",
		[location.pathname],
	);
	const draftEntityKey = useMemo(
		() =>
			buildEmployeeFormDraftEntityKey({
				pathname: sourceApplicantId
					? `${employeeListPath}/new:applicant:${sourceApplicantId}`
					: `${employeeListPath}/new`,
				organizationId: draftOrganizationId,
				userId: draftUserId,
			}),
		[draftOrganizationId, draftUserId, employeeListPath, sourceApplicantId],
	);
	const defaultFormValues = useMemo(
		() => buildDefaultEmployeeFormValues(organizationId, todayDate),
		[organizationId, todayDate],
	);

	// Get step from URL or default to 0
	const stepFromUrl = searchParams.get("step");
	const requestedInitialStep = stepFromUrl ? parseInt(stepFromUrl, 10) : 0;
	const initialStep =
		isEditMode && requestedInitialStep >= 0 && requestedInitialStep < steps.length
			? requestedInitialStep
			: 0;
	const [currentStep, setCurrentStep] = useState(
		initialStep,
	);

	// State for document files
	const [documentFiles, setDocumentFiles] = useState<{ [key: string]: File | null }>({});

	// State for enabled compliance documents
	const [enabledDocuments, setEnabledDocuments] = useState<{ [key: string]: boolean }>({});
	const [isDraftHydrationReady, setIsDraftHydrationReady] = useState(isEditMode);
	const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
	const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
	const [draftFormValues, setDraftFormValues] = useState<FormData>(defaultFormValues);
	const [fieldNavigationTick, setFieldNavigationTick] = useState(0);

	const buildClearedComplianceDocument = useCallback(
		(documentType: DocumentType, existingDocument?: Record<string, any> | null) => ({
			...buildComplianceDocumentFormValue(documentType, existingDocument, "empty"),
			number: "",
			issueDate: "",
			expiryDate: null,
			fileUrl: "",
			ext: "",
		}),
		[],
	);

	const handleToggleDocument = (docType: string) => {
		const documentType = complianceDocumentTypes.find((item) => item.id === docType);
		if (!documentType) {
			setEnabledDocuments((prev) => ({
				...prev,
				[docType]: !prev[docType],
			}));
			return;
		}

		const nextEnabledState = !enabledDocuments[docType];
		setEnabledDocuments((prev) => ({
			...prev,
			[docType]: nextEnabledState,
		}));

		if (!nextEnabledState) {
			const currentDocuments = [...(form.getValues("employee.documents") || [])];
			const documentIndex = complianceDocumentTypes.findIndex((item) => item.id === docType);
			if (documentIndex >= 0) {
				currentDocuments[documentIndex] = buildClearedComplianceDocument(
					documentType,
					currentDocuments[documentIndex] || null,
				);
				form.setValue("employee.documents", currentDocuments, {
					shouldDirty: true,
					shouldValidate: false,
				});
			}

			setDocumentFiles((prev) => {
				if (!(docType in prev)) return prev;
				const next = { ...prev };
				delete next[docType];
				return next;
			});
			form.clearErrors(`employee.documents.${documentIndex}` as any);
		}
	};

	// Check if debug mode is enabled
	const isDebugMode = searchParams.get("debug") === "true";

	// Sync URL when step changes
	useEffect(() => {
		setSearchParams(
			(previous) => {
				const next = new URLSearchParams(previous);
				next.set("step", currentStep.toString());
				if (isDebugMode) {
					next.set("debug", "true");
				} else {
					next.delete("debug");
				}
				return next;
			},
			{ replace: true },
		);
	}, [currentStep, setSearchParams, isDebugMode]);

	useEffect(() => {
		initializedEditEmployeeIdRef.current = null;
	}, [id]);

	const createEmployeeMutation = useCreateEmployeeWithAccount();
	const updateEmployeeMutation = useUpdateEmployeeWithAccount();
	const reserveEmployeeIdMutation = useReserveEmployeeId();
	const reserveEmployeeIdMutateAsync = reserveEmployeeIdMutation.mutateAsync;
	const isEmployeeIdLoading = reserveEmployeeIdMutation.isPending;

	// Fetch employee data if in edit mode
	const { data: employeeData, isLoading: isLoadingEmployee } = useEmployee(id || "");
	const { data: sourceApplicant, isLoading: isLoadingSourceApplicant } =
		useApplicant(sourceApplicantId);
	const appliedApplicantPrefillRef = useRef<string | null>(null);
	const shouldShowEditDefaultPassword = useMemo(() => {
		if (!isEditMode) return true;
		const employeeRecord = employeeData as any;
		return employeeRecord?.user?.metadata?.requirePasswordChange === true;
	}, [employeeData, isEditMode]);

	// Fetch data for auto-populating dropdowns
	const { data: departmentsData, isLoading: isLoadingDepartments } = useDepartments();
	const { data: positionsData, isLoading: isLoadingPositions } = usePositions();
	const { data: levelsData, isLoading: isLoadingLevels } = useLevels();
	const { data: schedulesData, isLoading: isLoadingSchedules } = useWorkSchedules();
	const { data: shiftTypesData } = useShiftTypes(
		{ page: 1, limit: 1000, document: true, count: true },
		{ enabled: !!organizationId },
	);
	const { data: rolesData, isLoading: isLoadingRoles } = useRoles(true);
	const { data: complianceDocumentTypesData, isLoading: isLoadingComplianceDocumentTypes } =
		useDocumentTypes(
			{
				page: 1,
				limit: 100,
				sort: "displayOrder",
				order: "asc",
				filter: "isActive:true",
			},
			{
				enabled: !!organizationId,
			},
		);

	const availableSchedules = useMemo(
		() =>
			Array.isArray(schedulesData)
				? schedulesData
				: Array.isArray((schedulesData as any)?.schedules)
					? (schedulesData as any).schedules
					: Array.isArray((schedulesData as any)?.data)
						? (schedulesData as any).data
						: Array.isArray((schedulesData as any)?.data?.schedules)
							? (schedulesData as any).data.schedules
							: [],
		[schedulesData],
	);
	const complianceDocumentTypes = (complianceDocumentTypesData?.documentTypes || []).filter(
		(item) => item.isActive && item.isEmployeeVisible,
	);
	const shiftTypeById = useMemo(() => {
		const list =
			(shiftTypesData as any)?.shiftTypes ||
			(shiftTypesData as any)?.data?.shiftTypes ||
			(shiftTypesData as any)?.data ||
			[];
		const map = new Map<string, any>();
		for (const shiftType of Array.isArray(list) ? list : []) {
			const shiftTypeId = String(
				(shiftType as any)?.id || (shiftType as any)?._id || "",
			).trim();
			if (shiftTypeId) {
				map.set(shiftTypeId, shiftType);
			}
		}
		return map;
	}, [shiftTypesData]);

	const form = useForm<FormData>({
		resolver: zodResolver(EmployeeFormRhfSchema) as unknown as Resolver<FormData>,
		mode: "onTouched",
		reValidateMode: "onChange",
		defaultValues: defaultFormValues,
	});
	const skipNextDraftPersistRef = useRef(false);
	const lastPersistedDraftSignatureRef = useRef<string | null>(null);

	useEffect(() => {
		const createdDepartmentId = String(searchParams.get("createdDepartmentId") || "").trim();
		const createdPositionId = String(searchParams.get("createdPositionId") || "").trim();
		if (!createdDepartmentId && !createdPositionId) return;

		if (createdDepartmentId) {
			form.setValue("employee.departmentId", createdDepartmentId, {
				shouldDirty: true,
				shouldValidate: true,
			});
		}

		if (createdPositionId) {
			form.setValue("employee.positionId", createdPositionId, {
				shouldDirty: true,
				shouldValidate: true,
			});
		}

		setSearchParams(
			(previous) => {
				const next = new URLSearchParams(previous);
				next.delete("createdDepartmentId");
				next.delete("createdPositionId");
				return next;
			},
			{ replace: true },
		);
	}, [form, searchParams, setSearchParams]);

	useEffect(() => {
		if (isEditMode || !sourceApplicantId || !sourceApplicant || isLoadingSourceApplicant) {
			return;
		}
		if (!isDraftHydrationReady) return;
		if (appliedApplicantPrefillRef.current === sourceApplicantId) return;

		const applicant = sourceApplicant as any;
		const personalInfo = applicant?.person?.personalInfo || {};
		const contactInfo = applicant?.person?.contactInfo || {};
		const identification = applicant?.person?.identification || {};
		const firstName = String(personalInfo.firstName || "").trim();
		const lastName = String(personalInfo.lastName || "").trim();
		const generatedUserName = [firstName, lastName]
			.filter(Boolean)
			.join("-")
			.toLowerCase()
			.replace(/[^a-z0-9_-]+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "");
		const sourceDepartmentId =
			String(
				applicant.departmentId ||
					applicant.department?.id ||
					applicant.job?.departmentId ||
					applicant.job?.department?.id ||
					applicant.job?.position?.section?.departmentId ||
					applicant.job?.position?.section?.department?.id ||
					applicant.position?.section?.departmentId ||
					applicant.position?.section?.department?.id ||
					"",
			).trim() || "";
		const sourcePositionId =
			String(
				applicant.positionId ||
					applicant.position?.id ||
					applicant.job?.positionId ||
					applicant.job?.position?.id ||
					"",
			).trim() || "";
		const sourceLevelId =
			String(applicant.levelId || applicant.level?.id || applicant.job?.levelId || applicant.job?.level?.id || "").trim() ||
			"";
		const hireDate = todayDate;
		const startDate = formatDateForInput(applicant.availabilityDate) || hireDate;
		const probationEndDate = addMonthsToDateInputValue(startDate, 6);
		const expectedSalary = Number(applicant.expectedSalary || 0);
		const nextValues: FormData = {
			...defaultFormValues,
			person: {
				...defaultFormValues.person,
				personalInfo: {
					...defaultFormValues.person.personalInfo,
					prefix: personalInfo.prefix || "",
					firstName,
					middleName: personalInfo.middleName || "",
					lastName,
					dateOfBirth: formatDateForInput(personalInfo.dateOfBirth),
					placeOfBirth: personalInfo.placeOfBirth || "",
					age: Number(personalInfo.age || 0),
					nationality: normalizeNationalityForForm(personalInfo.nationality),
					primaryLanguage: personalInfo.primaryLanguage || "",
					gender: (personalInfo.gender ||
						"prefer_not_to_say") as FormData["person"]["personalInfo"]["gender"],
					currency: applicant.currency || personalInfo.currency || "PHP",
				},
				contactInfo: {
					...defaultFormValues.person.contactInfo,
					email: contactInfo.email || "",
					phones: normalizePhoneEntries(contactInfo.phones),
					fax: contactInfo.fax || "",
					address: normalizeAddressEntries(contactInfo.address),
				},
				identification: {
					...defaultFormValues.person.identification,
					type: normalizeIdentificationTypeForForm(identification.type),
					number: identification.number || "",
					issuingCountry: normalizeIssuingCountryForForm(
						identification.issuingCountry,
					),
					expiryDate: formatDateForInput(identification.expiryDate),
				},
			},
			employee: {
				...defaultFormValues.employee,
				employmentHireDate: hireDate,
				employmentStartDate: startDate,
				employmentStatus: "ONBOARDING",
				employmentType: "PROBATIONARY",
				probationEndDate,
				departmentId: sourceDepartmentId,
				positionId: sourcePositionId,
				levelId: sourceLevelId,
				activeSchedule: buildDefaultActiveSchedule(startDate),
				basicSalary: Number.isFinite(expectedSalary) && expectedSalary > 0 ? expectedSalary : 0,
				currency: applicant.currency || "PHP",
				payFrequency: "SEMI_MONTHLY",
				workLocation: "ONSITE",
				metadata: {
					source: "recruitment_applicant_deeplink",
					sourceApplicantId,
					applicantId: applicant.applicantId || null,
					jobId: applicant.jobId || applicant.job?.id || null,
				},
			},
			user: {
				...defaultFormValues.user,
				email: contactInfo.email || "",
				userName: generatedUserName,
				organizationId,
			},
		};

		skipNextDraftPersistRef.current = true;
		lastPersistedDraftSignatureRef.current = null;
		form.reset(nextValues);
		setDraftFormValues(nextValues);
		setEnabledDocuments({});
		setDocumentFiles({});
		setCurrentStep(0);
		setHasRestoredDraft(false);
		setDraftSavedAt(null);
		setIsPrefillNavigationUnlocked(true);
		appliedApplicantPrefillRef.current = sourceApplicantId;
		void deleteEmployeeFormDraftSnapshot(draftEntityKey);
		toast.success("Applicant details prefilled", {
			description: "Review the employee record, complete missing fields, then create the employee account.",
		});
	}, [
		defaultFormValues,
		draftEntityKey,
		form,
		isDraftHydrationReady,
		isEditMode,
		isLoadingSourceApplicant,
		organizationId,
		sourceApplicant,
		sourceApplicantId,
		todayDate,
	]);

	useEffect(() => {
		setDraftFormValues(form.getValues());
		const subscription = form.watch((value) => {
			setDraftFormValues((value as FormData) || form.getValues());
		});

		return () => subscription.unsubscribe();
	}, [form]);

	const reserveEmployeeIdForForm = useCallback(
		async ({ force = false }: { force?: boolean } = {}) => {
			const currentEmployeeId = form.getValues("employee.employeeId");
			if (!force && currentEmployeeId) {
				return currentEmployeeId;
			}

			if (reserveEmployeeIdPromiseRef.current) {
				return reserveEmployeeIdPromiseRef.current;
			}

			const currentOrganizationId = user?.organizationId || user?.organization?.id;
			if (!currentOrganizationId) {
				throw new Error("Organization ID not found. Please ensure you are logged in.");
			}

			const reservePromise = reserveEmployeeIdMutateAsync({
				organizationId: currentOrganizationId,
			})
				.then((reserved) => reserved.employeeId)
				.finally(() => {
					reserveEmployeeIdPromiseRef.current = null;
				});

			reserveEmployeeIdPromiseRef.current = reservePromise;
			return reservePromise;
		},
		[form, reserveEmployeeIdMutateAsync, user?.organization?.id, user?.organizationId],
	);

	const ensureReservedEmployeeId = useCallback(
		async (force = false, options?: { isAutomatic?: boolean }) => {
			const currentEmployeeId = form.getValues("employee.employeeId");
			if (!force && currentEmployeeId) return currentEmployeeId;

			const isAutomatic = options?.isAutomatic ?? false;
			if (isAutomatic && hasFailedAutoReserveRef.current) {
				return "";
			}

			try {
				const employeeId = await reserveEmployeeIdForForm({ force });
				hasFailedAutoReserveRef.current = false;
				const latestEmployeeId = form.getValues("employee.employeeId");
				if (employeeId && (force || !latestEmployeeId)) {
					form.setValue("employee.employeeId", employeeId, { shouldValidate: true });
				}
				return employeeId;
			} catch (error) {
				if (isAutomatic) {
					hasFailedAutoReserveRef.current = true;
				}
				throw error;
			}
		},
		[form, reserveEmployeeIdForForm],
	);

	const clearEmployeeDraftSnapshot = useCallback(async () => {
		try {
			await deleteEmployeeFormDraftSnapshot(draftEntityKey);
		} catch {
			// Ignore IndexedDB cleanup failures in UI flow
		}
	}, [draftEntityKey]);

	const buildDraftPersistenceSignature = useCallback(
		(formData: FormData, stepIndex: number, documentsState: Record<string, boolean>) =>
			JSON.stringify({
				currentStep: stepIndex,
				enabledDocuments: documentsState,
				formData: sanitizeEmployeeFormDraftData(formData),
			}),
		[],
	);

	const resetCreateFormToDefaults = useCallback(
		async ({ reserveFreshEmployeeId = false }: { reserveFreshEmployeeId?: boolean } = {}) => {
			skipNextDraftPersistRef.current = true;
			lastPersistedDraftSignatureRef.current = null;
			form.reset(defaultFormValues);
			setDraftFormValues(defaultFormValues);
			setEnabledDocuments({});
			setDocumentFiles({});
			setCurrentStep(0);
			setHasRestoredDraft(false);
			setDraftSavedAt(null);
			setIsPrefillNavigationUnlocked(false);
			form.clearErrors();
			reserveEmployeeIdPromiseRef.current = null;
			hasFailedAutoReserveRef.current = false;

			if (reserveFreshEmployeeId) {
				try {
					await ensureReservedEmployeeId(true);
				} catch (error) {
					console.error(
						"Failed to reserve a fresh employee ID after draft reset:",
						error,
					);
				}
			}
		},
		[defaultFormValues, ensureReservedEmployeeId, form],
	);

	const handleDiscardDraft = useCallback(async () => {
		await clearEmployeeDraftSnapshot();
		await resetCreateFormToDefaults({ reserveFreshEmployeeId: true });
		setSearchParams({ step: "0" }, { replace: true });
		toast.success("Employee draft discarded");
	}, [clearEmployeeDraftSnapshot, resetCreateFormToDefaults, setSearchParams]);

	useEffect(() => {
		if (isEditMode) {
			setIsDraftHydrationReady(true);
			return;
		}

		let cancelled = false;
		setIsDraftHydrationReady(false);

		const hydrateDraft = async () => {
			try {
				await cleanupExpiredEmployeeFormDraftSnapshots(Date.now());
				const snapshot = await getEmployeeFormDraftSnapshot(draftEntityKey);
				if (cancelled) return;

				const restoredSnapshot = validateEmployeeFormDraftSnapshot(
					snapshot,
					{
						entityKey: draftEntityKey,
						organizationId: draftOrganizationId,
						userId: draftUserId,
					},
					Date.now(),
				);

				if (!restoredSnapshot) {
					if (snapshot) {
						await clearEmployeeDraftSnapshot();
					}
					if (cancelled) return;
					setHasRestoredDraft(false);
					setDraftSavedAt(null);
					setIsDraftHydrationReady(true);
					return;
				}

				const normalizedStep = Math.min(
					Math.max(restoredSnapshot.currentStep, 0),
					steps.length - 1,
				);

				const restoredFormData: FormData = {
					...restoredSnapshot.formData,
					person: {
						...restoredSnapshot.formData.person,
						personalInfo: {
							...restoredSnapshot.formData.person.personalInfo,
							nationality: normalizeNationalityForForm(
								restoredSnapshot.formData.person.personalInfo?.nationality,
							),
						},
					},
				};

				skipNextDraftPersistRef.current = true;
				form.reset(restoredFormData);
				setDraftFormValues(restoredFormData);
				setEnabledDocuments(restoredSnapshot.enabledDocuments || {});
				setDocumentFiles({});
				setCurrentStep(normalizedStep);
				lastPersistedDraftSignatureRef.current = buildDraftPersistenceSignature(
					restoredFormData,
					normalizedStep,
					restoredSnapshot.enabledDocuments || {},
				);
				setHasRestoredDraft(true);
				setDraftSavedAt(restoredSnapshot.savedAt);
				setIsDraftHydrationReady(true);
			} catch (error) {
				if (cancelled) return;
				console.error("Failed to hydrate employee form draft:", error);
				setHasRestoredDraft(false);
				setDraftSavedAt(null);
				setIsDraftHydrationReady(true);
			}
		};

		void hydrateDraft();

		return () => {
			cancelled = true;
		};
	}, [
		clearEmployeeDraftSnapshot,
		buildDraftPersistenceSignature,
		draftEntityKey,
		draftOrganizationId,
		draftUserId,
		form,
		isEditMode,
	]);

	useEffect(() => {
		if (isEditMode || !isDraftHydrationReady) {
			return;
		}

		if (skipNextDraftPersistRef.current) {
			skipNextDraftPersistRef.current = false;
			return;
		}

		let cancelled = false;
		const timeout = window.setTimeout(async () => {
			try {
				const shouldPersist = hasMeaningfulEmployeeFormDraftData({
					formData: draftFormValues,
					defaultValues: defaultFormValues,
					enabledDocuments,
					currentStep,
				});

				if (!shouldPersist) {
					await clearEmployeeDraftSnapshot();
					if (cancelled) return;
					setDraftSavedAt(null);
					lastPersistedDraftSignatureRef.current = null;
					return;
				}

				const draftSignature = buildDraftPersistenceSignature(
					draftFormValues,
					currentStep,
					enabledDocuments,
				);
				if (draftSignature === lastPersistedDraftSignatureRef.current) {
					return;
				}

				const snapshot = buildEmployeeFormDraftSnapshot({
					entityKey: draftEntityKey,
					organizationId: draftOrganizationId,
					userId: draftUserId,
					currentStep,
					enabledDocuments,
					formData: draftFormValues,
				});
				await setEmployeeFormDraftSnapshot(snapshot);
				if (cancelled) return;
				lastPersistedDraftSignatureRef.current = draftSignature;
				setDraftSavedAt(snapshot.savedAt);
			} catch (error) {
				if (!cancelled) {
					console.error("Failed to persist employee form draft:", error);
				}
			}
		}, EMPLOYEE_FORM_DRAFT_DEBOUNCE_MS);

		return () => {
			cancelled = true;
			window.clearTimeout(timeout);
		};
	}, [
		clearEmployeeDraftSnapshot,
		buildDraftPersistenceSignature,
		currentStep,
		defaultFormValues,
		draftEntityKey,
		draftFormValues,
		draftOrganizationId,
		draftUserId,
		enabledDocuments,
		isDraftHydrationReady,
		isEditMode,
	]);

	const handleRegenerateEmployeeId = async () => {
		if (isEditMode) return;
		try {
			hasFailedAutoReserveRef.current = false;
			await ensureReservedEmployeeId(true);
			form.clearErrors("employee.employeeId");
			toast.success("Employee ID regenerated");
		} catch (error) {
			navigateToErrorField("employee.employeeId", "frontend");
			toast.error("Unable to regenerate employee ID", {
				description: "Please try again.",
			});
		}
	};

	const buildDebugDocumentsFromConfiguredTypes = useCallback(
		(documentTypes: DocumentType[]) =>
			documentTypes.map((documentType) =>
				documentType.isRequired
					? buildComplianceDocumentFormValue(documentType, null, "debug")
					: buildComplianceDocumentFormValue(documentType, null, "empty"),
			),
		[],
	);

	const validateComplianceStep = () => {
		form.clearErrors("employee.documents");

		if (!complianceDocumentTypes.length) {
			return true;
		}

		const documents = form.getValues("employee.documents") || [];
		let isValid = true;

		complianceDocumentTypes.forEach((documentType, index) => {
			const isIncluded = Boolean(enabledDocuments[documentType.id]);
			const documentValue = documents[index] || null;

			if (!isIncluded) return;

			if (
				getReservedDocumentField(documentType, "number")?.required &&
				!String(documentValue?.number || "").trim()
			) {
				form.setError(`employee.documents.${index}.number` as any, {
					type: "required",
					message: `${documentType.name} document number is required.`,
				});
				isValid = false;
			}

			if (
				getReservedDocumentField(documentType, "issueDate")?.required &&
				!String(documentValue?.issueDate || "").trim()
			) {
				form.setError(`employee.documents.${index}.issueDate` as any, {
					type: "required",
					message: `${documentType.name} issue date is required.`,
				});
				isValid = false;
			}

			if (
				getReservedDocumentField(documentType, "expiryDate")?.required &&
				!String(documentValue?.expiryDate || "").trim()
			) {
				form.setError(`employee.documents.${index}.expiryDate` as any, {
					type: "required",
					message: `${documentType.name} expiry date is required.`,
				});
				isValid = false;
			}

			(documentType.fields || []).forEach((field) => {
				if (
					field.type === "file" ||
					field.key === "number" ||
					field.key === "issueDate" ||
					field.key === "expiryDate"
				) {
					return;
				}

				const fieldValue = documentValue?.fieldValues?.[field.key];
				const validationResult = validateDocumentFieldValue(field, fieldValue);
				if (validationResult !== true) {
					form.setError(`employee.documents.${index}.fieldValues.${field.key}` as any, {
						type: "manual",
						message: validationResult,
					});
					isValid = false;
				}
			});

			const numberField = getReservedDocumentField(documentType, "number");
			if (numberField) {
				const validationResult = validateDocumentFieldValue(
					numberField,
					documentValue?.number,
				);
				if (validationResult !== true) {
					form.setError(`employee.documents.${index}.number` as any, {
						type: "manual",
						message: validationResult,
					});
					isValid = false;
				}
			}
		});

		if (!isValid) {
			toast.error("Please complete the included compliance fields before proceeding.", {
				description: "Only documents you included in this step need to be completed now.",
			});
		}

		return isValid;
	};

	const validateCurrentStep = async (
		stepIndex: number,
		options?: { showToast?: boolean; navigateOnError?: boolean },
	) => {
		const showToast = options?.showToast ?? true;
		const navigateOnError = options?.navigateOnError ?? true;
		const stepFields: Record<number, string[]> = {
			0: STEP_FIELD_NAVIGATION_ORDER[0],
			1: STEP_FIELD_NAVIGATION_ORDER[1],
			2: ["employee.documents"],
			3: ["employee.leaveBalances"],
			4: STEP_FIELD_NAVIGATION_ORDER[4],
		};

		const fieldsToValidate = (stepFields[stepIndex] || []) as FieldPath<FormData>[];
		let baseValid = await form.trigger(fieldsToValidate);

		if (stepIndex === 1) {
			const requiredEmploymentFields: Array<{
				path: FieldPath<FormData>;
				message: string;
				isMissing: () => boolean;
			}> = [
				{
					path: "employee.employeeId",
					message: "Employee ID is required",
					isMissing: () => !String(form.getValues("employee.employeeId") || "").trim(),
				},
				{
					path: "employee.employmentHireDate",
					message: "Hire date is required",
					isMissing: () =>
						!String(form.getValues("employee.employmentHireDate") || "").trim(),
				},
				{
					path: "employee.employmentStartDate",
					message: "Start date is required",
					isMissing: () =>
						!String(form.getValues("employee.employmentStartDate") || "").trim(),
				},
				{
					path: "employee.employmentStatus",
					message: "Employment status is required",
					isMissing: () =>
						!String(form.getValues("employee.employmentStatus") || "").trim(),
				},
				{
					path: "employee.employmentType",
					message: "Employment type is required",
					isMissing: () =>
						!String(form.getValues("employee.employmentType") || "").trim(),
				},
				{
					path: "employee.departmentId",
					message: "Department is required",
					isMissing: () => !String(form.getValues("employee.departmentId") || "").trim(),
				},
				{
					path: "employee.positionId",
					message: "Position is required",
					isMissing: () => !String(form.getValues("employee.positionId") || "").trim(),
				},
				{
					path: "employee.basicSalary",
					message: "Basic salary is required",
					isMissing: () => {
						const salary = form.getValues("employee.basicSalary");
						return salary === null || salary === undefined || Number.isNaN(Number(salary));
					},
				},
				{
					path: "employee.currency",
					message: "Currency is required",
					isMissing: () => !String(form.getValues("employee.currency") || "").trim(),
				},
				{
					path: "employee.payFrequency",
					message: "Pay frequency is required",
					isMissing: () => !String(form.getValues("employee.payFrequency") || "").trim(),
				},
				{
					path: "employee.workLocation",
					message: "Work location is required",
					isMissing: () => !String(form.getValues("employee.workLocation") || "").trim(),
				},
				{
					path: "employee.workforceSource",
					message: "Workforce source is required",
					isMissing: () =>
						!String(form.getValues("employee.workforceSource") || "").trim(),
				},
			];

			for (const field of requiredEmploymentFields) {
				if (field.isMissing()) {
					form.setError(field.path, {
						type: "required",
						message: field.message,
					});
				} else {
					form.clearErrors(field.path);
				}
			}

			const firstRequiredEmploymentError = requiredEmploymentFields.find((field) =>
				field.isMissing(),
			);
			if (firstRequiredEmploymentError) {
				if (navigateOnError) {
					navigateToErrorField(firstRequiredEmploymentError.path, "frontend");
				}
				if (showToast) {
					toast.error("Please complete the required employment fields", {
						description: firstRequiredEmploymentError.message,
					});
				}
				return false;
			}

			const selectedWorkforceSource = form.getValues("employee.workforceSource") || "DIRECT";
			const selectedAgencyId = form.getValues("employee.agencyId");
			const selectedEmploymentType = form.getValues("employee.employmentType");
			const probationEndDate = form.getValues("employee.probationEndDate");
			if (selectedEmploymentType === "PROBATIONARY" && !probationEndDate) {
				form.setError("employee.probationEndDate", {
					type: "required",
					message: "Probation end date is required for probationary hires",
				});
				if (navigateOnError) {
					navigateToErrorField("employee.probationEndDate", "frontend");
				}
				if (showToast) {
					toast.error("Please set the probation end date");
				}
				return false;
			}
			form.clearErrors("employee.probationEndDate");
			if (selectedWorkforceSource === "AGENCY" && !selectedAgencyId) {
				form.setError("employee.agencyId", {
					type: "required",
					message: "Agency is required for agency workforce source",
				});
				if (navigateOnError) {
					navigateToErrorField("employee.agencyId", "frontend");
				}
				if (showToast) {
					toast.error("Please select an agency for agency workforce source");
				}
				return false;
			}
			form.clearErrors("employee.agencyId");
			baseValid = await form.trigger(fieldsToValidate);
		}

		if (stepIndex === COMPLIANCE_STEP_INDEX) {
			const complianceValid = validateComplianceStep();
			if ((!baseValid || !complianceValid) && navigateOnError) {
				const firstFieldPath =
					getFirstErrorFieldPath(COMPLIANCE_STEP_INDEX) || "employee.documents";
				navigateToErrorField(firstFieldPath, "frontend");
			}
			return baseValid && complianceValid;
		}

		if (!baseValid) {
			if (navigateOnError) {
				const firstFieldPath = getFirstErrorFieldPath(stepIndex);
				if (firstFieldPath) {
					navigateToErrorField(firstFieldPath, "frontend");
				}
			}
			if (showToast) {
				toast.error("Please fix validation errors before proceeding", {
					description: "Check all required fields in this step",
				});
			}
		}

		return baseValid;
	};

	const validateStepsBefore = async (targetStep: number) => {
		const boundedTargetStep = Math.min(Math.max(targetStep, 0), steps.length - 1);
		const firstStepToValidate = Math.max(0, currentStep);

		for (let stepIndex = firstStepToValidate; stepIndex < boundedTargetStep; stepIndex += 1) {
			const isValid = await validateCurrentStep(stepIndex);
			if (!isValid) return false;
		}

		return true;
	};

	const validateAllStepsForSubmit = useCallback(async () => {
		for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
			const isValid = await validateCurrentStep(stepIndex, {
				showToast: false,
				navigateOnError: true,
			});
			if (!isValid) {
				toast.error("Please review the highlighted field before submitting.");
				return false;
			}
		}

		return true;
	}, [validateCurrentStep]);

	const performDebugPrefill = useCallback(
		async (mode: "auto" | "manual") => {
			const currentYear = new Date().getFullYear();
			const todayIso = new Date().toISOString().split("T")[0];

			const firstNames = [
				"Juan",
				"Maria",
				"Jose",
				"Ana",
				"Pedro",
				"Lucia",
				"Carlos",
				"Elena",
				"Miguel",
				"Sofia",
			];
			const middleNames = [
				"Santos",
				"Cruz",
				"Reyes",
				"Garcia",
				"Torres",
				"Ramos",
				"Flores",
				"Rivera",
				"Gonzales",
				"Morales",
			];
			const lastNames = [
				"Dela Cruz",
				"Santos",
				"Reyes",
				"Bautista",
				"Villanueva",
				"Martinez",
				"Rodriguez",
				"Fernandez",
				"Lopez",
				"Gonzalez",
			];
			const genders = ["male", "female"];

			const randomItem = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
			const randomNumber = (min: number, max: number) =>
				Math.floor(Math.random() * (max - min + 1)) + min;
			const randomId = Math.floor(Math.random() * 10000);

			const firstName = randomItem(firstNames);
			const middleName = randomItem(middleNames);
			const lastName = randomItem(lastNames);
			const gender = randomItem(genders);

			let employeeId = form.getValues("employee.employeeId");
			if (!employeeId) {
				employeeId = await ensureReservedEmployeeId(false, {
					isAutomatic: mode === "auto",
				});
			}

			if (!employeeId) {
				throw new Error("Unable to reserve an employee ID right now.");
			}

			const email = `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(" ", "")}${randomId}@example.com`;
			const phoneNumber = `9${randomNumber(100000000, 999999999)}`;
			const nationalIdNumber = `${randomNumber(1000, 9999)}-${randomNumber(1000, 9999)}-${randomNumber(1000, 9999)}`;
			const dobYear = randomNumber(1980, 2000);
			const dobMonth = String(randomNumber(1, 12)).padStart(2, "0");
			const dobDay = String(randomNumber(1, 28)).padStart(2, "0");

			const departments = (departmentsData as any)?.departments || [];
			const positions = (positionsData as any)?.positions || [];
			const levels = (levelsData as any)?.levels || [];
			const schedules = availableSchedules;
			const roles = rolesData?.data?.roles || [];

			const firstDepartment = departments[0];
			const firstPosition = positions[0];
			const firstLevel = levels[0];
			const firstSchedule = schedules[0];
			const firstRole = roles[0];

			if (!firstRole) {
				throw new Error("Please create at least one role before using debug prefill.");
			}

			const firstDepartmentId = firstDepartment?._id || firstDepartment?.id || "";
			const firstPositionId = firstPosition?._id || firstPosition?.id || "";
			const firstLevelId = firstLevel?._id || firstLevel?.id || "";
			const firstScheduleId = firstSchedule?._id || firstSchedule?.id || "";
			const roleId = firstRole?.id || "";
			const prefilledScheduleStartDate =
				formatDateForInput(firstSchedule?.startDate) || todayIso;
			const resolvedCycleDays = [7, 14, 21, 28].includes(Number(firstSchedule?.cycleDays))
				? Number(firstSchedule?.cycleDays)
				: 7;
			const prefilledActiveSchedule = {
				...buildDefaultActiveSchedule(prefilledScheduleStartDate),
				scheduleTemplateId: firstScheduleId,
				scheduleTemplateCode: firstSchedule?.code || "",
				scheduleTemplateName: firstSchedule?.name || "",
				cycleDays: resolvedCycleDays,
				graceLateMinutes: Number(firstSchedule?.graceLateMinutes ?? 15),
				graceEarlyOutMinutes: Number(firstSchedule?.graceEarlyOutMinutes ?? 0),
				pattern: normalizeActiveSchedulePattern(
					Array.isArray(firstSchedule?.pattern) ? firstSchedule.pattern : [],
					resolvedCycleDays,
				),
			};
			const debugDocuments = buildDebugDocumentsFromConfiguredTypes(complianceDocumentTypes);
			const requiredEnabledDocuments = complianceDocumentTypes.reduce(
				(acc, documentType) => {
					if (documentType.isRequired) {
						acc[documentType.id] = true;
					}
					return acc;
				},
				{} as Record<string, boolean>,
			);

			form.reset({
				person: {
					organizationId: user?.organizationId || "",
					personalInfo: {
						prefix: gender === "male" ? "Mr." : "Ms.",
						firstName,
						middleName,
						lastName,
						dateOfBirth: `${dobYear}-${dobMonth}-${dobDay}`,
						placeOfBirth: "Manila, Philippines",
						age: currentYear - dobYear,
						nationality: "Filipino",
						primaryLanguage: "English",
						gender: gender as any,
						currency: "PHP",
						vipCode: "",
					},
					contactInfo: {
						email,
						phones: [
							{
								type: "mobile",
								countryCode: "+63",
								number: phoneNumber,
								isPrimary: true,
							},
						],
						fax: "",
						address: [
							{
								street: `${randomNumber(1, 999)} Rizal Avenue`,
								address2: `Apartment ${randomNumber(1, 20)}${randomItem(["A", "B", "C", "D"])}`,
								city: "Manila",
								state: "Metro Manila",
								country: "Philippines",
								postalCode: "1000",
								zipCode: "1000",
								houseNumber: String(randomNumber(1, 999)),
							},
						],
					},
					identification: {
						type: "national_id" as const,
						number: nationalIdNumber,
						issuingCountry: "Philippines",
						expiryDate: "2030-12-31",
					},
				},
				employee: {
					organizationId: user?.organizationId || "",
					employeeId,
					employmentHireDate: todayIso,
					employmentStartDate: todayIso,
					employmentTerminationDate: null,
					employmentStatus: "ONBOARDING" as const,
					employmentType: "REGULAR" as const,
					probationEndDate: `${currentYear}-07-15`,
					departmentId: firstDepartmentId,
					positionId: firstPositionId,
					levelId: firstLevelId,
					activeSchedule: prefilledActiveSchedule,
					basicSalary: randomNumber(30000, 100000),
					currency: "PHP",
					payFrequency: "SEMI_MONTHLY" as const,
					documents: debugDocuments,
					leaveBalances: [],
					workLocation: randomItem(["ONSITE", "REMOTE", "HYBRID"]) as any,
					workforceSource: "DIRECT" as const,
					agencyId: null,
					isManager: false,
					isHrManager: false,
					reportToId: null,
				},
				user: {
					email,
					userName: `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(" ", "")}`,
					password: employeeId,
					avatar: "",
					status: "active" as const,
					loginMethod: "email" as const,
					roleId,
					organizationId: user?.organizationId || "",
				},
			});

			setEnabledDocuments(requiredEnabledDocuments);
			setIsPrefillNavigationUnlocked(true);
			form.clearErrors();

			if (mode === "manual") {
				hasFailedAutoReserveRef.current = false;
				toast.success(`Debug data prefilled for ${firstName} ${lastName}!`, {
					description:
						"All steps were auto-populated and the current step was preserved.",
					duration: 5000,
				});
			}
		},
		[
			availableSchedules,
			buildDebugDocumentsFromConfiguredTypes,
			complianceDocumentTypes,
			departmentsData,
			ensureReservedEmployeeId,
			form,
			levelsData,
			positionsData,
			rolesData?.data?.roles,
			user?.organizationId,
		],
	);

	useEffect(() => {
		if (isEditMode) return;
		if (!isDraftHydrationReady) return;
		if (hasAttemptedInitialReserveRef.current) return;
		hasAttemptedInitialReserveRef.current = true;

		let isCancelled = false;
		const autoReserve = async () => {
			try {
				const employeeId = await ensureReservedEmployeeId(false, { isAutomatic: true });
				if (employeeId && !isCancelled && !form.getValues("employee.employeeId")) {
					form.setValue("employee.employeeId", employeeId, { shouldValidate: true });
				}
			} catch (error) {
				if (!isCancelled) {
					console.error("Failed to auto-reserve employee ID:", error);
				}
			}
		};
		autoReserve();
		return () => {
			isCancelled = true;
		};
	}, [ensureReservedEmployeeId, form, isDraftHydrationReady, isEditMode]);

	// Populate form with employee data in edit mode
	useEffect(() => {
		if (!isEditMode || !employeeData) return;
		if (isLoadingComplianceDocumentTypes) return;

		const employee = employeeData as any; // API returns extended employee with relations
		const hydratedEmployeeId = String(employee?.id || id || "");
		if (hydratedEmployeeId && initializedEditEmployeeIdRef.current === hydratedEmployeeId) {
			return;
		}

		if (hydratedEmployeeId) {
			initializedEditEmployeeIdRef.current = hydratedEmployeeId;
		}

		const existingDocs = employee.documents || [];
		const mappedDocuments =
			complianceDocumentTypes.length > 0
				? [
						...complianceDocumentTypes.map((documentType) => {
							const existing =
								existingDocs.find((doc: any) =>
									documentTypeMatchesFormDocument(documentType, doc),
								) || null;

							return existing
								? buildComplianceDocumentFormValue(documentType, existing, "empty")
								: buildClearedComplianceDocument(documentType);
						}),
						...existingDocs
							.filter(
								(existing: any) =>
									!complianceDocumentTypes.some((documentType) =>
										documentTypeMatchesFormDocument(documentType, existing),
									),
							)
							.map((existing: any) => ({
								name: existing.name || existing.documentType?.name || existing.type,
								type: existing.type || existing.documentType?.code || "",
								documentTypeId:
									existing.documentTypeId || existing.documentType?.id || null,
								number: existing.number || "",
								issueDate: formatDateForInput(existing.issueDate),
								expiryDate: existing.expiryDate
									? formatDateForInput(existing.expiryDate)
									: null,
								fileUrl: existing.fileUrl || "",
								ext: existing.ext || "",
								fieldValues:
									existing.fieldValues && typeof existing.fieldValues === "object"
										? existing.fieldValues
										: {},
								metadata: existing.metadata || null,
							})),
					]
				: existingDocs.map((existing: any) => ({
						name: existing.name || existing.documentType?.name || existing.type,
						type: existing.type,
						documentTypeId:
							existing.documentTypeId || existing.documentType?.id || null,
						number: existing.number || "",
						issueDate: formatDateForInput(existing.issueDate),
						expiryDate: existing.expiryDate
							? formatDateForInput(existing.expiryDate)
							: null,
						fileUrl: existing.fileUrl,
						ext: existing.ext,
						fieldValues:
							existing.fieldValues && typeof existing.fieldValues === "object"
								? existing.fieldValues
								: {},
						metadata: existing.metadata || null,
					}));

		// Update enabledDocuments state based on existing documents
		const newEnabledDocs: { [key: string]: boolean } = {};
		if (complianceDocumentTypes.length > 0) {
			complianceDocumentTypes.forEach((documentType) => {
				const hasPersistedDocument = existingDocs.some((d: any) =>
					documentTypeMatchesFormDocument(documentType, d),
				);
				if (hasPersistedDocument) {
					newEnabledDocs[documentType.id] = true;
				}
			});
		} else {
			existingDocs.forEach((d: any) => {
				const docKey = d.documentTypeId || d.type;
				if (docKey) newEnabledDocs[docKey] = true;
			});
		}
		setEnabledDocuments(newEnabledDocs);

		const scheduleByCode = new Map(
			availableSchedules.map((schedule: any) => [String(schedule.code || ""), schedule]),
		);
		const scheduleTimelineEntries = Array.isArray((employee as any).schedules)
			? [...((employee as any).schedules as any[])]
			: [];
		const normalizedScheduleEntries: LegacyScheduleFormEntry[] =
			scheduleTimelineEntries.length > 0
				? scheduleTimelineEntries
						.sort(
							(a: any, b: any) =>
								new Date(a?.startDate || 0).getTime() -
								new Date(b?.startDate || 0).getTime(),
						)
						.map((entry: any, index: number) => {
							const resolvedTemplate =
								availableSchedules.find(
									(schedule: any) =>
										String(schedule._id || schedule.id) ===
										String(entry?.scheduleId || ""),
								) ||
								scheduleByCode.get(String(entry?.scheduleCode || "")) ||
								null;
							const isCustom = !resolvedTemplate;
							return {
								entryId: entry?.entryId || "",
								assignmentType: isCustom
									? ("manual" as const)
									: ("template" as const),
								scheduleId:
									resolvedTemplate?._id ||
									resolvedTemplate?.id ||
									entry?.scheduleId ||
									null,
								scheduleCode: entry?.scheduleCode || resolvedTemplate?.code || "",
								scheduleName: entry?.scheduleName || resolvedTemplate?.name || "",
								startDate: formatDateForInput(entry?.startDate) || todayDate,
								endDate: formatDateForInput(entry?.endDate) || null,
								isActive: Boolean(entry?.isActive),
								shifts: entry?.shifts || resolvedTemplate?.shifts || [],
								gracePeriodMinutes: Number(
									entry?.gracePeriodMinutes ||
										resolvedTemplate?.gracePeriodMinutes ||
										0,
								),
								source:
									entry?.source ||
									(isCustom ? "employee_custom" : "employee_form"),
								shiftSnapshot: entry?.shiftSnapshot || null,
								metadata: entry?.metadata || null,
							};
						})
				: [
						{
							entryId: "",
							assignmentType: "template" as const,
							scheduleId: "",
							scheduleCode: "",
							scheduleName: "",
							startDate:
								formatDateForInput(
									employee.employmentStartDate || employee.employmentHireDate,
								) || todayDate,
							endDate: null,
							isActive: true,
							shifts: [],
							gracePeriodMinutes: 0,
							source: "employee_form",
							metadata: null,
						},
					];
		const fallbackEffectiveStartDate =
			formatDateForInput(employee.employmentStartDate || employee.employmentHireDate) ||
			todayDate;
		const embeddedScheduleFromApi = (employee as any).embeddedSchedule || null;
		const firstNormalizedSchedule =
			normalizedScheduleEntries.find((entry: any) => entry?.isActive) ||
			normalizedScheduleEntries[0] ||
			null;
		let activeScheduleForForm: OptionalActiveScheduleForm = undefined;

		if (embeddedScheduleFromApi) {
			const embeddedPattern = normalizeActiveSchedulePattern(
				embeddedScheduleFromApi.pattern,
				Number(embeddedScheduleFromApi.cycleDays || 7),
			);
			activeScheduleForForm = {
				effectiveStartDate:
					formatDateForInput(
						embeddedScheduleFromApi.effectiveStartDate ||
							embeddedScheduleFromApi.assignedAt,
					) || fallbackEffectiveStartDate,
				scheduleTemplateId: embeddedScheduleFromApi.templateId
					? String(embeddedScheduleFromApi.templateId)
					: "",
				scheduleTemplateCode: embeddedScheduleFromApi.templateCode || "",
				scheduleTemplateName: embeddedScheduleFromApi.templateName || "",
				cycleDays: [7, 14, 21, 28].includes(Number(embeddedScheduleFromApi.cycleDays))
					? Number(embeddedScheduleFromApi.cycleDays)
					: 7,
				graceLateMinutes: Number(embeddedScheduleFromApi.graceLateMinutes ?? 15),
				graceEarlyOutMinutes: Number(embeddedScheduleFromApi.graceEarlyOutMinutes ?? 0),
				pattern: embeddedPattern,
			};
		} else if (firstNormalizedSchedule) {
			const resolvedTemplate =
				availableSchedules.find(
					(schedule: any) =>
						String(schedule._id || schedule.id) ===
						String(firstNormalizedSchedule.scheduleId || ""),
				) ||
				scheduleByCode.get(String(firstNormalizedSchedule.scheduleCode || "")) ||
				null;
			const isManual = firstNormalizedSchedule.assignmentType === "manual";
			if (isManual) {
				const manualSnapshot = normalizeShiftSnapshot(
					firstNormalizedSchedule.shiftSnapshot,
				);
				activeScheduleForForm = {
					...buildDefaultActiveSchedule(
						formatDateForInput(firstNormalizedSchedule.startDate) ||
							fallbackEffectiveStartDate,
					),
					pattern: normalizeActiveSchedulePattern(
						[{ day: 1, shiftTypeId: "", shiftSnapshot: manualSnapshot }],
						7,
					),
				};
			} else {
				const resolvedCycleDays = [7, 14, 21, 28].includes(
					Number(resolvedTemplate?.cycleDays),
				)
					? Number(resolvedTemplate?.cycleDays)
					: 7;
				activeScheduleForForm = {
					...buildDefaultActiveSchedule(
						formatDateForInput(firstNormalizedSchedule.startDate) ||
							fallbackEffectiveStartDate,
					),
					scheduleTemplateId: String(
						firstNormalizedSchedule.scheduleId || resolvedTemplate?._id || "",
					),
					scheduleTemplateCode:
						firstNormalizedSchedule.scheduleCode || resolvedTemplate?.code || "",
					scheduleTemplateName:
						firstNormalizedSchedule.scheduleName || resolvedTemplate?.name || "",
					cycleDays: resolvedCycleDays,
					graceLateMinutes: Number(
						resolvedTemplate?.graceLateMinutes ??
							firstNormalizedSchedule.gracePeriodMinutes ??
							15,
					),
					graceEarlyOutMinutes: Number(resolvedTemplate?.graceEarlyOutMinutes ?? 0),
					pattern: normalizeActiveSchedulePattern(
						Array.isArray(resolvedTemplate?.pattern) ? resolvedTemplate.pattern : [],
						resolvedCycleDays,
					),
				};
			}
		}

		const normalizedAddress = normalizeAddressEntries(employee.person?.contactInfo?.address);
		const resolvedContactEmail =
			employee.person?.contactInfo?.email || employee.user?.email || "";

		form.reset({
			person: {
				organizationId: employee.person?.organizationId || user?.organizationId || "",
				personalInfo: {
					prefix: employee.person?.personalInfo?.prefix || "",
					firstName: employee.person?.personalInfo?.firstName || "",
					middleName: employee.person?.personalInfo?.middleName || "",
					lastName: employee.person?.personalInfo?.lastName || "",
					dateOfBirth: formatDateForInput(employee.person?.personalInfo?.dateOfBirth),
					placeOfBirth: employee.person?.personalInfo?.placeOfBirth || "",
					age: employee.person?.personalInfo?.age || 0,
					nationality: normalizeNationalityForForm(
						employee.person?.personalInfo?.nationality,
					),
					primaryLanguage: employee.person?.personalInfo?.primaryLanguage || "",
					gender:
						(employee.person?.personalInfo
							?.gender as FormData["person"]["personalInfo"]["gender"]) || "male",
					currency: employee.person?.personalInfo?.currency || "",
					vipCode: employee.person?.personalInfo?.vipCode || "",
				},
				contactInfo: {
					email: resolvedContactEmail,
					phones: normalizePhoneEntries(employee.person?.contactInfo?.phones),
					fax: employee.person?.contactInfo?.fax || "",
					address: normalizedAddress,
				},
				identification: {
					type: normalizeIdentificationTypeForForm(employee.person?.identification?.type),
					number: employee.person?.identification?.number || "",
					issuingCountry: normalizeIssuingCountryForForm(
						employee.person?.identification?.issuingCountry,
					),
					expiryDate: formatDateForInput(employee.person?.identification?.expiryDate),
				},
			},
			employee: {
				organizationId: employee.organizationId || user?.organizationId || "",
				employeeId: employee.employeeId || "",
				deviceEmpId: employee.deviceEmpId || "",
				employmentHireDate: formatDateForInput(employee.employmentHireDate),
				employmentStartDate: formatDateForInput(
					employee.employmentStartDate || employee.employmentHireDate,
				),
				employmentTerminationDate:
					formatDateForInput(employee.employmentTerminationDate) || null,
				employmentStatus: employee.employmentStatus || "ONBOARDING",
				employmentType: employee.employmentType || "REGULAR",
				probationEndDate: formatDateForInput(employee.probationEndDate),
				departmentId: employee.departmentId || "",
				sectionId: employee.sectionId || null,
				positionId: employee.positionId || "",
				levelId: employee.levelId || "",
				activeSchedule: activeScheduleForForm,
				basicSalary: employee.basicSalary || 0,
				currency: employee.currency || "PHP",
				payFrequency: employee.payFrequency || "MONTHLY",
				documents: mappedDocuments,
				leaveBalances:
					employee.leaveBalances?.map((lb: any) => ({
						leaveType: lb.leaveType,
						totalEntitled: lb.totalEntitled,
						periodStart: formatDateForInput(lb.periodStart),
						periodEnd: formatDateForInput(lb.periodEnd),
					})) || [],
				workLocation: employee.workLocation || "ONSITE",
				workforceSource: employee.workforceSource || "DIRECT",
				agencyId: employee.agencyId || null,
				isManager: employee.isManager || false,
				reportToId: employee.reportToId || null,
				role: employee.role,
			},
			user: {
				email: resolvedContactEmail || employee.user?.email || "",
				userName: employee.user?.userName || "",
				password: "", // Don't prefill password
				avatar: employee.user?.avatar || "",
				status: employee.user?.status || "active",
				loginMethod: employee.user?.loginMethod || "email",
				roleId: employee.user?.roleId || "",
				organizationId: employee.user?.organizationId || user?.organizationId || "",
			},
		});
		form.setValue("person.contactInfo.address", normalizedAddress, {
			shouldDirty: false,
			shouldValidate: false,
		});
	}, [
		availableSchedules,
		buildClearedComplianceDocument,
		complianceDocumentTypes,
		employeeData,
		form,
		isEditMode,
		isLoadingComplianceDocumentTypes,
		id,
		schedulesData,
		todayDate,
		user,
	]);

	const handleNext = async () => {
		const isValid = await validateStepsBefore(currentStep + 1);
		if (isValid && currentStep < steps.length - 1) {
			setCurrentStep(currentStep + 1);
		}
	};

	const handleBack = () => {
		if (currentStep > 0) {
			setCurrentStep(currentStep - 1);
			return;
		}
		if (presentation === "modal" && onRequestClose) {
			onRequestClose();
		}
	};

	const handleFinalSubmit = async () => {
		const isValid = await validateAllStepsForSubmit();
		if (!isValid) return;
		handleSubmit();
	};

	const handleStepClick = async (stepIndex: number) => {
		if (stepIndex <= currentStep) {
			setCurrentStep(stepIndex);
			return;
		}

		const isValid = await validateStepsBefore(stepIndex);
		if (isValid) {
			setCurrentStep(stepIndex);
		}
	};

	// Debug prefill function
	const handlePrefillDebugData = async () => {
		try {
			await performDebugPrefill("manual");
		} catch (error) {
			console.error("Debug prefill failed:", error);
			toast.error("Debug prefill failed", {
				description:
					error instanceof Error
						? error.message
						: "Unexpected error while prefilling data.",
			});
		}
	};

	const convertDateToUTC = (
		dateStr: string | null | undefined,
		options?: {
			allowEmpty?: boolean;
			minYear?: number;
			maxYear?: number;
			disallowFuture?: boolean;
		},
	): string | null => {
		const result = validateStrictDateInput(dateStr, {
			minYear: options?.minYear ?? 1900,
			maxYear: options?.maxYear ?? 9999,
			allowEmpty: options?.allowEmpty ?? true,
			disallowFuture: options?.disallowFuture ?? false,
		});

		if (!result.isValid) return null;
		return result.isoUtc;
	};

	const anchorToMondayUtc = (isoString: string): string => {
		const d = new Date(isoString);
		d.setUTCHours(0, 0, 0, 0);
		const day = d.getUTCDay();
		const diff = day === 0 ? -6 : 1 - day;
		d.setUTCDate(d.getUTCDate() + diff);
		return d.toISOString();
	};

	const normalizeApiFieldPath = (value: unknown) =>
		String(value || "")
			.replace(/\[(\d+)\]/g, ".$1")
			.replace(/^\.+/, "")
			.trim();

	const normalizeEmployeeFieldPath = useCallback((value: unknown) => {
		const fieldPath = normalizeApiFieldPath(value);
		if (!fieldPath) return "";

		if (fieldPath === "employeeId") return "employee.employeeId";
		if (fieldPath === "roleId") return "user.roleId";
		if (fieldPath === "email") return "user.email";
		if (fieldPath === "userName") return "user.userName";
		if (fieldPath === "password") return "user.password";
		if (fieldPath === "employee.embeddedSchedule") return "employee.activeSchedule";
		if (fieldPath.startsWith("employee.embeddedSchedule.pattern")) {
			return "employee.activeSchedule";
		}
		if (fieldPath.startsWith("employee.embeddedSchedule")) {
			return "employee.activeSchedule";
		}

		return fieldPath;
	}, []);

	const collectErrorFieldPaths = useCallback(
		(value: unknown, currentPath = ""): string[] => {
			if (!value || typeof value !== "object") return [];

			const record = value as Record<string, unknown>;
			const hasMessage =
				typeof record.message === "string" && record.message.trim().length > 0;
			const paths =
				hasMessage && currentPath ? [normalizeEmployeeFieldPath(currentPath)] : [];

			return Object.entries(record).reduce((acc, [key, child]) => {
				if (key === "message" || key === "type" || key === "ref") return acc;
				const nextPath = currentPath ? `${currentPath}.${key}` : key;
				return acc.concat(collectErrorFieldPaths(child, nextPath));
			}, paths);
		},
		[normalizeEmployeeFieldPath],
	);

	const getStepIndexForFieldPath = useCallback(
		(fieldPath: string) => {
			const normalizedFieldPath = normalizeEmployeeFieldPath(fieldPath);
			if (!normalizedFieldPath) return currentStep;
			if (normalizedFieldPath.startsWith("person.") || normalizedFieldPath === "personId") {
				return 0;
			}
			if (
				normalizedFieldPath.startsWith("employee.documents") ||
				normalizedFieldPath.startsWith("employee.document")
			) {
				return COMPLIANCE_STEP_INDEX;
			}
			if (normalizedFieldPath.startsWith("employee.leaveBalances")) return 3;
			if (
				normalizedFieldPath.startsWith("user.") ||
				normalizedFieldPath === "userId" ||
				normalizedFieldPath === "roleId"
			) {
				return 4;
			}
			if (
				normalizedFieldPath.startsWith("employee.") ||
				normalizedFieldPath === "employeeId"
			) {
				return 1;
			}
			return currentStep;
		},
		[currentStep, normalizeEmployeeFieldPath],
	);

	const getFirstErrorFieldPath = useCallback(
		(stepIndex?: number) => {
			const fieldPaths = collectErrorFieldPaths(form.formState.errors);
			if (fieldPaths.length === 0) return "";
			if (typeof stepIndex !== "number") return fieldPaths[0];

			const orderedFields = STEP_FIELD_NAVIGATION_ORDER[stepIndex] || [];
			const matchesOrderedField = (fieldPath: string, orderedField: string) => {
				if (orderedField === fieldPath) return true;
				if (!orderedField.includes("*")) return false;

				const pattern = orderedField
					.split(".")
					.map((part) => {
						if (part === "*") return "[^.]+";
						return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
					})
					.join("\\.");

				return new RegExp(`^${pattern}$`).test(fieldPath);
			};
			for (const orderedField of orderedFields) {
				const matchingFieldPath = fieldPaths.find((fieldPath) =>
					matchesOrderedField(fieldPath, orderedField),
				);
				if (matchingFieldPath) {
					return matchingFieldPath;
				}
			}

			return (
				fieldPaths.find((fieldPath) => getStepIndexForFieldPath(fieldPath) === stepIndex) ||
				""
			);
		},
		[collectErrorFieldPaths, form.formState.errors, getStepIndexForFieldPath],
	);

	const findFieldTarget = useCallback(
		(fieldPath: string): HTMLElement | null => {
			if (typeof document === "undefined" || !fieldPath) return null;

			const normalizedFieldPath = normalizeEmployeeFieldPath(fieldPath);
			const escapedFieldPath = escapeSelectorValue(normalizedFieldPath);
			const isVisibleFocusable = (element: HTMLElement | null) => {
				if (!element) return false;
				if (
					element.hasAttribute("disabled") ||
					element.getAttribute("aria-disabled") === "true"
				) {
					return false;
				}
				if (element.getAttribute("type") === "hidden") return false;
				if (element.getAttribute("aria-hidden") === "true") return false;

				const style = window.getComputedStyle(element);
				if (style.display === "none" || style.visibility === "hidden") return false;
				if (element.offsetParent === null && style.position !== "fixed") return false;

				return true;
			};
			const findBestFocusableDescendant = (element: ParentNode | null) => {
				if (!element) return null;

				const selectors = [
					'input:not([type="hidden"]):not([disabled])',
					"textarea:not([disabled])",
					"select:not([disabled])",
					'button:not([disabled])[role="combobox"]',
					'[role="combobox"]:not([aria-disabled="true"])',
					"button:not([disabled])",
					'[tabindex]:not([tabindex="-1"])',
				];

				for (const selector of selectors) {
					const candidate = element.querySelector(selector) as HTMLElement | null;
					if (isVisibleFocusable(candidate)) return candidate;
				}

				return null;
			};
			const exactContainer = document.querySelector(
				`[data-field-path="${escapedFieldPath}"]`,
			) as HTMLElement | null;

			if (exactContainer) {
				return findBestFocusableDescendant(exactContainer) || exactContainer;
			}

			const selectorCandidates = [
				`[name="${escapedFieldPath}"]`,
				`[data-field-path^="${escapedFieldPath}."]`,
			];
			for (const selector of selectorCandidates) {
				const candidate = document.querySelector(selector) as HTMLElement | null;
				if (candidate) {
					if (candidate.matches("[data-field-path]")) {
						return findBestFocusableDescendant(candidate) || candidate;
					}
					return isVisibleFocusable(candidate) ? candidate : null;
				}
			}

			const fallbackById: Record<string, string> = {
				"employee.employeeId": "employeeId",
				"person.personalInfo.firstName": "firstName",
				"person.personalInfo.middleName": "middleName",
				"person.personalInfo.lastName": "lastName",
				"employee.basicSalary": "basicSalary",
			};
			const idCandidate = fallbackById[normalizedFieldPath];
			if (idCandidate) {
				return document.getElementById(idCandidate);
			}

			const documentCardMatch = normalizedFieldPath.match(/^employee\.documents\.(\d+)/);
			if (documentCardMatch) {
				const documentCard = document.querySelector(
					`[data-field-path="employee.documents.${documentCardMatch[1]}"]`,
				) as HTMLElement | null;
				if (documentCard) {
					return findBestFocusableDescendant(documentCard) || documentCard;
				}
			}

			return null;
		},
		[normalizeEmployeeFieldPath],
	);

	const navigateToErrorField = useCallback(
		(
			fieldPath: string,
			source: "frontend" | "backend",
			options?: { originalFieldPath?: string },
		) => {
			const normalizedFieldPath = normalizeEmployeeFieldPath(fieldPath);
			if (!normalizedFieldPath) return;

			pendingFieldNavigationRef.current = {
				fieldPath: normalizedFieldPath,
				source,
				originalFieldPath: options?.originalFieldPath,
			};
			setCurrentStep(getStepIndexForFieldPath(normalizedFieldPath));
			setFieldNavigationTick((tick) => tick + 1);
		},
		[getStepIndexForFieldPath, normalizeEmployeeFieldPath],
	);

	useEffect(() => {
		const pendingNavigation = pendingFieldNavigationRef.current;
		if (!pendingNavigation) return;

		let isCancelled = false;
		let timeoutId: number | undefined;

		const runNavigation = (attempt: number) => {
			if (isCancelled) return;

			const target = findFieldTarget(pendingNavigation.fieldPath);
			if (target) {
				target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
				window.setTimeout(() => {
					if (isCancelled) return;
					try {
						target.focus({ preventScroll: true });
					} catch {
						try {
							form.setFocus(pendingNavigation.fieldPath as any);
						} catch {
							// Ignore focus failures for custom fields.
						}
					}
				}, 40);
				pendingFieldNavigationRef.current = null;
				return;
			}

			if (attempt < FIELD_NAVIGATION_RETRY_LIMIT) {
				timeoutId = window.setTimeout(
					() => runNavigation(attempt + 1),
					FIELD_NAVIGATION_RETRY_DELAY_MS,
				);
				return;
			}

			console.warn("[EmployeeForm] Unable to resolve error focus target", {
				source: pendingNavigation.source,
				originalFieldPath:
					pendingNavigation.originalFieldPath || pendingNavigation.fieldPath,
				normalizedFieldPath: pendingNavigation.fieldPath,
				step: getStepIndexForFieldPath(pendingNavigation.fieldPath),
			});
			pendingFieldNavigationRef.current = null;
		};

		timeoutId = window.setTimeout(() => runNavigation(0), 0);

		return () => {
			isCancelled = true;
			if (typeof timeoutId === "number") {
				window.clearTimeout(timeoutId);
			}
		};
	}, [currentStep, fieldNavigationTick, findFieldTarget, form, getStepIndexForFieldPath]);

	const extractEmployeeMutationFieldErrors = (error: any) => {
		const possibleErrors = [
			error?.errors,
			error?.data?.errors,
			error?.response?.data?.errors,
			error?.response?.data?.data?.errors,
		];

		for (const candidate of possibleErrors) {
			if (Array.isArray(candidate) && candidate.length > 0) {
				return candidate;
			}
		}

		return [];
	};

	const extractEmployeeMutationMessage = (error: any) => {
		const first =
			error?.message ||
			error?.data?.message ||
			error?.response?.data?.message ||
			error?.response?.data?.error ||
			"Unknown error occurred";

		const message = String(first || "Unknown error occurred");
		if (
			message.includes("Could not convert argument value") ||
			message.includes('"$type": String("DateTime")')
		) {
			return "Invalid date value detected. Please use YYYY-MM-DD (example: 2003-11-11).";
		}

		return message;
	};

	const getDocumentLabelByIndex = (index: number) => {
		const currentDocuments = form.getValues("employee.documents") || [];
		const currentDocument = currentDocuments[index];
		const configuredDocumentType =
			complianceDocumentTypes.find((documentType) =>
				documentTypeMatchesFormDocument(documentType, currentDocument),
			) || complianceDocumentTypes[index];

		return (
			configuredDocumentType?.name ||
			currentDocument?.name ||
			currentDocument?.type ||
			`Document ${index + 1}`
		);
	};

	const formatEmployeeMutationErrorMessage = (error: any) => {
		const fieldErrors = extractEmployeeMutationFieldErrors(error);
		if (!fieldErrors.length) {
			return extractEmployeeMutationMessage(error);
		}

		const firstFieldError = fieldErrors[0];
		const fieldPath = normalizeEmployeeFieldPath(firstFieldError?.field);
		const message = String(firstFieldError?.message || "Invalid value");
		const documentMatch = fieldPath.match(/^employee\.documents\.(\d+)(?:\.(.+))?$/);

		if (!documentMatch) {
			return message;
		}

		const documentLabel = getDocumentLabelByIndex(Number(documentMatch[1]));
		return `${documentLabel}: ${message}`;
	};

	const applyEmployeeMutationErrors = (error: any) => {
		const fieldErrors = extractEmployeeMutationFieldErrors(error);
		if (!fieldErrors.length) return;

		let nextStepIndex: number | null = null;
		let firstFocusableField = "";

		fieldErrors.forEach((fieldError: any) => {
			const originalFieldPath = normalizeApiFieldPath(fieldError?.field);
			const fieldPath = normalizeEmployeeFieldPath(originalFieldPath);
			const message = String(fieldError?.message || "Invalid value");
			if (!fieldPath || fieldPath === "system" || fieldPath === "root") return;

			form.setError(fieldPath as any, {
				type: "server",
				message,
			});

			const stepIndex = getStepIndexForFieldPath(fieldPath);
			nextStepIndex = nextStepIndex === null ? stepIndex : Math.min(nextStepIndex, stepIndex);
			if (!firstFocusableField) {
				firstFocusableField = fieldPath;
			}

			if (!findFieldTarget(fieldPath)) {
				console.warn(
					"[EmployeeForm] Backend field error mapped without exact focus target",
					{
						originalFieldPath,
						normalizedFieldPath: fieldPath,
						stepIndex,
						message,
					},
				);
			}
		});

		if (firstFocusableField) {
			navigateToErrorField(firstFocusableField, "backend", {
				originalFieldPath: fieldErrors[0]?.field,
			});
		} else if (nextStepIndex !== null) {
			setCurrentStep(nextStepIndex);
		}
	};

	const sanitizeEmployeeDocumentForPayload = (document: Record<string, any>) => {
		const configuredDocumentType = complianceDocumentTypes.find((documentType) =>
			documentTypeMatchesFormDocument(documentType, document),
		);
		const enabledDocumentKey =
			configuredDocumentType?.id || document.documentTypeId || document.type;
		if (!enabledDocuments[enabledDocumentKey]) {
			return null;
		}

		const baseFieldValues =
			document.fieldValues && typeof document.fieldValues === "object"
				? { ...document.fieldValues }
				: {};
		const nextFieldValues: Record<string, unknown> = {};

		Object.entries(baseFieldValues).forEach(([key, value]) => {
			if (!RESERVED_DOCUMENT_FIELDS.has(key)) {
				nextFieldValues[key] = value;
			}
		});

		if (configuredDocumentType) {
			for (const field of configuredDocumentType.fields || []) {
				if (RESERVED_DOCUMENT_FIELDS.has(field.key)) continue;
				if (field.key in baseFieldValues) {
					nextFieldValues[field.key] = baseFieldValues[field.key];
				}
			}
		}

		return {
			...document,
			name: document.name || configuredDocumentType?.name || document.type || "Document",
			type: configuredDocumentType?.code || document.type || "",
			documentTypeId:
				configuredDocumentType?.id || String(document.documentTypeId || "").trim() || null,
			number: document.number || null,
			issueDate: document.issueDate || null,
			expiryDate: document.expiryDate || null,
			fieldValues: nextFieldValues,
		};
	};

	const handleSubmit = form.handleSubmit((data) => {
		const organizationId = user?.organizationId || user?.organization?.id;
		if (!organizationId) {
			toast.error("Organization ID not found. Please ensure you are logged in.");
			return;
		}

		if (!String(data.employee.employeeId || "").trim()) {
			form.setError("employee.employeeId", {
				type: "required",
				message: "Employee ID is required before submitting.",
			});
			navigateToErrorField("employee.employeeId", "frontend");
			toast.error("Employee ID is required before submitting.");
			return;
		}

		const currentYear = new Date().getUTCFullYear();
		const birthDateValidation = validateStrictDateInput(data.person.personalInfo.dateOfBirth, {
			minYear: 1900,
			maxYear: currentYear,
			disallowFuture: true,
		});
		if (!birthDateValidation.isValid) {
			form.setError("person.personalInfo.dateOfBirth", {
				type: "manual",
				message: birthDateValidation.error || "Use a valid date in YYYY-MM-DD format.",
			});
			setCurrentStep(0);
			toast.error("Invalid date of birth", {
				description:
					birthDateValidation.error || "Please use YYYY-MM-DD (example: 2003-11-11).",
			});
			return;
		}
		const birthDateIso = birthDateValidation.isoUtc;

		const identificationExpiryValidation = validateStrictDateInput(
			data.person.identification.expiryDate,
			{
				minYear: 1900,
				maxYear: 9999,
				allowEmpty: true,
			},
		);
		if (!identificationExpiryValidation.isValid) {
			form.setError("person.identification.expiryDate", {
				type: "manual",
				message: identificationExpiryValidation.error || "Use a valid expiry date.",
			});
			setCurrentStep(0);
			toast.error("Invalid identification expiry date", {
				description:
					identificationExpiryValidation.error || "Please use YYYY-MM-DD format.",
			});
			return;
		}

		const { activeSchedule, derivedRole, ...employeeRest } = data.employee;

		const cleanEmployee: any = {};
		let invalidComplianceDateMessage: string | null = null;
		for (const [key, value] of Object.entries(employeeRest)) {
			if (key === "deviceEmpId") {
				cleanEmployee[key] =
					typeof value === "string" && value.trim() ? value.trim() : null;
				continue;
			}
			if (value === undefined || value === "") continue;
			if (
				key === "employmentHireDate" ||
				key === "employmentStartDate" ||
				key === "employmentTerminationDate" ||
				key === "probationEndDate"
			) {
				cleanEmployee[key] = convertDateToUTC(value as string);
			} else if (key === "documents") {
				const sanitizedDocuments = (value as any[])
					.map((doc) => sanitizeEmployeeDocumentForPayload(doc))
					.filter(Boolean) as any[];
				for (let index = 0; index < sanitizedDocuments.length; index++) {
					const document = sanitizedDocuments[index];
					const issueDateValidation = validateStrictDateInput(document.issueDate, {
						minYear: 1900,
						maxYear: 9999,
						allowEmpty: true,
					});
					if (!issueDateValidation.isValid) {
						form.setError(`employee.documents.${index}.issueDate` as any, {
							type: "manual",
							message: issueDateValidation.error || "Use a valid issue date.",
						});
						invalidComplianceDateMessage =
							issueDateValidation.error || "Invalid issue date.";
						break;
					}

					const expiryDateValidation = validateStrictDateInput(document.expiryDate, {
						minYear: 1900,
						maxYear: 9999,
						allowEmpty: true,
					});
					if (!expiryDateValidation.isValid) {
						form.setError(`employee.documents.${index}.expiryDate` as any, {
							type: "manual",
							message: expiryDateValidation.error || "Use a valid expiry date.",
						});
						invalidComplianceDateMessage =
							expiryDateValidation.error || "Invalid expiry date.";
						break;
					}

					document.issueDate = issueDateValidation.isoUtc;
					document.expiryDate = expiryDateValidation.isoUtc;
				}
				if (invalidComplianceDateMessage) {
					setCurrentStep(COMPLIANCE_STEP_INDEX);
					toast.error("Invalid compliance document date", {
						description: invalidComplianceDateMessage,
					});
					return;
				}
				cleanEmployee[key] = sanitizedDocuments;
			} else if (key === "employeeBenefits") {
				cleanEmployee[key] = (value as any[]).filter(
					(benefit) => benefit.benefitTypeId && benefit.benefitTypeId.trim() !== "",
				);
			} else {
				cleanEmployee[key] = value;
			}
		}

		if (cleanEmployee.workforceSource !== "AGENCY") {
			cleanEmployee.workforceSource = "DIRECT";
			cleanEmployee.agencyId = null;
		}

		if (data.employee.employeeBenefits) {
			cleanEmployee.employeeBenefits = data.employee.employeeBenefits.filter(
				(benefit: any) => benefit.benefitTypeId && benefit.benefitTypeId.trim() !== "",
			);
		}

		if (activeSchedule) {
			const sched = activeSchedule;
			const effectiveStartDateInput =
				data.employee.employmentStartDate || data.employee.employmentHireDate || todayDate;
			const effectiveStartDateUtc =
				convertDateToUTC(effectiveStartDateInput) || convertDateToUTC(todayDate);
			const resolvedCycleDays = [7, 14, 21, 28].includes(Number(sched?.cycleDays))
				? Number(sched.cycleDays)
				: 7;
			const isWeekAligned = resolvedCycleDays % 7 === 0;
			const anchoredEffectiveStart =
				isWeekAligned && effectiveStartDateUtc
					? anchorToMondayUtc(effectiveStartDateUtc)
					: effectiveStartDateUtc;
			const normalizedPattern = normalizeActiveSchedulePattern(sched?.pattern, resolvedCycleDays);
			const graceLateMinutes = Math.max(0, Math.round(Number(sched?.graceLateMinutes ?? 15)));
			const graceEarlyOutMinutes = Math.max(
				0,
				Math.round(Number(sched?.graceEarlyOutMinutes ?? 0)),
			);

			const normalizedEmbeddedSchedule: any = {
				templateId: sched?.scheduleTemplateId ? String(sched.scheduleTemplateId) : null,
				templateCode: sched?.scheduleTemplateCode || null,
				templateName: sched?.scheduleTemplateName || null,
				cycleDays: resolvedCycleDays,
				graceLateMinutes,
				graceEarlyOutMinutes,
				pattern: normalizedPattern.map((item: any, index: number) => {
					const shiftTypeId = item?.shiftTypeId ? String(item.shiftTypeId) : null;
					const existingSnapshot = item?.shiftSnapshot
						? normalizeShiftSnapshot(item.shiftSnapshot)
						: null;
					const shiftTypeSnapshot = shiftTypeId
						? buildShiftSnapshotFromShiftType(shiftTypeById.get(shiftTypeId))
						: null;

					return {
						day: index + 1,
						shiftTypeId,
						shiftSnapshot:
							existingSnapshot ||
							shiftTypeSnapshot ||
							(shiftTypeId ? null : normalizeShiftSnapshot(item?.shiftSnapshot)),
					};
				}),
				effectiveStartDate: effectiveStartDateUtc,
				cycleAnchorDate: anchoredEffectiveStart,
				assignedAt: effectiveStartDateUtc,
				assignedByEmployeeId: null,
				reason: sched?.scheduleTemplateId
					? "employee_form_template_pattern"
					: "employee_form_manual",
				version: 1,
			};
			cleanEmployee.embeddedSchedule = normalizedEmbeddedSchedule;
		} else {
			cleanEmployee.embeddedSchedule = null;
		}

		const availableRoles = rolesData?.data?.roles || [];
		const selectedRole = availableRoles.find((role: any) => role.id === data.user.roleId);
		const selectedRoleName =
			selectedRole?.name || data.employee.role || data.employee.derivedRole;
		const selectedRoleFlags = getRoleFlags(selectedRoleName);

		const userPayload: any = {
			email: data.user.email,
			userName: sanitizeUsername(data.user.userName || ""),
			avatar: data.user.avatar,
			status: data.user.status,
			loginMethod: data.user.loginMethod,
			organizationId,
		};
		if (data.user.password && data.user.password.trim() !== "") {
			userPayload.password = data.user.password;
		}

		const personPayload = {
			...data.person,
			organizationId,
			personalInfo: {
				...data.person.personalInfo,
				dateOfBirth: birthDateIso,
				nationality: normalizeNationalityForForm(data.person.personalInfo.nationality),
			},
		};
		if (personPayload.identification) {
			personPayload.identification = {
				...personPayload.identification,
				type: normalizeIdentificationTypeForForm(personPayload.identification.type),
				issuingCountry: normalizeIssuingCountryForForm(
					personPayload.identification.issuingCountry,
				),
				expiryDate: identificationExpiryValidation.isoUtc,
			};
		}
		personPayload.contactInfo = {
			...personPayload.contactInfo,
			phones: normalizePhoneEntries(personPayload.contactInfo?.phones),
			address: normalizeAddressEntries(personPayload.contactInfo?.address),
			fax: personPayload.contactInfo?.fax || "",
			email: personPayload.contactInfo?.email || "",
		};

		const employeePayload: any = {
			roleId: data.user.roleId,
			user: userPayload,
			person: personPayload,
			employee: {
				...cleanEmployee,
				organizationId,
				role: selectedRoleName || derivedRole || undefined,
				isManager: selectedRoleFlags.isManager,
				isHrManager: selectedRoleFlags.isHrManager,
				metadata: {
					...((cleanEmployee as any).metadata || {}),
					...(sourceApplicantId
						? {
								source: "recruitment_applicant_deeplink",
								sourceApplicantId,
						  }
						: {}),
				},
			},
		};
		const hasFiles = Object.values(documentFiles).some((file) => file !== null);

		const promise = new Promise((resolve, reject) => {
			if (isEditMode && id) {
				updateEmployeeMutation.mutate(
					{
						id,
						payload: hasFiles
							? { payload: employeePayload, files: documentFiles }
							: employeePayload,
					},
					{
						onSuccess: (response) => {
							resolve(response);
							if (sourceApplicantId) {
								void Promise.all([
									queryClient.invalidateQueries({
										queryKey: applicantQueryKeys.applicants.all,
									}),
									queryClient.refetchQueries({
										queryKey: applicantQueryKeys.applicants.detail(
											sourceApplicantId,
										),
										type: "active",
									}),
								]);
							}
							setTimeout(
								() => navigate(sourceApplicantReturnTo || employeeListPath),
								1000,
							);
						},
						onError: (error: any) => {
							applyEmployeeMutationErrors(error);
							reject(error);
						},
					},
				);
			} else {
				createEmployeeMutation.mutate(
					hasFiles ? { ...employeePayload, files: documentFiles } : employeePayload,
					{
						onSuccess: async (response) => {
							await clearEmployeeDraftSnapshot();
							resolve(response);
							const createdEmployeeId = String(
								(response as any)?.employee?.id ||
									(response as any)?.data?.employee?.id ||
									"",
							);
							if (sourceApplicantId) {
								await Promise.all([
									queryClient.invalidateQueries({
										queryKey: applicantQueryKeys.applicants.all,
									}),
									queryClient.invalidateQueries({
										queryKey: applicantQueryKeys.applicants.detail(
											sourceApplicantId,
										),
									}),
								]);
							}
							const returnTarget =
								(sourceApplicantReturnTo && createdEmployeeId
									? appendEmployeeIdToReturnTarget(
											sourceApplicantReturnTo,
											createdEmployeeId,
										)
									: sourceApplicantReturnTo) ||
								(sourceApplicantId
									? `/hr/recruitment?id=${sourceApplicantId}&employeeId=${createdEmployeeId || ""}`
									: employeeListPath);
							setTimeout(() => navigate(returnTarget), 1000);
						},
						onError: (error: any) => {
							applyEmployeeMutationErrors(error);
							reject(error);
						},
					},
				);
			}
		});

		toast.promise(promise, {
			loading: isEditMode ? "Updating employee..." : "Creating employee account...",
			success: isEditMode
				? "Employee updated successfully!"
				: "Employee created successfully!",
			error: (err) =>
				`Failed to ${isEditMode ? "update" : "create"} employee: ${formatEmployeeMutationErrorMessage(err)}`,
		});
	});

	const draftSavedLabel = useMemo(() => {
		if (!draftSavedAt) return "";
		return new Intl.DateTimeFormat("en-PH", {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(new Date(draftSavedAt));
	}, [draftSavedAt]);

	const renderStepContent = () => {
		const employeeFormReturnTo = buildEmployeeFormReturnTo(location.pathname, searchParams);

		switch (currentStep) {
			case 0:
				return (
					<PersonalIDsForm
						form={form}
						lockApplicantIdentity={Boolean(sourceApplicantId)}
					/>
				);
			case 1:
				return (
					<EmploymentCompensationForm
						form={form}
						employeeId={id}
						isEmployeeIdLoading={isEmployeeIdLoading}
						onRegenerateEmployeeId={handleRegenerateEmployeeId}
						onCreateDepartment={() => {
							navigate(
								buildEmployeeFormCreateHref({
									basePath: "/admin/configuration/departments",
									returnTo: employeeFormReturnTo,
								}),
							);
						}}
						onCreatePosition={() => {
							navigate(
								buildEmployeeFormCreateHref({
									basePath: "/admin/configuration/positions",
									returnTo: employeeFormReturnTo,
								}),
							);
						}}
					/>
				);
			case 2:
				return (
					<ComplianceTaxForm
						form={form}
						documentFiles={documentFiles}
						onFileChange={(docType, file) => {
							setDocumentFiles((prev) => ({
								...prev,
								[docType]: file,
							}));
						}}
						enabledDocuments={enabledDocuments}
						onToggleDocument={handleToggleDocument}
					/>
				);
			case 3:
				return (
					<BenefitsLeaveForm
						form={form}
						employeeId={id}
						organizationId={user?.organizationId || undefined}
					/>
				);
			case 4:
				return (
					<SystemAccessForm
						form={form}
						isEditMode={isEditMode}
						showDefaultPassword={shouldShowEditDefaultPassword}
					/>
				);
			default:
				return null;
		}
	};

	// Show loading state while fetching employee data in edit mode
	if (isEditMode && isLoadingEmployee) {
		return (
			<div className="min-h-screen bg-gray-50">
				<div className="max-w-6xl mx-auto">
					{/* Header Skeleton */}
					<div className="mb-12 flex items-center justify-between">
						<div className="space-y-3">
							<div className="h-9 w-48 bg-gray-200 rounded animate-pulse"></div>
							<div className="h-5 w-96 bg-gray-200 rounded animate-pulse"></div>
						</div>
					</div>

					{/* Stepper Skeleton */}
					<div className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
						<div className="flex items-center justify-between">
							{[1, 2, 3, 4, 5].map((i) => (
								<div key={i} className="flex items-center flex-1">
									<div className="flex items-center gap-3">
										<div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse"></div>
										<div className="space-y-2">
											<div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
											<div className="h-3 w-16 bg-gray-200 rounded animate-pulse"></div>
										</div>
									</div>
									{i < 5 && <div className="flex-1 h-0.5 bg-gray-200 mx-4"></div>}
								</div>
							))}
						</div>
					</div>

					{/* Form Content Skeleton */}
					<div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
						<div className="space-y-6">
							{/* Form fields skeleton */}
							{[1, 2, 3, 4].map((row) => (
								<div key={row} className="grid grid-cols-1 md:grid-cols-2 gap-6">
									<div className="space-y-2">
										<div className="h-4 w-32 bg-gray-200 rounded animate-pulse"></div>
										<div className="h-10 w-full bg-gray-200 rounded animate-pulse"></div>
									</div>
									<div className="space-y-2">
										<div className="h-4 w-32 bg-gray-200 rounded animate-pulse"></div>
										<div className="h-10 w-full bg-gray-200 rounded animate-pulse"></div>
									</div>
								</div>
							))}
						</div>

						{/* Action buttons skeleton */}
						<div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
							<div className="h-10 w-24 bg-gray-200 rounded animate-pulse"></div>
							<div className="h-10 w-32 bg-gray-200 rounded animate-pulse"></div>
						</div>
					</div>
				</div>
			</div>
		);
	}

	const isSubmitting = createEmployeeMutation.isPending || updateEmployeeMutation.isPending;
	const isFinalStepSubmitDisabled = isLoadingRoles || isSubmitting;
	const isModal = presentation === "modal";

	return (
		<div className={isModal ? "" : "min-h-screen bg-gray-50"}>
			<div className={isModal ? "w-full" : "max-w-6xl mx-auto"}>
				{!isModal ? (
					<>
						{/* Back Button */}
						<div className="mb-4">
							<button
								type="button"
								onClick={() => navigate(employeeListPath)}
								className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-primary transition-colors">
								<ArrowLeft className="w-4 h-4" />
								Back to Employees
							</button>
						</div>

						{/* Header */}
						<div className="mb-12 flex items-center justify-between">
							<div>
								<h1 className="text-3xl font-bold text-gray-900">
									{isEditMode ? "Edit Employee" : "Add Employee"}
								</h1>
								{isEditMode ? (
									<p className="text-gray-600 mt-2">Update employee details.</p>
								) : null}
							</div>
							{isDebugMode && (
								<Button
									type="button"
									onClick={handlePrefillDebugData}
									className="flex items-center gap-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg shadow-sm transition-all px-4 py-2">
									<Dices className="h-4 w-4" />
									Prefill Debug Data
								</Button>
							)}
						</div>
					</>
				) : (
					<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
						<p className="text-sm tabular-nums text-muted-foreground">
							Step {currentStep + 1} of {steps.length}
						</p>
						{isDebugMode ? (
							<Button
								type="button"
								onClick={handlePrefillDebugData}
								className="flex items-center gap-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg shadow-sm transition-all px-3 py-2 text-sm">
								<Dices className="h-4 w-4" />
								Prefill Debug
							</Button>
						) : null}
					</div>
				)}

				{!isModal && showFirstEmployeeGuide ? (
					<p className="mb-6 text-sm text-gray-600">
						First hire in this org? Run{" "}
						<button
							type="button"
							className="font-medium text-orange-700 underline decoration-orange-300 underline-offset-2 hover:text-orange-800"
							onClick={() => navigate("/admin/configuration/migration")}>
							Migration
						</button>{" "}
						if levels, departments, or positions are still empty.
					</p>
				) : null}

				{!isEditMode && draftSavedAt && (
					<div className="mb-6 flex flex-col gap-3 rounded-xl border border-orange-200 bg-orange-50/80 p-4 sm:flex-row sm:items-start sm:justify-between">
						<div className="flex gap-3">
							<div className="mt-0.5 rounded-lg bg-white p-2 text-orange-600 shadow-sm ring-1 ring-orange-100">
								<Clock className="h-4 w-4" />
							</div>
							<div className="space-y-1">
								<p className="text-sm font-semibold text-orange-900">
									{hasRestoredDraft
										? "Restored your employee draft"
										: "Employee draft saved"}
								</p>
								<p className="text-sm text-orange-800">
									{isModal
										? `Last saved ${draftSavedLabel}. Close this modal any time and reopen it later, or discard the saved draft now.`
										: `Last saved ${draftSavedLabel}. Leaving this page will keep the draft available.`}
								</p>
							</div>
						</div>
						<div className="flex items-center justify-end">
							<Button
								type="button"
								variant="outline"
								onClick={() => void handleDiscardDraft()}
								className="border-orange-200 bg-white text-orange-700 hover:bg-orange-100">
								<Trash2 className="h-4 w-4" />
								Discard Draft
							</Button>
						</div>
					</div>
				)}

				{/* Stepper */}
				<div
					className={
						isModal
							? "mb-6 bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100"
							: "mb-8 bg-white rounded-xl p-8 shadow-sm border border-gray-100"
					}>
					{!isModal ? (
						<p className="mb-4 text-sm tabular-nums text-muted-foreground">
							Step {currentStep + 1} of {steps.length}
						</p>
					) : null}
					<EmployeeDataStepper
						currentStep={currentStep}
						steps={steps}
						onStepClick={handleStepClick}
						allowFutureSteps
					/>
				</div>

				{/* Form Content */}
				<div
					className={
						isModal
							? "bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100"
							: "bg-white rounded-xl p-8 shadow-sm border border-gray-100"
					}>
					{renderStepContent()}

					{/* Navigation Buttons */}
					<div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
						<Button
							type="button"
							onClick={handleBack}
							disabled={currentStep === 0 && !isModal}
							className="px-6 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all">
							{currentStep === 0 && isModal ? "Close" : "Back"}
						</Button>

						<div className="flex gap-3">
							{currentStep === steps.length - 1 ? (
								<Button
									type="button"
									onClick={handleFinalSubmit}
									disabled={isFinalStepSubmitDisabled}
									className="px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-red-500">
									{isEditMode ? "Update Employee" : "Create Employee"}
								</Button>
							) : (
								<Button
									type="button"
									onClick={handleNext}
									className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg shadow-sm transition-all">
									Next
								</Button>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
