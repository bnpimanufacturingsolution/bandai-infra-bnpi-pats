import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
	ArrowLeft,
	Building2,
	Eye,
	History,
	ShieldCheck,
	Users,
	Briefcase,
} from "lucide-react";
import { format } from "date-fns";
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
import { DatePickerWithRange } from "~/components/ui/date-picker-range";
import { useUser } from "~/lib/hooks/useUsers";
import { useUserActivityLogs } from "~/lib/hooks/useUserActivityLogs";
import { buildDatedCsvFilename, downloadCsvFile } from "~/lib/utils/csv-export";
import { formatDateForExport, formatDateTime, truncateText } from "~/lib/utils/text-utils";
import type { UserActivityLogRecord } from "~/services/user-activity-logs.service";

const SOURCE_LABELS: Record<string, string> = {
	activity: "Activity Log",
	audit: "Audit Log",
	request: "Request History",
	schedule: "Schedule History",
};

const CATEGORY_BADGE_STYLES: Record<string, string> = {
	attendance: "border border-sky-200 bg-sky-50 text-sky-700",
	timesheet: "border border-violet-200 bg-violet-50 text-violet-700",
	payroll: "border border-emerald-200 bg-emerald-50 text-emerald-700",
	leave: "border border-amber-200 bg-amber-50 text-amber-700",
	overtime: "border border-orange-200 bg-orange-50 text-orange-700",
	schedule: "border border-indigo-200 bg-indigo-50 text-indigo-700",
	profile: "border border-slate-200 bg-slate-100 text-slate-700",
	login: "border border-cyan-200 bg-cyan-50 text-cyan-700",
	account: "border border-rose-200 bg-rose-50 text-rose-700",
	request: "border border-neutral-200 bg-neutral-100 text-neutral-700",
	audit: "border border-neutral-200 bg-neutral-100 text-neutral-700",
};

const SOURCE_BADGE_STYLES: Record<string, string> = {
	activity: "border border-sky-200 bg-sky-50 text-sky-700",
	audit: "border border-slate-200 bg-slate-100 text-slate-700",
	request: "border border-amber-200 bg-amber-50 text-amber-700",
	schedule: "border border-indigo-200 bg-indigo-50 text-indigo-700",
};

const toTitleCase = (value?: string | null) =>
	String(value || "")
		.replace(/[_-]+/g, " ")
		.trim()
		.replace(/\b\w/g, (char) => char.toUpperCase());

const toDateInput = (date: Date) => format(date, "yyyy-MM-dd");

const parseDateRange = (from?: string | null, to?: string | null): DateRange | undefined => {
	if (!from && !to) return undefined;
	const fromDate = from ? new Date(from) : undefined;
	const toDate = to ? new Date(to) : undefined;
	if (fromDate && Number.isNaN(fromDate.getTime())) return undefined;
	if (toDate && Number.isNaN(toDate.getTime())) return undefined;
	return {
		from: fromDate || toDate || new Date(),
		to: toDate || fromDate || new Date(),
	};
};

const getEmployeeName = (user: any) => {
	const firstName = user?.metadata?.employee?.personalInfo?.firstName || "";
	const lastName = user?.metadata?.employee?.personalInfo?.lastName || "";
	const fullName = `${firstName} ${lastName}`.trim();
	return fullName || user?.userName || user?.email || "N/A";
};

const getDepartmentName = (user: any) => user?.metadata?.employee?.department?.name || "N/A";
const getPositionTitle = (user: any) => user?.metadata?.employee?.position?.title || "N/A";
const getAccessStatus = (user: any) => user?.metadata?.device?.access?.status || "unenrolled";
const getAccessLabel = (user: any) => {
	const status = getAccessStatus(user);
	return status ? `${status.charAt(0).toUpperCase()}${status.slice(1)}` : "N/A";
};

