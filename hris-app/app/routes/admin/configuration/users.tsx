import { useEffect } from "react";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { CategoricalText } from "~/components/atoms/CategoricalText";
import { Select } from "~/components/atoms/Select";
import { formatDateForExport, formatDateTime } from "~/lib/utils/text-utils";
import { buildDatedCsvFilename, downloadCsvFile } from "~/lib/utils/csv-export";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { ConfigurationEmptyGuide } from "~/components/molecules/ConfigurationEmptyGuide";
import { ConstraintTokenRow } from "~/components/molecules/ConstraintTokens";
import { UserCog, Eye, Edit, Trash2, MoreVertical, KeyRound } from "lucide-react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "~/lib/hooks/use-auth";
import {
	useUsers,
	useUser,
	useCreateUser,
	useUpdateUser,
	useResetUserPassword,
	useDeleteUser,
	buildAuthAppUserFilter,
	buildAuthUserFields,
	getAppRoleNames,
	type CreateUserRequest,
	type UpdateUserRequest,
	type UserListItem,
	type UserMetadata,
} from "~/lib/hooks/useUsers";
import { useRoles } from "~/lib/hooks/useRoles";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import type { ExportScope } from "~/components/molecules/ExportScopeModal";
import { useAdminFormErrorNavigation } from "~/lib/ui/admin-configuration-form";
import { HR_MODAL_STANDARD_CLASS, HR_MODAL_WIDE_CLASS } from "~/lib/ui/admin-configuration-modal";
import {
	AdminConfigDateText,
	AdminConfigMutedDash,
	AdminConfigPrimaryCell,
	AdminConfigRoleText,
} from "~/lib/ui/admin-configuration-table";

interface UserFormData {
	email: string;
	userName: string;
	password?: string;
	status: "active" | "inactive" | "suspended" | "archived";
	roleId: string;
	organizationId?: string;
}

const getEmployeeName = (user: UserListItem) => {
	const firstName = user.metadata?.employee?.personalInfo?.firstName || "";
	const lastName = user.metadata?.employee?.personalInfo?.lastName || "";
	const fullName = `${firstName} ${lastName}`.trim();
	return fullName || user.userName || user.email || "N/A";
};

const getDepartmentName = (user: UserListItem) =>
	user.metadata?.employee?.department?.name || "N/A";

const getPositionTitle = (user: UserListItem) => user.metadata?.employee?.position?.title || "N/A";

const getAccessStatus = (user: UserListItem) =>
	user.metadata?.device?.access?.status || "unenrolled";

const getAccessLabel = (user: UserListItem) => {
	const status = getAccessStatus(user);
	return status ? `${status.charAt(0).toUpperCase()}${status.slice(1)}` : "N/A";
};

