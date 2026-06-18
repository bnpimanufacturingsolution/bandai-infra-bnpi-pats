interface StatusButtonProps {
	label: string;
	isSelected: boolean;
	onClick: () => void;
}

export function StatusButton({ label, isSelected, onClick }: StatusButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`p-4 rounded-md border transition-all text-sm font-medium
        ${
			isSelected
				? "bg-red-500 text-white border-red-500"
				: "bg-background border-border hover:border-red-500/50 text-foreground"
		}
      `}>
			{label}
		</button>
	);
}
