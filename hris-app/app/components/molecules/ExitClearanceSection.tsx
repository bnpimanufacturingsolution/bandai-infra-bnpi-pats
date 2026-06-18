import { useState } from "react";
import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { Modal } from "~/components/atoms/Modal";

import {
	CheckCircle2,
	Circle,
	Clock,
	AlertCircle,
	FileText,
	PlayCircle,
	ChevronDown,
	ChevronUp,
} from "lucide-react";
import { useBoardingProcessByEmployee } from "~/lib/hooks/useBoardingProcess";
import { useBoardingTemplates } from "~/lib/hooks/useBoardingTemplates";
import { useStartOffboarding } from "~/lib/hooks/useResignations";
import { useUpdateChecklistItem } from "~/lib/hooks/useChecklistItems";
import { Progress } from "../ui/progress";

interface ChecklistItem {
	id: string;
	title: string;
	description?: string;
	category: string;
	status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
	priority?: string;
	dueDate?: string;
	completedAt?: string;
}

interface ExitClearanceSectionProps {
	employeeId: string;
	requestId: string;
	requestStatus: string;
	isHRView?: boolean;
	isManagerView?: boolean;
	isEmployeeView?: boolean;
}

const categoryLabels: Record<string, string> = {
	KNOWLEDGE_TRANSFER: "Knowledge Transfer",
	EXIT_INTERVIEW: "Exit Interview",
	HR_DOCUMENTATION: "HR Documentation",
	PAYROLL: "Payroll & Finance",
	IT_SYSTEMS: "IT Systems",
	EQUIPMENT: "Equipment",
};

const statusStyles: Record<string, { icon: any; color: string; label: string }> = {
	PENDING: { icon: Circle, color: "text-gray-400", label: "Pending" },
	IN_PROGRESS: { icon: Clock, color: "text-blue-500", label: "In Progress" },
	COMPLETED: { icon: CheckCircle2, color: "text-green-500", label: "Completed" },
	SKIPPED: { icon: AlertCircle, color: "text-yellow-500", label: "Skipped" },
};

