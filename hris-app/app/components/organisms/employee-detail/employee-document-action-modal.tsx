import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { EmployeeAvatar } from "~/components/atoms/EmployeeAvatar";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { CalendarDatePicker } from "~/components/ui/calendar-date-picker";
import {
	employeesQueryKeys,
	useEmployeeDocumentReviewEvents,
	useUpdateEmployeeDocument,
	useUploadEmployeeDocument,
} from "~/lib/hooks/useEmployees";
import { queryKeys as metricsQueryKeys } from "~/lib/hooks/useMetrics";
import { useDocumentTypes } from "~/lib/hooks/useDocumentTypes";
import {
	MAX_ALLOWED_DATE_INPUT,
	MIN_ALLOWED_DATE_INPUT,
	getTodayDateInput,
	parseDateInputAsUtcDate,
	validateStrictDateInput,
} from "~/lib/utils/date-validation";
import {
	EMPLOYEE_DOCUMENT_ACCEPT,
	EMPLOYEE_DOCUMENT_UPLOAD_COPY,
	validateEmployeeDocumentFile,
} from "~/lib/utils/document-file";
import {
	getDocumentFieldValidationHint,
	validateDocumentFieldValue,
} from "~/lib/utils/document-field-validation";
import type {
	EmployeeDocumentActor,
	EmployeeDocumentPayload,
	EmployeeDocumentPriorityItem,
} from "~/services/employees.service";
import type { DocumentType, DocumentTypeField } from "~/services/document-types.service";

type EmployeeDocumentActionMode = "add" | "edit";
type EmployeeDocumentActionActor = "employee" | "hr";

interface EmployeeDocumentActionModalProps {
	employeeId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	mode: EmployeeDocumentActionMode;
	existingDocument?: EmployeeDocumentPayload | null;
	initialDocumentType?: string | null;
	documentTypeOptions?: SelectOption[];
	lockDocumentType?: boolean;
	actor?: EmployeeDocumentActionActor;
	actorLabel?: string;
	targetEmployeeLabel?: string;
	targetEmployeeCode?: string | null;
	onSaved?: (document?: EmployeeDocumentPayload | null) => void;
	priorityItem?: EmployeeDocumentPriorityItem | null;
	reviewAction?: {
		enabled: boolean;
		mode: "approve" | "reject";
		onModeChange: (mode: "approve" | "reject") => void;
		rejectionReason: string;
		onRejectionReasonChange: (value: string) => void;
		onSubmit: (mode?: "approve" | "reject") => void | Promise<void>;
		isPending?: boolean;
	};
}

const RESERVED_DOCUMENT_FIELDS = new Set(["number", "issueDate", "expiryDate", "file"]);
const DOCUMENT_DATE_VALIDATION_OPTIONS = {
	minYear: 1900,
	maxYear: 9999,
	allowEmpty: true,
} as const;
const MIN_ALLOWED_DATE = parseDateInputAsUtcDate(MIN_ALLOWED_DATE_INPUT) || undefined;
const MAX_ALLOWED_DATE = parseDateInputAsUtcDate(MAX_ALLOWED_DATE_INPUT) || undefined;

const normalizeDocumentTypeValue = (value: unknown) =>
	String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");

const normalizeDocumentTypeAlias = (value: unknown) => {
	const normalizedValue = normalizeDocumentTypeValue(value);
	const aliasMap: Record<string, string> = {
		sss_id: "sss",
		tin_id: "tin",
		philhealth_id: "philhealth",
		pagibig_id: "pagibig",
		pag_ibig_id: "pagibig",
	};
	return aliasMap[normalizedValue] || normalizedValue;
};

const getDocumentTypeComparableValues = (documentType: DocumentType) => {
	const baseValues = [
		documentType.id,
		documentType.code,
		documentType.name,
		getDocumentTypeOptionValue(documentType),
	];
	const normalizedCode = normalizeDocumentTypeAlias(documentType.code);
	const legacyAliases: Record<string, string[]> = {
		sss: ["sss_id"],
		tin: ["tin_id"],
		philhealth: ["philhealth_id"],
		pagibig: ["pagibig_id", "pag_ibig_id"],
	};

	return [...baseValues, ...(legacyAliases[normalizedCode] || [])]
		.map(normalizeDocumentTypeAlias)
		.filter(Boolean);
};

const looksLikeObjectId = (value: unknown) => /^[a-f0-9]{24}$/i.test(String(value || "").trim());

const getDocumentTypeOptionValue = (documentType: DocumentType) =>
	normalizeDocumentTypeValue(documentType.code) || documentType.id;

const formatDateForInput = (value?: string | Date | null) => {
	if (!value) return "";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toISOString().split("T")[0];
};

const isEmptyValue = (value: unknown) => {
	if (value === null || value === undefined) return true;
	if (typeof value === "string") return value.trim() === "";
	if (Array.isArray(value)) return value.length === 0;
	if (typeof value === "object")
		return Object.keys(value as Record<string, unknown>).length === 0;
	return false;
};

const getDateInputTime = (value?: string | null) => {
	if (!value) return null;
	const parsedDate = parseDateInputAsUtcDate(value);
	return parsedDate ? parsedDate.getTime() : null;
};

const coerceBoolean = (value: unknown) => value === true || value === "true";
const getDocumentTypeMetadata = (documentType?: DocumentType | null) =>
	documentType?.metadata && typeof documentType.metadata === "object"
		? (documentType.metadata as Record<string, unknown>)
		: null;

const buildFallbackOption = (value?: string | null) => {
	const normalizedValue = normalizeDocumentTypeValue(value);
	if (!normalizedValue || looksLikeObjectId(value)) return null;
	return {
		value: normalizedValue,
		label: String(value || normalizedValue)
			.replace(/_/g, " ")
			.replace(/\b\w/g, (char) => char.toUpperCase()),
	};
};

const resolveConfiguredDocumentType = (
	documentTypes: DocumentType[],
	...candidateValues: Array<unknown>
) => {
	for (const candidateValue of candidateValues) {
		const rawCandidate = String(candidateValue || "").trim();
		if (!rawCandidate) continue;

		const normalizedCandidate = normalizeDocumentTypeValue(rawCandidate);
		const normalizedCandidateAlias = normalizeDocumentTypeAlias(rawCandidate);
		const matchedDocumentType = documentTypes.find((documentType) => {
			if (documentType.id === rawCandidate) return true;

			const comparableValues = getDocumentTypeComparableValues(documentType);
			return (
				comparableValues.includes(normalizedCandidate) ||
				comparableValues.includes(normalizedCandidateAlias)
			);
		});

		if (matchedDocumentType) return matchedDocumentType;
	}

	return null;
};

