import { BenefitsManagement } from "~/components/templates/hr/benefits-management-template";
import { type MetaFunction } from "react-router";

export const meta: MetaFunction = () => {
	return [
		{ title: "Benefits Management | HRIS" },
		{
			name: "description",
			content: "Browse benefit types and see who is enrolled in each",
		},
	];
};

export default function BenefitsManagementPage() {
	return (
		<BenefitsManagement
			title="Benefits Management"
			description="Browse benefit types and see who is enrolled in each"
		/>
	);
}
