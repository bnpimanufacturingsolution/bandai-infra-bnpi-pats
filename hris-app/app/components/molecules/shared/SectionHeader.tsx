interface SectionHeaderProps {
	title: string;
	description?: string;
	className?: string;
}

export function SectionHeader({ title, description, className = "" }: SectionHeaderProps) {
	return (
		<div
			className={`flex flex-col items-center justify-center space-y-4 text-center mb-12 ${className}`}>
			<h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">{title}</h2>
			{description && (
				<p className="max-w-[700px] text-muted-foreground md:text-xl">{description}</p>
			)}
		</div>
	);
}
