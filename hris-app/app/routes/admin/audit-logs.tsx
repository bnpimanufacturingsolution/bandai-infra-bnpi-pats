import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, FileText, LayoutList, Shield } from "lucide-react";
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
import { useAuditLogs } from "~/lib/hooks/useAuditLogs";
import { formatDateForExport, formatDateTime, truncateText } from "~/lib/utils/text-utils";
import type { AuditLogRecord } from "~/services/audit-logs.service";

const SEVERITY_BADGE_STYLES: Record<string, string> = {
	LOW: "border border-slate-200 bg-slate-100 text-slate-700",
	MEDIUM: "border border-amber-200 bg-amber-50 text-amber-700",
	HIGH: "border border-orange-200 bg-orange-50 text-orange-700",
	CRITICAL: "border border-rose-200 bg-rose-50 text-rose-700",
};

const TYPE_BADGE_STYLES: Record<string, string> = {
	CREATE: "border border-emerald-200 bg-emerald-50 text-emerald-700",
	UPDATE: "border border-orange-200 bg-orange-50 text-orange-700",
	DELETE: "border border-rose-200 bg-rose-50 text-rose-700",
	LOGIN: "border border-sky-200 bg-sky-50 text-sky-700",
	LOGOUT: "border border-slate-200 bg-slate-100 text-slate-700",
	READ: "border border-violet-200 bg-violet-50 text-violet-700",
	REGISTER: "border border-amber-200 bg-amber-50 text-amber-700",
};

type DisplayRow = {
	label: string;
	before?: string;
	after?: string;
};

type AuditPayloadRecord = {
	resource?: string;
	organizationId?: string;
	originalEntityId?: string;
	entityIdFallbackUsed?: boolean;
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

const isObjectIdLike = (value: string) => /^[a-fA-F0-9]{24}$/.test(value.trim());

const isTechnicalKey = (key: string) => {
	const lowered = key.toLowerCase();
	return (
		lowered === "id" ||
		lowered.endsWith("id") ||
		lowered === "_id" ||
		lowered === "organizationid" ||
		lowered === "employeeid" ||
		lowered === "userid" ||
		lowered === "roleid"
	);
};

const hasMeaningfulNestedValue = (value: unknown): boolean => {
	if (value === null || value === undefined) return false;
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 && !isObjectIdLike(trimmed);
	}
	if (typeof value === "number" || typeof value === "boolean") return true;
	if (Array.isArray(value)) return value.some((entry) => hasMeaningfulNestedValue(entry));
	if (typeof value === "object") {
		return Object.entries(value as Record<string, unknown>).some(
			([key, entry]) => !isTechnicalKey(key) && hasMeaningfulNestedValue(entry),
		);
	}
	return false;
};

const formatValue = (value: unknown, key?: string): string | null => {
	if (value === null || value === undefined) return null;

	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return null;
		if (isTechnicalKey(key || "") && isObjectIdLike(trimmed)) return null;
		if (isObjectIdLike(trimmed)) return null;
		return trimmed;
	}

	if (typeof value === "boolean") return value ? "Yes" : "No";
	if (typeof value === "number") return String(value);

	if (Array.isArray(value)) {
		const formatted = value
			.map((entry) => formatValue(entry))
			.filter((entry): entry is string => Boolean(entry));
		if (formatted.length === 0) return null;
		if (formatted.length <= 3) return formatted.join(", ");
		return `${formatted.length} items`;
	}

	if (typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(
				([nestedKey, nestedValue]) =>
					!isTechnicalKey(nestedKey) && hasMeaningfulNestedValue(nestedValue),
			)
			.map(([nestedKey, nestedValue]) => {
				const formatted = formatValue(nestedValue, nestedKey);
				return formatted ? `${toTitleCase(nestedKey)}: ${formatted}` : null;
			})
			.filter((entry): entry is string => Boolean(entry));

		if (entries.length === 0) return null;
		if (entries.length === 1) return entries[0];
		return truncateText(entries.join(" | "), 80);
	}

	return truncateText(String(value), 80);
};

const formatFieldLabel = (key: string) =>
	toTitleCase(
		key
			.replace(/([a-z])([A-Z])/g, "$1 $2")
			.replace(/\./g, " ")
			.replace(/_/g, " "),
	);

