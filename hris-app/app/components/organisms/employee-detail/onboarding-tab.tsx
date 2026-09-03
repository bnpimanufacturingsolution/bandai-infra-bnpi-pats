import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { CheckCircle, Clock, ListTodo } from "lucide-react";
import { useBoardingProcessByEmployee } from "~/lib/hooks/useBoardingProcess";
import { useUpdateChecklistItem } from "~/lib/hooks/useChecklistItems";
import type { Employee } from "~/services/employees.service";
import {
	ChecklistStatus,
	type ChecklistCategory,
	type ChecklistItem,
} from "~/zod/checklist-item";
import { Skeleton } from "~/components/ui/skeleton";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { boardingProcessQueryKeys } from "~/lib/hooks/useBoardingProcess";
import {
	OnboardingTaskCard,
	categoryLabels,
	formatTaskDate,
} from "~/components/molecules/OnboardingTaskCard";

interface OnboardingTabProps {
	employee: Employee;
}

export function OnboardingTab({ employee }: OnboardingTabProps) {
	const queryClient = useQueryClient();
	const updateChecklistItem = useUpdateChecklistItem();

	// Fetch boarding process for this employee (both onboarding and offboarding)
	const { data: boardingProcess, isLoading } = useBoardingProcessByEmployee(
		employee.id,
		undefined, // Fetch any type (ONBOARDING or OFFBOARDING)
		true, // Include checklist items
	);

	const isOffboarding = boardingProcess?.type === "OFFBOARDING";
	const boardingTasks = useMemo(() => {
		return boardingProcess?.checklistItems || [];
	}, [boardingProcess]);

	// Group tasks by category
	const tasksByCategory = useMemo(() => {
		const grouped: Record<string, ChecklistItem[]> = {};
		boardingTasks.forEach((task) => {
			const category = task.category || "OTHER";
			if (!grouped[category]) {
				grouped[category] = [];
			}
			grouped[category].push(task);
		});
		// Sort tasks within each category by order
		Object.keys(grouped).forEach((key) => {
			grouped[key].sort((a, b) => a.order - b.order);
		});
		return grouped;
	}, [boardingTasks]);

	// Calculate progress
	const completedTasks = boardingTasks.filter((task) => task.status === "COMPLETED").length;
	const totalTasks = boardingTasks.length;
	const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

	// Get milestone tasks (first task of each category or tasks marked as milestones)
	const milestones = useMemo(() => {
		const categoryFirstTasks: ChecklistItem[] = [];
		const seenCategories = new Set<string>();

		// Get first completed task from each category as milestones
		boardingTasks
			.sort((a, b) => a.order - b.order)
			.forEach((task) => {
				if (!seenCategories.has(task.category)) {
					seenCategories.add(task.category);
					categoryFirstTasks.push(task);
				}
			});

		return categoryFirstTasks.slice(0, 5); // Show max 5 milestones
	}, [boardingTasks]);

	const defaultExpandedTaskId = useMemo(() => {
		const reviewPriorityTask = boardingTasks.find((task) => {
			const metadata =
				task.metadata && typeof task.metadata === "object" && !Array.isArray(task.metadata)
					? (task.metadata as Record<string, unknown>)
					: {};
			const reviewStatus = String(metadata.reviewStatus || "")
				.trim()
				.toUpperCase();
			return reviewStatus === "FOR_REVIEW" || reviewStatus === "REJECTED";
		});

		return reviewPriorityTask?.id || null;
	}, [boardingTasks]);

	// Handle task completion with comments and attachments
	const handleCompleteTask = (task: ChecklistItem, comment: string, file: File | null) => {
		// Prepare metadata update if file is attached
		let metadataUpdate = {};
		if (file) {
			const fileData = {
				name: file.name,
				size: file.size,
				type: file.type,
				url: URL.createObjectURL(file),
				uploadedAt: new Date().toISOString(),
			};

			const currentFiles = (task.metadata as any)?.files || [];
			metadataUpdate = {
				metadata: {
					...task.metadata,
					files: [...currentFiles, fileData],
				},
			};
		}

		updateChecklistItem.mutate(
			{
				id: task.id,
				payload: {
					status: ChecklistStatus.COMPLETED,
					completedDate: new Date(),
					comments: comment,
					...metadataUpdate,
				},
			},
			{
				onSuccess: () => {
					toast.success("Task marked as completed");
					queryClient.invalidateQueries({
						queryKey: boardingProcessQueryKeys.boardingProcesses.byEmployee(
							employee.id,
							undefined,
						),
					});
				},
				onError: (error: any) => {
					toast.error(error?.message || "Failed to update task");
				},
			},
		);
	};

	// Use formatTaskDate from the reusable component
	const formatDate = formatTaskDate;

	if (isLoading) {
		return (
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<Skeleton className="h-6 w-48" />
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							<Skeleton className="h-24 w-full" />
							<Skeleton className="h-12 w-full" />
							<Skeleton className="h-12 w-full" />
							<Skeleton className="h-12 w-full" />
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (!boardingProcess) {
		return (
			<div className="space-y-6">
				<Card>
					<CardContent className="py-12">
						<div className="text-center text-gray-500">
							<ListTodo className="w-12 h-12 mx-auto mb-4 text-gray-300" />
							<p className="text-lg font-medium">No Boarding Process</p>
							<p className="text-sm mt-1">
								This employee does not have an active onboarding or offboarding
								process.
							</p>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	const themeColor = isOffboarding ? "red" : "orange";

	return (
		<div className="space-y-6">
			{/* Header Card with Progress Stepper */}
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle className="flex items-center gap-2">
							<ListTodo className={`w-5 h-5 text-${themeColor}-500`} />
							<span className={isOffboarding ? "text-red-700" : ""}>
								{isOffboarding ? "Exit Clearance" : "Onboarding"}
							</span>
							<span
								className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
									isOffboarding
										? "bg-red-100 text-red-600"
										: "bg-orange-100 text-orange-600"
								}`}>
								{completedTasks}/{totalTasks}
							</span>
						</CardTitle>
						<div className="flex items-center gap-2">
							<span className="text-sm text-gray-500">
								Started: {formatDate(boardingProcess.startDate)}
							</span>
							{boardingProcess.targetDate && (
								<span className="text-sm text-gray-500">
									• Target: {formatDate(boardingProcess.targetDate)}
								</span>
							)}
						</div>
					</div>
				</CardHeader>
				<CardContent>
					{/* Progress Stepper */}
					<div className="relative overflow-x-auto pb-4 custom-scrollbar">
						<div className="flex items-start justify-between min-w-max px-4 gap-8">
							{milestones.map((milestone, index) => (
								<div
									key={milestone.id}
									className="flex flex-col items-center flex-1 relative min-w-[120px]">
									{/* Connecting Line */}
									{index < milestones.length - 1 && (
										<div
											className="absolute top-6 left-[50%] w-full h-0.5 z-0"
											style={{
												background:
													milestone.status === "COMPLETED"
														? isOffboarding
															? "#ef4444"
															: "#f97316"
														: "#d1d5db",
											}}
										/>
									)}

									{/* Step Circle */}
									<div className="relative z-10 mb-2">
										<div
											className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all ${
												milestone.status === "COMPLETED"
													? isOffboarding
														? "bg-red-500 border-red-500"
														: "bg-orange-500 border-orange-500"
													: milestone.status === "IN_PROGRESS"
														? isOffboarding
															? "bg-white border-red-500"
															: "bg-white border-orange-500"
														: "bg-gray-200 border-gray-300"
											}`}>
											{milestone.status === "COMPLETED" ? (
												<CheckCircle className="w-6 h-6 text-white" />
											) : milestone.status === "IN_PROGRESS" ? (
												<Clock
													className={`w-6 h-6 ${isOffboarding ? "text-red-500" : "text-orange-500"}`}
												/>
											) : (
												<div className="w-3 h-3 rounded-full bg-gray-400" />
											)}
										</div>
									</div>

									{/* Step Info */}
									<div className="text-center">
										<p
											className={`text-xs font-medium mb-1 whitespace-normal max-w-[140px] ${
												milestone.status === "COMPLETED"
													? "text-gray-900"
													: "text-gray-600"
											}`}>
											{categoryLabels[
												milestone.category as ChecklistCategory
											] || milestone.category}
										</p>
										<p className="text-xs text-gray-500">
											{milestone.status === "COMPLETED" &&
											milestone.completedDate
												? formatDate(milestone.completedDate)
												: formatDate(milestone.dueDate)}
										</p>
									</div>
								</div>
							))}

							{/* Final Step - Completion */}
							<div className="flex flex-col items-center flex-1 relative min-w-[120px]">
								<div className="relative z-10 mb-2">
									<div
										className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all ${
											boardingProcess.status === "COMPLETED"
												? isOffboarding
													? "bg-red-500 border-red-500"
													: "bg-orange-500 border-orange-500"
												: "bg-gray-200 border-gray-300"
										}`}>
										{boardingProcess.status === "COMPLETED" ? (
											<CheckCircle className="w-6 h-6 text-white" />
										) : (
											<div className="w-3 h-3 rounded-full bg-gray-400" />
										)}
									</div>
								</div>
								<div className="text-center">
									<p
										className={`text-xs font-medium mb-1 ${
											boardingProcess.status === "COMPLETED"
												? "text-gray-900"
												: "text-gray-600"
										}`}>
										{isOffboarding ? "Exit Complete" : "Onboarding Complete"}
									</p>
									{boardingProcess.actualCompleteDate && (
										<p className="text-xs text-gray-500">
											{formatDate(boardingProcess.actualCompleteDate)}
										</p>
									)}
								</div>
							</div>
						</div>
					</div>

					{/* Progress Bar */}
					<div className="mt-4 pt-4 border-t border-gray-100">
						<div className="flex items-center justify-between mb-2">
							<span className="text-sm text-gray-600">Overall Progress</span>
							<span className={`text-sm font-semibold text-${themeColor}-600`}>
								{progressPercentage}%
							</span>
						</div>
						<div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
							<div
								className={`h-2 rounded-full transition-all duration-500 ${
									isOffboarding
										? "bg-gradient-to-r from-red-500 to-red-600"
										: "bg-gradient-to-r from-orange-500 to-orange-600"
								}`}
								style={{ width: `${progressPercentage}%` }}
							/>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Onboarding Tasks Card - Using the reusable component */}
			<OnboardingTaskCard
				title={isOffboarding ? "Exit Clearance Tasks" : "Onboarding Tasks"}
				tasksByCategory={tasksByCategory}
				isOffboarding={isOffboarding}
				onCompleteTask={handleCompleteTask}
				isUpdating={updateChecklistItem.isPending}
				employeeId={employee.id}
				employeeDocuments={(employee.documents || []) as Array<Record<string, any>>}
				defaultExpandedTaskId={defaultExpandedTaskId}
			/>
		</div>
	);
}