const getRoleLabel = (user: any) => {
	const appRoleNames =
		(user?.userRoles || [])
			.map((assignment: any) => assignment?.organizationRole?.role?.name)
			.filter(Boolean)
			.join(", ") || user?.roleId || user?.role;
	return appRoleNames || "N/A";
};

const formatSourceLabel = (source: string) => SOURCE_LABELS[source] || toTitleCase(source);

const formatActor = (item: UserActivityLogRecord) => item.actorName || "System";

const formatReference = (item: UserActivityLogRecord) =>
	[item.referenceLabel || item.referenceType, item.referenceId]
		.filter(Boolean)
		.join(" - ") || "N/A";

const exportLogsToCsv = async ({
	scope,
	currentItems,
	allItems,
}: {
	scope: "current" | "all";
	currentItems: UserActivityLogRecord[];
	allItems: UserActivityLogRecord[];
}) => {
	const exportItems = scope === "current" ? currentItems : allItems;
	downloadCsvFile(
		buildDatedCsvFilename("user-activity-logs"),
		["When", "Category", "Activity", "Source", "Actor", "Reference", "Path", "Method"],
		exportItems.map((item) => [
			formatDateForExport(item.occurredAt),
			toTitleCase(item.category),
			item.title,
			formatSourceLabel(item.source),
			formatActor(item),
			formatReference(item),
			item.path || "",
			item.method || "",
		]),
	);
};

