import { useState } from "react";
import { Text } from "@/components/atoms/Text";
import { Button } from "@/components/ui/button";
import type { TimeSlot, RescheduleReason } from "@/types/interview";
import { format, parseISO } from "date-fns";
import {
	Check,
	Calendar,
	Loader2,
	RefreshCw,
	AlertCircle,
	Mail,
	CalendarCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmationPanelProps {
	selectedDate: string | null;
	selectedSlot: TimeSlot | null;
	isRescheduleMode: boolean;
	rescheduleReason: RescheduleReason | "";
	onConfirm: () => Promise<void>;
	onRequestReschedule: () => void;
	onCancelReschedule: () => void;
}

type SubmitStatus = "idle" | "loading" | "success" | "error";

export const ConfirmationPanel = ({
	selectedDate,
	selectedSlot,
	isRescheduleMode,
	rescheduleReason,
	onConfirm,
	onRequestReschedule,
	onCancelReschedule,
}: ConfirmationPanelProps) => {
	const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
	const [errorMessage, setErrorMessage] = useState<string>("");

	const isConfirmEnabled =
		selectedDate && selectedSlot && (!isRescheduleMode || rescheduleReason);

	const handleConfirm = async () => {
		if (!isConfirmEnabled) return;

		setSubmitStatus("loading");
		setErrorMessage("");

		try {
			await onConfirm();
			setSubmitStatus("success");
		} catch (error) {
			setSubmitStatus("error");
			setErrorMessage(
				error instanceof Error
					? error.message
					: "Failed to confirm schedule. Please try again.",
			);
		}
	};

	// Success State
	if (submitStatus === "success" && selectedDate && selectedSlot) {
		const formattedDate = format(parseISO(selectedDate), "EEEE, MMMM d, yyyy");
		const startTime = format(parseISO(selectedSlot.startTime), "h:mm a");
		const endTime = format(parseISO(selectedSlot.endTime), "h:mm a");

		return (
			<section
				aria-labelledby="confirmation-success-heading"
				className="card-elevated-lg p-8 animate-scale-in border-success/20">
				<div className="text-center">
					<div className="mx-auto h-16 w-16 rounded-full bg-success/10 flex items-center justify-center mb-6">
						<Check className="h-8 w-8 text-success" />
					</div>
					<Text as="h2" id="confirmation-success-heading" className="text-success mb-2">
						Interview Scheduled!
					</Text>
					<Text variant="body" className="text-muted-foreground mb-6">
						Your interview has been confirmed successfully
					</Text>

					<div className="bg-muted rounded-lg p-6 mb-6 text-left">
						<div className="flex items-center gap-3 mb-4">
							<CalendarCheck className="h-5 w-5 text-primary" />
							<Text>Confirmed Schedule</Text>
						</div>
						<div className="space-y-2">
							<div className="flex justify-between">
								<span className="text-muted-foreground">Date:</span>
								<span className="font-medium">{formattedDate}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">Time:</span>
								<span className="font-medium">
									{startTime} - {endTime}
								</span>
							</div>
						</div>
					</div>

					<div className="flex items-center gap-2 justify-center text-muted-foreground">
						<Mail className="h-4 w-4" />
						<Text variant="caption">
							A confirmation email and calendar invite will be sent shortly
						</Text>
					</div>
				</div>
			</section>
		);
	}

	// Default/Error State
	return (
		<section
			aria-labelledby="confirmation-actions-heading"
			className="card-elevated p-6 animate-fade-in"
			style={{ animationDelay: "0.3s" }}>
			<div className="flex items-center gap-3 mb-6">
				<div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
					<Calendar className="h-5 w-5 text-primary" />
				</div>
				<div>
					<Text as="h2" id="confirmation-actions-heading">
						{isRescheduleMode ? "Request Reschedule" : "Confirm Your Schedule"}
					</Text>
					<Text variant="caption">
						{isRescheduleMode
							? "Submit your reschedule request"
							: "Review and confirm your interview time"}
					</Text>
				</div>
			</div>

			{/* Selected Schedule Preview */}
			{selectedDate && selectedSlot && (
				<div className="bg-primary/5 border border-primary/10 rounded-lg p-4 mb-6">
					<Text variant="label" className="text-primary mb-2">
						Selected Schedule
					</Text>
					<div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
						<div className="flex items-center gap-2">
							<Calendar className="h-4 w-4 text-muted-foreground" />
							<span className="font-medium">
								{format(parseISO(selectedDate), "EEEE, MMM d, yyyy")}
							</span>
						</div>
						<span className="hidden sm:inline text-muted-foreground">•</span>
						<div className="flex items-center gap-2">
							<span className="font-medium">
								{format(parseISO(selectedSlot.startTime), "h:mm a")} -{" "}
								{format(parseISO(selectedSlot.endTime), "h:mm a")}
							</span>
						</div>
					</div>
				</div>
			)}

			{/* Error Message */}
			{submitStatus === "error" && (
				<div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg mb-6">
					<AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
					<div>
						<Text variant="label" className="text-destructive">
							Unable to Confirm
						</Text>
						<Text variant="caption" className="text-destructive/80">
							{errorMessage}
						</Text>
					</div>
				</div>
			)}

			{/* Action Buttons */}
			<div className="flex flex-col sm:flex-row gap-3">
				{isRescheduleMode ? (
					<>
						<Button
							variant="outline"
							onClick={onCancelReschedule}
							className="flex-1"
							disabled={submitStatus === "loading"}>
							Cancel
						</Button>
						<Button
							onClick={handleConfirm}
							className="flex-1"
							disabled={!isConfirmEnabled || submitStatus === "loading"}>
							{submitStatus === "loading" ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Submitting...
								</>
							) : (
								<>
									<RefreshCw className="mr-2 h-4 w-4" />
									Submit Reschedule Request
								</>
							)}
						</Button>
					</>
				) : (
					<>
						<Button
							variant="outline"
							onClick={onRequestReschedule}
							className="flex-1 sm:flex-none"
							disabled={submitStatus === "loading"}>
							<RefreshCw className="mr-2 h-4 w-4" />
							Request Reschedule
						</Button>
						<Button
							onClick={handleConfirm}
							className="flex-1"
							disabled={!isConfirmEnabled || submitStatus === "loading"}>
							{submitStatus === "loading" ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Confirming...
								</>
							) : (
								<>
									<Check className="mr-2 h-4 w-4" />
									Confirm Interview Schedule
								</>
							)}
						</Button>
					</>
				)}
			</div>

			{!isConfirmEnabled && !isRescheduleMode && (
				<Text variant="caption" className="mt-4 text-center text-muted-foreground">
					Please select a date and time slot to confirm
				</Text>
			)}

			{isRescheduleMode && !rescheduleReason && (
				<Text variant="caption" className="mt-4 text-center text-muted-foreground">
					Please select a reason for rescheduling
				</Text>
			)}
		</section>
	);
};