const getPayloadRecord = (log: AuditLogRecord): AuditPayloadRecord =>
	log.payload && typeof log.payload === "object" && !Array.isArray(log.payload)
		? (log.payload as AuditPayloadRecord)
		: {};

const getResourceLabel = (log: AuditLogRecord) => {
	const payload = getPayloadRecord(log);
	return toTitleCase(payload.resource || log.entity?.type || "system");
};

const getChangeRows = (log: AuditLogRecord): DisplayRow[] => {
	const before =
		log.changes?.before &&
		typeof log.changes.before === "object" &&
		!Array.isArray(log.changes.before)
			? (log.changes.before as Record<string, unknown>)
			: {};
	const after =
		log.changes?.after &&
		typeof log.changes.after === "object" &&
		!Array.isArray(log.changes.after)
			? (log.changes.after as Record<string, unknown>)
			: {};

	return Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
		.filter((key) => !isTechnicalKey(key))
		.reduce<DisplayRow[]>((rows, key) => {
			const beforeValue = formatValue(before[key], key);
			const afterValue = formatValue(after[key], key);

			if (!beforeValue && !afterValue) return rows;
			if (beforeValue === afterValue) return rows;

			rows.push({
				label: formatFieldLabel(key),
				before: beforeValue || "Not available",
				after: afterValue || "Not available",
			});
			return rows;
		}, []);
};

const getRecordHeadline = (log: AuditLogRecord) =>
	log.description?.trim() ||
	`${toTitleCase(log.type)} ${toTitleCase(log.entity?.type || "event")}`;

const getEntitySummary = (log: AuditLogRecord) => {
	const rows = getChangeRows(log);
	const priorityKeys = ["code", "name", "title", "email", "username", "status"];
	const after =
		log.changes?.after &&
		typeof log.changes.after === "object" &&
		!Array.isArray(log.changes.after)
			? (log.changes.after as Record<string, unknown>)
			: {};
	const before =
		log.changes?.before &&
		typeof log.changes.before === "object" &&
		!Array.isArray(log.changes.before)
			? (log.changes.before as Record<string, unknown>)
			: {};

	for (const key of priorityKeys) {
		const value = formatValue(after[key], key) || formatValue(before[key], key);
		if (value) return value;
	}

	return rows[0]?.after || rows[0]?.before || toTitleCase(log.entity?.type || "System Event");
};

const getActorSummary = (log: AuditLogRecord) => {
	const after =
		log.changes?.after &&
		typeof log.changes.after === "object" &&
		!Array.isArray(log.changes.after)
			? (log.changes.after as Record<string, unknown>)
			: {};

	for (const key of ["userName", "email", "name", "title", "code"]) {
		const value = formatValue(after[key], key);
		if (value) return value;
	}

	if (log.employeeId && !isObjectIdLike(log.employeeId)) return log.employeeId;
	return "System";
};

const getContextRows = (log: AuditLogRecord): Array<{ label: string; value: string }> => {
	const payload = getPayloadRecord(log);
	const rows = [
		{ label: "Action", value: toTitleCase(log.type) || "System event" },
		{ label: "Resource", value: getResourceLabel(log) },
		{ label: "Actor", value: getActorSummary(log) },
		{ label: "Method", value: formatValue(log.metadata?.method) || "System event" },
		{ label: "Path", value: formatValue(log.metadata?.path) || "Not available" },
		{ label: "IP", value: formatValue(log.metadata?.ip) || "Not available" },
		{
			label: "Original ID",
			value: formatValue(payload.originalEntityId) || "Not available",
		},
	];

	return rows.filter((row) => row.value !== "Not available" || row.label === "Actor");
};

const formatChangesPreview = (log: AuditLogRecord) => {
	const rows = getChangeRows(log);
	if (rows.length === 0) return "No changes recorded";
	return rows
		.slice(0, 2)
		.map((row) => `${row.label}: ${row.after || row.before || "Updated"}`)
		.join(" | ");
};

