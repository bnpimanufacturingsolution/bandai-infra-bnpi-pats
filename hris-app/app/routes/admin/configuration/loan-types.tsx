import { useEffect } from "react";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { CategoricalText } from "~/components/atoms/CategoricalText";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { ConfigurationEmptyGuide } from "~/components/molecules/ConfigurationEmptyGuide";
import { ConstraintTokenRow } from "~/components/molecules/ConstraintTokens";
import {
	HR_MODAL_STANDARD_CLASS,
	HR_MODAL_WIDE_CLASS,
} from "~/lib/ui/admin-configuration-modal";
import { Eye, Edit, Trash2, MoreVertical } from "lucide-react";
import { useForm } from "react-hook-form";
import { useAuth } from "~/lib/hooks/use-auth";
import { useSearchParams } from "react-router-dom";
import {
	type LoanType,
	type CreateLoanTypeRequest,
	type UpdateLoanTypeRequest,
} from "~/services/loan-types.service";
import {
	useLoanTypes,
	useLoanType,
	useCreateLoanType,
	useUpdateLoanType,
	useDeleteLoanType,
} from "~/lib/hooks/useLoanTypes";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { toast } from "sonner";

interface LoanTypeFormData {
	name: string;
	description?: string;
	category:
		| "SALARY_LOAN"
		| "EMERGENCY_LOAN"
		| "HOUSING_LOAN"
		| "CALAMITY_LOAN"
		| "SSS_LOAN"
		| "PAGIBIG_LOAN"
		| "VEHICLE_LOAN"
		| "EDUCATION_LOAN"
		| "OTHER";
	maxAmount?: number;
	minAmount?: number;
	interestRate: number;
	maxTermMonths: number;
	minServiceMonths?: number;
	isActive: boolean;
}

const categoryOptions: SelectOption[] = [
	{ value: "SALARY_LOAN", label: "Salary Loan" },
	{ value: "EMERGENCY_LOAN", label: "Emergency Loan" },
	{ value: "HOUSING_LOAN", label: "Housing Loan" },
	{ value: "CALAMITY_LOAN", label: "Calamity Loan" },
	{ value: "SSS_LOAN", label: "SSS Loan" },
	{ value: "PAGIBIG_LOAN", label: "Pag-IBIG Loan" },
	{ value: "VEHICLE_LOAN", label: "Vehicle Loan" },
	{ value: "EDUCATION_LOAN", label: "Education Loan" },
	{ value: "OTHER", label: "Other" },
];

