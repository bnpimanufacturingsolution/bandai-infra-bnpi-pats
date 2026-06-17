import { BenefitsManagement } from "~/components/templates/hr/benefits-management-template";
import { type MetaFunction } from "react-router";

export const meta: MetaFunction = () => {
	return [
		{ title: "Benefits Management | HRIS" },
		{ name: "description", content: "Manage employee benefits" },
	];
};

export default function BenefitsManagementPage() {
	return (
		<BenefitsManagement
			title="Benefits Management"
			description="Manage employee benefit enrollments and coverage"
		/>
	);
}