const exportAuditLogsToCsv = (items: AuditLogRecord[]) => {
	const csvContent = [
		["Timestamp", "Type", "Severity", "Entity", "Description", "Changes", "Method"],
		...items.map((item) => [
			formatDateForExport(item.timestamp || item.createdAt),
			item.type,
			item.severity,
			item.entity?.type || "",
			item.description || "",
			formatChangesPreview(item),
			item.metadata?.method || "",
		]),
	]
		.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
		.join("\n");

	const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
	const link = document.createElement("a");
	const url = URL.createObjectURL(blob);
	link.setAttribute("href", url);
	link.setAttribute("download", `audit_logs_${new Date().toISOString().split("T")[0]}.csv`);
	link.style.visibility = "hidden";
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
};

const exportAuditLogsToPdf = (items: AuditLogRecord[]) => {
	const printWindow = window.open("", "_blank");
	if (!printWindow) return;

	const tableHTML = `
		<html>
			<head>
				<title>Audit Logs Export</title>
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
				<h1>Audit Logs</h1>
				<p>Generated on: ${formatDateTime(new Date())}</p>
				<table>
					<thead>
						<tr>
							<th>Timestamp</th>
							<th>Type</th>
							<th>Severity</th>
							<th>Entity</th>
							<th>Description</th>
							<th>Changes</th>
							<th>Method</th>
						</tr>
					</thead>
					<tbody>
						${items
							.map(
								(item) => `
								<tr>
									<td>${formatDateTime(item.timestamp || item.createdAt)}</td>
									<td>${item.type}</td>
									<td>${item.severity}</td>
									<td>${item.entity?.type || ""}</td>
									<td>${item.description || ""}</td>
									<td>${formatChangesPreview(item)}</td>
									<td>${item.metadata?.method || ""}</td>
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

function AuditLogDetailsModal({
	record,
	onClose,
}: {
	record: AuditLogRecord | null;
	onClose: () => void;
}) {
	const changeRows = useMemo(() => (record ? getChangeRows(record) : []), [record]);
	const contextRows = useMemo(() => (record ? getContextRows(record) : []), [record]);

	return (
		<Dialog open={!!record} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="w-[98vw] max-w-[98vw] sm:max-w-[98vw] lg:max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
				<div className="border-b border-slate-200 bg-slate-50/80 px-5 py-4">
					<DialogHeader className="gap-3 text-left">
						<div className="flex flex-wrap items-center gap-2">
							<div className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-700">
								<Shield className="h-3.5 w-3.5" />
								Audit Detail
							</div>
							{record && (
								<>
									<Badge
										className={
											TYPE_BADGE_STYLES[record.type] ||
											"border border-slate-200 bg-slate-100 text-slate-700"
										}>
										{toTitleCase(record.type)}
									</Badge>
									<Badge
										className={
											SEVERITY_BADGE_STYLES[record.severity] ||
											"border border-slate-200 bg-slate-100 text-slate-700"
										}>
										{toTitleCase(record.severity)}
									</Badge>
								</>
							)}
						</div>
						<DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
							{record ? getRecordHeadline(record) : ""}
						</DialogTitle>
						<DialogDescription className="text-sm leading-5 text-slate-600">
							{record
								? `${toTitleCase(record.entity?.type || "system event")} • ${formatDateTime(record.timestamp || record.createdAt)}`
								: ""}
						</DialogDescription>
					</DialogHeader>
				</div>

				<div className="max-h-[76vh] overflow-y-auto px-5 py-4">
					<div className="grid gap-3 lg:grid-cols-[0.85fr_1.35fr]">
						<div className="space-y-3">
							<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
								<div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
									Context
								</div>
								<div className="space-y-2.5">
									{contextRows.map((row) => (
										<div key={row.label} className="min-w-0">
											<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
												{row.label}
											</div>
											<div className="mt-1 break-words text-sm font-medium leading-5 text-slate-800">
												{row.value}
											</div>
										</div>
									))}
								</div>
							</div>

							<div className="rounded-2xl border border-orange-100 bg-orange-50 p-4 text-sm leading-5 text-orange-900">
								<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-500">
									Entity
								</div>
								<div className="mt-1 break-words font-medium">
									{record ? getEntitySummary(record) : "System event"}
								</div>
							</div>
						</div>

						<div className="rounded-2xl border border-slate-200 bg-white p-4">
							<div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
								Changed Fields
							</div>
							{changeRows.length === 0 ? (
								<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
									No changes recorded.
								</div>
							) : (
								<div className="space-y-2.5">
									{changeRows.map((row) => (
										<div
											key={row.label}
											className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
											<div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
												{row.label}
											</div>
											<div className="grid gap-2 md:grid-cols-2">
												<div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
													<div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
														Before
													</div>
													<div className="mt-1 break-words text-sm leading-5 text-slate-700">
														{row.before || "Not available"}
													</div>
												</div>
												<div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5">
													<div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-500">
														After
													</div>
													<div className="mt-1 break-words text-sm leading-5 text-orange-900">
														{row.after || "Not available"}
													</div>
												</div>
											</div>
										</div>
									))}
								</div>
							)}
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

export default function AuditLogsPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const [selectedRecord, setSelectedRecord] = useState<AuditLogRecord | null>(null);
	const openDetails = (record: AuditLogRecord) => setSelectedRecord(record);

	const searchQuery = searchParams.get("search") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const typeFilter = searchParams.get("type") || undefined;
	const severityFilter = searchParams.get("severity") || undefined;
	const sortParam = searchParams.get("sort") || "timestamp";
	const orderParam = (searchParams.get("order") as "asc" | "desc") || "desc";

	const filterString = buildFilterString({
		type: typeFilter || "",
		severity: severityFilter || "",
	});

	const { data, isLoading } = useAuditLogs({
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

	const items = useMemo(() => data?.auditLoggings || [], [data?.auditLoggings]);
	const pagination = data?.pagination;

	const stats = useMemo(() => {
		const highRiskCount = items.filter((item) =>
			["HIGH", "CRITICAL"].includes(String(item.severity || "")),
		).length;
		const authEvents = items.filter((item) =>
			["LOGIN", "LOGOUT", "REGISTER"].includes(item.type),
		).length;
		const uniqueActors = new Set(items.map((item) => getActorSummary(item)).filter(Boolean))
			.size;

		return {
			total: pagination?.total || data?.count || items.length,
			highRiskCount,
			authEvents,
			uniqueActors,
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
			key: "type",
			label: "Type",
			options: Array.from(new Set(items.map((item) => item.type).filter(Boolean))).map(
				(value) => ({
					value,
					label: toTitleCase(value),
				}),
			),
		},
		{
			key: "severity",
			label: "Severity",
			options: Array.from(new Set(items.map((item) => item.severity).filter(Boolean))).map(
				(value) => ({
					value,
					label: toTitleCase(value),
				}),
			),
		},
	];

	const columns: Column<AuditLogRecord>[] = [
		{
			key: "timestamp",
			label: "When",
			width: "150px",
			render: (_value, item) => (
				<div className="space-y-1">
					<div className="text-sm font-semibold text-slate-900">
						{formatDateTime(item.timestamp || item.createdAt)}
					</div>
					<div className="text-xs uppercase tracking-[0.18em] text-slate-400">
						{formatValue(item.metadata?.method) || "System"}
					</div>
				</div>
			),
		},
		{
			key: "type",
			label: "Action",
			width: "110px",
			render: (value) => (
				<div className="space-y-2">
					<Badge
						className={
							TYPE_BADGE_STYLES[value] ||
							"border border-slate-200 bg-slate-100 text-slate-700"
						}>
						{toTitleCase(value)}
					</Badge>
				</div>
			),
		},
		{
			key: "entity",
			label: "Resource",
			width: "150px",
			sortable: false,
			render: (_value, item) => (
				<button
					type="button"
					className={clickableCellClassName}
					onClick={() => openDetails(item)}>
					<div className="space-y-2">
						<div className="text-sm font-semibold text-slate-900">
							{getResourceLabel(item)}
						</div>
						<div className="text-xs text-slate-500 group-hover:text-slate-700">
							{truncateText(getEntitySummary(item), 26)}
						</div>
					</div>
				</button>
			),
		},
		{
			key: "severity",
			label: "Severity",
			width: "105px",
			render: (value) => (
				<Badge
					className={
						SEVERITY_BADGE_STYLES[value] ||
						"border border-slate-200 bg-slate-100 text-slate-700"
					}>
					{toTitleCase(value)}
				</Badge>
			),
		},
		{
			key: "description",
			label: "Activity",
			width: "260px",
			render: (_value, item) => (
				<button
					type="button"
					className={clickableCellClassName}
					onClick={() => openDetails(item)}>
					<div className="space-y-1.5">
						<div className="text-sm font-medium leading-5 text-slate-900 group-hover:underline">
							{getRecordHeadline(item)}
						</div>
						<div className="flex items-center justify-between gap-3">
							<div className="text-xs text-slate-500">
								{toTitleCase(item.entity?.type || "System")}
							</div>
							<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-600">
								Open
							</div>
						</div>
					</div>
				</button>
			),
		},
		{
			key: "changes",
			label: "Changes",
			width: "230px",
			sortable: false,
			render: (_value, item) => {
				const rows = getChangeRows(item);
				if (rows.length === 0) {
					return <span className="text-sm text-slate-400">No changes recorded</span>;
				}

				return (
					<div className="space-y-1.5">
						{rows.slice(0, 2).map((row) => (
							<div
								key={row.label}
								className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
								<div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
									{row.label}
								</div>
								<div className="mt-1 text-xs font-medium text-slate-700">
									{truncateText(row.after || row.before || "Updated", 30)}
								</div>
							</div>
						))}
					</div>
				);
			},
		},
		{
			key: "employeeId",
			label: "Actor",
			width: "170px",
			render: (_value, item) => (
				<div className="space-y-1">
					<div className="text-sm font-medium text-slate-900">
						{getActorSummary(item)}
					</div>
					<div className="text-xs text-slate-400">
						{formatValue(item.metadata?.ip) || "No IP shown"}
					</div>
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
			["type", "severity"].forEach((key) => {
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
		const nextSortKey = key === "entityId" ? "entity.id" : key;
		updateSearchParams((next) => {
			next.set("sort", nextSortKey);
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
								Audit Center
							</div>
							<div className="space-y-1">
								<h1 className="text-2xl font-semibold tracking-tight text-slate-900">
									Audit Logs
								</h1>
								<p className="max-w-2xl text-sm leading-5 text-slate-600">
									Review record changes and auth events in one compact trail.
								</p>
							</div>
						</div>
						<div className="flex flex-wrap gap-2">
							<Button
								type="button"
								className="h-10 rounded-2xl bg-orange-600 px-4 text-white hover:bg-orange-700"
								onClick={() => exportAuditLogsToCsv(items)}>
								<Download className="mr-2 h-4 w-4" />
								Export CSV
							</Button>
							<Button
								type="button"
								variant="outline"
								className="h-10 rounded-2xl border-orange-200 bg-white text-orange-700 hover:bg-orange-50"
								onClick={() => exportAuditLogsToPdf(items)}>
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
								High Risk
							</div>
							<div className="mt-1 text-lg font-semibold text-orange-900">
								{stats.highRiskCount}
							</div>
						</div>
						<div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
							<div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">
								Auth Events
							</div>
							<div className="mt-1 text-lg font-semibold text-amber-900">
								{stats.authEvents}
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
					</div>
				</CardContent>
			</Card>

			<DataTable
				title="Audit Timeline"
				description="Search, filter, sort, export, and inspect each audit event."
				data={items}
				columns={columns}
				filters={filterOptions}
				isLoading={isLoading}
				emptyMessage="No audit logs found"
				emptyDescription="New local login, user setup, and record changes will appear here."
				searchWidth="w-full md:w-80"
				searchPlaceholder="Search event, actor, or description..."
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
				onExportPDF={() => exportAuditLogsToPdf(items)}
				onExportExcel={() => exportAuditLogsToCsv(items)}
				rowClassName={(item) =>
					item.severity === "CRITICAL"
						? "bg-rose-50/60"
						: item.severity === "HIGH"
							? "bg-orange-50/50"
							: ""
				}
			/>

			<AuditLogDetailsModal record={selectedRecord} onClose={() => setSelectedRecord(null)} />
		</div>
	);
}
