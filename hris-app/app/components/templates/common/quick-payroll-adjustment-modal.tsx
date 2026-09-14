import { useEffect, useMemo, useRef, useState } from "react";
import { MinusCircle, Plus, PlusCircle, Users, X } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Select } from "~/components/atoms/Select";
import { EmployeeMultiSelectModal } from "~/components/molecules/employee/EmployeeMultiSelectModal";
import { usePayrollPeriods } from "~/lib/hooks/usePayrollPeriods";
import {
	useQuickAdjustEmployeeBenefits,
} from "~/lib/hooks/useEmployeeBenefits";
import {
	validateQuickAdjustRows,
	isQuickAdjustPeriodLocked,
	type QuickAdjustDirection,
	type QuickAdjustEmployeeBenefitResult,
} from "~/services/employee-benefit.service";

function formatPeriodLabel(period: any): string {
	const start = new Date(period.startDate);
	const end = new Date(period.endDate);
	const startMonth = start.toLocaleString("en-US", { month: "long" });
	const startDay = start.getDate();
	const endMonth = end.toLocaleString("en-US", { month: "short" });
	const endDay = end.getDate();
	return `${startMonth} ${startDay} to ${endMonth} ${endDay}`;
}

export type { QuickAdjustDirection };

interface AdjustmentRow {
	id: string;
	name: string;
	amount: string;
}

const createRow = (id: string): AdjustmentRow => ({ id, name: "", amount: "" });

interface QuickPayrollAdjustmentModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initialDirection?: QuickAdjustDirection;
	initialEmployeeIds?: string[];
	initialEmployeeLabel?: string;
	defaultPayrollPeriodId?: string;
	/** Display name of the entry payroll period (locks the period when the id is set). */
	defaultPayrollPeriodLabel?: string;
	/** Called after a successful create (e.g. to re-run a preview). */
	onAdjusted?: (result: QuickAdjustEmployeeBenefitResult) => void;
}

const DIRECTION_COPY: Record<
	QuickAdjustDirection,
	{ title: string; namePlaceholder: string; carrier: string }
> = {
	ADDITION: {
		title: "Add addition",
		namePlaceholder: "e.g. Good performance",
		carrier: "OAD · Other Compensation (adds to gross)",
	},
	DEDUCTION: {
		title: "Add deduction",
		namePlaceholder: "e.g. Equipment destroy",
		carrier: "NEGADJ · Negative Adjustment (deducts)",
	},
};

