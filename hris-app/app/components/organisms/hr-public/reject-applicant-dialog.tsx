import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface RejectApplicantDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onReject: (reason: string, feedback: string) => void;
}

export function RejectApplicantDialog({
	open,
	onOpenChange,
	onReject,
}: RejectApplicantDialogProps) {
	const [reason, setReason] = useState("");
	const [feedback, setFeedback] = useState("");

	const handleReject = () => {
		if (!reason.trim()) return;
		onReject(reason, feedback);
		setReason("");
		setFeedback("");
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Reject Applicant</DialogTitle>
					<DialogDescription>
						Please provide a reason for rejecting this applicant. This information will
						be stored for internal records.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 py-4">
					<div className="space-y-2">
						<Label htmlFor="reason">Rejection Reason *</Label>
						<Input
							id="reason"
							placeholder="e.g., Insufficient experience"
							value={reason}
							onChange={(e) => setReason(e.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="feedback">Additional Feedback (Optional)</Label>
						<Textarea
							id="feedback"
							placeholder="Provide detailed feedback..."
							value={feedback}
							onChange={(e) => setFeedback(e.target.value)}
							rows={4}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button variant="destructive" onClick={handleReject} disabled={!reason.trim()}>
						Confirm Rejection
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
