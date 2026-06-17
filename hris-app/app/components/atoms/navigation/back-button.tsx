import { ArrowLeft } from "lucide-react";

interface BackButtonProps {
	onClick: () => void;
	label: string;
}

export function BackButton({ onClick, label }: BackButtonProps) {
	return (
		<button
			onClick={onClick}
			className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
			<ArrowLeft className="w-5 h-5" />
			<span className="text-sm font-medium">{label}</span>
		</button>
	);
}
