interface BenefitItemProps {
	icon: React.ComponentType<{ className?: string }>;
	title: string;
	description: string;
}

export function BenefitItem({ icon: Icon, title, description }: BenefitItemProps) {
	return (
		<div className="flex flex-col items-center text-center space-y-2">
			<div className="rounded-full bg-primary/10 p-3">
				<Icon className="h-6 w-6 text-primary" />
			</div>
			<h3 className="text-xl font-bold">{title}</h3>
			<p className="text-muted-foreground">{description}</p>
		</div>
	);
}
