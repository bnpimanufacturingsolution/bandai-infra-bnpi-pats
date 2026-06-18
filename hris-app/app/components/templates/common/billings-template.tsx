import { useMemo } from "react";
import { SummaryCard } from "~/components/atoms/SummaryCard";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { FileText, Wallet, Landmark, AlertTriangle, MoreVertical, Eye } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useStatementOfAccounts } from "~/lib/hooks/useStatementOfAccounts";
import type { StatementOfAccount } from "~/zod/statementofaccount.zod";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

interface BillingsTemplateProps {
	title?: string;
	description?: string;
}

type StatementOfAccountBillingRow = Pick<
	StatementOfAccount,
	| "id"
	| "soaNumber"
	| "name"
	| "startDate"
	| "endDate"
	| "dueDate"
	| "totalAmount"
	| "totalRemitted"
	| "totalOutstanding"
	| "status"
	| "eppReconciled"
	| "remitteeName"
>;

type SOADisplayStatus = "PENDING" | "APPROVED" | "REMITTED" | "RECONCILED" | "DISPUTED" | "CLOSED";

const toDisplayStatus = (status: StatementOfAccountBillingRow["status"]): SOADisplayStatus => {
	switch (status) {
		case "DRAFT":
		case "PENDING_REVIEW":
		case "PARTIALLY_REMITTED":
			return "PENDING";
		case "APPROVED":
			return "APPROVED";
		case "REMITTED":
			return "REMITTED";
		case "RECONCILED":
			return "RECONCILED";
		case "DISPUTED":
			return "DISPUTED";
		case "CLOSED":
			return "CLOSED";
		default:
			return "PENDING";
	}
};

const statusStyles: Record<SOADisplayStatus, string> = {
	PENDING: "bg-yellow-100 text-yellow-800 border border-yellow-200",
	APPROVED: "bg-blue-100 text-blue-800 border border-blue-200",
	REMITTED: "bg-green-100 text-green-800 border border-green-200",
	RECONCILED: "bg-emerald-100 text-emerald-800 border border-emerald-200",
	DISPUTED: "bg-red-100 text-red-800 border border-red-200",
	CLOSED: "bg-slate-100 text-slate-700 border border-slate-200",
};

const formatCurrency = (value: number) =>
	new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);

const formatDate = (value?: Date | string) =>
	value
		? new Date(value).toLocaleDateString("en-PH", {
				month: "short",
				day: "numeric",
				year: "numeric",
			})
		: "-";

