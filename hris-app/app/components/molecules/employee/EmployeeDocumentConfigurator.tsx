import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { Controller, type UseFormReturn } from "react-hook-form";
import {
	AlertCircle,
	CalendarDays,
	CheckCircle2,
	CheckSquare2,
	FileText,
	Hash,
	Plus,
	Square,
	Upload,
	X,
} from "lucide-react";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { DynamicFormField } from "~/components/molecules/form/DynamicFormField";
import {
	MAX_ALLOWED_DATE_INPUT,
	MIN_ALLOWED_DATE_INPUT,
	getTodayDateInput,
	parseDateInputAsUtcDate,
} from "~/lib/utils/date-validation";
import {
	EMPLOYEE_DOCUMENT_ACCEPT,
	EMPLOYEE_DOCUMENT_ALLOWED_EXTENSIONS,
	EMPLOYEE_DOCUMENT_MAX_SIZE_MB,
	validateEmployeeDocumentFile,
} from "~/lib/utils/document-file";
import {
	getDocumentFieldValidationHint,
	validateDocumentFieldValue,
} from "~/lib/utils/document-field-validation";
import type { EmployeeDocumentPayload } from "~/services/employees.service";
import type { DocumentType } from "~/services/document-types.service";
import type { FormData as EmployeeFormData } from "~/types/employee-form.types";

export type EmployeeDocumentFormShape = {
	employee: Pick<EmployeeFormData["employee"], "organizationId" | "documents">;
};

export type EmployeeDocumentWorkflowStatus =
	| "needs_action"
	| "pending_approval"
	| "done"
	| "optional";

export const RESERVED_DOCUMENT_FIELDS = new Set(["number", "issueDate", "expiryDate"]);
const MIN_ALLOWED_DATE = parseDateInputAsUtcDate(MIN_ALLOWED_DATE_INPUT) || undefined;
const MAX_ALLOWED_DATE = parseDateInputAsUtcDate(MAX_ALLOWED_DATE_INPUT) || undefined;

const getDynamicFieldType = (field: DocumentType["fields"][number]) =>
	field.type === "boolean" ? "checkbox" : field.type;

const FILTER_META: Record<
	EmployeeDocumentWorkflowStatus,
	{
		label: string;
		emptyTitle: string;
		emptyDescription: string;
		activeClassName: string;
		idleClassName: string;
		icon: typeof AlertCircle;
	}
> = {
	needs_action: {
		label: "Needs action",
		emptyTitle: "Nothing urgent to update",
		emptyDescription: "Documents missing required details or required files appear here first.",
		activeClassName: "bg-orange-600 text-white",
		idleClassName: "bg-orange-50 text-orange-700 hover:bg-orange-100",
		icon: AlertCircle,
	},
	pending_approval: {
		label: "Pending approval",
		emptyTitle: "No documents waiting for approval",
		emptyDescription: "Complete employee submissions that still need HR approval appear here.",
		activeClassName: "bg-sky-600 text-white",
		idleClassName: "bg-sky-50 text-sky-700 hover:bg-sky-100",
		icon: FileText,
	},
	done: {
		label: "Compliant",
		emptyTitle: "No compliant documents yet",
		emptyDescription: "Documents that already meet the configured rules stay editable here.",
		activeClassName: "bg-emerald-600 text-white",
		idleClassName: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
		icon: CheckCircle2,
	},
	optional: {
		label: "Optional",
		emptyTitle: "No optional documents pending",
		emptyDescription: "Optional document types can be added only when needed.",
		activeClassName: "bg-gray-900 text-white",
		idleClassName: "bg-gray-100 text-gray-600 hover:bg-gray-200",
		icon: Plus,
	},
};

const getDocumentCardErrorMessage = (documentError: any): string | null => {
	if (!documentError || typeof documentError !== "object") return null;
	if (typeof documentError.message === "string" && documentError.message.trim()) {
		return documentError.message;
	}

	const directKeys = ["documentTypeId", "number", "issueDate", "expiryDate"];
	for (const key of directKeys) {
		const candidate = documentError?.[key]?.message;
		if (typeof candidate === "string" && candidate.trim()) {
			return candidate;
		}
	}

	const fieldValueErrors = documentError?.fieldValues;
	if (fieldValueErrors && typeof fieldValueErrors === "object") {
		for (const value of Object.values(fieldValueErrors)) {
			const candidate = (value as any)?.message;
			if (typeof candidate === "string" && candidate.trim()) {
				return candidate;
			}
		}
	}

	return null;
};