const getDocumentTypeDisplayLabel = (params: {
	documentType?: DocumentType | null;
	priorityDisplayName?: string | null;
	existingDocumentName?: string | null;
	fallbackValue?: string | null;
}) => {
	if (params.documentType?.name) return params.documentType.name;
	if (params.priorityDisplayName) return params.priorityDisplayName;
	if (params.existingDocumentName) return params.existingDocumentName;
	const fallbackOption = buildFallbackOption(params.fallbackValue);
	return fallbackOption?.label || "Document";
};

const buildDateFieldClasses = (hasError: boolean) =>
	`mt-1 w-full rounded-md border px-3 py-2 text-sm text-gray-900 outline-none transition ${
		hasError
			? "border-red-300 bg-red-50 focus:border-red-400"
			: "border-gray-200 bg-white focus:border-orange-300"
	}`;

const buildReviewFieldClasses = (hasError: boolean, readOnly?: boolean) =>
	`${buildDateFieldClasses(hasError)} ${
		readOnly ? "cursor-nvot-allowed bg-gray-50 text-gray-700" : ""
	}`;

const buildConstraintTokenClasses = (isMet?: boolean) =>
	`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${
		isMet === false
			? "border-red-200 bg-red-50 text-red-700"
			: "border-gray-200 bg-gray-50 text-gray-600"
	}`;

const getActorName = (actor?: EmployeeDocumentActor | null) => {
	if (!actor) return "";
	const firstName = actor.person?.personalInfo?.firstName || "";
	const middleName = actor.person?.personalInfo?.middleName || "";
	const lastName = actor.person?.personalInfo?.lastName || "";
	return [firstName, middleName, lastName].filter(Boolean).join(" ").trim() || actor.employeeId;
};

const formatAuditDateTime = (value?: string | Date | null) => {
	if (!value) return "";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
};

