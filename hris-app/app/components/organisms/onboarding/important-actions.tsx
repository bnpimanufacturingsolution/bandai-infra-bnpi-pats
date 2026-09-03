import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	ArrowRight,
	CheckCircle2,
	ChevronLeft,
	ClipboardCheck,
	FileText,
	Loader2,
} from "lucide-react";
import { ScrollArea } from "~/components/ui/scroll-area";
import { EmployeeDocumentActionModal } from "~/components/organisms/employee-detail/employee-document-action-modal";
import { useAuth } from "~/lib/hooks/use-auth";
import { useEmployee } from "~/lib/hooks/useEmployees";
import { useDocumentActionMetrics } from "~/lib/hooks/useMetrics";
import type {
	EmployeeDocumentPayload,
	EmployeeDocumentPriorityItem,
	EmployeeDocumentPriorityState,
} from "~/services/employees.service";
import { ChecklistStatus, type ChecklistItem } from "~/zod/checklist-item";

interface ImportantActionsProps {
	onComplete: () => void;
	onBack: () => void;
	checklistItems?: ChecklistItem[];
	isLoading?: boolean;
}

const normalizeDocumentKey = (value: unknown) =>
	String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "");

const getDocumentIdentityKey = (documentTypeId?: string | null, documentCode?: string | null) => {
	const normalizedTypeId = String(documentTypeId || "").trim();
	if (normalizedTypeId) return `type:${normalizedTypeId}`;
	const normalizedCode = normalizeDocumentKey(documentCode);
	return normalizedCode ? `code:${normalizedCode}` : "";
};

const isSystemGeneratedDocumentChecklistItem = (metadata: unknown) => {
	const record =
		metadata && typeof metadata === "object" && !Array.isArray(metadata)
			? (metadata as Record<string, unknown>)
			: null;
	if (!record || record.isSystemGenerated !== true) return false;
	return Boolean(
		getDocumentIdentityKey(
			String(record.documentTypeId || "").trim(),
			String(record.documentCode || record.documentType || "").trim(),
		),
	);
};

const formatDateLabel = (value?: Date | string | null) => {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
};

const getDocumentActionText = (item: EmployeeDocumentPriorityItem) => {
	if (item.priorityState === "pending_approval") return "View Submission";
	if (item.priorityState === "rejected") return "Correct & Resubmit";
	if (item.priorityState === "needs_update" || item.priorityState === "expired") {
		return "Update & Resubmit";
	}
	if (!item.isVirtual && item.actionLabel === "Fill up") return "Fill Up & Submit";
	return "Submit to HR";
};

const DOCUMENT_PRIORITY_SORT_ORDER: Record<EmployeeDocumentPriorityState, number> = {
	missing_required: 0,
	needs_update: 1,
	rejected: 2,
	expired: 3,
	pending_approval: 4,
	ready: 5,
	optional: 6,
};

const getPrioritySortValue = (item: EmployeeDocumentPriorityItem) =>
	DOCUMENT_PRIORITY_SORT_ORDER[item.priorityState];

const matchesPriorityDocument = (
	document: EmployeeDocumentPayload,
	priorityItem: EmployeeDocumentPriorityItem,
) => {
	if (priorityItem.number && document.number && priorityItem.number === document.number)
		return true;
	if (
		priorityItem.documentTypeId &&
		document.documentTypeId &&
		priorityItem.documentTypeId === document.documentTypeId
	) {
		return true;
	}
	return normalizeDocumentKey(document.type) === normalizeDocumentKey(priorityItem.type);
};