export function QuickPayrollAdjustmentModal({
	open,
	onOpenChange,
	initialDirection = "ADDITION",
	initialEmployeeIds = [],
	initialEmployeeLabel,
	defaultPayrollPeriodId,
	defaultPayrollPeriodLabel,
	onAdjusted,
}: QuickPayrollAdjustmentModalProps) {
	const [direction, setDirection] = useState<QuickAdjustDirection>(initialDirection);
	const [employeeIds, setEmployeeIds] = useState<string[]>(initialEmployeeIds);
	const [rows, setRows] = useState<AdjustmentRow[]>([createRow("row-1")]);
	const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
	const [submitting, setSubmitting] = useState(false);
	const [payrollPeriodId, setPayrollPeriodId] = useState(defaultPayrollPeriodId || "");
	const [pickerOpen, setPickerOpen] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);
	const rowSeq = useRef(1);

	const { data: periodsData, isFetched: periodsFetched } = usePayrollPeriods(
		{ page: 1, limit: 50, sort: "startDate", order: "desc" },
		open,
	);
	const quickAdjust = useQuickAdjustEmployeeBenefits();

	const allPeriods = useMemo(() => {
		const list = (periodsData as any)?.payrollPeriods || [];
		return list;
	}, [periodsData]);

	useEffect(() => {
		if (!open) return;
		setDirection(initialDirection);
		setEmployeeIds(initialEmployeeIds);
		setRows([createRow("row-1")]);
		setRowErrors({});
		setSubmitting(false);
		setFormError(null);
		// The entry period IS the period: seed it directly instead of gating on
		// the periods list (the old list-gated prefill raced and left an empty
		// "Select period").
		setPayrollPeriodId(defaultPayrollPeriodId || "");
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, defaultPayrollPeriodId]);

	// Context-free entry (header bulk Quick adjustment): fall back to the
	// latest period once the list arrives.
	useEffect(() => {
		if (!open || defaultPayrollPeriodId || payrollPeriodId) return;
		const first = allPeriods[0];
		if (first?.id) setPayrollPeriodId(String(first.id));
	}, [open, defaultPayrollPeriodId, payrollPeriodId, allPeriods]);

	const entryPeriodMatch = defaultPayrollPeriodId
		? allPeriods.find((period: any) => String(period.id) === String(defaultPayrollPeriodId))
		: undefined;
	const lockedPeriodLabel =
		defaultPayrollPeriodLabel?.trim() ||
		(entryPeriodMatch ? formatPeriodLabel(entryPeriodMatch) : "") ||
		"";
	const isPeriodLocked = isQuickAdjustPeriodLocked({
		defaultPayrollPeriodId,
		hasLabel: lockedPeriodLabel.length > 0,
		hasListMatch: Boolean(entryPeriodMatch),
		periodsFetched,
	});

	const copy = DIRECTION_COPY[direction];
	const DirectionIcon = direction === "ADDITION" ? PlusCircle : MinusCircle;
	const submitLabel =
		rows.length > 1
			? `Add ${rows.length} ${direction === "ADDITION" ? "additions" : "deductions"}`
			: copy.title;

	const updateRow = (id: string, patch: Partial<Pick<AdjustmentRow, "name" | "amount">>) => {
		setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
	};

	const addRow = () => {
		rowSeq.current += 1;
		setRows((prev) => [...prev, createRow(`row-${rowSeq.current}`)]);
	};

	const removeRow = (id: string) => {
		setRows((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.id !== id)));
		setRowErrors((prev) => {
			if (!(id in prev)) return prev;
			const next = { ...prev };
			delete next[id];
			return next;
		});
	};

	const handleSubmit = async () => {
		const parsed = rows.map((row) => ({
			id: row.id,
			name: row.name.trim(),
			amount: row.amount.trim() === "" ? NaN : Number(row.amount),
		}));
		const validationError = validateQuickAdjustRows({
			employeeIds,
			payrollPeriodId,
			rows: parsed,
		});
		if (validationError) {
			if (validationError.rowIndex >= 0) {
				setRowErrors({ [parsed[validationError.rowIndex].id]: validationError.message });
				setFormError(null);
			} else {
				setRowErrors({});
				setFormError(validationError.message);
			}
			return;
		}
		setFormError(null);
		setRowErrors({});
		setSubmitting(true);
		const mergedCreated: QuickAdjustEmployeeBenefitResult["created"] = [];
		const mergedFailed: QuickAdjustEmployeeBenefitResult["failed"] = [];
		const failures: Record<string, string> = {};
		for (let index = 0; index < parsed.length; index += 1) {
			const row = parsed[index];
			try {
				const result = await quickAdjust.mutateAsync({
					employeeIds,
					direction,
					name: row.name,
					amount: row.amount,
					payrollPeriodId,
				});
				mergedCreated.push(...(result.created || []));
				if (result.failed && result.failed.length > 0) {
					mergedFailed.push(...result.failed);
					failures[row.id] =
						`Row ${index + 1} saved for some employees; ` +
						`${result.failed.length} failed (${result.failed.slice(0, 2).map((entry) => entry.message || entry.employeeId).join("; ")}${result.failed.length > 2 ? "; …" : ""})`;
				}
			} catch (error: any) {
				failures[row.id] = `Row ${index + 1}: ${error?.message || "failed to save"}`;
			}
		}
		quickAdjust.reset();
		setSubmitting(false);
		if (mergedCreated.length > 0) {
			onAdjusted?.({
				benefitCode: direction === "ADDITION" ? "OAD" : "NEGADJ",
				payrollPeriodId,
				created: mergedCreated,
				failed: mergedFailed,
			});
		}
		if (Object.keys(failures).length === 0) {
			onOpenChange(false);
			return;
		}
		// Keep failed rows open for review. Already-saved rows must be removed
		// before retrying, otherwise they would be created a second time.
		setRowErrors(failures);
		setFormError(
			"Some rows were not saved — remove rows that already saved before retrying to avoid duplicates.",
		);
	};

	return (
		<>
			<Modal
				open={open}
				onOpenChange={onOpenChange}
				title={
					<span className="inline-flex items-center gap-2">
						<DirectionIcon
							className={`h-4 w-4 ${direction === "ADDITION" ? "text-green-600" : "text-red-600"}`}
						/>
						{copy.title}
						{employeeIds.length > 1 ? ` · ${employeeIds.length} employees` : ""}
						{rows.length > 1 ? ` · ${rows.length} adjustments` : ""}
					</span>
				}>
				<div className="space-y-4">
					<div className="grid grid-cols-2 gap-2">
						{(["ADDITION", "DEDUCTION"] as QuickAdjustDirection[]).map((option) => (
							<Button
								key={option}
								type="button"
								variant={direction === option ? "default" : "outline"}
								size="sm"
								onClick={() => setDirection(option)}>
								{option === "ADDITION" ? (
									<PlusCircle className="h-4 w-4 mr-2" />
								) : (
									<MinusCircle className="h-4 w-4 mr-2" />
								)}
								{option === "ADDITION" ? "Addition" : "Deduction"}
							</Button>
						))}
					</div>
					<div className="space-y-1.5">
						<label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
							Employees
						</label>
						<div className="flex items-center gap-2">
							<Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
								<Users className="h-4 w-4 mr-2" />
								{employeeIds.length === 0
									? "Select employees"
									: employeeIds.length === 1 && initialEmployeeLabel
										? initialEmployeeLabel
										: `${employeeIds.length} selected`}
							</Button>
						</div>
					</div>
				<div className="space-y-1.5">
					<label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
						Adjustments
					</label>
					<div className="space-y-2">
						{rows.map((row, index) => (
							<div key={row.id} className="space-y-1">
								<div className="flex items-start gap-2">
									<Input
										value={row.name}
										onChange={(event) => updateRow(row.id, { name: event.target.value })}
										placeholder={copy.namePlaceholder}
										maxLength={120}
										aria-label={`Adjustment ${index + 1} name`}
										className="min-w-0 flex-1"
									/>
									<Input
										value={row.amount}
										onChange={(event) => updateRow(row.id, { amount: event.target.value })}
										placeholder="1000"
										inputMode="decimal"
										aria-label={`Adjustment ${index + 1} amount in pesos`}
										className="w-28 shrink-0"
									/>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => removeRow(row.id)}
										disabled={rows.length <= 1}
										aria-label={`Remove adjustment ${index + 1}`}
										className="h-9 w-9 shrink-0 p-0">
										<X className="h-4 w-4" />
									</Button>
								</div>
								{rowErrors[row.id] ? (
									<p className="text-xs font-medium text-red-600">{rowErrors[row.id]}</p>
								) : null}
							</div>
						))}
					</div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={addRow}
						className="w-full gap-2 border-dashed">
						<Plus className="h-4 w-4" />
						Add another adjustment
					</Button>
					<p className="text-[11px] text-neutral-400">Shows on the register as: {copy.carrier}</p>
				</div>
				<div className="space-y-1.5">
					<label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
						Payroll period
					</label>
					{isPeriodLocked ? (
						<div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
							<p className="text-sm font-medium text-neutral-900">
								{lockedPeriodLabel || "Loading period…"}
							</p>
							<p className="text-[11px] text-neutral-500">Fixed to this payroll period</p>
						</div>
					) : (
						<Select
							value={payrollPeriodId}
							onChange={setPayrollPeriodId}
							placeholder="Select period"
							options={allPeriods.map((period: any) => ({
								value: period.id,
								label: formatPeriodLabel(period),
							}))}
						/>
					)}
				</div>
				<p className="text-[11px] text-neutral-500">
					One-cutoff {direction === "ADDITION" ? "addition" : "deduction"}
					{rows.length > 1 ? "s — each row applies" : " — applies"} on the next
					payroll run for {isPeriodLocked ? "this period" : "the chosen period"}. Completed periods can't take adjustments.
				</p>
					{formError ? <p className="text-xs font-medium text-red-600">{formError}</p> : null}
					<div className="flex justify-end gap-2 border-t pt-3">
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
					<Button type="button" onClick={handleSubmit} disabled={submitting || quickAdjust.isPending}>
						{submitting || quickAdjust.isPending ? "Adding…" : submitLabel}
					</Button>
					</div>
				</div>
			</Modal>
			{pickerOpen ? (
				<EmployeeMultiSelectModal
					open={pickerOpen}
					onOpenChange={setPickerOpen}
					selectedIds={employeeIds}
					onConfirm={(ids) => {
						setEmployeeIds(ids);
						setPickerOpen(false);
					}}
				/>
			) : null}
		</>
	);
}
