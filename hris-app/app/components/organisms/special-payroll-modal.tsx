import { useMemo, useState } from "react";
import { Modal } from "~/components/atoms/Modal";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Badge } from "~/components/atoms/Badge";
import {
	specialPayrollService,
	type SpecialPayrollPreview,
	type SpecialPayrollRun,
} from "~/services/special-payroll.service";
import { SPECIAL_PAYROLL_RUN_TYPE_LABEL } from "~/constants/special-payroll";
import {
	AlertCircle,
	CheckCircle,
	Download,
	Loader2,
	Upload,
	Users,
	X,
} from "lucide-react";

type CompensationOption = {
	id: string;
	code: string;
	name: string;
};

type EmployeeOption = {
	id: string;
	employeeId: string;
	name: string;
};

type ManualAmountRow = {
	employeeId: string;
	employeeNumber: string;
	employeeName: string;
	amount: string;
};

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	period: {
		id?: string | null;
		code?: string | null;
		name?: string | null;
		startDate?: string | null;
		endDate?: string | null;
		payDate?: string | null;
	} | null;
	compensationTypes: CompensationOption[];
	activeEmployees: EmployeeOption[];
	onCompleted?: (run: SpecialPayrollRun) => void;
};

type TabKey = "manual" | "upload";
type Step = "entry" | "preview" | "result";

