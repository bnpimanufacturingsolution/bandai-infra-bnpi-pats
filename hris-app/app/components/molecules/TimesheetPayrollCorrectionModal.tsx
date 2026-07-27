import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { TimePicker } from "~/components/molecules/TimePicker";
import type {
	CreatePayrollCorrectionPayload,
	TimesheetBreakdown,
} from "~/services/timesheet.service";
import {
	buildCorrectionRowFromBreakdownDay,
	buildPayrollCorrectionPayload,
	dayKey,
	evaluatePayrollCorrectionSubmit,
	withProposedClocks,
	type PayrollCorrectionDayRow,
} from "~/lib/utils/payroll-correction-form";

interface TimesheetPayrollCorrectionModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	periodName?: string | null;
	breakdown?: TimesheetBreakdown[] | null;
	/** Day keys (YYYY-MM-DD) to pre-check when opened from a calendar day */
	initialSelectedDates?: string[];
	isSubmitting?: boolean;
	onSubmit: (payload: CreatePayrollCorrectionPayload) => Promise<void> | void;
}

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

export function TimesheetPayrollCorrectionModal({
	open,
	onOpenChange,
	periodName,
	breakdown,
	initialSelectedDates = [],
	isSubmitting = false,
	onSubmit,
}: TimesheetPayrollCorrectionModalProps) {
	const preselectKey = useMemo(
		() =>
			[...(initialSelectedDates || [])]
				.map((d) => dayKey(d))
				.filter(Boolean)
				.sort()
				.join("|"),
		// Stabilize: only the sorted key identity matters for open-reset, not array ref
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
	const wasOpenRef = useRef(false);

	// Reset form only when the modal opens (false → true), not on every parent re-render.
	useEffect(() => {
		if (open && !wasOpenRef.current) {
			setRows(buildInitialRows(breakdown, preselectSet));
			setReason("");
			setShowValidation(false);
		}
		wasOpenRef.current = open;
	}, [open, breakdown, preselectSet, breakdownKey, preselectKey]);

	const submitEval = evaluatePayrollCorrectionSubmit({ reason, rows });
	const { canSubmit, errors } = submitEval;

	const updateRow = (index: number, patch: Partial<PayrollCorrectionDayRow>) => {
		setRows((prev) => {
			const next = [...prev];
			const current = next[index];
			if (!current) return prev;
			next[index] = { ...current, ...patch };
			return next;
		});
	};

	const updateClocks = (index: number, patch: { timeIn?: string; timeOut?: string }) => {
		setRows((prev) => {
			const next = [...prev];
			const current = next[index];
			if (!current) return prev;
			next[index] = { ...current, ...withProposedClocks(current, patch) };
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
		onOpenChange(false);
		setReason("");
		setShowValidation(false);
	};

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title="Request payroll correction"
			description="This will not change the locked timesheet. Approved differences pay on the next open payroll as a labeled retro line."
			className="z-[60] max-w-2xl">
			<div
				className="flex max-h-[70vh] flex-col gap-4"
				data-testid="payroll-correction-form">
				<div className="space-y-4 overflow-y-auto pr-1 modern-scroll">
					{periodName && (
						<p className="text-sm text-neutral-600">
							Source period:{" "}
							<span className="font-medium text-neutral-900">{periodName}</span>
						</p>
					)}

					<div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
						Paid snapshot stays immutable. Select days, set proposed Time In / Time Out
						(same as editing a timesheet day), and submit for manager approval. Only
						days with a duration change are submitted.
					</div>

					<div className="space-y-2" data-testid="payroll-correction-day-list">
						{rows.map((row, index) => {
							const afterResolved =
								row.afterMinutes === "" ? null : Number(row.afterMinutes);
							const delta =
								afterResolved === null ? 0 : afterResolved - row.beforeMinutes;
							return (
								<div
									key={row.date || index}
									data-testid={`payroll-correction-day-${row.date || index}`}
									className="grid grid-cols-12 items-center gap-2 rounded-md border border-neutral-100 bg-white px-2 py-2 text-sm">
									<label className="col-span-3 flex items-center gap-2">
										<input
											type="checkbox"
											data-testid={`payroll-correction-select-${row.date}`}
											checked={row.selected}
											onChange={(e) =>
												updateRow(index, { selected: e.target.checked })
											}
										/>
										<span className="font-medium text-neutral-800">
											{row.date}
										</span>
									</label>
									<div className="col-span-3 text-xs text-neutral-500">
										Paid:{" "}
										<span className="font-semibold text-neutral-800">
											{formatMinutesAsHm(row.beforeMinutes)}
										</span>
									</div>
									<div className="col-span-2" data-testid={`payroll-correction-time-in-${row.date}`}>
										<span className="mb-0.5 block text-[10px] uppercase text-neutral-400">
											Time In
										</span>
										<TimePicker
											value={row.timeIn}
											onChange={(value) =>
												updateClocks(index, { timeIn: value })
											}
											disabled={!row.selected}
											className="h-8 rounded-md border-neutral-200 text-xs"
										/>
									</div>
									<div
										className="col-span-2"
										data-testid={`payroll-correction-time-out-${row.date}`}>
										<span className="mb-0.5 block text-[10px] uppercase text-neutral-400">
											Time Out
										</span>
										<TimePicker
											value={row.timeOut}
											onChange={(value) =>
												updateClocks(index, { timeOut: value })
											}
											disabled={!row.selected}
											className="h-8 rounded-md border-neutral-200 text-xs"
										/>
									</div>
									<div
										className={`col-span-1 text-right text-xs font-semibold tabular-nums ${
											!row.selected || afterResolved === null || delta === 0
												? "text-neutral-300"
												: delta > 0
													? "text-emerald-600"
													: "text-rose-600"
										}`}
										data-testid={`payroll-correction-delta-${row.date}`}>
										{!row.selected || afterResolved === null
											? "—"
											: `${delta > 0 ? "+" : ""}${delta}m`}
									</div>
								</div>
							);
						})}
						{rows.length === 0 && (
							<p className="text-sm text-neutral-500">No day breakdown available.</p>
						)}
					</div>

					<div className="space-y-1">
						<label className="text-sm font-medium text-neutral-700">
							Reason <span className="text-red-600">*</span>
						</label>
						<textarea
							data-testid="payroll-correction-reason"
							aria-invalid={showValidation && errors.reasonRequired ? true : undefined}
							className={
								showValidation && errors.reasonRequired
									? "w-full min-h-[90px] rounded-md border border-red-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
									: "w-full min-h-[90px] rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
							}
							placeholder="Explain the correction (e.g. missed OT approval for Jun 2)"
							value={reason}
							onChange={(e) => setReason(e.target.value)}
						/>
						{showValidation && errors.reasonRequired && (
							<p
								className="text-xs text-red-700"
								data-testid="payroll-correction-error-reason">
								Reason is required.
							</p>
						)}
						{showValidation && errors.selectedWithoutChange && (
							<p
								className="text-xs text-red-700"
								data-testid="payroll-correction-error-no-delta">
								Adjust Time In / Time Out on at least one selected day so the
								proposed duration differs from paid minutes.
							</p>
						)}
						{showValidation && !errors.selectedWithoutChange && errors.noChangedDays && (
							<p
								className="text-xs text-red-700"
								data-testid="payroll-correction-error-no-days">
								Select at least one day and set Time In / Time Out for a change.
							</p>
						)}
					</div>
				</div>

				<div className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-100 pt-3">
					<Button
						type="button"
						variant="outline"
						data-testid="payroll-correction-cancel"
						onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						type="button"
						data-testid="payroll-correction-submit"
						onClick={handleSubmit}
						disabled={isSubmitting}
						aria-disabled={isSubmitting || !canSubmit}
						className={!canSubmit && !isSubmitting ? "opacity-90" : undefined}
						title={
							canSubmit
								? "Submit payroll correction request"
								: "Select days, set Time In / Time Out with a duration change, and enter a reason"
						}>
						{isSubmitting ? "Submitting..." : "Submit correction request"}
					</Button>
				</div>
			</div>
		</Modal>
	);
}
