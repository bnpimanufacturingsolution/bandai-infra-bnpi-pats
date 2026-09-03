import { useState, useEffect } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "~/components/ui/dialog";
import { Button } from "~/components/atoms/Button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	CheckCircle,
	AlertCircle,
	ExternalLink,
	ShieldCheck,
	CreditCard,
	Building2,
	FileText,
	QrCode,
} from "lucide-react";
import type { ChecklistItem } from "~/zod/checklist-item";

interface DocumentVerificationModalProps {
	isOpen: boolean;
	onClose: () => void;
	task: ChecklistItem;
	onApprove: (task: ChecklistItem, verificationData?: any) => void;
	documentUrl?: string; // URL of the uploaded document to view side-by-side
}

type VerificationType = "national_id" | "philhealth" | "sss" | "pagibig" | "generic";

interface VerificationGuide {
	title: string;
	description: string;
	icon: any;
	portalUrl?: string; // For "Where to Check"
	portalName?: string;
	steps: string[];
	checks: string[]; // Checkbox items
	inputLabel?: string;
	inputPlaceholder?: string;
	validationRegex?: RegExp;
	validationError?: string;
}

const VERIFICATION_GUIDES: Record<VerificationType, VerificationGuide> = {
	national_id: {
		title: "National ID (PhilSys)",
		description: "Verify the authenticity of the PhilSys ID card via QR code.",
		icon: QrCode,
		portalUrl: "https://verify.philsys.gov.ph",
		portalName: "verify.philsys.gov.ph",
		steps: [
			"Go to verify.philsys.gov.ph on your phone or computer.",
			"Click the button: Tap on 'Click to Scan QR Code'.",
			"Show the camera: Hold the back of the ID in front of your camera.",
			"Look for the Green Check: If it says 'Verified' and shows the person's name and photo, it is real! ✅",
		],
		checks: [
			"QR Code is scannable and returns 'Verified'",
			"Photo on ID matches the employee",
			"Details on screen match the physical card",
		],
	},
	philhealth: {
		title: "PhilHealth (MDR)",
		description: "Verify the Member Data Record (MDR) and PhilHealth Number.",
		icon: Building2,
		portalUrl: "https://employer.philhealth.gov.ph", // Assuming employer portal
		portalName: "PhilHealth Employer Portal",
		steps: [
			"Look at the Number: Every person has a unique 12-digit number.",
			"Check the Portal: Log in to the PhilHealth Employer Portal to see if the person is unrelated.",
			"The 'Real' Test: A real MDR should have the PhilHealth logo and correct birthday.",
		],
		checks: [
			"Document has valid PhilHealth Logo",
			"Employee Name and Birthday are correct",
			"12-Digit PhilHealth Number is valid",
		],
		inputLabel: "PhilHealth Number",
		inputPlaceholder: "12-345678901-2",
		validationRegex: /^\d{2}-\d{9}-\d{1}$|^\d{12}$/, // Basic format check
		validationError: "Must be a valid 12-digit PhilHealth number",
	},
	sss: {
		title: "SSS (Social Security)",
		description: "Verify the E-1 Form and SSS Number.",
		icon: ShieldCheck,
		portalUrl: "https://www.sss.gov.ph",
		portalName: "My.SSS Portal",
		steps: [
			"The SSS Number: It is a 10-digit number.",
			"Use the App/Site: Check via My.SSS mobile app or website.",
			"Ask for the 'E-1' Form: Check for the stamp or digital mark from SSS.",
		],
		checks: [
			"E-1 Form has valid SSS Stamp/Digital Mark",
			"10-Digit SSS Number is valid",
			"Employee details match system records",
		],
		inputLabel: "SSS Number",
		inputPlaceholder: "10-digit number",
		validationRegex: /^\d{2}-\d{7}-\d{1}$|^\d{10}$/,
		validationError: "Must be a valid 10-digit SSS number",
	},
	pagibig: {
		title: "Pag-IBIG (Housing Fund)",
		description: "Verify the Member's Data Form (MDF) and MID Number.",
		icon: CreditCard,
		portalUrl: "https://www.pagibigfundservices.com/virtualpagibig/",
		portalName: "Virtual Pag-IBIG",
		steps: [
			"The MID Number: This is a 12-digit number.",
			"Virtual Pag-IBIG: Verify status via the website.",
			"Check the MDF: Ensure name matches their ID.",
		],
		checks: [
			"MDF has valid Pag-IBIG branding",
			"12-Digit MID Number is valid",
			"Name matches employee ID",
		],
		inputLabel: "Pag-IBIG MID Number",
		inputPlaceholder: "12-digit number",
		validationRegex: /^\d{4}-\d{4}-\d{4}$|^\d{12}$/,
		validationError: "Must be a valid 12-digit MID number",
	},
	generic: {
		title: "Document Verification",
		description: "Review and verify the submitted document.",
		icon: FileText,
		steps: [
			"Check if the document is clear and readable.",
			"Verify that the name matches the employee.",
			"Ensure the document is valid and not expired.",
		],
		checks: [
			"Document is clear and readable",
			"Details match employee record",
			"Document is valid/not expired",
		],
	},
};

