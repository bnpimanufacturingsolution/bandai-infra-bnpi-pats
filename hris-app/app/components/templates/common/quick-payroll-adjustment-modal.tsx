import { useEffect, useMemo, useState } from "react";
import { MinusCircle, PlusCircle, Users } from "lucide-react";
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
	validateQuickAdjustInput,
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

interface QuickPayrollAdjustmentModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initialDirection?: QuickAdjustDirection;
	initialEmployeeIds?: string[];
	initialEmployeeLabel?: string;
	defaultPayrollPeriodId?: string;
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
	onAdjusted,
}: QuickPayrollAdjustmentModalProps) {
	const [direction, setDirection] = useState<QuickAdjustDirection>(initialDirection);
	const [employeeIds, setEmployeeIds] = useState<string[]>(initialEmployeeIds);
	const [name, setName] = useState("");
	const [amount, setAmount] = useState("");
	const [payrollPeriodId, setPayrollPeriodId] = useState(defaultPayrollPeriodId || "");
	const [pickerOpen, setPickerOpen] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);

	const { data: periodsData } = usePayrollPeriods(
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
		setName("");
		setAmount("");
		setFormError(null);
		const periodExists = allPeriods.some((period: any) => period.id === defaultPayrollPeriodId);
		setPayrollPeriodId(periodExists ? (defaultPayrollPeriodId as string) : (allPeriods[0]?.id || ""));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	const copy = DIRECTION_COPY[direction];
	const DirectionIcon = direction === "ADDITION" ? PlusCircle : MinusCircle;
	const parsedAmount = Number(amount);

	const handleSubmit = () => {
		const validationError = validateQuickAdjustInput({
			employeeIds,
			name,
			amount: amount.trim() === "" ? NaN : parsedAmount,
			payrollPeriodId,
		});
		if (validationError) {
			setFormError(validationError);
			return;
		}
		setFormError(null);
		quickAdjust.mutate({
			employeeIds,
			direction,
			name: name.trim(),
			amount: parsedAmount,
			payrollPeriodId,
		});
	};

	// The hook owns toasts + cache invalidation; this effect only closes the
	// modal and bubbles the result (passing onSuccess to mutate would replace
	// the hook's own onSuccess instead of composing with it).
	useEffect(() => {
		if (open && quickAdjust.isSuccess && quickAdjust.data) {
			const result = quickAdjust.data;
			if ((result.created?.length || 0) > 0) {
				onOpenChange(false);
			}
			onAdjusted?.(result);
			quickAdjust.reset();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, quickAdjust.isSuccess]);

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
							Adjustment name
						</label>
						<Input
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder={copy.namePlaceholder}
							maxLength={120}
						/>
						<p className="text-[11px] text-neutral-400">Shows on the register as: {copy.carrier}</p>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
								Amount (₱)
							</label>
							<Input
								value={amount}
								onChange={(event) => setAmount(event.target.value)}
								placeholder="1000"
								inputMode="decimal"
							/>
						</div>
						<div className="space-y-1.5">
							<label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
								Payroll period
							</label>
							<Select
								value={payrollPeriodId}
								onChange={setPayrollPeriodId}
								placeholder="Select period"
								options={allPeriods.map((period: any) => ({
									value: period.id,
									label: formatPeriodLabel(period),
								}))}
							/>
						</div>
					</div>
					<p className="text-[11px] text-neutral-500">
						One-cutoff {direction === "ADDITION" ? "addition" : "deduction"} — applies on the next
						payroll run for the chosen period. Completed periods can't take adjustments.
					</p>
					{formError ? <p className="text-xs font-medium text-red-600">{formError}</p> : null}
					<div className="flex justify-end gap-2 border-t pt-3">
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button type="button" onClick={handleSubmit} disabled={quickAdjust.isPending}>
							{quickAdjust.isPending ? "Adding…" : copy.title}
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
