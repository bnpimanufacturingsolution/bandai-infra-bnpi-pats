import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, FileSpreadsheet, RefreshCw, Upload } from "lucide-react";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { AuthGuard } from "~/guards/auth-guard";
import { usePayrollPeriods } from "~/lib/hooks/usePayrollPeriods";
import { buildDatedCsvFilename, downloadCsvFile } from "~/lib/utils/csv-export";
import dayStatusReviewService, {
	buildDayStatusReviewCsvRows,
	type DayStatusReviewItem,
	type DayStatusReviewPayload,
} from "~/services/day-status-review.service";

const DAY_STATUS_REVIEW_ROLES = ["admin", "hris-admin", "hris-hr-manager", "hris-hr-user"];

const BUCKET_LABELS: Array<{ key: keyof DayStatusReviewPayload["buckets"]; label: string; tone: string }> = [
	{ key: "PRESENT_PUNCH", label: "Present (punch)", tone: "border border-emerald-200 bg-emerald-50 text-emerald-700" },
	{ key: "PRESENT_SCHEDULE_POSITIVE", label: "Present (schedule)", tone: "border border-teal-200 bg-teal-50 text-teal-700" },
	{ key: "LEAVE_PAID", label: "Leave (paid)", tone: "border border-sky-200 bg-sky-50 text-sky-700" },
	{ key: "LEAVE_UNPAID", label: "Leave (unpaid)", tone: "border border-orange-200 bg-orange-50 text-orange-700" },
	{ key: "ABSENT_AWOL_EVIDENCED", label: "Absent (AWOL)", tone: "border border-rose-200 bg-rose-50 text-rose-700" },
	{ key: "REVIEW_NO_EVIDENCE", label: "Review queue", tone: "border border-amber-200 bg-amber-50 text-amber-800" },
	{ key: "REST_SUNDAY", label: "Rest (Sun)", tone: "border border-slate-200 bg-slate-100 text-slate-600" },
	{ key: "OUT_OF_TENURE", label: "Out of tenure", tone: "border border-slate-200 bg-slate-100 text-slate-500" },
];

