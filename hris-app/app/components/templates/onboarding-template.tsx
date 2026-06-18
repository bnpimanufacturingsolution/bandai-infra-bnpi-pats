import { useState, useEffect } from "react";
import { useSearchParams } from "react-router";
import WelcomeScreen from "../organisms/onboarding/welcome-screen";
import ProfileCompletion from "../organisms/onboarding/profile-completion";
import CompanyIntroduction from "../organisms/onboarding/company-introduction";
import KeyFeaturesTour from "../organisms/onboarding/key-feaeture-tour";
import ImportantActions from "../organisms/onboarding/important-actions";
import { type ChecklistItem } from "~/zod/checklist-item";

interface OnboardingPageProps {
	onComplete?: () => void;
	checklistItems?: ChecklistItem[];
	isCompletingOnboarding?: boolean;
}

const STEP_KEYS = ["welcome", "profile", "intro", "tour", "actions"];

export default function OnboardingPage({
	onComplete,
	checklistItems = [],
	isCompletingOnboarding = false,
}: OnboardingPageProps) {
	const [searchParams, setSearchParams] = useSearchParams();
	const [completedSteps, setCompletedSteps] = useState<boolean[]>([false, false, false, false]);

	// Derive current step from URL or default to 0
	const currentStepKey = searchParams.get("step") || STEP_KEYS[0];
	const currentStep = Math.max(0, STEP_KEYS.indexOf(currentStepKey));

	// Sync valid step to URL if missing or invalid
	useEffect(() => {
		if (!STEP_KEYS.includes(currentStepKey)) {
			setSearchParams((prev) => {
				prev.set("step", STEP_KEYS[0]);
				return prev;
			});
		}
	}, [currentStepKey, setSearchParams]);

	const updateStep = (index: number) => {
		if (index >= 0 && index < STEP_KEYS.length) {
			setSearchParams((prev) => {
				prev.set("step", STEP_KEYS[index]);
				return prev;
			});
		}
	};

	const handleNextStep = () => {
		if (currentStep < 4) {
			const newCompletedSteps = [...completedSteps];
			newCompletedSteps[currentStep] = true;
			setCompletedSteps(newCompletedSteps);
			updateStep(currentStep + 1);
		}
	};

	const handlePreviousStep = () => {
		if (currentStep > 0) {
			updateStep(currentStep - 1);
		}
	};

	const handleSkipStep = () => {
		handleNextStep();
	};

	const handleCompleteOnboarding = () => {
		const newCompletedSteps = [...completedSteps];
		newCompletedSteps[currentStep] = true;
		setCompletedSteps(newCompletedSteps);
		if (onComplete) {
			onComplete();
		}
	};

	const steps = [
		{
			title: "Welcome",
			component: <WelcomeScreen onNext={handleNextStep} />,
		},
		{
			title: "Complete Profile",
			component: (
				<ProfileCompletion
					onNext={handleNextStep}
					onBack={handlePreviousStep}
					onSkip={handleSkipStep}
				/>
			),
		},
		{
			title: "Company Introduction",
			component: (
				<CompanyIntroduction
					onNext={handleNextStep}
					onBack={handlePreviousStep}
					onSkip={handleSkipStep}
				/>
			),
		},
		{
			title: "Key Features Tour",
			component: (
				<KeyFeaturesTour
					onNext={handleNextStep}
					onBack={handlePreviousStep}
					onSkip={handleSkipStep}
				/>
			),
		},
		{
			title: "Important Actions",
			component: (
				<ImportantActions
					onComplete={handleCompleteOnboarding}
					onBack={handlePreviousStep}
					checklistItems={checklistItems}
					isLoading={isCompletingOnboarding}
				/>
			),
		},
	];

	return (
		<div className="min-h-screen bg-slate-50 relative overflow-hidden flex flex-col font-sans selection:bg-orange-100 selection:text-orange-900">
			{/* Decorative Background Elements */}
			<div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
				<div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-orange-200/20 blur-[100px]" />
				<div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-red-200/20 blur-[100px]" />
			</div>

			{/* Progress Indicator */}
			<div className="fixed top-0 left-0 right-0 h-1.5 bg-gray-100 z-50">
				<div
					className="h-full bg-gradient-to-r from-orange-500 to-red-600 transition-all duration-500 ease-out shadow-[0_0_10px_rgba(249,115,22,0.5)]"
					style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
				/>
			</div>

			<div className="flex flex-1 relative z-10 pt-4">
				{/* Main Content */}
				<div className="flex-1 flex items-center justify-center p-4">
					<div className="w-full max-w-5xl animate-in fade-in zoom-in-95 duration-500">
						{steps[currentStep]?.component}
					</div>
				</div>

				{/* Checklist Sidebar */}
			</div>
		</div>
	);
}
