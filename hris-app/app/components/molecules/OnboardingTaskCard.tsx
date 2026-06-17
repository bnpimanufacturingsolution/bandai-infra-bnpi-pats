import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "~/components/atoms/Button";
import {
	CheckCircle,
	Clock,
	ChevronDown,
	ChevronUp,
	FileText,
	Ban,
	MinusCircle,
	AlertCircle,
	ExternalLink,
	ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Textarea } from "~/components/ui/textarea";
import { FileUpload } from "~/components/atoms/form/FileUpload";
import { StatusBadge } from "~/components/atoms/StatusBadge";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { ChecklistCategory, ChecklistItem } from "~/zod/checklist-item";

// Category display names
export const categoryLabels: Record<ChecklistCategory, string> = {
	HR_DOCUMENTATION: "HR Documentation",
	IT_SETUP: "IT Setup",
	WORKSPACE_SETUP: "Workspace Setup",
	TRAINING: "Training",
	COMPLIANCE: "Compliance",
	ACCESS_MANAGEMENT: "Access Management",
	EQUIPMENT: "Equipment",
	BENEFITS: "Benefits",
	KNOWLEDGE_TRANSFER: "Knowledge Transfer",
	EXIT_INTERVIEW: "Exit Interview",
	ORIENTATION: "Orientation",
	SECURITY: "Security",
	PAYROLL: "Payroll",
	OTHER: "Other",
};

// Helper function to format dates
export const formatTaskDate = (date: Date | string | undefined) => {
	if (!date) return "";
	return new Date(date).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
};
const formatAuditDate = (date: Date | string | undefined | null) => {
	if (!date) return "";
	const parsed = new Date(date);
	if (Number.isNaN(parsed.getTime())) return "";
	return parsed.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
};

const formatMetadataValue = (value: unknown): string | null => {
	if (value === null || value === undefined) return null;
	if (typeof value === "boolean") return value ? "Yes" : "No";
	if (typeof value === "number") return String(value);
	if (typeof value === "string") return value.trim() || null;
	if (Array.isArray(value)) {
		const normalized: string = value
			.map((item) => formatMetadataValue(item))
			.filter((item): item is string => Boolean(item))
			.join(", ");
		return normalized || null;
	}
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
};

const humanizeFieldLabel = (value: string) =>
	value
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[_-]+/g, " ")
		.trim()
		.replace(/\b\w/g, (char) => char.toUpperCase());

const getTaskReviewStatus = (task: ChecklistItem) =>
	String((task.metadata as any)?.reviewStatus || "")
		.trim()
		.toUpperCase();

const canExpandTask = (task: ChecklistItem, readonly: boolean) => {
	if (!readonly || task.category !== "COMPLIANCE") return true;

	const reviewStatus = getTaskReviewStatus(task);
	return (
		task.status === "COMPLETED" ||
		reviewStatus === "FOR_REVIEW" ||
		reviewStatus === "REJECTED"
	);
};

type InlineReviewConfig = {
	title: string;
	description: string;
	portalUrl?: string;
	portalName?: string;
	checks: string[];
	inputLabel?: string;
	inputPlaceholder?: string;
	validationRegex?: RegExp;
	validationError?: string;
};

