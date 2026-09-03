import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";

import {
	Calendar,
	Clock,
	Mail,
	User,
	ArrowRight,
	XCircle,
	Eye,
	Download,
	FileText,
	ExternalLink,
	ClipboardCheck,
	FileSignature,
	CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";

import type { Applicant, ApplicantStatus } from "~/types/application";
import { Badge } from "~/components/atoms";

import { RejectApplicantDialog } from "./reject-applicant-dialog";
import { PDFViewer } from "~/components/molecules/pdf-viewer";

interface ApplicantDetailsDialogProps {
	applicant: Applicant | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onMove: (newStatus: ApplicantStatus) => void;
	onReject: (reason: string, feedback: string) => void;
}

export function ApplicantDetailsDialog({
	applicant,
	open,
	onOpenChange,
	onMove,
	onReject,
}: ApplicantDetailsDialogProps) {
	const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
	const [hasViewedDocuments, setHasViewedDocuments] = useState(false);
	const [selectedDocUrl, setSelectedDocUrl] = useState<string | null>(null);
	const [viewerOpen, setViewerOpen] = useState(false);

	if (!applicant) return null;

	const handleConfirmReview = () => {
		if (applicant.status === "new") {
			onMove("reviewing");
			setHasViewedDocuments(false); // Reset for next time
			onOpenChange(false); // Close the dialog
		}
	};

	const handleDialogChange = (isOpen: boolean) => {
		if (!isOpen) {
			// Reset state when dialog closes
			setHasViewedDocuments(false);
		}
		onOpenChange(isOpen);
	};

	const getInitials = (name: string) => {
		return name
			.split(" ")
			.map((n) => n[0])
			.join("")
			.toUpperCase();
	};

	const getStatusBadge = (status: ApplicantStatus) => {
		const statusConfig: Record<
			ApplicantStatus,
			{ label: string; variant: "default" | "secondary" | "destructive" }
		> = {
			new: { label: "New", variant: "secondary" },
			reviewing: { label: "In Review", variant: "default" },
			for_interview: { label: "For Interview", variant: "default" },
			interview: { label: "Interviewing", variant: "default" },
			accepted: { label: "Accepted Stage", variant: "default" },
			rejected: { label: "Rejected", variant: "destructive" },
			hired: { label: "Completed", variant: "default" },
			completed: { label: "Completed", variant: "default" },
		};

		const config = statusConfig[status];
		return <Badge variant={config.variant}>{config.label}</Badge>;
	};

	const getNextActions = () => {
		switch (applicant.status) {
			case "new":
				return [{ label: "Move to Review", status: "reviewing" as ApplicantStatus }];
			case "reviewing":
				return [
					{ label: "Ready for Interview", status: "for_interview" as ApplicantStatus },
				];
			case "for_interview":
				return [{ label: "Start Interview Stage", status: "interview" as ApplicantStatus }];
			case "interview":
				return [{ label: "Accept Applicant", status: "accepted" as ApplicantStatus }];
			case "accepted":
				return [{ label: "Complete Onboarding", status: "hired" as ApplicantStatus }];
			case "rejected":
			case "hired":
			case "completed":
				return [];
			default:
				return [];
		}
	};

	const nextActions = getNextActions();
	const canReject = !["rejected", "hired", "completed"].includes(applicant.status);

	const formatDate = (date: string | Date): string => {
		return new Date(date).toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	};

	return (
		<>
			<Dialog open={open} onOpenChange={handleDialogChange}>
				<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<div className="flex items-start gap-4">
							<Avatar className="h-16 w-16 border-2 border-border">
								<AvatarFallback className="bg-primary text-primary-foreground text-lg font-semibold">
									{getInitials(applicant.name)}
								</AvatarFallback>
							</Avatar>
							<div className="flex-1">
								<DialogTitle className="text-2xl">{applicant.name}</DialogTitle>
								<DialogDescription className="mt-1">
									{typeof applicant.position === "string"
										? applicant.position
										: applicant.position.title}
								</DialogDescription>
								<div className="mt-2">{getStatusBadge(applicant.status)}</div>
							</div>
						</div>
					</DialogHeader>

					<div className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div className="flex items-center gap-2 text-sm">
								<Mail className="h-4 w-4 text-muted-foreground" />
								<span className="text-muted-foreground truncate">
									{applicant.email}
								</span>
							</div>
							<div className="flex items-center gap-2 text-sm">
								<User className="h-4 w-4 text-muted-foreground" />
								<span className="text-muted-foreground">{applicant.recruiter}</span>
							</div>
							<div className="flex items-center gap-2 text-sm">
								<Calendar className="h-4 w-4 text-muted-foreground" />
								<span className="text-muted-foreground">
									Applied {formatDate(applicant.appliedDate)}
								</span>
							</div>
						</div>

						{/* Documents Section */}
						{applicant.documents && applicant.documents.length > 0 && (
							<div className="p-4 bg-muted rounded-lg">
								<h4 className="text-base font-semibold mb-3">Documents</h4>
								<div className="space-y-2">
									{applicant.documents.map((doc, index) => {
										const isPdf =
											doc.url.split("?")[0].toLowerCase().endsWith(".pdf") ||
											doc.name.toLowerCase().endsWith(".pdf") ||
											doc.type.toLowerCase().includes("pdf");

										return (
											<div
												key={index}
												onClick={() => {
													setHasViewedDocuments(true);
													if (isPdf) {
														setSelectedDocUrl(doc.url);
														setViewerOpen(true);
													} else {
														window.open(doc.url, "_blank");
													}
												}}
												className="w-full flex items-center justify-between p-3 bg-background rounded-lg border border-border/50 hover:border-primary/30 hover:bg-accent/50 transition-all cursor-pointer group">
												<div className="flex items-center gap-3">
													<div
														className={`p-2 rounded-md ${isPdf ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"}`}>
														<FileText className="h-5 w-5" />
													</div>
													<div>
														<p className="text-sm font-semibold text-foreground">
															{doc.name}
														</p>
														<p className="text-xs text-muted-foreground capitalize">
															{doc.type.replace(/_/g, " ")}
														</p>
													</div>
												</div>
												<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
													{isPdf && (
														<Button
															variant="ghost"
															size="icon"
															className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
															onClick={(e) => {
																e.stopPropagation();
																setHasViewedDocuments(true);
																setSelectedDocUrl(doc.url);
																setViewerOpen(true);
															}}>
															<Eye className="h-4 w-4" />
														</Button>
													)}
													<Button
														variant="ghost"
														size="icon"
														className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent"
														asChild
														onClick={(e) => {
															e.stopPropagation();
															setHasViewedDocuments(true);
														}}>
														<a
															href={doc.url}
															download={doc.name}
															target="_blank"
															rel="noreferrer">
															<Download className="h-4 w-4" />
														</a>
													</Button>
												</div>
											</div>
										);
									})}
								</div>
							</div>
						)}

						{applicant.status === "reviewing" && (
							<div className="p-4 bg-cyan-50 border border-cyan-100 rounded-lg">
								<h4 className="text-base font-semibold mb-2 text-cyan-800 flex items-center gap-2">
									<ClipboardCheck className="h-5 w-5" />
									Reviewing Checklist
								</h4>
								<div className="space-y-2">
									<div className="flex items-center gap-2 text-sm text-cyan-700">
										<CheckCircle2 className="h-4 w-4 text-cyan-600" />
										Documents verified
									</div>
									<div className="flex items-center gap-2 text-sm text-cyan-700">
										<CheckCircle2 className="h-4 w-4 text-cyan-600" />
										Details confirmed
									</div>
									<div className="flex items-center gap-2 text-sm text-cyan-600 italic">
										<div className="w-4 h-4 rounded-full border border-cyan-300" />
										Final verification pending
									</div>
								</div>
							</div>
						)}

						{applicant.status === "accepted" && (
							<div className="p-4 bg-orange-50 border border-orange-100 rounded-lg">
								<h4 className="text-base font-semibold mb-2 text-orange-800 flex items-center gap-2">
									<FileSignature className="h-5 w-5" />
									Accepted Stage - Contract
								</h4>
								<p className="text-sm text-orange-700 mb-3">
									Employee object created. Please upload the signed contract to
									complete the onboarding process.
								</p>
								<Button
									variant="outline"
									className="w-full bg-white border-orange-200 text-orange-700 hover:bg-orange-100">
									<Download className="h-4 w-4 mr-2" />
									Download Offer Letter
								</Button>
							</div>
						)}

						{applicant.status === "rejected" && (
							<div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
								<h4 className="text-base font-semibold mb-2 text-destructive">
									Rejection Details
								</h4>
								{applicant.rejectionReason && (
									<div className="mb-2">
										<p className="text-sm text-muted-foreground mb-1">Reason</p>
										<p className="text-sm">{applicant.rejectionReason}</p>
									</div>
								)}
								{applicant.rejectionFeedback && (
									<div>
										<p className="text-sm text-muted-foreground mb-1">
											Feedback
										</p>
										<p className="text-sm">{applicant.rejectionFeedback}</p>
									</div>
								)}
							</div>
						)}
					</div>

					<div className="flex flex-col gap-3">
						{/* Confirm Review Button for New Applications */}
						{applicant.status === "new" && (
							<div className="p-4 bg-primary/10 border-2 border-primary/30 rounded-lg">
								<div className="flex items-start gap-3 mb-3">
									<svg
										className="h-5 w-5 text-primary mt-0.5"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24">
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
									<div className="flex-1">
										<h4 className="text-base font-semibold text-foreground mb-1">
											Review Required
										</h4>
										<p className="text-sm text-muted-foreground">
											Please review the applicant&apos;s documents before
											confirming. This will automatically move the application
											to &quot;Viewed&quot; status.
										</p>
									</div>
								</div>
								<Button
									onClick={handleConfirmReview}
									disabled={!hasViewedDocuments}
									className="w-full"
									size="lg">
									{hasViewedDocuments
										? "✓ Confirm Review & Mark as Viewed"
										: "Please Review Documents First"}
								</Button>
								{!hasViewedDocuments && (
									<p className="text-sm text-muted-foreground mt-2 text-center">
										Click on any document above to enable this button
									</p>
								)}
							</div>
						)}

						{/* Regular Action Buttons */}
						<div className="flex flex-wrap gap-2">
							{nextActions
								.filter((action) => action.status !== "reviewing")
								.map((action) => (
									<Button
										key={action.status}
										onClick={() => {
											onMove(action.status);
											onOpenChange(false);
										}}
										className="flex items-center gap-2">
										{action.label}
										<ArrowRight className="h-4 w-4" />
									</Button>
								))}
							{canReject && (
								<Button
									variant="destructive"
									onClick={() => setRejectDialogOpen(true)}
									className="flex items-center gap-2">
									<XCircle className="h-4 w-4" />
									Reject Applicant
								</Button>
							)}
						</div>
					</div>
				</DialogContent>
			</Dialog>

			<RejectApplicantDialog
				open={rejectDialogOpen}
				onOpenChange={setRejectDialogOpen}
				onReject={(reason, feedback) => {
					onReject(reason, feedback);
					setRejectDialogOpen(false);
					onOpenChange(false);
				}}
			/>

			<Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
				<DialogContent className="max-w-screen-2xl h-[95vh] p-0 overflow-hidden flex flex-col">
					<DialogHeader className="p-4 border-b">
						<DialogTitle>Document Viewer</DialogTitle>
					</DialogHeader>
					<div className="flex-1 overflow-hidden p-2">
						{selectedDocUrl && <PDFViewer url={selectedDocUrl} />}
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
