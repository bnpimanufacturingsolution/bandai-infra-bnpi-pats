import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Activity, Download, Eye, FileText, LayoutList } from "lucide-react";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { Card, CardContent } from "~/components/atoms/Card";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { useActivityLog, useActivityLogs } from "~/lib/hooks/useActivityLogs";
import { formatDateForExport, formatDateTime, truncateText } from "~/lib/utils/text-utils";
import type { ActivityLogRecord } from "~/services/activity-logs.service";

const METHOD_BADGE_STYLES: Record<string, string> = {
	GET: "border border-sky-200 bg-sky-50 text-sky-700",
	POST: "border border-emerald-200 bg-emerald-50 text-emerald-700",
	PUT: "border border-amber-200 bg-amber-50 text-amber-700",
	PATCH: "border border-orange-200 bg-orange-50 text-orange-700",
	DELETE: "border border-rose-200 bg-rose-50 text-rose-700",
};

const ACTION_BADGE_STYLES: Record<string, string> = {
	CREATE: "border border-emerald-200 bg-emerald-50 text-emerald-700",
	UPDATE: "border border-orange-200 bg-orange-50 text-orange-700",
	DELETE: "border border-rose-200 bg-rose-50 text-rose-700",
	VIEW: "border border-violet-200 bg-violet-50 text-violet-700",
};

const clickableCellClassName =
	"group w-full rounded-2xl border border-transparent px-3 py-2 text-left transition-colors hover:border-orange-200 hover:bg-orange-50/60 focus-visible:border-orange-300 focus-visible:bg-orange-50/70 focus-visible:outline-none";

const buildFilterString = (filters: Record<string, string>) =>
	Object.entries(filters)
		.filter(([, value]) => value && value !== "all")
		.map(([key, value]) => `${key}:${value}`)
		.join(",");

const toTitleCase = (value?: string | null) =>
	String(value || "")
		.replace(/[_-]+/g, " ")
		.trim()
		.replace(/\b\w/g, (char) => char.toUpperCase());

const formatActor = (item: ActivityLogRecord) => {
	if (item.employeeId && !/^[a-fA-F0-9]{24}$/.test(item.employeeId)) return item.employeeId;
	return "System";
};

const formatRequest = (item: ActivityLogRecord) =>
	[item.method || "SYSTEM", item.path ? truncateText(item.path, 24) : null]
		.filter(Boolean)
		.join(" - ");

const formatPayloadValue = (value: unknown) => {
	if (value === null || value === undefined) return "No payload available";
	if (typeof value === "string") return value.trim() || "No payload available";
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
};

const exportActivityLogsToCsv = (items: ActivityLogRecord[]) => {
	const csvContent = [
		["Created", "Action", "Description", "Path", "Method", "IP", "Entity Type", "Actor"],
		...items.map((item) => [
			formatDateForExport(item.createdAt || item.updatedAt),
			item.action,
			item.description || "",
			item.path,
			item.method,
			item.ip,
			item.entityType || "",
			formatActor(item),
		]),
	]
		.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
		.join("\n");

	const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
	const link = document.createElement("a");
	const url = URL.createObjectURL(blob);
	link.setAttribute("href", url);
	link.setAttribute("download", `activity_logs_${new Date().toISOString().split("T")[0]}.csv`);
	link.style.visibility = "hidden";
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
};

const exportActivityLogsToPdf = (items: ActivityLogRecord[]) => {
	const printWindow = window.open("", "_blank");
	if (!printWindow) return;

	const tableHTML = `
		<html>
			<head>
				<title>Activity Logs Export</title>
				<style>
					body { font-family: Arial, sans-serif; margin: 20px; }
					h1 { color: #333; margin-bottom: 12px; }
					p { color: #555; }
					table { border-collapse: collapse; width: 100%; margin-top: 20px; }
					th, td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }
					th { background-color: #f2f2f2; font-weight: bold; }
				</style>
			</head>
			<body>
				<h1>Activity Logs</h1>
				<p>Generated on: ${formatDateTime(new Date())}</p>
				<table>
					<thead>
						<tr>
							<th>Created</th>
							<th>Action</th>
							<th>Description</th>
							<th>Path</th>
							<th>Method</th>
							<th>IP</th>
							<th>Entity Type</th>
							<th>Actor</th>
						</tr>
					</thead>
					<tbody>
						${items
							.map(
								(item) => `
								<tr>
									<td>${formatDateTime(item.createdAt || item.updatedAt)}</td>
									<td>${item.action}</td>
									<td>${item.description || ""}</td>
									<td>${item.path}</td>
									<td>${item.method}</td>
									<td>${item.ip}</td>
									<td>${item.entityType || ""}</td>
									<td>${formatActor(item)}</td>
								</tr>
							`,
							)
							.join("")}
					</tbody>
				</table>
			</body>
		</html>
	`;

	printWindow.document.write(tableHTML);
	printWindow.document.close();
	printWindow.print();
};

