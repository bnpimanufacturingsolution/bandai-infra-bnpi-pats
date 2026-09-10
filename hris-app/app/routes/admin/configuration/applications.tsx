import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { MoreVertical, Settings2 } from "lucide-react";
import { useApplicationAccessList, useApplicationAccessCatalog } from "~/lib/hooks/useApplicationAccess";
import {
	lmsRoleLabel,
	epmrSubroleLabel,
	provisioningLabel,
	provenanceCaption,
} from "~/lib/application-access-ui";
import { ManageAccessDrawer } from "~/components/molecules/shared/ManageAccessDrawer";
import type { ApplicationAccessListItem } from "~/services/application-access.service";

const PROVISIONING_VARIANT: Record<
	string,
	"success" | "warning-soft" | "destructive-soft" | "secondary"
> = {
	SYNCED: "success",
	PENDING: "warning-soft",
	FAILED: "destructive-soft",
	BLOCKED: "secondary",
};

export default function ApplicationAccessPage() {
	const [searchParams, setSearchParams] = useSearchParams();

	const searchQuery = searchParams.get("search") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const statusFilter = searchParams.get("status") || "";
	const lmsRoleFilter = searchParams.get("lmsRole") || "";
	const manageEmployeeId =
		searchParams.get("action") === "manage" ? searchParams.get("id") : null;

	const { data, isLoading, isError, error, refetch } = useApplicationAccessList({
		page: pageParam,
		limit: limitParam,
		search: searchQuery,
	});
	const { data: catalogData } = useApplicationAccessCatalog();

	const items: ApplicationAccessListItem[] = data?.data?.items ?? [];
	const pagination = data?.data?.pagination;

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
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
			next.set("page", String(page));
		});
	};

	const openManage = (employeeId: string) => {
		updateSearchParams((next) => {
			next.set("action", "manage");
			next.set("id", employeeId);
		});
	};

	const closeManage = () => {
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("id");
		});
	};

	// Client-side filtering over the current page (backend supports server-side
	// search/pagination; status/role filters are page-scoped UI refinement).
	const filteredItems = useMemo(() => {
		return items.filter((item) => {
			if (statusFilter) {
				if (statusFilter === "BLOCKED" && item.eligible) return false;
				if (statusFilter !== "BLOCKED" && (!item.eligible || item.provisioningStatus !== statusFilter)) {
					return false;
				}
			}
			if (lmsRoleFilter && item.lmsRole !== lmsRoleFilter) return false;
			return true;
		});
	}, [items, statusFilter, lmsRoleFilter]);

	const filters: FilterOption[] = useMemo(
		() => [
			{
				key: "lmsRole",
				label: "LMS Role",
				type: "select",
				options: [
					{ value: "employee", label: "Employee" },
					{ value: "instructor", label: "Instructor" },
					{ value: "admin", label: "Admin" },
					{ value: "superadmin", label: "Superadmin" },
				],
			},
			{
				key: "status",
				label: "Status",
				type: "select",
				options: [
					{ value: "SYNCED", label: "Synced" },
					{ value: "PENDING", label: "Pending" },
					{ value: "FAILED", label: "Failed" },
					{ value: "BLOCKED", label: "Blocked" },
				],
			},
		],
		[],
	);

	const columns: Column<ApplicationAccessListItem>[] = [
		{
			key: "employeeName",
			label: "Employee",
			render: (_value, item) => (
				<div className="min-w-0">
					<div className="truncate font-medium text-neutral-900">
						{item.employeeName || "Unnamed employee"}
					</div>
					<div className="text-xs text-neutral-500">{item.employeeNumber}</div>
				</div>
			),
		},
		{
			key: "department",
			label: "Department",
			render: (_value, item) => (
				<div className="text-sm text-neutral-600">{item.department || "—"}</div>
			),
		},
		{
			key: "lmsRole",
			label: "LMS Role",
			render: (_value, item) => (
				<div className="min-w-0">
					<div className="text-sm">
						{item.inherited ? "Superadmin" : lmsRoleLabel(item.lmsRole)}
					</div>
					<div className="text-xs text-neutral-400">
						{provenanceCaption({
							eligible: item.eligible,
							inherited: item.inherited,
							hasExplicitConfig: item.hasExplicitConfig,
						})}
					</div>
				</div>
			),
		},
		{
			key: "epmrSubroles",
			label: "EPMR Access",
			render: (_value, item) => {
				if (!item.eligible) {
					return <span className="text-sm text-neutral-400">No access</span>;
				}
				if (!item.epmrSubroles.length) {
					return <span className="text-sm text-neutral-400">None</span>;
				}
				return (
					<div className="flex flex-wrap gap-1" aria-label={`EPMR access: ${item.epmrSubroles.map(epmrSubroleLabel).join(", ")}`}>
						{item.epmrSubroles.map((subrole) => (
							<Badge key={subrole} variant="outline" className="text-xs">
								{epmrSubroleLabel(subrole)}
							</Badge>
						))}
					</div>
				);
			},
		},
		{
			key: "provisioningStatus",
			label: "Status",
			render: (_value, item) => {
				if (!item.eligible) {
					return (
						<Badge variant="secondary">
							{item.employmentStatus.toLowerCase().replace(/_/g, " ")}
						</Badge>
					);
				}
				return (
					<Badge variant={PROVISIONING_VARIANT[item.provisioningStatus] ?? "secondary"}>
						{provisioningLabel(item.provisioningStatus)}
					</Badge>
				);
			},
		},
	];

	const renderActions = (item: ApplicationAccessListItem) => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="h-8 w-8 justify-center p-0"
					aria-label={`Manage access for ${item.employeeName || item.employeeNumber}`}>
					<MoreVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-44">
				<DropdownMenuItem onClick={() => openManage(item.employeeId)}>
					<Settings2 className="mr-2 h-4 w-4" />
					Manage Access
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<DataTable
				title="Training & Performance"
				description="Manage employee access to LMS and EPMR"
				data={filteredItems}
				columns={columns}
				searchFields={["employeeName", "employeeNumber"]}
				isLoading={isLoading}
				emptyMessage={
					isError
						? "Unable to load application access"
						: searchQuery || statusFilter || lmsRoleFilter
							? "No employees found"
							: "No employees with application access"
				}
				emptyDescription={
					isError
						? (error as any)?.message || "Please try again."
						: "Try adjusting your search or filters."
				}
				emptyActions={
					isError ? (
						<Button variant="outline" size="sm" onClick={() => refetch()}>
							Retry
						</Button>
					) : undefined
				}
				searchWidth="w-80"
				searchPlaceholder="Search employees..."
				searchValue={searchQuery || ""}
				onSearch={handleSearch}
				filters={filters}
				showFilters={true}
				filterValues={{ status: statusFilter, lmsRole: lmsRoleFilter }}
				onFilterChange={(values) => {
					updateSearchParams((next) => {
						if (values.status) next.set("status", values.status);
						else next.delete("status");
						if (values.lmsRole) next.set("lmsRole", values.lmsRole);
						else next.delete("lmsRole");
						next.set("page", "1");
					});
				}}
				renderActions={renderActions}
				showExport={false}
				showPagination={true}
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={pagination?.total}
				onPageChange={handlePageChange}
				containedScroll
			/>

			<ManageAccessDrawer
				employeeId={manageEmployeeId}
				open={!!manageEmployeeId}
				onClose={closeManage}
				catalog={catalogData?.data}
			/>
		</div>
	);
}
