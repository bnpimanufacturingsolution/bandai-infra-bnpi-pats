import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/atoms";
import type { Applicant, ApplicantStatus } from "~/types/application";

import {
	Clock,
	FileText,
	MessageSquare,
	MoreHorizontal,
	Circle,
	CheckCircle2,
	XCircle,
	AlertCircle,
	Sparkles,
	UserPlus,
	ChevronDown,
	ClipboardCheck,
	FileSignature,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStatusConfig } from "~/lib/status-config";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { cn } from "~/lib/utils";

interface ApplicantTableRowProps {
	applicant: Applicant;
	onClick: () => void;
	onViewCV?: (url: string) => void;
	hrUsers?: Array<{
		id: string; // Employee.id
		userId?: string;
		userName: string;
		email?: string;
	}>;
	onAssignHR?: (assignedHrId: string) => void;
}

export function ApplicantTableRow({
	applicant,
	onClick,
	onViewCV,
	hrUsers = [],
	onAssignHR,
}: ApplicantTableRowProps) {
	const getInitials = (firstName: string, lastName: string) => {
		const first = firstName?.[0] || "";
		const last = lastName?.[lastName.length - 1] || "";
		return (first + last).toUpperCase() || "??";
	};

	// Calculate progress based on status
	const getProgressFromStatus = (status: ApplicantStatus) => {
		const statusProgress: Record<ApplicantStatus, { current: number; total: number }> = {
			new: { current: 1, total: 7 },
			reviewing: { current: 2, total: 7 },
			for_interview: { current: 3, total: 7 },
			interview: { current: 4, total: 7 },
			rejected: { current: 0, total: 7 },
			accepted: { current: 6, total: 7 },
			hired: { current: 7, total: 7 },
			completed: { current: 7, total: 7 },
		};
		return statusProgress[status] || { current: 1, total: 7 };
	};

	const getPriority = (status: ApplicantStatus): "urgent" | "high" | "medium" | "low" => {
		if (status === "accepted" || status === "hired") return "urgent";
		if (status === "for_interview" || status === "interview") return "high";
		if (status === "reviewing") return "medium";
		return "low";
	};

	const getPriorityConfig = (priority: "urgent" | "high" | "medium" | "low") => {
		const configs = {
			urgent: {
				label: "Urgent",
				className: "bg-red-50 text-red-700 border-red-200",
				icon: AlertCircle,
			},
			high: {
				label: "High",
				className: "bg-orange-50 text-orange-700 border-orange-200",
				icon: Sparkles,
			},
			medium: {
				label: "Medium",
				className: "bg-yellow-50 text-yellow-700 border-yellow-200",
				icon: Circle,
			},
			low: {
				label: "Low",
				className: "bg-blue-50 text-blue-600 border-blue-200",
				icon: Circle,
			},
		};
		return configs[priority];
	};

	const progress = getProgressFromStatus(applicant.status);
	const currentStep = progress.current;
	const totalSteps = progress.total;
	const progressPercent = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

	const statusConfig = getStatusConfig(applicant.status);
	const StatusIcon = statusConfig.icon;

	const priority = getPriority(applicant.status);
	const priorityConfig = getPriorityConfig(priority);
	const PriorityIcon = priorityConfig.icon;

	const assignedHr = applicant.assignedHr || applicant.hr;
	const hrName = assignedHr?.person?.personalInfo
		? `${assignedHr.person.personalInfo.firstName || ""} ${assignedHr.person.personalInfo.lastName || ""}`.trim()
		: applicant.recruiter || "Unknown";
	const hrEmail = assignedHr?.person?.contactInfo?.email || "";

	return (
		<div
			className="group grid grid-cols-[10%_30%_18%_12%_15%_10%_5%] items-center px-4 py-2 border-b border-border/40 hover:bg-accent/30 transition-all duration-150 cursor-pointer"
			onClick={onClick}>
			{/* Type & ID */}
			<div className="flex items-center gap-2 overflow-hidden">
				<span className="text-xs text-muted-foreground/80 font-mono tracking-tight">
					#{applicant.applicantNumber || applicant.id.slice(0, 6)}
				</span>
			</div>

			{/* Full Name with Status Indicator */}
			<div className="flex items-center gap-2.5 overflow-hidden px-2">
				<div className="flex items-center gap-2 flex-1 min-w-0">
					{applicant.status === "hired" ? (
						<CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
					) : applicant.status === "rejected" ? (
						<XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
					) : (
						<Circle className="w-3 h-3 text-slate-400 shrink-0 fill-slate-200" />
					)}
					<span className="font-semibold text-foreground truncate text-sm tracking-tight">
						{applicant.firstName} {applicant.lastName}
					</span>
					{applicant.status === "reviewing" && (
						<Badge
							variant="outline"
							className="h-4 px-1 gap-0.5 text-[9px] border-cyan-200 bg-cyan-50 text-cyan-700">
							<ClipboardCheck className="w-2.5 h-2.5" />
							Checklist
						</Badge>
					)}
					{applicant.status === "accepted" && (
						<Badge
							variant="outline"
							className="h-4 px-1 gap-0.5 text-[9px] border-orange-200 bg-orange-50 text-orange-700">
							<FileSignature className="w-2.5 h-2.5" />
							Contract
						</Badge>
					)}
				</div>
			</div>

			{/* Progress with Enhanced Visualization */}
			<div className="flex items-center gap-2.5 px-2">
				<div className="flex items-center gap-1.5 text-xs text-neutral-500 font-medium min-w-[32px]">
					<span className="text-neutral-700">{currentStep}</span>
					<span className="text-neutral-300">/</span>
					<span className="text-neutral-700">{totalSteps}</span>
				</div>
				<div className="h-1.5 flex-1 bg-muted/60 rounded-full overflow-hidden border border-border/30">
					<div
						className={`h-full rounded-full transition-all duration-300 ${
							progressPercent === 100
								? "bg-gradient-to-r from-green-500 to-emerald-500"
								: progressPercent > 60
									? "bg-gradient-to-r from-blue-500 to-indigo-500"
									: progressPercent > 30
										? "bg-gradient-to-r from-yellow-500 to-orange-500"
										: "bg-gradient-to-r from-slate-400 to-slate-500"
						}`}
						style={{ width: `${progressPercent}%` }}
					/>
				</div>
				<div className="text-xs text-neutral-500 font-semibold min-w-[28px] text-right tabular-nums">
					{Math.round(progressPercent)}%
				</div>
			</div>

			{/* Status Badge */}
			<div className="px-2">
				<div
					className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-semibold leading-none transition-all hover:shadow-sm ${statusConfig.className}`}>
					<StatusIcon className="w-3 h-3" />
					<span className="tracking-tight">{statusConfig.label}</span>
				</div>
			</div>

			{/* Contact & Assignee */}
			<div className="flex flex-col gap-1 px-2 overflow-hidden">
				<Popover>
					<PopoverTrigger asChild>
						<div
							className={cn(
								"flex items-center gap-1.5 p-1.5 rounded-md transition-colors group/assignee",
								applicant.assignedHrId
									? "cursor-default"
									: "hover:bg-muted/50 cursor-pointer bg-orange-50/50 border border-dashed border-orange-200",
							)}
							onClick={(e) => e.stopPropagation()}>
							<Avatar className="h-5 w-5 border border-border/50 ring-1 ring-background">
								<AvatarFallback
									className={cn(
										"text-[9px] font-semibold bg-gradient-to-br",
										applicant.assignedHrId
											? "from-indigo-100 to-purple-100 text-indigo-700"
											: "from-orange-100 to-amber-100 text-orange-700",
									)}>
									{applicant.assignedHrId ? (
										getInitials(hrName, "")
									) : (
										<UserPlus className="w-2.5 h-2.5" />
									)}
								</AvatarFallback>
							</Avatar>

							<div className="flex flex-col min-w-0">
								<span
									className={cn(
										"text-xs font-medium truncate",
										applicant.assignedHrId
											? "text-neutral-700"
											: "text-orange-600 italic font-semibold",
									)}>
									{applicant.assignedHrId ? hrName : "Assign HR"}
								</span>
								{!applicant.assignedHrId && (
									<span className="text-[9px] text-orange-400 leading-none">
										Action required
									</span>
								)}
							</div>

							{!applicant.assignedHrId && (
								<ChevronDown
									className={cn(
										"w-3 h-3 text-muted-foreground transition-transform group-hover/assignee:translate-y-0.5",
										"text-orange-400",
									)}
								/>
							)}
						</div>
					</PopoverTrigger>
					{!applicant.assignedHrId && (
						<PopoverContent
							className="w-64 p-0 shadow-xl border-border/50"
							align="start">
							<Command>
								<div className="p-2 border-b bg-muted">
									<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
										Select HR Assignee
									</h3>
								</div>
								<CommandInput placeholder="Search recruitment team..." />
								<CommandList className="max-h-[280px]">
									<CommandEmpty>No recruitment members found.</CommandEmpty>
									<CommandGroup>
										{hrUsers.map((user) => {
											const email = user.email || "";
											const isSelected = applicant.assignedHrId === user.id;

											return (
												<CommandItem
													key={user.id}
													onSelect={() => {
														// Always assign Employee.id, not User.id.
														onAssignHR?.(user.id);
													}}
													className={cn(
														"hover:bg-green-200 flex items-center gap-3 p-2 cursor-pointer",
													)}>
													<div className="relative">
														<Avatar className="h-8 w-8 border border-border/40">
															<AvatarFallback className="text-xs bg-muted text-muted-foreground">
																{getInitials(user.userName, "")}
															</AvatarFallback>
														</Avatar>
													</div>
													<div className="flex flex-col min-w-0">
														<span
															className={cn(
																"text-sm font-medium truncate",
																isSelected && "text-primary",
															)}>
															{user.userName}
														</span>
														<span className="text-[10px] text-muted-foreground truncate">
															{email}
														</span>
													</div>
												</CommandItem>
											);
										})}
									</CommandGroup>
								</CommandList>
							</Command>
						</PopoverContent>
					)}
				</Popover>
				<div className="flex items-center gap-1 pl-1">
					<span className="text-[10px] text-neutral-400 truncate opacity-60 group-hover:opacity-100 transition-opacity">
						{applicant.assignedHrId ? hrEmail : ""}
					</span>
				</div>
			</div>

			{/* Priority & Applied Date */}
			<div className="flex flex-col gap-1 px-2">
				<div
					className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-bold leading-none w-fit ${priorityConfig.className}`}>
					<PriorityIcon className="w-2.5 h-2.5" />
					<span>{priorityConfig.label}</span>
				</div>
				<div className="flex items-center gap-1 text-xs text-neutral-400">
					<span className="truncate">
						{new Date(applicant.appliedDate).toLocaleDateString()}
					</span>
				</div>
			</div>

			{/* Actions */}
			<div className="text-right flex justify-end items-center gap-1">
				<div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
					{onViewCV &&
						applicant.documents?.find(
							(doc) =>
								doc.url.split("?")[0].toLowerCase().endsWith(".pdf") ||
								doc.name.toLowerCase().endsWith(".pdf") ||
								doc.type.toLowerCase().includes("pdf"),
						) && (
							<Button
								variant="ghost"
								size="icon"
								className="h-6 w-6 text-primary hover:text-primary hover:bg-primary/10"
								onClick={(e) => {
									e.stopPropagation();
									const cv = applicant.documents?.find(
										(doc) =>
											doc.url.split("?")[0].toLowerCase().endsWith(".pdf") ||
											doc.name.toLowerCase().endsWith(".pdf") ||
											doc.type.toLowerCase().includes("pdf"),
									);
									if (cv) onViewCV(cv.url);
								}}>
								<FileText className="w-3.5 h-3.5" />
							</Button>
						)}
					<Button
						variant="ghost"
						size="icon"
						className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-accent"
						onClick={(e) => e.stopPropagation()}>
						<MoreHorizontal className="w-3.5 h-3.5" />
					</Button>
				</div>
			</div>
		</div>
	);
}