export function BillingsTemplate({
	title = "Statement of Account",
	description = "Track payroll-linked billings and remittance status.",
}: BillingsTemplateProps) {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();

	const searchQuery = searchParams.get("search") || undefined;
	const statusFilter = searchParams.get("status") || undefined;
	const reconciledFilter = searchParams.get("eppReconciled") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;

	const filterParts: string[] = [];
	if (statusFilter && statusFilter !== "all") {
		filterParts.push(`status:${statusFilter}`);
	}
	if (reconciledFilter === "true" || reconciledFilter === "false") {
		filterParts.push(`eppReconciled:${reconciledFilter}`);
	}
	const filterString = filterParts.length > 0 ? filterParts.join(",") : undefined;

	const { data: soaData, isLoading } = useStatementOfAccounts({
		page: pageParam,
		limit: limitParam,
		query: searchQuery,
		filter: filterString,
		sort: "createdAt",
		order: "desc",
		count: true,
		pagination: true,
	});

	const rows = (soaData?.statementofaccounts || []) as StatementOfAccountBillingRow[];
	const pagination = soaData?.pagination;

	const totals = useMemo(() => {
		return rows.reduce(
			(acc, item) => {
				acc.totalCount += 1;
				acc.totalBilled += Number(item.totalAmount || 0);
				acc.totalRemitted += Number(item.totalRemitted || 0);
				acc.totalOutstanding += Number(item.totalOutstanding || 0);
				return acc;
			},
			{ totalCount: 0, totalBilled: 0, totalRemitted: 0, totalOutstanding: 0 },
		);
	}, [rows]);

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const columns: Column<StatementOfAccountBillingRow>[] = [
		{
			key: "soaNumber",
			label: "SOA No.",
			render: (value: string, item) => (
				<button
					type="button"
					onClick={() => navigate(`/hr/billings/${item.id}`)}
					className="font-medium text-orange-600 hover:text-orange-700 hover:underline text-left">
					{value}
				</button>
			),
		},
		{
			key: "name",
			label: "Name",
			render: (value: string, item) => (
				<div className="space-y-1">
					<p className="text-sm font-medium text-gray-900">{value}</p>
					<p className="text-xs text-gray-500">{item.remitteeName || "No remittee"}</p>
				</div>
			),
		},
		{
			key: "coverage",
			label: "Coverage",
			render: (_, item) => (
				<span className="text-sm text-gray-700">
					{formatDate(item.startDate)} - {formatDate(item.endDate)}
				</span>
			),
		},
		{
			key: "dueDate",
			label: "Due Date",
			render: (value: Date | string | undefined) => (
				<span className="text-sm text-gray-700">{formatDate(value)}</span>
			),
		},
		{
			key: "totalAmount",
			label: "Total Amount",
			render: (value: number) => (
				<span className="text-sm font-medium text-gray-900">
					{formatCurrency(Number(value || 0))}
				</span>
			),
		},
		{
			key: "totalRemitted",
			label: "Remitted",
			render: (value: number) => (
				<span className="text-sm text-green-700">{formatCurrency(Number(value || 0))}</span>
			),
		},
		{
			key: "totalOutstanding",
			label: "Outstanding",
			render: (value: number) => (
				<span className="text-sm text-red-700">{formatCurrency(Number(value || 0))}</span>
			),
		},
		{
			key: "status",
			label: "Status",
			render: (value: StatementOfAccountBillingRow["status"]) => {
				const display = toDisplayStatus(value);
				return <Badge className={statusStyles[display]}>{display}</Badge>;
			},
		},
		{
			key: "eppReconciled",
			label: "Reconciled",
			render: (value: boolean) => (
				<Badge variant={value ? "success-soft" : "secondary"}>{value ? "Yes" : "No"}</Badge>
			),
		},
	];

	const filters: FilterOption[] = [
		{
			key: "status",
			label: "Status",
			options: [
				{ value: "DRAFT", label: "Draft" },
				{ value: "PENDING_REVIEW", label: "Pending Review" },
				{ value: "APPROVED", label: "Approved" },
				{ value: "PARTIALLY_REMITTED", label: "Partially Remitted" },
				{ value: "REMITTED", label: "Remitted" },
				{ value: "RECONCILED", label: "Reconciled" },
				{ value: "DISPUTED", label: "Disputed" },
				{ value: "CLOSED", label: "Closed" },
			],
		},
		{
			key: "eppReconciled",
			label: "Reconciled",
			options: [
				{ value: "true", label: "Yes" },
				{ value: "false", label: "No" },
			],
		},
	];

	const handleView = (item: StatementOfAccountBillingRow) => {
		navigate(`/hr/billings/${item.id}`);
	};

	const handleSearch = (query: string) => {
		updateSearchParams((next) => {
			if (query) {
				next.set("search", query);
			} else {
				next.delete("search");
			}
			next.set("page", "1");
		});
	};

	const handleFilterChange = (filtersMap: Record<string, string>) => {
		updateSearchParams((next) => {
			if (filtersMap.status && filtersMap.status !== "all") {
				next.set("status", filtersMap.status);
			} else {
				next.delete("status");
			}
			if (filtersMap.eppReconciled && filtersMap.eppReconciled !== "all") {
				next.set("eppReconciled", filtersMap.eppReconciled);
			} else {
				next.delete("eppReconciled");
			}
			next.set("page", "1");
		});
	};

	const handlePageChange = (page: number) => {
		updateSearchParams((next) => {
			next.set("page", page.toString());
		});
	};

	return (
		<div className="space-y-6">
			<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
				<SummaryCard
					title="Total SOA Count"
					value={totals.totalCount}
					description="Statements in current result"
					icon={FileText}
					color="orange"
				/>
				<SummaryCard
					title="Total Billed Amount"
					value={formatCurrency(totals.totalBilled)}
					description="Gross billed amount"
					icon={Wallet}
					color="blue"
				/>
				<SummaryCard
					title="Total Remitted"
					value={formatCurrency(totals.totalRemitted)}
					description="Payments already remitted"
					icon={Landmark}
					color="green"
				/>
				<SummaryCard
					title="Total Outstanding"
					value={formatCurrency(totals.totalOutstanding)}
					description="Pending remittance amount"
					icon={AlertTriangle}
					color="red"
				/>
			</div>

			<DataTable<StatementOfAccountBillingRow>
				title={title}
				description={description}
				data={rows}
				columns={columns}
				filters={filters}
				isLoading={isLoading}
				searchFields={["soaNumber", "name", "remitteeName"]}
				emptyMessage="No statement of account records found"
				emptyDescription="Try adjusting your filters or search query."
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={pagination?.total || rows.length}
				onSearch={handleSearch}
				onFilterChange={handleFilterChange}
				onPageChange={handlePageChange}
				searchValue={searchQuery || ""}
				renderActions={(item) => (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="sm" aria-label="Open actions">
								<MoreVertical className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={() => handleView(item)}>
								<Eye className="h-4 w-4 mr-2" />
								View
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
				onExportPDF={() => {
					toast.info("SOA PDF export will be wired in the next update.");
				}}
				onExportExcel={() => {
					toast.info("SOA Excel export will be wired in the next update.");
				}}
			/>
		</div>
	);
}
