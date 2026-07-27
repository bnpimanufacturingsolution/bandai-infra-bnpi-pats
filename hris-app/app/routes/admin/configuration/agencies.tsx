import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router-dom";
import { z } from "zod";
import { Eye, Edit, Trash2, MoreVertical, Loader2 } from "lucide-react";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { ConfigurationEmptyGuide } from "~/components/molecules/ConfigurationEmptyGuide";
import { Modal } from "~/components/atoms/Modal";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Badge } from "~/components/atoms/Badge";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { ConstraintTokenRow } from "~/components/molecules/ConstraintTokens";
import agenciesService, {
	type Agency,
	type CreateAgencyRequest,
	type UpdateAgencyRequest,
} from "~/services/agencies.service";
import {
	useAgencies,
	useAgency,
	useCreateAgency,
	useUpdateAgency,
	useDeleteAgency,
} from "~/lib/hooks/useAgencies";
import { CreateAgencySchema } from "~/zod/agency.zod";
import { buildDatedCsvFilename, downloadCsvFile } from "~/lib/utils/csv-export";
import type { ExportScope } from "~/components/molecules/ExportScopeModal";
import { HR_MODAL_STANDARD_CLASS, HR_MODAL_WIDE_CLASS } from "~/lib/ui/admin-configuration-modal";
import {
	AdminConfigChip,
	AdminConfigMissingValue,
	AdminConfigStatusBadge,
} from "~/lib/ui/admin-configuration-table";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useAdminFormErrorNavigation } from "~/lib/ui/admin-configuration-form";
import { useDebouncedGeneratedCodeField } from "~/lib/ui/admin-configuration-code";

const AgencyFormSchema = CreateAgencySchema.extend({
	status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
	contactName: z.string().trim().optional(),
	contactEmail: z.union([z.string().trim().email(), z.literal("")]).optional(),
	contactPhone: z.string().trim().optional(),
});
type AgencyFormInput = z.input<typeof AgencyFormSchema>;
type AgencyFormData = z.output<typeof AgencyFormSchema>;

const STATUS_OPTIONS: SelectOption[] = [
	{ value: "ACTIVE", label: "Active" },
	{ value: "INACTIVE", label: "Inactive" },
];

