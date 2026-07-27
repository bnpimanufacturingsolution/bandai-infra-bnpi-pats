import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Download, Eye, Shield } from "lucide-react";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { AuthGuard } from "~/guards/auth-guard";
import { useHrAuditLogs } from "~/lib/hooks/useHrAuditLogs";
import { buildDatedCsvFilename, downloadCsvFile } from "~/lib/utils/csv-export";
import { formatDateForExport, formatDateTime, truncateText } from "~/lib/utils/text-utils";
import type { AuditLogRecord } from "~/services/hr-audit-logs.service";

const TYPE_BADGE_STYLES: Record<string, string> = {
	CREATE: "border border-emerald-200 bg-emerald-50 text-emerald-700",
	UPDATE: "border border-orange-200 bg-orange-50 text-orange-700",
	DELETE: "border border-rose-200 bg-rose-50 text-rose-700",
};

const SEVERITY_BADGE_STYLES: Record<string, string> = {
	LOW: "border border-slate-200 bg-slate-100 text-slate-700",
	MEDIUM: "border border-amber-200 bg-amber-50 text-amber-700",
	HIGH: "border border-orange-200 bg-orange-50 text-orange-700",
	CRITICAL: "border border-rose-200 bg-rose-50 text-rose-700",
};

const ACTION_LABELS: Record<string, string> = {
	CREATE: "Created",
	UPDATE: "Updated",
	DELETE: "Deleted",
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

type AuditLogEmployeeReference = {
	id?: string;
	employeeId?: string | null;
	person?: {
		personalInfo?: {
			firstName?: string | null;
			lastName?: string | null;
		} | null;
	} | null;
};

type HrAuditLogRecord = AuditLogRecord & {
	employee?: AuditLogEmployeeReference | null;
};

const clickableCellClassName =
	"group w-full rounded-2xl border border-transparent px-3 py-2 text-left transition-colors hover:border-orange-200 hover:bg-orange-50/60 focus-visible:border-orange-300 focus-visible:bg-orange-50/70 focus-visible:outline-none";

const toTitleCase = (value?: string | null) =>
	String(value || "")
		.replace(/[_-]+/g, " ")
		.trim()
		.replace(/\b\w/g, (char) => char.toUpperCase());

const sanitizePathForDisplay = (value?: string | null) =>
	String(value || "")
		.replace(/\/[a-fA-F0-9]{24}(?=\/|$|\?)/g, "/:id")
		.replace(
			/\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}(?=\/|$|\?)/g,
			"/:id",
		)
		.replace(/\/\d+(?=\/|$|\?)/g, "/:id");

const isObjectIdLike = (value: string) => /^[a-fA-F0-9]{24}$/.test(value.trim());
const isCuidLike = (value: string) => /^c[a-z0-9]{20,}$/i.test(value.trim());
const isUuidLike = (value: string) =>
	/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
		value.trim(),
	);
const isShortMachineIdentifier = (value: string) =>
	/^(?:user|emp|employee|actor|person|staff|request|req|audit|log|record|item)-[a-z0-9-]+$/i.test(
		value.trim(),
	);
const isOpaqueTokenLike = (value: string) => /^[a-z0-9]{16,}$/i.test(value.trim());
const isIdentifierLike = (value: string) =>
	isObjectIdLike(value) ||
	isCuidLike(value) ||
	isUuidLike(value) ||
	isShortMachineIdentifier(value) ||
	isOpaqueTokenLike(value);

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

const isActorReferenceKey = (key: string) => {
	const lowered = key.toLowerCase().replace(/[_\s.-]+/g, "");
	return [
		"user",
		"employee",
		"actor",
		"requester",
		"approver",
		"assignee",
		"owner",
		"createdby",
		"updatedby",
		"deletedby",
		"modifiedby",
	].some((token) => lowered.includes(token));
};

