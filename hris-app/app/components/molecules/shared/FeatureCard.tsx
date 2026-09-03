import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";

interface FeatureCardProps {
	icon: React.ComponentType<{ className?: string }>;
	title: string;
	features: string[];
}

export function FeatureCard({ icon: Icon, title, features }: FeatureCardProps) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<Icon className="h-10 w-10 text-primary mb-2" />
				<CardTitle>{title}</CardTitle>
			</CardHeader>
			<CardContent>
				<ul className="space-y-2 text-sm">
					{features.map((feature, index) => (
						<li key={index} className="flex items-center">
							<CheckCircle className="h-4 w-4 text-green-500 mr-2" />
							<span>{feature}</span>
						</li>
					))}
				</ul>
			</CardContent>
		</Card>
	);
}