export default function AgenciesPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const action = searchParams.get("action");
	const id = searchParams.get("id");
	const searchQuery = searchParams.get("search") || undefined;
	const statusFilter = searchParams.get("status") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;

	const filter = statusFilter ? `status:${statusFilter}` : undefined;

	const { data: agenciesData, isLoading } = useAgencies({
		page: pageParam,
		limit: limitParam,
		query: searchQuery,
		filter,
		count: true,
	});
	const items = (agenciesData as any)?.agencies || [];
	const totalItems = (agenciesData as any)?.pagination?.total || (agenciesData as any)?.count;
	const { refetch: refetchExportAgencies } = useAgencies(
		{
			page: 1,
			limit: 1000,
			query: searchQuery,
			filter,
			count: true,
		},
		{ enabled: false },
	);

	const activeAgencyId =
		action === "edit" || action === "view" || action === "delete" ? id || "" : "";
	const { data: activeAgency, isLoading: isLoadingAgency } = useAgency(activeAgencyId);

	const createAgencyMutation = useCreateAgency();
	const updateAgencyMutation = useUpdateAgency();
	const deleteAgencyMutation = useDeleteAgency();

	const {
		register,
		handleSubmit,
		reset,
		setValue,
		watch,
		formState: { errors },
	} = useForm<AgencyFormInput, any, AgencyFormData>({
		resolver: zodResolver(AgencyFormSchema),
		defaultValues: {
			name: "",
			code: "",
			status: "ACTIVE",
			contactName: "",
			contactEmail: "",
			contactPhone: "",
		},
	});

	useEffect(() => {
		if (action === "edit" && activeAgency) {
			reset({
				name: activeAgency.name || "",
				code: activeAgency.code || "",
				status: activeAgency.status || "ACTIVE",
				contactName: activeAgency.contactName || "",
				contactEmail: activeAgency.contactEmail || "",
				contactPhone: activeAgency.contactPhone || "",
			});
		}
	}, [action, activeAgency, reset]);

	const watchedName = watch("name") || "";
	const watchedCode = watch("code") || "";
	const watchedContactName = watch("contactName") || "";
	const watchedContactEmail = watch("contactEmail") || "";
	const watchedContactPhone = watch("contactPhone") || "";
	const handleInvalidSubmit = useAdminFormErrorNavigation();

	useDebouncedGeneratedCodeField({
		enabled: action === "create",
		sourceValue: watchedName,
		currentCodeValue: watchedCode,
		generateCode: async (source) => (await agenciesService.generateAgencyCode(source)).code,
		onGeneratedCode: (nextCode) =>
			setValue("code", nextCode, { shouldDirty: true, shouldValidate: true }),
	});

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const openCreate = () => {
		reset({
			name: "",
			code: "",
			status: "ACTIVE",
			contactName: "",
			contactEmail: "",
			contactPhone: "",
		});
		updateSearchParams((next) => {
			next.set("action", "create");
			next.delete("id");
		});
	};

	const openEdit = (item: Agency) => {
		updateSearchParams((next) => {
			next.set("action", "edit");
			next.set("id", item.id);
		});
	};

	const openView = (item: Agency) => {
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", item.id);
		});
	};

	const openDelete = (item: Agency) => {
		updateSearchParams((next) => {
			next.set("action", "delete");
			next.set("id", item.id);
		});
	};

	const closeModal = () => {
		reset();
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("id");
		});
	};

	const onSubmit = (formData: AgencyFormData) => {
		const payload: CreateAgencyRequest | UpdateAgencyRequest = {
			name: formData.name.trim(),
			code: formData.code.trim(),
			status: formData.status,
			contactName: formData.contactName?.trim() || null,
			contactEmail: formData.contactEmail?.trim() || null,
			contactPhone: formData.contactPhone?.trim() || null,
		};

		if (action === "edit" && activeAgency?.id) {
			updateAgencyMutation.mutate(
				{ id: activeAgency.id, payload },
				{
					onSuccess: () => {
						reset();
						closeModal();
					},
				},
			);
			return;
		}

		createAgencyMutation.mutate(payload as CreateAgencyRequest, {
			onSuccess: () => {
				reset();
				closeModal();
			},
		});
	};

	const filterOptions: FilterOption[] = [
		{
			key: "status",
			label: "Status",
			options: STATUS_OPTIONS,
		},
	];

	const handleFilterChange = (filters: Record<string, string>) => {
		updateSearchParams((next) => {
			if (filters.status) next.set("status", filters.status);
			else next.delete("status");
			next.set("page", "1");
		});
	};

	const exportAgenciesToCsv = async ({
		scope,
		currentItems,
	}: {
		scope: ExportScope;
		currentItems: Agency[];
	}) => {
		const exportItems =
			scope === "current"
				? currentItems
				: ((await refetchExportAgencies()).data as any)?.agencies || [];

		downloadCsvFile(
			buildDatedCsvFilename("agencies"),
			["Name", "Code", "Contact Name", "Contact Email", "Contact Phone", "Status"],
			exportItems.map((agency: Agency) => [
				agency.name || "",
				agency.code || "",
				agency.contactName || "",
				agency.contactEmail || "",
				agency.contactPhone || "",
				agency.status === "ACTIVE" ? "Active" : "Inactive",
			]),
		);
	};

	const confirmDelete = () => {
		if (!activeAgency?.id) return;
		deleteAgencyMutation.mutate(activeAgency.id, {
			onSuccess: () => {
				closeModal();
			},
		});
	};

	const columns: Column<Agency>[] = [
		{
			key: "name",
			label: "Agency",
			width: "220px",
			required: true,
			priority: "critical",
			render: (value, item) => (
				<div className="flex min-w-0 flex-col gap-1">
					<span
						className="truncate font-medium text-gray-900"
						title={String(value || "")}>
						{value}
					</span>
					<AdminConfigChip kind="code">{item.code}</AdminConfigChip>
				</div>
			),
		},
		{
			key: "contactName",
			label: "Contact",
			width: "180px",
			priority: "high",
			render: (value) =>
				value ? (
					<span className="text-gray-700">{value}</span>
				) : (
					<AdminConfigMissingValue />
				),
		},
		{
			key: "contactEmail",
			label: "Email",
			width: "220px",
			priority: "medium",
			hideBelow: "lg",
			render: (value) =>
				value ? (
					<span className="truncate text-gray-700" title={String(value)}>
						{value}
					</span>
				) : (
					<AdminConfigMissingValue />
				),
		},
		{
			key: "contactPhone",
			label: "Phone",
			width: "150px",
			priority: "medium",
			hideBelow: "xl",
			render: (value) =>
				value ? (
					<span className="text-gray-700">{value}</span>
				) : (
					<AdminConfigMissingValue />
				),
		},
		{
			key: "status",
			label: "Status",
			width: "120px",
			required: true,
			priority: "critical",
			render: (value) => (
				<AdminConfigStatusBadge active={value === "ACTIVE"}>
					{value === "ACTIVE" ? "Active" : "Inactive"}
				</AdminConfigStatusBadge>
			),
		},
	];

	const renderActions = (item: Agency) => (
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

	const isDeepLinkLoading = !!activeAgencyId && isLoadingAgency;

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<DataTable
				title="Agencies"
				data={items}
				columns={columns}
				filters={filterOptions}
				onAdd={openCreate}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage="No agencies found"
				emptyDescription="Create agencies here before assigning indirect employees."
				emptyActions={
					<ConfigurationEmptyGuide
						label="Add agency"
						to="/admin/configuration/agencies?action=create"
					/>
				}
				searchPlaceholder="Search agencies..."
				searchWidth="w-80"
				searchValue={searchQuery || ""}
				onSearch={(query) =>
					updateSearchParams((next) => {
						if (query) next.set("search", query);
						else next.delete("search");
						next.set("page", "1");
					})
				}
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={totalItems}
				onPageChange={(page) =>
					updateSearchParams((next) => {
						next.set("page", String(page));
					})
				}
				filterValues={{ status: statusFilter || "" }}
				onFilterChange={handleFilterChange}
				onExportCSV={exportAgenciesToCsv}
				containedScroll
			/>

			<Modal
				open={action === "create" || action === "edit"}
				onOpenChange={(open) => {
					if (!open) {
						reset();
						closeModal();
					}
				}}
				title={
					isDeepLinkLoading && action === "edit"
						? "Loading Agency..."
						: action === "edit"
							? "Edit Agency"
							: "Add Agency"
				}
				className={HR_MODAL_WIDE_CLASS}>
				{isDeepLinkLoading && action === "edit" ? (
					<div className="py-8 text-center text-gray-500">Loading agency...</div>
				) : (
					<form
						onSubmit={handleSubmit(onSubmit, handleInvalidSubmit)}
						className="space-y-5">
						<div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div data-field-path="name">
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Name *
									</label>
									<Input
										placeholder="e.g., Acme Manpower Services"
										aria-invalid={Boolean(errors.name)}
										{...register("name", { required: "Name is required" })}
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
								<div data-field-path="code">
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Code *
									</label>
									<Input
										placeholder="e.g., ACME"
										aria-invalid={Boolean(errors.code)}
										{...register("code", { required: "Code is required" })}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "1+",
												tone: watchedCode.trim() ? "default" : "invalid",
											},
											{ label: "A-Z", tone: "subtle" },
											{ label: "0-9", tone: "subtle" },
										]}
									/>
								</div>
							</div>
							<div data-field-path="status">
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Status
								</label>
								<Select
									options={STATUS_OPTIONS}
									value={watch("status")}
									onChange={(v) =>
										setValue("status", (v as "ACTIVE" | "INACTIVE") || "ACTIVE")
									}
									placeholder="Select status"
									name="status"
									error={Boolean(errors.status)}
								/>
							</div>
						</div>

						<div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div data-field-path="contactName">
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Contact Name
									</label>
									<Input
										placeholder="Optional contact person"
										aria-invalid={Boolean(errors.contactName)}
										{...register("contactName")}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "A-Z",
												tone:
													watchedContactName &&
													!/[A-Za-z]/.test(watchedContactName)
														? "invalid"
														: "subtle",
											},
										]}
									/>
								</div>
								<div data-field-path="contactPhone">
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Contact Phone
									</label>
									<Input
										placeholder="Optional phone number"
										aria-invalid={Boolean(errors.contactPhone)}
										{...register("contactPhone")}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "0-9",
												tone:
													watchedContactPhone &&
													!/^[+\d\s()-]+$/.test(watchedContactPhone)
														? "invalid"
														: "subtle",
											},
										]}
									/>
								</div>
							</div>
							<div data-field-path="contactEmail">
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Contact Email
								</label>
								<Input
									placeholder="Optional email address"
									aria-invalid={Boolean(errors.contactEmail)}
									{...register("contactEmail", {
										pattern: {
											value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
											message: "Enter a valid email",
										},
									})}
								/>
								<ConstraintTokenRow
									tokens={[
										{
											label: "@",
											tone:
												watchedContactEmail &&
												!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
													watchedContactEmail,
												)
													? "invalid"
													: "subtle",
										},
									]}
								/>
							</div>
						</div>

						<div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
							<Button type="button" variant="outline" onClick={closeModal}>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={
									createAgencyMutation.isPending || updateAgencyMutation.isPending
								}>
								{(createAgencyMutation.isPending ||
									updateAgencyMutation.isPending) && (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								)}
								{action === "edit" ? "Update Agency" : "Create Agency"}
							</Button>
						</div>
					</form>
				)}
			</Modal>

			<Modal
				open={action === "view"}
				onOpenChange={(open) => {
					if (!open) closeModal();
				}}
				title="Agency Details"
				description="View agency information"
				className={HR_MODAL_STANDARD_CLASS}>
				{isDeepLinkLoading && action === "view" ? (
					<div className="py-8 text-center text-gray-500">Loading agency...</div>
				) : activeAgency && action === "view" ? (
					<div className="space-y-5">
						<div className="rounded-xl border border-slate-200 bg-white p-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div>
									<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Name
									</label>
									<p className="mt-1 text-sm font-medium text-gray-900">
										{activeAgency.name}
									</p>
								</div>
								<div>
									<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Code
									</label>
									<p className="mt-1 text-sm text-gray-800 font-mono">
										{activeAgency.code}
									</p>
								</div>
							</div>
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2 mt-4">
								<div>
									<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Contact Name
									</label>
									<p className="mt-1 text-sm text-gray-800">
										{activeAgency.contactName || "-"}
									</p>
								</div>
								<div>
									<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Contact Phone
									</label>
									<p className="mt-1 text-sm text-gray-800">
										{activeAgency.contactPhone || "-"}
									</p>
								</div>
							</div>
							<div className="mt-4">
								<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
									Contact Email
								</label>
								<p className="mt-1 text-sm text-gray-800">
									{activeAgency.contactEmail || "-"}
								</p>
							</div>
							<div className="mt-4">
								<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
									Status
								</label>
								<div className="mt-1">
									<Badge
										variant={
											activeAgency.status === "ACTIVE"
												? "success"
												: "secondary"
										}>
										{activeAgency.status === "ACTIVE" ? "Active" : "Inactive"}
									</Badge>
								</div>
							</div>
						</div>
						<div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
							<Button variant="outline" onClick={closeModal}>
								Close
							</Button>
							<Button onClick={() => openEdit(activeAgency)}>Edit Agency</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Agency not found</div>
				)}
			</Modal>

			<Modal
				open={action === "delete"}
				onOpenChange={(open) => {
					if (!open) closeModal();
				}}
				title="Delete Agency"
				description="Are you sure you want to delete this agency?"
				className={HR_MODAL_STANDARD_CLASS}>
				{isDeepLinkLoading && action === "delete" ? (
					<div className="py-8 text-center text-gray-500">Loading agency...</div>
				) : activeAgency && action === "delete" ? (
					<div className="space-y-5">
						<div className="rounded-xl border border-red-200 bg-red-50 p-4">
							<p className="text-sm text-red-800">
								This action will deactivate and archive{" "}
								<strong>{activeAgency.name}</strong>.
							</p>
						</div>
						<div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
							<Button type="button" variant="outline" onClick={closeModal}>
								Cancel
							</Button>
							<Button
								type="button"
								variant="destructive"
								onClick={confirmDelete}
								disabled={deleteAgencyMutation.isPending}>
								{deleteAgencyMutation.isPending ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Deleting...
									</>
								) : (
									"Delete Agency"
								)}
							</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Agency not found</div>
				)}
			</Modal>
		</div>
	);
}
