import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { EmployeeBenefitForm } from "~/components/templates/hr/employee-benefit-form";

/**
 * Full-page create flow for employee benefit / payroll adjustments.
 * Replaces the previous modal opened via `/hr/benefits-management?action=create`.
 */
export function BenefitsManagementCreate() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();

	const payrollPeriodId = searchParams.get("payrollPeriodId") || "";
	const periodCode = searchParams.get("periodCode") || "";
	const periodStart = searchParams.get("periodStart") || "";
	const periodEnd = searchParams.get("periodEnd") || "";
	const periodView = searchParams.get("periodView") || "";
	const departmentId = searchParams.get("departmentId") || "";
	const sectionId = searchParams.get("sectionId") || "";
	const adjustment = searchParams.get("adjustment") || "";
	const returnTo = searchParams.get("returnTo") || "";

	const listReturnUrl = useMemo(() => {
		const params = new URLSearchParams(searchParams);
		params.delete("action");
		params.delete("id");
		const query = params.toString();
		return `/hr/benefits-management${query ? `?${query}` : ""}`;
	}, [searchParams]);

	const runPayrollReturnUrl = useMemo(() => {
		const params = new URLSearchParams();
		if (periodCode) params.set("periodCode", periodCode);
		if (periodView) params.set("periodView", periodView);
		if (departmentId) params.set("departmentId", departmentId);
		if (sectionId) params.set("sectionId", sectionId);
		if (adjustment) params.set("adjustment", adjustment);
		return `/hr/run-payroll${params.toString() ? `?${params.toString()}` : ""}`;
	}, [adjustment, departmentId, periodCode, periodView, sectionId]);

	const handleCancel = () => {
		if (returnTo === "run-payroll") {
			navigate(runPayrollReturnUrl);
			return;
		}
		navigate(listReturnUrl);
	};

	const handleSuccess = () => {
		if (returnTo === "run-payroll") {
			navigate(runPayrollReturnUrl);
			return;
		}
		navigate(listReturnUrl);
	};

	return (
		<div className="mx-auto w-full max-w-3xl space-y-3 pb-10">
			<div className="space-y-3">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={handleCancel}
					className="-ml-2 h-9 gap-1.5 px-2 text-neutral-600 hover:text-neutral-900">
					<ArrowLeft className="h-4 w-4" />
					{returnTo === "run-payroll" ? "Back to Run Payroll" : "Back to benefits"}
				</Button>

				<header className="space-y-1 border-b border-neutral-100 pb-3">
					<p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400">
						Benefits management
					</p>
					<h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
						Add payroll adjustment
					</h1>
				</header>
			</div>

			<EmployeeBenefitForm
				mode="create"
				presentation="page"
				payrollPeriodId={payrollPeriodId}
				periodCode={periodCode}
				periodStart={periodStart}
				periodEnd={periodEnd}
				onCancel={handleCancel}
				onSuccess={handleSuccess}
				cancelLabel={returnTo === "run-payroll" ? "Back" : "Cancel"}
			/>
		</div>
	);
}