export default function LoanTypesPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const { user } = useAuth();
	const searchQuery = searchParams.get("search") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const action = searchParams.get("action");
	const id = searchParams.get("id");
	const activeLoanTypeId = action === "edit" || action === "view" || action === "delete" ? id : null;

	// React Query hooks
	const { data: loanTypesData, isLoading } = useLoanTypes({
		page: pageParam,
		limit: limitParam,
		query: searchQuery,
		count: true,
	});
	const loanTypes = (loanTypesData as any)?.loanTypes || [];

	// Hook to fetch loan type details for view modal
	const { data: activeLoanType, isLoading: isLoadingLoanType } = useLoanType(activeLoanTypeId || "");

	// Mutation hooks
	const createLoanTypeMutation = useCreateLoanType();
	const updateLoanTypeMutation = useUpdateLoanType();
	const deleteLoanTypeMutation = useDeleteLoanType();

	const { register, handleSubmit, reset, setValue, watch } = useForm<LoanTypeFormData>({
		defaultValues: {
			name: "",
			description: "",
			category: "OTHER",
			maxAmount: undefined,
			minAmount: undefined,
			interestRate: 0,
			maxTermMonths: 12,
			minServiceMonths: undefined,
			isActive: true,
		},
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
			description: "",
			category: "OTHER",
			maxAmount: undefined,
			minAmount: undefined,
			interestRate: 0,
			maxTermMonths: 12,
			minServiceMonths: undefined,
			isActive: true,
		});
		updateSearchParams((next) => {
			next.set("action", "create");
			next.delete("id");
		});
	};

	const openEdit = (loanType: LoanType) => {
		updateSearchParams((next) => {
			next.set("action", "edit");
			next.set("id", loanType.id);
		});
	};

	const handleDelete = (loanType: LoanType) => {
		updateSearchParams((next) => {
			next.set("action", "delete");
			next.set("id", loanType.id);
		});
	};

	const handleView = (item: LoanType) => {
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", item.id);
		});
	};

	const handleCloseModal = () => {
		reset();
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("id");
		});
	};

	useEffect(() => {
		if (action === "edit" && activeLoanType) {
			reset({
				name: activeLoanType.name,
				description: activeLoanType.description || "",
				category: activeLoanType.category,
				maxAmount: activeLoanType.maxAmount,
				minAmount: activeLoanType.minAmount,
				interestRate: activeLoanType.interestRate,
				maxTermMonths: activeLoanType.maxTermMonths,
				minServiceMonths: activeLoanType.minServiceMonths,
				isActive: activeLoanType.isActive,
			});
		}
	}, [action, activeLoanType, reset]);

	const onSubmit = (data: LoanTypeFormData) => {
		if (action === "edit" && activeLoanType) {
			const updatePayload: UpdateLoanTypeRequest = {
				name: data.name,
				description: data.description || "",
				category: data.category,
				maxAmount: data.maxAmount,
				minAmount: data.minAmount,
				interestRate: data.interestRate,
				maxTermMonths: data.maxTermMonths,
				minServiceMonths: data.minServiceMonths,
				isActive: data.isActive,
			};

			updateLoanTypeMutation.mutate(
				{ id: activeLoanType.id, payload: updatePayload },
				{
					onSuccess: () => {
						handleCloseModal();
					},
				},
			);
		} else {
			// Get organizationId from user object
			const organizationId = user?.organizationId || user?.organization?.id;

			if (!organizationId) {
				toast.error("User organization ID not found");
				return;
			}

			const createPayload: CreateLoanTypeRequest = {
				name: data.name,
				description: data.description || "",
				category: data.category,
				maxAmount: data.maxAmount,
				minAmount: data.minAmount,
				interestRate: data.interestRate,
				maxTermMonths: data.maxTermMonths,
				minServiceMonths: data.minServiceMonths,
				isActive: data.isActive,
				organizationId: organizationId,
			};

			createLoanTypeMutation.mutate(createPayload, {
				onSuccess: () => {
					handleCloseModal();
				},
			});
		}
	};

	const confirmDelete = () => {
		if (!activeLoanType) return;
		deleteLoanTypeMutation.mutate(activeLoanType.id, {
			onSuccess: () => {
				updateSearchParams((next) => {
					next.delete("action");
					next.delete("id");
				});
			},
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

	// Table columns
	const columns: Column<LoanType>[] = [
		{
			key: "name",
			label: "Name",
			render: (value, loanType) => <div className="font-medium">{loanType.name}</div>,
		},
		{
			key: "category",
			label: "Category",
			render: (value, loanType) => (
				<Badge variant={loanType.category === "SALARY_LOAN" ? "default" : "secondary"}>
					{loanType.category.replace("_", " ")}
				</Badge>
			),
		},
		{
			key: "amountRange",
			label: "Amount Range",
			render: (value, loanType) => (
				<div className="text-sm">
					{loanType.minAmount && loanType.maxAmount ? (
						<>
							₱{loanType.minAmount.toLocaleString()} - ₱
							{loanType.maxAmount.toLocaleString()}
						</>
					) : loanType.maxAmount ? (
						<>Up to ₱{loanType.maxAmount.toLocaleString()}</>
					) : (
						"No limit"
					)}
				</div>
			),
		},
		{
			key: "interestRate",
			label: "Interest Rate",
			render: (value, loanType) => <div className="text-sm">{loanType.interestRate}%</div>,
		},
		{
			key: "maxTermMonths",
			label: "Max Term",
			render: (value, loanType) => (
				<div className="text-sm">{loanType.maxTermMonths} months</div>
			),
		},
		{
			key: "isActive",
			label: "Status",
			render: (_value, loanType) => (
				<CategoricalText value={loanType.isActive ? "Active" : "Inactive"} />
			),
		},
	];

	// Custom actions renderer with dropdown
	const renderActions = (item: LoanType) => {
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						className="flex items-center justify-center w-8 h-8 p-0">
						<MoreVertical className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-48">
					<DropdownMenuItem onClick={() => handleView(item)}>
						<Eye className="h-4 w-4 mr-2" />
						View Details
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => openEdit(item)}>
						<Edit className="h-4 w-4 mr-2" />
						Edit
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={() => handleDelete(item)}
						className="text-red-600 focus:text-red-600 focus:bg-red-50">
						<Trash2 className="h-4 w-4 mr-2" />
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		);
	};

	return (
		<div className="space-y-6">
			<DataTable
				title="Loan Types"
				description="Configure employee loan types and terms"
				data={loanTypes}
				columns={columns}
				searchFields={["name", "description"]}
				onAdd={openCreate}
				onEdit={openEdit}
				onDelete={handleDelete}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage="No loan types created yet"
				emptyDescription="Get started by creating your first loan type."
				emptyActions={
					<ConfigurationEmptyGuide label="Add loan type" onClick={openCreate} />
				}
				searchWidth="w-80"
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={(loanTypesData as any)?.pagination?.total || (loanTypesData as any)?.count}
				onSearch={handleSearch}
				onPageChange={handlePageChange}
				searchValue={searchQuery || ""}
			/>

			{/* Create/Edit Modal */}
			<Modal
				open={action === "create" || action === "edit"}
				onOpenChange={(open) => {
					if (!open) handleCloseModal();
				}}
				title={action === "edit" ? "Edit Loan Type" : "Create Loan Type"}
				className={HR_MODAL_WIDE_CLASS}>
				{action === "edit" && isLoadingLoanType ? (
					<div className="py-8 text-center text-gray-500">Loading loan type...</div>
				) : (
				<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div data-field-path="name">
							<label className="block text-sm font-medium mb-1">Name *</label>
							<Input
								{...register("name", { required: true })}
								placeholder="Enter loan type name"
								aria-invalid={false}
							/>
							<ConstraintTokenRow tokens={[{ label: "Required", tone: "default" }]} />
						</div>
						<div data-field-path="category">
							<label className="block text-sm font-medium mb-1">Category *</label>
							<Select
								options={categoryOptions}
								value={watch("category")}
								onChange={(value) => setValue("category", value as any)}
							/>
							<ConstraintTokenRow tokens={[{ label: "Required", tone: "default" }]} />
						</div>
					</div>

					<div>
						<label className="block text-sm font-medium mb-1">Description</label>
						<Input {...register("description")} placeholder="Enter description" />
					</div>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div data-field-path="interestRate">
							<label className="block text-sm font-medium mb-1">Min Amount</label>
							<Input
								type="number"
								step="0.01"
								{...register("minAmount", { valueAsNumber: true })}
								placeholder="0.00"
							/>
						</div>
						<div>
							<label className="block text-sm font-medium mb-1">Max Amount</label>
							<Input
								type="number"
								step="0.01"
								{...register("maxAmount", { valueAsNumber: true })}
								placeholder="0.00"
							/>
						</div>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<label className="block text-sm font-medium mb-1">
								Interest Rate (%) *
							</label>
							<Input
								type="number"
								step="0.01"
								{...register("interestRate", {
									required: true,
									valueAsNumber: true,
								})}
								placeholder="0.00"
								aria-invalid={false}
							/>
							<ConstraintTokenRow tokens={[{ label: "Percent", tone: "subtle" }]} />
						</div>
						<div data-field-path="maxTermMonths">
							<label className="block text-sm font-medium mb-1">
								Max Term (months) *
							</label>
							<Input
								type="number"
								{...register("maxTermMonths", {
									required: true,
									valueAsNumber: true,
								})}
								placeholder="12"
								aria-invalid={false}
							/>
							<ConstraintTokenRow tokens={[{ label: "Months", tone: "subtle" }]} />
						</div>
					</div>

					<div>
						<label className="block text-sm font-medium mb-1">Min Service Months</label>
						<Input
							type="number"
							{...register("minServiceMonths", { valueAsNumber: true })}
							placeholder="0"
						/>
					</div>

					<div className="flex justify-end space-x-2 pt-4">
						<Button type="button" variant="outline" onClick={handleCloseModal}>
							Cancel
						</Button>
						<Button type="submit">{action === "edit" ? "Update" : "Create"} Loan Type</Button>
					</div>
				</form>
				)}
			</Modal>

			{/* View Modal */}
			<Modal
				open={action === "view"}
				onOpenChange={(open) => {
					if (!open) handleCloseModal();
				}}
				title="Loan Type Details"
				className={HR_MODAL_STANDARD_CLASS}>
				{action === "view" && isLoadingLoanType ? (
					<div className="py-8 text-center text-gray-500">Loading loan type...</div>
				) : activeLoanType && action === "view" ? (
					<div className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="text-sm font-medium text-gray-500">Name</label>
								<p className="text-sm">{activeLoanType.name}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500">
									Category
								</label>
								<p className="text-sm">{activeLoanType.category.replace("_", " ")}</p>
							</div>
						</div>
						<div>
							<label className="text-sm font-medium text-gray-500">Description</label>
							<p className="text-sm">{activeLoanType.description || "No description"}</p>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="text-sm font-medium text-gray-500">
									Min Amount
								</label>
								<p className="text-sm">
									{activeLoanType.minAmount
										? `₱${activeLoanType.minAmount.toLocaleString()}`
										: "No minimum"}
								</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500">
									Max Amount
								</label>
								<p className="text-sm">
									{activeLoanType.maxAmount
										? `₱${activeLoanType.maxAmount.toLocaleString()}`
										: "No limit"}
								</p>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="text-sm font-medium text-gray-500">
									Interest Rate
								</label>
								<p className="text-sm">{activeLoanType.interestRate}%</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500">
									Max Term
								</label>
								<p className="text-sm">{activeLoanType.maxTermMonths} months</p>
							</div>
						</div>
						<div>
							<label className="text-sm font-medium text-gray-500">
								Min Service Months
							</label>
							<p className="text-sm">
								{activeLoanType.minServiceMonths || "No requirement"}
							</p>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-500 mb-1">
								Status
							</label>
							<Badge
								className="inline-flex"
								variant={activeLoanType.isActive ? "default" : "secondary"}>
								{activeLoanType.isActive ? "Active" : "Inactive"}
							</Badge>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Loan type not found</div>
				)}
			</Modal>
			<Modal
				open={action === "delete"}
				onOpenChange={(open) => {
					if (!open) handleCloseModal();
				}}
				title="Delete Loan Type"
				className={HR_MODAL_STANDARD_CLASS}>
				{activeLoanType && action === "delete" ? (
					<div className="space-y-4">
						<div className="rounded-md border border-red-200 bg-red-50 p-4">
							<p className="text-sm text-red-800">
								This action cannot be undone. This will permanently delete{" "}
								<strong>{activeLoanType.name}</strong>.
							</p>
						</div>
						<div className="flex justify-end gap-3">
							<Button type="button" variant="outline" onClick={handleCloseModal}>
								Cancel
							</Button>
							<Button
								type="button"
								variant="destructive"
								onClick={confirmDelete}
								disabled={deleteLoanTypeMutation.isPending}>
								Delete Loan Type
							</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Loan type not found</div>
				)}
			</Modal>
		</div>
	);
}
