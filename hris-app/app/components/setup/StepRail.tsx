import { CheckCircle2, ChevronRight } from "lucide-react";
import { cn } from "~/lib/utils";

export type SetupRailStep = {
	id: string;
	title: string;
	isComplete?: boolean;
	isCurrent?: boolean;
	isLocked?: boolean;
};

export function StepRail(props: {
	steps: SetupRailStep[];
	currentStep: string;
	onSelect: (step: string) => void;
	progressValue?: number;
}) {
	const progressValue = Math.max(0, Math.min(100, props.progressValue ?? 0));

	return (
		<nav className="space-y-4">
			<div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
				<div className="border-b border-gray-100 px-4 py-4">
					<div className="h-1.5 rounded-full bg-orange-100">
						<div
							className="h-full rounded-full bg-orange-600 transition-all duration-300"
							style={{ width: `${progressValue}%` }}
						/>
					</div>
				</div>

				<ol className="space-y-1 px-2 py-2">
					{props.steps.map((step, index) => {
						const isCurrent = props.currentStep === step.id || step.isCurrent;
						const isComplete = Boolean(step.isComplete);
						const isLocked = Boolean(step.isLocked);

						return (
							<li key={step.id}>
								<button
									type="button"
									onClick={() => !isLocked && props.onSelect(step.id)}
									disabled={isLocked}
									className={cn(
										"flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition",
										isCurrent
											? "border-orange-200 bg-orange-50/80"
											: "border-transparent hover:border-gray-200 hover:bg-gray-50",
										isLocked
											? "cursor-not-allowed opacity-60"
											: "cursor-pointer",
									)}>
									<div
										className={cn(
											"flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
											isComplete
												? "bg-emerald-100 text-emerald-700"
												: isCurrent
													? "bg-orange-600 text-white"
													: "bg-gray-100 text-gray-600",
										)}>
										{isComplete ? (
											<CheckCircle2 className="h-4 w-4" />
										) : (
											index + 1
										)}
									</div>

									<div className="min-w-0 flex-1">
										<p className="truncate text-[13px] font-semibold text-gray-900">
											{step.title}
										</p>
									</div>

									<ChevronRight
										className={cn(
											"mt-1 h-4 w-4 shrink-0 text-gray-300 transition",
											isCurrent ? "text-orange-500" : "",
										)}
									/>
								</button>
							</li>
						);
					})}
				</ol>
			</div>
		</nav>
	);
}
