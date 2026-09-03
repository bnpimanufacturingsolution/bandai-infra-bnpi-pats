import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { TimesheetCalendar, type TimesheetBreakdownDay } from "~/components/molecules/TimesheetCalendar";
import { TimePicker } from "~/components/molecules/TimePicker";
import type {
	CreatePayrollCorrectionPayload,
	TimesheetBreakdown,
} from "~/services/timesheet.service";
import type { DayPayrollCorrectionMarker } from "~/lib/utils/payroll-correction-day-markers";
import {
	buildCorrectionRowFromBreakdownDay,
	buildPayrollCorrectionPayload,
	dayKey,
	evaluatePayrollCorrectionSubmit,
	withProposedClocks,
	type PayrollCorrectionDayRow,
} from "~/lib/utils/payroll-correction-form";

function formatMinutesAsHm(minutes: number): string {
	const m = Math.max(0, Math.round(Number(minutes) || 0));
	const h = Math.floor(m / 60);
	const mm = m % 60;
	return `${h}:${String(mm).padStart(2, "0")}`;
}

function buildInitialRows(
	breakdown: TimesheetBreakdown[] | null | undefined,
	preselect: Set<string>,
): PayrollCorrectionDayRow[] {
	return (breakdown || []).map((day) =>
		buildCorrectionRowFromBreakdownDay(day, preselect.has(dayKey(day.date))),
	);
}

export interface TimesheetPayrollCorrectionPanelProps {
	breakdown?: TimesheetBreakdown[] | null;
	payrollPeriodStartDate?: string | null;
	payrollPeriodEndDate?: string | null;
	payrollCorrectionByDate?: Map<string, DayPayrollCorrectionMarker> | null;
	initialSelectedDates?: string[];
	isSubmitting?: boolean;
	onCancel: () => void;
	onSubmit: (payload: CreatePayrollCorrectionPayload) => Promise<void> | void;
}

