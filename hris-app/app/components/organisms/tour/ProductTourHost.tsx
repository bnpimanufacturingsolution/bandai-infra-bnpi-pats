import { useEffect, useState, useRef } from "react";
import { useProductTour } from "./ProductTourProvider";
import { Button } from "~/components/atoms/Button";
import { cn } from "~/lib/utils";
import { X, ChevronRight, ChevronLeft } from "lucide-react";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";

export function ProductTourHost() {
	// Removed unused hooks and context
	const { isActive, currentStepIndex, steps, endTour, nextStep, prevStep, onDismiss } =
		useProductTour();
	const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
	const currentStep = steps[currentStepIndex];
	const [isVisible, setIsVisible] = useState(false);
	const [dontShowAgain, setDontShowAgain] = useState(false);

	// Handle hiding the tour
	const handleClose = () => {
		if (dontShowAgain && onDismiss) {
			onDismiss();
		}
		endTour(false);
	};

	// Handle finishing the tour
	const handleFinish = () => {
		if (dontShowAgain && onDismiss) {
			onDismiss();
		}
		endTour(true);
	};

	// Update the highlight position when step changes or window resizes
	useEffect(() => {
		if (!isActive || !currentStep) {
			setTargetRect(null);
			setIsVisible(false);
			return;
		}

		const updatePosition = () => {
			const element = document.querySelector(currentStep.element);
			if (element) {
				const rect = element.getBoundingClientRect();
				setTargetRect(rect);
				setIsVisible(true);

				// Ensure element is in view
				element.scrollIntoView({ behavior: "smooth", block: "center" });
			} else {
				setTargetRect(null);
				setIsVisible(false);
			}
		};

		// Small delay to allow for animations/layout shifts
		const timer = setTimeout(updatePosition, 100);
		window.addEventListener("resize", updatePosition);
		window.addEventListener("scroll", updatePosition);

		return () => {
			clearTimeout(timer);
			window.removeEventListener("resize", updatePosition);
			window.removeEventListener("scroll", updatePosition);
		};
	}, [isActive, currentStepIndex, steps, currentStep]);

	if (!isActive || !currentStep || !targetRect || !isVisible) return null;

	const isLastStep = currentStepIndex === steps.length - 1;
	const isFirstStep = currentStepIndex === 0;

	// Calculate popover position
	const side = currentStep.popover.side || "bottom";
	const align = currentStep.popover.align || "center";
	let top = targetRect.bottom + 12;
	let left = targetRect.left + targetRect.width / 2;
	let transform = "translateX(-50%)";

	if (side === "top" || side === "bottom") {
		if (align === "start") {
			left = targetRect.left;
			transform = "";
		} else if (align === "end") {
			left = targetRect.right;
			transform = "translateX(-100%)";
		}

		if (side === "top") {
			top = targetRect.top - 12;
			transform += " translateY(-100%)";
		}
	} else if (side === "left" || side === "right") {
		top = targetRect.top + targetRect.height / 2;
		transform = "translateY(-50%)";

		if (side === "left") {
			left = targetRect.left - 12;
			transform += " translateX(-100%)";
		} else {
			left = targetRect.right + 12;
		}

		if (align === "start") {
			top = targetRect.top;
			transform = transform.replace("translateY(-50%)", "");
		} else if (align === "end") {
			top = targetRect.bottom;
			transform = transform.replace("translateY(-50%)", "translateY(-100%)");
		}
	}

	const popoverStyle: React.CSSProperties = {
		position: "fixed",
		zIndex: 1001,
		top,
		left,
		transform,
	};

	return (
		<>
			<div className="fixed inset-0 z-[1000] pointer-events-none">
				{/* Overlay with a hole (using svg mask or large borders) */}
				<div
					className="absolute inset-0 bg-black/40 pointer-events-auto"
					style={{
						clipPath: `polygon(
						0% 0%, 0% 100%, 
						${targetRect.left}px 100%, 
						${targetRect.left}px ${targetRect.top}px, 
						${targetRect.right}px ${targetRect.top}px, 
						${targetRect.right}px ${targetRect.bottom}px, 
						${targetRect.left}px ${targetRect.bottom}px, 
						${targetRect.left}px 100%, 
						100% 100%, 100% 0%
					)`,
					}}
				/>

				{/* Highlight Border */}
				<div
					className="absolute border-2 border-orange-500 rounded-lg transition-all duration-300"
					style={{
						top: targetRect.top - 4,
						left: targetRect.left - 4,
						width: targetRect.width + 8,
						height: targetRect.height + 8,
					}}
				/>

				{/* Popover Content */}
				<div
					style={popoverStyle}
					className="w-80 bg-white rounded-xl shadow-2xl border border-orange-100 p-5 pointer-events-auto animate-in fade-in zoom-in duration-200">
					<div className="flex justify-between items-start mb-2">
						<h3 className="font-bold text-gray-900 text-lg leading-tight">
							{currentStep.popover.title}
						</h3>
						<button
							onClick={handleClose}
							className="p-1 hover:bg-gray-100 rounded-full transition-colors">
							<X className="w-4 h-4 text-gray-400" />
						</button>
					</div>

					<p className="text-sm text-gray-600 mb-6 leading-relaxed">
						{currentStep.popover.description}
					</p>

					<div className="flex items-center justify-between">
						<span className="text-xs font-medium text-gray-400">
							Step {currentStepIndex + 1} of {steps.length}
						</span>

						<div className="flex gap-2">
							{!isFirstStep && (
								<Button
									variant="outline"
									size="sm"
									onClick={prevStep}
									className="h-8 px-2 text-gray-600 border-gray-200">
									<ChevronLeft className="w-4 h-4 mr-1" />
									Back
								</Button>
							)}

							<Button
								size="sm"
								onClick={isLastStep ? handleFinish : nextStep}
								className="h-8 bg-orange-600 hover:bg-orange-700 text-white font-semibold">
								{isLastStep ? (
									"Finish"
								) : (
									<>
										Next
										<ChevronRight className="w-4 h-4 ml-1" />
									</>
								)}
							</Button>
						</div>
					</div>
					<div className="flex items-center space-x-2 mt-4 pt-3 border-t border-gray-100">
						<Checkbox
							id="tour-dont-show"
							checked={dontShowAgain}
							onCheckedChange={(checked) => setDontShowAgain(checked === true)}
						/>
						<Label
							htmlFor="tour-dont-show"
							className="text-xs font-medium leading-none text-gray-500 cursor-pointer">
							Don't show again
						</Label>
					</div>
				</div>
			</div>
		</>
	);
}
