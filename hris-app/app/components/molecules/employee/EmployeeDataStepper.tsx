import { User, Briefcase, FileCheck, Gift, Lock } from "lucide-react";

export interface StepConfig {
	id: string;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
}

interface EmployeeDataStepperProps {
	currentStep: number;
	steps: StepConfig[];
	onStepClick?: (stepIndex: number) => void;
	allowFutureSteps?: boolean;
}

export function EmployeeDataStepper({
	currentStep,
	steps,
	onStepClick,
	allowFutureSteps = false,
}: EmployeeDataStepperProps) {
	return (
		<div className="w-full">
			<div className="flex items-center justify-between relative">
				{steps.map((step, index) => {
					const Icon = step.icon;
					const isActive = index === currentStep;
					const isCompleted = index < currentStep;
					const isClickable = onStepClick && (index <= currentStep || allowFutureSteps);

					return (
						<div key={step.id} className="flex flex-col items-center flex-1 relative">
							{/* Connection Line */}
							{index !== 0 && (
								<div
									className="absolute left-0 right-1/2 top-7 h-[2px] -translate-y-1/2"
									style={{
										width: "calc(100% - 36px)",
										left: "calc(-50% + 36px)",
									}}>
									<div
										className={`h-full transition-all duration-300 ${
											isCompleted || isActive
												? "bg-orange-500"
												: "bg-gray-200"
										}`}
									/>
								</div>
							)}

							{/* Circle with Icon */}
							<button
								type="button"
								onClick={() => isClickable && onStepClick(index)}
								disabled={!isClickable}
								className={`relative z-10 w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-200 ${
									isActive
										? "bg-orange-500 shadow-sm"
										: isCompleted
											? "bg-red-500 hover:bg-red-600"
											: "bg-gray-100 border border-gray-200"
								} ${isClickable ? "cursor-pointer" : "cursor-default"}`}>
								<Icon
									className={`w-6 h-6 transition-all ${
										isActive || isCompleted ? "text-white" : "text-gray-400"
									}`}
								/>
							</button>

							{/* Label */}
							<span
								className={`mt-2.5 text-xs font-medium text-center transition-colors ${
									isActive
										? "text-orange-600"
										: isCompleted
											? "text-red-600"
											: "text-gray-400"
								}`}>
								{step.label}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
