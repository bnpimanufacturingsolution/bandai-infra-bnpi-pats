import { BenefitEnrollmentsTemplate } from "~/components/templates/hr/benefit-enrollments-template";
import type { Route } from "./+types/benefit-enrollments";

export function meta({}: Route.MetaArgs) {
	return [
		{ title: "Employee Benefits | HRIS" },
		{ name: "description", content: "View all employee benefit enrollments" },
	];
}

export default function BenefitEnrollmentsPage() {
	return <BenefitEnrollmentsTemplate />;
}
