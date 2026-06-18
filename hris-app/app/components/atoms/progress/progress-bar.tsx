interface ProgressBarProps {
	currentStep: number;
	totalSteps: number;
}

export function ProgressBar({ currentStep, totalSteps }: ProgressBarProps) {
	return (
		<div className="flex gap-2">
			{Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => (
				<div
					key={step}
					className={`h-1 flex-1 rounded-full transition-colors ${
						step <= currentStep ? "bg-red-500" : "bg-border"
					}`}
				/>
			))}
		</div>
	);
}
