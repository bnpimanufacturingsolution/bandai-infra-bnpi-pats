import { Dialog, DialogContent } from "~/components/ui/dialog";
import { useBoardingProcess } from "~/lib/hooks/useBoardingProcess";
import { Briefcase } from "lucide-react";
import { useMemo } from "react";
import type { ChecklistItem } from "~/zod/checklist-item";
import { OnboardingTaskCard } from "~/components/molecules/OnboardingTaskCard";
import { useUpdateChecklistItem } from "~/lib/hooks/useChecklistItems";
import { ChecklistStatus } from "~/zod/checklist-item";
import type { Position } from "~/zod/position.zod";
import type { Department } from "~/zod/department.zod";
import type { Person } from "~/zod/person.zod";
import type { Employee } from "~/zod/employee.zod";

interface TaskDetailModalProps {
	processId: string | null;
	category?: string;
	onClose: () => void;
}

export function TaskDetailModal({ processId, category, onClose }: TaskDetailModalProps) {
	const fields =
		"checklistItems,type,status,startDate,targetDate,actualCompleteDate,exitReason,metadata,lastViewedAt,completionPercentage,employee.employeeId,employee.role,employee.employmentHireDate,employee.employmentStartDate,employee.employmentTerminationDate,employee.employmentStatus,employee.employmentType,employee.probationEndDate,employee.person,employee.position,employee.department,employee.id,employee.documents";

	const { data: process, isLoading } = useBoardingProcess(processId || "", {
		fields,
		includeChecklistItems: true,
		category,
	});

	const updateChecklistItem = useUpdateChecklistItem();

	type EmployeeWithRelations = Employee & {
		person?: Person;
		position?: Position;
		department?: Department;
	};

	const employee = process?.employee as EmployeeWithRelations | undefined;
	const person = employee?.person;
	const personalInfo = person?.personalInfo;
	const checklistItems = process?.checklistItems || [];

	const getInitials = () => {
		const first = personalInfo?.firstName?.charAt(0) || "";
		const last = personalInfo?.lastName?.charAt(0) || "";
		return (first + last).toUpperCase() || "??";
	};

	const getFullName = () => {
		if (!personalInfo) return "Unknown Employee";
		return `${personalInfo.firstName} ${personalInfo.lastName}`;
	};

	const tasksByCategory = useMemo(() => {
		const grouped: Record<string, ChecklistItem[]> = {};
		checklistItems.forEach((task) => {
			const category = task.category || "OTHER";
			if (!grouped[category]) {
				grouped[category] = [];
			}
			grouped[category].push(task);
		});

		Object.keys(grouped).forEach((key) => {
			grouped[key].sort((a, b) => a.order - b.order);
		});
		return grouped;
	}, [checklistItems]);

	const defaultExpandedTaskId = useMemo(() => {
		const reviewPriority = checklistItems.find((task) => {
			const metadata =
				task.metadata && typeof task.metadata === "object" && !Array.isArray(task.metadata)
					? (task.metadata as Record<string, unknown>)
					: {};
			const reviewStatus = String(metadata.reviewStatus || "")
				.trim()
				.toUpperCase();
			return reviewStatus === "FOR_REVIEW" || reviewStatus === "REJECTED";
		});

		if (reviewPriority?.id) return reviewPriority.id;

		const firstPendingTask = checklistItems.find((task) => {
			if (task.status === "COMPLETED") return false;
			if (task.category !== "COMPLIANCE") return true;

			const metadata =
				task.metadata && typeof task.metadata === "object" && !Array.isArray(task.metadata)
					? (task.metadata as Record<string, unknown>)
					: {};
			const reviewStatus = String(metadata.reviewStatus || "")
				.trim()
				.toUpperCase();

			return reviewStatus === "FOR_REVIEW" || reviewStatus === "REJECTED";
		});
		return firstPendingTask?.id || checklistItems[0]?.id || null;
	}, [checklistItems]);

	const trueCompleted = checklistItems.filter((t) => t.status === "COMPLETED").length;
	const totalTasks = checklistItems.length;
	const progressPercentage = totalTasks > 0 ? Math.round((trueCompleted / totalTasks) * 100) : 0;
	const isOffboarding = process?.type === "OFFBOARDING";

	const handleApproveTask = (task: ChecklistItem, verificationData?: any) => {
		const currentMetadata = (task.metadata as any) || {};
		const updatedMetadata = {
			...currentMetadata,
			reviewStatus: "APPROVED",
			...(verificationData || {}),
		};

		updateChecklistItem.mutate({
			id: task.id,
			payload: {
				status: ChecklistStatus.COMPLETED,
				metadata: updatedMetadata,
			},
		});
	};

	return (
		<Dialog open={!!processId} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="w-full sm:max-w-4xl h-[90vh] flex flex-col p-0 gap-0 overflow-hidden ">
				<div className="bg-white px-8 py-8 border-b border-gray-100 flex flex-col md:flex-row items-center md:items-start justify-between gap-6 relative">
					{isLoading ? (
						<div className="animate-pulse flex items-center gap-6 w-full">
							<div className="w-20 h-20 bg-gray-200 rounded-full"></div>
							<div className="space-y-3 flex-1">
								<div className="h-6 w-1/3 bg-gray-200 rounded"></div>
								<div className="h-4 w-1/4 bg-gray-200 rounded"></div>
							</div>
						</div>
					) : (
						<>
							<div className="flex items-center gap-6 flex-1">
								{/* Avatar */}
								<div className="relative">
									<div className="w-[72px] h-[72px] rounded-full bg-orange-500 flex items-center justify-center text-white text-2xl font-bold border-2 border-white shadow-sm">
										{getInitials()}
									</div>
									<div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 whitespace-nowrap"></div>
								</div>

								<div className="text-left pt-1">
									<h2 className="text-xl font-bold text-gray-900 leading-tight mb-1.5">
										{getFullName()}
									</h2>
									<div className="flex items-center gap-3 text-sm text-gray-500">
										<span className="flex items-center gap-1.5 font-semibold text-gray-600 bg-gray-100 px-2.5 py-1 rounded text-xs">
											<Briefcase className="w-3.5 h-3.5 text-gray-500" />
											{employee?.position?.title || "Employee"}
										</span>
										<span className="text-gray-300">|</span>
										<span className="text-gray-500">
											{employee?.department?.name || "No Department"}
										</span>
									</div>
								</div>
							</div>

							{/* Right Column: Meta Stats */}
							<div className="flex items-center gap-8 pr-4">
								{/* Employee ID Block */}
								<div className="flex flex-col items-end gap-1">
									<span className="text-[10px] text-gray-400 font-bold">
										Employee ID
									</span>
									<span className="text-sm font-bold text-gray-900 font-mono tracking-tight">
										{employee?.employeeId}
									</span>
								</div>

								{/* Divider */}
								<div className="h-8 w-px bg-gray-100 hidden md:block"></div>

								{/* Type Block */}
								<div className="flex flex-col items-end gap-1">
									<span className="text-[10px] text-gray-400 font-bold">
										Process Type
									</span>
									<span
										className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
											isOffboarding
												? "bg-red-50 text-red-600 border-red-100"
												: "bg-blue-50 text-blue-600 border-blue-100"
										}`}>
										{isOffboarding ? "Offboarding" : "Onboarding"}
									</span>
								</div>
							</div>
						</>
					)}
				</div>

				<div className="flex-1 overflow-y-auto  [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-300 transition-colors">
					<div className="w-full max-w-none px-8 py-6 pb-20 space-y-6">
						{!isLoading && (
							<div className="p-5 bg-white rounded-xl border border-gray-100 shadow-sm">
								<div className="flex items-center justify-between mb-3">
									<h3 className="text-sm font-semibold text-gray-700">
										Overall Progress
									</h3>
									<span className="text-lg font-bold text-orange-600">
										{progressPercentage}%
									</span>
								</div>
								<div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
									<div
										className="bg-orange-500 h-full rounded-full transition-all duration-700 ease-out"
										style={{ width: `${progressPercentage}%` }}></div>
								</div>
								<p className="text-xs text-gray-500 mt-2 font-medium">
									{trueCompleted} of {totalTasks} tasks completed
								</p>
							</div>
						)}

						{/* Task List Component */}
						<div className="">
							<h3 className="font-bold text-lg text-gray-900 mb-4">
								{category
									? `${category.charAt(0).toUpperCase() + category.slice(1).toLowerCase().replace(/_/g, " ")} Tasks`
									: isOffboarding
										? "Offboarding Tasks"
										: "Onboarding Tasks"}
							</h3>
							{isLoading ? (
								<div className="p-8 text-center text-gray-500">
									Loading tasks...
								</div>
							) : (
								<OnboardingTaskCard
									tasksByCategory={tasksByCategory}
									isOffboarding={isOffboarding}
									readonly={true} // HR Review Mode
									onApprove={handleApproveTask}
									isUpdating={updateChecklistItem.isPending}
									employeeId={employee?.id}
									employeeDocuments={(employee as any)?.documents || []}
									defaultExpandedTaskId={defaultExpandedTaskId}
								/>
							)}
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
