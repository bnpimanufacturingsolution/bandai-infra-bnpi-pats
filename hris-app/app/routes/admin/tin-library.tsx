import { useMemo, useState } from "react";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Badge } from "~/components/atoms/Badge";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { Download } from "lucide-react";
import { useTinLibrary } from "~/lib/hooks/useMetrics";
import {
	buildReportFileName,
	exportRowsToCsv,
} from "~/lib/utils/report-export";

type TinStatus = "ALL" | "OK" | "MISSING" | "DUPLICATE";

const statusBadgeVariant = (status: string) => {
	switch (status) {
		case "MISSING":
			return "destructive" as const;
		case "DUPLICATE":
			return "warning" as const;
		default:
			return "success" as const;
	}
};

export default function TinLibraryPage() {
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState<TinStatus>("ALL");

	const { data, isLoading } = useTinLibrary();
	const library = data?.metrics?.tinLibrary;
	const rows = library?.rows || [];

	const filtered = useMemo(() => {
		const query = search.trim().toLowerCase();
		return rows.filter((row) => {
			if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
			if (!query) return true;
			return (
				row.name.toLowerCase().includes(query) ||
				row.empCode.toLowerCase().includes(query) ||
				row.department.toLowerCase().includes(query) ||
				(row.tin || "").includes(query)
			);
		});
	}, [rows, search, statusFilter]);

	const columns: Column<(typeof rows)[number]>[] = [
		{ key: "empCode", label: "Employee ID", render: (_v, row) => row.empCode },
		{ key: "name", label: "Name", render: (_v, row) => row.name },
		{ key: "department", label: "Department", render: (_v, row) => row.department },
		{
			key: "tin",
			label: "TIN",
			render: (_v, row) => row.tin || <span className="text-slate-400">—</span>,
		},
		{
			key: "status",
			label: "Status",
			render: (_v, row) => (
				<Badge variant={statusBadgeVariant(row.status)}>{row.status}</Badge>
			),
		},
	];

	const statusFilterOptions: SelectOption[] = [
		{ value: "ALL", label: "All" },
		{ value: "OK", label: "OK" },
		{ value: "MISSING", label: "Missing TIN" },
		{ value: "DUPLICATE", label: "Duplicate TIN" },
	];

	return (
		<div className="flex h-full min-h-0 flex-col gap-6 p-6">
			<div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
				<div>
					<h1 className="text-lg font-semibold text-slate-950">TIN Library</h1>
					<p className="text-sm text-slate-500">
						Employee TIN compliance: missing and duplicate detection for 201/BIR
						filing readiness.
					</p>
				</div>
				<Button
					variant="outline"
					onClick={() =>
						exportRowsToCsv({
							columns: [
								{ header: "Employee ID", accessor: "empCode" },
								{ header: "Name", accessor: "name" },
								{ header: "Department", accessor: "department" },
								{ header: "TIN", accessor: "tin" },
								{ header: "Status", accessor: "status" },
							],
							rows: filtered,
							fileBaseName: buildReportFileName("tin-library"),
						})
					}>
					<Download className="mr-2 h-4 w-4" />
					Export CSV
				</Button>
			</div>

			<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
				<div className="rounded-lg border border-slate-200 bg-white p-3">
					<div className="text-xs text-slate-500">Total employees</div>
					<div className="text-xl font-bold">{library?.summary?.total || 0}</div>
				</div>
				<div className="rounded-lg border border-green-200 bg-green-50 p-3">
					<div className="text-xs text-green-700">With TIN</div>
					<div className="text-xl font-bold text-green-800">
						{library?.summary?.withTin || 0}
					</div>
				</div>
				<div className="rounded-lg border border-red-200 bg-red-50 p-3">
					<div className="text-xs text-red-700">Missing TIN</div>
					<div className="text-xl font-bold text-red-800">
						{library?.summary?.missing || 0}
					</div>
				</div>
				<div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
					<div className="text-xs text-yellow-700">Duplicate TIN</div>
					<div className="text-xl font-bold text-yellow-800">
						{library?.summary?.duplicateEmployees || 0}
					</div>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<div className="w-full md:w-72">
					<Input
						placeholder="Search name, code, department, TIN…"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
					/>
				</div>
				<div className="w-full md:w-48">
					<Select
						options={statusFilterOptions}
						value={statusFilter}
						onChange={(value) => setStatusFilter(value as TinStatus)}
					/>
				</div>
			</div>

			<DataTable
				title="Employee TINs"
				data={filtered}
				columns={columns}
				isLoading={isLoading}
				emptyMessage="No employees matched"
				itemsPerPage={20}
				containedScroll
			/>
		</div>
	);
}
