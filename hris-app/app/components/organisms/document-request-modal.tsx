import { useState, useEffect } from "react";
import { Button } from "~/components/ui/button"; // Use UI button
import { Select, type SelectOption } from "~/components/atoms/Select";
import { CircleAlert, FileText } from "lucide-react";
import { useAuth } from "~/lib/hooks/use-auth";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Textarea } from "~/components/ui/textarea";

interface DocumentRequestModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (requestData: DocumentRequestData) => void;
	isPending?: boolean;
}

export interface DocumentRequestData {
	documentType: string;
	description: string; // Used for "Purpose"
	notes?: string;
	year?: number; // For BIR Form 2316
}

export function DocumentRequestModal({
	isOpen,
	onClose,
	onSubmit,
	isPending = false,
}: DocumentRequestModalProps) {
	const { user } = useAuth();
	const reportTo = user?.metadata?.employee?.reportTo;
	const hasAssignedApprover = Boolean(reportTo?.id);
	const managerName = `${reportTo?.firstName || ""} ${reportTo?.lastName || ""}`.trim();

	const [selectedDocumentType, setSelectedDocumentType] = useState("CERTIFICATE_OF_EMPLOYMENT");
	const [description, setDescription] = useState("");
	const [notes, setNotes] = useState("");
	const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
	const [errors, setErrors] = useState<Record<string, string>>({});

	// Hardcoded document types for now as requested
	const documentTypes: SelectOption[] = [
		{ value: "CERTIFICATE_OF_EMPLOYMENT", label: "Certificate of Employment" },
		{ value: "BIR_FORM_2316", label: "BIR Form 2316" },
	];

	// Generate years for BIR Form 2316
	const currentYear = new Date().getFullYear();
	const years: SelectOption[] = Array.from({ length: 6 }, (_, i) => {
		const year = currentYear - i;
		return { value: year.toString(), label: year.toString() };
	});

	// Reset form when modal closes
	useEffect(() => {
		if (!isOpen) {
			resetForm();
		}
	}, [isOpen]);

	const resetForm = () => {
		setSelectedDocumentType("CERTIFICATE_OF_EMPLOYMENT");
		setDescription("");
		setNotes("");
		setErrors({});
	};

	const validateForm = () => {
		const newErrors: Record<string, string> = {};

		if (!selectedDocumentType) {
			newErrors.documentType = "Document type is required";
		}

		if (!description.trim()) {
			newErrors.description = "Purpose is required";
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		if (!hasAssignedApprover) {
			return;
		}

		if (!validateForm()) {
			return;
		}

		const requestData: DocumentRequestData = {
			documentType: selectedDocumentType,
			description,
			year: selectedDocumentType === "BIR_FORM_2316" ? parseInt(selectedYear) : undefined,
			notes: notes || undefined,
		};

		onSubmit(requestData);
	};

	const FieldLabel = ({
		children,
		required,
	}: {
		children: React.ReactNode;
		required?: boolean;
	}) => (
		<label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-2 block text-gray-900">
			{children} {required && <span className="text-red-500 ml-0.5">*</span>}
		</label>
	);

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Request Document</DialogTitle>
					<DialogDescription>
						Submit a request for an employment document
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-4">
					{/* Document Type Select */}
					<div>
						<label className="block text-sm font-medium text-foreground mb-1">
							Document Type *
						</label>
						<Select
							options={documentTypes}
							value={selectedDocumentType}
							onChange={(value) => setSelectedDocumentType(value)}
							placeholder="Select document type"
							className={errors.documentType ? "border-red-500" : ""}
						/>
						{errors.documentType && (
							<p className="text-sm text-red-600 mt-1">{errors.documentType}</p>
						)}
					</div>

					{/* Year Select - Only for BIR Form 2316 */}
					{selectedDocumentType === "BIR_FORM_2316" && (
						<div>
							<label className="block text-sm font-medium text-foreground mb-1">
								Tax Year *
							</label>
							<Select
								options={years}
								value={selectedYear}
								onChange={(value) => setSelectedYear(value)}
								placeholder="Select year"
							/>
						</div>
					)}

					{/* Description / Purpose */}
					<div>
						<FieldLabel required>Purpose</FieldLabel>
						<Textarea
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="State the purpose of this request (e.g. for loan application, visa application)..."
							className={`w-full px-3 py-2 border ${
								errors.description
									? "border-red-300 focus:border-red-500"
									: "border-gray-300" // Fixed border color
							} rounded-md bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 min-h-[100px]`}
						/>
						{errors.description && (
							<p className="mt-1 text-sm text-red-600">{errors.description}</p>
						)}
					</div>

					{/* Additional Notes */}
					<div>
						<FieldLabel>Additional Notes (optional)</FieldLabel>
						<Textarea
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							placeholder="Any additional information (e.g. specific details to include)..."
							className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 min-h-[80px]"
						/>
					</div>

					{/* Info Banner */}
					<div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 flex items-center gap-2">
						<CircleAlert className="w-4 h-4" />
						<span>
							{hasAssignedApprover ? (
								<>
									Your request will be reviewed by your manager,{" "}
									<strong>{managerName || "your assigned manager"}</strong>
									. You will be notified once it&#39;s approved.
								</>
							) : (
								<>
									You do not have a reporting manager assigned yet. Request
									submission is disabled until HR assigns your reporting manager.
								</>
							)}
						</span>
					</div>

					{/* Actions */}
					<div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
							disabled={isPending}>
							Cancel
						</Button>
						<Button
							type="submit"
							className="bg-primary hover:bg-primary/90 text-white"
							disabled={isPending || !hasAssignedApprover}>
							{isPending ? "Submitting..." : "Submit Request"}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
