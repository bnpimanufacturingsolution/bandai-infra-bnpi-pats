import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { MessageSquare } from "lucide-react";
import { RESCHEDULE_REASON_LABELS, type RescheduleReason } from "@/types/interview";
import { FormField } from "../molecules/form-build";
import { Text } from "../atoms";

interface AdditionalInfoFormProps {
	notes: string;
	onNotesChange: (value: string) => void;
	accessibilityRequests: string;
	onAccessibilityChange: (value: string) => void;
	showReschedule?: boolean;
	rescheduleReason?: RescheduleReason | "";
	onRescheduleReasonChange?: (value: RescheduleReason) => void;
	maxNotesLength?: number;
}

export const AdditionalInfoForm = ({
	notes,
	onNotesChange,
	accessibilityRequests,
	onAccessibilityChange,
	showReschedule = false,
	rescheduleReason = "",
	onRescheduleReasonChange,
	maxNotesLength = 500,
}: AdditionalInfoFormProps) => {
	const notesRemaining = maxNotesLength - notes.length;

	return (
		<section
			aria-labelledby="additional-info-heading"
			className="card-elevated p-6 animate-fade-in"
			style={{ animationDelay: "0.2s" }}>
			<div className="flex items-center gap-3 mb-6">
				<div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center">
					<MessageSquare className="h-5 w-5 text-secondary-foreground" />
				</div>
				<div>
					<Text as="h2" id="additional-info-heading">
						Additional Information
					</Text>
					<Text variant="caption">Optional notes or special requests</Text>
				</div>
			</div>

			<div className="space-y-6">
				{/* Reschedule Reason (Conditional) */}
				{showReschedule && (
					<FormField
						label="Reason for Reschedule"
						htmlFor="reschedule-reason"
						helperText="Please select a reason for your reschedule request">
						<Select
							value={rescheduleReason}
							onValueChange={(value) =>
								onRescheduleReasonChange?.(value as RescheduleReason)
							}>
							<SelectTrigger id="reschedule-reason" className="w-full">
								<SelectValue placeholder="Select a reason..." />
							</SelectTrigger>
							<SelectContent>
								{(
									Object.entries(RESCHEDULE_REASON_LABELS) as [
										RescheduleReason,
										string,
									][]
								).map(([value, label]) => (
									<SelectItem key={value} value={value}>
										{label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</FormField>
				)}

				{/* Notes for Interviewer */}
				<FormField
					label="Notes for Interviewer"
					htmlFor="interviewer-notes"
					optional
					helperText="Share any relevant information about yourself or questions you'd like addressed">
					<div className="relative">
						<Textarea
							id="interviewer-notes"
							value={notes}
							onChange={(e) => onNotesChange(e.target.value)}
							placeholder="E.g., I'm particularly interested in learning about team dynamics..."
							maxLength={maxNotesLength}
							rows={4}
							className="resize-none"
						/>
						<span
							className={`absolute bottom-2 right-2 text-xs ${
								notesRemaining < 50 ? "text-warning" : "text-muted-foreground"
							}`}>
							{notesRemaining} characters remaining
						</span>
					</div>
				</FormField>

				{/* Accessibility Requests */}
				<FormField
					label="Accessibility or Scheduling Requests"
					htmlFor="accessibility-requests"
					optional
					helperText="Let us know if you need any accommodations (e.g., sign language interpreter, screen reader compatibility)">
					<Textarea
						id="accessibility-requests"
						value={accessibilityRequests}
						onChange={(e) => onAccessibilityChange(e.target.value)}
						placeholder="E.g., I require closed captioning for video calls..."
						rows={3}
						className="resize-none"
					/>
				</FormField>
			</div>
		</section>
	);
};
