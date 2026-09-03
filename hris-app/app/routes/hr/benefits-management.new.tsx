import { BenefitsManagementCreate } from "~/components/templates/hr/benefits-management-create-template";
import { type MetaFunction } from "react-router";

export const meta: MetaFunction = () => {
	return [
		{ title: "Enroll Employees | Benefits Management | HRIS" },
		{
			name: "description",
			content:
				"Enroll employees in a benefit type and set how it pays on payroll",
		},
	];
};

export default function BenefitsManagementNewPage() {
	return <BenefitsManagementCreate />;
}