export default function ImportantActions({
	onComplete,
	onBack,
	checklistItems = [],
	isLoading = false,
}: ImportantActionsProps) {
	const { user } = useAuth();
	const employeeId = user?.metadata?.employee?.id || "";
	const [activeDocumentItem, setActiveDocumentItem] =
		useState<EmployeeDocumentPriorityItem | null>(null);
	const hasAutoCompletedRef = useRef(false);

	const { data: employee } = useEmployee(employeeId, "documents,organizationId,person");
	const { data: documentActionMetrics, isLoading: isLoadingPriorities } =
		useDocumentActionMetrics(employeeId, {
			enabled: !!employeeId,
		});
	const hasDocumentMetrics = Boolean(documentActionMetrics);

	const checklistDocumentItemsByIdentity = useMemo(() => {
		const map = new Map<string, ChecklistItem>();
		for (const item of checklistItems) {
			if (!isSystemGeneratedDocumentChecklistItem(item.metadata)) continue;

			const metadata = item.metadata as Record<string, unknown>;
			const uploadBy = String(metadata?.uploadBy || "")
				.trim()
				.toUpperCase();
			if (uploadBy !== "EMPLOYEE" && uploadBy !== "BOTH") continue;

			const key = getDocumentIdentityKey(
				String(metadata?.documentTypeId || "").trim(),
				String(metadata?.documentCode || metadata?.documentType || "").trim(),
			);
			if (!key || map.has(key)) continue;
			map.set(key, item);
		}
		return map;
	}, [checklistItems]);

	const actionableDocuments = useMemo(
		() => {
			const mergedItems = new Map<string, EmployeeDocumentPriorityItem>();

			for (const item of documentActionMetrics?.onboardingItems || []) {
				mergedItems.set(item.key, item);
			}

			for (const item of documentActionMetrics?.items || []) {
				const identityKey = getDocumentIdentityKey(item.documentTypeId, item.type);
				const belongsToChecklist =
					Boolean(identityKey) && checklistDocumentItemsByIdentity.has(identityKey);
				const shouldSurfaceInOnboarding =
					item.requiredForOnboarding ||
					belongsToChecklist ||
					item.priorityState === "pending_approval";

				if (!shouldSurfaceInOnboarding) continue;
				if (!mergedItems.has(item.key)) {
					mergedItems.set(item.key, item);
				}
			}

			return Array.from(mergedItems.values()).sort((left, right) => {
				const priorityDiff = getPrioritySortValue(left) - getPrioritySortValue(right);
				if (priorityDiff !== 0) return priorityDiff;
				return left.displayName.localeCompare(right.displayName);
			});
		},
		[
			checklistDocumentItemsByIdentity,
			documentActionMetrics?.items,
			documentActionMetrics?.onboardingItems,
		],
	);

	const nonDocumentChecklistItems = useMemo(
		() =>
			checklistItems.filter((item) => !isSystemGeneratedDocumentChecklistItem(item.metadata)),
		[checklistItems],
	);

	const completedCount = useMemo(
		() =>
			nonDocumentChecklistItems.filter((item) => item.status === ChecklistStatus.COMPLETED)
				.length,
		[nonDocumentChecklistItems],
	);
	const incompleteChecklistCount = useMemo(
		() =>
			nonDocumentChecklistItems.filter((item) => item.status !== ChecklistStatus.COMPLETED)
				.length,
		[nonDocumentChecklistItems],
	);
	const totalTasks = actionableDocuments.length + nonDocumentChecklistItems.length;
	const progressPercentage = totalTasks > 0 ? (completedCount / totalTasks) * 100 : 0;
	const remainingTaskCount = actionableDocuments.length + incompleteChecklistCount;

	useEffect(() => {
		if (
			hasAutoCompletedRef.current ||
			isLoading ||
			isLoadingPriorities ||
			!hasDocumentMetrics ||
			remainingTaskCount > 0
		) {
			return;
		}

		hasAutoCompletedRef.current = true;
		onComplete();
	}, [hasDocumentMetrics, isLoading, isLoadingPriorities, onComplete, remainingTaskCount]);

	const activeExistingDocument = useMemo(
		() =>
			activeDocumentItem
				? (employee?.documents || []).find((document) =>
						matchesPriorityDocument(document, activeDocumentItem),
					) || null
				: null,
		[activeDocumentItem, employee?.documents],
	);

	return (
		<div className="w-full max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700">
			<div className="mb-6 text-center md:text-left">
				<h2 className="text-2xl md:text-3xl font-extrabold mb-2">
					<span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-600">
						{remainingTaskCount === 0 && !isLoadingPriorities && hasDocumentMetrics
							? "Wrapping Things Up"
							: "First Week Checklist"}
					</span>
				</h2>
				<p className="text-sm text-gray-500 lead-relaxed">
					{remainingTaskCount === 0 && !isLoadingPriorities && hasDocumentMetrics
						? "Finalizing your onboarding experience..."
						: "Complete these important tasks to get fully set up"}
				</p>
			</div>

			<div className="p-6 rounded-2xl bg-gradient-to-br from-orange-50 to-red-50 border border-orange-100 shadow-sm mb-6 relative overflow-hidden">
				<div className="absolute top-0 right-0 p-4 opacity-5 transform rotate-12">
					<ClipboardCheck className="w-24 h-24" />
				</div>
				<div className="flex items-end justify-between mb-3 relative z-10">
					<div>
						<p className="text-[10px] font-bold text-orange-600 uppercase tracking-widest mb-1">
							Overall Progress
						</p>
						<p className="text-2xl font-bold text-gray-900">
							{completedCount}{" "}
							<span className="text-gray-400 text-lg font-medium">
								/ {totalTasks} tasks
							</span>
						</p>
					</div>
					<div className="text-right">
						<p className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-600">
							{Math.round(progressPercentage)}%
						</p>
					</div>
				</div>

				<div className="w-full h-3 bg-white/50 rounded-full overflow-hidden border border-orange-100 relative z-10">
					<div
						className="h-full bg-gradient-to-r from-orange-500 to-red-600 rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(249,115,22,0.4)]"
						style={{ width: `${progressPercentage}%` }}
					/>
				</div>
			</div>

			<ScrollArea className="h-[400px] mb-8 pr-4 -mr-4">
				<div className="space-y-3 pb-2">
					{isLoadingPriorities || !hasDocumentMetrics ? (
						<div className="rounded-xl border border-dashed border-orange-200 bg-white p-8 text-center text-sm text-gray-600">
							<div className="inline-flex items-center gap-2">
								<Loader2 className="h-4 w-4 animate-spin text-orange-500" />
								Loading your required actions...
							</div>
						</div>
					) : totalTasks === 0 ? (
						<div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center">
							<p className="text-sm font-medium text-gray-700">
								No onboarding tasks yet
							</p>
							<p className="mt-1 text-xs text-gray-500">
								Tasks will appear here once assigned from the backend.
							</p>
						</div>
					) : (
						<>
							{actionableDocuments.map((item) => {
								const identityKey = getDocumentIdentityKey(
									item.documentTypeId,
									item.type,
								);
								const linkedChecklistItem =
									checklistDocumentItemsByIdentity.get(identityKey);
								const dueDateLabel = formatDateLabel(linkedChecklistItem?.dueDate);
								const actionText = getDocumentActionText(item);
								const isPendingApproval =
									item.priorityState === "pending_approval";
								const cardTone = isPendingApproval
									? "border-sky-200 bg-sky-50/40"
									: "border-orange-100 bg-white";
								const iconTone = isPendingApproval
									? "bg-sky-100 text-sky-600"
									: "bg-orange-50 text-orange-500";
								const actionDescription = isPendingApproval
									? `Submitted and waiting for HR approval${item.displayName ? ` for ${item.displayName}` : ""}.`
									: item.priorityState === "rejected"
										? `HR returned ${item.displayName} for correction. Update the submission and send it back for approval.`
										: item.priorityState === "needs_update" ||
											  item.priorityState === "expired"
											? `${item.displayName} needs an updated submission before HR can approve it.`
											: item.actionDescription ||
												`${item.displayName} still needs to be submitted to HR for approval.`;

								return (
									<div
										key={item.key}
										className={`rounded-2xl border px-4 py-4 shadow-sm transition hover:shadow-md ${cardTone} ${isPendingApproval ? "hover:border-sky-300" : "hover:border-orange-200"}`}>
										<div className="flex items-start gap-3">
											<div
												className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${iconTone}`}>
												<FileText className="h-5 w-5" />
											</div>
											<div className="min-w-0 flex-1">
												<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
													<div className="min-w-0">
														<div className="flex flex-wrap items-center gap-2">
															<p className="text-sm font-semibold text-gray-900">
																{item.displayName}
															</p>
															{isPendingApproval ? (
																<span className="rounded-full border border-sky-200 bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-sky-700">
																	Waiting for HR Approval
																</span>
															) : null}
														</div>
														<p className="mt-1 text-sm leading-relaxed text-gray-600">
															{actionDescription}
														</p>
														{dueDateLabel ? (
															<p className="mt-2 text-xs font-medium text-gray-500">
																Due {dueDateLabel}
															</p>
														) : null}
													</div>
													<Button
														type="button"
														onClick={() => setActiveDocumentItem(item)}
														className={`h-9 rounded-full px-4 text-sm font-semibold text-white ${isPendingApproval ? "bg-sky-600 hover:bg-sky-700" : "bg-orange-500 hover:bg-orange-600"}`}>
														{actionText}
													</Button>
												</div>
											</div>
										</div>
									</div>
								);
							})}

							{nonDocumentChecklistItems.map((task) => {
								const isCompleted = task.status === ChecklistStatus.COMPLETED;
								const dueDateLabel = formatDateLabel(task.dueDate);

								return (
									<div
										key={task.id}
										className={`rounded-2xl border px-4 py-4 shadow-sm transition ${
											isCompleted
												? "border-gray-100 bg-gray-50/70"
												: "border-gray-200 bg-white"
										}`}>
										<div className="flex items-start gap-3">
											<div
												className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${
													isCompleted
														? "bg-green-50 text-green-600"
														: "bg-slate-50 text-slate-500"
												}`}>
												{isCompleted ? (
													<CheckCircle2 className="h-5 w-5" />
												) : (
													<ClipboardCheck className="h-5 w-5" />
												)}
											</div>
											<div className="min-w-0 flex-1">
												<p
													className={`text-sm font-semibold ${
														isCompleted
															? "text-gray-500 line-through"
															: "text-gray-900"
													}`}>
													{task.title}
												</p>
												<p
													className={`mt-1 text-sm leading-relaxed ${
														isCompleted
															? "text-gray-400"
															: "text-gray-600"
													}`}>
													{task.description ||
														"Complete this task during onboarding."}
												</p>
												{dueDateLabel ? (
													<p className="mt-2 text-xs font-medium text-gray-500">
														Due {dueDateLabel}
													</p>
												) : null}
											</div>
										</div>
									</div>
								);
							})}
						</>
					)}
				</div>
			</ScrollArea>

			{totalTasks > 0 && completedCount === totalTasks && (
				<div className="p-4 rounded-xl bg-green-50 border border-green-200 mb-6 animate-in zoom-in duration-500 mx-auto max-w-xl text-center">
					<div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
						<CheckCircle2 className="w-6 h-6" />
					</div>
					<div className="space-y-1">
						<p className="font-bold text-lg text-green-800">All Tasks Completed!</p>
						<p className="text-sm text-green-700">
							You&apos;re all set to get started with TalentHub. Welcome aboard!
						</p>
					</div>
				</div>
			)}

			<div className="flex gap-3 flex-col md:flex-row items-center mt-6">
				<Button
					onClick={onComplete}
					disabled={isLoading}
					className="hover:cursor-pointer w-full md:flex-1 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all rounded-full h-10 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
					{isLoading ? (
						<>
							<Loader2 className="w-4 h-4 animate-spin" />
							Completing...
						</>
					) : (
						<>
							Go to Dashboard <ArrowRight className="w-4 h-4 ml-1" />
						</>
					)}
				</Button>
				<Button
					onClick={onBack}
					variant="outline"
					className="hover:cursor-pointer w-full md:w-auto border-2 border-orange-100 text-orange-600 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-200 rounded-full h-10 font-semibold px-6 text-sm">
					Review Previous Steps
				</Button>

				<Button
					onClick={onBack}
					variant="ghost"
					className="md:hidden flex items-center justify-center gap-2 text-gray-500 text-sm">
					<ChevronLeft className="w-3.5 h-3.5" /> Back
				</Button>
			</div>

			{employeeId ? (
				<EmployeeDocumentActionModal
					employeeId={employeeId}
					open={Boolean(activeDocumentItem)}
					onOpenChange={(open) => {
						if (!open) setActiveDocumentItem(null);
					}}
					mode={activeExistingDocument ? "edit" : "add"}
					existingDocument={activeExistingDocument}
					initialDocumentType={
						activeDocumentItem?.documentTypeId || activeDocumentItem?.type || ""
					}
					lockDocumentType={true}
					priorityItem={activeDocumentItem}
				/>
			) : null}
		</div>
	);
}
