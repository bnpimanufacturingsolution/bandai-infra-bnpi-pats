import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

export interface TourStep {
	element: string; // CSS selector
	popover: {
		title: string;
		description: string;
		side?: "top" | "left" | "right" | "bottom";
		align?: "start" | "center" | "end";
	};
}

interface ProductTourContextType {
	isActive: boolean;
	currentStepIndex: number;
	steps: TourStep[];
	startTour: (steps: TourStep[], onComplete?: () => void, onDismiss?: () => void) => void;
	endTour: (completed?: boolean) => void;
	nextStep: () => void;
	prevStep: () => void;
	goToStep: (index: number) => void;
	onDismiss?: () => void;
}

const ProductTourContext = createContext<ProductTourContextType | undefined>(undefined);

export const ProductTourProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [isActive, setIsActive] = useState(false);
	const [currentStepIndex, setCurrentStepIndex] = useState(0);
	const [steps, setSteps] = useState<TourStep[]>([]);
	const [onComplete, setOnComplete] = useState<(() => void) | undefined>();
	const [onDismiss, setOnDismiss] = useState<(() => void) | undefined>();

	const startTour = useCallback(
		(tourSteps: TourStep[], onTourComplete?: () => void, onTourDismiss?: () => void) => {
			setSteps(tourSteps);
			setCurrentStepIndex(0);
			setIsActive(true);
			if (onTourComplete) {
				setOnComplete(() => onTourComplete);
			}
			if (onTourDismiss) {
				setOnDismiss(() => onTourDismiss);
			}
		},
		[],
	);

	const endTour = useCallback(
		(completed: boolean = false) => {
			setIsActive(false);
			setSteps([]);
			setCurrentStepIndex(0);
			if (completed && onComplete) {
				onComplete();
			}
			// Reset callbacks
			setOnComplete(undefined);
			setOnDismiss(undefined);
		},
		[onComplete],
	);

	const nextStep = useCallback(() => {
		setCurrentStepIndex((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
	}, [steps.length]);

	const prevStep = useCallback(() => {
		setCurrentStepIndex((prev) => (prev > 0 ? prev - 1 : prev));
	}, []);

	const goToStep = useCallback(
		(index: number) => {
			if (index >= 0 && index < steps.length) {
				setCurrentStepIndex(index);
			}
		},
		[steps.length],
	);

	const value = useMemo(
		() => ({
			isActive,
			currentStepIndex,
			steps,
			startTour,
			endTour,
			nextStep,
			prevStep,
			goToStep,
			onDismiss,
		}),
		[
			isActive,
			currentStepIndex,
			steps,
			startTour,
			endTour,
			nextStep,
			prevStep,
			goToStep,
			onDismiss,
		],
	);

	return <ProductTourContext.Provider value={value}>{children}</ProductTourContext.Provider>;
};

export const useProductTour = () => {
	const context = useContext(ProductTourContext);
	if (context === undefined) {
		throw new Error("useProductTour must be used within a ProductTourProvider");
	}
	return context;
};