function ActivityLogDetailsModal({
	item,
	onClose,
}: {
	item: UserActivityLogRecord | null;
	onClose: () => void;
}) {
	return (
		<Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="w-[95vw] max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
				<div className="border-b border-slate-200 bg-slate-50/80 px-5 py-4">
					<DialogHeader className="gap-3 text-left">
						<div className="flex flex-wrap items-center gap-2">
							<div className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-700">
								<History className="h-3.5 w-3.5" />
								Activity Detail
							</div>
							{item ? (
								<>
									<Badge
										className={
											CATEGORY_BADGE_STYLES[item.category] ||
											"border border-slate-200 bg-slate-100 text-slate-700"
										}>
										{toTitleCase(item.category)}
									</Badge>
									<Badge
										className={
											SOURCE_BADGE_STYLES[item.source] ||
											"border border-slate-200 bg-slate-100 text-slate-700"
										}>
										{formatSourceLabel(item.source)}
									</Badge>
								</>
							) : null}
						</div>
						<DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
							{item?.title || "Activity details"}
						</DialogTitle>
						<DialogDescription className="text-sm leading-5 text-slate-600">
							{item ? `${formatDateTime(item.occurredAt)} - ${formatActor(item)}` : ""}
						</DialogDescription>
					</DialogHeader>
				</div>

				<div className="max-h-[76vh] overflow-y-auto px-5 py-4">
					{!item ? (
						<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
							Activity details are not available for this record.
						</div>
					) : (
						<div className="space-y-4">
							<div className="grid gap-3 md:grid-cols-2">
								<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
									<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
										When
									</div>
									<div className="mt-1 break-words text-sm font-medium text-slate-900">
										{formatDateTime(item.occurredAt)}
									</div>
								</div>
								<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
									<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
										Actor
									</div>
									<div className="mt-1 break-words text-sm font-medium text-slate-900">
										{formatActor(item)}
									</div>
								</div>
								<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
									<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
										Category
									</div>
									<div className="mt-1 break-words text-sm font-medium text-slate-900">
										{toTitleCase(item.category)}
									</div>
								</div>
								<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
									<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
										Source
									</div>
									<div className="mt-1 break-words text-sm font-medium text-slate-900">
										{formatSourceLabel(item.source)}
									</div>
								</div>
							</div>

							<div className="grid gap-3 md:grid-cols-2">
								<div className="rounded-2xl border border-orange-100 bg-orange-50 p-4">
									<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-500">
										Description
									</div>
									<div className="mt-1 break-words text-sm font-medium text-orange-950">
										{item.description || "No description recorded"}
									</div>
								</div>
								<div className="rounded-2xl border border-orange-100 bg-orange-50 p-4">
									<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-500">
										Reference
									</div>
									<div className="mt-1 break-words text-sm font-medium text-orange-950">
										{formatReference(item)}
									</div>
								</div>
							</div>

							<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
								<div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
									Raw Metadata
								</div>
								<pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-white p-3 text-xs leading-5 text-slate-700">
									{JSON.stringify(item.metadata || {}, null, 2)}
								</pre>
							</div>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

export default function UserActivityLogsPage() {
	const { id: userId = "" } = useParams();
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();
	const [selectedItem, setSelectedItem] = useState<UserActivityLogRecord | null>(null);

	const searchQuery = searchParams.get("search") || undefined;
	const categoryFilter = searchParams.get("category") || undefined;
	const sourceFilter = searchParams.get("source") || undefined;
	const fromParam = searchParams.get("from") || undefined;
	const toParam = searchParams.get("to") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const sortParam = searchParams.get("sort") || "occurredAt";
	const orderParam: "asc" | "desc" = searchParams.get("order") === "asc" ? "asc" : "desc";

	const { data: userData, isLoading: isLoadingUser } = useUser(userId, !!userId);

	const queryParams = {
		page: pageParam,
		limit: limitParam,
		query: searchQuery,
		category: categoryFilter,
		source: sourceFilter,
		from: fromParam,
		to: toParam,
		sort: sortParam,
		order: orderParam,
	};
	const exportQueryParams = {
		...queryParams,
		limit: 1000,
	};

	const { data: activityLogsData, isLoading } = useUserActivityLogs(userId, queryParams);
	const { refetch: refetchAllLogs } = useUserActivityLogs(userId, exportQueryParams, {
		enabled: false,
	});

	const user = userData as any;
	const logsPayload = activityLogsData || ({} as any);
	const items: UserActivityLogRecord[] = logsPayload?.activityLogs || [];
	const pagination = logsPayload?.pagination;

	const dateRange = useMemo(
		() => parseDateRange(fromParam, toParam),
		[fromParam, toParam],
	);

	const employeeName = getEmployeeName(user);
	const departmentName = getDepartmentName(user);
	const positionTitle = getPositionTitle(user);
	const accessLabel = getAccessLabel(user);
	const roleLabel = getRoleLabel(user);
	const lastLogin = user?.lastLogin ? formatDateTime(user.lastLogin) : "No login recorded";
	const activitySummary = useMemo(() => {
		const totals = items.reduce<Record<string, number>>((acc, item) => {
			acc[item.category] = (acc[item.category] || 0) + 1;
			return acc;
		}, {});
		return totals;
	}, [items]);

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const handleSearch = (value: string) => {
		updateSearchParams((next) => {
			if (value) {
				next.set("search", value);
			} else {
				next.delete("search");
			}
			next.set("page", "1");
		});
	};

	const handleFilterChange = (filters: Record<string, string>) => {
		updateSearchParams((next) => {
			if (filters.category) {
				next.set("category", filters.category);
			} else {
				next.delete("category");
			}

			if (filters.source) {
				next.set("source", filters.source);
			} else {
				next.delete("source");
			}

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

	const handleDateRangeChange = (range: DateRange | undefined) => {
		updateSearchParams((next) => {
			if (range?.from) {
				next.set("from", toDateInput(range.from));
				next.set("to", toDateInput(range.to || range.from));
			} else {
				next.delete("from");
				next.delete("to");
			}
			next.set("page", "1");
		});
	};

	const clearFilters = () => {
		updateSearchParams((next) => {
			next.delete("search");
			next.delete("category");
			next.delete("source");
			next.delete("from");
			next.delete("to");
			next.set("page", "1");
		});
	};

	const filterOptions: FilterOption[] = [
		{
			key: "category",
			label: "Category",
			type: "select",
			options: [
				{ value: "attendance", label: "Attendance" },
				{ value: "timesheet", label: "Timesheet" },
				{ value: "payroll", label: "Payroll" },
				{ value: "leave", label: "Leave" },
				{ value: "overtime", label: "Overtime" },
				{ value: "schedule", label: "Schedule" },
				{ value: "profile", label: "Profile" },
				{ value: "login", label: "Login" },
				{ value: "account", label: "Account" },
				{ value: "request", label: "Request" },
				{ value: "audit", label: "Audit" },
			],
		},
		{
			key: "source",
			label: "Source",
			type: "select",
			options: [
				{ value: "activity", label: "Activity Log" },
				{ value: "audit", label: "Audit Log" },
				{ value: "request", label: "Request History" },
				{ value: "schedule", label: "Schedule History" },
			],
		},
	];

	const columns: Column<UserActivityLogRecord>[] = [
		{
			key: "occurredAt",
			label: "When",
			width: "160px",
			sortable: true,
			render: (value) => (
				<div className="space-y-0.5">
					<div className="font-medium text-slate-900">{formatDateTime(value)}</div>
					<div className="text-xs text-slate-500">{String(value || "")}</div>
				</div>
			),
		},
		{
			key: "category",
			label: "Category",
			width: "140px",
			sortable: true,
			render: (value) => (
				<Badge className={CATEGORY_BADGE_STYLES[String(value)] || "border border-slate-200 bg-slate-100 text-slate-700"}>
					{toTitleCase(String(value))}
				</Badge>
			),
		},
		{
			key: "title",
			label: "Activity",
			width: "320px",
			sortable: true,
			render: (value, item) => (
				<div className="min-w-0">
					<div className="font-medium text-slate-900">{value}</div>
					<div className="text-sm text-slate-500">{truncateText(item.description || "", 96)}</div>
				</div>
			),
		},
		{
			key: "source",
			label: "Source",
			width: "150px",
			sortable: true,
			render: (value) => (
				<Badge className={SOURCE_BADGE_STYLES[String(value)] || "border border-slate-200 bg-slate-100 text-slate-700"}>
					{formatSourceLabel(String(value))}
				</Badge>
			),
		},
		{
			key: "actorName",
			label: "Actor",
			width: "220px",
			sortable: true,
			render: (value) => <span className="text-slate-700">{value || "System"}</span>,
		},
		{
			key: "referenceLabel",
			label: "Reference",
			width: "220px",
			sortable: true,
			render: (_value, item) => (
				<div className="min-w-0">
					<div className="font-medium text-slate-900">{formatReference(item)}</div>
					{item.path ? <div className="text-xs text-slate-500">{truncateText(item.path, 40)}</div> : null}
				</div>
			),
		},
	];

	const renderActions = (item: UserActivityLogRecord) => (
		<Button type="button" variant="outline" size="sm" onClick={() => setSelectedItem(item)}>
			<Eye className="mr-2 h-4 w-4" />
			Details
		</Button>
	);

	const handleExportCSV = async ({
		scope,
		currentItems,
	}: {
		scope: "current" | "all";
		currentItems: UserActivityLogRecord[];
	}) => {
		if (scope === "current") {
			await exportLogsToCsv({ scope, currentItems, allItems: currentItems });
			return;
		}

		const allItems = (await refetchAllLogs()).data?.activityLogs || [];
		await exportLogsToCsv({ scope, currentItems, allItems });
	};

	if (!userId) {
		return (
			<div className="p-6">
				<Card className="border border-dashed border-slate-200">
					<CardContent className="px-6 py-8 text-sm text-slate-600">
						User activity logs require a user id.
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<Button variant="outline" size="sm" onClick={() => navigate("/admin/configuration/users")}>
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back to Users
					</Button>
					<div>
						<div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-600">
							<History className="h-4 w-4" />
							Users Module
						</div>
						<h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
							User Activity Logs
						</h1>
					</div>
				</div>
				<Badge className="border border-orange-200 bg-orange-50 text-orange-700">
					Sensitive HR data
				</Badge>
			</div>

			<Card className="border border-slate-200 shadow-sm">
				<CardContent className="space-y-4 p-6">
					<div className="flex flex-wrap items-start justify-between gap-4">
						<div className="flex items-center gap-4">
							<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-sm">
								{employeeName
									.split(" ")
									.map((part: string) => part[0])
									.filter(Boolean)
									.slice(0, 2)
									.join("")
									.toUpperCase() || <Users className="h-8 w-8" />}
							</div>
							<div>
								<div className="flex flex-wrap items-center gap-2">
									<h2 className="text-xl font-semibold text-slate-900">
										{employeeName}
									</h2>
									<Badge className="border border-slate-200 bg-slate-100 text-slate-700">
										{accessLabel}
									</Badge>
								</div>
								<p className="text-sm text-slate-600">{user?.email || "N/A"}</p>
								<p className="text-sm text-slate-500">
									{user?.userName || "N/A"} - {roleLabel}
								</p>
							</div>
						</div>

						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
							<div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
								<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
									Last Login
								</div>
								<div className="mt-1 text-sm font-medium text-slate-900">{lastLogin}</div>
							</div>
							<div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
								<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
									Department
								</div>
								<div className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-900">
									<Building2 className="h-4 w-4 text-slate-400" />
									{departmentName}
								</div>
							</div>
							<div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
								<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
									Position
								</div>
								<div className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-900">
									<Briefcase className="h-4 w-4 text-slate-400" />
									{positionTitle}
								</div>
							</div>
							<div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
								<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
									Access
								</div>
								<div className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-900">
									<ShieldCheck className="h-4 w-4 text-slate-400" />
									{accessLabel}
								</div>
							</div>
						</div>
					</div>

					<div className="grid gap-3 sm:grid-cols-3">
						<div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
							<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
								Category filters
							</div>
							<div className="mt-2 flex flex-wrap gap-2">
								{Object.entries(activitySummary).map(([key, value]) => (
									<Badge
										key={key}
										className={
											CATEGORY_BADGE_STYLES[key] ||
											"border border-slate-200 bg-slate-100 text-slate-700"
										}>
										{toTitleCase(key)}: {value}
									</Badge>
								))}
								{Object.keys(activitySummary).length === 0 ? (
									<span className="text-sm text-slate-500">No activity in the current view.</span>
								) : null}
							</div>
						</div>
						<div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:col-span-2">
							<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
								Notes
							</div>
							<p className="mt-2 text-sm leading-6 text-slate-600">
								This page combines existing activity logs, audit logs, request workflow history,
								and schedule history into one employee-scoped timeline.
							</p>
						</div>
					</div>
				</CardContent>
			</Card>

			<DataTable
				title="Activity Logs"
				description="Historical employee activity for auditing and investigation."
				data={items}
				columns={columns}
				filters={filterOptions}
				filterValues={{ category: categoryFilter || "", source: sourceFilter || "" }}
				customFilters={
					<div className="flex flex-wrap items-center gap-3">
						<DatePickerWithRange
							value={dateRange}
							onChange={handleDateRangeChange}
							placeholder="Filter by date range"
						/>
						<Button type="button" variant="outline" onClick={clearFilters}>
							Clear Filters
						</Button>
					</div>
				}
				onSearch={handleSearch}
				searchValue={searchQuery || ""}
				searchPlaceholder="Search activity, actor, or reference..."
				onFilterChange={handleFilterChange}
				onPageChange={handlePageChange}
				onSort={handleSort}
				sortKey={sortParam}
				sortDirection={orderParam}
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={pagination?.total}
				totalPages={pagination?.totalPages}
				isLoading={isLoading || isLoadingUser}
				emptyMessage="No activity logs found"
				emptyDescription="No matching activity was found for this user and filter set."
				renderActions={renderActions}
				onExportCSV={handleExportCSV}
				searchWidth="w-80"
				containedScroll
			/>

			<ActivityLogDetailsModal item={selectedItem} onClose={() => setSelectedItem(null)} />
		</div>
	);
}
