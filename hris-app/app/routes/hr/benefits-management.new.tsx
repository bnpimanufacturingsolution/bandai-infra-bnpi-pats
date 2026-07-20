import { BenefitsManagementCreate } from "~/components/templates/hr/benefits-management-create-template";
import { type MetaFunction } from "react-router";

export const meta: MetaFunction = () => {
	return [
		{ title: "Add Payroll Adjustment | Benefits Management | HRIS" },
		{
			name: "description",
			content: "Create an employee benefit payroll adjustment",
		},
	];
};

export default function BenefitsManagementNewPage() {
	return <BenefitsManagementCreate />;
}