const formatBadgeLabel = (value?: string | null) => {
	if (!value) return "";
	return value
		.toLowerCase()
		.split(/[_\s-]+/)
		.filter(Boolean)
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join(" ");
};

const formatDateLabel = (value?: string | null) => {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
};

type SummaryChip = {
	key: string;
	label: string;
	value: string;
	icon: ReactNode;
};

const buildSummaryChips = (document?: EmployeeDocumentPayload | null): SummaryChip[] => {
	if (!document) return [];

	const chips: SummaryChip[] = [];
	if (document.fileUrl) {
		chips.push({
			key: "file",
			label: "File",
			value: "Uploaded",
			icon: <FileText className="h-3.5 w-3.5" />,
		});
	}
	if (document.number) {
		chips.push({
			key: "number",
			label: "Number",
			value: document.number,
			icon: <Hash className="h-3.5 w-3.5" />,
		});
	}

	const issueDate = formatDateLabel(document.issueDate);
	if (issueDate) {
		chips.push({
			key: "issueDate",
			label: "Issued",
			value: issueDate,
			icon: <CalendarDays className="h-3.5 w-3.5" />,
		});
	}

	const expiryDate = formatDateLabel(document.expiryDate);
	if (expiryDate) {
		chips.push({
			key: "expiryDate",
			label: "Expires",
			value: expiryDate,
			icon: <CalendarDays className="h-3.5 w-3.5" />,
		});
	}

	return chips;
};

interface CompactOptionalCardProps {
	documentType: DocumentType;
	showUploadBy: boolean;
	disabled?: boolean;
	onActivateOptional?: (docTypeId: string) => void;
}

function CompactOptionalCard({
	documentType,
	showUploadBy,
	disabled = false,
	onActivateOptional,
}: CompactOptionalCardProps) {
	const categoryLabel = formatBadgeLabel(documentType.category || "Compliance");

	return (
		<div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div className="space-y-2">
					<div className="flex flex-wrap items-center gap-2">
						<h3 className="text-sm font-semibold text-gray-900">{documentType.name}</h3>
						<Badge className="bg-blue-50 text-blue-700">{categoryLabel}</Badge>
						{showUploadBy ? (
							<Badge className="bg-gray-100 text-gray-600">
								Upload by {formatBadgeLabel(documentType.uploadBy)}
							</Badge>
						) : null}
						<Badge className="bg-gray-100 text-gray-700">Optional</Badge>
					</div>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={disabled}
					onClick={() => onActivateOptional?.(documentType.id)}
					className="gap-1.5 border-gray-300 text-gray-700 hover:bg-gray-50">
					<Plus className="h-4 w-4" />
					Add document
				</Button>
			</div>
		</div>
	);
}

export interface EmployeeDocumentConfiguratorProps {
	form: UseFormReturn<EmployeeDocumentFormShape>;
	documentTypes: DocumentType[];
	documentFiles?: { [key: string]: File | null };
	onFileChange?: (docType: string, file: File | null) => void;
	enabledDocuments: { [key: string]: boolean };
	onToggleDocument?: (docType: string) => void;
	title?: string;
	emptyState?: ReactNode;
	isLoading?: boolean;
	disabled?: boolean;
	showSkippedHint?: boolean;
	showUploadBy?: boolean;
	skippedHintText?: string;
	mode?: "default" | "compact";
	documentStatuses?: Partial<Record<string, EmployeeDocumentWorkflowStatus>>;
	activeFilter?: EmployeeDocumentWorkflowStatus;
	onFilterChange?: (filter: EmployeeDocumentWorkflowStatus) => void;
	existingDocuments?: Partial<Record<string, EmployeeDocumentPayload | null>>;
	activeOptionalDocuments?: Partial<Record<string, boolean>>;
	onActivateOptional?: (docTypeId: string) => void;
	onCancelOptional?: (docTypeId: string) => void;
	onReviewPendingApproval?: (documentTypeId: string) => void;
	renderDocumentMeta?: (docTypeId: string) => ReactNode;
	renderDocumentOperationalFields?: (
		docTypeId: string,
		status: EmployeeDocumentWorkflowStatus,
	) => ReactNode;
	isDocumentReadOnly?: (docTypeId: string, status: EmployeeDocumentWorkflowStatus) => boolean;
}