function DayStatusReviewContent() {
	const periodsQuery = usePayrollPeriods({ limit: 100 });
	const [periodId, setPeriodId] = useState("");
	const [payload, setPayload] = useState<DayStatusReviewPayload | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [isRefining, setIsRefining] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const leaveFileRef = useRef<HTMLInputElement>(null);
	const awolFileRef = useRef<HTMLInputElement>(null);

	const periods = useMemo(() => {
		const raw = periodsQuery.data as any;
		const list = raw?.payrollPeriods || raw?.data || (Array.isArray(raw) ? raw : []);
		return Array.isArray(list) ? list : [];
	}, [periodsQuery.data]);

	const loadReview = useCallback(async (identifier: string) => {
		if (!identifier) return;
		setIsLoading(true);
		setError(null);
		try {
			const result = await dayStatusReviewService.getDayStatusReview(identifier, { limit: 5000 });
			setPayload(result);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load day-status review");
			setPayload(null);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!periodId && periods.length) {
			setPeriodId(periods[0]?.id || "");
		}
	}, [periods, periodId]);

	useEffect(() => {
		if (periodId) void loadReview(periodId);
	}, [periodId, loadReview]);

	const handleRefine = async () => {
		const identifier = payload?.period.id || periodId;
		if (!identifier) return;
		const leaveFile = leaveFileRef.current?.files?.[0] || null;
		const awolFile = awolFileRef.current?.files?.[0] || null;
		if (!leaveFile && !awolFile) {
			setError("Pick a Leave and/or AWOL workbook first. Nothing is uploaded or saved until you click Refine.");
			return;
		}
		setIsRefining(true);
		setError(null);
		try {
			const refined = await dayStatusReviewService.refineWithWorkbooks(identifier, { leaveFile, awolFile });
			setPayload(refined);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Workbook refinement failed");
		} finally {
			setIsRefining(false);
		}
	};

	const handleExportCsv = () => {
		if (!payload) return;
		downloadCsvFile(
			buildDatedCsvFilename(`day-status-review-${payload.period.code || payload.period.id}`),
			buildDayStatusReviewCsvRows(payload.reviewQueue.items),
		);
	};

	const columns: Array<Column<DayStatusReviewItem>> = [
		{
			key: "code",
			label: "Employee",
			render: (_value, item) => (
				<div className="flex flex-col">
					<span className="font-medium">{item.name || "—"}</span>
					<span className="text-xs text-gray-500">{item.code}</span>
				</div>
			),
		},
		{ key: "date", label: "Date" },
		{
			key: "weekday",
			label: "Day",
			render: (value) => <Badge variant="outline">{String(value)}</Badge>,
		},
		{
			key: "estAmount",
			label: "Est exposure",
			render: (value) =>
				value == null ? (
					<span className="text-gray-400">—</span>
				) : (
					<span className="tabular-nums">₱{Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
				),
		},
	];

	const weekdayEntries = payload
		? Object.entries(payload.weekdayHistogramReview).sort((a, b) => b[1] - a[1])
		: [];

	return (
		<div className="space-y-4 p-4">
			<div className="flex flex-wrap items-end gap-3">
				<label className="flex flex-col gap-1 text-sm">
					<span className="font-medium">Payroll period</span>
					<select
						className="h-9 min-w-[280px] rounded-md border bg-background px-3"
						value={periodId}
						onChange={(event) => setPeriodId(event.target.value)}
					>
						{periods.map((period) => (
							<option key={period.id} value={period.id}>
								{(period.code || period.id)} · {period.startDate?.slice(0, 10)} → {period.endDate?.slice(0, 10)}
							</option>
						))}
					</select>
				</label>
				<Button variant="outline" size="sm" onClick={() => periodId && void loadReview(periodId)} disabled={isLoading || !periodId}>
					<RefreshCw className="mr-2 h-4 w-4" /> Reload
				</Button>
				<Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!payload?.reviewQueue.items.length}>
					<FileSpreadsheet className="mr-2 h-4 w-4" /> Export review CSV
				</Button>
			</div>

			<p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
				Read-only resolution under Mon–Sat schedule truth (Sunday rest). Bare no-show days are a REVIEW QUEUE —
				they are never auto-charged absent and nothing here writes to payroll. {payload?.estimateNote}
			</p>

			{error ? <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

			{payload ? (
				<>
					<div className="flex flex-wrap gap-2">
						{BUCKET_LABELS.map((bucket) => (
							<span key={bucket.key} className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-xs font-medium ${bucket.tone}`}>
								{bucket.label}
								<span className="tabular-nums">{payload.buckets[bucket.key] ?? 0}</span>
							</span>
						))}
					</div>

					<div className="grid gap-3 md:grid-cols-3">
						<div className="rounded-md border px-3 py-2 text-xs">
							<p className="font-semibold">Scope</p>
							<p>{payload.scope.employees} employees × {payload.scope.calendarDays} calendar days</p>
							<p className="mt-1 text-gray-500">Imported paid-leave (LVP) rows in DB: {payload.scope.importedPaidLeaveRows ?? 0}</p>
						</div>
						<div className="rounded-md border px-3 py-2 text-xs">
							<p className="font-semibold">Review queue by weekday</p>
							{weekdayEntries.length ? (
								<ul className="mt-1 space-y-0.5">
									{weekdayEntries.map(([day, count]) => (
										<li key={day} className="flex justify-between"><span>{day}</span><span className="tabular-nums">{count}</span></li>
									))}
								</ul>
							) : (
								<p className="mt-1 text-gray-500">No review items.</p>
							)}
						</div>
						<div className="rounded-md border px-3 py-2 text-xs">
							<p className="font-semibold">Refine with workbooks (in-memory only)</p>
							<div className="mt-2 flex flex-col gap-2">
								<input ref={leaveFileRef} type="file" accept=".xlsx,.xls,.csv" className="text-xs" aria-label="Leave workbook" />
								<input ref={awolFileRef} type="file" accept=".xlsx,.xls,.csv" className="text-xs" aria-label="AWOL workbook" />
								<Button size="sm" onClick={() => void handleRefine()} disabled={isRefining}>
									<Upload className="mr-2 h-4 w-4" /> {isRefining ? "Refining…" : "Refine classification"}
								</Button>
								{payload.refinement ? (
									<div className="text-[11px] text-gray-500">
										{payload.refinement.leaveWorkbook ? (
											<p>Leave: {payload.refinement.leaveWorkbook.filename} — {payload.refinement.leaveWorkbook.rowsInWindow}/{payload.refinement.leaveWorkbook.rowsParsed} rows in window ({payload.refinement.leaveWorkbook.sheetName})</p>
										) : null}
										{payload.refinement.awolWorkbook ? (
											<p>AWOL: {payload.refinement.awolWorkbook.filename} — {payload.refinement.awolWorkbook.rowsInWindow}/{payload.refinement.awolWorkbook.rowsParsed} rows in window</p>
										) : null}
									</div>
								) : null}
							</div>
						</div>
					</div>

					<DataTable
						title={`Review queue (${payload.reviewQueue.total})`}
						description={`Scheduled no-show days awaiting HR classification${payload.reviewQueue.truncated ? ` — showing ${payload.reviewQueue.returned} of ${payload.reviewQueue.total}` : ""}.`}
						data={payload.reviewQueue.items}
						columns={columns}
						searchFields={["code", "name"]}
						isLoading={isLoading}
						searchValue=""
					/>
				</>
			) : isLoading ? (
				<p className="text-sm text-gray-500">Resolving…</p>
			) : (
				<p className="text-sm text-gray-500">Select a payroll period to resolve its day statuses.</p>
			)}

			<p className="flex items-center gap-2 text-xs text-gray-400">
				<CalendarRange className="h-3.5 w-3.5" /> Precedence: punch → schedule-positive → AWOL evidence → leave ledger → review queue.
				Evidenced AWOL days this window: {payload?.evidencedAbsent.total ?? 0}.
			</p>
		</div>
	);
}

export default function HRDayStatusReviewPage() {
	return (
		<AuthGuard requiredRole={DAY_STATUS_REVIEW_ROLES}>
			<DayStatusReviewContent />
		</AuthGuard>
	);
}