export function EmployeeDocumentActionModal({
	employeeId,
	open,
	onOpenChange,
	mode,
	existingDocument,
	initialDocumentType,
	documentTypeOptions,
	lockDocumentType = false,
	actor = "employee",
	actorLabel,
	targetEmployeeLabel,
	targetEmployeeCode,
	onSaved,
	priorityItem,
	reviewAction,
}: EmployeeDocumentActionModalProps) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const uploadMutation = useUploadEmployeeDocument(employeeId);
	const updateMutation = useUpdateEmployeeDocument(employeeId);
	const { data: documentTypesData } = useDocumentTypes(
		{
			page: 1,
			limit: 100,
			sort: "displayOrder",
			order: "asc",
			filter: "isActive:true",
		},
		{ enabled: open && !!employeeId },
	);

	const configuredDocumentTypes = useMemo(
		() =>
			(documentTypesData?.documentTypes || []).filter(
				(documentType) => documentType.isActive,
			),
		[documentTypesData?.documentTypes],
	);

	const configuredOptions = useMemo<SelectOption[]>(
		() =>
			configuredDocumentTypes.map((documentType) => ({
				value: getDocumentTypeOptionValue(documentType),
				label: documentType.name,
			})),
		[configuredDocumentTypes],
	);

	const availableOptions = useMemo(() => {
		const options = documentTypeOptions?.length
			? [...documentTypeOptions]
			: [...configuredOptions];
		const selectedTypeCandidates = [
			initialDocumentType,
			existingDocument?.documentTypeId,
			existingDocument?.type,
			existingDocument?.name,
			priorityItem?.documentTypeId,
			priorityItem?.type,
			priorityItem?.displayName,
		].map(normalizeDocumentTypeAlias);
		for (const configuredType of configuredDocumentTypes) {
			const shouldKeepCanonicalOption = getDocumentTypeComparableValues(configuredType).some(
				(value) => selectedTypeCandidates.includes(value),
			);
			const configuredOption = {
				value: getDocumentTypeOptionValue(configuredType),
				label: configuredType.name,
			};
			if (
				shouldKeepCanonicalOption &&
				!options.some((option) => option.value === configuredOption.value)
			) {
				options.push(configuredOption);
			}
		}
		const existingFallback = buildFallbackOption(
			existingDocument?.name ||
				existingDocument?.type ||
				priorityItem?.displayName ||
				initialDocumentType,
		);
		if (
			existingFallback &&
			!options.some((option) => option.value === existingFallback.value)
		) {
			options.push(existingFallback);
		}
		return options;
	}, [
		configuredOptions,
		configuredDocumentTypes,
		documentTypeOptions,
		existingDocument?.documentTypeId,
		existingDocument?.name,
		existingDocument?.type,
		initialDocumentType,
		priorityItem?.documentTypeId,
		priorityItem?.displayName,
		priorityItem?.type,
	]);

	const [documentTypeValue, setDocumentTypeValue] = useState("");
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [number, setNumber] = useState("");
	const [issueDate, setIssueDate] = useState("");
	const [expiryDate, setExpiryDate] = useState("");
	const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [hrAuditConfirmed, setHrAuditConfirmed] = useState(false);
	const [hrAuditError, setHrAuditError] = useState("");
	const isHrActor = actor === "hr";
	const editableDocument = mode === "edit" ? existingDocument : null;
	const existingDocumentId = String((editableDocument as any)?.id || "").trim();
	const { data: latestReviewEventsData } = useEmployeeDocumentReviewEvents(
		{
			page: 1,
			limit: 1,
			documentId: existingDocumentId || undefined,
		},
		{ enabled: open && isHrActor && Boolean(existingDocumentId) },
	);

	const selectedDocumentType = useMemo(
		() =>
			resolveConfiguredDocumentType(
				configuredDocumentTypes,
				documentTypeValue,
				initialDocumentType,
				existingDocument?.documentTypeId,
				existingDocument?.type,
				existingDocument?.name,
				priorityItem?.documentTypeId,
				priorityItem?.type,
				priorityItem?.displayName,
			),
		[
			configuredDocumentTypes,
			documentTypeValue,
			existingDocument?.documentTypeId,
			existingDocument?.name,
			existingDocument?.type,
			initialDocumentType,
			priorityItem?.displayName,
			priorityItem?.documentTypeId,
			priorityItem?.type,
		],
	);

	const selectedDocumentTypeLabel = useMemo(
		() =>
			getDocumentTypeDisplayLabel({
				documentType: selectedDocumentType,
				priorityDisplayName: priorityItem?.displayName,
				existingDocumentName: existingDocument?.name,
				fallbackValue:
					existingDocument?.name ||
					existingDocument?.type ||
					initialDocumentType ||
					documentTypeValue,
			}),
		[
			documentTypeValue,
			existingDocument?.name,
			existingDocument?.type,
			initialDocumentType,
			priorityItem?.displayName,
			selectedDocumentType,
		],
	);

	const configuredFieldKeys = useMemo(
		() => new Set((selectedDocumentType?.fields || []).map((field) => field.key)),
		[selectedDocumentType?.fields],
	);

	const shouldShowFallbackDates = useMemo(
		() =>
			!configuredFieldKeys.has("issueDate") &&
			!configuredFieldKeys.has("expiryDate") &&
			!selectedDocumentType,
		[configuredFieldKeys, selectedDocumentType],
	);
	const isFileRequiredForCompliance = useMemo(() => {
		const metadata = getDocumentTypeMetadata(selectedDocumentType);
		return Boolean(
			coerceBoolean(metadata?.requireFileForCompliance) ||
				selectedDocumentType?.fields?.some(
					(field) => field.required && field.type === "file",
				),
		);
	}, [selectedDocumentType]);

	useEffect(() => {
		if (!open) return;

		const matchedDocumentType = resolveConfiguredDocumentType(
			configuredDocumentTypes,
			initialDocumentType,
			editableDocument?.documentTypeId,
			editableDocument?.type,
			editableDocument?.name,
			priorityItem?.documentTypeId,
			priorityItem?.type,
			priorityItem?.displayName,
		);
		const defaultDocumentType =
			(matchedDocumentType ? getDocumentTypeOptionValue(matchedDocumentType) : "") ||
			String(
				initialDocumentType ||
					editableDocument?.documentTypeId ||
					editableDocument?.type ||
					(availableOptions.length === 1 ? availableOptions[0].value : ""),
			).trim();

		setDocumentTypeValue(defaultDocumentType);
		setSelectedFile(null);
		setNumber(String(editableDocument?.number || ""));
		setIssueDate(formatDateForInput(editableDocument?.issueDate) || (mode === "add" ? getTodayDateInput() : ""));
		setExpiryDate(formatDateForInput(editableDocument?.expiryDate));
		setFieldValues({ ...(editableDocument?.fieldValues || {}) });
		setErrors({});
		setHrAuditConfirmed(false);
		setHrAuditError("");
	}, [
		availableOptions,
		editableDocument?.expiryDate,
		editableDocument?.fieldValues,
		editableDocument?.issueDate,
		editableDocument?.number,
		editableDocument?.documentTypeId,
		editableDocument?.name,
		editableDocument?.type,
		configuredDocumentTypes,
		initialDocumentType,
		open,
		priorityItem?.displayName,
		priorityItem?.documentTypeId,
		priorityItem?.type,
	]);

	const invalidateRelatedQueries = async () => {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.detail(employeeId),
			}),
			queryClient.invalidateQueries({
				queryKey: [...employeesQueryKeys.employees.details(), employeeId],
			}),
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.documentApprovals(),
			}),
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.documentReviewEvents(),
			}),
			queryClient.invalidateQueries({
				queryKey: metricsQueryKeys.metrics.actionMetrics(),
			}),
			queryClient.invalidateQueries({
				queryKey: metricsQueryKeys.metrics.actionMetrics(employeeId),
			}),
		]);
	};

	const setFieldValue = (fieldKey: string, value: unknown) => {
		setFieldValues((current) => ({
			...current,
			[fieldKey]: value,
		}));
		const fieldConfig = selectedDocumentType?.fields?.find((field) => field.key === fieldKey);
		let validationResult = fieldConfig ? validateDocumentFieldValue(fieldConfig, value) : true;
		if (fieldConfig?.type === "date" && !isEmptyValue(value)) {
			const dateValidation = validateStrictDateInput(
				String(value || ""),
				DOCUMENT_DATE_VALIDATION_OPTIONS,
			);
			validationResult =
				dateValidation.isValid ? true : dateValidation.error || `${fieldConfig.label} is invalid.`;
		}
		if (fieldConfig?.type === "boolean" && fieldConfig.required && value !== true) {
			validationResult = `${fieldConfig.label} is required.`;
		}
		setErrors((current) => {
			const next = { ...current };
			if (validationResult === true) delete next[fieldKey];
			else next[fieldKey] = validationResult;
			return next;
		});
	};

	const validateDocumentDateField = (
		fieldKey: string,
		value: string,
		required?: boolean | null,
		label = "Date",
		nextIssueDate = issueDate,
		nextExpiryDate = expiryDate,
	) => {
		if (required && isEmptyValue(value)) return `${label} is required.`;
		const dateValidation = validateStrictDateInput(value, DOCUMENT_DATE_VALIDATION_OPTIONS);
		if (!dateValidation.isValid) return dateValidation.error || `Invalid ${label}.`;

		const todayTime = getDateInputTime(getTodayDateInput());
		const valueTime = getDateInputTime(value);
		if (fieldKey === "issueDate" && valueTime !== null && todayTime !== null && valueTime > todayTime) {
			return `${label} cannot be in the future.`;
		}

		if (
			fieldKey === "expiryDate" &&
			valueTime !== null &&
			todayTime !== null &&
			valueTime < todayTime
		) {
			return `${label} is already expired. Use a current document before saving this record.`;
		}

		const issueTime = getDateInputTime(nextIssueDate);
		const expiryTime = getDateInputTime(nextExpiryDate);
		if (
			(fieldKey === "issueDate" || fieldKey === "expiryDate") &&
			issueTime !== null &&
			expiryTime !== null &&
			expiryTime < issueTime
		) {
			return "Expiry date cannot be earlier than issue date.";
		}

		return null;
	};

	const setDateValue = (
		fieldKey: "issueDate" | "expiryDate",
		value: string,
		required?: boolean | null,
		label?: string,
	) => {
		const nextIssueDate = fieldKey === "issueDate" ? value : issueDate;
		const nextExpiryDate = fieldKey === "expiryDate" ? value : expiryDate;
		if (fieldKey === "issueDate") setIssueDate(value);
		else setExpiryDate(value);

		setErrors((current) => {
			const next = { ...current };
			const error = validateDocumentDateField(
				fieldKey,
				value,
				required,
				label || (fieldKey === "issueDate" ? "Issue date" : "Expiry date"),
				nextIssueDate,
				nextExpiryDate,
			);
			if (error) next[fieldKey] = error;
			else delete next[fieldKey];

			const relatedFieldKey = fieldKey === "issueDate" ? "expiryDate" : "issueDate";
			const relatedValue = relatedFieldKey === "issueDate" ? nextIssueDate : nextExpiryDate;
			const relatedError = validateDocumentDateField(
				relatedFieldKey,
				relatedValue,
				false,
				relatedFieldKey === "issueDate" ? "Issue date" : "Expiry date",
				nextIssueDate,
				nextExpiryDate,
			);
			if (relatedError && !isEmptyValue(relatedValue)) next[relatedFieldKey] = relatedError;
			else if (!isEmptyValue(relatedValue)) delete next[relatedFieldKey];

			return next;
		});
	};

	const handleSelectedFileChange = (file?: File | null) => {
		if (!file) {
			setSelectedFile(null);
			return;
		}

		const fileError = validateEmployeeDocumentFile(file);
		if (fileError) {
			setSelectedFile(null);
			setErrors((current) => ({ ...current, file: fileError }));
			if (fileInputRef.current) fileInputRef.current.value = "";
			return;
		}

		setSelectedFile(file);
		setErrors((current) => {
			if (!current.file) return current;
			const next = { ...current };
			delete next.file;
			return next;
		});
	};

	const validate = () => {
		const nextErrors: Record<string, string> = {};
		const selectedTypeLabel = selectedDocumentTypeLabel || "document";

		if (!documentTypeValue) {
			nextErrors.documentType = "Please select a document type.";
		}

		if (mode === "add" && isFileRequiredForCompliance && !selectedFile) {
			nextErrors.file = "Please choose a file.";
		}

		if (selectedFile) {
			const fileError = validateEmployeeDocumentFile(selectedFile);
			if (fileError) nextErrors.file = fileError;
		}

		for (const field of selectedDocumentType?.fields || []) {
			if (field.type === "file") {
				if (field.required && !selectedFile && !editableDocument?.fileUrl) {
					nextErrors.file = `${field.label || selectedTypeLabel} is required.`;
				}
				continue;
			}

			if (field.key === "number") {
				const validationResult = validateDocumentFieldValue(field, number);
				if (validationResult !== true) nextErrors.number = validationResult;
				continue;
			}

			if (field.key === "issueDate" && field.required && isEmptyValue(issueDate)) {
				nextErrors.issueDate = `${field.label} is required.`;
				continue;
			}

			if (field.key === "expiryDate" && field.required && isEmptyValue(expiryDate)) {
				nextErrors.expiryDate = `${field.label} is required.`;
				continue;
			}

			if (field.key === "issueDate" && !isEmptyValue(issueDate)) {
				const issueDateError = validateDocumentDateField(
					"issueDate",
					issueDate,
					field.required,
					field.label || "Issue date",
				);
				if (issueDateError) nextErrors.issueDate = issueDateError;
				continue;
			}

			if (field.key === "expiryDate" && !isEmptyValue(expiryDate)) {
				const expiryDateError = validateDocumentDateField(
					"expiryDate",
					expiryDate,
					field.required,
					field.label || "Expiry date",
				);
				if (expiryDateError) nextErrors.expiryDate = expiryDateError;
				continue;
			}

			if (!RESERVED_DOCUMENT_FIELDS.has(field.key)) {
				const validationResult = validateDocumentFieldValue(field, fieldValues[field.key]);
				if (validationResult !== true) {
					nextErrors[field.key] = validationResult;
				}
			}

			if (
				field.type === "boolean" &&
				field.required &&
				coerceBoolean(fieldValues[field.key]) !== true
			) {
				nextErrors[field.key] = `${field.label} is required.`;
			}

			if (field.type === "date" && !isEmptyValue(fieldValues[field.key])) {
				const dateValidation = validateStrictDateInput(
					String(fieldValues[field.key] || ""),
					DOCUMENT_DATE_VALIDATION_OPTIONS,
				);
				if (!dateValidation.isValid) {
					nextErrors[field.key] = dateValidation.error || `Invalid ${field.label}.`;
				}
			}
		}

		if (shouldShowFallbackDates && !isEmptyValue(issueDate)) {
			const issueDateError = validateDocumentDateField(
				"issueDate",
				issueDate,
				false,
				"Issue date",
			);
			if (issueDateError) nextErrors.issueDate = issueDateError;
		}

		if (shouldShowFallbackDates && !isEmptyValue(expiryDate)) {
			const expiryDateError = validateDocumentDateField(
				"expiryDate",
				expiryDate,
				false,
				"Expiry date",
			);
			if (expiryDateError) nextErrors.expiryDate = expiryDateError;
		}

		setErrors(nextErrors);
		return Object.keys(nextErrors).length === 0;
	};

	const requireHrAuditConfirmation = () => {
		if (!isHrActor || hrAuditConfirmed) {
			setHrAuditError("");
			return true;
		}

		setHrAuditError(
			reviewAction?.enabled
				? `Confirm that ${resolvedActorLabel} reviewed the employee, document details, submitted file, and approval decision before continuing.`
				: `Confirm that ${resolvedActorLabel} reviewed the employee and document details before saving this HR record.`,
		);
		return false;
	};

	const handleSubmit = () => {
		if (!requireHrAuditConfirmation()) return;
		if (!validate()) return;

		const resolvedType = selectedDocumentType?.code || documentTypeValue;
		const filteredFieldValues = Object.fromEntries(
			Object.entries(fieldValues).filter(([_, value]) => !isEmptyValue(value)),
		);
		const normalizedIssueDate = validateStrictDateInput(
			issueDate,
			DOCUMENT_DATE_VALIDATION_OPTIONS,
		).isoUtc;
		const normalizedExpiryDate = validateStrictDateInput(
			expiryDate,
			DOCUMENT_DATE_VALIDATION_OPTIONS,
		).isoUtc;
		const normalizedFieldValues = { ...filteredFieldValues };
		for (const field of selectedDocumentType?.fields || []) {
			if (field.type !== "date" || RESERVED_DOCUMENT_FIELDS.has(field.key)) continue;
			const rawValue = normalizedFieldValues[field.key];
			if (isEmptyValue(rawValue)) continue;
			const dateValidation = validateStrictDateInput(
				String(rawValue || ""),
				DOCUMENT_DATE_VALIDATION_OPTIONS,
			);
			if (dateValidation.isValid && dateValidation.isoUtc) {
				normalizedFieldValues[field.key] = dateValidation.isoUtc;
			}
		}

		const payload = {
			file: selectedFile || undefined,
			type: resolvedType,
			documentTypeId: selectedDocumentType?.id,
			number: number.trim() || undefined,
			issueDate: normalizedIssueDate || undefined,
			expiryDate: normalizedExpiryDate || "",
			fieldValues: normalizedFieldValues,
		};

		if (mode === "edit") {
			const editableDocumentKey = existingDocumentId || editableDocument?.number;
			if (!editableDocumentKey) {
				toast.error("Document record not found.");
				return;
			}

			updateMutation.mutate(
				{
					documentNumber: editableDocumentKey,
					formData: payload,
				},
				{
					onSuccess: async (response: any) => {
						await invalidateRelatedQueries();
						toast.success(
							isHrActor
								? "HR document update saved"
								: "Document submission updated for HR approval",
						);
						onSaved?.(response?.document || null);
						onOpenChange(false);
					},
					onError: () => {
						toast.error("Failed to update document submission");
					},
				},
			);
			return;
		}

		if (isFileRequiredForCompliance && !selectedFile) {
			setErrors((current) => ({
				...current,
				file: "Please choose a file.",
			}));
			return;
		}

		uploadMutation.mutate(payload as any, {
			onSuccess: async (response: any) => {
				await invalidateRelatedQueries();
				toast.success(
					isHrActor
						? "Document saved as HR record"
						: "Document submitted for HR approval",
				);
				onSaved?.(response?.document || null);
				onOpenChange(false);
			},
			onError: () => {
				toast.error("Failed to submit document");
			},
		});
	};

	const renderDynamicField = (field: DocumentTypeField) => {
		if (field.type === "file") return null;

		const fieldError = errors[field.key];
		const validationHint = getDocumentFieldValidationHint(field.validation);
		const renderConstraintToken = (value: unknown) => {
			if (!validationHint) return null;
			const hasValue = !isEmptyValue(value);
			const isMet = hasValue ? validateDocumentFieldValue(field, value) === true : undefined;
			return <span className={buildConstraintTokenClasses(isMet)}>{validationHint}</span>;
		};

		const label = (
			<label className="block text-sm font-medium text-gray-700">
				{field.label}
				{field.required ? " *" : ""}
			</label>
		);

		if (field.key === "number") {
			return (
				<div key={field.key} className="space-y-1">
					{label}
					<input
						type="text"
						value={number}
						onChange={(event) => {
							const nextValue = event.target.value;
							setNumber(nextValue);
							const validationResult = validateDocumentFieldValue(field, nextValue);
							setErrors((current) => {
								const next = { ...current };
								if (validationResult === true) delete next.number;
								else next.number = validationResult;
								return next;
							});
						}}
						placeholder={field.placeholder || "Enter document number"}
						readOnly={isReviewReadOnly}
						disabled={isReviewReadOnly}
						className={buildReviewFieldClasses(Boolean(fieldError), isReviewReadOnly)}
					/>
					{renderConstraintToken(number)}
					{!isHrActor && field.helperText ? (
						<p className="text-xs text-gray-500">{field.helperText}</p>
					) : null}
					{fieldError ? <p className="text-xs text-red-600">{fieldError}</p> : null}
				</div>
			);
		}

		if (field.key === "issueDate" || field.key === "expiryDate") {
			const dateFieldKey = field.key;
			const value = field.key === "issueDate" ? issueDate : expiryDate;
			return (
				<div key={field.key} className="space-y-1">
					{label}
					<CalendarDatePicker
						value={value}
						onChange={(nextValue) =>
							setDateValue(dateFieldKey, nextValue, field.required, field.label)
						}
						minDate={MIN_ALLOWED_DATE}
						maxDate={MAX_ALLOWED_DATE}
						disabled={isReviewReadOnly}
						className={buildReviewFieldClasses(Boolean(fieldError), isReviewReadOnly)}
					/>
					{!isHrActor && field.helperText ? (
						<p className="text-xs text-gray-500">{field.helperText}</p>
					) : null}
					{fieldError ? <p className="text-xs text-red-600">{fieldError}</p> : null}
				</div>
			);
		}

		if (field.type === "select") {
			return (
				<div key={field.key} className="space-y-1">
					{label}
					<Select
						options={(field.options || []).map((option) => ({
							label: option.label,
							value: option.value,
						}))}
						value={String(fieldValues[field.key] || "")}
						onChange={(value) => setFieldValue(field.key, value)}
						placeholder={field.placeholder || `Select ${field.label}`}
						disabled={isReviewReadOnly}
					/>
					{!isHrActor && field.helperText ? (
						<p className="text-xs text-gray-500">{field.helperText}</p>
					) : null}
					{fieldError ? <p className="text-xs text-red-600">{fieldError}</p> : null}
				</div>
			);
		}

		if (field.type === "boolean") {
			return (
				<div
					key={field.key}
					className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
					<label className="flex items-center justify-between gap-3">
						<div>
							<p className="text-sm font-medium text-gray-700">
								{field.label}
								{field.required ? " *" : ""}
							</p>
							{!isHrActor && field.helperText ? (
								<p className="text-xs text-gray-500">{field.helperText}</p>
							) : null}
						</div>
						<input
							type="checkbox"
							checked={coerceBoolean(fieldValues[field.key])}
							onChange={(event) => setFieldValue(field.key, event.target.checked)}
							disabled={isReviewReadOnly}
							className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
						/>
					</label>
					{fieldError ? <p className="mt-1 text-xs text-red-600">{fieldError}</p> : null}
				</div>
			);
		}

		return (
			<div key={field.key} className="space-y-1">
				{label}
				{field.type === "date" ? (
					<CalendarDatePicker
						value={String(fieldValues[field.key] || "")}
						onChange={(value) => setFieldValue(field.key, value)}
						placeholder={field.placeholder || "MM/DD/YYYY"}
						minDate={MIN_ALLOWED_DATE}
						maxDate={MAX_ALLOWED_DATE}
						disabled={isReviewReadOnly}
						className={buildReviewFieldClasses(Boolean(fieldError), isReviewReadOnly)}
					/>
				) : (
					<input
						type={field.type === "number" ? "number" : "text"}
						value={String(fieldValues[field.key] || "")}
						onChange={(event) => setFieldValue(field.key, event.target.value)}
						placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
						readOnly={isReviewReadOnly}
						disabled={isReviewReadOnly}
						className={buildReviewFieldClasses(Boolean(fieldError), isReviewReadOnly)}
					/>
				)}
				{!isHrActor && field.helperText ? (
					<p className="text-xs text-gray-500">{field.helperText}</p>
				) : null}
				{renderConstraintToken(fieldValues[field.key])}
				{fieldError ? <p className="text-xs text-red-600">{fieldError}</p> : null}
			</div>
		);
	};

	const isPending = uploadMutation.isPending || updateMutation.isPending;
	const isOnboardingLockedFlow = lockDocumentType;
	const isReviewActionEnabled = Boolean(isHrActor && reviewAction?.enabled);
	const isReviewReadOnly = isReviewActionEnabled;
	const resolvedActorLabel = actorLabel?.trim() || "Current HR user";
	const resolvedTargetEmployeeLabel = targetEmployeeLabel?.trim() || employeeId;
	const resolvedTargetEmployeeCode =
		targetEmployeeCode?.trim() ||
		resolvedTargetEmployeeLabel.match(/\(([^)]+)\)\s*$/)?.[1] ||
		"";
	const resolvedTargetEmployeeName =
		resolvedTargetEmployeeCode &&
		resolvedTargetEmployeeLabel.endsWith(`(${resolvedTargetEmployeeCode})`)
			? resolvedTargetEmployeeLabel.replace(` (${resolvedTargetEmployeeCode})`, "").trim()
			: resolvedTargetEmployeeLabel;
	const latestReviewEvent = latestReviewEventsData?.events?.[0] || null;
	const latestReviewActor = latestReviewEvent
		? getActorName(latestReviewEventsData?.actors?.[latestReviewEvent.actorEmployeeId || ""])
		: "";
	const latestReviewDate = formatAuditDateTime(
		latestReviewEvent?.occurredAt || (editableDocument as any)?.updatedAt,
	);
	const latestReviewLabel =
		latestReviewEvent && (latestReviewActor || latestReviewDate)
			? [latestReviewActor || "System", latestReviewDate].filter(Boolean).join(" - ")
			: "";
	const documentHeading =
		selectedDocumentTypeLabel.toLowerCase() === "document"
			? "document"
			: selectedDocumentTypeLabel;
	const modalTitle = isHrActor
		? isReviewActionEnabled
			? `Review ${documentHeading} Submission`
			: mode === "edit"
				? `Update ${documentHeading} Record`
				: `Record ${documentHeading}`
		: mode === "edit"
			? `Update ${documentHeading} Submission`
			: `Submit ${documentHeading} for Approval`;
	const modalDescription = isHrActor
		? undefined
		: isOnboardingLockedFlow && mode === "edit"
			? "Complete the remaining document details below. Attach a new file only if you need to replace the current one. HR will review the latest submission before it is approved."
			: isOnboardingLockedFlow
				? "Add the document details below. Attach a file only when needed, then send the document to HR for approval."
				: priorityItem?.actionDescription ||
					(mode === "edit"
						? "Update the document details or replace the file if needed. HR will review the latest submission before it is approved."
						: isFileRequiredForCompliance
							? "Add the missing document details, upload the file, and send it to HR for approval."
							: "Add the missing document details. Upload a file only if needed, then send it to HR for approval.");
	const submitLabel =
		isHrActor && mode === "edit"
			? "Save Record"
			: isHrActor
				? "Save Record"
				: mode === "edit"
					? "Update & Resubmit to HR"
					: isOnboardingLockedFlow
						? "Submit to HR for Approval"
						: isFileRequiredForCompliance
							? "Upload Document"
							: "Submit to HR for Approval";
	const pendingSubmitLabel = isHrActor
		? "Saving HR record..."
		: mode === "edit"
			? "Updating submission..."
			: isOnboardingLockedFlow
				? "Submitting to HR..."
				: selectedFile || isFileRequiredForCompliance
					? "Uploading to HR..."
					: "Submitting to HR...";
	const fileSectionLabel = isHrActor
		? isReviewActionEnabled
			? "File Evidence"
			: mode === "edit"
				? "File"
				: "File"
		: isOnboardingLockedFlow
			? "Supporting File"
			: mode === "edit"
				? "Replace File"
				: "Upload File";
	const isSubmitDisabled = isPending;
	const handleReviewSubmit = (mode?: "approve" | "reject") => {
		if (mode && reviewAction?.mode !== mode) {
			reviewAction?.onModeChange(mode);
			if (mode === "reject" && !reviewAction?.rejectionReason.trim()) return;
		}
		if (!requireHrAuditConfirmation()) return;
		void reviewAction?.onSubmit(mode);
	};

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title={modalTitle}
			description={modalDescription}
			className="max-w-4xl"
			closeOnBackdropClick={false}>
			<div className="space-y-5">
				{isHrActor ? (
					<div className="grid gap-5 lg:grid-cols-5">
						<div className="space-y-4 lg:col-span-3">
							<button
								type="button"
								onClick={() => navigate(`/employee/${employeeId}`)}
								className="flex w-full items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-left transition-colors hover:border-orange-200 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2">
								<EmployeeAvatar
									alt={resolvedTargetEmployeeName}
									size="md"
									className="shrink-0"
								/>
								<span className="min-w-0">
									<span className="block truncate text-sm font-semibold text-gray-900">
										{resolvedTargetEmployeeName}
									</span>
									{resolvedTargetEmployeeCode ? (
										<span className="block truncate text-xs text-gray-500">
											{resolvedTargetEmployeeCode}
										</span>
									) : null}
								</span>
							</button>

							<div className="space-y-1">
								<label className="block text-sm font-medium text-gray-700">
									Document Type *
								</label>
								{lockDocumentType ? (
									<div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5">
										<p className="text-sm font-medium text-gray-900">
											{selectedDocumentTypeLabel}
										</p>
									</div>
								) : (
									<Select
										options={availableOptions}
										value={documentTypeValue}
										onChange={(value) => setDocumentTypeValue(value)}
										placeholder="Select document type"
										disabled={mode === "edit"}
									/>
								)}
								{errors.documentType ? (
									<p className="text-xs text-red-600">{errors.documentType}</p>
								) : null}
							</div>

							{selectedDocumentType?.fields?.length ? (
								<div className="grid gap-4 md:grid-cols-2">
									{selectedDocumentType.fields.map(renderDynamicField)}
								</div>
							) : null}

							{shouldShowFallbackDates ? (
								<div className="grid gap-4 md:grid-cols-2">
									<div className="space-y-1">
										<label className="block text-sm font-medium text-gray-700">
											Issue Date
										</label>
										<CalendarDatePicker
											value={issueDate}
											onChange={(nextValue) => setDateValue("issueDate", nextValue, false, "Issue date")}
											minDate={MIN_ALLOWED_DATE}
											maxDate={MAX_ALLOWED_DATE}
											className={buildDateFieldClasses(
												Boolean(errors.issueDate),
											)}
										/>
										{errors.issueDate ? (
											<p className="text-xs text-red-600">
												{errors.issueDate}
											</p>
										) : null}
									</div>
									<div className="space-y-1">
										<label className="block text-sm font-medium text-gray-700">
											Expiry Date
										</label>
										<CalendarDatePicker
											value={expiryDate}
											onChange={(nextValue) => setDateValue("expiryDate", nextValue, false, "Expiry date")}
											minDate={MIN_ALLOWED_DATE}
											maxDate={MAX_ALLOWED_DATE}
											className={buildDateFieldClasses(
												Boolean(errors.expiryDate),
											)}
										/>
										{errors.expiryDate ? (
											<p className="text-xs text-red-600">
												{errors.expiryDate}
											</p>
										) : null}
									</div>
								</div>
							) : null}
						</div>

						<div className="space-y-4 lg:col-span-2">
							<div className="space-y-2">
								<div className="flex items-center justify-between gap-3">
									<label className="block text-sm font-medium text-gray-700">
										{fileSectionLabel}
										{mode === "add" && isFileRequiredForCompliance ? " *" : ""}
									</label>
									{editableDocument?.fileUrl ? (
										<a
											href={editableDocument.fileUrl}
											target="_blank"
											rel="noreferrer"
											className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
											<FileText className="h-3.5 w-3.5" />
											View current file
										</a>
									) : null}
								</div>

								{!selectedFile ? (
									<button
										type="button"
										onClick={() => fileInputRef.current?.click()}
										className="flex min-h-[220px] w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center transition hover:border-orange-300 hover:bg-orange-50">
										{editableDocument?.fileUrl ? (
											<>
												<FileText className="mb-2 h-8 w-8 text-orange-500" />
												<p className="max-w-full truncate text-sm font-medium text-gray-900">
													Current file on record
												</p>
												<p className="mt-1 text-xs text-gray-500">
													Choose a replacement file
												</p>
											</>
										) : (
											<>
												<Upload className="mb-2 h-8 w-8 text-orange-400" />
												<p className="text-sm font-medium text-gray-900">
													Choose a PDF, JPG, or PNG
												</p>
											</>
										)}
									</button>
								) : (
									<div className="flex min-h-[220px] items-center justify-center gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-8">
										<FileText className="h-8 w-8 flex-shrink-0 text-orange-500" />
										<div className="min-w-0 text-left">
											<p className="truncate text-sm font-medium text-gray-900">
												{selectedFile.name}
											</p>
											<p className="text-xs text-gray-500">
												{(selectedFile.size / 1024 / 1024).toFixed(2)} MB
											</p>
										</div>
										<button
											type="button"
											onClick={() => setSelectedFile(null)}
											className="rounded-md p-2 text-red-600 transition hover:bg-red-100">
											<X className="h-4 w-4" />
										</button>
									</div>
								)}
								<input
									ref={fileInputRef}
									type="file"
									accept={EMPLOYEE_DOCUMENT_ACCEPT}
									className="hidden"
									onChange={(event) =>
										handleSelectedFileChange(event.target.files?.[0])
									}
								/>
								{errors.file ? (
									<p className="text-xs text-red-600">{errors.file}</p>
								) : null}

								{isHrActor && !isReviewActionEnabled && (
									<>
										<label className="flex items-start gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-800">
											<input
												type="checkbox"
												checked={hrAuditConfirmed}
												onChange={(event) => {
													setHrAuditConfirmed(event.target.checked);
													if (event.target.checked) setHrAuditError("");
												}}
												aria-invalid={Boolean(hrAuditError)}
												className="mt-0.5 h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
											/>
											<span>
												Confirm as {resolvedActorLabel}. I reviewed the employee, document
												details, and file evidence before saving this record.
											</span>
										</label>
										{hrAuditError ? (
											<p className="px-1 text-xs font-medium text-red-600">
												{hrAuditError}
											</p>
										) : null}
									</>
								)}
							</div>

							{latestReviewLabel ? (
								<div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
									<span className="font-medium text-gray-700">Last saved:</span>{" "}
									{latestReviewLabel}
								</div>
							) : null}

						</div>
					</div>
				) : (
					<div className="grid gap-5 lg:grid-cols-5">
						<div className="space-y-4 lg:col-span-3">
							<div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
								<div className="font-semibold">HR approval required</div>
								<div className="mt-1 text-neutral-600">
									After you submit this document, it will appear as waiting for HR
									approval until the HR team reviews it.
								</div>
							</div>

							<div className="space-y-1">
								<label className="block text-sm font-medium text-gray-700">
									Document Type *
								</label>
								{lockDocumentType ? (
									<div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5">
										<p className="text-sm font-medium text-gray-900">
											{selectedDocumentTypeLabel}
										</p>
										<p className="mt-1 text-xs text-gray-500">
											Document type is fixed for this onboarding action.
										</p>
									</div>
								) : (
									<Select
										options={availableOptions}
										value={documentTypeValue}
										onChange={(value) => setDocumentTypeValue(value)}
										placeholder="Select document type"
										disabled={mode === "edit"}
									/>
								)}
								{errors.documentType ? (
									<p className="text-xs text-red-600">{errors.documentType}</p>
								) : null}
							</div>

							{selectedDocumentType?.fields?.length ? (
								<div className="grid gap-4 md:grid-cols-2">
									{selectedDocumentType.fields.map(renderDynamicField)}
								</div>
							) : null}

							{shouldShowFallbackDates ? (
								<div className="grid gap-4 md:grid-cols-2">
									<div className="space-y-1">
										<label className="block text-sm font-medium text-gray-700">
											Issue Date
										</label>
										<CalendarDatePicker
											value={issueDate}
											onChange={(nextValue) => setDateValue("issueDate", nextValue, false, "Issue date")}
											minDate={MIN_ALLOWED_DATE}
											maxDate={MAX_ALLOWED_DATE}
											disabled={isReviewReadOnly}
											className={buildReviewFieldClasses(
												Boolean(errors.issueDate),
												isReviewReadOnly,
											)}
										/>
										{errors.issueDate ? (
											<p className="text-xs text-red-600">
												{errors.issueDate}
											</p>
										) : null}
									</div>
									<div className="space-y-1">
										<label className="block text-sm font-medium text-gray-700">
											Expiry Date
										</label>
										<CalendarDatePicker
											value={expiryDate}
											onChange={(nextValue) => setDateValue("expiryDate", nextValue, false, "Expiry date")}
											minDate={MIN_ALLOWED_DATE}
											maxDate={MAX_ALLOWED_DATE}
											disabled={isReviewReadOnly}
											className={buildReviewFieldClasses(
												Boolean(errors.expiryDate),
												isReviewReadOnly,
											)}
										/>
										{errors.expiryDate ? (
											<p className="text-xs text-red-600">
												{errors.expiryDate}
											</p>
										) : null}
									</div>
								</div>
							) : null}
						</div>

						<div className="space-y-4 lg:col-span-2">
							<div className="space-y-2">
								<div className="flex items-center justify-between gap-3">
									<label className="block text-sm font-medium text-gray-700">
										{fileSectionLabel}
										{mode === "add" && isFileRequiredForCompliance ? " *" : ""}
									</label>
									{editableDocument?.fileUrl ? (
										<a
											href={editableDocument.fileUrl}
											target="_blank"
											rel="noreferrer"
											className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
											<FileText className="h-3.5 w-3.5" />
											View current file
										</a>
									) : null}
								</div>

								{!selectedFile ? (
									<button
										type="button"
										onClick={() => {
											if (!isReviewReadOnly) fileInputRef.current?.click();
										}}
										disabled={isReviewReadOnly}
										className="flex min-h-[220px] w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center transition enabled:hover:border-orange-300 enabled:hover:bg-orange-50 disabled:cursor-not-allowed">
										{editableDocument?.fileUrl ? (
											<>
												<FileText className="mb-2 h-8 w-8 text-orange-500" />
												<p className="max-w-full truncate text-sm font-medium text-gray-900">
													Current file on record
												</p>
												<p className="mt-1 text-xs text-gray-500">
													{isReviewReadOnly
														? "Review the current file"
														: "Choose a replacement file"}
												</p>
											</>
										) : (
											<>
												<Upload className="mb-2 h-8 w-8 text-orange-400" />
												<p className="text-sm font-medium text-gray-900">
													Choose a PDF, JPG, or PNG
												</p>
											</>
										)}
									</button>
								) : (
									<div className="flex min-h-[220px] items-center justify-center gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-8">
										<FileText className="h-8 w-8 flex-shrink-0 text-orange-500" />
										<div className="min-w-0 text-left">
											<p className="truncate text-sm font-medium text-gray-900">
												{selectedFile.name}
											</p>
											<p className="text-xs text-gray-500">
												{(selectedFile.size / 1024 / 1024).toFixed(2)} MB
											</p>
										</div>
										<button
											type="button"
											onClick={() => setSelectedFile(null)}
											disabled={isReviewReadOnly}
											className="rounded-md p-2 text-red-600 transition hover:bg-red-100">
											<X className="h-4 w-4" />
										</button>
									</div>
								)}
								<input
									ref={fileInputRef}
									type="file"
									accept={EMPLOYEE_DOCUMENT_ACCEPT}
									className="hidden"
									disabled={isReviewReadOnly}
									onChange={(event) =>
										handleSelectedFileChange(event.target.files?.[0])
									}
								/>
								{errors.file ? (
									<p className="text-xs text-red-600">{errors.file}</p>
								) : null}
							</div>

							{editableDocument?.fileUrl ? (
								<div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
									Choose a new file only if you need to replace the current one.
								</div>
							) : (
								<div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
									{isFileRequiredForCompliance
										? "Attach the document file to continue."
										: "Attach a file only when this document needs supporting proof."}
								</div>
							)}

							{isReviewActionEnabled && reviewAction && (
								<>
									<label className="flex items-start gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-800">
										<input
											type="checkbox"
											checked={hrAuditConfirmed}
											onChange={(event) => {
												setHrAuditConfirmed(event.target.checked);
												if (event.target.checked) setHrAuditError("");
											}}
											aria-invalid={Boolean(hrAuditError)}
											className="mt-0.5 h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
										/>
										<span>
											Confirm as {resolvedActorLabel}. I reviewed the employee, document
											details, and file evidence before this decision.
										</span>
									</label>
									{hrAuditError ? (
										<p className="px-1 text-xs font-medium text-red-600">
											{hrAuditError}
										</p>
									) : null}
								</>
							)}
						</div>
					</div>
				)}

				{isReviewActionEnabled && reviewAction ? (
					<div className="space-y-3 border-t border-gray-100 pt-4">
						<div className="grid gap-2 sm:grid-cols-2">
							<Button
								type="button"
								variant={reviewAction.mode === "approve" ? "default" : "outline"}
								onClick={() => handleReviewSubmit("approve")}
								disabled={Boolean(reviewAction.isPending)}>
								{reviewAction.isPending && reviewAction.mode === "approve" ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Approving...
									</>
								) : (
									"Approve"
								)}
							</Button>
							<Button
								type="button"
								variant={
									reviewAction.mode === "reject" ? "destructive" : "outline"
								}
								onClick={() => handleReviewSubmit("reject")}
								disabled={
									Boolean(reviewAction.isPending) ||
									(reviewAction.mode === "reject" &&
										!reviewAction.rejectionReason.trim())
								}>
								{reviewAction.isPending && reviewAction.mode === "reject" ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Returning...
									</>
								) : (
									"Return for Correction"
								)}
							</Button>
						</div>
						{reviewAction.mode === "reject" ? (
							<div className="space-y-2">
								<label className="block text-sm font-medium text-gray-700">
									Reason for return
								</label>
								<textarea
									value={reviewAction.rejectionReason}
									onChange={(event) =>
										reviewAction.onRejectionReasonChange(event.target.value)
									}
									placeholder="Tell the employee what needs to be corrected."
									className="min-h-24 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-orange-300"
								/>
							</div>
						) : null}
					</div>
				) : null}

				<div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending || reviewAction?.isPending}>
						Cancel
					</Button>
					{!isReviewActionEnabled || !reviewAction ? (
						<Button type="button" onClick={handleSubmit} disabled={isSubmitDisabled}>
							{isPending ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									{pendingSubmitLabel}
								</>
							) : (
								<>{submitLabel}</>
							)}
						</Button>
					) : null}
				</div>
			</div>
		</Modal>
	);
}