export function EmployeeDocumentConfigurator({
	form,
	documentTypes,
	documentFiles = {},
	onFileChange,
	enabledDocuments,
	onToggleDocument,
	title = "Compliance Documents",
	emptyState,
	isLoading = false,
	disabled = false,
	showSkippedHint = true,
	showUploadBy = false,
	skippedHintText = "This document can be completed later during employee onboarding.",
	mode = "default",
	documentStatuses,
	activeFilter = "needs_action",
	onFilterChange,
	existingDocuments,
	activeOptionalDocuments,
	onActivateOptional,
	onCancelOptional,
	onReviewPendingApproval,
	renderDocumentMeta,
	renderDocumentOperationalFields,
	isDocumentReadOnly,
}: EmployeeDocumentConfiguratorProps) {
	const compactMode = mode === "compact";
	const {
		control,
		register,
		setValue,
		trigger,
		watch,
		formState: { errors },
	} = form;
	const [fileNames, setFileNames] = useState<{ [key: string]: string }>({});

	useEffect(() => {
		if (compactMode) return;

		const currentDocuments = watch("employee.documents") || [];
		const nextDocuments = documentTypes.map((documentType) => {
			const isEnabled = !!enabledDocuments[documentType.id];
			const existing =
				currentDocuments.find(
					(doc) =>
						doc.documentTypeId === documentType.id ||
						String(doc.type || "").toLowerCase() ===
							String(documentType.code || "").toLowerCase(),
				) || null;

			return {
				name: isEnabled ? existing?.name || documentType.name : documentType.name,
				type: isEnabled ? existing?.type || documentType.code : documentType.code,
				documentTypeId: documentType.id,
				number: isEnabled ? existing?.number || "" : "",
				issueDate: isEnabled
					? existing
						? existing.issueDate || ""
						: getTodayDateInput()
					: "",
				expiryDate: isEnabled ? existing?.expiryDate || null : null,
				fileUrl: isEnabled ? existing?.fileUrl || "" : "",
				ext: isEnabled ? existing?.ext || "" : "",
				fieldValues: isEnabled ? existing?.fieldValues || {} : {},
				metadata: existing?.metadata || null,
			};
		});

		setValue("employee.documents", nextDocuments, { shouldDirty: false });
	}, [compactMode, documentTypes, enabledDocuments, setValue, watch]);

	useEffect(() => {
		if (compactMode || !documentTypes.length) return;

		const currentDocuments = watch("employee.documents") || [];
		documentTypes.forEach((documentType) => {
			const existing = currentDocuments.find(
				(doc) =>
					doc.documentTypeId === documentType.id ||
					String(doc.type || "").toLowerCase() ===
						String(documentType.code || "").toLowerCase(),
			);
			const docKey = documentType.id;
			if (!enabledDocuments[docKey]) {
				if (fileNames[docKey]) {
					setFileNames((prev) => {
						const next = { ...prev };
						delete next[docKey];
						return next;
					});
				}
				return;
			}
			if (existing?.fileUrl && !fileNames[docKey]) {
				setFileNames((prev) => ({
					...prev,
					[docKey]: "Existing file uploaded",
				}));
			}
		});
	}, [compactMode, documentTypes, enabledDocuments, fileNames, watch]);

	const handleFileChange = (docKey: string, event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0] || null;
		if (file) {
			const fileError = validateEmployeeDocumentFile(file);
			if (fileError) {
				window.alert(fileError);
				event.target.value = "";
				setFileNames((prev) => {
					const next = { ...prev };
					delete next[docKey];
					return next;
				});
				onFileChange?.(docKey, null);
				return;
			}
		}
		setFileNames((prev) => {
			const next = { ...prev };
			if (file) next[docKey] = file.name;
			else delete next[docKey];
			return next;
		});
		onFileChange?.(docKey, file);
	};

	const removeFile = (docKey: string) => {
		setFileNames((prev) => {
			const next = { ...prev };
			delete next[docKey];
			return next;
		});
		onFileChange?.(docKey, null);
	};

	const filterCounts = useMemo(() => {
		return documentTypes.reduce<Record<EmployeeDocumentWorkflowStatus, number>>(
			(accumulator, documentType) => {
				const status = documentStatuses?.[documentType.id] || "optional";
				accumulator[status] += 1;
				return accumulator;
			},
			{
				needs_action: 0,
				pending_approval: 0,
				done: 0,
				optional: 0,
			},
		);
	}, [documentStatuses, documentTypes]);

	const visibleDocumentTypes = useMemo(() => {
		if (!compactMode) return documentTypes;
		return documentTypes.filter(
			(documentType) => (documentStatuses?.[documentType.id] || "optional") === activeFilter,
		);
	}, [activeFilter, compactMode, documentStatuses, documentTypes]);

	if (isLoading) {
		return (
			<div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-500">
				Loading configured document types...
			</div>
		);
	}

	if (!documentTypes.length) {
		return (
			<>
				{emptyState || (
					<div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
						No document types are configured yet.
					</div>
				)}
			</>
		);
	}

	return (
		<div className="space-y-4">
			<div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-1">
						<h2 className="text-sm font-semibold text-gray-900">{title}</h2>
					</div>

					{compactMode ? (
						<div className="flex flex-wrap gap-2">
							{(
								[
									"needs_action",
									"pending_approval",
									"done",
									"optional",
								] as EmployeeDocumentWorkflowStatus[]
							).map((filter) => {
								const isActive = activeFilter === filter;
								const filterMeta = FILTER_META[filter];
								const FilterIcon = filterMeta.icon;

								return (
									<button
										key={filter}
										type="button"
										onClick={() => onFilterChange?.(filter)}
										className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
											isActive
												? filterMeta.activeClassName
												: filterMeta.idleClassName
										}`}>
										<FilterIcon className="h-3.5 w-3.5" />
										<span>{filterMeta.label}</span>
										<span className="text-xs opacity-90">
											({filterCounts[filter]})
										</span>
									</button>
								);
							})}
						</div>
					) : null}
				</div>
			</div>

			{visibleDocumentTypes.length === 0 ? (
				<div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center">
					<p className="text-sm font-semibold text-gray-900">
						{compactMode
							? FILTER_META[activeFilter].emptyTitle
							: "No document types available"}
					</p>
					{compactMode ? null : (
						<p className="mt-1 text-sm text-gray-500">
							No document types are configured yet.
						</p>
					)}
				</div>
			) : null}

			{visibleDocumentTypes.map((documentType) => {
				const index = documentTypes.findIndex((item) => item.id === documentType.id);
				const docKey = documentType.id;
				const isEnabled = !!enabledDocuments[docKey];
				const documentValue = watch(`employee.documents.${index}`);
				const selectedFileName = fileNames[docKey];
				const documentError = (errors.employee?.documents as any)?.[index];
				const cardErrorMessage = getDocumentCardErrorMessage(documentError);
				const categoryLabel = formatBadgeLabel(documentType.category || "Compliance");
				const status = documentStatuses?.[docKey] || "optional";
				const existingDocument = existingDocuments?.[docKey] || null;
				const summaryChips = buildSummaryChips(existingDocument);
				const autoExpandOptional =
					compactMode && activeFilter === "optional" && status === "optional";
				const isDocumentEnabled = isEnabled || autoExpandOptional;
				const isOptionalCollapsed =
					compactMode && status === "optional" && !isDocumentEnabled;
				const currentFileUrl = documentValue?.fileUrl || existingDocument?.fileUrl;
				const documentReadOnly = disabled || Boolean(isDocumentReadOnly?.(docKey, status));

				if (isOptionalCollapsed) {
					return (
						<CompactOptionalCard
							key={documentType.id}
							documentType={documentType}
							showUploadBy={showUploadBy}
							disabled={disabled}
							onActivateOptional={onActivateOptional}
						/>
					);
				}

				const compactCardTone =
					status === "done"
						? "border-emerald-200 bg-white"
						: status === "needs_action"
							? "border-orange-200 bg-white"
							: "border-gray-200 bg-white";

				return (
					<div
						key={documentType.id}
						data-field-path={`employee.documents.${index}`}
						className={`rounded-lg border p-4 transition-all ${
							cardErrorMessage
								? "border-red-200 bg-white shadow-sm"
								: compactMode
									? compactCardTone
									: isDocumentEnabled
										? "border-orange-200 bg-white shadow-sm"
										: "border-gray-200 bg-gray-50/80"
						}`}>
						<div className="mb-3 flex items-start justify-between gap-3">
							{compactMode ? (
								<div className="space-y-2">
									<div className="flex flex-wrap items-center gap-2">
										<h3 className="text-sm font-semibold text-gray-900">
											{documentType.name}
										</h3>
										<Badge className="bg-blue-50 text-blue-700">
											{categoryLabel}
										</Badge>
										{showUploadBy ? (
											<Badge className="bg-gray-100 text-gray-600">
												Upload by {formatBadgeLabel(documentType.uploadBy)}
											</Badge>
										) : null}
										{status === "done" ? (
											<Badge className="bg-emerald-50 text-emerald-700">
												Compliant
											</Badge>
										) : status === "pending_approval" ? (
											<Badge className="bg-sky-50 text-sky-700">
												Pending approval
											</Badge>
										) : status === "needs_action" ? (
											<Badge className="bg-orange-50 text-orange-700">
												Needs action
											</Badge>
										) : (
											<Badge className="bg-gray-100 text-gray-700">
												Optional
											</Badge>
										)}
									</div>
								</div>
							) : (
								<button
									type="button"
									onClick={() => onToggleDocument?.(docKey)}
									disabled={disabled}
									className="flex items-start gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60">
									{isEnabled ? (
										<CheckSquare2 className="mt-0.5 h-4 w-4 text-orange-600" />
									) : (
										<Square className="mt-0.5 h-4 w-4 text-gray-400" />
									)}
									<div>
										<div className="flex flex-wrap items-center gap-2">
											<h3 className="text-sm font-semibold text-gray-900">
												{documentType.name}
											</h3>
											<span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
												{categoryLabel}
											</span>
											{showUploadBy ? (
												<span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600">
													Upload by{" "}
													{formatBadgeLabel(documentType.uploadBy)}
												</span>
											) : null}
											{!isEnabled && showSkippedHint ? (
												<span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
													Not included
												</span>
											) : null}
										</div>
									</div>
								</button>
							)}

							<div className="flex items-center gap-2 text-[11px] text-gray-500">
								{compactMode &&
								status === "pending_approval" &&
								onReviewPendingApproval ? (
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="h-8 border-sky-200 text-sky-700 hover:bg-sky-50"
										disabled={disabled}
										onClick={() => onReviewPendingApproval(documentType.id)}>
										<FileText className="mr-1 h-3.5 w-3.5" />
										Review approval
									</Button>
								) : null}
								{compactMode &&
								status === "optional" &&
								(activeOptionalDocuments?.[docKey] ||
									activeFilter === "optional") &&
								onCancelOptional ? (
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="h-8 px-2 text-gray-600 hover:text-orange-700"
										disabled={disabled}
										onClick={() => onCancelOptional(docKey)}>
										<X className="h-4 w-4" />
										Cancel
									</Button>
								) : null}
								{!compactMode ? (isDocumentEnabled ? "Included" : "Skipped") : null}
							</div>
						</div>

						{cardErrorMessage ? (
							<div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
								{cardErrorMessage}
							</div>
						) : null}

						{!compactMode && !isDocumentEnabled && showSkippedHint ? (
							<div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
								{skippedHintText}
							</div>
						) : null}

						{compactMode && renderDocumentOperationalFields ? (
							<div className="mb-3">
								{renderDocumentOperationalFields(docKey, status)}
							</div>
						) : null}

						{compactMode && status === "done" && summaryChips.length > 0 ? (
							<div className="mb-3 flex flex-wrap gap-2">
								{summaryChips.map((chip) => (
									<div
										key={chip.key}
										className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
										{chip.icon}
										<span className="text-emerald-700">{chip.label}:</span>
										<span>{chip.value}</span>
									</div>
								))}
							</div>
						) : null}
						{compactMode && renderDocumentMeta ? (
							<div className="mb-3">{renderDocumentMeta(docKey)}</div>
						) : null}

						{isDocumentEnabled ? (
							<div className="space-y-3">
								<input
									type="hidden"
									{...register(`employee.documents.${index}.documentTypeId`)}
									value={documentType.id}
								/>
								<input
									type="hidden"
									{...register(`employee.documents.${index}.type`)}
									value={documentType.code}
								/>
								<input
									type="hidden"
									{...register(`employee.documents.${index}.name`)}
									value={documentType.name}
								/>

								{(documentType.fields || []).length ? (
									<div className="grid gap-3 md:grid-cols-2">
										{documentType.fields.map((field) => {
											const fieldPath = RESERVED_DOCUMENT_FIELDS.has(
												field.key,
											)
												? `employee.documents.${index}.${field.key}`
												: `employee.documents.${index}.fieldValues.${field.key}`;
											const validationHint = getDocumentFieldValidationHint(
												field.validation,
											);

											return (
												<div key={field.key} data-field-path={fieldPath}>
													<Controller
														name={fieldPath as any}
														control={control}
														rules={{
															validate: (fieldValue) =>
																validateDocumentFieldValue(
																	field,
																	fieldValue,
																),
														}}
														render={({
															field: controlledField,
															fieldState,
														}) => (
															<DynamicFormField
																config={
																	{
																		name: field.key,
																		label: field.label,
																		type: getDynamicFieldType(
																			field,
																		),
																		required: !!field.required,
																		placeholder:
																			field.placeholder ||
																			undefined,
																		options:
																			field.type === "select"
																				? (
																						field.options ||
																						[]
																					).map(
																						(
																							option,
																						) => ({
																							label: option.label,
																							value: option.value,
																						}),
																					)
																				: undefined,
																		accept:
																			field.type === "file"
																				? EMPLOYEE_DOCUMENT_ACCEPT
																				: undefined,
																		allowedExtensions:
																			field.type === "file"
																				? EMPLOYEE_DOCUMENT_ALLOWED_EXTENSIONS
																				: undefined,
																		minDate:
																			field.type === "date"
																				? MIN_ALLOWED_DATE
																				: undefined,
																		maxDate:
																			field.type === "date"
																				? MAX_ALLOWED_DATE
																				: undefined,
																		maxSize:
																			field.type === "file"
																				? EMPLOYEE_DOCUMENT_MAX_SIZE_MB
																				: undefined,
																		constraintTokens:
																			validationHint
																				? [
																						{
																							label: validationHint,
																							isMet:
																								String(
																									controlledField.value ??
																										"",
																								).trim() ===
																								""
																									? undefined
																									: validateDocumentFieldValue(
																											field,
																											controlledField.value,
																										) ===
																										true,
																						},
																					]
																				: undefined,
																	} as any
																}
																value={controlledField.value as any}
																onChange={(nextValue) => {
																	controlledField.onChange(
																		nextValue,
																	);
																	void trigger(fieldPath as any);
																}}
																onBlur={() => {
																	controlledField.onBlur();
																	void trigger(fieldPath as any);
																}}
																error={fieldState.error?.message}
																touched={
																	fieldState.isTouched ||
																	fieldState.isDirty
																}
																disabled={documentReadOnly}
																compact
															/>
														)}
													/>
												</div>
											);
										})}
									</div>
								) : null}

								<div
									className="space-y-2.5"
									data-field-path={`employee.documents.${index}.fileUrl`}>
									<label className="block text-sm font-medium text-gray-700">
										File
									</label>
									{currentFileUrl && !documentFiles[docKey] ? (
										<a
											href={currentFileUrl}
											target="_blank"
											rel="noreferrer"
											className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
											<FileText className="h-4 w-4" />
											View current file
										</a>
									) : null}
									<div className="flex items-center gap-2.5">
										<label className="flex-1 cursor-pointer">
											<div className="flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-600 transition hover:border-orange-300 hover:bg-orange-50">
												<Upload className="h-4 w-4" />
												<span className="truncate">
													{selectedFileName || "Choose PDF, JPG, or PNG"}
												</span>
											</div>
											<input
												type="file"
												accept={EMPLOYEE_DOCUMENT_ACCEPT}
												className="hidden"
												disabled={documentReadOnly}
												onChange={(event) =>
													handleFileChange(docKey, event)
												}
											/>
										</label>
										{selectedFileName ? (
											<button
												type="button"
												onClick={() => removeFile(docKey)}
												disabled={documentReadOnly}
												className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60">
												<X className="h-4 w-4" />
											</button>
										) : null}
									</div>
								</div>
							</div>
						) : null}
					</div>
				);
			})}
		</div>
	);
}
