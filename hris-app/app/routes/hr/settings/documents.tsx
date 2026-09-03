import { useEffect, useMemo, useState } from "react";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import {
	CategoricalText,
	formatCategoricalTextLabel,
	type CategoricalTextTone,
} from "~/components/atoms/CategoricalText";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Select } from "~/components/atoms/Select";
import { ConfigurationEmptyGuide } from "~/components/molecules/ConfigurationEmptyGuide";
import { ConstraintTokenRow } from "~/components/molecules/ConstraintTokens";
import { HR_MODAL_STANDARD_CLASS, HR_MODAL_WIDE_CLASS } from "~/lib/ui/admin-configuration-modal";
import {
	AdminConfigChip,
	AdminConfigStatusBadge,
	formatAdminConfigChipLabel,
} from "~/lib/ui/admin-configuration-table";
import { useAuth } from "~/lib/hooks/use-auth";
import {
	useCreateDocumentType,
	useDeleteDocumentType,
	useDocumentType,
	useDocumentTypes,
	useUpdateDocumentType,
} from "~/lib/hooks/useDocumentTypes";
import type { DocumentType, DocumentTypeField } from "~/services/document-types.service";
import { ArrowUpRight, Eye, Loader2, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { DOCUMENT_FIELD_VALIDATION_PRESET_OPTIONS } from "~/lib/utils/document-field-validation";

type DocumentTypeFieldDraft = DocumentTypeField & { uid: string };
type DocumentTypeFieldValidationDraft = NonNullable<DocumentTypeFieldDraft["validation"]>;

type DocumentRuleMetadataDraft = {
	priorityLevel: "HIGH" | "MEDIUM" | "LOW";
	requiredForPayroll: boolean;
	requiredForOnboarding: boolean;
	requireFileForCompliance: boolean;
	requiredForDepartments: string;
	requiredForPositions: string;
	requiredForEmploymentTypes: string;
	requiredForRoles: string;
};

type DocumentTypeDraft = {
	organizationId: string;
	code: string;
	name: string;
	category: string;
	uploadBy: "HR" | "EMPLOYEE" | "BOTH";
	isRequired: boolean;
	isEmployeeVisible: boolean;
	isActive: boolean;
	displayOrder: number;
	fields: DocumentTypeFieldDraft[];
	metadata: DocumentRuleMetadataDraft;
};

const categoryOptions = [
	{ value: "COMPLIANCE", label: "Compliance" },
	{ value: "ONBOARDING", label: "Onboarding" },
	{ value: "PAYROLL", label: "Payroll" },
	{ value: "LEGAL", label: "Legal" },
	{ value: "OTHER", label: "Other" },
];

const uploadByOptions = [
	{ value: "HR", label: "HR Only" },
	{ value: "EMPLOYEE", label: "Employee Only" },
	{ value: "BOTH", label: "HR + Employee" },
];

const fieldTypeOptions = [
	{ value: "text", label: "Text" },
	{ value: "number", label: "Number" },
	{ value: "date", label: "Date" },
	{ value: "select", label: "Select" },
	{ value: "boolean", label: "Boolean" },
	{ value: "file", label: "File / Image" },
];

const createEmptyField = (): DocumentTypeFieldDraft => ({
	uid: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
	key: "",
	label: "",
	type: "text",
	required: false,
	helperText: "",
	placeholder: "",
	options: [],
	validation: null,
});

const createEmptyDraft = (organizationId: string): DocumentTypeDraft => ({
	organizationId,
	code: "",
	name: "",
	category: "COMPLIANCE",
	uploadBy: "HR",
	isRequired: false,
	isEmployeeVisible: true,
	isActive: true,
	displayOrder: 0,
	fields: [],
	metadata: {
		priorityLevel: "MEDIUM",
		requiredForPayroll: false,
		requiredForOnboarding: false,
		requireFileForCompliance: false,
		requiredForDepartments: "",
		requiredForPositions: "",
		requiredForEmploymentTypes: "",
		requiredForRoles: "",
	},
});

const parseMetadataScope = (value: unknown) => {
	if (!value) return "";
	if (Array.isArray(value)) {
		return value
			.map((item) => String(item || "").trim())
			.filter(Boolean)
			.join(", ");
	}
	if (typeof value === "string") return value;
	return "";
};

const parseMetadataBoolean = (value: unknown) => value === true || value === "true";

const toMetadataDraft = (metadata: unknown): DocumentRuleMetadataDraft => {
	const record =
		metadata && typeof metadata === "object" && !Array.isArray(metadata)
			? (metadata as Record<string, unknown>)
			: {};
	const rawPriority = String(record.priorityLevel || record.priority || "MEDIUM")
		.trim()
		.toUpperCase();
	const priorityLevel = rawPriority === "HIGH" || rawPriority === "LOW" ? rawPriority : "MEDIUM";

	return {
		priorityLevel: priorityLevel as "HIGH" | "MEDIUM" | "LOW",
		requiredForPayroll: parseMetadataBoolean(record.requiredForPayroll),
		requiredForOnboarding: parseMetadataBoolean(record.requiredForOnboarding),
		requireFileForCompliance: parseMetadataBoolean(record.requireFileForCompliance),
		requiredForDepartments: parseMetadataScope(
			record.requiredForDepartments || record.departments || record.departmentIds,
		),
		requiredForPositions: parseMetadataScope(
			record.requiredForPositions || record.positions || record.positionIds,
		),
		requiredForEmploymentTypes: parseMetadataScope(
			record.requiredForEmploymentTypes || record.employmentTypes,
		),
		requiredForRoles: parseMetadataScope(record.requiredForRoles || record.roles),
	};
};

const parseScopeInput = (value: string) =>
	value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);

