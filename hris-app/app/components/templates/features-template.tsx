import { SectionHeader } from "@/components/molecules/shared/SectionHeader";
import { FeatureCard } from "@/components/molecules/shared/FeatureCard";
import { Smartphone, FileText, Users } from "lucide-react";

export function FeaturesTemplate() {
	const featureCards = [
		{
			icon: Smartphone,
			title: "Responsive Design",
			features: [
				"Mobile-first approach",
				"Cross-platform compatibility",
				"Touch-friendly interface",
			],
		},
		{
			icon: FileText,
			title: "Type Safety",
			features: [
				"Full TypeScript support",
				"IntelliSense and autocomplete",
				"Compile-time error checking",
			],
		},
		{
			icon: Users,
			title: "Modern Architecture",
			features: ["Component-based design", "File-based routing", "Optimized performance"],
		},
	];

	return (
		<section id="features" className="py-16 bg-slate-50">
			<div className="container px-4 md:px-6 max-w-7xl mx-auto">
				<SectionHeader
					title="Built for Modern Development"
					description="Experience a new level of productivity with our developer-friendly template."
				/>

				<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
					{featureCards.map((card, index) => (
						<FeatureCard
							key={index}
							icon={card.icon}
							title={card.title}
							features={card.features}
						/>
					))}
				</div>
			</div>
		</section>
	);
}