function ActivityLogDetailsModal({
	recordId,
	onClose,
}: {
	recordId: string | null;
	onClose: () => void;
}) {
	const { data: record, isLoading } = useActivityLog(recordId || "");

	return (
		<Dialog open={!!recordId} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="w-[95vw] max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
				<div className="border-b border-slate-200 bg-slate-50/80 px-5 py-4">
					<DialogHeader className="gap-3 text-left">
						<div className="flex flex-wrap items-center gap-2">
							<div className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-700">
								<Activity className="h-3.5 w-3.5" />
								Activity Detail
							</div>
							{record ? (
								<>
									<Badge
										className={
											ACTION_BADGE_STYLES[record.action] ||
											"border border-slate-200 bg-slate-100 text-slate-700"
										}>
										{toTitleCase(record.action)}
									</Badge>
									<Badge
										className={
											METHOD_BADGE_STYLES[record.method] ||
											"border border-slate-200 bg-slate-100 text-slate-700"
										}>
										{record.method || "SYSTEM"}
									</Badge>
								</>
							) : null}
						</div>
						<DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
							{record?.description || "Activity log details"}
						</DialogTitle>
						<DialogDescription className="text-sm leading-5 text-slate-600">
							{record
								? `${toTitleCase(record.entityType || "System")} • ${formatDateTime(record.createdAt || record.updatedAt)}`
								: ""}
						</DialogDescription>
					</DialogHeader>
				</div>

				<div className="max-h-[76vh] overflow-y-auto px-5 py-4">
					{isLoading ? (
						<div className="py-8 text-center text-sm text-slate-500">
							Loading activity details...
						</div>
					) : !record ? (
						<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
							Activity details are not available for this record.
						</div>
					) : (
						<div className="space-y-4">
							<div className="grid gap-3 md:grid-cols-2">
								<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
									<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
										Actor
									</div>
									<div className="mt-1 break-words text-sm font-medium text-slate-900">
										{formatActor(record)}
									</div>
								</div>
								<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
									<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
										IP Address
									</div>
									<div className="mt-1 break-words text-sm font-medium text-slate-900">
										{record.ip || "No IP shown"}
									</div>
								</div>
								<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
									<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
										Entity Type
									</div>
									<div className="mt-1 break-words text-sm font-medium text-slate-900">
										{toTitleCase(record.entityType || "System")}
									</div>
								</div>
								<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
									<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
										Page
									</div>
									<div className="mt-1 break-words text-sm font-medium text-slate-900">
										{record.page?.title ||
											record.page?.url ||
											"No page context"}
									</div>
								</div>
							</div>

							<div className="rounded-2xl border border-orange-100 bg-orange-50 p-4">
								<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-500">
									Request Path
								</div>
								<div className="mt-1 break-words text-sm font-medium text-orange-950">
									{record.path || "No route recorded"}
								</div>
							</div>

							<div className="rounded-2xl border border-slate-200 bg-white p-4">
								<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
									Payload / Metadata
								</div>
								<pre className="mt-2 overflow-x-auto rounded-2xl bg-slate-950 px-4 py-3 text-xs leading-5 text-slate-100">
									{formatPayloadValue(
										record.payload || record.headers || record.page,
									)}
								</pre>
							</div>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

export default function ActivityLogsPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

	const searchQuery = searchParams.get("search") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const actionFilter = searchParams.get("action") || undefined;
	const methodFilter = searchParams.get("method") || undefined;
	const entityTypeFilter = searchParams.get("entityType") || undefined;
	const sortParam = searchParams.get("sort") || "createdAt";
	const orderParam = (searchParams.get("order") as "asc" | "desc") || "desc";

	const filterString = buildFilterString({
		action: actionFilter || "",
		method: methodFilter || "",
		entityType: entityTypeFilter || "",
	});

	const { data, isLoading } = useActivityLogs({
		page: pageParam,
		limit: limitParam,
		query: searchQuery,
		filter: filterString || undefined,
		sort: sortParam,
		order: orderParam,
		document: true,
		pagination: true,
		count: true,
	});

	const items = useMemo(() => data?.activityLoggings || [], [data?.activityLoggings]);
	const pagination = data?.pagination;
	const openDetails = (item: ActivityLogRecord) => setSelectedRecordId(item.id);

	const stats = useMemo(() => {
		const writeActions = items.filter((item) =>
			["CREATE", "UPDATE", "DELETE"].includes(item.action),
		).length;
		const uniqueActors = new Set(items.map((item) => formatActor(item)).filter(Boolean)).size;
		const routesTouched = new Set(items.map((item) => item.path).filter(Boolean)).size;

		return {
			total: pagination?.total || data?.count || items.length,
			writeActions,
			uniqueActors,
			routesTouched,
		};
	}, [data?.count, items, pagination?.total]);

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const filterOptions: FilterOption[] = [
		{
			key: "action",
			label: "Action",
			options: [
				{ value: "CREATE", label: "Create" },
				{ value: "UPDATE", label: "Update" },
				{ value: "DELETE", label: "Delete" },
				{ value: "VIEW", label: "View" },
			],
		},
		{
			key: "method",
			label: "Method",
			options: [
				{ value: "GET", label: "GET" },
				{ value: "POST", label: "POST" },
				{ value: "PUT", label: "PUT" },
				{ value: "PATCH", label: "PATCH" },
				{ value: "DELETE", label: "DELETE" },
			],
		},
		{
			key: "entityType",
			label: "Entity Type",
			options: Array.from(
				new Set(items.map((item) => item.entityType).filter(Boolean) as string[]),
			).map((value) => ({ value, label: toTitleCase(value) })),
		},
	];

	const columns: Column<ActivityLogRecord>[] = [
		{
			key: "createdAt",
			label: "When",
			width: "180px",
			render: (_value, item) => (
				<div className="space-y-1">
					<div className="text-sm font-semibold text-slate-900">
						{formatDateTime(item.createdAt || item.updatedAt)}
					</div>
					<div className="text-xs uppercase tracking-[0.18em] text-slate-400">
						{item.method || "System"}
					</div>
				</div>
			),
		},
		{
			key: "action",
			label: "Action",
			width: "150px",
			render: (value, item) => (
				<button
					type="button"
					className={clickableCellClassName}
					onClick={() => openDetails(item)}>
					<div className="space-y-2">
						<Badge
							className={
								ACTION_BADGE_STYLES[value] ||
								"border border-slate-200 bg-slate-100 text-slate-700"
							}>
							{toTitleCase(value)}
						</Badge>
						<div className="text-xs text-slate-500">
							{toTitleCase(item.entityType || "System")}
						</div>
					</div>
				</button>
			),
		},
		{
			key: "description",
			label: "Activity",
			width: "330px",
			render: (value, item) => (
				<button
					type="button"
					className={clickableCellClassName}
					onClick={() => openDetails(item)}>
					<div className="text-sm font-medium leading-5 text-slate-900 group-hover:underline">
						{truncateText(value || "No description", 72)}
					</div>
				</button>
			),
		},
		{
			key: "path",
			label: "Request",
			width: "240px",
			render: (_value, item) => (
				<div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
					<div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
						Request
					</div>
					<div className="mt-1 text-sm text-slate-700">{formatRequest(item)}</div>
				</div>
			),
		},
		{
			key: "method",
			label: "Method",
			width: "120px",
			render: (value) => (
				<Badge
					className={
						METHOD_BADGE_STYLES[value] ||
						"border border-slate-200 bg-slate-100 text-slate-700"
					}>
					{value}
				</Badge>
			),
		},
		{
			key: "employeeId",
			label: "Actor",
			width: "190px",
			render: (_value, item) => (
				<div className="space-y-1">
					<div className="text-sm font-medium text-slate-900">{formatActor(item)}</div>
					<div className="text-xs text-slate-400">{item.ip || "No IP shown"}</div>
				</div>
			),
		},
	];

	const handleSearch = (query: string) => {
		updateSearchParams((next) => {
			if (query) next.set("search", query);
			else next.delete("search");
			next.set("page", "1");
		});
	};

	const handleFilterChange = (filters: Record<string, string>) => {
		updateSearchParams((next) => {
			["action", "method", "entityType"].forEach((key) => {
				if (filters[key]) next.set(key, filters[key]);
				else next.delete(key);
			});
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

	return (
		<div className="space-y-5">
			<Card className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.07)]">
				<CardContent className="flex flex-col gap-4 p-5 md:p-6">
					<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
						<div className="space-y-3">
							<div className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-orange-700">
								<LayoutList className="h-3.5 w-3.5" />
								Activity Center
							</div>
							<div className="space-y-1">
								<h1 className="text-2xl font-semibold tracking-tight text-slate-900">
									Activity Logs
								</h1>
								<p className="max-w-2xl text-sm leading-5 text-slate-600">
									Review request activity, touched routes, and user actions in the
									same compact admin style.
								</p>
							</div>
						</div>
						<div className="flex flex-wrap gap-2">
							<Button
								type="button"
								className="h-10 rounded-2xl bg-orange-600 px-4 text-white hover:bg-orange-700"
								onClick={() => exportActivityLogsToCsv(items)}>
								<Download className="mr-2 h-4 w-4" />
								Export CSV
							</Button>
							<Button
								type="button"
								variant="outline"
								className="h-10 rounded-2xl border-orange-200 bg-white text-orange-700 hover:bg-orange-50"
								onClick={() => exportActivityLogsToPdf(items)}>
								<FileText className="mr-2 h-4 w-4" />
								Print PDF
							</Button>
						</div>
					</div>

					<div className="grid gap-3 md:grid-cols-4">
						<div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
							<div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
								Records
							</div>
							<div className="mt-1 text-lg font-semibold text-slate-900">
								{stats.total}
							</div>
						</div>
						<div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3">
							<div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-500">
								Write Actions
							</div>
							<div className="mt-1 text-lg font-semibold text-orange-900">
								{stats.writeActions}
							</div>
						</div>
						<div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
							<div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
								Actors
							</div>
							<div className="mt-1 text-lg font-semibold text-slate-900">
								{stats.uniqueActors}
							</div>
						</div>
						<div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
							<div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">
								Routes
							</div>
							<div className="mt-1 text-lg font-semibold text-amber-900">
								{stats.routesTouched}
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			<DataTable
				title="Activity Timeline"
				description="Search, filter, sort, and export API activity."
				data={items}
				columns={columns}
				filters={filterOptions}
				searchFields={["action", "description", "path", "method", "entityType"]}
				isLoading={isLoading}
				emptyMessage="No activity logs found"
				emptyDescription="Activity logs will appear here once users interact with the system."
				searchWidth="w-full md:w-80"
				searchPlaceholder="Search activity logs..."
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={pagination?.total || data?.count}
				totalPages={pagination?.totalPages}
				searchValue={searchQuery || ""}
				onSearch={handleSearch}
				onFilterChange={handleFilterChange}
				onPageChange={handlePageChange}
				onSort={handleSort}
				onExport={() => {}}
				onExportPDF={() => exportActivityLogsToPdf(items)}
				onExportExcel={() => exportActivityLogsToCsv(items)}
				renderActions={(item) => (
					<Button
						variant="outline"
						size="sm"
						className="rounded-xl border-slate-200 text-slate-700"
						onClick={() => openDetails(item)}>
						<Eye className="h-4 w-4" />
						View Details
					</Button>
				)}
			/>

			<ActivityLogDetailsModal
				recordId={selectedRecordId}
				onClose={() => setSelectedRecordId(null)}
			/>
		</div>
	);
}
