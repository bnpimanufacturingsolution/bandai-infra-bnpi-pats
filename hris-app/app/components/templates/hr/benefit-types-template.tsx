import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { createTruncatedTextProps } from "~/lib/utils/text-utils";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { Badge } from "~/components/atoms/Badge";
import {
	CategoricalText,
	formatCategoricalTextLabel,
} from "~/components/atoms/CategoricalText";
import { ConstraintTokenRow } from "~/components/molecules/ConstraintTokens";
import { ConfigurationEmptyGuide } from "~/components/molecules/ConfigurationEmptyGuide";
import { GenericImportModal } from "~/components/organisms/shared/GenericImportModal";
import { Eye, Edit, Trash2, MoreVertical, Loader2, Check, X, Coins } from "lucide-react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router-dom";
import { toast as sonnerToast } from "sonner";
import { useAuth } from "~/lib/hooks/use-auth";
import {
	type BenefitType,
	BenefitCategory,
	BenefitPayrollDirection,
	type CreateBenefitTypeRequest,
	type UpdateBenefitTypeRequest,
} from "~/services/benefit-types.service";
import { CreateBenefitTypeSchema } from "~/zod/benefit-type.zod";
import {
	useBenefitTypes,
	useBenefitType,
	useCreateBenefitType,
	useUpdateBenefitType,
	useDeleteBenefitType,
	useImportBenefitTypes,
} from "~/lib/hooks/useBenefitTypes";
import { useAdminFormErrorNavigation } from "~/lib/ui/admin-configuration-form";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { HR_MODAL_STANDARD_CLASS, HR_MODAL_WIDE_CLASS } from "~/lib/ui/admin-configuration-modal";
import {
	AdminConfigCategoryChip,
	AdminConfigCodeChip,
	AdminConfigLongText,
	AdminConfigMutedDash,
	AdminConfigPolicyChip,
	AdminConfigPrimaryCell,
	AdminConfigStatusBadge,
} from "~/lib/ui/admin-configuration-table";

// Schema for the form
const BenefitTypeFormSchema = CreateBenefitTypeSchema.omit({ organizationId: true }).extend({
	category: z.nativeEnum(BenefitCategory),
	payrollDirection: z.nativeEnum(BenefitPayrollDirection),
});

type BenefitTypeFormData = z.infer<typeof BenefitTypeFormSchema>;

type CategoryFieldPolicy = {
	showProvider: boolean;
	showCoverage: boolean;
	showFixedAmount: boolean;
	showPercentage: boolean;
	showMinMax: boolean;
	showMinServiceMonths: boolean;
	guidance: string;
};

const CATEGORY_FIELD_POLICY: Record<BenefitCategory, CategoryFieldPolicy> = {
	[BenefitCategory.INSURANCE]: {
		showProvider: true,
		showCoverage: true,
		showFixedAmount: false,
		showPercentage: false,
		showMinMax: false,
		showMinServiceMonths: true,
		guidance: "Use provider + coverage limit. Usually non-taxable and eligibility-based.",
	},
	[BenefitCategory.HEALTH]: {
		showProvider: true,
		showCoverage: true,
		showFixedAmount: false,
		showPercentage: false,
		showMinMax: false,
		showMinServiceMonths: true,
		guidance: "Use provider + annual coverage cap. Keep amount fields blank.",
	},
	[BenefitCategory.ALLOWANCE]: {
		showProvider: false,
		showCoverage: false,
		showFixedAmount: true,
		showPercentage: false,
		showMinMax: false,
		showMinServiceMonths: true,
		guidance: "Use fixed recurring amount (e.g. monthly subsidy).",
	},
	[BenefitCategory.TRANSPORTATION]: {
		showProvider: false,
		showCoverage: false,
		showFixedAmount: true,
		showPercentage: false,
		showMinMax: false,
		showMinServiceMonths: true,
		guidance: "Use fixed stipend. Coverage is typically not applicable.",
	},
	[BenefitCategory.BONUS]: {
		showProvider: false,
		showCoverage: false,
		showFixedAmount: true,
		showPercentage: true,
		showMinMax: true,
		showMinServiceMonths: true,
		guidance: "Use fixed/percentage with min-max bounds for variable payouts.",
	},
	[BenefitCategory.RETIREMENT]: {
		showProvider: true,
		showCoverage: false,
		showFixedAmount: false,
		showPercentage: true,
		showMinMax: false,
		showMinServiceMonths: true,
		guidance: "Use contribution percentage and tenure eligibility.",
	},
	[BenefitCategory.EDUCATION]: {
		showProvider: true,
		showCoverage: false,
		showFixedAmount: false,
		showPercentage: false,
		showMinMax: true,
		showMinServiceMonths: true,
		guidance: "Use reimbursement min/max limits with optional provider/vendor.",
	},
	[BenefitCategory.OTHER]: {
		showProvider: true,
		showCoverage: false,
		showFixedAmount: true,
		showPercentage: true,
		showMinMax: true,
		showMinServiceMonths: true,
		guidance: "Use only fields that truly apply. Leave non-applicable values blank.",
	},
};