const isIgnoredAuditFieldKey = (key: string) => {
	const lowered = key.toLowerCase().replace(/[_\s.-]+/g, "");
	return ["createdat", "updatedat"].includes(lowered);
};

const hasMeaningfulNestedValue = (value: unknown): boolean => {
	if (value === null || value === undefined) return false;
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 && !isIdentifierLike(trimmed);
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
		if (isTechnicalKey(key || "") && isIdentifierLike(trimmed)) return null;
		if (isActorReferenceKey(key || "") && isIdentifierLike(trimmed)) return null;
		if (isIdentifierLike(trimmed)) return null;
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

const sanitizeDescription = (value?: string | null) => {
	const trimmed = String(value || "").trim();
	if (!trimmed) return null;

	return trimmed
		.replace(
			/:\s*(?:c[a-z0-9]{20,}|[a-fA-F0-9]{24}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|(?:user|emp|employee|actor|person|staff|request|req|audit|log|record|item)-[a-z0-9-]+|[a-z0-9]{16,})\s*$/i,
			"",
		)
		.replace(/\s{2,}/g, " ")
		.trim();
};

const getPayloadRecord = (log: AuditLogRecord): AuditPayloadRecord =>
	log.payload && typeof log.payload === "object" && !Array.isArray(log.payload)
		? (log.payload as AuditPayloadRecord)
		: {};

const getResourceLabel = (log: AuditLogRecord) => {
	const payload = getPayloadRecord(log);
	return toTitleCase(payload.resource || log.entity?.type || "System");
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
		.filter((key) => !isTechnicalKey(key) && !isIgnoredAuditFieldKey(key))
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

const getActorSummary = (log: HrAuditLogRecord) => {
	const employee = log.employee;
	const firstName = employee?.person?.personalInfo?.firstName || "";
	const lastName = employee?.person?.personalInfo?.lastName || "";
	const fullName = `${firstName} ${lastName}`.trim();
	if (fullName) return fullName;

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

const getEmployeeDetailsPath = (log: HrAuditLogRecord) => {
	const employeeId = log.employee?.id;
	return employeeId ? `/employee/${employeeId}?from=hr-audit-logs` : null;
};

const getActionLabel = (type?: string | null) =>
	ACTION_LABELS[String(type || "").toUpperCase()] || toTitleCase(type || "change");

const getRecordHeadline = (log: AuditLogRecord) =>
	sanitizeDescription(log.description) ||
	`${getActionLabel(log.type)} ${toTitleCase(log.entity?.type || "record")}`;

const getReadableSummary = (log: HrAuditLogRecord) => {
	const action = ACTION_LABELS[String(log.type || "").toUpperCase()]?.toLowerCase() || "changed";
	const resource = getResourceLabel(log).toLowerCase();
	const timestamp = formatDateTime(log.timestamp || log.createdAt);
	return `${resource} was ${action} on ${timestamp}.`;
};

const getChangeSummary = (log: HrAuditLogRecord) => {
	const rows = getChangeRows(log);
	if (rows.length === 0) return "No field values changed";

	const firstChange = rows[0];
	const secondChange = rows[1];
	if (!secondChange) {
		return formatChangeTransition(firstChange);
	}

	return `${firstChange.label} and ${secondChange.label} were updated`;
};

const getContextRows = (log: HrAuditLogRecord): Array<{ label: string; value: string }> => {
	const rows = [
		{ label: "Who", value: getActorSummary(log) },
		{ label: "When", value: formatDateTime(log.timestamp || log.createdAt) },
		{ label: "Risk level", value: toTitleCase(log.severity) || "Not available" },
	];

	return rows.filter((row) => row.value !== "Not available");
};

const formatChangesPreview = (log: HrAuditLogRecord) => {
	const rows = getChangeRows(log);
	if (rows.length === 0) return "No changes recorded";
	return rows.slice(0, 2).map(formatChangeTransition).join(" | ");
};

const formatChangeTransition = (row: DisplayRow) => {
	if (row.before === "Not available" && row.after !== "Not available") {
		return `${row.label}: set to ${row.after}`;
	}
	if (row.after === "Not available" && row.before !== "Not available") {
		return `${row.label}: removed ${row.before}`;
	}
	return `${row.label}: ${row.before || "Not available"} to ${row.after || "Not available"}`;
};

const getActivityDescription = (log: HrAuditLogRecord) => {
	const action = getActionLabel(log.type);
	const resource = getResourceLabel(log);
	const rawHeadline = sanitizeDescription(log.description);
	const rows = getChangeRows(log);

	let descriptionText = rawHeadline || `${action} ${resource}`;

	if (rows.length > 0) {
		const transitions = rows
			.slice(0, 2)
			.map(formatChangeTransition)
			.join(", ");

		descriptionText += ` — ${transitions}`;
		if (rows.length > 2) {
			descriptionText += ` (+${rows.length - 2} more)`;
		}
	}

	return descriptionText;
};

const exportAuditLogsToCsv = (items: HrAuditLogRecord[]) => {
	downloadCsvFile(
		buildDatedCsvFilename("hr-audit-logs"),
		[
			"When",
			"Change",
			"What",
			"Risk level",
			"Summary",
			"Changed values",
			"Who",
			"Method",
			"Path",
		],
		items.map((item) => [
			formatDateForExport(item.timestamp || item.createdAt),
			getActionLabel(item.type),
			getResourceLabel(item),
			toTitleCase(item.severity),
			getRecordHeadline(item),
			formatChangesPreview(item),
			getActorSummary(item),
			item.metadata?.method || "",
			item.metadata?.path || "",
		]),
	);
};

function AuditLogDetailsModal({
	record,
	onClose,
	onOpenEmployee,
}: {
	record: HrAuditLogRecord | null;
	onClose: () => void;
	onOpenEmployee: (record: HrAuditLogRecord) => void;
}) {
	const changeRows = useMemo(() => (record ? getChangeRows(record) : []), [record]);
	const contextRows = useMemo(() => (record ? getContextRows(record) : []), [record]);
	const employeeDetailsPath = record ? getEmployeeDetailsPath(record) : null;

	return (
		<Dialog open={!!record} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="w-[98vw] max-w-[98vw] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-[0_20px_50px_rgba(15,23,42,0.16)] sm:max-w-[98vw] lg:max-w-4xl">
				<div className="border-b border-slate-200 bg-slate-50/80 px-5 py-4">
					<DialogHeader className="gap-2 text-left">
						<div className="flex flex-wrap items-center gap-2">
							<div className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-700">
								<Shield className="h-3.5 w-3.5" />
								Log details
							</div>
							{record && (
								<Badge
									className={
										SEVERITY_BADGE_STYLES[record.severity] ||
										"border border-slate-200 bg-slate-100 text-slate-700"
									}>
									Risk: {toTitleCase(record.severity)}
								</Badge>
							)}
						</div>
						<DialogTitle className="text-xl font-semibold tracking-tight text-slate-900">
							{record ? getActivityDescription(record) : ""}
						</DialogTitle>
					</DialogHeader>
				</div>

				<div className="max-h-[70vh] overflow-y-auto px-5 py-5 space-y-4">
					<div className="grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
						{/* Info section */}
						<div className="space-y-4">
							<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
								<div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
									Metadata
								</div>
								<div className="space-y-3">
									{contextRows.map((row) => (
										<div key={row.label} className="min-w-0">
											<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
												{row.label}
											</div>
											{row.label === "Who" && record && employeeDetailsPath ? (
												<button
													type="button"
													className="mt-1 text-left text-sm font-semibold leading-5 text-slate-900 underline-offset-4 transition hover:text-orange-700 hover:underline"
													onClick={() => onOpenEmployee(record)}>
													{row.value}
												</button>
											) : (
												<div className="mt-1 break-words text-sm font-medium leading-5 text-slate-800">
													{row.value}
												</div>
											)}
										</div>
									))}
								</div>
							</div>
						</div>

						{/* Changes section */}
						<div className="rounded-2xl border border-slate-200 bg-white p-4">
							<div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
								Detailed Changes
							</div>
							{changeRows.length === 0 ? (
								<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
									No detailed values were changed for this record.
								</div>
							) : (
								<div className="space-y-3">
									{changeRows.map((row) => (
										<div
											key={row.label}
											className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
											<div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
												{row.label}
											</div>
											<div className="grid gap-2 sm:grid-cols-2">
												<div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
													<div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
														Before
													</div>
													<div className="mt-1 break-words text-xs leading-5 text-slate-700">
														{row.before || "Not available"}
													</div>
												</div>
												<div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2">
													<div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-500">
														After
													</div>
													<div className="mt-1 break-words text-xs leading-5 text-orange-950">
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

export default function HrAuditLogsPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();
	// selectedRecord is managed via URL search params for deep linking below

	const searchQuery = searchParams.get("search") || undefined;
	const typeFilter = searchParams.get("type") || undefined;
	const severityFilter = searchParams.get("severity") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const sortParam = searchParams.get("sort") || "timestamp";
	const orderParam = (searchParams.get("order") as "asc" | "desc") || "desc";

	const { data, isLoading } = useHrAuditLogs({
		page: pageParam,
		limit: limitParam,
		query: searchQuery,
		type: typeFilter,
		severity: severityFilter,
		sort: sortParam,
		order: orderParam,
	});

	const items = useMemo(
		() => (data?.auditLoggings || []) as HrAuditLogRecord[],
		[data?.auditLoggings],
	);
	const pagination = data?.pagination;

	const matchingCount = pagination?.total || items.length;
	const createCount = items.filter((item) => item.type === "CREATE").length;
	const updateCount = items.filter((item) => item.type === "UPDATE").length;
	const deleteCount = items.filter((item) => item.type === "DELETE").length;

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const selectedLogId = searchParams.get("logId") || null;
	const selectedRecord = useMemo(() => {
		return items.find((item) => item.id === selectedLogId) || null;
	}, [items, selectedLogId]);

	const setSelectedRecord = (record: HrAuditLogRecord | null) => {
		updateSearchParams((next) => {
			if (record) {
				next.set("logId", record.id);
			} else {
				next.delete("logId");
			}
		});
	};

	const handleSearch = (query: string) => {
		updateSearchParams((next) => {
			if (query) next.set("search", query);
			else next.delete("search");
			next.set("page", "1");
		});
	};

	const handleFilterChange = (filters: Record<string, string>) => {
		updateSearchParams((next) => {
			if (filters.type) next.set("type", filters.type);
			else next.delete("type");
			if (filters.severity) next.set("severity", filters.severity);
			else next.delete("severity");
			next.set("page", "1");
		});
	};

	const handlePageChange = (page: number) => {
		updateSearchParams((next) => {
			next.set("page", page.toString());
		});
	};

	const handleSort = (key: string, direction: "asc" | "desc") => {
		const nextSortKey = key === "entity" ? "entity.type" : key;
		updateSearchParams((next) => {
			next.set("sort", nextSortKey);
			next.set("order", direction);
			next.set("page", "1");
		});
	};

	const filterOptions: FilterOption[] = [
		{
			key: "type",
			label: "Change type",
			options: ["CREATE", "UPDATE", "DELETE"].map((value) => ({
				value,
				label: toTitleCase(value),
			})),
		},
		{
			key: "severity",
			label: "Risk level",
			options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((value) => ({
				value,
				label: toTitleCase(value),
			})),
		},
	];

	const columns: Column<HrAuditLogRecord>[] = [
		{
			key: "timestamp",
			label: "When",
			width: "160px",
			sortable: true,
			render: (value) => (
				<div className="space-y-0.5">
					<div className="font-medium text-slate-900">{formatDateTime(value)}</div>
				</div>
			),
		},
		{
			key: "actorName",
			label: "Who",
			width: "180px",
			sortable: true,
			render: (_value, item) => {
				const actorName = getActorSummary(item);
				const detailsPath = getEmployeeDetailsPath(item);

				return detailsPath ? (
					<button
						type="button"
						className={clickableCellClassName}
						onClick={() => navigate(detailsPath)}>
						<div className="space-y-1">
							<div className="text-sm font-semibold text-slate-900 group-hover:underline">
								{actorName}
							</div>
							<div className="text-xs text-slate-500 group-hover:text-slate-700">
								Open employee details
							</div>
						</div>
					</button>
				) : (
					<div className="px-3 py-2">
						<div className="text-sm font-medium text-slate-900">{actorName}</div>
					</div>
				);
			},
		},
		{
			key: "activity",
			label: "Activity",
			sortable: false,
			render: (_value, item) => (
				<button
					type="button"
					className={clickableCellClassName}
					onClick={() => setSelectedRecord(item)}>
					<div className="space-y-1">
						<div className="text-sm font-medium leading-5 text-slate-900 text-left group-hover:underline break-words whitespace-normal">
							{getActivityDescription(item)}
						</div>
					</div>
				</button>
			),
		},
		{
			key: "severity",
			label: "Risk",
			width: "110px",
			sortable: true,
			render: (value) => (
				<Badge
					className={
						SEVERITY_BADGE_STYLES[String(value)] ||
						"border border-slate-200 bg-slate-100 text-slate-700"
					}>
					{toTitleCase(String(value))}
				</Badge>
			),
		},
	];

	const renderActions = (item: HrAuditLogRecord) => (
		<Button type="button" variant="outline" size="sm" onClick={() => setSelectedRecord(item)}>
			<Eye className="mr-2 h-4 w-4" />
			Details
		</Button>
	);

	return (
		<AuthGuard requiredRole={["hris-hr-manager", "hris-hr-user"]}>
			<div className="space-y-6">
				<DataTable
					title="Change history"
					description="Review create, update, and delete events for sensitive HR data."
					data={items}
					columns={columns}
					filters={filterOptions}
					filterValues={{ type: typeFilter || "", severity: severityFilter || "" }}
					searchFields={["type", "severity", "description", "employeeId"]}
					onSearch={handleSearch}
					searchValue={searchQuery || ""}
					searchPlaceholder="Search people, records, or summaries..."
					onFilterChange={handleFilterChange}
					onPageChange={handlePageChange}
					onSort={handleSort}
					sortKey={sortParam}
					sortDirection={orderParam}
					titleActions={
						<Button
							type="button"
							className="h-10 rounded-2xl bg-orange-600 px-4 text-white hover:bg-orange-700"
							onClick={() => exportAuditLogsToCsv(items)}>
							<Download className="mr-2 h-4 w-4" />
							Export CSV
						</Button>
					}
					itemsPerPage={limitParam}
					currentPage={pageParam}
					totalItems={pagination?.total}
					totalPages={pagination?.totalPages}
					isLoading={isLoading}
					emptyMessage="No change records found"
					emptyDescription="No HR-sensitive create, update, or delete changes match the current filters."
					renderActions={renderActions}
					searchWidth="w-80"
					containedScroll
					showExport={false}
				/>

				<AuditLogDetailsModal
					record={selectedRecord}
					onClose={() => setSelectedRecord(null)}
					onOpenEmployee={(record) => {
						const detailsPath = getEmployeeDetailsPath(record);
						if (!detailsPath) return;
						setSelectedRecord(null);
						navigate(detailsPath);
					}}
				/>
			</div>
		</AuthGuard>
	);
}