const getPriorityTone = (priority: DocumentRuleMetadataDraft["priorityLevel"]): CategoricalTextTone => {
	if (priority === "HIGH") return "red";
	if (priority === "LOW") return "slate";
	return "amber";
};

const toDraft = (documentType: DocumentType, organizationId: string): DocumentTypeDraft => ({
	organizationId,
	code: documentType.code || "",
	name: documentType.name || "",
	category: documentType.category || "COMPLIANCE",
	uploadBy: documentType.uploadBy || "HR",
	isRequired: !!documentType.isRequired,
	isEmployeeVisible: !!documentType.isEmployeeVisible,
	isActive: !!documentType.isActive,
	displayOrder: Number(documentType.displayOrder || 0),
	fields: (documentType.fields || []).map((field) => ({
		...field,
		uid: `${field.key}_${Math.random().toString(36).slice(2, 7)}`,
		options: field.options || [],
	})),
	metadata: toMetadataDraft(documentType.metadata),
});

const toPayload = (draft: DocumentTypeDraft) => ({
	organizationId: draft.organizationId,
	code: draft.code.trim(),
	name: draft.name.trim(),
	category: draft.category || null,
	uploadBy: draft.uploadBy,
	isRequired: draft.isRequired,
	isEmployeeVisible: draft.isEmployeeVisible,
	isActive: draft.isActive,
	displayOrder: Number(draft.displayOrder || 0),
	metadata: {
		priorityLevel: draft.metadata.priorityLevel,
		requiredForPayroll: draft.metadata.requiredForPayroll,
		requiredForOnboarding: draft.metadata.requiredForOnboarding,
		requireFileForCompliance: draft.metadata.requireFileForCompliance,
		requiredForDepartments: parseScopeInput(draft.metadata.requiredForDepartments),
		requiredForPositions: parseScopeInput(draft.metadata.requiredForPositions),
		requiredForEmploymentTypes: parseScopeInput(draft.metadata.requiredForEmploymentTypes),
		requiredForRoles: parseScopeInput(draft.metadata.requiredForRoles),
	},
	fields: draft.fields.map(({ uid, ...field }) => ({
		...field,
		key: field.key.trim(),
		label: field.label.trim(),
		helperText: field.helperText?.trim() || null,
		placeholder: field.placeholder?.trim() || null,
		validation:
			field.validation?.preset || field.validation?.pattern
				? {
						preset: field.validation?.preset || null,
						pattern: field.validation?.pattern?.trim() || null,
						message: field.validation?.message?.trim() || null,
						normalize: field.validation?.normalize || "digits",
						minLength: field.validation?.minLength || null,
						maxLength: field.validation?.maxLength || null,
						allowHyphens: field.validation?.allowHyphens ?? true,
					}
				: null,
		options:
			field.type === "select" ? (field.options || []).filter((option) => option.value) : [],
	})),
});

