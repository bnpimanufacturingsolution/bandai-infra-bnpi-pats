import { PayrollPeriodsManagement } from "~/components/templates/common/payroll-periods-template";

export default function AdminConfigurationPayrollPeriodsPage() {
	return (
		<PayrollPeriodsManagement
			title="Payroll Periods"
			description="Configure payroll cutoff periods and pay dates"
		/>
	);
}