export default function UsersPage() {
	const [searchParams, setSearchParams] = useSearchParams();

	const { user } = useAuth();
	const isUsersApiTemporarilyDisabled = false;

	// Get search and filter params from URL
	const searchQuery = searchParams.get("search") || undefined;
	const statusFilter = searchParams.get("status") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const sortParam = searchParams.get("sort") || "createdAt";
	const orderParam = searchParams.get("order") === "asc" ? "asc" : "desc";
	const organizationId = user?.organizationId || user?.organization?.id;

	// Build filter string for API
	const filterString = buildAuthAppUserFilter(
		organizationId,
		statusFilter ? [`status:${statusFilter}`] : [],
	);

	// React Query hooks with server-side search and filtering
	const { data: usersData, isLoading } = useUsers(
		{
			page: pageParam,
			limit: limitParam,
			query: searchQuery,
			filter: filterString,
			fields: buildAuthUserFields(),
			sort: sortParam,
			order: orderParam,
			document: true,
			pagination: true,
			count: true,
		},
		{ enabled: !isUsersApiTemporarilyDisabled },
	);
	const usersPayload =
		(usersData as any)?.data?.users || (usersData as any)?.data?.pagination
			? (usersData as any).data
			: (usersData as any)?.users || (usersData as any)?.pagination
				? (usersData as any)
				: (usersData as any)?.data?.data || {};
	const items = usersPayload?.users || [];
	const pagination = usersPayload?.pagination;
	const exportQueryParams = {
		page: 1,
		limit: 1000,
		query: searchQuery,
		filter: filterString,
		fields: buildAuthUserFields(),
		document: true,
		pagination: true,
		count: true,
	};
	const { refetch: refetchExportUsers } = useUsers(exportQueryParams, {
		enabled: false,
	});
	const getStatusLabel = (status?: UserListItem["status"]) =>
		status ? `${status.charAt(0).toUpperCase()}${status.slice(1)}` : "N/A";

	const exportUsersToCsv = async ({
		scope,
		currentItems,
	}: {
		scope: ExportScope;
		currentItems: UserListItem[];
	}) => {
		const exportItems =
			scope === "current"
				? currentItems
				: (await refetchExportUsers()).data?.data?.users || [];

		downloadCsvFile(
			buildDatedCsvFilename("users"),
			[
				"Employee",
				"Username",
				"Email",
				"Role",
				"Access Status",
				"Status",
				"Created At",
				"Updated At",
			],
			exportItems.map((item: UserListItem) => {
				const roleNames = getAppRoleNames(item);
				return [
					getEmployeeName(item),
					item.userName || "",
					item.email || "",
					roleNames || "",
					getAccessLabel(item),
					getStatusLabel(item.status),
					formatDateForExport(item.createdAt),
					formatDateForExport(item.updatedAt),
				];
			}),
		);
	};

	// Deep link URL params
	const action = searchParams.get("action");
	const id = searchParams.get("id");

	// Single user ID for fetching (when action is edit, view, or delete)
	const activeUserId =
		action === "edit" || action === "view" || action === "delete" || action === "reset-password"
			? id
			: null;

	// Single useUser hook for all modals (edit, view, delete)
	const { data: activeUser, isLoading: isLoadingUser } = useUser(
		activeUserId || "",
		!isUsersApiTemporarilyDisabled,
	);

	// Hook to fetch roles
	const { data: rolesData, isLoading: isLoadingRoles } = useRoles(!isUsersApiTemporarilyDisabled);
	const roles = rolesData?.data?.roles || [];

	// Mutation hooks
	const createUserMutation = useCreateUser();
	const updateUserMutation = useUpdateUser();
	const resetUserPasswordMutation = useResetUserPassword();
	const deleteUserMutation = useDeleteUser();

	// schema-equivalent validation: react-hook-form rules mirror the admin config modal contract.
	const {
		register,
		handleSubmit,
		reset,
		setValue,
		watch,
		formState: { errors },
	} = useForm<UserFormData>({
		defaultValues: {
			email: "",
			userName: "",
			password: "",
			status: "active",
			roleId: "",
			organizationId: "",
		},
	});

	// Handle deep linking: populate forms
	useEffect(() => {
		// Populate form when editing and data is loaded
		if (action === "edit" && !isLoadingUser && activeUser) {
			const user = activeUser as any;
			reset({
				email: user.email || "",
				userName: user.userName || "",
				password: "",
				status: user.status || "active",
				roleId: user.roleId || "",
				organizationId: user.organizationId || "",
			});
		}
	}, [action, isLoadingUser, activeUser, reset]);

	// Watch form values for controlled components
	const watchedStatus = watch("status");
	const watchedEmail = watch("email") || "";
	const watchedUserName = watch("userName") || "";
	const watchedPassword = watch("password") || "";
	const watchedRoleId = watch("roleId") || "";
	const handleInvalidSubmit = useAdminFormErrorNavigation();

	// Define filter options
	const filterOptions: FilterOption[] = [
		{
			key: "status",
			label: "Status",
			options: [
				{ value: "active", label: "Active" },
				{ value: "inactive", label: "Inactive" },
				{ value: "suspended", label: "Suspended" },
				{ value: "archived", label: "Archived" },
			],
		},
	];

	// Define table columns
	const columns: Column<UserListItem>[] = [
		{
			key: "employee",
			label: "Employee",
			width: "260px",
			required: true,
			priority: "critical",
			render: (value, item: UserListItem) => (
				<div className="flex items-center gap-3">
					<div className="h-8 w-8 rounded-md bg-gray-200 flex items-center justify-center">
						{item.avatar ? (
							<img
								src={item.avatar}
								alt={getEmployeeName(item)}
								className="h-8 w-8 rounded-md object-cover"
							/>
						) : (
							<UserCog className="h-4 w-4 text-gray-500" />
						)}
					</div>
					<AdminConfigPrimaryCell
						primary={getEmployeeName(item)}
						secondary={
							<span className="min-w-0 truncate text-xs text-slate-500">{item.email}</span>
						}
						title={getEmployeeName(item)}
					/>
				</div>
			),
		},
		{
			key: "userRoles",
			label: "Role",
			width: "180px",
			required: true,
			priority: "high",
			render: (_value, item: UserListItem) => {
				const appRoles = getAppRoleNames(item);
				return appRoles ? <AdminConfigRoleText>{appRoles}</AdminConfigRoleText> : <AdminConfigMutedDash />;
			},
		},
		{
			key: "accessStatus",
			label: "Access Status",
			width: "140px",
			priority: "low",
			hideBelow: "xl",
			render: (_value, item: UserListItem) => {
				return (
					<Badge variant={getAccessLabel(item) === "Enrolled" ? "success" : "secondary"}>
						{getAccessLabel(item)}
					</Badge>
				);
			},
		},
		{
			key: "status",
			label: "Status",
			width: "120px",
			required: true,
			priority: "critical",
			render: (_value, item: UserListItem) => (
				<CategoricalText
					value={getStatusLabel(item.status)}
					tone={item.status === "suspended" ? "amber" : undefined}
				/>
			),
		},
		{
			key: "createdAt",
			label: "Updated",
			width: "150px",
			priority: "medium",
			hideBelow: "lg",
			render: (value) => <AdminConfigDateText>{formatDateTime(value)}</AdminConfigDateText>,
		},
	];

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const openCreate = () => {
		if (isUsersApiTemporarilyDisabled) return;
		reset({
			email: "",
			userName: "",
			password: "",
			status: "active",
			roleId: "",
			organizationId: user?.organizationId || user?.organization?.id || "",
		});
		updateSearchParams((next) => {
			next.set("action", "create");
			next.delete("id");
		});
	};

	const openEdit = (user: any) => {
		// Don't populate form here - let the useEffect handle it with fresh data from API
		updateSearchParams((next) => {
			next.set("action", "edit");
			next.set("id", user.id);
		});
	};

	const onSubmit = (data: UserFormData) => {
		if (isUsersApiTemporarilyDisabled) {
			toast.info("Users API hit is temporarily disabled.");
			return;
		}

		// Check if we're editing by looking at search params
		const isEditing = action === "edit";

		if (isEditing && activeUser) {
			const user = activeUser as any;
			const updatePayload: UpdateUserRequest = {
				email: data.email,
				userName: data.userName,
				status: data.status,
				roleId: data.roleId,
			};

			updateUserMutation.mutate(
				{ id: user.id, data: updatePayload },
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
			// Get organizationId from user object - check both direct property and nested organization
			const organizationId = user?.organizationId || user?.organization?.id;

			if (!organizationId) {
				toast.error("User organization ID not found");
				return;
			}

			const payload: CreateUserRequest = {
				email: data.email,
				userName: data.userName,
				password: data.password,
				status: data.status,
				roleId: data.roleId,
				organizationId: organizationId,
			};

			createUserMutation.mutate(payload, {
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

	const handleDelete = (user: any) => {
		if (isUsersApiTemporarilyDisabled) {
			toast.info("Users API hit is temporarily disabled.");
			return;
		}

		updateSearchParams((next) => {
			next.set("action", "delete");
			next.set("id", user.id);
		});
	};

	const handleResetPassword = (user: UserListItem) => {
		if (isUsersApiTemporarilyDisabled) {
			toast.info("Users API hit is temporarily disabled.");
			return;
		}

		updateSearchParams((next) => {
			next.set("action", "reset-password");
			next.set("id", user.id);
		});
	};

	const confirmResetPassword = () => {
		if (isUsersApiTemporarilyDisabled) {
			toast.info("Users API hit is temporarily disabled.");
			return;
		}

		if (!activeUser) return;
		resetUserPasswordMutation.mutate(activeUser.id, {
			onSuccess: () => {
				updateSearchParams((next) => {
					next.delete("action");
					next.delete("id");
				});
			},
		});
	};

	const confirmDelete = () => {
		if (isUsersApiTemporarilyDisabled) {
			toast.info("Users API hit is temporarily disabled.");
			return;
		}

		if (!activeUser) return;
		deleteUserMutation.mutate(activeUser.id, {
			onSuccess: () => {
				updateSearchParams((next) => {
					next.delete("action");
					next.delete("id");
				});
			},
		});
	};

	const handleView = (item: any) => {
		if (isUsersApiTemporarilyDisabled) {
			toast.info("Users API hit is temporarily disabled.");
			return;
		}

		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", item.id);
		});
	};

	const renderActions = (item: any) => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" className="w-8 h-8 p-0">
					<MoreVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuItem onClick={() => handleView(item)}>
					<Eye className="h-4 w-4 mr-2" /> View Details
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => openEdit(item)}>
					<Edit className="h-4 w-4 mr-2" /> Edit
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => handleResetPassword(item)}>
					<KeyRound className="h-4 w-4 mr-2" /> Reset Password
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={() => handleDelete(item)} className="text-red-600">
					<Trash2 className="h-4 w-4 mr-2" /> Delete
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	// Check if modal should show loading state for deep links
	const isDeepLinkLoading = !!activeUserId && isLoadingUser;

	// Server-side search handler
	const handleSearch = (query: string) => {
		if (isUsersApiTemporarilyDisabled) return;

		updateSearchParams((next) => {
			if (query) {
				next.set("search", query);
			} else {
				next.delete("search");
			}
			next.set("page", "1");
		});
	};

	// Server-side filter handler
	const handleFilterChange = (filters: Record<string, string>) => {
		if (isUsersApiTemporarilyDisabled) return;

		updateSearchParams((next) => {
			if (filters.status) {
				next.set("status", filters.status);
			} else {
				next.delete("status");
			}
			next.set("page", "1");
		});
	};

	// Server-side pagination handler
	const handlePageChange = (page: number) => {
		if (isUsersApiTemporarilyDisabled) return;

		updateSearchParams((next) => {
			next.set("page", page.toString());
		});
	};

	const handleSort = (key: string, direction: "asc" | "desc") => {
		if (isUsersApiTemporarilyDisabled) return;

		updateSearchParams((next) => {
			next.set("sort", key);
			next.set("order", direction);
			next.set("page", "1");
		});
	};

	return (
		<div className="space-y-6">
			<DataTable
				title="Users"
				data={items}
				columns={columns}
				filters={filterOptions}
				renderActions={isUsersApiTemporarilyDisabled ? undefined : renderActions}
				isLoading={isUsersApiTemporarilyDisabled ? false : isLoading}
				emptyMessage="No users found"
				emptyDescription={
					isUsersApiTemporarilyDisabled
						? "API hit is disabled for now."
						: "Get started by creating your first user."
				}
				onAdd={isUsersApiTemporarilyDisabled ? undefined : openCreate}
				emptyActions={
					isUsersApiTemporarilyDisabled ? undefined : (
						<ConfigurationEmptyGuide label="Add user" onClick={openCreate} />
					)
				}
				searchWidth="w-80"
				searchPlaceholder="Search users..."
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={pagination?.total}
				totalPages={pagination?.totalPages}
				onSearch={isUsersApiTemporarilyDisabled ? undefined : handleSearch}
				onFilterChange={isUsersApiTemporarilyDisabled ? undefined : handleFilterChange}
				filterValues={{ status: statusFilter || "" }}
				onPageChange={isUsersApiTemporarilyDisabled ? undefined : handlePageChange}
				onSort={isUsersApiTemporarilyDisabled ? undefined : handleSort}
				sortKey={sortParam}
				sortDirection={orderParam}
				searchValue={searchQuery || ""}
				onExportCSV={isUsersApiTemporarilyDisabled ? undefined : exportUsersToCsv}
				containedScroll
			/>

			{/* Edit / Create Modal */}
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
						? "Loading User..."
						: action === "edit"
							? "Edit User"
							: "Add User"
				}
				className={HR_MODAL_WIDE_CLASS}>
				{isDeepLinkLoading && action === "edit" ? (
					<div className="py-8 text-center text-gray-500">Loading user...</div>
				) : (
					<form
						onSubmit={handleSubmit(onSubmit, handleInvalidSubmit)}
						className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div data-field-path="email">
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Email *
								</label>
								<Input
									placeholder="user@example.com"
									type="email"
									aria-invalid={Boolean(errors.email)}
									{...register("email", {
										required: "Email is required",
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
											tone: errors.email
												? "invalid"
												: watchedEmail
													? "default"
													: "invalid",
										},
										{
											label: "1-254",
											tone: watchedEmail.length > 254 ? "invalid" : "subtle",
										},
									]}
								/>
							</div>
							<div data-field-path="userName">
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Username *
								</label>
								<Input
									placeholder="username"
									aria-invalid={Boolean(errors.userName)}
									{...register("userName", { required: "Username is required" })}
								/>
								<ConstraintTokenRow
									tokens={[
										{
											label: "1+",
											tone: errors.userName
												? "invalid"
												: watchedUserName.trim()
													? "default"
													: "invalid",
										},
										{ label: "Aa1", tone: "subtle" },
									]}
								/>
							</div>
						</div>

						{action !== "edit" && (
							<div data-field-path="password">
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Password *
								</label>
								<Input
									placeholder="Enter password"
									type="password"
									aria-invalid={Boolean(errors.password)}
									{...register("password", {
										required:
											action !== "edit" ? "Password is required" : false,
									})}
								/>
								<ConstraintTokenRow
									tokens={[
										{
											label: "1+",
											tone: errors.password
												? "invalid"
												: watchedPassword.trim()
													? "default"
													: "invalid",
										},
										{ label: "Aa1", tone: "subtle" },
									]}
								/>
							</div>
						)}

						<div className="grid grid-cols-2 gap-4">
							<div data-field-path="status">
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Status *
								</label>
								<Select
									options={[
										{ value: "active", label: "Active" },
										{ value: "inactive", label: "Inactive" },
										{ value: "suspended", label: "Suspended" },
										{ value: "archived", label: "Archived" },
									]}
									value={watchedStatus}
									onChange={(value) => setValue("status", value as any)}
									placeholder="Select Status"
									name="status"
									error={Boolean(errors.status)}
								/>
								<ConstraintTokenRow tokens={[{ label: "1", tone: "default" }]} />
							</div>
							<div data-field-path="roleId">
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Role *
								</label>
								<input
									type="hidden"
									aria-hidden="true"
									{...register("roleId", { required: "Role is required" })}
								/>
								<Select
									options={roles.map((role: any) => ({
										value: role.id,
										label: role.name,
									}))}
									value={watch("roleId")}
									onChange={(value) =>
										setValue("roleId", value, {
											shouldValidate: true,
											shouldDirty: true,
										})
									}
									placeholder={
										isLoadingRoles ? "Loading roles..." : "Select Role"
									}
									disabled={isLoadingRoles}
									name="roleId"
									error={Boolean(errors.roleId)}
								/>
								<ConstraintTokenRow
									tokens={[
										{
											label: "1",
											tone: errors.roleId
												? "invalid"
												: watchedRoleId
													? "default"
													: "invalid",
										},
									]}
								/>
							</div>
						</div>

						<div className="flex justify-end gap-3">
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
								disabled={
									createUserMutation.isPending || updateUserMutation.isPending
								}>
								{action === "edit" ? "Update User" : "Create User"}
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
				title="User Details"
				className={HR_MODAL_WIDE_CLASS}>
				{isDeepLinkLoading && action === "view" ? (
					<div className="py-8 text-center text-gray-500">Loading user...</div>
				) : activeUser && action === "view" ? (
					<div className="space-y-4">
						{(() => {
							const user = activeUser as UserListItem;
							const metadata = user.metadata as UserMetadata | null | undefined;
							const employee = metadata?.employee;
							const reportToName = employee?.reportTo
								? `${employee.reportTo.firstName || ""} ${employee.reportTo.lastName || ""}`.trim()
								: "";
							return (
								<>
									<div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
										<div className="h-16 w-16 rounded-md bg-gray-200 flex items-center justify-center">
											{user.avatar ? (
												<img
													src={user.avatar}
													alt={getEmployeeName(user)}
													className="h-16 w-16 rounded-md object-cover"
												/>
											) : (
												<UserCog className="h-8 w-8 text-gray-500" />
											)}
										</div>
										<div>
											<h3 className="text-lg font-semibold">
												{getEmployeeName(user)}
											</h3>
											<p className="text-sm text-gray-600">
												{user.userName || "N/A"}
											</p>
											<p className="text-sm text-gray-600">
												{user.email || "N/A"}
											</p>
											<div className="mt-2 flex flex-wrap gap-2">
												<Badge
													variant={
														getAccessStatus(user) === "enrolled"
															? "success"
															: "secondary"
													}>
													{getAccessLabel(user)}
												</Badge>
												<CategoricalText
													value={getStatusLabel(user.status)}
													tone={
														user.status === "suspended"
															? "amber"
															: undefined
													}
												/>
											</div>
										</div>
									</div>

									<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
										<div>
											<label className="block text-sm font-medium text-gray-700 mb-1">
												Role
											</label>
											<div className="p-3 bg-gray-50 rounded-md border">
												{getAppRoleNames(user) || user.roleId || "N/A"}
											</div>
										</div>
										<div>
											<label className="block text-sm font-medium text-gray-700 mb-1">
												Employee ID
											</label>
											<div className="p-3 bg-gray-50 rounded-md border">
												{employee?.id || "N/A"}
											</div>
										</div>
										<div>
											<label className="block text-sm font-medium text-gray-700 mb-1">
												Department
											</label>
											<div className="p-3 bg-gray-50 rounded-md border">
												{getDepartmentName(user)}
											</div>
										</div>
										<div>
											<label className="block text-sm font-medium text-gray-700 mb-1">
												Position
											</label>
											<div className="p-3 bg-gray-50 rounded-md border">
												{getPositionTitle(user)}
											</div>
										</div>
										<div>
											<label className="block text-sm font-medium text-gray-700 mb-1">
												Level
											</label>
											<div className="p-3 bg-gray-50 rounded-md border">
												{employee?.level?.name || "N/A"}
											</div>
										</div>
										<div>
											<label className="block text-sm font-medium text-gray-700 mb-1">
												Reports To
											</label>
											<div className="p-3 bg-gray-50 rounded-md border">
												{reportToName || employee?.reportTo?.email || "N/A"}
											</div>
										</div>
										<div>
											<label className="block text-sm font-medium text-gray-700 mb-1">
												Password Change Required
											</label>
											<div className="p-3 bg-gray-50 rounded-md border">
												{metadata?.requirePasswordChange ? "Yes" : "No"}
											</div>
										</div>
										<div>
											<label className="block text-sm font-medium text-gray-700 mb-1">
												Created At
											</label>
											<div className="p-3 bg-gray-50 rounded-md border">
												{formatDateTime(user.createdAt)}
											</div>
										</div>
									</div>

									<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
										<div>
											<label className="block text-sm font-medium text-gray-700 mb-1">
												Username
											</label>
											<div className="p-3 bg-gray-50 rounded-md border">
												{user.userName || "N/A"}
											</div>
										</div>
										<div>
											<label className="block text-sm font-medium text-gray-700 mb-1">
												Email
											</label>
											<div className="p-3 bg-gray-50 rounded-md border">
												{user.email || "N/A"}
											</div>
										</div>
										<div>
											<label className="block text-sm font-medium text-gray-700 mb-1">
												Organization ID
											</label>
											<div className="p-3 bg-gray-50 rounded-md border">
												{user.organizationId || "N/A"}
											</div>
										</div>
										<div>
											<label className="block text-sm font-medium text-gray-700 mb-1">
												Device Access
											</label>
											<div className="p-3 bg-gray-50 rounded-md border">
												{getAccessLabel(user)}
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
										<Button onClick={() => openEdit(user)}>Edit User</Button>
									</div>
								</>
							);
						})()}
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">User not found</div>
				)}
			</Modal>

			{/* Reset Password Modal */}
			<Modal
				open={action === "reset-password"}
				onOpenChange={(open) => {
					if (!open) {
						updateSearchParams((next) => {
							next.delete("action");
							next.delete("id");
						});
					}
				}}
				title="Reset Password"
				className={HR_MODAL_STANDARD_CLASS}>
				{isDeepLinkLoading && action === "reset-password" ? (
					<div className="py-8 text-center text-gray-500">Loading user...</div>
				) : activeUser && action === "reset-password" ? (
					<div className="space-y-4">
						{(() => {
							const user = activeUser as UserListItem;
							return (
								<>
									<div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-gray-700">
										<p className="font-medium text-gray-900">
											Reset access for {getEmployeeName(user)}
										</p>
										<p className="mt-2">
											This will generate the employee&apos;s temporary
											password using the current HRIS default-password format.
										</p>
										<p className="mt-2">
											On their next login, they will be forced to change their
											password before continuing.
										</p>
										<p className="mt-2">
											This does not restart onboarding. It only enforces
											password reset.
										</p>
									</div>
									<div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
										<div>
											<span className="font-medium text-gray-900">User:</span>{" "}
											{getEmployeeName(user)}
										</div>
										<div className="mt-1">
											<span className="font-medium text-gray-900">
												Email:
											</span>{" "}
											{user.email || "N/A"}
										</div>
										<div className="mt-1">
											<span className="font-medium text-gray-900">
												Username:
											</span>{" "}
											{user.userName || "N/A"}
										</div>
									</div>
									<div className="flex justify-end gap-3">
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
											type="button"
											onClick={confirmResetPassword}
											disabled={resetUserPasswordMutation.isPending}>
											Reset Password
										</Button>
									</div>
								</>
							);
						})()}
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">User not found.</div>
				)}
			</Modal>

			{/* Delete Confirmation Modal */}
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
				title="Delete User"
				className={HR_MODAL_STANDARD_CLASS}>
				{isDeepLinkLoading && action === "delete" ? (
					<div className="py-8 text-center text-gray-500">Loading user...</div>
				) : activeUser && action === "delete" ? (
					<div className="space-y-4">
						{(() => {
							const user = activeUser as any;
							return (
								<div className="p-4 bg-red-50 border border-red-200 rounded-md">
									<p className="text-sm text-red-800">
										This action cannot be undone. This will permanently delete
										the user <strong>{user.userName}</strong> ({user.email}).
									</p>
								</div>
							);
						})()}
						<div className="flex justify-end gap-3">
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
								type="button"
								variant="destructive"
								onClick={confirmDelete}
								disabled={deleteUserMutation.isPending}>
								{deleteUserMutation.isPending ? "Deleting..." : "Delete User"}
							</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">User not found</div>
				)}
			</Modal>
		</div>
	);
}