export function TimesheetPayrollCorrectionPanel({
	breakdown,
	payrollPeriodStartDate,
	payrollPeriodEndDate,
	payrollCorrectionByDate = null,
	initialSelectedDates = [],
	isSubmitting = false,
	onCancel,
	onSubmit,
}: TimesheetPayrollCorrectionPanelProps) {
	const preselectKey = useMemo(
		() =>
			[...(initialSelectedDates || [])]
				.map((d) => dayKey(d))
				.filter(Boolean)
				.sort()
				.join("|"),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[JSON.stringify([...(initialSelectedDates || [])].map((d) => dayKey(d)).filter(Boolean).sort())],
	);

	const preselectSet = useMemo(
		() => new Set(preselectKey ? preselectKey.split("|") : []),
		[preselectKey],
	);

	const breakdownKey = useMemo(
		() => (breakdown || []).map((d) => dayKey(d.date)).join("|"),
		[breakdown],
	);

	const [rows, setRows] = useState<PayrollCorrectionDayRow[]>(() =>
		buildInitialRows(breakdown, preselectSet),
	);
	const [reason, setReason] = useState("");
	const [showValidation, setShowValidation] = useState(false);
	const mountedRef = useRef(false);

	// Reset when panel mounts or preselect/breakdown identity changes for a fresh open.
	useEffect(() => {
		setRows(buildInitialRows(breakdown, preselectSet));
		if (!mountedRef.current) {
			setReason("");
			setShowValidation(false);
			mountedRef.current = true;
		}
	}, [breakdown, preselectSet, breakdownKey, preselectKey]);

	const selectedKeys = useMemo(
		() => rows.filter((r) => r.selected && r.date).map((r) => r.date),
		[rows],
	);
	const selectedRows = useMemo(() => rows.filter((r) => r.selected && r.date), [rows]);
	const submitEval = evaluatePayrollCorrectionSubmit({ reason, rows });
	const { canSubmit, errors } = submitEval;

	const updateRowByDate = (date: string, patch: Partial<PayrollCorrectionDayRow>) => {
		setRows((prev) =>
			prev.map((row) => (row.date === date ? { ...row, ...patch } : row)),
		);
	};

	const updateClocksByDate = (
		date: string,
		patch: { timeIn?: string; timeOut?: string },
	) => {
		setRows((prev) =>
			prev.map((row) => {
				if (row.date !== date) return row;
				return { ...row, ...withProposedClocks(row, patch) };
			}),
		);
	};

	const handleToggleDay = (day: TimesheetBreakdownDay) => {
		const date = dayKey(day.date);
		if (!date) return;
		setRows((prev) => {
			const idx = prev.findIndex((r) => r.date === date);
			if (idx < 0) {
				return [...prev, buildCorrectionRowFromBreakdownDay(day, true)];
			}
			const next = [...prev];
			const current = next[idx];
			next[idx] = { ...current, selected: !current.selected };
			return next;
		});
	};

	const handleSubmit = async () => {
		const built = buildPayrollCorrectionPayload({ reason, rows });
		if (!built.ok) {
			setShowValidation(true);
			return;
		}
		await onSubmit(built.payload);
	};

	return (
		<div className="space-y-3" data-testid="payroll-correction-form">
			<TimesheetCalendar
				breakdown={(breakdown || []) as TimesheetBreakdownDay[]}
				payrollPeriodStartDate={payrollPeriodStartDate}
				payrollPeriodEndDate={payrollPeriodEndDate}
				payrollCorrectionByDate={payrollCorrectionByDate}
				isPayrollLocked
				selectionMode
				selectedDayKeys={selectedKeys}
				onToggleDaySelect={handleToggleDay}
				disableDayTooltips
			/>

			<div className="space-y-2" data-testid="payroll-correction-day-list">
				<div className="flex items-center gap-2">
					<p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
						Proposed changes
					</p>
					<span className="text-xs font-semibold tabular-nums text-neutral-800">
						{selectedKeys.length}
					</span>
				</div>

				{selectedRows.length === 0 ? (
					<div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50/50 px-3 py-5 text-center text-sm text-neutral-400">
						Select one or more days on the calendar
					</div>
				) : (
					<div className="max-h-[280px] overflow-y-auto modern-scroll pr-0.5">
						<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
							{selectedRows.map((row) => {
								const afterResolved =
									row.afterMinutes === "" ? null : Number(row.afterMinutes);
								const delta =
									afterResolved === null
										? 0
										: afterResolved - row.beforeMinutes;
								return (
									<div
										key={row.date}
										data-testid={`payroll-correction-day-${row.date}`}
										className="relative flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-2.5">
										<div className="flex items-start justify-between gap-1">
											<div className="min-w-0">
												<p className="truncate text-sm font-medium text-neutral-900">
													{row.date}
												</p>
												<p className="text-[11px] text-neutral-400">
													Paid {formatMinutesAsHm(row.beforeMinutes)}
													{row.originalTimeIn || row.originalTimeOut
														? ` · ${row.originalTimeIn || "—"}–${row.originalTimeOut || "—"}`
														: ""}
												</p>
											</div>
											<button
												type="button"
												aria-label={`Remove ${row.date}`}
												className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
												onClick={() =>
													updateRowByDate(row.date, { selected: false })
												}>
												<X className="h-3.5 w-3.5" />
											</button>
										</div>
										<div className="grid grid-cols-2 gap-1.5">
											<label className="space-y-0.5">
												<span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">
													Time In
												</span>
												<div data-testid={`payroll-correction-time-in-${row.date}`}>
													<TimePicker
														value={row.timeIn}
														onChange={(value) =>
															updateClocksByDate(row.date, {
																timeIn: value,
															})
														}
														className="h-8 rounded-md border-neutral-200 text-xs"
													/>
												</div>
											</label>
											<label className="space-y-0.5">
												<span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">
													Time Out
												</span>
												<div
													data-testid={`payroll-correction-time-out-${row.date}`}>
													<TimePicker
														value={row.timeOut}
														onChange={(value) =>
															updateClocksByDate(row.date, {
																timeOut: value,
															})
														}
														className="h-8 rounded-md border-neutral-200 text-xs"
													/>
												</div>
											</label>
										</div>
										<div className="flex items-center justify-between border-t border-neutral-100 pt-1.5">
											<span className="text-[10px] text-neutral-400">
												{afterResolved === null
													? "Duration"
													: `After ${formatMinutesAsHm(afterResolved)}`}
											</span>
											<span
												className={`text-xs font-semibold tabular-nums ${
													afterResolved === null || delta === 0
														? "text-neutral-300"
														: delta > 0
															? "text-emerald-600"
															: "text-rose-600"
												}`}
												data-testid={`payroll-correction-delta-${row.date}`}>
												{afterResolved === null
													? "—"
													: `${delta > 0 ? "+" : ""}${delta}m`}
											</span>
										</div>
									</div>
								);
							})}
						</div>
					</div>
				)}
			</div>

			<div className="space-y-1.5">
				<label className="text-xs font-medium text-neutral-600">
					Reason <span className="text-red-500">*</span>
				</label>
				<textarea
					data-testid="payroll-correction-reason"
					aria-invalid={showValidation && errors.reasonRequired ? true : undefined}
					className={
						showValidation && errors.reasonRequired
							? "w-full min-h-[72px] resize-none rounded-lg border border-red-500 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-red-200"
							: "w-full min-h-[72px] resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-200"
					}
					placeholder="e.g. Missed OT approval for Jun 2"
					value={reason}
					onChange={(e) => setReason(e.target.value)}
				/>
				{showValidation && errors.reasonRequired && (
					<p
						className="text-xs text-red-600"
						data-testid="payroll-correction-error-reason">
						Reason is required.
					</p>
				)}
				{showValidation && errors.selectedWithoutChange && (
					<p
						className="text-xs text-red-600"
						data-testid="payroll-correction-error-no-delta">
						Adjust Time In / Time Out on at least one selected day so the proposed
						duration differs from paid minutes.
					</p>
				)}
				{showValidation && !errors.selectedWithoutChange && errors.noChangedDays && (
					<p
						className="text-xs text-red-600"
						data-testid="payroll-correction-error-no-days">
						Select at least one day and set Time In / Time Out for a change.
					</p>
				)}
			</div>

			<div className="flex items-center justify-end gap-2 border-t border-neutral-100 pt-3">
				<Button
					type="button"
					variant="outline"
					data-testid="payroll-correction-cancel"
					className="text-sm"
					onClick={onCancel}
					disabled={isSubmitting}>
					Cancel
				</Button>
				<Button
					type="button"
					data-testid="payroll-correction-submit"
					className="text-sm font-semibold text-white"
					style={{ backgroundColor: "#f97316" }}
					onClick={handleSubmit}
					disabled={isSubmitting}
					aria-disabled={isSubmitting || !canSubmit}
					title={
						canSubmit
							? "Submit payroll correction request"
							: "Select days, set Time In / Time Out with a duration change, and enter a reason"
					}>
					{isSubmitting ? "Submitting..." : "Submit correction"}
				</Button>
			</div>
		</div>
	);
}
