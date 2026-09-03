import { Check } from "lucide-react";

interface Step {
	id: string;
	label: string;
}

interface ImportStepIndicatorProps {
	steps: Step[];
	currentStep: string;
	onStepClick?: (stepId: string) => void;
	canClickStep?: (stepId: string) => boolean;
}

export function ImportStepIndicator({
	steps,
	currentStep,
	onStepClick,
	canClickStep,
}: ImportStepIndicatorProps) {
	const currentIndex = steps.findIndex((s) => s.id === currentStep);

	return (
		<div className="flex items-center justify-between px-2 mb-6">
			{steps.map((step, idx) => {
				const isActive = currentStep === step.id;
				const isPast = currentIndex > idx;
				const isClickable = !!onStepClick && (canClickStep ? canClickStep(step.id) : true);

				return (
					<div key={step.id} className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => {
								if (isClickable) onStepClick(step.id);
							}}
							disabled={!isClickable}
							className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium border-2 transition-colors ${
								isActive
									? "border-primary text-primary bg-primary/10"
									: isPast
										? "border-primary bg-primary text-primary-foreground"
										: "border-border text-muted-foreground bg-muted/40"
							} ${isClickable ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
							{isPast ? <Check className="w-4 h-4" /> : idx + 1}
						</button>
						<button
							type="button"
							onClick={() => {
								if (isClickable) onStepClick(step.id);
							}}
							disabled={!isClickable}
							className={`text-sm font-medium transition-colors ${
								isActive
									? "text-primary"
									: isPast
										? "text-primary"
										: "text-muted-foreground"
							} ${isClickable ? "cursor-pointer hover:text-primary" : "cursor-not-allowed opacity-60"}`}>
							{step.label}
						</button>
						{idx < steps.length - 1 && <div className="w-12 h-px bg-border mx-2" />}
					</div>
				);
			})}
		</div>
	);
}
