import { useEffect, useState, type ReactNode } from "react";
import { Briefcase, CircleAlert, Loader2 } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { useLevels } from "~/lib/hooks/useLevels";
import { usePositions } from "~/lib/hooks/usePositions";
import { useWorkforceRecruitmentRequestContext } from "~/lib/hooks/useWorkforceRecruitmentSettings";

interface JobRequisitionRequestModalProps {
	isOpen: boolean;
	onClose: () => void;
	departmentId: string;
	departmentName: string;
	isPending?: boolean;
	onSubmit: (payload: {
		positionId: string;
		sectionId?: string | null;
		levelId?: string | null;
		requestedHeadcount: number;
		justification: string;
		jobType?: string;
		jobLocation?: string;
		jobTags?: string[];
		jobDescription?: string;
		workflowCode?: string;
		description: string;
	}) => Promise<void> | void;
}

const DEFAULT_REQUESTED_HEADCOUNT = "1";

const FieldLabel = ({
	children,
	htmlFor,
}: {
	children: ReactNode;
	htmlFor?: string;
}) => (
	<label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wide text-gray-500">
		{children}
	</label>
);

const HeadcountStat = ({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) => (
	<div className="min-h-[76px] rounded-md border border-gray-200 bg-white px-3 py-2.5">
		<p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
		<div className="mt-2 text-xl font-semibold leading-none text-gray-950">{children}</div>
	</div>
);

const normalizeTags = (value: string) =>
	value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);

const formatPolicyTags = (value?: string[] | null) => (Array.isArray(value) ? value.join(", ") : "");

type JobRequisitionFormErrors = Partial<
	Record<"positionId" | "levelId" | "requestedHeadcount" | "justification" | "policy", string>
>;