const getInlineReviewConfig = (task: ChecklistItem): InlineReviewConfig => {
	const title = String(task.title || "");
	const lower = title.toLowerCase();

	if (lower.includes("national id") || lower.includes("philsys")) {
		return {
			title: "National ID (PhilSys)",
			description: "Verify the authenticity of the PhilSys ID card via QR code.",
			portalUrl: "https://verify.philsys.gov.ph",
			portalName: "verify.philsys.gov.ph",
			checks: [
				"QR code is scannable and returns verified",
				"Photo on ID matches the employee",
				"Details match the submitted record",
			],
		};
	}

	if (lower.includes("philhealth")) {
		return {
			title: "PhilHealth (MDR)",
			description: "Verify the Member Data Record and PhilHealth Number.",
			portalUrl: "https://employer.philhealth.gov.ph",
			portalName: "PhilHealth Employer Portal",
			checks: [
				"Document has valid PhilHealth branding",
				"Employee name and birthday are correct",
				"PhilHealth number is valid",
			],
			inputLabel: "PhilHealth Number",
			inputPlaceholder: "12-345678901-2",
			validationRegex: /^\d{2}-\d{9}-\d{1}$|^\d{12}$/,
			validationError: "Must be a valid 12-digit PhilHealth number",
		};
	}

	if (lower.includes("sss") || lower.includes("security")) {
		return {
			title: "SSS (Social Security)",
			description: "Verify the E-1 Form and SSS Number.",
			portalUrl: "https://www.sss.gov.ph",
			portalName: "My.SSS Portal",
			checks: [
				"E-1 Form has valid SSS stamp/digital mark",
				"10-digit SSS number is valid",
				"Employee details match system records",
			],
			inputLabel: "SSS Number",
			inputPlaceholder: "10-digit number",
			validationRegex: /^\d{2}-\d{7}-\d{1}$|^\d{10}$/,
			validationError: "Must be a valid 10-digit SSS number",
		};
	}

	if (lower.includes("pag-ibig") || lower.includes("pagibig")) {
		return {
			title: "Pag-IBIG (Housing Fund)",
			description: "Verify the Member's Data Form and MID Number.",
			portalUrl: "https://www.pagibigfundservices.com/virtualpagibig/",
			portalName: "Virtual Pag-IBIG",
			checks: [
				"MDF has valid Pag-IBIG branding",
				"12-digit MID number is valid",
				"Name matches employee ID",
			],
			inputLabel: "Pag-IBIG MID Number",
			inputPlaceholder: "12-digit number",
			validationRegex: /^\d{4}-\d{4}-\d{4}$|^\d{12}$/,
			validationError: "Must be a valid 12-digit MID number",
		};
	}

	return {
		title: "Document Verification",
		description: "Review and verify the submitted document.",
		checks: [
			"Document is clear and readable",
			"Details match employee record",
			"Document is valid and not expired",
		],
	};
};

export interface OnboardingTaskCardProps {
	/** Title of the card (e.g., "Onboarding Tasks" or "Exit Clearance Tasks") */
	title?: string;
	/** Tasks grouped by category */
	tasksByCategory: Record<string, ChecklistItem[]>;
	/** Whether this is an offboarding context (affects theming) */
	isOffboarding?: boolean;
	/** Callback when task is marked as complete */
	onCompleteTask?: (task: ChecklistItem, comment: string, file: File | null) => void;
	/** Whether the update mutation is pending */
	isUpdating?: boolean;
	/** Whether the card is in read-only mode (e.g., for HR review) */
	readonly?: boolean;
	/** Callback when task is approved by HR */
	onApprove?: (task: ChecklistItem, verificationData?: any) => void;
	/** Employee ID for profile linking */
	employeeId?: string;
	/** Current employee documents for resolving checklist details */
	employeeDocuments?: Array<Record<string, any>>;
	/** Task to auto-expand when the card first loads */
	defaultExpandedTaskId?: string | null;
}

const getEmployeeComplianceActionLabel = (params: {
	isRejectedReview: boolean;
	linkedDocument: Record<string, any> | null;
}) => {
	if (params.isRejectedReview) return "Correct & Resubmit";
	if (params.linkedDocument) return "Update & Resubmit";
	return "Upload for Approval";
};

// Helper function to map task title to document type
const getDocTypeFromTask = (task: ChecklistItem): string | null => {
	const metadata =
		task.metadata && typeof task.metadata === "object" && !Array.isArray(task.metadata)
			? (task.metadata as Record<string, unknown>)
			: null;
	const metadataCode = String(
		metadata?.documentCode || metadata?.documentTypeCode || metadata?.documentType || "",
	).trim();
	if (metadataCode) return metadataCode;

	const title = String(task.title || "");
	const lowerTitle = title.toLowerCase();
	if (lowerTitle.includes("tin")) return "tin_id";
	if (lowerTitle.includes("sss")) return "sss_id";
	if (lowerTitle.includes("philhealth")) return "philhealth_id";
	if (lowerTitle.includes("pag-ibig") || lowerTitle.includes("pagibig")) return "pagibig_id";
	if (lowerTitle.includes("passport")) return "passport";
	if (lowerTitle.includes("driver")) return "driver_license";
	if (lowerTitle.includes("birth")) return "birth_certificate";
	if (lowerTitle.includes("marriage")) return "marriage_certificate";
	if (lowerTitle.includes("medical")) return "medical_certificate";
	if (lowerTitle.includes("nbi")) return "nbi_clearance";
	if (lowerTitle.includes("police")) return "police_clearance";
	if (lowerTitle.includes("barangay")) return "barangay_clearance";
	if (lowerTitle.includes("diploma")) return "diploma";
	if (lowerTitle.includes("transcript")) return "transcript";
	if (lowerTitle.includes("contract")) return "contract";
	if (lowerTitle.includes("certificate")) return "certificate";
	return null;
};