function money(value: number) {
	return `₱${Number(value || 0).toLocaleString("en-PH", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}

function newIdempotencyKey() {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return `sp-${crypto.randomUUID()}`;
	}
	return `sp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function SpecialPayrollModal({
	open,
	onOpenChange,
	period,
	compensationTypes,
	activeEmployees,
	onCompleted,
}: Props) {
	const [tab, setTab] = useState<TabKey>("manual");
	const [step, setStep] = useState<Step>("entry");
	const [label, setLabel] = useState("");
	const [compensationCode, setCompensationCode] = useState("");
	const [employeeQuery, setEmployeeQuery] = useState("");
	const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
	const [amountRows, setAmountRows] = useState<ManualAmountRow[]>([]);
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<SpecialPayrollPreview | null>(null);
	const [resultRun, setResultRun] = useState<SpecialPayrollRun | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const periodLabel = period?.name || period?.code || "Selected period";
	const periodDates = [
		period?.startDate ? String(period.startDate).slice(0, 10) : "—",
		period?.endDate ? String(period.endDate).slice(0, 10) : "—",
		period?.payDate ? String(period.payDate).slice(0, 10) : "—",
	];

	const filteredEmployees = useMemo(() => {
		const q = employeeQuery.trim().toLowerCase();
		if (!q) return activeEmployees.slice(0, 50);
		return activeEmployees
			.filter(
				(e) =>
					e.employeeId.toLowerCase().includes(q) ||
					e.name.toLowerCase().includes(q),
			)
			.slice(0, 50);
	}, [activeEmployees, employeeQuery]);

	const reset = () => {
		setTab("manual");
		setStep("entry");
		setLabel("");
		setCompensationCode("");
		setEmployeeQuery("");
		setSelectedEmployeeIds([]);
		setAmountRows([]);
		setFile(null);
		setPreview(null);
		setResultRun(null);
		setBusy(false);
		setError(null);
	};

	const handleClose = () => {
		reset();
		onOpenChange(false);
	};

	const toggleEmployee = (emp: EmployeeOption) => {
		setSelectedEmployeeIds((prev) => {
			const exists = prev.includes(emp.id);
			const next = exists ? prev.filter((id) => id !== emp.id) : [...prev, emp.id];
			setAmountRows((rows) => {
				if (exists) return rows.filter((r) => r.employeeId !== emp.id);
				if (rows.some((r) => r.employeeId === emp.id)) return rows;
				return [
					...rows,
					{
						employeeId: emp.id,
						employeeNumber: emp.employeeId,
						employeeName: emp.name,
						amount: "",
					},
				];
			});
			return next;
		});
	};

	const handlePreview = async () => {
		setError(null);
		if (!label.trim()) {
			setError("A custom run label is required (for example, Annual Incentive 2026).");
			return;
		}
		if (!period?.id && !period?.code) {
			setError("Select a payroll period first — it is used as display context only.");
			return;
		}

		setBusy(true);
		try {
			let result: SpecialPayrollPreview;
			if (tab === "upload") {
				if (!file) {
					setError("Choose an .xlsx workbook to upload.");
					setBusy(false);
					return;
				}
				result = await specialPayrollService.previewImport({
					file,
					label: label.trim(),
					contextPayrollPeriodId: period?.id,
					contextPeriodCode: period?.code,
				});
			} else {
				if (!compensationCode) {
					setError("Select a compensation type.");
					setBusy(false);
					return;
				}
				if (amountRows.length === 0) {
					setError("Select at least one active employee.");
					setBusy(false);
					return;
				}
				const rows = amountRows.map((row, index) => ({
					employeeNumber: row.employeeNumber,
					employeeName: row.employeeName,
					compensationCode,
					amount: Number(String(row.amount).replace(/,/g, "")),
					sourceRowNumber: index + 1,
				}));
				if (rows.some((r) => !(r.amount > 0))) {
					setError("Each selected employee needs a positive amount.");
					setBusy(false);
					return;
				}
				result = await specialPayrollService.previewManual({
					label: label.trim(),
					contextPayrollPeriodId: period?.id,
					contextPeriodCode: period?.code,
					rows,
				});
			}
			setPreview(result);
			setStep("preview");
		} catch (err: any) {
			setError(err?.message || err?.data?.message || "Preview failed");
		} finally {
			setBusy(false);
		}
	};

	const handleCreate = async () => {
		if (!preview?.valid) return;
		setBusy(true);
		setError(null);
		try {
			const created = await specialPayrollService.createRun({
				previewId: preview.previewId,
				idempotencyKey: newIdempotencyKey(),
				label: preview.label,
				contextPayrollPeriodId: preview.periodContext.contextPayrollPeriodId,
				contextPeriodCode: preview.periodContext.contextPeriodCode,
				sourceFingerprint: preview.sourceFingerprint,
				sourceFilename: preview.sourceFilename,
				sourceHash: preview.sourceHash,
			});
			setResultRun(created.run);
			setStep("result");
			onCompleted?.(created.run);
		} catch (err: any) {
			setError(err?.message || err?.data?.message || "Create failed");
		} finally {
			setBusy(false);
		}
	};

	const handleRelease = async () => {
		if (!resultRun) return;
		setBusy(true);
		setError(null);
		try {
			const released = await specialPayrollService.releaseRun(resultRun.id);
			setResultRun(released.run);
			onCompleted?.(released.run);
		} catch (err: any) {
			setError(err?.message || err?.data?.message || "Release failed");
		} finally {
			setBusy(false);
		}
	};

	const handleCancel = async () => {
		if (!resultRun) return;
		setBusy(true);
		setError(null);
		try {
			const cancelled = await specialPayrollService.cancelRun(
				resultRun.id,
				"Cancelled before release",
			);
			setResultRun(cancelled.run);
			onCompleted?.(cancelled.run);
		} catch (err: any) {
			setError(err?.message || err?.data?.message || "Cancel failed");
		} finally {
			setBusy(false);
		}
	};

	const handleDownloadTemplate = async () => {
		try {
			const blob = await specialPayrollService.downloadTemplate();
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "special-payroll-template.xlsx";
			a.click();
			URL.revokeObjectURL(url);
		} catch (err: any) {
			setError(err?.message || "Template download failed");
		}
	};

	return (
		<Modal
			open={open}
			onOpenChange={(next) => {
				if (!next) handleClose();
				else onOpenChange(true);
			}}
			title="Special Payroll"
			description="One-time compensation. Immediate create. Separate from regular payroll."
			className="max-w-3xl"
		>
			<div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
				<div className="rounded-lg border border-orange-100 bg-orange-50/70 p-3 text-sm">
					<div className="flex flex-wrap items-center gap-2 mb-1">
						<Badge className="bg-orange-500 text-white">{SPECIAL_PAYROLL_RUN_TYPE_LABEL}</Badge>
						<span className="font-medium text-gray-900">{periodLabel}</span>
					</div>
					<p className="text-gray-600 text-xs">
						Context dates (label only): {periodDates[0]} → {periodDates[1]} · pay{" "}
						{periodDates[2]}. This run does not wait for or enter regular payroll.
					</p>
				</div>

				{error && (
					<div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
						<AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
						<span>{error}</span>
					</div>
				)}

				{step === "entry" && (
					<>
						<div>
							<label className="text-sm font-medium text-gray-800" htmlFor="sp-label">
								Run label <span className="text-red-500">*</span>
							</label>
							<Input
								id="sp-label"
								value={label}
								onChange={(e) => setLabel(e.target.value)}
								placeholder="Annual Incentive 2026"
								className="mt-1"
								aria-required
							/>
						</div>

						<div className="flex gap-2 border-b border-gray-200 pb-2">
							<Button
								type="button"
								variant={tab === "manual" ? "default" : "outline"}
								size="sm"
								onClick={() => setTab("manual")}
							>
								Manual Entry
							</Button>
							<Button
								type="button"
								variant={tab === "upload" ? "default" : "outline"}
								size="sm"
								onClick={() => setTab("upload")}
							>
								Mass Upload
							</Button>
						</div>

						{tab === "manual" ? (
							<div className="space-y-3">
								<div>
									<label className="text-sm font-medium text-gray-800">
										Compensation type
									</label>
									<Select value={compensationCode} onValueChange={setCompensationCode}>
										<SelectTrigger className="mt-1">
											<SelectValue placeholder="Select active compensation" />
										</SelectTrigger>
										<SelectContent>
											{compensationTypes.map((c) => (
												<SelectItem key={c.id} value={c.code}>
													{c.code} — {c.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div>
									<label className="text-sm font-medium text-gray-800 flex items-center gap-1">
										<Users className="h-4 w-4" /> Active employees
									</label>
									<Input
										value={employeeQuery}
										onChange={(e) => setEmployeeQuery(e.target.value)}
										placeholder="Search employee number or name"
										className="mt-1 mb-2"
									/>
									<div className="max-h-36 overflow-y-auto border rounded-md divide-y">
										{filteredEmployees.map((emp) => {
											const checked = selectedEmployeeIds.includes(emp.id);
											return (
												<label
													key={emp.id}
													className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
												>
													<input
														type="checkbox"
														checked={checked}
														onChange={() => toggleEmployee(emp)}
													/>
													<span className="font-mono text-xs text-gray-500">
														{emp.employeeId}
													</span>
													<span>{emp.name}</span>
												</label>
											);
										})}
										{filteredEmployees.length === 0 && (
											<p className="p-3 text-sm text-gray-500">No active employees match.</p>
										)}
									</div>
								</div>

								{amountRows.length > 0 && (
									<div className="border rounded-md overflow-hidden">
										<table className="w-full text-sm">
											<thead className="bg-gray-50 text-left">
												<tr>
													<th className="px-3 py-2">Employee</th>
													<th className="px-3 py-2 w-36">Amount</th>
													<th className="px-2 py-2 w-10" />
												</tr>
											</thead>
											<tbody>
												{amountRows.map((row) => (
													<tr key={row.employeeId} className="border-t">
														<td className="px-3 py-2">
															<div className="font-medium">{row.employeeName}</div>
															<div className="text-xs text-gray-500 font-mono">
																{row.employeeNumber}
															</div>
														</td>
														<td className="px-3 py-2">
															<Input
																inputMode="decimal"
																value={row.amount}
																onChange={(e) =>
																	setAmountRows((rows) =>
																		rows.map((r) =>
																			r.employeeId === row.employeeId
																				? { ...r, amount: e.target.value }
																				: r,
																		),
																	)
																}
																placeholder="0.00"
																aria-label={`Amount for ${row.employeeNumber}`}
															/>
														</td>
														<td className="px-2 py-2">
															<button
																type="button"
																className="text-gray-400 hover:text-red-500"
																onClick={() =>
																	toggleEmployee({
																		id: row.employeeId,
																		employeeId: row.employeeNumber,
																		name: row.employeeName,
																	})
																}
																aria-label={`Remove ${row.employeeNumber}`}
															>
																<X className="h-4 w-4" />
															</button>
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								)}
							</div>
						) : (
							<div className="space-y-3">
								<div className="flex flex-wrap gap-2">
									<Button type="button" variant="outline" size="sm" onClick={handleDownloadTemplate}>
										<Download className="h-4 w-4 mr-1" />
										Download template
									</Button>
								</div>
								<p className="text-xs text-gray-500">
									.xlsx only. Columns: COMPENSATION_CODE, AMOUNT, EMPLOYEE_NUMBER,
									EMPLOYEE_NAME, START_PAY_DATE (aliases COMCODE, Amount, EmployeeID,
									EmployeeName, StartPayDate accepted). Any invalid row blocks the whole run.
								</p>
								<label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6 cursor-pointer hover:bg-gray-50">
									<Upload className="h-6 w-6 text-gray-400" />
									<span className="text-sm text-gray-600">
										{file ? file.name : "Choose .xlsx workbook"}
									</span>
									<input
										type="file"
										accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
										className="hidden"
										onChange={(e) => setFile(e.target.files?.[0] || null)}
									/>
								</label>
							</div>
						)}

						<div className="flex justify-end gap-2 pt-2">
							<Button type="button" variant="outline" onClick={handleClose}>
								Close
							</Button>
							<Button type="button" onClick={handlePreview} disabled={busy}>
								{busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
								Preview
							</Button>
						</div>
					</>
				)}

				{step === "preview" && preview && (
					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<div>
								<p className="font-semibold text-gray-900">{preview.label}</p>
								<p className="text-xs text-gray-500">
									{preview.totals.lineCount} lines · {preview.totals.employeeCount}{" "}
									employees · {money(preview.totals.totalGross)}
								</p>
							</div>
							{preview.valid ? (
								<Badge className="bg-emerald-600 text-white">Ready</Badge>
							) : (
								<Badge className="bg-red-600 text-white">Blocked</Badge>
							)}
						</div>

						{preview.errors.length > 0 && (
							<div className="rounded-md border border-red-200 bg-red-50 p-3 max-h-40 overflow-y-auto text-sm">
								<p className="font-medium text-red-800 mb-1">
									{preview.errors.length} row error(s) — entire run blocked
								</p>
								<ul className="space-y-1 text-red-700">
									{preview.errors.slice(0, 20).map((err) => (
										<li key={`${err.rowNumber}-${err.code}`}>
											Row {err.rowNumber}
											{err.employeeNumber ? ` (${err.employeeNumber})` : ""}: {err.error}
										</li>
									))}
								</ul>
							</div>
						)}

						{preview.rows.length > 0 && (
							<div className="border rounded-md max-h-48 overflow-y-auto">
								<table className="w-full text-sm">
									<thead className="bg-gray-50 sticky top-0">
										<tr>
											<th className="px-3 py-2 text-left">Employee</th>
											<th className="px-3 py-2 text-left">Code</th>
											<th className="px-3 py-2 text-right">Gross / Net</th>
										</tr>
									</thead>
									<tbody>
										{preview.rows.slice(0, 100).map((row) => (
											<tr key={`${row.rowNumber}-${row.employeeNumber}-${row.compensationCode}`} className="border-t">
												<td className="px-3 py-1.5">
													<div>{row.employeeName}</div>
													<div className="text-xs text-gray-500 font-mono">
														{row.employeeNumber}
													</div>
												</td>
												<td className="px-3 py-1.5">{row.compensationCode}</td>
												<td className="px-3 py-1.5 text-right font-medium">
													{money(row.amount)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}

						<div className="flex justify-between gap-2 pt-2">
							<Button type="button" variant="outline" onClick={() => setStep("entry")} disabled={busy}>
								Back
							</Button>
							<Button
								type="button"
								onClick={handleCreate}
								disabled={busy || !preview.valid}
								className="bg-orange-500 hover:bg-orange-600"
							>
								{busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
								Confirm & create run
							</Button>
						</div>
					</div>
				)}

				{step === "result" && resultRun && (
					<div className="space-y-4">
						<div className="flex flex-col items-center text-center p-4 bg-emerald-50 rounded-lg border border-emerald-100">
							<CheckCircle className="h-10 w-10 text-emerald-600 mb-2" />
							<p className="font-semibold text-emerald-800">Special Payroll run created</p>
							<p className="text-sm text-emerald-700 mt-1">
								{resultRun.runCode} · {resultRun.label}
							</p>
							<p className="text-xs text-emerald-600 mt-1">
								Status: {resultRun.status} · {money(resultRun.totalGross)} ·{" "}
								{resultRun.employeeCount} employees
							</p>
						</div>

						{resultRun.status === "FINALIZED" && (
							<div className="flex flex-wrap justify-center gap-2">
								<Button type="button" onClick={handleRelease} disabled={busy}>
									{busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
									Release payslips
								</Button>
								<Button type="button" variant="outline" onClick={handleCancel} disabled={busy}>
									Cancel run
								</Button>
							</div>
						)}
						{resultRun.status === "RELEASED" && (
							<p className="text-sm text-center text-gray-600">
								Released. Employees can view special payslips. Run is immutable.
							</p>
						)}
						{resultRun.status === "CANCELLED" && (
							<p className="text-sm text-center text-gray-600">
								Cancelled. Create a new run for corrections.
							</p>
						)}

						<div className="flex justify-end">
							<Button type="button" variant="outline" onClick={handleClose}>
								Done
							</Button>
						</div>
					</div>
				)}
			</div>
		</Modal>
	);
}

export default SpecialPayrollModal;
