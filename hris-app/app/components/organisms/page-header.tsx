import { Text } from "@/components/atoms/Text";

interface PageHeaderProps {
	title: string;
	subtitle?: string;
}

export const PageHeader = ({ title, subtitle }: PageHeaderProps) => {
	return (
		<header className="text-center mb-8">
			{/* Logo */}
			<div className="flex items-center justify-center gap-3 mb-6">
				<div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
					<span className="text-primary-foreground font-bold text-lg">B</span>
				</div>
				<span className="text-xl font-semibold text-foreground">Bandai HRIS</span>
			</div>

			<Text as="h1" className="text-3xl mb-2">
				{title}
			</Text>
			{subtitle && (
				<Text variant="body" className="text-muted-foreground max-w-xl mx-auto">
					{subtitle}
				</Text>
			)}
		</header>
	);
};