export function OnboardingTaskCard({
	title,
	tasksByCategory,
	isOffboarding = false,
	onCompleteTask,
	isUpdating = false,
	readonly = false,
	onApprove,
	employeeId,
	employeeDocuments = [],
	defaultExpandedTaskId = null,
}: OnboardingTaskCardProps) {
	const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
	const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
	const [taskComment, setTaskComment] = useState("");
	const [taskFile, setTaskFile] = useState<File | null>(null);
	const [reviewChecks, setReviewChecks] = useState<Record<string, Record<string, boolean>>>({});
	const [reviewInputs, setReviewInputs] = useState<Record<string, string>>({});
	const [reviewErrors, setReviewErrors] = useState<Record<string, string | null>>({});

	const navigate = useNavigate();

	const hasAppliedDefaultExpansion = useRef(false);

	useEffect(() => {
		hasAppliedDefaultExpansion.current = false;
	}, [defaultExpandedTaskId, readonly]);

	useEffect(() => {
		if (hasAppliedDefaultExpansion.current || !defaultExpandedTaskId) return;

		const matchingCategory = Object.entries(tasksByCategory).find(([, tasks]) =>
			tasks.some(
				(task) => task.id === defaultExpandedTaskId && canExpandTask(task, readonly),
			),
		)?.[0];

		if (!matchingCategory) return;

		hasAppliedDefaultExpansion.current = true;
		setExpandedTaskId(defaultExpandedTaskId);
		setExpandedCategories((prev) => {
			const next = new Set(prev);
			next.add(matchingCategory);
			return next;
		});
	}, [defaultExpandedTaskId, readonly, tasksByCategory]);

	const toggleCategory = (category: string) => {
		const newExpanded = new Set(expandedCategories);
		if (newExpanded.has(category)) {
			newExpanded.delete(category);
		} else {
			newExpanded.add(category);
		}
		setExpandedCategories(newExpanded);
	};

	const handleCompleteTask = (task: ChecklistItem) => {
		if (onCompleteTask) {
			onCompleteTask(task, taskComment, taskFile);
		}
		// Reset state after completion
		setExpandedTaskId(null);
		setTaskComment("");
		setTaskFile(null);
	};

	const toggleReviewCheck = (taskId: string, check: string, checked: boolean) => {
		setReviewChecks((prev) => ({
			...prev,
			[taskId]: {
				...(prev[taskId] || {}),
				[check]: checked,
			},
		}));
	};

	const updateReviewInput = (taskId: string, value: string, config: InlineReviewConfig) => {
		setReviewInputs((prev) => ({
			...prev,
			[taskId]: value,
		}));

		if (config.validationRegex && value && !config.validationRegex.test(value)) {
			setReviewErrors((prev) => ({
				...prev,
				[taskId]: config.validationError || "Invalid format",
			}));
			return;
		}

		setReviewErrors((prev) => ({
			...prev,
			[taskId]: null,
		}));
	};

	return (
		<Card className="border-0 shadow-none">
			{title && (
				<CardHeader>
					<CardTitle className="text-base">{title}</CardTitle>
				</CardHeader>
			)}
			<CardContent className="p-0">
				<div className="space-y-4">
					{Object.entries(tasksByCategory).map(([category, tasks]) => {
						const categoryCompleted = tasks.filter(
							(t) => t.status === "COMPLETED",
						).length;
						const isExpanded = expandedCategories.has(category);

						return (
							<div
								key={category}
								className="border border-gray-200 rounded-lg overflow-hidden">
								{/* Category Header */}
								<button
									onClick={() => toggleCategory(category)}
									className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors">
									<div className="flex items-center gap-2">
										<span className="text-sm font-medium text-gray-700">
											{categoryLabels[category as ChecklistCategory] ||
												category}
										</span>
										<span className="text-xs text-gray-500">
											({categoryCompleted}/{tasks.length})
										</span>
									</div>
									{isExpanded ? (
										<ChevronUp className="w-4 h-4 text-gray-500" />
									) : (
										<ChevronDown className="w-4 h-4 text-gray-500" />
									)}
								</button>

								{/* Task List */}
								{isExpanded && (
									<div className="space-y-3 p-3">
										{tasks.map((task, index) => (
											(() => {
												const reviewStatus = getTaskReviewStatus(task);
												const isPendingApproval = reviewStatus === "FOR_REVIEW";
												const isRejectedReview = reviewStatus === "REJECTED";
												const isTaskCompleted = task.status === "COMPLETED";
												const isTaskExpandable = canExpandTask(task, readonly);
												const taskMetadata = (task.metadata as any) || {};
												const linkedDocument =
													employeeDocuments.find((document) => {
														const metadataDocumentId = String(
															taskMetadata.documentId || "",
														).trim();
														if (
															metadataDocumentId &&
															String(document.id || "").trim() === metadataDocumentId
														) {
															return true;
														}

														const metadataDocumentNumber = String(
															taskMetadata.documentNumber || "",
														).trim();
														if (
															metadataDocumentNumber &&
															String(document.number || "").trim() ===
																metadataDocumentNumber
														) {
															return true;
														}

														const metadataDocumentTypeId = String(
															taskMetadata.documentTypeId || "",
														).trim();
														if (
															metadataDocumentTypeId &&
															String(document.documentTypeId || "").trim() ===
																metadataDocumentTypeId
														) {
															return true;
														}

														const metadataDocumentCode = String(
															taskMetadata.documentCode ||
																taskMetadata.documentType ||
																"",
														)
															.trim()
															.toLowerCase();
														return (
															metadataDocumentCode &&
															String(document.type || "")
																.trim()
																.toLowerCase() === metadataDocumentCode
														);
													}) || null;
												const documentFieldValues =
													taskMetadata.documentFieldValues &&
													typeof taskMetadata.documentFieldValues === "object" &&
													!Array.isArray(taskMetadata.documentFieldValues)
														? (taskMetadata.documentFieldValues as Record<string, unknown>)
														: linkedDocument?.fieldValues &&
															  typeof linkedDocument.fieldValues === "object" &&
															  !Array.isArray(linkedDocument.fieldValues)
															? (linkedDocument.fieldValues as Record<string, unknown>)
														: {};
												const submittedDetailRows = [
													{
														label: "Document",
														value:
															formatMetadataValue(taskMetadata.documentDisplayName) ||
															formatMetadataValue(linkedDocument?.name) ||
															formatMetadataValue(taskMetadata.documentName) ||
															formatMetadataValue(task.title),
													},
													{
														label: "Number",
														value:
															formatMetadataValue(taskMetadata.documentNumber) ||
															formatMetadataValue(linkedDocument?.number),
													},
													{
														label: "Issue Date",
														value:
															formatAuditDate(taskMetadata.documentIssueDate) ||
															formatAuditDate(linkedDocument?.issueDate) ||
															formatMetadataValue(taskMetadata.documentIssueDate),
													},
													{
														label: "Expiry Date",
														value:
															formatAuditDate(taskMetadata.documentExpiryDate) ||
															formatAuditDate(linkedDocument?.expiryDate) ||
															formatMetadataValue(taskMetadata.documentExpiryDate),
													},
													...Object.entries(documentFieldValues).map(([key, value]) => ({
														label: humanizeFieldLabel(key),
														value: formatMetadataValue(value),
													})),
												].filter((item) => item.value);
												const reviewConfig = getInlineReviewConfig(task);
												const reviewInputValue = reviewInputs[task.id] || "";
												const reviewInputError = reviewErrors[task.id] || null;
												const documentUrl =
													taskMetadata.documentFileUrl ||
													linkedDocument?.fileUrl ||
													taskMetadata.files?.[0]?.url ||
													"";
												const hasDocumentToReview = Boolean(documentUrl);
												const hasReviewableSubmission =
													hasDocumentToReview || submittedDetailRows.length > 0;
												const isAlreadyApproved = isTaskCompleted;

												return (
											<div
												key={task.id}
												className="border border-gray-200 rounded-lg hover:shadow-md transition-shadow bg-white">
												{/* Task Header - Always Visible */}
												<div className="flex items-start gap-4 p-4">
													{/* Task Number */}
													<div className="flex-shrink-0">
														<div
															className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${isOffboarding ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}>
															{index + 1}
														</div>
													</div>
													{/* Task Info */}
													<div className="flex-1 min-w-0">
														<div className="flex items-start justify-between gap-2 mb-2">
															<div className="flex gap-3 items-center">
																<h4 className="text-sm font-semibold text-gray-900">
																	{task.title}
																</h4>
																{isPendingApproval ? (
																	<span className="px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-700 border border-sky-200">
																		Waiting for HR Approval
																	</span>
																) : isRejectedReview ? (
																	<span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
																		Needs Correction
																	</span>
																) : (
																	<StatusBadge
																		status={task.status}
																	/>
																)}
															</div>
															<div className="flex gap-3 items-center">
																{isTaskExpandable ? (
																	<button
																		onClick={() => {
																			if (
																				expandedTaskId ===
																				task.id
																			) {
																				setExpandedTaskId(null);
																			} else {
																				setExpandedTaskId(
																					task.id,
																				);
																				setTaskComment(
																					task.comments || "",
																				);
																				setTaskFile(null);
																			}
																		}}
																		className="focus:outline-none text-gray-500 hover:text-gray-700"
																		aria-label={
																			expandedTaskId === task.id
																				? "Collapse task details"
																				: "Expand task details"
																		}>
																		{expandedTaskId === task.id ? (
																			<ChevronUp className="w-5 h-5" />
																		) : (
																			<ChevronDown className="w-5 h-5" />
																		)}
																	</button>
																) : null}
																<div
																	className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
																		task.status === "COMPLETED"
																			? isOffboarding
																				? "bg-red-100"
																				: "bg-orange-100"
																			: task.status ===
																				  "BLOCKED"
																				? "bg-red-100"
																				: task.status ===
																					  "SKIPPED"
																					? "bg-gray-100"
																					: (
																								task.metadata as any
																						  )
																								?.reviewStatus ===
																								"FOR_REVIEW" ||
																						  task.status ===
																								"FOR_REVIEW"
																						? "bg-purple-100"
																						: task.status ===
																							  "IN_PROGRESS"
																							? "bg-blue-100"
																							: "bg-gray-100"
																	}`}>
																	{isTaskCompleted ? (
																		<CheckCircle
																			className={`w-5 h-5 ${isOffboarding ? "text-red-600" : "text-orange-600"}`}
																		/>
																	) : task.status ===
																	  "BLOCKED" ? (
																		<Ban className="w-5 h-5 text-red-600" />
																	) : task.status ===
																	  "SKIPPED" ? (
																		<MinusCircle className="w-5 h-5 text-gray-500" />
																	) : isPendingApproval ? (
																		<Clock className="w-5 h-5 text-sky-600" />
																	) : isRejectedReview ? (
																		<Ban className="w-5 h-5 text-red-600" />
																	) : task.status ===
																	  "IN_PROGRESS" ? (
																		<Clock className="w-5 h-5 text-blue-600" />
																	) : (
																		<div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
																	)}
																</div>
															</div>
														</div>
														{/* Meta info line (due date, category) */}
														<div className="flex items-center gap-2 text-xs text-gray-600">
															<span>
																Due: {formatTaskDate(task.dueDate)}
															</span>
															<span>•</span>
															<span>
																{categoryLabels[
																	task.category as ChecklistCategory
																] ||
																	task.category.replace(
																		/_/g,
																		" ",
																	)}
															</span>
														</div>
													</div>
												</div>

												{/* Expanded Content */}
												{isTaskExpandable && expandedTaskId === task.id && (
													<div className="px-4 pb-4 space-y-4 border-t border-gray-100">
														{!readonly && task.category === "COMPLIANCE" ? (
															<div className="mt-4 rounded-sm border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
																Submit your document here, then wait for HR to review and approve it before this task is marked complete.
															</div>
														) : null}
														{isPendingApproval ? (
															<div className="mt-4 rounded-sm border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
																This document was submitted successfully and is now waiting for HR approval.
															</div>
														) : null}
														{isRejectedReview ? (
															<div className="mt-4 rounded-sm border border-red-200 bg-red-50 p-3 text-sm text-red-800">
																This document was reviewed and needs correction before it can be approved.
															</div>
														) : null}
														{(taskMetadata.reviewSubmittedAt ||
															taskMetadata.reviewApprovedAt ||
															taskMetadata.reviewRejectedAt) && (
															<div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
																<div className="flex flex-wrap gap-x-3 gap-y-1">
																	{taskMetadata.reviewSubmittedAt ? (
																		<span>
																			Submitted {formatAuditDate(taskMetadata.reviewSubmittedAt)}
																			{taskMetadata.reviewSubmittedByLabel
																				? ` by ${taskMetadata.reviewSubmittedByLabel}`
																				: ""}
																		</span>
																	) : null}
																	{taskMetadata.reviewApprovedAt ? (
																		<span>
																			Approved {formatAuditDate(taskMetadata.reviewApprovedAt)}
																			{taskMetadata.reviewApprovedByLabel
																				? ` by ${taskMetadata.reviewApprovedByLabel}`
																				: ""}
																		</span>
																	) : null}
																	{taskMetadata.reviewRejectedAt ? (
																		<span>
																			Returned {formatAuditDate(taskMetadata.reviewRejectedAt)}
																			{taskMetadata.reviewRejectedByLabel
																				? ` by ${taskMetadata.reviewRejectedByLabel}`
																				: ""}
																		</span>
																	) : null}
																</div>
																{taskMetadata.reviewRejectionReason ? (
																	<div className="mt-1 text-red-600">
																		Reason: {taskMetadata.reviewRejectionReason}
																	</div>
																) : null}
															</div>
														)}
														{submittedDetailRows.length > 0 && (
															<div className="rounded-sm border border-gray-200 bg-white p-3">
																<div className="mb-2 text-sm font-semibold text-gray-900">
																	Submitted details
																</div>
																<div className="grid gap-2 sm:grid-cols-2">
																	{submittedDetailRows.map((item) => (
																		<div
																			key={`${task.id}-${item.label}`}
																			className="rounded border border-gray-100 bg-gray-50 px-3 py-2">
																			<div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
																				{item.label}
																			</div>
																			<div className="mt-1 text-sm text-gray-800 break-words">
																				{item.value}
																			</div>
																		</div>
																	))}
																</div>
																{taskMetadata.documentFileUrl || linkedDocument?.fileUrl ? (
																	<div className="mt-3">
																		<a
																			href={taskMetadata.documentFileUrl || linkedDocument?.fileUrl}
																			target="_blank"
																			rel="noreferrer"
																			className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline">
																			<FileText className="w-4 h-4" />
																			View submitted file
																		</a>
																	</div>
																) : null}
															</div>
														)}
														{/* Description */}
														{task.description && (
															<div className="mt-4 text-sm text-gray-700 border border-gray-200 rounded-sm p-3 bg-gray-50">
																{task.description}
															</div>
														)}

														{/* Comments */}
														<div className="space-y-2 mt-4">
															<label className="text-sm font-medium text-gray-700">
																Comments
															</label>
															<Textarea
																value={taskComment}
																onChange={(e) =>
																	setTaskComment(e.target.value)
																}
																placeholder={
																	isTaskCompleted
																		? "Task already approved."
																		: isPendingApproval
																			? "Waiting for HR approval."
																		: readonly
																			? "No comments provided."
																			: "Add your comments here..."
																}
																className="w-full text-sm"
																disabled={
																	isTaskCompleted ||
																	readonly ||
																	isPendingApproval
																}
															/>
														</div>

														{/* Attachments */}
														<div className="space-y-2">
															{!readonly &&
																task.status !== "COMPLETED" &&
																task.category !== "COMPLIANCE" && (
																	<>
																		<label className="text-sm font-medium text-gray-700">
																			Attachments
																		</label>
																		<FileUpload
																			name={`file-${task.id}`}
																			value={taskFile}
																			onChange={setTaskFile}
																			maxSize={5}
																			disabled={false}
																		/>
																	</>
																)}
															{/* Show existing files */}
															{(task.metadata as any)?.files &&
																(task.metadata as any).files
																	.length > 0 && (
																	<div className="mt-2">
																		<label className="text-sm font-medium text-gray-700">
																			Attached Files :
																		</label>
																		<div className="flex flex-wrap gap-2">
																			{(
																				task.metadata as any
																			).files.map(
																				(
																					file: any,
																					i: number,
																				) => (
																					<a
																						key={i}
																						href={
																							file.url
																						}
																						target="_blank"
																						rel="noreferrer"
																						className="text-xs text-blue-600 hover:underline flex items-center gap-1">
																						<FileText className="w-3 h-3" />{" "}
																						{file.name ||
																							"File"}
																					</a>
																				),
																			)}
																		</div>
																	</div>
																)}
														</div>

														{/* Mark as Complete Button (Employee View) */}
														{!isTaskCompleted &&
															!isPendingApproval &&
															!readonly && (
																<>
																	{task.category ===
																	"COMPLIANCE" ? (
																		<Button
																			onClick={() => {
																				const docType =
																					getDocTypeFromTask(
																						task,
																					);
																				// Always navigate to employee details for consistency
																				navigate(
																					`/employee/${employeeId}?tab=documents&action=add-doc${docType ? `&documentType=${encodeURIComponent(docType)}` : ""}`,
																				);
																			}}
																			className={`w-full ${isOffboarding ? "bg-red-600 hover:bg-red-700" : "bg-orange-600 hover:bg-orange-700"} text-white`}>
																			{getEmployeeComplianceActionLabel({
																				isRejectedReview,
																				linkedDocument,
																			})}
																		</Button>
																	) : (
																		<Button
																			onClick={() =>
																				handleCompleteTask(
																					task,
																				)
																			}
																			disabled={isUpdating}
																			className={`w-full ${isOffboarding ? "bg-red-600 hover:bg-red-700" : "bg-orange-600 hover:bg-orange-700"} text-white`}>
																			Submit for Review
																		</Button>
																	)}
																</>
															)}

														{/* Review Document Button (HR Review View - Compliance) */}
														{readonly &&
															task.category === "COMPLIANCE" && (
																<div className="space-y-4 rounded-sm border border-orange-200 bg-orange-50 p-4">
																	<div className="space-y-1">
																		<div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
																			<ShieldCheck className="h-4 w-4 text-orange-600" />
																			<span>{reviewConfig.title} Review</span>
																		</div>
																		<p className="text-sm text-gray-600">
																			{reviewConfig.description}
																		</p>
																	</div>

																	{reviewConfig.portalUrl ? (
																		<div className="rounded-sm border border-blue-100 bg-blue-50 p-3">
																			<div className="text-sm font-semibold text-blue-900">
																				Verify online
																			</div>
																			<p className="mt-1 text-sm text-blue-700">
																				Use the official portal for your final verification.
																			</p>
																			<a
																				href={reviewConfig.portalUrl}
																				target="_blank"
																				rel="noreferrer"
																				className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:underline">
																				Open {reviewConfig.portalName}
																				<ExternalLink className="h-3.5 w-3.5" />
																			</a>
																		</div>
																	) : null}

																	<div className="space-y-3">
																		<div className="text-sm font-semibold text-gray-900">
																			Validation checks
																		</div>
																		<p className="text-xs text-gray-500">
																			These help document the review, but they do not block approval.
																		</p>
																		<div className="space-y-2">
																			{reviewConfig.checks.map((check) => (
																				<div
																					key={`${task.id}-${check}`}
																					className="flex items-start gap-3 rounded-sm border border-gray-200 bg-white p-3">
																					<Checkbox
																						checked={Boolean(
																							reviewChecks[task.id]?.[check],
																						)}
																						onCheckedChange={(checked) =>
																							toggleReviewCheck(
																								task.id,
																								check,
																								Boolean(checked),
																							)
																						}
																						className="mt-0.5"
																					/>
																					<Label className="text-sm font-medium text-gray-700">
																						{check}
																					</Label>
																				</div>
																			))}
																		</div>
																	</div>

																	{reviewConfig.inputLabel ? (
																		<div className="space-y-2">
																			<Label className="text-sm font-semibold text-gray-900">
																				{reviewConfig.inputLabel}
																			</Label>
																			<p className="text-xs text-gray-500">
																				Optional: record the verified number here if you checked it during review.
																			</p>
																			<Input
																				value={reviewInputValue}
																				onChange={(e) =>
																					updateReviewInput(
																						task.id,
																						e.target.value,
																						reviewConfig,
																					)
																				}
																				placeholder={reviewConfig.inputPlaceholder}
																				className={
																					reviewInputError
																						? "border-red-500 focus-visible:ring-red-500"
																						: ""
																				}
																				disabled={isAlreadyApproved}
																			/>
																			{reviewInputError ? (
																				<div className="flex items-center gap-1 text-xs text-red-600">
																					<AlertCircle className="h-3.5 w-3.5" />
																					<span>{reviewInputError}</span>
																				</div>
																			) : null}
																		</div>
																	) : null}

																	{!hasDocumentToReview && hasReviewableSubmission && !isAlreadyApproved ? (
																		<div className="text-xs text-amber-700">
																			No submitted file preview is attached to this task yet. You can still review the submitted fields here and ask the employee to resubmit from self service if needed.
																		</div>
																	) : null}

																	{!hasReviewableSubmission && !isAlreadyApproved ? (
																		<div className="text-xs text-amber-700">
																			There is not enough submitted data on this task yet to approve it.
																		</div>
																	) : null}

																	{onApprove ? (
																		<Button
																			onClick={() =>
																				onApprove(task, {
																					verifiedNumber: reviewInputValue,
																				})
																			}
																			disabled={
																				isUpdating ||
																				isAlreadyApproved ||
																				Boolean(reviewInputError) ||
																				!hasReviewableSubmission
																			}
																			className={`w-full ${isAlreadyApproved ? "bg-green-600 hover:bg-green-700" : "bg-emerald-600 hover:bg-emerald-700"} text-white`}>
																			{isAlreadyApproved
																				? "Approved & Verified"
																				: "Mark as Verified & Approved"}
																		</Button>
																	) : null}
																</div>
															)}

														{/* Approve Button (HR Review View) */}
														{readonly &&
															onApprove &&
															task.category !== "COMPLIANCE" && ( // For non-compliance, show standard approve
																<Button
																	onClick={() => onApprove(task)}
																	disabled={
																		isUpdating ||
																		task.status === "COMPLETED"
																	}
																	className={`w-full ${task.status === "COMPLETED" ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"} text-white`}>
																	{task.status === "COMPLETED"
																		? "Approved"
																		: "Approve Task"}
																</Button>
															)}

														{/* Status Messages */}
														{!readonly &&
															isPendingApproval && (
																<div className="text-sm text-sky-700 font-medium flex items-center gap-1 bg-sky-50 p-2 rounded">
																	<Clock className="w-4 h-4" />{" "}
																	Submitted and waiting for HR approval
																</div>
															)}
														{!readonly &&
															isRejectedReview && (
																<div className="text-sm text-red-700 font-medium flex items-center gap-1 bg-red-50 p-2 rounded">
																	<Ban className="w-4 h-4" />{" "}
																	Returned for correction
																</div>
															)}
														{!readonly &&
															isTaskCompleted && (
																<div className="text-sm text-green-600 font-medium flex items-center gap-1 bg-green-50 p-2 rounded">
																	<CheckCircle className="w-4 h-4" />{" "}
																	Approved by HR
																</div>
															)}
													</div>
												)}
											</div>
												);
											})()
										))}
									</div>
								)}
							</div>
						);
					})}

					{Object.keys(tasksByCategory).length === 0 && (
						<div className="text-center py-8 text-gray-500">
							<FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
							<p>No tasks found</p>
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
