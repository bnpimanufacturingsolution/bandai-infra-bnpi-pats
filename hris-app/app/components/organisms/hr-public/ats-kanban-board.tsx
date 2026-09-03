import { useState } from "react";
import {
	HelpCircle,
	Search,
	Settings2,
	ChevronDown,
	MoreHorizontal,
	ArrowRight,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";

import { ApplicantTableRow } from "./applicant-table-row";
import { type Applicant, type ApplicantStatus } from "~/types/application";
import { useApplicants } from "~/hooks/use-applicants-api";
import { ApplicantDetailsDialog } from "./applicant-detailts";
import { PDFViewer } from "~/components/molecules/pdf-viewer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEmployees } from "~/lib/hooks/useEmployees";

type HrAssigneeOption = {
	id: string; // Employee.id (canonical for Applicant.assignedHrId)
	userName: string;
	email?: string;
};

export function ATSKanbanBoard() {
	const {
		applicants,
		moveApplicant,
		rejectApplicant,
		getApplicantsByStatus,
		isLoading,
		error,
		assignHR,
	} = useApplicants();

	const { data: employeesData } = useEmployees({ limit: 1000 });
	const employees = Array.isArray((employeesData as any)?.employees)
		? (employeesData as any).employees
		: [];
	const hrUsers: HrAssigneeOption[] = employees
		.filter((emp: any) => typeof emp?.role === "string" && emp.role.startsWith("hris-hr-"))
		.map((emp: any) => {
			const firstName = emp?.person?.personalInfo?.firstName || "";
			const lastName = emp?.person?.personalInfo?.lastName || "";
			const fullName = `${firstName} ${lastName}`.trim();

			return {
				id: emp.id,
				userName: fullName || emp.employeeId || "Unknown",
				email: emp?.person?.contactInfo?.email || "",
			} satisfies HrAssigneeOption;
		});

	const [selectedApplicant, setSelectedApplicant] = useState<Applicant | null>(null);
	const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
	const [directCvUrl, setDirectCvUrl] = useState<string | null>(null);
	const [cvViewerOpen, setCvViewerOpen] = useState(false);

	const groupedApplicants = applicants.reduce(
		(acc, applicant) => {
			const group =
				typeof applicant.position === "string"
					? applicant.position
					: applicant.position?.title || "Unassigned Position";
			if (!acc[group]) {
				acc[group] = [];
			}
			acc[group].push(applicant);
			return acc;
		},
		{} as Record<string, Applicant[]>,
	);

	const groups = Object.entries(groupedApplicants).sort((a, b) => {
		if (a[0] === "Unassigned Position") return 1;
		if (b[0] === "Unassigned Position") return -1;
		return a[0].localeCompare(b[0]);
	});

	const toggleGroup = (groupName: string) => {
		const newCollapsed = new Set(collapsedGroups);
		if (newCollapsed.has(groupName)) {
			newCollapsed.delete(groupName);
		} else {
			newCollapsed.add(groupName);
		}
		setCollapsedGroups(newCollapsed);
	};

	// Show loading state
	if (isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
					<p className="text-muted-foreground">Loading applicants...</p>
				</div>
			</div>
		);
	}

	// Show error state
	if (error) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<div className="text-center">
					<p className="text-destructive font-semibold mb-2">Error loading applicants</p>
					<p className="text-sm text-muted-foreground">{error.message}</p>
				</div>
			</div>
		);
	}

	const handleApplicantClick = (applicant: Applicant) => {
		setSelectedApplicant(applicant);
		setDetailsDialogOpen(true);
	};

	const handleMove = (newStatus: ApplicantStatus) => {
		if (selectedApplicant) {
			moveApplicant(selectedApplicant.id, newStatus);
			// Update selected applicant state
			setSelectedApplicant({
				...selectedApplicant,
				status: newStatus,
				lastUpdated: new Date(),
			});
		}
	};

	const handleReject = (reason: string, feedback: string) => {
		if (selectedApplicant) {
			rejectApplicant(selectedApplicant.id, reason, feedback);
			setSelectedApplicant(null);
		}
	};

	return (
		<>
			<div className="flex-1 overflow-hidden flex flex-col border border-border/50 rounded-xl bg-card shadow-sm">
				{/* Top Toolbar */}
				<div className="p-2 border-b border-border flex items-center justify-between bg-muted/20">
					<div className="flex items-center gap-2">
						{/* Search / Filter */}
						<div className="relative group">
							<div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
								<svg
									className="h-3.5 w-3.5 text-muted-foreground group-focus-within:text-primary transition-colors"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
									/>
								</svg>
							</div>
							<input
								type="text"
								placeholder="Filter by keyword..."
								className="pl-8 pr-4 py-1 w-64 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all shadow-sm"
							/>
						</div>
					</div>

					{/* Right actions */}
					<div className="flex items-center gap-2">
						<Popover>
							<PopoverTrigger asChild>
								<button className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-all border border-transparent hover:border-border">
									<HelpCircle className="w-3.5 h-3.5" />
									<span>Quick Guide</span>
								</button>
							</PopoverTrigger>
							<PopoverContent
								className="w-[400px] p-0 shadow-2xl border-border/50"
								align="end">
								<div className="p-4 border-b border-border bg-muted/30">
									<div className="flex items-center gap-2">
										<div className="p-1.5 rounded-lg bg-primary/10 text-primary">
											<HelpCircle className="w-4 h-4" />
										</div>
										<div>
											<h4 className="font-bold text-sm leading-none">
												Recruitment Pipeline
											</h4>
											<p className="text-[11px] text-muted-foreground mt-1">
												Detailed guide for the 7-step candidate journey
											</p>
										</div>
									</div>
								</div>

								<div className="p-4 max-h-[400px] overflow-y-auto">
									<div className="space-y-3">
										{/* Step 1 */}
										<div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
											<div className="flex items-center gap-2 mb-1.5">
												<div className="w-6 h-6 rounded-full bg-slate-400 text-xs font-bold text-white flex items-center justify-center shrink-0">
													1
												</div>
												<span className="text-xs font-bold text-slate-700">
													New (Initial Application)
												</span>
											</div>
											<p className="text-[11px] text-slate-500 leading-normal">
												The starting point. Fresh applications that
												haven&apos;t been touched yet.
											</p>
										</div>

										<div className="flex justify-center -my-1">
											<ChevronDown className="w-4 h-4 text-slate-300" />
										</div>

										{/* Step 2 */}
										<div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
											<div className="flex items-center gap-2 mb-1.5">
												<div className="w-6 h-6 rounded-full bg-blue-500 text-xs font-bold text-white flex items-center justify-center shrink-0">
													2
												</div>
												<span className="text-xs font-bold text-blue-700">
													Reviewing (HR Evaluation)
												</span>
											</div>
											<p className="text-[11px] text-blue-600 leading-normal">
												Triggered when an HR is assigned. This is where you
												verify documents and the &quot;Reviewing
												Checklist&quot; appears.
											</p>
										</div>

										<div className="flex justify-center -my-1">
											<ChevronDown className="w-4 h-4 text-blue-200" />
										</div>

										{/* Step 3 */}
										<div className="p-3 rounded-lg bg-cyan-50 border border-cyan-100">
											<div className="flex items-center gap-2 mb-1.5">
												<div className="w-6 h-6 rounded-full bg-cyan-500 text-xs font-bold text-white flex items-center justify-center shrink-0">
													3
												</div>
												<span className="text-xs font-bold text-cyan-700">
													For Interview (Qualified)
												</span>
											</div>
											<p className="text-[11px] text-cyan-600 leading-normal">
												The candidate has passed the initial review and is
												ready for scheduling.
											</p>
										</div>

										<div className="flex justify-center -my-1">
											<ChevronDown className="w-4 h-4 text-cyan-200" />
										</div>

										{/* Step 4 */}
										<div className="p-3 rounded-lg bg-indigo-50 border border-indigo-100">
											<div className="flex items-center gap-2 mb-1.5">
												<div className="w-6 h-6 rounded-full bg-indigo-500 text-xs font-bold text-white flex items-center justify-center shrink-0">
													4
												</div>
												<span className="text-xs font-bold text-indigo-700">
													Interview Stage (Assessment)
												</span>
											</div>
											<p className="text-[11px] text-indigo-600 leading-normal">
												Actively undergoing interviews. This is the
												&quot;Interview Process&quot; where panelists
												evaluate performance.
											</p>
										</div>

										<div className="flex justify-center -my-1">
											<ChevronDown className="w-4 h-4 text-indigo-200" />
										</div>

										{/* Step 5 */}
										<div className="p-3 rounded-lg bg-purple-50 border border-purple-100">
											<div className="flex items-center gap-2 mb-1.5">
												<div className="w-6 h-6 rounded-full bg-purple-500 text-xs font-bold text-white flex items-center justify-center shrink-0">
													5
												</div>
												<span className="text-xs font-bold text-purple-700">
													Final Evaluation / Offer Prep
												</span>
											</div>
											<p className="text-[11px] text-purple-600 leading-normal">
												The intermediate phase where the hiring team makes a
												final decision and prepares the offer details.
											</p>
										</div>

										<div className="flex justify-center -my-1">
											<ChevronDown className="w-4 h-4 text-purple-200" />
										</div>

										{/* Step 6 */}
										<div className="p-3 rounded-lg bg-orange-50 border border-orange-100">
											<div className="flex items-center gap-2 mb-1.5">
												<div className="w-6 h-6 rounded-full bg-orange-500 text-xs font-bold text-white flex items-center justify-center shrink-0">
													6
												</div>
												<span className="text-xs font-bold text-orange-700">
													Accepted Stage (Contract Phase)
												</span>
											</div>
											<p className="text-[11px] text-orange-600 leading-normal">
												The candidate has accepted the offer. The
												&quot;Contract&quot; badge appears while waiting for
												signed documents.
											</p>
										</div>

										<div className="flex justify-center -my-1">
											<ChevronDown className="w-4 h-4 text-orange-200" />
										</div>

										{/* Step 7 */}
										<div className="p-3 rounded-lg bg-green-50 border border-green-200 ring-2 ring-green-100/50">
											<div className="flex items-center gap-2 mb-1.5">
												<div className="w-6 h-6 rounded-full bg-green-500 text-xs font-bold text-white flex items-center justify-center shrink-0">
													7
												</div>
												<span className="text-xs font-bold text-green-700">
													Completed (Hired & Onboarded)
												</span>
											</div>
											<p className="text-[11px] text-green-700 font-medium leading-normal">
												Candidate is successfully hired. Applicant data is
												converted to an active Employee record.
											</p>
										</div>
									</div>
								</div>

								<div className="p-3 bg-muted/10 text-center border-t border-border">
									<p className="text-[10px] text-muted-foreground italic mb-2">
										Onboarded candidates transition to the Personnel Management
										module.
									</p>
									<button className="text-[10px] uppercase tracking-wider font-bold text-primary hover:underline">
										View Full Documentation
									</button>
								</div>
							</PopoverContent>
						</Popover>

						<button className="p-1.5 hover:bg-muted rounded text-muted-foreground transition-colors">
							<Settings2 className="w-4 h-4" />
						</button>
					</div>
				</div>

				<div className="flex-1 overflow-y-auto bg-background/50">
					<div className="w-full">
						{/* Sticky Table Header */}
						<div className="grid grid-cols-[10%_30%_18%_12%_15%_10%_5%] px-4 py-2.5 border-b border-border text-[11px] font-semibold text-neutral-500 uppercase tracking-[0.08em] bg-muted/50 sticky top-0 z-20 backdrop-blur-sm">
							<div className="flex items-center gap-1">Type</div>
							<div className="flex items-center gap-1">Full Name</div>
							<div className="flex items-center gap-1">Progress</div>
							<div className="flex items-center gap-1">Status</div>
							<div className="flex items-center gap-1">Contact / Assignee</div>
							<div className="flex items-center gap-1">Priority</div>
							<div className="text-right"></div>
						</div>

						{/* Grouped Rows */}
						<div className="divide-y divide-border/50">
							{groups.length > 0 ? (
								groups.map(([groupName, groupApplicants]) => {
									const isCollapsed = collapsedGroups.has(groupName);
									return (
										<div key={groupName} className="group/section">
											{/* Group Header */}
											<div
												onClick={() => toggleGroup(groupName)}
												className="px-4 py-2 bg-muted/10 border-b border-border/30 flex items-center gap-3 sticky top-[33px] backdrop-blur-sm z-10 hover:bg-muted/30 cursor-pointer transition-colors select-none">
												<div className="p-0.5 rounded text-muted-foreground hover:bg-muted/50 transition-colors">
													<svg
														className={`w-3.5 h-3.5 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : "rotate-0"}`}
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24">
														<path
															strokeLinecap="round"
															strokeLinejoin="round"
															strokeWidth={2}
															d="M19 9l-7 7-7-7"
														/>
													</svg>
												</div>
												<div className="font-medium text-sm flex items-center gap-3 text-neutral-900">
													<div className="flex items-center justify-center w-5 h-5 rounded-md bg-primary/10 text-primary">
														<div className="w-2 h-2 rounded-full border-[1.5px] border-current" />
													</div>
													{groupName}
													<span className="text-xs font-medium text-neutral-600 bg-neutral-100 px-1.5 py-0.5 rounded-full border border-neutral-200">
														{groupApplicants.length}
													</span>
												</div>

												{/* Header Dots */}
												<div className="ml-auto opacity-0 group-hover/section:opacity-100 transition-opacity">
													<svg
														className="w-4 h-4 text-muted-foreground hover:text-foreground"
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24">
														<path
															strokeLinecap="round"
															strokeLinejoin="round"
															strokeWidth={2}
															d="M5 12h.01M12 12h.01M19 12h.01"
														/>
													</svg>
												</div>
											</div>

											{/* Rows */}
											{!isCollapsed && (
												<div className="bg-background">
													{groupApplicants.map((applicant, index) => (
														<ApplicantTableRow
															key={applicant.id}
															applicant={applicant}
															onClick={() =>
																handleApplicantClick(applicant)
															}
															onViewCV={(url) => {
																setDirectCvUrl(url);
																setCvViewerOpen(true);
															}}
															hrUsers={hrUsers}
															onAssignHR={(assignedHrId) =>
																assignHR(applicant.id, assignedHrId)
															}
														/>
													))}

													{/* "Add Item" placeholder at bottom of group */}
													<button
														onClick={() =>
															alert(
																"Create item functionality would open here.",
															)
														}
														className="w-full px-10 py-1.5 text-sm text-muted-foreground hover:bg-muted/30 cursor-pointer flex items-center gap-2 group/add border-b border-dashed border-border/50 opacity-0 group-hover/section:opacity-100 transition-all duration-200">
														<svg
															className="w-3.5 h-3.5 group-hover/add:text-primary transition-colors"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24">
															<path
																strokeLinecap="round"
																strokeLinejoin="round"
																strokeWidth={2}
																d="M12 4v16m8-8H4"
															/>
														</svg>
														<span className="group-hover/add:text-foreground transition-colors">
															Add item
														</span>
													</button>
												</div>
											)}
										</div>
									);
								})
							) : (
								<div className="py-12 text-center text-muted-foreground flex flex-col items-center">
									<div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
										<svg
											className="w-6 h-6 text-muted-foreground/50"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24">
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
											/>
										</svg>
									</div>
									<p>No applicants found.</p>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>

			<ApplicantDetailsDialog
				applicant={selectedApplicant}
				open={detailsDialogOpen}
				onOpenChange={setDetailsDialogOpen}
				onMove={handleMove}
				onReject={handleReject}
			/>

			<Dialog open={cvViewerOpen} onOpenChange={setCvViewerOpen}>
				<DialogContent className="max-w-[98vw] w-[98vw] h-[98vh] p-0 overflow-hidden flex flex-col">
					<DialogHeader className="px-4 py-3 border-b shrink-0">
						<DialogTitle>Curriculum Vitae</DialogTitle>
					</DialogHeader>
					<div className="flex-1 overflow-hidden">
						{directCvUrl && <PDFViewer url={directCvUrl} />}
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
