import { useState, useEffect } from "react";
import { Modal } from "~/components/atoms/Modal";
import { ReviewActionModal, type ReviewStatus } from "~/components/organisms/ReviewActionModal";
import { Button } from "~/components/atoms/Button";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { CheckCircle, XCircle } from "lucide-react";
import { TERMINATION_TYPE_LABELS, type TerminationType } from "~/zod/termination.zod";

interface TerminationReviewModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	termination: any;
	onConfirm: (action: "approve" | "reject", comments: string) => Promise<void>;
	isProcessing: boolean;
}

// Helper to get employee full name
const getEmployeeName = (employee: any): string => {
	if (!employee?.person?.personalInfo) return employee?.employeeId || "Unknown";
	const { firstName, lastName } = employee.person.personalInfo;
	return `${firstName || ""} ${lastName || ""}`.trim() || employee.employeeId;
};

export function TerminationReviewModal({
	open,
	onOpenChange,
	termination,
	onConfirm,
	isProcessing,
}: TerminationReviewModalProps) {
	const [comments, setComments] = useState("");

	// Reset state when modal opens/changes termination
	useEffect(() => {
		if (open) {
			setComments("");
		}
	}, [open, termination]);

	if (!termination) return null;

	const handleAction = async (action: "approve" | "reject") => {
		await onConfirm(action, comments);
	};

	const statusObject: ReviewStatus = {
		type: "info",
		title: "Termination Review",
		description: "Review the termination details and provide your decision.",
	};

	return (
		<ReviewActionModal
			open={open}
			onOpenChange={onOpenChange}
			title="Review Termination"
			className="max-w-xl"
			status={statusObject}
			actions={
				<div className="flex items-center justify-end gap-3 pt-2">
					<Button
						variant="ghost"
						onClick={() => onOpenChange(false)}
						disabled={isProcessing}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={() => handleAction("reject")}
						disabled={isProcessing}
						className="gap-2">
						<XCircle className="h-4 w-4" />
						Reject Request
					</Button>
					<Button
						onClick={() => handleAction("approve")}
						disabled={isProcessing}
						className="gap-2 bg-green-600 hover:bg-green-700 text-white">
						<CheckCircle className="h-4 w-4" />
						Approve Request
					</Button>
				</div>
			}>
			<div className="space-y-6">
				{/* Details Grid */}
				<div className="grid grid-cols-2 gap-6">
					<div className="space-y-1.5">
						<Label className="text-muted-foreground font-normal text-xs uppercase tracking-wide">
							Employee
						</Label>
						<div className="text-sm text-gray-900">
							{getEmployeeName(termination.employee)}
						</div>
					</div>
					<div className="space-y-1.5">
						<Label className="text-muted-foreground font-normal text-xs uppercase tracking-wide">
							Type
						</Label>
						<div className="text-sm text-gray-900">
							{
								TERMINATION_TYPE_LABELS[
									termination.terminationType as TerminationType
								]
							}
						</div>
					</div>
				</div>

				{/* Reason Section */}
				<div className="space-y-1.5">
					<Label className="text-muted-foreground font-normal text-xs uppercase tracking-wide">
						Reason for Termination
					</Label>
					<div className="p-3 bg-gray-50 rounded-md text-sm text-gray-700 leading-relaxed border border-gray-100">
						{termination.reason}
					</div>
				</div>

				{/* Comments Section */}
				<div className="space-y-3">
					<Label htmlFor="comments" className="text-sm font-medium text-gray-700">
						Review Comments{" "}
						<span className="text-muted-foreground font-normal">(Optional)</span>
					</Label>
					<Textarea
						id="comments"
						placeholder="Add any additional notes regarding your decision..."
						value={comments}
						onChange={(e) => setComments(e.target.value)}
						rows={4}
						className="resize-none"
					/>
				</div>
			</div>
		</ReviewActionModal>
	);
}
