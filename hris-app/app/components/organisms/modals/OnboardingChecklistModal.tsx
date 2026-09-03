import { Modal } from "~/components/atoms/Modal";
import { OnboardingTaskCard } from "~/components/molecules/OnboardingTaskCard";
import { type ChecklistItem, ChecklistStatus } from "~/zod/checklist-item";
import { useMemo } from "react";
import { useEmployee } from "~/lib/hooks/useEmployees";
import { useUpdateChecklistItem } from "~/lib/hooks/useChecklistItems";

interface OnboardingChecklistModalProps {
	isOpen: boolean;
	onClose: () => void;
	employeeId: string;
}

export function OnboardingChecklistModal({
	isOpen,
	onClose,
	employeeId,
}: OnboardingChecklistModalProps) {
	// Fetch employee data with specific fields as requested
	const { data: employee, isLoading } = useEmployee(
		employeeId,
		"person.personalInfo.firstName,person.personalInfo.middleName,person.personalInfo.lastName,employeeId,role,employmentStatus,boardingProcesses.checklistItems",
	);

	const updateChecklistItem = useUpdateChecklistItem();

	const boardingProcess =
		employee?.boardingProcesses && employee.boardingProcesses.length > 0
			? employee.boardingProcesses[0]
			: null;

	const checklistItems: ChecklistItem[] = boardingProcess?.checklistItems || [];

	// Group tasks by category
	const tasksByCategory = useMemo(() => {
		const grouped: Record<string, ChecklistItem[]> = {};
		checklistItems.forEach((task) => {
			const category = task.category || "OTHER";
			if (!grouped[category]) {
				grouped[category] = [];
			}
			grouped[category].push(task);
		});
		// Sort tasks within each category
		Object.keys(grouped).forEach((key) => {
			grouped[key].sort((a, b) => a.order - b.order);
		});
		return grouped;
	}, [checklistItems]);

	const completedTasks = checklistItems.filter(
		(task) =>
			task.status === "COMPLETED" || (task.metadata as any)?.reviewStatus === "FOR_REVIEW",
	).length;
	const totalTasks = checklistItems.length;
	const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

	const isOffboarding = employee?.employmentStatus === "OFFBOARDING";

	const handleApproveTask = (task: ChecklistItem) => {
		// Prepare metadata update
		const currentMetadata = (task.metadata as any) || {};
		const updatedMetadata = { ...currentMetadata, reviewStatus: "APPROVED" };

		updateChecklistItem.mutate({
			id: task.id,
			payload: {
				status: ChecklistStatus.COMPLETED,
				metadata: updatedMetadata,
			},
		});
	};

	return (
		<Modal
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			title="Employee Onboarding Checklist"
			description="Review employee onboarding progress and submissions"
			className="max-w-4xl">
			{isLoading ? (
				<div className="flex items-center justify-center py-12">
					<div className="text-gray-500">Loading checklist details...</div>
				</div>
			) : !boardingProcess ? (
				<div className="flex items-center justify-center py-12">
					<div className="text-gray-500">
						No onboarding process found for this employee.
					</div>
				</div>
			) : (
				<div className="mt-4 space-y-6">
					{/* Progress Overview - Reused logic from Dashboard */}
					<div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
						<div className="flex items-center justify-between mb-2">
							<span className="text-sm font-medium text-gray-700">
								Overall Progress
							</span>
							<span className="text-lg font-bold text-orange-600">
								{progressPercentage}%
							</span>
						</div>
						<div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
							<div
								className={`h-2 rounded-full transition-all duration-500 ${isOffboarding ? "bg-gradient-to-r from-red-500 to-red-600" : "bg-gradient-to-r from-orange-500 to-orange-600"}`}
								style={{ width: `${progressPercentage}%` }}
							/>
						</div>
						<p className="text-xs text-gray-600 mt-1">
							{completedTasks} of {totalTasks} tasks submitted
						</p>
					</div>

					{/* Task List */}
					<OnboardingTaskCard
						title={isOffboarding ? "Exit Clearance Tasks" : "Onboarding Tasks"}
						tasksByCategory={tasksByCategory}
						isOffboarding={isOffboarding}
						readonly={true}
						onApprove={handleApproveTask}
						isUpdating={updateChecklistItem.isPending}
					/>
				</div>
			)}
		</Modal>
	);
}
