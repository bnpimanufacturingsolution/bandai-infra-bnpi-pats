import { BackButton } from "~/components/atoms/navigation/back-button";
import { ProgressBar } from "~/components/atoms/progress/progress-bar";

interface CreateCalendarHeaderProps {
	currentStep: number;
	totalSteps: number;
	onClose: () => void;
}

const stepLabels = ["Calendar Details", "Configuration", "Review & Submit"];

export function CreateCalendarHeader({
	currentStep,
	totalSteps,
	onClose,
}: CreateCalendarHeaderProps) {
	return (
		<div className="mb-8">
			<div className="flex items-center justify-between mb-6">
				<BackButton onClick={onClose} label="Back to Calendars" />
				<div className="flex items-center gap-2">
					<div className="h-1 w-16 bg-red-500 rounded-full"></div>
				</div>
			</div>
			<div className="mb-6">
				<h1 className="text-3xl font-bold text-foreground mb-2">Create Calendar</h1>
				<p className="text-sm text-muted-foreground">
					Fill in the details to create a new calendar
				</p>
			</div>
		</div>
	);
}
