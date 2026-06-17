import { SectionHeader } from "@/components/molecules/shared/SectionHeader";
import { BenefitItem } from "@/components/molecules/shared/BenefitItem";
import { Clock, Shield, Smartphone, Award, Gift, FileText } from "lucide-react";

export function BenefitsTemplate() {
	const benefitItems = [
		{
			icon: Clock,
			title: "Fast Development",
			description:
				"Build and deploy applications quickly with our optimized development workflow.",
		},
		{
			icon: Shield,
			title: "Type Safety",
			description: "Catch errors early with comprehensive TypeScript integration.",
		},
		{
			icon: Smartphone,
			title: "Responsive Design",
			description: "Create applications that work perfectly on all devices and screen sizes.",
		},
		{
			icon: Award,
			title: "Best Practices",
			description: "Follow industry standards with our well-structured codebase.",
		},
		{
			icon: Gift,
			title: "Ready to Use",
			description: "Start building immediately with pre-configured components and layouts.",
		},
		{
			icon: FileText,
			title: "Well Documented",
			description: "Clear documentation and examples to help you get started quickly.",
		},
	];

	return (
		<section id="benefits" className="py-16">
			<div className="container px-4 md:px-6 max-w-7xl mx-auto">
				<SectionHeader
					title="Why Choose This Template"
					description="Experience the advantages of our modern React development template."
				/>

				<div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
					{benefitItems.map((item, index) => (
						<BenefitItem
							key={index}
							icon={item.icon}
							title={item.title}
							description={item.description}
						/>
					))}
				</div>
			</div>
		</section>
	);
}
