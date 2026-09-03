import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "~/components/atoms/Card";
import { Input } from "~/components/atoms/Input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { useAuth } from "~/lib/hooks/use-auth";
import { useLoanTypes } from "~/lib/hooks/useLoanTypes";
import { computeSalaryLoanTerms } from "~/lib/salary-loan-terms";
import employeeLoansService, {
	type CreateEmployeeLoanRequest,
} from "~/services/employee-loans.service";

const peso = (value: number) =>
	new Intl.NumberFormat("en-PH", {
		style: "currency",
		currency: "PHP",
		maximumFractionDigits: 2,
	}).format(Number.isFinite(value) ? value : 0);

export default function SalaryLoanApplicationPage() {
	const navigate = useNavigate();
	const { user } = useAuth();
	const employeeId = (user as any)?.metadata?.employee?.id || "";
	const organizationId = (user as any)?.organizationId || "";
	const { data: loanTypesData, isLoading: typesLoading } = useLoanTypes({ limit: 50 });

	const loanTypes = useMemo(() => {
		const list =
			(loanTypesData as any)?.data?.loanTypes || (loanTypesData as any)?.loanTypes || [];
		return (Array.isArray(list) ? list : []).filter(
			(type: any) => type.isActive !== false,
		);
	}, [loanTypesData]);

	const [loanTypeId, setLoanTypeId] = useState("");
	const [amountRaw, setAmountRaw] = useState("");
	const [termMonthsRaw, setTermMonthsRaw] = useState("");
	const [startDate, setStartDate] = useState("");
	const [notes, setNotes] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const selectedType = loanTypes.find((type: any) => type.id === loanTypeId);
	const principal = Number(amountRaw);
	const termMonths = Number(termMonthsRaw);
	const amountError =
		selectedType && Number(amountRaw) > 0
			? selectedType.minAmount && principal < selectedType.minAmount
				? `Minimum for ${selectedType.name} is ${peso(selectedType.minAmount)}`
				: selectedType.maxAmount && principal > selectedType.maxAmount
					? `Maximum for ${selectedType.name} is ${peso(selectedType.maxAmount)}`
					: ""
			: "";
	const termError =
		selectedType && termMonths > 0 && selectedType.maxTermMonths && termMonths > selectedType.maxTermMonths
			? `Maximum term is ${selectedType.maxTermMonths} months`
			: "";
	const terms =
		selectedType && principal > 0 && termMonths > 0
			? computeSalaryLoanTerms(principal, Number(selectedType.interestRate || 0), termMonths, startDate)
			: null;

	const canSubmit =
		Boolean(employeeId && organizationId && loanTypeId && startDate) &&
		principal > 0 &&
		!amountError &&
		!termError;

	const handleSubmit = async () => {
		if (!canSubmit || !terms) return;
		setSubmitting(true);
		try {
			const payload: CreateEmployeeLoanRequest = {
				organizationId,
				employeeId,
				loanTypeId,
				principalAmount: principal,
				interestRate: Number(selectedType.interestRate || 0),
				totalAmount: terms.total,
				termMonths,
				monthlyPayment: terms.monthly,
				startDate,
				endDate: terms.end || startDate,
				amountPaid: 0,
				balance: terms.total,
				status: "PENDING",
				...(notes.trim() ? { notes: notes.trim() } : {}),
			};
			const result = await employeeLoansService.createApplication(payload);
			toast.success(
				result?.message ||
					"Salary loan application submitted. HR will review your request.",
			);
			setAmountRaw("");
			setTermMonthsRaw("");
			setStartDate("");
			setNotes("");
			setLoanTypeId("");
		} catch (error) {
			console.error(error);
			const message =
				error instanceof Error ? error.message : "Failed to submit loan application.";
			toast.error(message);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:p-6">
			<div>
				<h1 className="text-lg font-semibold">Salary Loan Application</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Submit a BNPI salary loan request. Your application goes to HR as PENDING and follows the existing loan approval flow.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Apply</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<label className="text-sm font-medium">Loan type</label>
						<Select value={loanTypeId} onValueChange={setLoanTypeId}>
							<SelectTrigger>
								<SelectValue placeholder={typesLoading ? "Loading types…" : "Select loan type"} />
							</SelectTrigger>
							<SelectContent>
								{loanTypes.map((type: any) => (
									<SelectItem key={type.id} value={type.id}>
										{type.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{selectedType?.description ? (
							<p className="text-xs text-muted-foreground">{selectedType.description}</p>
						) : null}
					</div>

					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<label className="text-sm font-medium">Amount</label>
							<Input
								type="number"
								min="0"
								step="0.01"
								value={amountRaw}
								onChange={(event) => setAmountRaw(event.target.value)}
								placeholder="0.00"
							/>
							{amountError ? (
								<Badge className="bg-red-600 hover:bg-red-500">{amountError}</Badge>
							) : null}
							{selectedType && !amountError ? (
								<p className="text-xs text-muted-foreground">
									Range: {peso(selectedType.minAmount || 0)} – {peso(selectedType.maxAmount || 0)}
								</p>
							) : null}
						</div>

						<div className="space-y-2">
							<label className="text-sm font-medium">Term (months)</label>
							<Input
								type="number"
								min="1"
								step="1"
								value={termMonthsRaw}
								onChange={(event) => setTermMonthsRaw(event.target.value)}
								placeholder="12"
							/>
							{termError ? (
								<Badge className="bg-red-600 hover:bg-red-500">{termError}</Badge>
							) : null}
						</div>

						<div className="space-y-2">
							<label className="text-sm font-medium">Start date</label>
							<Input
								type="date"
								value={startDate}
								onChange={(event) => setStartDate(event.target.value)}
							/>
						</div>
					</div>

					<div className="space-y-2">
						<label className="text-sm font-medium">Notes (optional)</label>
						<textarea
							className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							value={notes}
							onChange={(event) => setNotes(event.target.value)}
							placeholder="Purpose or additional details"
						/>
					</div>

					{terms ? (
						<div className="grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-3">
							<div>
								<p className="text-xs text-muted-foreground">Annual interest</p>
								<p className="font-medium">{Number(selectedType.interestRate || 0)}%</p>
							</div>
							<div>
								<p className="text-xs text-muted-foreground">Total to pay</p>
								<p className="font-medium">{peso(terms.total)}</p>
							</div>
							<div>
								<p className="text-xs text-muted-foreground">Monthly payment</p>
								<p className="font-medium">{peso(terms.monthly)}</p>
							</div>
						</div>
					) : null}

					<div className="flex justify-end gap-2">
						<Button variant="outline" onClick={() => navigate(-1)}>
							Cancel
						</Button>
						<Button disabled={!canSubmit || submitting} onClick={handleSubmit}>
							{submitting ? "Submitting…" : "Submit application"}
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