const toOptionalNumber = (value: unknown): number | undefined => {
	if (typeof value !== "number" || Number.isNaN(value)) return undefined;
	return value;
};

const toOptionalString = (value: unknown): string | undefined => {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

const sanitizeBenefitTypeFormData = (data: BenefitTypeFormData): BenefitTypeFormData => {
	const policy = CATEGORY_FIELD_POLICY[data.category];

	return {
		...data,
		code: data.code.trim(),
		description: toOptionalString(data.description),
		reconciliationAction: toOptionalString(data.reconciliationAction),
		defaultInstallments: Math.max(1, Number(data.defaultInstallments || 6)),
		payrollCycleDays: Math.max(1, Number(data.payrollCycleDays || 15)),
		requireTermsAgreement: !!data.requireTermsAgreement,
		provider: policy.showProvider ? toOptionalString(data.provider) : undefined,
		coverage: policy.showCoverage ? toOptionalNumber(data.coverage) : undefined,
		fixedAmount: policy.showFixedAmount ? toOptionalNumber(data.fixedAmount) : undefined,
		percentage: policy.showPercentage ? toOptionalNumber(data.percentage) : undefined,
		minAmount: policy.showMinMax ? toOptionalNumber(data.minAmount) : undefined,
		maxAmount: policy.showMinMax ? toOptionalNumber(data.maxAmount) : undefined,
		minServiceMonths: policy.showMinServiceMonths
			? toOptionalNumber(data.minServiceMonths)
			: undefined,
	};
};
const IMPORT_FIELDS = {
	required: [
		{ key: "NAME", label: "Benefit Type Name", required: true, aliases: ["Benefit Type"] },
		{ key: "CATEGORY", label: "Category", required: true, aliases: ["Benefit Category"] },
	],
	optional: [
		{ key: "CODE", label: "Code", aliases: ["Benefit Code"] },
		{ key: "DESCRIPTION", label: "Description", aliases: ["Notes"] },
		{ key: "PAYROLL_DIRECTION", label: "Payroll Direction", aliases: ["Payroll"] },
		{ key: "IS_ACTIVE", label: "Active", aliases: ["Status"] },
	],
	system: [],
};

interface BenefitTypesTemplateProps {
	title?: string;
	description?: string;
}

export function BenefitTypesTemplate({
	title = "Benefit Types",
	description = "Manage available benefit types for employees",
}: BenefitTypesTemplateProps) {
	const [searchParams, setSearchParams] = useSearchParams();
	const { user } = useAuth();

	// Get search and filter params from URL
	const searchQuery = searchParams.get("search") || undefined;
	const statusFilter = searchParams.get("status") || undefined;
	const payrollDirectionFilter = searchParams.get("payrollDirection") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;

	// Build filter string for API
	const filterString = [
		statusFilter ? `isActive:${statusFilter}` : null,
		payrollDirectionFilter ? `payrollDirection:${payrollDirectionFilter}` : null,
	]
		.filter(Boolean)
		.join(",");

	// React Query hooks
	const { data: benefitTypesData, isLoading } = useBenefitTypes({
		page: pageParam,
		limit: limitParam,
		query: searchQuery,
		filter: filterString,
		count: true,
	});

	const items = benefitTypesData?.benefitTypes || [];

	// Deep link URL params
	const action = searchParams.get("action");
	const id = searchParams.get("id");

	// Single benefit type ID for fetching
	const activeId = action === "edit" || action === "view" || action === "delete" ? id : null;

	const { data: activeItem, isLoading: isLoadingItem } = useBenefitType(activeId || "");

	// Mutation hooks
	const createMutation = useCreateBenefitType();
	const updateMutation = useUpdateBenefitType();
	const deleteMutation = useDeleteBenefitType();
	const importMutation = useImportBenefitTypes();

	const {
		register,
		handleSubmit,
		reset,
		setValue,
		watch,
		formState: { errors },
	} = useForm<BenefitTypeFormData>({
		resolver: zodResolver(BenefitTypeFormSchema),
		defaultValues: {
			code: "",
			name: "",
			description: "",
			category: BenefitCategory.OTHER,
			payrollDirection: BenefitPayrollDirection.COMPENSATION,
			reconciliationAction: "",
			fixedAmount: undefined,
			percentage: undefined,
			minServiceMonths: undefined,
			defaultInstallments: 6,
			payrollCycleDays: 15,
			requireTermsAgreement: true,
			isTaxable: false,
			isActive: true,
			isDefault: false,
			provider: "",
			coverage: undefined,
			minAmount: undefined,
			maxAmount: undefined,
		},
	});

	// Handle deep linking: populate forms
	useEffect(() => {
		if (action === "edit" && !isLoadingItem && activeItem) {
			reset({
				code: activeItem.code || "",
				name: activeItem.name,
				description: activeItem.description || "",
				category: activeItem.category,
				payrollDirection:
					activeItem.payrollDirection || BenefitPayrollDirection.COMPENSATION,
				reconciliationAction: activeItem.reconciliationAction || "",
				fixedAmount: activeItem.fixedAmount,
				percentage: activeItem.percentage,
				minServiceMonths: activeItem.minServiceMonths,
				defaultInstallments: activeItem.defaultInstallments || 6,
				payrollCycleDays: activeItem.payrollCycleDays || 15,
				requireTermsAgreement: activeItem.requireTermsAgreement ?? true,
				isTaxable: activeItem.isTaxable,
				isActive: activeItem.isActive,
				isDefault: activeItem.isDefault,
				provider: activeItem.provider || "",
				coverage: activeItem.coverage,
				minAmount: activeItem.minAmount,
				maxAmount: activeItem.maxAmount,
			});
		}
	}, [action, isLoadingItem, activeItem, reset]);

	const watchedCategory = watch("category");
	const watchedCode = watch("code") || "";
	const watchedName = watch("name") || "";
	const watchedDescription = watch("description") || "";
	const watchedPayrollDirection = watch("payrollDirection");
	const watchedReconciliationAction = watch("reconciliationAction") || "";
	const watchedDefaultInstallments = watch("defaultInstallments");
	const watchedPayrollCycleDays = watch("payrollCycleDays");
	const watchedRequireTermsAgreement = watch("requireTermsAgreement");
	const watchedFixedAmount = watch("fixedAmount");
	const watchedPercentage = watch("percentage");
	const watchedMinServiceMonths = watch("minServiceMonths");
	const watchedProvider = watch("provider") || "";
	const watchedCoverage = watch("coverage");
	const watchedMinAmount = watch("minAmount");
	const watchedMaxAmount = watch("maxAmount");
	const watchedIsTaxable = watch("isTaxable");
	const watchedIsActive = watch("isActive");
	const watchedIsDefault = watch("isDefault");
	const currentCategoryPolicy = CATEGORY_FIELD_POLICY[watchedCategory];
	const handleInvalidSubmit = useAdminFormErrorNavigation();

	const categoryOptions: SelectOption[] = Object.values(BenefitCategory).map((cat) => ({
		value: cat,
		label: cat,
	}));

	const payrollDirectionOptions: SelectOption[] = Object.values(BenefitPayrollDirection).map(
		(direction) => ({
			value: direction,
			label:
				direction === BenefitPayrollDirection.COMPENSATION ? "Compensation" : "Deduction",
		}),
	);

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	// Actions
	const openCreate = () => {
		reset({
			code: "",
			name: "",
			description: "",
			category: BenefitCategory.OTHER,
			payrollDirection: BenefitPayrollDirection.COMPENSATION,
			reconciliationAction: "",
			defaultInstallments: 6,
			payrollCycleDays: 15,
			requireTermsAgreement: true,
			isTaxable: false,
			isActive: true,
			isDefault: false,
		});
		updateSearchParams((next) => {
			next.set("action", "create");
			next.delete("id");
		});
	};

	const openEdit = (item: BenefitType) => {
		updateSearchParams((next) => {
			next.set("action", "edit");
			next.set("id", item.id);
		});
	};

	const openView = (item: BenefitType) => {
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", item.id);
		});
	};

	const openDelete = (item: BenefitType) => {
		updateSearchParams((next) => {
			next.set("action", "delete");
			next.set("id", item.id);
		});
	};

	const openImport = () => {
		updateSearchParams((next) => {
			next.set("action", "import");
		});
	};

	// Form Submission
	const onSubmit = (data: BenefitTypeFormData) => {
		const cleanedData = sanitizeBenefitTypeFormData(data);
		const isEditing = action === "edit";

		if (isEditing && activeItem) {
			const updatePayload: UpdateBenefitTypeRequest = {
				...cleanedData,
			};

			updateMutation.mutate(
				{ id: activeItem.id, payload: updatePayload },
				{
					onSuccess: () => {
						reset();
						updateSearchParams((next) => {
							next.delete("action");
							next.delete("id");
						});
					},
				},
			);
		} else {
			if (!user?.organizationId) {
				sonnerToast.error("Organization not found. Please refresh.");
				return;
			}

			const payload: CreateBenefitTypeRequest = {
				...cleanedData,
				organizationId: user.organizationId,
			};

			createMutation.mutate(payload, {
				onSuccess: () => {
					reset();
					updateSearchParams((next) => {
						next.delete("action");
						next.delete("id");
					});
				},
			});
		}
	};

	// Delete
	const confirmDelete = () => {
		if (!activeItem) return;
		deleteMutation.mutate(activeItem.id, {
			onSuccess: () => {
				updateSearchParams((next) => {
					next.delete("action");
					next.delete("id");
				});
			},
		});
	};

	// Import
	const handleImport = async (file: File) => {
		const result = await importMutation.mutateAsync(file, {
			onSuccess: () => {
				updateSearchParams((next) => {
					next.delete("action");
				});
			},
		});
		return result;
	};

	const handleDownloadTemplate = () => {
		const template = `CODE,NAME,CATEGORY,PAYROLL_DIRECTION,DESCRIPTION,IS_TAXABLE,IS_ACTIVE,IS_DEFAULT,DEFAULT_INSTALLMENTS,PAYROLL_CYCLE_DAYS,REQUIRE_TERMS_AGREEMENT,RECONCILIATION_ACTION
DMA,De Minimis Allowance,ALLOWANCE,COMPENSATION,Reconciled compensation allowance catalog entry,FALSE,TRUE,FALSE,6,15,TRUE,KEEP_AS_BENEFIT
CA,Cash Advance,OTHER,DEDUCTION,Recurring cash advance deduction,TRUE,TRUE,FALSE,6,15,TRUE,KEEP_AS_BENEFIT`;
		const blob = new Blob([template], { type: "text/csv" });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "benefit-types-template.csv";
		a.click();
		window.URL.revokeObjectURL(url);
	};

	// Table Config
	const columns: Column<BenefitType>[] = [
		{
			key: "name",
			label: "Name",
			width: "200px",
			required: true,
			priority: "critical",
			render: (val, item: BenefitType) => (
				<AdminConfigPrimaryCell
					primary={val as string}
					secondary={
						<>
							{item.code ? <AdminConfigCodeChip>{item.code}</AdminConfigCodeChip> : null}
							{item.isDefault ? (
								<CategoricalText value="Default" tone="blue" className="text-xs" />
							) : null}
						</>
					}
					title={String(val || "")}
				/>
			),
		},
		{
			key: "payrollDirection",
			label: "Payroll",
			width: "130px",
			priority: "high",
			render: (val) => <CategoricalText value={val} />,
		},
		{
			key: "category",
			label: "Category",
			width: "150px",
			priority: "high",
			render: (val) => (
				<AdminConfigCategoryChip>
					{formatCategoricalTextLabel(val)}
				</AdminConfigCategoryChip>
			),
		},
		{
			key: "description",
			label: "Description",
			width: "250px",
			priority: "low",
			hideBelow: "lg",
			render: (val) => {
				if (!val) return <AdminConfigMutedDash />;
				const textProps = createTruncatedTextProps(val, 80);
				return <AdminConfigLongText title={textProps.title}>{textProps.displayText}</AdminConfigLongText>;
			},
		},
		{
			key: "isTaxable",
			label: "Taxable",
			width: "100px",
			priority: "medium",
			hideBelow: "xl",
			render: (val) => <AdminConfigPolicyChip>{val ? "Taxable" : "Non-taxable"}</AdminConfigPolicyChip>,
		},
		{
			key: "isActive",
			label: "Status",
			width: "100px",
			required: true,
			priority: "critical",
			render: (val) => <CategoricalText value={val ? "Active" : "Inactive"} />,
		},
	];

	const filterOptions: FilterOption[] = [
		{
			key: "payrollDirection",
			label: "Payroll",
			options: [
				{ value: BenefitPayrollDirection.COMPENSATION, label: "Compensation" },
				{ value: BenefitPayrollDirection.DEDUCTION, label: "Deduction" },
			],
		},
		{
			key: "isActive",
			label: "Status",
			options: [
				{ value: "true", label: "Active" },
				{ value: "false", label: "Inactive" },
			],
		},
	];

	const renderActions = (item: BenefitType) => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" className="w-8 h-8 p-0">
					<MoreVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuItem onClick={() => openView(item)}>
					<Eye className="h-4 w-4 mr-2" /> View Details
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => openEdit(item)}>
					<Edit className="h-4 w-4 mr-2" /> Edit
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={() => openDelete(item)} className="text-red-600">
					<Trash2 className="h-4 w-4 mr-2" /> Delete
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	const isDeepLinkLoading = !!activeId && isLoadingItem;

	return (
		<div className="space-y-6">
			<DataTable
				title={title}
				data={items}
				columns={columns}
				filters={filterOptions}
				onAdd={openCreate}
				onImport={openImport}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage="No benefit types found"
				emptyDescription="Get started by creating your first benefit type."
				emptyActions={
					<ConfigurationEmptyGuide
						label="Add benefit type"
						to="/admin/configuration/benefit-types?action=create"
					/>
				}
				searchWidth="w-80"
				searchPlaceholder="Search benefit types..."
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={benefitTypesData?.pagination?.total || (benefitTypesData as any)?.count}
				filterValues={{
					...(statusFilter ? { isActive: statusFilter } : {}),
					...(payrollDirectionFilter ? { payrollDirection: payrollDirectionFilter } : {}),
				}}
				onSearch={(q) => {
					updateSearchParams((next) => {
						if (q) {
							next.set("search", q);
						} else {
							next.delete("search");
						}
						next.set("page", "1");
					});
				}}
				onFilterChange={(filters) => {
					updateSearchParams((next) => {
						if (filters.isActive) {
							next.set("status", filters.isActive);
						} else {
							next.delete("status");
						}
						if (filters.payrollDirection) {
							next.set("payrollDirection", filters.payrollDirection);
						} else {
							next.delete("payrollDirection");
						}
						next.set("page", "1");
					});
				}}
				onPageChange={(page) => {
					updateSearchParams((next) => next.set("page", page.toString()));
				}}
				searchValue={searchQuery || ""}
				containedScroll
			/>

			{/* Create / Edit Modal */}
			<Modal
				open={action === "create" || action === "edit"}
				onOpenChange={(open) => {
					if (!open) {
						reset();
						updateSearchParams((next) => {
							next.delete("action");
							next.delete("id");
						});
					}
				}}
				title={
					isDeepLinkLoading && action === "edit"
						? "Loading..."
						: action === "edit"
							? "Edit Benefit Type"
							: "Create Benefit Type"
				}
				className={HR_MODAL_WIDE_CLASS}>
				{isDeepLinkLoading && action === "edit" ? (
					<div className="py-8 text-center text-gray-500">Loading benefit type...</div>
				) : (
					<form
						onSubmit={handleSubmit(onSubmit, handleInvalidSubmit)}
						className="space-y-5">
						<div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div data-field-path="code">
									<label className="mb-1 block text-sm font-medium text-gray-700">
										Code *
									</label>
									<Input
										placeholder="e.g. DMA"
										aria-invalid={Boolean(errors.code)}
										{...register("code")}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "1+",
												tone: watchedCode.trim() ? "default" : "invalid",
											},
											{ label: "Aa1", tone: "subtle" },
										]}
									/>
								</div>
								<div data-field-path="name">
									<label className="mb-1 block text-sm font-medium text-gray-700">
										Name *
									</label>
									<Input
										placeholder="e.g. De Minimis Allowance"
										aria-invalid={Boolean(errors.name)}
										{...register("name")}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "1+",
												tone: watchedName.trim() ? "default" : "invalid",
											},
											{ label: "A-Z", tone: "subtle" },
										]}
									/>
								</div>
								<div data-field-path="category">
									<label className="mb-1 block text-sm font-medium text-gray-700">
										Category *
									</label>
									<Select
										options={categoryOptions}
										value={watchedCategory}
										onChange={(value) =>
											setValue("category", value as BenefitCategory, {
												shouldDirty: true,
												shouldValidate: true,
											})
										}
										placeholder="Select category"
									/>
									<ConstraintTokenRow
										tokens={[{ label: watchedCategory, tone: "default" }]}
									/>
								</div>
								<div data-field-path="payrollDirection">
									<label className="mb-1 block text-sm font-medium text-gray-700">
										Payroll Treatment *
									</label>
									<Select
										options={payrollDirectionOptions}
										value={watchedPayrollDirection}
										onChange={(value) =>
											setValue(
												"payrollDirection",
												value as BenefitPayrollDirection,
												{ shouldDirty: true, shouldValidate: true },
											)
										}
										placeholder="Select treatment"
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label:
													watchedPayrollDirection ===
													BenefitPayrollDirection.DEDUCTION
														? "Deducts"
														: "Adds",
												tone: "default",
											},
										]}
									/>
								</div>
							</div>
							<div data-field-path="description">
								<label className="mb-1 block text-sm font-medium text-gray-700">
									Description
								</label>
								<Input
									placeholder="Optional description"
									{...register("description")}
								/>
								<ConstraintTokenRow
									tokens={[
										{
											label: "0-160",
											tone:
												watchedDescription.length > 160
													? "invalid"
													: "subtle",
										},
									]}
								/>
							</div>
						</div>

						<div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div data-field-path="reconciliationAction">
									<label className="mb-1 block text-sm font-medium text-gray-700">
										Reconciliation Action
									</label>
									<Input
										placeholder="e.g. GROSS_INCLUDED"
										{...register("reconciliationAction")}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: watchedReconciliationAction
													? "Payroll map"
													: "Optional",
												tone: "subtle",
											},
										]}
									/>
								</div>
								<div data-field-path="defaultInstallments">
									<label className="mb-1 block text-sm font-medium text-gray-700">
										Default Installments
									</label>
									<Input
										type="number"
										min={1}
										placeholder="6"
										aria-invalid={Boolean(errors.defaultInstallments)}
										{...register("defaultInstallments", {
											valueAsNumber: true,
										})}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "1+",
												tone:
													Number(watchedDefaultInstallments) >= 1
														? "default"
														: "invalid",
											},
										]}
									/>
								</div>
								<div data-field-path="payrollCycleDays">
									<label className="mb-1 block text-sm font-medium text-gray-700">
										Payroll Cycle Days
									</label>
									<Input
										type="number"
										min={1}
										placeholder="15"
										aria-invalid={Boolean(errors.payrollCycleDays)}
										{...register("payrollCycleDays", { valueAsNumber: true })}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "1+",
												tone:
													Number(watchedPayrollCycleDays) >= 1
														? "default"
														: "invalid",
											},
										]}
									/>
								</div>
							</div>
						</div>

						<div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
							<div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
								{currentCategoryPolicy.guidance}
							</div>
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								{currentCategoryPolicy.showProvider && (
									<div data-field-path="provider">
										<label className="mb-1 block text-sm font-medium text-gray-700">
											Provider
										</label>
										<Input
											placeholder="e.g. Maxicare"
											{...register("provider")}
										/>
										<ConstraintTokenRow
											tokens={[
												{
													label: watchedProvider ? "Set" : "Optional",
													tone: "subtle",
												},
											]}
										/>
									</div>
								)}
								{currentCategoryPolicy.showMinServiceMonths && (
									<div data-field-path="minServiceMonths">
										<label className="mb-1 block text-sm font-medium text-gray-700">
											Min Service Months
										</label>
										<Input
											type="number"
											min={0}
											placeholder="0"
											{...register("minServiceMonths", {
												valueAsNumber: true,
											})}
										/>
										<ConstraintTokenRow
											tokens={[
												{
													label: "0+",
													tone:
														watchedMinServiceMonths == null ||
														Number(watchedMinServiceMonths) >= 0
															? "subtle"
															: "invalid",
												},
											]}
										/>
									</div>
								)}
								{currentCategoryPolicy.showFixedAmount && (
									<div data-field-path="fixedAmount">
										<label className="mb-1 block text-sm font-medium text-gray-700">
											Fixed Amount
										</label>
										<Input
											type="number"
											step="0.01"
											min={0}
											placeholder="0.00"
											{...register("fixedAmount", { valueAsNumber: true })}
										/>
										<ConstraintTokenRow
											tokens={[
												{
													label: "0+",
													tone:
														watchedFixedAmount == null ||
														Number(watchedFixedAmount) >= 0
															? "subtle"
															: "invalid",
												},
											]}
										/>
									</div>
								)}
								{currentCategoryPolicy.showCoverage && (
									<div data-field-path="coverage">
										<label className="mb-1 block text-sm font-medium text-gray-700">
											Coverage Amount
										</label>
										<Input
											type="number"
											step="0.01"
											min={0}
											placeholder="0.00"
											{...register("coverage", { valueAsNumber: true })}
										/>
										<ConstraintTokenRow
											tokens={[
												{
													label: "0+",
													tone:
														watchedCoverage == null ||
														Number(watchedCoverage) >= 0
															? "subtle"
															: "invalid",
												},
											]}
										/>
									</div>
								)}
								{currentCategoryPolicy.showPercentage && (
									<div data-field-path="percentage">
										<label className="mb-1 block text-sm font-medium text-gray-700">
											Percentage
										</label>
										<Input
											type="number"
											step="0.01"
											min={0}
											placeholder="0.00"
											{...register("percentage", { valueAsNumber: true })}
										/>
										<ConstraintTokenRow
											tokens={[
												{
													label: "0+",
													tone:
														watchedPercentage == null ||
														Number(watchedPercentage) >= 0
															? "subtle"
															: "invalid",
												},
											]}
										/>
									</div>
								)}
								{currentCategoryPolicy.showMinMax && (
									<div data-field-path="minAmount">
										<label className="mb-1 block text-sm font-medium text-gray-700">
											Min Amount
										</label>
										<Input
											type="number"
											step="0.01"
											min={0}
											placeholder="0.00"
											{...register("minAmount", { valueAsNumber: true })}
										/>
										<ConstraintTokenRow
											tokens={[
												{
													label: "0+",
													tone:
														watchedMinAmount == null ||
														Number(watchedMinAmount) >= 0
															? "subtle"
															: "invalid",
												},
											]}
										/>
									</div>
								)}
								{currentCategoryPolicy.showMinMax && (
									<div data-field-path="maxAmount">
										<label className="mb-1 block text-sm font-medium text-gray-700">
											Max Amount
										</label>
										<Input
											type="number"
											step="0.01"
											min={0}
											placeholder="0.00"
											{...register("maxAmount", { valueAsNumber: true })}
										/>
										<ConstraintTokenRow
											tokens={[
												{
													label: "0+",
													tone:
														watchedMaxAmount == null ||
														Number(watchedMaxAmount) >= 0
															? "subtle"
															: "invalid",
												},
											]}
										/>
									</div>
								)}
							</div>
						</div>

						<div className="rounded-xl border border-slate-200 bg-white p-4">
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<label
									htmlFor="isTaxable"
									className="flex items-center gap-2 text-sm font-medium text-gray-700">
									<input
										type="checkbox"
										id="isTaxable"
										className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
										checked={!!watchedIsTaxable}
										onChange={(event) =>
											setValue("isTaxable", event.target.checked, {
												shouldDirty: true,
											})
										}
									/>
									Taxable Benefit
								</label>
								<label
									htmlFor="requireTermsAgreement"
									className="flex items-center gap-2 text-sm font-medium text-gray-700">
									<input
										type="checkbox"
										id="requireTermsAgreement"
										className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
										checked={!!watchedRequireTermsAgreement}
										onChange={(event) =>
											setValue(
												"requireTermsAgreement",
												event.target.checked,
												{
													shouldDirty: true,
												},
											)
										}
									/>
									Require Terms Agreement
								</label>
								<label
									htmlFor="isDefault"
									className="flex items-center gap-2 text-sm font-medium text-gray-700">
									<input
										type="checkbox"
										id="isDefault"
										className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
										checked={!!watchedIsDefault}
										onChange={(event) =>
											setValue("isDefault", event.target.checked, {
												shouldDirty: true,
											})
										}
									/>
									Default Benefit
								</label>
								<label
									htmlFor="isActive"
									className="flex items-center gap-2 text-sm font-medium text-gray-700">
									<input
										type="checkbox"
										id="isActive"
										className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
										checked={!!watchedIsActive}
										onChange={(event) =>
											setValue("isActive", event.target.checked, {
												shouldDirty: true,
											})
										}
									/>
									Active
								</label>
							</div>
						</div>

						<div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									updateSearchParams((next) => {
										next.delete("action");
										next.delete("id");
									});
								}}>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={createMutation.isPending || updateMutation.isPending}>
								{(createMutation.isPending || updateMutation.isPending) && (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								)}
								{action === "edit" ? "Update Type" : "Create Type"}
							</Button>
						</div>
					</form>
				)}
			</Modal>

			{/* View Modal */}
			<Modal
				open={action === "view"}
				onOpenChange={(open) => {
					if (!open) {
						updateSearchParams((next) => {
							next.delete("action");
							next.delete("id");
						});
					}
				}}
				title="Benefit Type Details"
				className={HR_MODAL_STANDARD_CLASS}>
				{isDeepLinkLoading ? (
					<div className="py-8 text-center text-gray-500">
						<Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
						Loading...
					</div>
				) : activeItem ? (
					<div className="space-y-6">
						{/* Basic Information */}
						<div className="bg-gray-50 rounded-lg p-4">
							<h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
								<Eye className="h-4 w-4" /> Basic Information
							</h4>
							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Code
									</label>
									<p className="text-sm font-medium text-gray-900">
										{activeItem.code || "-"}
									</p>
								</div>
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Name
									</label>
									<p className="text-sm font-medium text-gray-900">
										{activeItem.name}
									</p>
								</div>
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Category
									</label>
									<Badge
										variant={
											activeItem.category === BenefitCategory.OTHER
												? "secondary"
												: "default"
										}>
										{formatCategoricalTextLabel(activeItem.category)}
									</Badge>
								</div>
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Payroll Treatment
									</label>
									<CategoricalText value={activeItem.payrollDirection} />
								</div>
								<div className="col-span-2">
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Description
									</label>
									<p className="text-sm text-gray-700">
										{activeItem.description || "-"}
									</p>
								</div>
							</div>
						</div>

						{/* Financial Details */}
						<div className="bg-gray-50 rounded-lg p-4">
							<h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
								<Coins className="h-4 w-4" /> Financial Details
							</h4>
							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Fixed Amount
									</label>
									<p className="text-sm font-medium text-gray-900">
										{activeItem.fixedAmount
											? `₱${activeItem.fixedAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
											: "-"}
									</p>
								</div>
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Percentage
									</label>
									<p className="text-sm font-medium text-gray-900">
										{activeItem.percentage ? `${activeItem.percentage}%` : "-"}
									</p>
								</div>
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Coverage Amount
									</label>
									<p className="text-sm font-medium text-gray-900">
										{activeItem.coverage
											? `₱${activeItem.coverage.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
											: "-"}
									</p>
								</div>
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Provider
									</label>
									<p className="text-sm text-gray-700">
										{activeItem.provider || "-"}
									</p>
								</div>
							</div>
						</div>

						<div className="bg-gray-50 rounded-lg p-4">
							<h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
								<Coins className="h-4 w-4" /> Payroll Contract
							</h4>
							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Reconciliation Action
									</label>
									<p className="text-sm text-gray-700">
										{activeItem.reconciliationAction || "-"}
									</p>
								</div>
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Default Installments
									</label>
									<p className="text-sm text-gray-700">
										{activeItem.defaultInstallments || 6}
									</p>
								</div>
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Payroll Cycle Days
									</label>
									<p className="text-sm text-gray-700">
										{activeItem.payrollCycleDays || 15}
									</p>
								</div>
							</div>
						</div>

						{/* Amount Limits */}
						<div className="bg-gray-50 rounded-lg p-4">
							<h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
								<Coins className="h-4 w-4" /> Amount Limits
							</h4>
							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Min Amount
									</label>
									<p className="text-sm font-medium text-gray-900">
										{activeItem.minAmount
											? `₱${activeItem.minAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
											: "-"}
									</p>
								</div>
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Max Amount
									</label>
									<p className="text-sm font-medium text-gray-900">
										{activeItem.maxAmount
											? `₱${activeItem.maxAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
											: "-"}
									</p>
								</div>
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Min Service (Months)
									</label>
									<p className="text-sm text-gray-700">
										{activeItem.minServiceMonths || "-"}
									</p>
								</div>
							</div>
						</div>

						{/* Status Information */}
						<div className="bg-gray-50 rounded-lg p-4">
							<h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
								<Check className="h-4 w-4" /> Status Information
							</h4>
							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Taxable
									</label>
									{activeItem.isTaxable ? (
										<div className="flex items-center text-green-600">
											<Check className="w-4 h-4 mr-1" />
											<span className="text-sm">Yes</span>
										</div>
									) : (
										<div className="flex items-center text-gray-400">
											<X className="w-4 h-4 mr-1" />
											<span className="text-sm">No</span>
										</div>
									)}
								</div>
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Status
									</label>
									<CategoricalText
										value={activeItem.isActive ? "Active" : "Inactive"}
									/>
								</div>
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Default Benefit
									</label>
									<p className="text-sm text-gray-700">
										{activeItem.isDefault ? "Yes" : "No"}
									</p>
								</div>
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Terms Agreement
									</label>
									<p className="text-sm text-gray-700">
										{activeItem.requireTermsAgreement
											? "Required"
											: "Not required"}
									</p>
								</div>
							</div>
						</div>

						<div className="flex justify-end gap-3 pt-4">
							<Button
								variant="outline"
								onClick={() => {
									updateSearchParams((next) => {
										next.delete("action");
										next.delete("id");
									});
								}}>
								Close
							</Button>
							<Button onClick={() => openEdit(activeItem)}>Edit</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Item not found</div>
				)}
			</Modal>

			{/* Delete Modal */}
			<Modal
				open={action === "delete"}
				onOpenChange={(open) => {
					if (!open) {
						updateSearchParams((next) => {
							next.delete("action");
							next.delete("id");
						});
					}
				}}
				title="Delete Benefit Type"
				className={HR_MODAL_STANDARD_CLASS}>
				{activeItem ? (
					<div className="space-y-4">
						<div className="p-4 bg-red-50 border border-red-200 rounded-md">
							<p className="text-sm text-red-800">
								This action cannot be undone. This will permanently delete the
								benefit type <strong>{activeItem.name}</strong>.
							</p>
						</div>
						<div className="flex justify-end gap-3">
							<Button
								variant="outline"
								onClick={() => {
									updateSearchParams((next) => {
										next.delete("action");
										next.delete("id");
									});
								}}>
								Cancel
							</Button>
							<Button
								variant="destructive"
								onClick={confirmDelete}
								disabled={deleteMutation.isPending}>
								{deleteMutation.isPending ? "Deleting..." : "Delete"}
							</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Item not found</div>
				)}
			</Modal>

			<GenericImportModal
				open={action === "import"}
				onOpenChange={(open) => {
					if (!open) {
						updateSearchParams((next) => {
							next.delete("action");
						});
					}
				}}
				title="Import Benefit Types"
				description="Upload a CSV/Excel file to bulk import"
				fields={IMPORT_FIELDS}
				onDownloadTemplate={handleDownloadTemplate}
				onImport={handleImport}
				isImporting={importMutation.isPending}
			/>
		</div>
	);
}
