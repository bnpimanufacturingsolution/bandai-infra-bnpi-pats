import type { Route } from "./+types/public-landing";
import { Header } from "@/components/organisms/shared/Header";
import { HeroTemplate } from "@/components/templates/hero-template";
import { FeaturesTemplate } from "@/components/templates/features-template";
import { BenefitsTemplate } from "@/components/templates/benefits-template";
import { CTATemplate } from "@/components/templates/cta-template";
import { ContactTemplate } from "@/components/templates/contact-template";
import { Footer } from "@/components/organisms/shared/Footer";

export function meta({}: Route.MetaArgs) {
	return [
		{ title: "HR Management System" },
		{
			name: "description",
			content:
				"A modern HR Management System built with React Router, TypeScript, and Tailwind CSS.",
		},
	];
}

export default function PublicLandingPage() {
	return (
		<div className="flex flex-col min-h-screen">
			<Header />
			<main className="flex-1">
				<HeroTemplate />
				<FeaturesTemplate />
				<BenefitsTemplate />
				<CTATemplate />
				<ContactTemplate />
			</main>
			<Footer />
		</div>
	);
}