export function JobRequisitionRequestModal({
	isOpen,
	onClose,
	departmentId,
	departmentName,
	isPending = false,
	onSubmit,
}: JobRequisitionRequestModalProps) {
	const [positionId, setPositionId] = useState("");
	const [levelId, setLevelId] = useState("");
	const [requestedHeadcount, setRequestedHeadcount] = useState(DEFAULT_REQUESTED_HEADCOUNT);
	const [justification, setJustification] = useState("");
	const [jobType, setJobType] = useState("");
	const [jobLocation, setJobLocation] = useState("");
	const [jobTags, setJobTags] = useState("");
	const [jobDescription, setJobDescription] = useState("");
	const [errors, setErrors] = useState<JobRequisitionFormErrors>({});
	const [submitAttempted, setSubmitAttempted] = useState(false);

	const { data: positionsData, isLoading: isLoadingPositions } = usePositions({
		page: 1,
		limit: 1000,
	});
	const { data: levelsData, isLoading: isLoadingLevels } = useLevels({
		page: 1,
		limit: 1000,
	});
	const positions = ((positionsData as any)?.positions || (positionsData as any)?.data?.positions || []).filter(
		(position: any) =>
			!position.section?.departmentId || position.section.departmentId === departmentId,
	);
	const levels = (levelsData as any)?.levels || (levelsData as any)?.data?.levels || [];
	const selectedPosition = positions.find((position: any) => position.id === positionId) || null;
	const selectedSectionId =
		String(selectedPosition?.section?.id || selectedPosition?.sectionId || "").trim() || null;
	const selectedLevel = levels.find((level: any) => level.id === levelId) || null;
	const selectedPositionLevelIds = new Set(
		Array.isArray(selectedPosition?.levels)
			? selectedPosition.levels.map((entry: any) =>
					String(entry?.level?.id || entry?.levelId || entry?.id || ""),
				)
			: [],
	);
	const availableLevels = selectedPosition
		? selectedPositionLevelIds.size
			? levels.filter((level: any) => selectedPositionLevelIds.has(String(level.id)))
			: []
		: [];
	const requiresLevel = availableLevels.length > 0;
	const requestContextQuery = useWorkforceRecruitmentRequestContext(
		{
			departmentId: departmentId || undefined,
			sectionId: selectedSectionId || undefined,
			positionId: positionId || undefined,
			levelId: requiresLevel ? levelId || undefined : undefined,
		},
		{ enabled: isOpen },
	);
	const requestContext = requestContextQuery.data;
	const requestQuantity = Math.max(1, Math.floor(Number(requestedHeadcount || 1)));
	const effectiveDescription = [
		`${requestQuantity} headcount`,
		requiresLevel ? selectedLevel?.name || null : null,
		selectedPosition?.title || null,
		selectedPosition?.section?.name ? `in ${selectedPosition.section.name}` : null,
		departmentName ? `for ${departmentName}` : null,
	]
		.filter(Boolean)
		.join(" ");
	const canSubmit = requestContext?.permissions?.canSubmit !== false;
	const selectedPolicy = requestContext?.policy;
	const currentHeadcount =
		requestContext?.headcount.currentHeadcount ?? selectedPolicy?.currentHeadcount ?? 0;
	const isBlockingPolicy = selectedPolicy?.limitBehavior !== "WARN";
	const policyBehaviorLabel = isBlockingPolicy ? "Block" : "Warn";
	const hasTargetHeadcount = Number(selectedPolicy?.targetHeadcount || 0) > 0;
	const availableHeadcount =
		hasTargetHeadcount && selectedPolicy
			? Math.max(0, Number(selectedPolicy.targetHeadcount || 0) - currentHeadcount)
			: requestContext?.headcount.availableHeadcount ?? null;
	const isOverCapacity =
		typeof availableHeadcount === "number" &&
		Number.isFinite(requestQuantity) &&
		requestQuantity > availableHeadcount;
	const projectedRemainingHeadcount =
		hasTargetHeadcount && typeof availableHeadcount === "number"
			? Math.max(0, availableHeadcount - requestQuantity)
			: null;

	const resetForm = () => {
		setPositionId("");
		setLevelId("");
		setRequestedHeadcount(DEFAULT_REQUESTED_HEADCOUNT);
		setJustification("");
		setJobType("");
		setJobLocation("");
		setJobTags("");
		setJobDescription("");
		setErrors({});
		setSubmitAttempted(false);
	};

	useEffect(() => {
		if (!isOpen) return;
		const requesterPositionId = requestContext?.requester?.positionId || "";
		if (!positionId && requesterPositionId && positions.some((position: any) => position.id === requesterPositionId)) {
			setPositionId(requesterPositionId);
		}
	}, [
		isOpen,
		positionId,
		positions,
		requestContext?.requester?.positionId,
	]);

	useEffect(() => {
		if (!isOpen) return;
		if (levelId) return;
		const requesterLevelId = requestContext?.requester?.levelId || "";
		if (requesterLevelId && availableLevels.some((level: any) => level.id === requesterLevelId)) {
			setLevelId(requesterLevelId);
		}
	}, [availableLevels, isOpen, levelId, requestContext?.requester?.levelId]);

	useEffect(() => {
		if (!levelId) return;
		if (!requiresLevel || !availableLevels.some((level: any) => level.id === levelId)) {
			setLevelId("");
		}
	}, [availableLevels, levelId, requiresLevel]);

	useEffect(() => {
		if (!isOpen) return;
		setJobType(String(selectedPolicy?.jobType || "").trim());
		setJobLocation(String(selectedPolicy?.jobLocation || "").trim());
		setJobTags(formatPolicyTags(selectedPolicy?.jobTags));
		setJobDescription(String(selectedPolicy?.jobDescriptionTemplate || "").trim());
	}, [isOpen, selectedPolicy?.id]);

	const validateForm = (): JobRequisitionFormErrors => {
		const nextErrors: JobRequisitionFormErrors = {};
		const requested = Number(requestedHeadcount || 0);

		if (!positionId) nextErrors.positionId = "Select the position for this requisition.";
		if (requiresLevel && !levelId) nextErrors.levelId = "Select the level for this requisition.";
		if (!Number.isFinite(requested) || requested <= 0) {
			nextErrors.requestedHeadcount = "Enter a headcount greater than 0.";
		}
		if (!justification.trim()) {
			nextErrors.justification = "Add a short reason for the requisition.";
		}
		if (!canSubmit) {
			nextErrors.policy = requestContext?.permissions?.reason || "Requisition cannot be submitted.";
		} else if (!selectedPolicy) {
			nextErrors.policy = "No matching HR policy for this position.";
		} else if (!hasTargetHeadcount) {
			nextErrors.policy = "Set the target headcount in HR recruitment settings first.";
		} else if (
			typeof availableHeadcount === "number" &&
			Number.isFinite(requested) &&
			requested > availableHeadcount &&
			isBlockingPolicy
		) {
			nextErrors.requestedHeadcount = `Only ${availableHeadcount} headcount ${
				availableHeadcount === 1 ? "slot is" : "slots are"
			} available for this policy.`;
		}

		return nextErrors;
	};

	const handleClose = () => {
		if (isPending) return;
		resetForm();
		onClose();
	};

	const handleSubmit = async () => {
		setSubmitAttempted(true);
		const nextErrors = validateForm();
		setErrors(nextErrors);
		if (Object.keys(nextErrors).length > 0) return;
		await onSubmit({
			positionId,
			sectionId: selectedSectionId,
			levelId: requiresLevel ? levelId : null,
			requestedHeadcount: Math.max(1, Math.floor(Number(requestedHeadcount || 1))),
			justification: justification.trim(),
			jobType: jobType.trim() || undefined,
			jobLocation: jobLocation.trim() || undefined,
			jobTags: normalizeTags(jobTags),
			jobDescription: jobDescription.trim() || undefined,
			workflowCode: requestContext?.settings?.defaultWorkflowCode,
			description: effectiveDescription,
		});
	};

	const isLoading = isLoadingPositions || isLoadingLevels || requestContextQuery.isLoading;

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
			<DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-hidden p-0 sm:max-w-[960px]">
				<div className="flex max-h-[90vh] flex-col bg-white">
					<div className="border-b border-gray-100 px-5 py-4 sm:px-6">
						<DialogHeader className="pr-8 text-left">
							<div className="flex items-start gap-3">
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
									<Briefcase className="h-5 w-5" />
								</div>
								<div className="min-w-0">
									<DialogTitle className="text-xl font-semibold tracking-normal text-gray-950">
										Job Requisition
									</DialogTitle>
									<DialogDescription className="mt-1 text-sm text-gray-500">
										{departmentName ? `${departmentName} department request` : "Department request"}
									</DialogDescription>
								</div>
							</div>
						</DialogHeader>
					</div>

					{isLoading ? (
						<div className="flex min-h-[420px] items-center justify-center">
							<Loader2 className="h-7 w-7 animate-spin text-primary" />
						</div>
					) : (
						<>
							<div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
								{!canSubmit ? (
									<div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
										<div className="flex items-start gap-2">
											<CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
											<p>
												{requestContext?.permissions?.reason || "Requisition cannot be submitted."}
											</p>
										</div>
									</div>
								) : null}

								<div className="space-y-5">
									<section className="rounded-md border border-gray-200 bg-gray-50 p-4">
										<div className="mb-4">
											<h3 className="text-sm font-semibold text-gray-950">Role details</h3>
										</div>

										<div className={`grid gap-4 ${requiresLevel ? "md:grid-cols-2" : ""}`}>
											<div className="space-y-2">
												<FieldLabel htmlFor="job-requisition-position">Position</FieldLabel>
												<Select
													value={positionId}
													onValueChange={(value) => {
														setPositionId(value);
														setLevelId("");
														setErrors((current) => ({ ...current, positionId: undefined }));
													}}>
													<SelectTrigger
														id="job-requisition-position"
														aria-label="Position"
														className="h-11 rounded-md border-gray-200 bg-white text-sm">
														<SelectValue placeholder="Select position" />
													</SelectTrigger>
													<SelectContent>
														{positions.map((position: any) => (
															<SelectItem key={position.id} value={position.id}>
																{position.title}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
												{submitAttempted && errors.positionId ? (
													<p className="text-sm text-red-600">{errors.positionId}</p>
												) : null}
											</div>
											{requiresLevel ? (
												<div className="space-y-2">
													<FieldLabel htmlFor="job-requisition-level">Level</FieldLabel>
													<Select
														value={levelId}
														onValueChange={(value) => {
															setLevelId(value);
															setErrors((current) => ({ ...current, levelId: undefined }));
														}}>
														<SelectTrigger
															id="job-requisition-level"
															aria-label="Level"
															className="h-11 rounded-md border-gray-200 bg-white text-sm">
															<SelectValue placeholder="Select level" />
														</SelectTrigger>
														<SelectContent>
															{availableLevels.map((level: any) => (
																<SelectItem key={level.id} value={level.id}>
																	{level.name}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
													{submitAttempted && errors.levelId ? (
														<p className="text-sm text-red-600">{errors.levelId}</p>
													) : null}
												</div>
											) : null}
										</div>
									</section>

									<section className="rounded-md border border-gray-200 bg-gray-50 p-4">
										<div className="mb-4">
											<h3 className="text-sm font-semibold text-gray-950">Headcount plan</h3>
										</div>

										<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
											<HeadcountStat label="Current">{currentHeadcount}</HeadcountStat>
											<HeadcountStat label="Target">
												{hasTargetHeadcount ? selectedPolicy?.targetHeadcount || 0 : "Not set"}
											</HeadcountStat>
											<div className="min-h-[76px] rounded-md border border-gray-200 bg-white px-3 py-2.5">
												<FieldLabel htmlFor="job-requisition-headcount">Request</FieldLabel>
												<Input
													id="job-requisition-headcount"
													aria-label="Request Headcount"
													type="text"
													inputMode="numeric"
													value={requestedHeadcount}
													onChange={(event) => {
														setRequestedHeadcount(event.target.value.replace(/[^\d]/g, ""));
														setErrors((current) => ({
															...current,
															requestedHeadcount: undefined,
														}));
													}}
													className={`mt-2 h-9 rounded-md border-gray-200 bg-white text-center font-semibold text-gray-900 ${
														submitAttempted && errors.requestedHeadcount
															? "border-red-300 ring-1 ring-red-200"
															: ""
													}`}
												/>
											</div>
											<HeadcountStat label="Available">
												{hasTargetHeadcount ? availableHeadcount : "Not set"}
											</HeadcountStat>
											<HeadcountStat label="After Request">
												{hasTargetHeadcount ? projectedRemainingHeadcount : "Not set"}
											</HeadcountStat>
										</div>
										{submitAttempted && errors.requestedHeadcount ? (
											<p className="mt-2 text-sm text-red-600">{errors.requestedHeadcount}</p>
										) : null}
										{hasTargetHeadcount && isOverCapacity ? (
											<p
												className={`mt-2 text-sm ${
													isBlockingPolicy ? "text-red-700" : "text-amber-700"
												}`}>
												{isBlockingPolicy
													? "This request exceeds the available target and will be blocked on submit."
													: "This request exceeds the available target, but the policy allows HR to continue with a warning."}
											</p>
										) : null}
									</section>

									<section className="rounded-md border border-gray-200 bg-gray-50 p-4">
										<div className="mb-4">
											<h3 className="text-sm font-semibold text-gray-950">Business reason</h3>
										</div>

										<div className="space-y-2">
											<FieldLabel htmlFor="job-requisition-justification">Justification</FieldLabel>
											<Textarea
												id="job-requisition-justification"
												aria-label="Justification"
												value={justification}
												onChange={(event) => {
													setJustification(event.target.value);
													setErrors((current) => ({ ...current, justification: undefined }));
												}}
												className={`min-h-[120px] resize-none rounded-md border-gray-200 bg-white text-sm ${
													submitAttempted && errors.justification
														? "border-red-300 ring-1 ring-red-200"
														: ""
												}`}
											/>
											{submitAttempted && errors.justification ? (
												<p className="text-sm text-red-600">{errors.justification}</p>
											) : null}
										</div>
									</section>

									<section className="rounded-md border border-gray-200 bg-gray-50 p-4">
										<div className="mb-4">
											<h3 className="text-sm font-semibold text-gray-950">Policy metadata</h3>
										</div>

										<div className="grid gap-4 md:grid-cols-2">
											<div className="space-y-2">
												<FieldLabel htmlFor="job-requisition-type">Job Type</FieldLabel>
												<Input
													id="job-requisition-type"
													value={jobType}
													onChange={(event) => setJobType(event.target.value)}
													placeholder="e.g. FULL_TIME"
													className="h-10 rounded-md border-gray-200 bg-white"
												/>
											</div>
											<div className="space-y-2">
												<FieldLabel htmlFor="job-requisition-location">Job Location</FieldLabel>
												<Input
													id="job-requisition-location"
													value={jobLocation}
													onChange={(event) => setJobLocation(event.target.value)}
													placeholder="e.g. REMOTE"
													className="h-10 rounded-md border-gray-200 bg-white"
												/>
											</div>
											<div className="space-y-2 md:col-span-2">
												<FieldLabel htmlFor="job-requisition-tags">Job Tags</FieldLabel>
												<Input
													id="job-requisition-tags"
													value={jobTags}
													onChange={(event) => setJobTags(event.target.value)}
													placeholder="Comma-separated tags"
													className="h-10 rounded-md border-gray-200 bg-white"
												/>
												<p className="text-xs text-gray-500">
													Separate tags with commas to keep the request payload clean.
												</p>
											</div>
											<div className="space-y-2 md:col-span-2">
												<FieldLabel htmlFor="job-requisition-description">
													Job Description
												</FieldLabel>
												<Textarea
													id="job-requisition-description"
													value={jobDescription}
													onChange={(event) => setJobDescription(event.target.value)}
													placeholder="Add the role summary or hiring notes."
													className="min-h-[112px] rounded-md border-gray-200 bg-white"
												/>
											</div>
										</div>
									</section>

									<section className="rounded-md border border-gray-200 bg-white p-4">
										<div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
											<div className="space-y-3">
												<div>
													<h3 className="text-sm font-semibold text-gray-950">Request review</h3>
													<p className="mt-2 text-sm font-semibold leading-6 text-gray-950">
														{effectiveDescription ||
															"Select a position to build the request summary."}
													</p>
												</div>
												<div className="space-y-1 text-sm text-gray-700">
													<p>
														<span className="font-semibold text-gray-950">Job type:</span>{" "}
														{jobType.trim() || "Not set"}
													</p>
													<p>
														<span className="font-semibold text-gray-950">Job location:</span>{" "}
														{jobLocation.trim() || "Not set"}
													</p>
													<p>
														<span className="font-semibold text-gray-950">Job tags:</span>{" "}
														{normalizeTags(jobTags).join(", ") || "None"}
													</p>
												</div>
											</div>
											<div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
												<p className="font-semibold text-gray-950">Policy</p>
												{selectedPolicy ? (
													<>
														<p className="mt-2">
															{policyBehaviorLabel} when target would be exceeded.
														</p>
														{!hasTargetHeadcount ? (
															<p className="mt-2 text-amber-700">
																Target headcount is not set yet.
															</p>
														) : isOverCapacity && !isBlockingPolicy ? (
															<p className="mt-2 text-amber-700">
																This request is above the available target, but the policy
																allows HR to continue with a warning.
															</p>
														) : isOverCapacity && isBlockingPolicy ? (
															<p className="mt-2 text-red-700">
																This request is above the available target and will be blocked
																on submit.
															</p>
														) : null}
													</>
												) : (
													<p className="mt-2 text-amber-700">
														No matching HR policy for this position.
													</p>
												)}
												{submitAttempted && errors.policy ? (
													<p className="mt-2 text-red-600">{errors.policy}</p>
												) : null}
											</div>
										</div>
									</section>
								</div>
							</div>

							<div className="border-t border-gray-100 bg-white px-5 py-4 sm:px-6">
								<div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
									<Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
										Cancel
									</Button>
									<Button
										type="button"
										onClick={handleSubmit}
										disabled={isPending}
										className="bg-primary text-white hover:bg-primary/90">
										{isPending ? (
											<>
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
												Submitting...
											</>
										) : (
											"Submit Requisition"
										)}
									</Button>
								</div>
							</div>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

export default JobRequisitionRequestModal;