export default function HRDocumentSetupPage() {
	const { user } = useAuth();
	const [searchParams, setSearchParams] = useSearchParams();
	const organizationId = user?.organizationId || user?.organization?.id || "";
	const action = searchParams.get("action");
	const id = searchParams.get("id") || "";
	const searchQuery = searchParams.get("search") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const sortParam = searchParams.get("sort") || "displayOrder";
	const orderParam = searchParams.get("order") === "desc" ? "desc" : "asc";
	const [draft, setDraft] = useState<DocumentTypeDraft>(() => createEmptyDraft(organizationId));
	const [formError, setFormError] = useState("");

	const { data, isLoading } = useDocumentTypes(
		{
			page: pageParam,
			limit: limitParam,
			query: searchQuery,
			sort: sortParam,
			order: orderParam,
		},
		{ enabled: !!organizationId },
	);
	const documentTypes = useMemo(() => data?.documentTypes || [], [data?.documentTypes]);
	const totalItems = data?.count || data?.pagination?.total;
	const { data: activeDocumentType, isLoading: isLoadingActiveDocumentType } = useDocumentType(
		action && action !== "create" ? id : "",
	);
	const createDocumentType = useCreateDocumentType();
	const updateDocumentType = useUpdateDocumentType();
	const deleteDocumentType = useDeleteDocumentType();

	const closeModal = () => {
		setSearchParams((prev) => {
			const params = new URLSearchParams(prev);
			params.delete("action");
			params.delete("id");
			return params;
		});
		setFormError("");
	};

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const openAction = (nextAction: string, nextId?: string) => {
		if (organizationId && nextAction === "create") {
			setDraft(createEmptyDraft(organizationId));
			setFormError("");
		}
		if (organizationId && nextId && (nextAction === "edit" || nextAction === "view")) {
			const existingDocumentType = documentTypes.find((item) => item.id === nextId);
			if (existingDocumentType) {
				setDraft(toDraft(existingDocumentType, organizationId));
				setFormError("");
			}
		}
		updateSearchParams((params) => {
			params.set("action", nextAction);
			if (nextId) params.set("id", nextId);
			else params.delete("id");
		});
	};

	const handleSearch = (query: string) => {
		updateSearchParams((next) => {
			if (query) next.set("search", query);
			else next.delete("search");
			next.set("page", "1");
		});
	};

	const handlePageChange = (page: number) => {
		updateSearchParams((next) => {
			next.set("page", page.toString());
		});
	};

	const handleSort = (key: string, direction: "asc" | "desc") => {
		updateSearchParams((next) => {
			next.set("sort", key);
			next.set("order", direction);
			next.set("page", "1");
		});
	};

	useEffect(() => {
		if (!organizationId) return;
		if (action === "create") {
			setDraft(createEmptyDraft(organizationId));
			setFormError("");
			return;
		}
		if (activeDocumentType) {
			setDraft(toDraft(activeDocumentType, organizationId));
			setFormError("");
		}
	}, [action, activeDocumentType, organizationId]);

	const updateDraft = <K extends keyof DocumentTypeDraft>(
		key: K,
		value: DocumentTypeDraft[K],
	) => {
		setDraft((prev) => ({ ...prev, [key]: value }));
	};

	const updateField = (
		fieldUid: string,
		key: keyof DocumentTypeFieldDraft,
		value: DocumentTypeFieldDraft[keyof DocumentTypeFieldDraft],
	) => {
		setDraft((prev) => ({
			...prev,
			fields: prev.fields.map((field) =>
				field.uid === fieldUid ? { ...field, [key]: value } : field,
			),
		}));
	};

	const addField = () => {
		setDraft((prev) => ({ ...prev, fields: [...prev.fields, createEmptyField()] }));
	};

	const removeField = (fieldUid: string) => {
		setDraft((prev) => ({
			...prev,
			fields: prev.fields.filter((field) => field.uid !== fieldUid),
		}));
	};

	const addFieldOption = (fieldUid: string) => {
		setDraft((prev) => ({
			...prev,
			fields: prev.fields.map((field) =>
				field.uid === fieldUid
					? {
							...field,
							options: [...(field.options || []), { label: "", value: "" }],
						}
					: field,
			),
		}));
	};

	const updateFieldValidation = (
		fieldUid: string,
		key: keyof DocumentTypeFieldValidationDraft,
		value: unknown,
	) => {
		setDraft((prev) => ({
			...prev,
			fields: prev.fields.map((field) =>
				field.uid === fieldUid
					? {
							...field,
							validation: {
								...(field.validation || {
									normalize: "digits",
									allowHyphens: true,
								}),
								[key]: value,
							},
						}
					: field,
			),
		}));
	};

	const updateFieldOption = (
		fieldUid: string,
		index: number,
		key: "label" | "value",
		value: string,
	) => {
		setDraft((prev) => ({
			...prev,
			fields: prev.fields.map((field) =>
				field.uid === fieldUid
					? {
							...field,
							options: (field.options || []).map((option, optionIndex) =>
								optionIndex === index ? { ...option, [key]: value } : option,
							),
						}
					: field,
			),
		}));
	};

	const removeFieldOption = (fieldUid: string, index: number) => {
		setDraft((prev) => ({
			...prev,
			fields: prev.fields.map((field) =>
				field.uid === fieldUid
					? {
							...field,
							options: (field.options || []).filter(
								(_, optionIndex) => optionIndex !== index,
							),
						}
					: field,
			),
		}));
	};

	const validateDraft = () => {
		// schema-equivalent validation for this dynamic document-field builder.
		if (!draft.code.trim() || !draft.name.trim()) {
			return "Code and name are required.";
		}
		const invalidField = draft.fields.find((field) => !field.key.trim() || !field.label.trim());
		if (invalidField) {
			return "Each custom field needs both a key and label.";
		}
		const fieldKeys = draft.fields.map((field) => field.key.trim().toLowerCase());
		if (new Set(fieldKeys).size !== fieldKeys.length) {
			return "Custom field keys must be unique.";
		}
		const invalidSelect = draft.fields.find(
			(field) =>
				field.type === "select" &&
				(field.options || []).some(
					(option) => !option.label.trim() || !option.value.trim(),
				),
		);
		if (invalidSelect) {
			return "Select fields need complete option labels and values.";
		}
		return "";
	};

	const handleSave = async () => {
		const nextError = validateDraft();
		if (nextError) {
			setFormError(nextError);
			return;
		}

		const payload = toPayload(draft);
		if (action === "edit" && id) {
			await updateDocumentType.mutateAsync({ id, payload });
		} else {
			await createDocumentType.mutateAsync(payload);
		}
		closeModal();
	};

	const handleDelete = async () => {
		if (!id) return;
		await deleteDocumentType.mutateAsync(id);
		closeModal();
	};

	const columns: Column<DocumentType>[] = [
		{
			key: "name",
			label: "Document Type",
			width: "260px",
			sortable: true,
			required: true,
			priority: "critical",
			render: (_value, item) => {
				const metadata = toMetadataDraft(item.metadata);
				return (
					<div className="space-y-1">
						<span
							className="block truncate font-semibold text-gray-900"
							title={item.name}>
							{item.name}
						</span>
						<div className="flex flex-wrap items-center gap-2">
							<CategoricalText
								value={metadata.priorityLevel}
								tone={getPriorityTone(metadata.priorityLevel)}
							/>
							{metadata.requiredForPayroll ? (
								<CategoricalText value="Payroll Mandated" tone="red" />
							) : null}
							{metadata.requiredForOnboarding ? (
								<CategoricalText value="Onboarding Mandated" tone="orange" />
							) : null}
							{metadata.requireFileForCompliance ? (
								<CategoricalText value="File Required" tone="blue" />
							) : null}
						</div>
					</div>
				);
			},
		},
		{
			key: "category",
			label: "Category",
			width: "140px",
			priority: "high",
			render: (_value, item) => (
				<AdminConfigChip kind="category">
					{formatAdminConfigChipLabel(item.category)}
				</AdminConfigChip>
			),
		},
		{
			key: "fields",
			label: "Fields",
			width: "140px",
			priority: "medium",
			hideBelow: "lg",
			render: (_value, item) => (
				<div className="text-sm text-gray-600">
					{item.fields?.length
						? `${item.fields.length} custom field${item.fields.length > 1 ? "s" : ""}`
						: "File-only"}
				</div>
			),
		},
		{
			key: "isActive",
			label: "Status",
			width: "110px",
			sortable: true,
			required: true,
			priority: "critical",
			render: (_value, item) => (
				<CategoricalText
					value={item.isActive ? "Active" : "Archived"}
					tone={item.isActive ? "green" : "slate"}
				/>
			),
		},
	];

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<DataTable
				title="201 Document Types"
				data={documentTypes}
				columns={columns}
				searchFields={["name", "code"] as any}
				isLoading={isLoading}
				emptyMessage="No 201 document types yet"
				emptyDescription="Add a document type to define employee 201 file requirements."
				emptyActions={
					<ConfigurationEmptyGuide
						label="Add document type"
						to="/admin/configuration/document-201-types?action=create"
					/>
				}
				onAdd={() => openAction("create")}
				addButtonLabel="Add"
				searchWidth="w-80"
				searchPlaceholder="Search document types..."
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={totalItems}
				onSearch={handleSearch}
				onPageChange={handlePageChange}
				onSort={handleSort}
				sortKey={sortParam}
				sortDirection={orderParam}
				searchValue={searchQuery || ""}
				renderActions={(item) => (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" size="sm" className="h-8 w-8 p-0">
								<MoreVertical className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-48">
							<DropdownMenuItem onClick={() => openAction("view", item.id)}>
								<Eye className="mr-2 h-4 w-4" />
								View Details
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => openAction("edit", item.id)}>
								<Pencil className="mr-2 h-4 w-4" />
								Edit
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => openAction("delete", item.id)}
								className="text-red-600 focus:text-red-600">
								<Trash2 className="mr-2 h-4 w-4" />
								Archive
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
				containedScroll
			/>

			<Modal
				open={action === "create" || action === "edit" || action === "view"}
				onOpenChange={(open) => {
					if (!open) closeModal();
				}}
				title={
					action === "create"
						? "Create Document Type"
						: action === "edit"
							? "Edit Document Type"
							: "Document Type Details"
				}
				className={HR_MODAL_WIDE_CLASS}>
				{(action === "edit" || action === "view") && isLoadingActiveDocumentType ? (
					<div className="flex items-center gap-2 py-10 text-sm text-gray-500">
						<Loader2 className="h-4 w-4 animate-spin" />
						Loading document type details...
					</div>
				) : (
					<div className="space-y-5">
						<div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
							<div className="rounded-xl border border-slate-200 bg-white p-4">
								<div className="grid gap-3 md:grid-cols-2">
									<div data-field-path="code">
										<label className="mb-1.5 block text-sm font-medium text-gray-700">
											Code
										</label>
										<Input
											value={draft.code}
											onChange={(e) =>
												updateDraft("code", e.target.value.toUpperCase())
											}
											disabled={action === "view"}
											placeholder="TIN"
										/>
										<ConstraintTokenRow
											tokens={[
												{ label: "1+" },
												{ label: "Uppercase" },
												{ label: "Unique" },
											]}
										/>
									</div>
									<div data-field-path="name">
										<label className="mb-1.5 block text-sm font-medium text-gray-700">
											Name
										</label>
										<Input
											value={draft.name}
											onChange={(e) => updateDraft("name", e.target.value)}
											disabled={action === "view"}
											placeholder="Tax Identification Number"
										/>
										<ConstraintTokenRow
											tokens={[{ label: "1+" }, { label: "Employee-facing" }]}
										/>
									</div>
									<div data-field-path="category">
										<label className="mb-1.5 block text-sm font-medium text-gray-700">
											Category
										</label>
										<Select
											options={categoryOptions}
											value={draft.category}
											onChange={(value) => updateDraft("category", value)}
											disabled={action === "view"}
										/>
									</div>
									<div data-field-path="uploadBy">
										<label className="mb-1.5 block text-sm font-medium text-gray-700">
											Upload By
										</label>
										<Select
											options={uploadByOptions}
											value={draft.uploadBy}
											onChange={(value) =>
												updateDraft(
													"uploadBy",
													value as DocumentTypeDraft["uploadBy"],
												)
											}
											disabled={action === "view"}
										/>
									</div>
									<div data-field-path="displayOrder">
										<label className="mb-1.5 block text-sm font-medium text-gray-700">
											Display Order
										</label>
										<Input
											type="number"
											value={String(draft.displayOrder)}
											onChange={(e) =>
												updateDraft(
													"displayOrder",
													Number(e.target.value || 0),
												)
											}
											disabled={action === "view"}
										/>
										<ConstraintTokenRow tokens={[{ label: "0+" }]} />
									</div>
								</div>
							</div>

							<div className="rounded-xl border border-slate-200 bg-white p-4">
								<div className="grid gap-2.5">
									{[
										{ key: "isRequired", label: "Required for compliance" },
										{
											key: "isEmployeeVisible",
											label: "Show in employee document flows",
										},
										{ key: "isActive", label: "Active" },
									].map((item) => (
										<label
											key={item.key}
											className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
											<div>
												<p className="text-sm font-medium text-gray-800">
													{item.label}
												</p>
											</div>
											<input
												type="checkbox"
												checked={Boolean(
													draft[item.key as keyof DocumentTypeDraft],
												)}
												disabled={action === "view"}
												onChange={(e) =>
													updateDraft(
														item.key as keyof DocumentTypeDraft,
														e.target.checked as never,
													)
												}
												className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
											/>
										</label>
									))}
								</div>
								<div className="mt-3 grid gap-2.5">
									<div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
										<label className="mb-1.5 block text-sm font-medium text-gray-800">
											Priority Level
										</label>
										<Select
											options={[
												{ value: "HIGH", label: "High" },
												{ value: "MEDIUM", label: "Medium" },
												{ value: "LOW", label: "Low" },
											]}
											value={draft.metadata.priorityLevel}
											onChange={(value) =>
												updateDraft("metadata", {
													...draft.metadata,
													priorityLevel: value as
														| "HIGH"
														| "MEDIUM"
														| "LOW",
												})
											}
											disabled={action === "view"}
										/>
									</div>
									{[
										{
											key: "requiredForPayroll",
											label: "Mandated for payroll processing",
										},
										{
											key: "requiredForOnboarding",
											label: "Mandated during onboarding",
										},
										{
											key: "requireFileForCompliance",
											label: "Require uploaded file for compliance",
										},
									].map((item) => (
										<label
											key={item.key}
											className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
											<p className="text-sm font-medium text-gray-800">
												{item.label}
											</p>
											<input
												type="checkbox"
												checked={Boolean(
													draft.metadata[
														item.key as keyof DocumentRuleMetadataDraft
													],
												)}
												disabled={action === "view"}
												onChange={(event) =>
													updateDraft("metadata", {
														...draft.metadata,
														[item.key]: event.target.checked,
													})
												}
												className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
											/>
										</label>
									))}
								</div>
							</div>
						</div>

						<div className="rounded-xl border border-slate-200 bg-white p-4">
							<div className="mb-3 flex items-center justify-between">
								<h2 className="text-sm font-semibold text-gray-900">
									Custom Fields
								</h2>
								{action !== "view" && (
									<Button variant="outline" onClick={addField}>
										<Plus className="mr-2 h-4 w-4" />
										Add Field
									</Button>
								)}
							</div>

							<div className="space-y-4">
								{draft.fields.length === 0 ? (
									<div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
										File-only document type for now. Add custom fields if this
										document needs structured metadata.
									</div>
								) : (
									draft.fields.map((field, fieldIndex) => (
										<div
											key={field.uid}
											className="rounded-lg border border-gray-200 bg-gray-50 p-3.5">
											<div className="mb-3 flex items-center justify-between">
												<div className="text-sm font-semibold text-gray-800">
													Field {fieldIndex + 1}
												</div>
												{action !== "view" && (
													<Button
														variant="ghost"
														size="sm"
														onClick={() => removeField(field.uid)}>
														<Trash2 className="mr-2 h-4 w-4 text-red-500" />
														Remove
													</Button>
												)}
											</div>
											<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_220px_150px]">
												<div data-field-path={`fields.${fieldIndex}.key`}>
													<label className="mb-1.5 block text-sm font-medium text-gray-700">
														Key
													</label>
													<Input
														value={field.key}
														onChange={(e) =>
															updateField(
																field.uid,
																"key",
																e.target.value,
															)
														}
														disabled={action === "view"}
														placeholder="expiryDate"
													/>
													<ConstraintTokenRow
														tokens={[
															{ label: "1+" },
															{ label: "camelCase" },
														]}
													/>
												</div>
												<div data-field-path={`fields.${fieldIndex}.label`}>
													<label className="mb-1.5 block text-sm font-medium text-gray-700">
														Label
													</label>
													<Input
														value={field.label}
														onChange={(e) =>
															updateField(
																field.uid,
																"label",
																e.target.value,
															)
														}
														disabled={action === "view"}
														placeholder="Expiry Date"
													/>
													<ConstraintTokenRow
														tokens={[{ label: "1+" }]}
													/>
												</div>
												<div>
													<label className="mb-1.5 block text-sm font-medium text-gray-700">
														Field Type
													</label>
													<Select
														options={fieldTypeOptions}
														value={field.type}
														onChange={(value) =>
															updateField(
																field.uid,
																"type",
																value as DocumentTypeFieldDraft["type"],
															)
														}
														disabled={action === "view"}
													/>
												</div>
												<div className="flex items-end">
													<label className="flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3">
														<input
															type="checkbox"
															checked={!!field.required}
															disabled={action === "view"}
															onChange={(e) =>
																updateField(
																	field.uid,
																	"required",
																	e.target.checked,
																)
															}
															className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
														/>
														<span className="text-sm text-gray-700">
															Required
														</span>
													</label>
												</div>
												<div className="md:col-span-2">
													<label className="mb-1.5 block text-sm font-medium text-gray-700">
														Placeholder
													</label>
													<Input
														value={field.placeholder || ""}
														onChange={(e) =>
															updateField(
																field.uid,
																"placeholder",
																e.target.value,
															)
														}
														disabled={action === "view"}
													/>
												</div>
												<div className="md:col-span-2">
													<label className="mb-1.5 block text-sm font-medium text-gray-700">
														Helper Text
													</label>
													<Input
														value={field.helperText || ""}
														onChange={(e) =>
															updateField(
																field.uid,
																"helperText",
																e.target.value,
															)
														}
														disabled={action === "view"}
													/>
												</div>
											</div>

											{field.type === "select" && (
												<div className="mt-3 rounded-lg border border-white bg-white p-3">
													<div className="mb-2.5 flex items-center justify-between">
														<p className="text-sm font-medium text-gray-800">
															Select Options
														</p>
														{action !== "view" && (
															<Button
																variant="outline"
																size="sm"
																onClick={() =>
																	addFieldOption(field.uid)
																}>
																<Plus className="mr-2 h-4 w-4" />
																Add Option
															</Button>
														)}
													</div>
													<div className="space-y-2.5">
														{(field.options || []).map(
															(option, optionIndex) => (
																<div
																	key={`${field.uid}_${optionIndex}`}
																	className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
																	<Input
																		value={option.label}
																		onChange={(e) =>
																			updateFieldOption(
																				field.uid,
																				optionIndex,
																				"label",
																				e.target.value,
																			)
																		}
																		disabled={action === "view"}
																		placeholder="Regular"
																	/>
																	<Input
																		value={option.value}
																		onChange={(e) =>
																			updateFieldOption(
																				field.uid,
																				optionIndex,
																				"value",
																				e.target.value,
																			)
																		}
																		disabled={action === "view"}
																		placeholder="regular"
																	/>
																	{action !== "view" && (
																		<Button
																			variant="ghost"
																			size="sm"
																			onClick={() =>
																				removeFieldOption(
																					field.uid,
																					optionIndex,
																				)
																			}>
																			<Trash2 className="h-4 w-4 text-red-500" />
																		</Button>
																	)}
																</div>
															),
														)}
													</div>
												</div>
											)}
											{field.type === "text" || field.key === "number" ? (
												<div className="mt-3 rounded-lg border border-white bg-white p-3">
													<div className="mb-2.5 text-sm font-medium text-gray-800">
														Format Rule
													</div>
													<div className="grid gap-3 md:grid-cols-2">
														<div>
															<label className="mb-1.5 block text-sm font-medium text-gray-700">
																Validation Preset
															</label>
															<Select
																options={[
																	...DOCUMENT_FIELD_VALIDATION_PRESET_OPTIONS,
																]}
																value={
																	field.validation?.preset || ""
																}
																onChange={(value) =>
																	updateFieldValidation(
																		field.uid,
																		"preset",
																		value || null,
																	)
																}
																disabled={action === "view"}
															/>
														</div>
														<div>
															<label className="mb-1.5 block text-sm font-medium text-gray-700">
																Error Message
															</label>
															<Input
																value={
																	field.validation?.message || ""
																}
																onChange={(e) =>
																	updateFieldValidation(
																		field.uid,
																		"message",
																		e.target.value,
																	)
																}
																disabled={action === "view"}
																placeholder="Use the required ID number format."
															/>
														</div>
														{field.validation?.preset === "CUSTOM" ? (
															<div className="md:col-span-2">
																<label className="mb-1.5 block text-sm font-medium text-gray-700">
																	Regex Pattern
																</label>
																<Input
																	value={
																		field.validation?.pattern ||
																		""
																	}
																	onChange={(e) =>
																		updateFieldValidation(
																			field.uid,
																			"pattern",
																			e.target.value,
																		)
																	}
																	disabled={action === "view"}
																	placeholder="^\\d{10}$"
																/>
															</div>
														) : null}
													</div>
												</div>
											) : null}
										</div>
									))
								)}
							</div>
						</div>

						{formError ? (
							<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
								{formError}
							</div>
						) : null}

						<div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
							<Button variant="outline" onClick={closeModal}>
								Close
							</Button>
							{action !== "view" && (
								<Button
									onClick={handleSave}
									disabled={
										createDocumentType.isPending || updateDocumentType.isPending
									}>
									{createDocumentType.isPending ||
									updateDocumentType.isPending ? (
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									) : (
										<ArrowUpRight className="mr-2 h-4 w-4" />
									)}
									{action === "edit" ? "Save Changes" : "Create Document Type"}
								</Button>
							)}
						</div>
					</div>
				)}
			</Modal>

			<Modal
				open={action === "delete"}
				onOpenChange={(open) => {
					if (!open) closeModal();
				}}
				title="Archive Document Type"
				className={HR_MODAL_STANDARD_CLASS}>
				<div className="space-y-5">
					<div className="rounded-xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm text-orange-800">
						The document type will become inactive and hidden from future setup flows,
						while existing employee documents stay preserved.
					</div>
					<div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
						<Button variant="outline" onClick={closeModal}>
							Cancel
						</Button>
						<Button
							onClick={handleDelete}
							variant="destructive"
							disabled={deleteDocumentType.isPending}>
							{deleteDocumentType.isPending ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<Trash2 className="mr-2 h-4 w-4" />
							)}
							Archive Type
						</Button>
					</div>
				</div>
			</Modal>
		</div>
	);
}