const getVerificationType = (title: string): VerificationType => {
	const lower = title.toLowerCase();
	if (lower.includes("national id") || lower.includes("philsys")) return "national_id";
	if (lower.includes("philhealth")) return "philhealth";
	if (lower.includes("sss") || lower.includes("security")) return "sss";
	if (lower.includes("pag-ibig") || lower.includes("pagibig")) return "pagibig";
	return "generic";
};

const formatAuditDate = (value?: string | null) => {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
};

export function DocumentVerificationModal({
	isOpen,
	onClose,
	task,
	onApprove,
	documentUrl,
}: DocumentVerificationModalProps) {
	const type = getVerificationType(task.title);
	const guide = VERIFICATION_GUIDES[type];
	const reviewMetadata =
		task.metadata && typeof task.metadata === "object" && !Array.isArray(task.metadata)
			? (task.metadata as Record<string, any>)
			: {};
	const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});
	const [inputValue, setInputValue] = useState("");
	const [error, setError] = useState<string | null>(null);
	const isAlreadyApproved =
		String(reviewMetadata.reviewStatus || "").trim().toUpperCase() === "APPROVED" ||
		task.status === "COMPLETED";

	// Reset state when task changes
	useEffect(() => {
		if (isOpen) {
			setCheckedSteps({});
			setInputValue("");
			setError(null);
		}
	}, [isOpen, task.id]);

	const allChecksPassed = guide.checks.every((check) => checkedSteps[check]);
	const hasDocumentToReview = Boolean(documentUrl || reviewMetadata.documentFileUrl);
	const hasValidOptionalInput = !inputValue || !error;
	const canApprove = !isAlreadyApproved && hasValidOptionalInput;

	const handleCheck = (check: string, checked: boolean) => {
		setCheckedSteps((prev) => ({ ...prev, [check]: checked }));
	};

	const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
		const val = e.target.value;
		setInputValue(val);
		if (guide.validationRegex && !guide.validationRegex.test(val)) {
			setError(guide.validationError || "Invalid format");
		} else {
			setError(null);
		}
	};

	const handleApprove = () => {
		if (canApprove && hasDocumentToReview) {
			onApprove(task, { verifiedNumber: inputValue });
			onClose();
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<div className="flex items-center gap-3 mb-2">
						<div className="p-2 bg-blue-50 rounded-lg">
							<guide.icon className="w-6 h-6 text-blue-600" />
						</div>
						<div>
							<DialogTitle>{guide.title} Verification</DialogTitle>
							<DialogDescription>{guide.description}</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				<div className="space-y-6 py-4">
					{/* Document Preview Link */}
					{documentUrl && (
						<div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
							<div className="flex items-center gap-2">
								<FileText className="w-4 h-4 text-gray-500" />
								<span className="text-sm font-medium text-gray-700">
									Submitted Document
								</span>
							</div>
							<Button
								variant="outline"
								size="sm"
								onClick={() => window.open(documentUrl, "_blank")}
								className="h-8">
								<ExternalLink className="w-3 h-3 mr-2" />
								View Document
							</Button>
						</div>
					)}
					{(reviewMetadata.reviewSubmittedAt ||
						reviewMetadata.reviewApprovedAt ||
						reviewMetadata.reviewRejectedAt) && (
						<div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
							<div className="flex flex-wrap gap-x-3 gap-y-1">
								{reviewMetadata.reviewSubmittedAt ? (
									<span>
										Submitted {formatAuditDate(reviewMetadata.reviewSubmittedAt)}
										{reviewMetadata.reviewSubmittedByLabel
											? ` by ${reviewMetadata.reviewSubmittedByLabel}`
											: ""}
									</span>
								) : null}
								{reviewMetadata.reviewApprovedAt ? (
									<span>
										Approved {formatAuditDate(reviewMetadata.reviewApprovedAt)}
										{reviewMetadata.reviewApprovedByLabel
											? ` by ${reviewMetadata.reviewApprovedByLabel}`
											: ""}
									</span>
								) : null}
								{reviewMetadata.reviewRejectedAt ? (
									<span>
										Returned {formatAuditDate(reviewMetadata.reviewRejectedAt)}
										{reviewMetadata.reviewRejectedByLabel
											? ` by ${reviewMetadata.reviewRejectedByLabel}`
											: ""}
									</span>
								) : null}
							</div>
							{reviewMetadata.reviewRejectionReason ? (
								<div className="mt-1 text-red-600">
									Reason: {reviewMetadata.reviewRejectionReason}
								</div>
							) : null}
						</div>
					)}

					{/* Step 1: External Verification Portal */}
					{guide.portalUrl && (
						<div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
							<h4 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
								<ShieldCheck className="w-4 h-4" />
								Step 1: Verify Online
							</h4>
							<p className="text-sm text-blue-700 mb-3">
								Go to the official portal to verify this document.
							</p>
							<Button
								variant="secondary"
								size="sm"
								className="bg-white text-blue-700 border border-blue-200 hover:bg-blue-50"
								onClick={() => window.open(guide.portalUrl, "_blank")}>
								Open {guide.portalName}
								<ExternalLink className="w-3 h-3 ml-2" />
							</Button>
						</div>
					)}

					{/* Step 2: Visual & Data Checks */}
					<div>
						<h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
							<CheckCircle className="w-4 h-4 text-gray-500" />
							{guide.portalUrl ? "Step 2: " : "Step 1: "} Validation Checks
						</h4>
						<p className="mb-3 text-xs text-gray-500">
							Use this as an HR review guide. These checks help document your review,
							but they no longer block approval.
						</p>
						<div className="space-y-3">
							{guide.checks.map((check) => (
								<div
									key={check}
									className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
									onClick={() => handleCheck(check, !checkedSteps[check])}>
									<Checkbox
										checked={!!checkedSteps[check]}
										onCheckedChange={(checked) =>
											handleCheck(check, checked as boolean)
										}
										className="mt-0.5"
									/>
									<div className="flex-1">
										<Label className="text-sm font-medium text-gray-700 cursor-pointer">
											{check}
										</Label>
										{/* Find matching step explanation if any */}
										{guide.steps.some((s) => s.includes(check)) && (
											<p className="text-xs text-gray-500 mt-1">
												{
													guide.steps
														.find((s) => s.includes(check))
														?.split(":")[1]
												}
											</p>
										)}
									</div>
								</div>
							))}
						</div>
					</div>

					{/* Step 3: Input Data (If required) */}
					{guide.inputLabel && (
						<div>
							<h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
								<CheckCircle className="w-4 h-4 text-gray-500" />
								{guide.portalUrl ? "Step 3: " : "Step 2: "} Record Data
							</h4>
							<div className="space-y-2">
								<Label htmlFor="verification-input">{guide.inputLabel}</Label>
								<p className="text-xs text-gray-500">
									Optional: record the verified number here if you checked it during
									review.
								</p>
								<Input
									id="verification-input"
									placeholder={guide.inputPlaceholder}
									value={inputValue}
									onChange={handleInput}
									className={
										error ? "border-red-500 focus-visible:ring-red-500" : ""
									}
								/>
								{error && (
									<p className="text-xs text-red-600 flex items-center gap-1">
										<AlertCircle className="w-3 h-3" />
										{error}
									</p>
								)}
							</div>
						</div>
					)}
				</div>

				<DialogFooter className="gap-2 sm:gap-0">
					{isAlreadyApproved ? (
						<div className="mr-auto text-xs text-emerald-700">
							This document was already approved. You can still review the submitted file and audit trail here.
						</div>
					) : !hasDocumentToReview ? (
						<div className="mr-auto text-xs text-amber-700">
							No submitted document preview is attached to this task yet. You can still
							close this and ask the employee to resubmit from self service.
						</div>
					) : !canApprove ? (
						<div className="mr-auto text-xs text-amber-700">
							The verification number format is invalid. Clear it or correct it to
							continue approving this document.
						</div>
					) : null}
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button
						onClick={handleApprove}
						disabled={!canApprove || !hasDocumentToReview}
						className="bg-green-600 hover:bg-green-700 text-white">
						<ShieldCheck className="w-4 h-4 mr-2" />
						{isAlreadyApproved ? "Already Approved" : "Mark as Verified & Approved"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