export function ExitClearanceSection({
	employeeId,
	requestId,
	requestStatus,
	isHRView = false,
	isManagerView = false,
	isEmployeeView = false,
}: ExitClearanceSectionProps) {
	// State
	const [isExpanded, setIsExpanded] = useState(true);

	// Fetch offboarding process for this employee
	const { data: boardingProcess, isLoading: isLoadingProcess } = useBoardingProcessByEmployee(
		employeeId,
		"OFFBOARDING",
	);

	// Mutation hooks
	const startOffboardingMutation = useStartOffboarding();
	const updateChecklistItemMutation = useUpdateChecklistItem();

	// Check if exit clearance can be started
	const canStartExitClearance =
		isHRView &&
		!boardingProcess &&
		["APPROVED", "HR_APPROVED", "PROCESSING"].includes(requestStatus);

	// Get checklist items grouped by category
	const checklistItems: any[] = boardingProcess?.checklistItems || [];
	const groupedItems = checklistItems.reduce((acc: Record<string, any[]>, item: any) => {
		const category = item.category || "OTHER";
		if (!acc[category]) acc[category] = [];
		acc[category].push(item);
		return acc;
	}, {});

	// Calculate completion percentage
	const completedCount = checklistItems.filter((i) => i.status === "COMPLETED").length;
	const totalCount = checklistItems.length;
	const completionPercentage =
		totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
	const allCompleted = totalCount > 0 && completedCount === totalCount;

	// Handle starting exit clearance
	const handleStartExitClearance = () => {
		startOffboardingMutation.mutate(
			{ requestId },
			{
				onSuccess: () => {
					// Success handled by mutation
				},
			},
		);
	};

	// Handle updating checklist item status
	const handleToggleItem = (item: any) => {
		const newStatus = item.status === "COMPLETED" ? "PENDING" : "COMPLETED";
		updateChecklistItemMutation.mutate({
			id: item.id,
			payload: {
				status: newStatus,
				...(newStatus === "COMPLETED" ? { completedAt: new Date().toISOString() } : {}),
			},
		});
	};

	// Don't show anything if loading
	if (isLoadingProcess) {
		return (
			<div className="p-4 bg-gray-50 rounded-lg border animate-pulse">
				<div className="h-6 bg-gray-200 rounded w-1/3 mb-2"></div>
				<div className="h-4 bg-gray-200 rounded w-2/3"></div>
			</div>
		);
	}

	// Show "Start Exit Clearance" button for HR if no process exists
	if (!boardingProcess && canStartExitClearance) {
		return (
			<div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
							<PlayCircle className="w-5 h-5 text-amber-600" />
						</div>
						<div>
							<h3 className="font-medium text-gray-900">
								Exit Clearance Not Started
							</h3>
							<p className="text-sm text-gray-600">
								Start the exit clearance process to track offboarding tasks.
							</p>
						</div>
					</div>
					<Button
						onClick={handleStartExitClearance}
						disabled={startOffboardingMutation.isPending}
						className="bg-amber-600 hover:bg-amber-700 text-white">
						<PlayCircle className="w-4 h-4 mr-2" />
						{startOffboardingMutation.isPending
							? "Starting..."
							: "Start Exit Clearance"}
					</Button>
				</div>
			</div>
		);
	}

	// If no process and not HR, show nothing or minimal message
	if (!boardingProcess) {
		if (isEmployeeView && requestStatus === "PROCESSING") {
			return (
				<div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
					<div className="flex items-center gap-3">
						<Clock className="w-5 h-5 text-blue-600" />
						<div>
							<p className="font-medium text-gray-900">Exit Clearance Pending</p>
							<p className="text-sm text-gray-600">
								HR will start the exit clearance process soon.
							</p>
						</div>
					</div>
				</div>
			);
		}
		return null;
	}

	// Show exit clearance checklist section
	return (
		<div className="border rounded-lg overflow-hidden">
			{/* Header with progress */}
			<div
				className="p-4 bg-gray-50 border-b cursor-pointer flex items-center justify-between"
				onClick={() => setIsExpanded(!isExpanded)}>
				<div className="flex items-center gap-4">
					<div className="w-10 h-10 rounded-full bg-white border flex items-center justify-center">
						<FileText className="w-5 h-5 text-gray-600" />
					</div>
					<div>
						<h3 className="font-semibold text-gray-900">Exit Clearance Checklist</h3>
						<p className="text-sm text-gray-500">
							{completedCount} of {totalCount} tasks completed
						</p>
					</div>
				</div>
				<div className="flex items-center gap-4">
					<div className="w-32">
						<Progress value={completionPercentage} className="h-2" />
					</div>
					<Badge variant={allCompleted ? "success" : "default"}>
						{completionPercentage}%
					</Badge>
					{isExpanded ? (
						<ChevronUp className="w-5 h-5 text-gray-400" />
					) : (
						<ChevronDown className="w-5 h-5 text-gray-400" />
					)}
				</div>
			</div>

			{/* Checklist items grouped by category */}
			{isExpanded && (
				<div className="p-4 space-y-4">
					{Object.entries(groupedItems).map(([category, items]) => (
						<div key={category} className="space-y-2">
							<h4 className="text-sm font-medium text-gray-700 uppercase tracking-wide">
								{categoryLabels[category] || category}
							</h4>
							<div className="space-y-2">
								{items.map((item) => {
									const statusInfo =
										statusStyles[item.status] || statusStyles.PENDING;
									const StatusIcon = statusInfo.icon;
									const canToggle = isHRView || isManagerView;

									return (
										<div
											key={item.id}
											className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
												item.status === "COMPLETED"
													? "bg-green-50 border-green-200"
													: "bg-white border-gray-200"
											}`}>
											{canToggle ? (
												<button
													onClick={() => handleToggleItem(item)}
													disabled={updateChecklistItemMutation.isPending}
													className="flex-shrink-0">
													<StatusIcon
														className={`w-5 h-5 ${statusInfo.color}`}
													/>
												</button>
											) : (
												<StatusIcon
													className={`w-5 h-5 ${statusInfo.color}`}
												/>
											)}
											<div className="flex-1">
												<p
													className={`font-medium ${
														item.status === "COMPLETED"
															? "text-gray-500 line-through"
															: "text-gray-900"
													}`}>
													{item.title}
												</p>
												{item.description && (
													<p className="text-sm text-gray-500">
														{item.description}
													</p>
												)}
											</div>
											{item.dueDate && (
												<span className="text-xs text-gray-500">
													Due:{" "}
													{new Date(item.dueDate).toLocaleDateString(
														"en-US",
														{
															month: "short",
															day: "numeric",
														},
													)}
												</span>
											)}
										</div>
									);
								})}
							</div>
						</div>
					))}

					{/* Generate COE button when all complete */}
					{allCompleted && isHRView && (
						<div className="pt-4 border-t">
							<div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
								<div className="flex items-center gap-3">
									<CheckCircle2 className="w-6 h-6 text-green-600" />
									<div>
										<p className="font-medium text-green-800">
											All clearances complete!
										</p>
										<p className="text-sm text-green-600">
											You can now generate the Certificate of Employment.
										</p>
									</div>
								</div>
								<Button className="bg-green-600 hover:bg-green-700 text-white">
									<FileText className="w-4 h-4 mr-2" />
									Generate COE
								</Button>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export default ExitClearanceSection;
