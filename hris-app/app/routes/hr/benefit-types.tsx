import { BenefitTypesTemplate } from "~/components/templates/hr/benefit-types-template";
import type { Route } from "./+types/benefit-types";

export function meta({}: Route.MetaArgs) {
	return [
		{ title: "Benefit Types | HRIS" },
		{ name: "description", content: "Manage benefit types" },
	];
}

export default function BenefitTypesPage() {
	return <BenefitTypesTemplate />;
}
