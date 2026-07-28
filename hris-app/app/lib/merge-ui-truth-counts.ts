/**
 * Merge UI count contract — one source of truth per chip / CTA number.
 * Product job: docs/00-product/AGENT-PROMPT-merge-ui-truth-one-source-no-card.md
 *
 * Peer-copy executable = physical missing-person creates only
 * (writeMatrix.totalWrites / sum of matrix COPY). Never selected ID count.
 * Card is NOT in decision residual (profile fields only).
 */

export type MergeChipId =
	| "unique"
	| "records"
	| "missing"
	| "decision"
	| "peer_copy"
	| "fingerprint"
	| "face"
	| "card"
	| "review_soup"
	| "potential_writes_inflated";

export type MergeChipContract = {
	id: MergeChipId;
	label: string;
	/** Exact formula operators can audit */
	formula: string;
	/** One-line caption under the chip */
	caption: string;
	/** Whether this chip is shown in default residual UX */
	defaultVisible: boolean;
	/** Plan / matrix field path */
	sourcePath: string;
};

/** Canonical chip formulas (Agent A truth table). */
export const MERGE_CHIP_CONTRACT: MergeChipContract[] = [
	{
		id: "unique",
		label: "Unique IDs",
		formula: "plan.users.length (union person keys in scope)",
		caption: "Distinct vendor person IDs across selected devices",
		defaultVisible: true,
		sourcePath: "plan.users.length | plan.counts.unionUsers",
	},
	{
		id: "records",
		label: "Device ID records",
		formula: "sum(plan.users[].records.length)",
		caption: "Per-device inventory rows (not unique people)",
		defaultVisible: true,
		sourcePath: "plan.users[].records | plan.counts.sourceRows",
	},
	{
		id: "missing",
		label: "Missing",
		formula: "unique people with missingOnDeviceIds.length > 0",
		caption: "People absent on at least one selected peer device",
		defaultVisible: true,
		sourcePath: "plan.users[].missingOnDeviceIds → issue filter=missing",
	},
	{
		id: "decision",
		label: "Needs decision",
		formula: "unique people with profile conflicts.length > 0 (DECISION_FIELDS only)",
		caption: "people with profile conflicts only (name/date A vs B — not card/FP/face)",
		defaultVisible: true,
		sourcePath: "plan.users[].conflicts (profile fields)",
	},
	{
		id: "peer_copy",
		label: "Peer-copy ready",
		formula: "writeMatrix.totalWrites = sum(user.targetDeviceIds.length) physical creates",
		caption: "Executable missing-person peer creates only",
		defaultVisible: true,
		sourcePath: "writeMatrix.totalWrites | selected matrix sum(COPY)",
	},
	{
		id: "fingerprint",
		label: "FP residual",
		formula: "unique people with fingerprint gap rows (richest > target count)",
		caption: "Fingerprint count gaps — credential recovery path",
		defaultVisible: true,
		sourcePath: "issue filter=fingerprint | credentialWrites modality fingerprint",
	},
	{
		id: "face",
		label: "Face residual",
		formula: "unique people with face gap rows",
		caption: "Face count gaps — credential recovery path",
		defaultVisible: true,
		sourcePath: "issue filter=face | credentialWrites modality face",
	},
	{
		id: "card",
		label: "Card residual",
		formula: "unique people with card gap rows (hidden by default)",
		caption: "Optional badge residual — toggle Include card residual",
		defaultVisible: false,
		sourcePath: "issue filter=card | credentialWrites modality card",
	},
	{
		id: "review_soup",
		label: "Needs review (deprecated soup)",
		formula: "unique people with any non-ready issue (missing∪decision∪fp∪face∪card)",
		caption: "Do not use as a top chip — splits into Missing + Needs decision + residuals",
		defaultVisible: false,
		sourcePath: "sdkMergeReviewRows / filter=all issue people",
	},
	{
		id: "potential_writes_inflated",
		label: "Potential writes (deprecated)",
		formula: "user peer creates + credentialWrites.length (double-count risk)",
		caption: "Replaced by Peer-copy ready (physical) + credential residual chips",
		defaultVisible: false,
		sourcePath: "sdkMergeUserPotentialWriteCount + credentialWrites",
	},
];

export type MergePeerCopyCtaInput = {
	/** Physical peer creates only — writeMatrix.totalWrites / sum(COPY) */
	executablePeerCopies: number;
	selectedUniqueIds: number;
	/** Profile A/B DeviceUser overlays (not peer copy) */
	profileOverlays?: number;
	/** Conflicts resolved and no blocking read errors */
	canApply: boolean;
	isPending?: boolean;
	blockingCount?: number;
	unresolvedConflicts?: number;
};

export type MergePeerCopyCta = {
	disabled: boolean;
	label: string;
	/** Machine reason for tests / a11y */
	reason:
		| "pending"
		| "blocking_reads"
		| "no_selection"
		| "unresolved_conflicts"
		| "has_executable_copies"
		| "profile_only"
		| "zero_writes";
	executablePeerCopies: number;
	selectedUniqueIds: number;
	profileOverlays: number;
};

/**
 * Review-modal primary CTA (Start peer copy inside confirm modal).
 * Never labels "Start peer copy (N IDs)" from selectedUniqueIds.
 * Disabled when executablePeerCopies === 0 and no profile-only work.
 */
export function buildMergePeerCopyCta(input: MergePeerCopyCtaInput): MergePeerCopyCta {
	const executablePeerCopies = Math.max(0, Number(input.executablePeerCopies) || 0);
	const selectedUniqueIds = Math.max(0, Number(input.selectedUniqueIds) || 0);
	const profileOverlays = Math.max(0, Number(input.profileOverlays) || 0);
	const blockingCount = Math.max(0, Number(input.blockingCount) || 0);
	const unresolvedConflicts = Math.max(0, Number(input.unresolvedConflicts) || 0);

	const base = {
		executablePeerCopies,
		selectedUniqueIds,
		profileOverlays,
	};

	if (input.isPending) {
		return { ...base, disabled: true, label: "Starting...", reason: "pending" };
	}
	if (blockingCount > 0) {
		return {
			...base,
			disabled: true,
			label: `Resolve ${blockingCount} read issue${blockingCount === 1 ? "" : "s"}`,
			reason: "blocking_reads",
		};
	}
	if (selectedUniqueIds === 0) {
		return {
			...base,
			disabled: true,
			label: "Select rows",
			reason: "no_selection",
		};
	}
	if (!input.canApply || unresolvedConflicts > 0) {
		return {
			...base,
			disabled: true,
			label:
				unresolvedConflicts > 0
					? `Resolve ${unresolvedConflicts} more`
					: "Resolve decisions first",
			reason: "unresolved_conflicts",
		};
	}
	if (executablePeerCopies > 0) {
		return {
			...base,
			disabled: false,
			label: `Start peer copy (${executablePeerCopies})`,
			reason: "has_executable_copies",
		};
	}
	if (profileOverlays > 0) {
		return {
			...base,
			disabled: false,
			label: `Apply profile updates (${profileOverlays})`,
			reason: "profile_only",
		};
	}
	return {
		...base,
		disabled: true,
		label: "No peer copies for this selection",
		reason: "zero_writes",
	};
}

export type MergeReviewOpenCtaInput = {
	/** Physical peer creates for the selection only */
	executablePeerCopies: number;
	selectedUniqueIds: number;
	/** Profile A/B DeviceUser overlays (not peer copy) */
	profileOverlays?: number;
	canApply: boolean;
	isPending?: boolean;
	blockingCount?: number;
	unresolvedConflicts?: number;
	jobRunning?: boolean;
};

export type MergeReviewOpenCta = {
	disabled: boolean;
	label: string;
	/**
	 * Machine reason for tests / a11y.
	 * Never treat selectedUniqueIds as "work" on the primary CTA.
	 */
	reason:
		| "pending"
		| "job_running"
		| "blocking_reads"
		| "no_selection"
		| "unresolved_conflicts"
		| "review_peer_copies"
		| "review_profile_only"
		| "zero_work";
	executablePeerCopies: number;
	selectedUniqueIds: number;
	profileOverlays: number;
};

/**
 * Main merge panel primary button that opens the Review confirm modal.
 * Must never show `Review selected merge (N)` where N = selected unique IDs
 * — that was the product lie (76 IDs looks like 76 units of work).
 * Work number is executable peer copies, then profile overlays.
 */
export function buildMergeReviewOpenCta(
	input: MergeReviewOpenCtaInput,
): MergeReviewOpenCta {
	const executablePeerCopies = Math.max(0, Number(input.executablePeerCopies) || 0);
	const selectedUniqueIds = Math.max(0, Number(input.selectedUniqueIds) || 0);
	const profileOverlays = Math.max(0, Number(input.profileOverlays) || 0);
	const blockingCount = Math.max(0, Number(input.blockingCount) || 0);
	const unresolvedConflicts = Math.max(0, Number(input.unresolvedConflicts) || 0);

	const base = {
		executablePeerCopies,
		selectedUniqueIds,
		profileOverlays,
	};

	if (input.isPending) {
		return { ...base, disabled: true, label: "Starting...", reason: "pending" };
	}
	if (input.jobRunning) {
		return {
			...base,
			disabled: true,
			label: "Merge job running",
			reason: "job_running",
		};
	}
	if (blockingCount > 0) {
		return {
			...base,
			disabled: true,
			label: `Resolve ${blockingCount} read issue${blockingCount === 1 ? "" : "s"}`,
			reason: "blocking_reads",
		};
	}
	if (selectedUniqueIds === 0) {
		return {
			...base,
			disabled: true,
			label: "Select rows",
			reason: "no_selection",
		};
	}
	if (!input.canApply || unresolvedConflicts > 0) {
		return {
			...base,
			disabled: true,
			label:
				unresolvedConflicts > 0
					? `Resolve ${unresolvedConflicts} more`
					: "Resolve decisions first",
			reason: "unresolved_conflicts",
		};
	}
	if (executablePeerCopies > 0) {
		return {
			...base,
			disabled: false,
			label: `Review peer copies (${executablePeerCopies})`,
			reason: "review_peer_copies",
		};
	}
	if (profileOverlays > 0) {
		return {
			...base,
			disabled: false,
			label: `Review profile updates (${profileOverlays})`,
			reason: "review_profile_only",
		};
	}
	// Selection exists but no physical peer creates and no profile overlays.
	// Keep enabled so operator can open the dry-run matrix and see "0 work"
	// (confirm modal already banners zero executable). Do not show selected count.
	return {
		...base,
		disabled: false,
		label: "Review selection (0 peer copies)",
		reason: "zero_work",
	};
}

/**
 * Source device tile in Review modal — one primary metric, one secondary.
 * Avoid bare dual numbers (20 vs 6) without labels.
 */
export function formatMergeSourceDeviceTile(params: {
	selectedUniqueIds: number;
	peerCopies: number;
}): {
	primaryValue: number;
	primaryLabel: string;
	secondaryText: string;
} {
	const selectedUniqueIds = Math.max(0, Number(params.selectedUniqueIds) || 0);
	const peerCopies = Math.max(0, Number(params.peerCopies) || 0);
	return {
		primaryValue: peerCopies,
		primaryLabel: "peer copies from source",
		secondaryText: `${selectedUniqueIds} selected ID${selectedUniqueIds === 1 ? "" : "s"} on source`,
	};
}

/**
 * Target device tile — only peer creates toward this device.
 */
export function formatMergeTargetDeviceTile(params: {
	writes: number;
	sourceDeviceNames: string[];
}): {
	primaryValue: number;
	primaryLabel: string;
	secondaryText: string;
} {
	const writes = Math.max(0, Number(params.writes) || 0);
	const names = params.sourceDeviceNames || [];
	const from =
		names.length === 0
			? "No source"
			: `From ${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2}` : ""}`;
	return {
		primaryValue: writes,
		primaryLabel: "peer copies to create",
		secondaryText: from,
	};
}

/** Sum of physical peer creates for selected users (frontend write matrix). */
export function sumSelectedExecutablePeerCopies(
	rows: Array<{ writes?: number }>,
): number {
	return (rows || []).reduce((sum, row) => sum + Math.max(0, Number(row.writes) || 0), 0);
}

/**
 * Footer scope line: selection is secondary; executable peer copies is the work number.
 * When executable=0, the work clause states that fact plainly (UI may bold via class).
 */
export function formatMergeSelectionScopeFooter(params: {
	selectedUniqueIds: number;
	executablePeerCopies: number;
	excludedActionableIds?: number;
}): string {
	const selected = Math.max(0, Number(params.selectedUniqueIds) || 0);
	const copies = Math.max(0, Number(params.executablePeerCopies) || 0);
	const excluded = Math.max(0, Number(params.excludedActionableIds) || 0);
	const selectedLabel = `${selected} selected unique ID${selected === 1 ? "" : "s"} (scope only)`;
	const workLabel =
		copies > 0
			? `${copies} executable peer cop${copies === 1 ? "y" : "ies"} (physical creates — real work)`
			: "0 executable peer copies (nothing physical to create)";
	const excludedLabel =
		excluded > 0
			? `; ${excluded} actionable ID${excluded === 1 ? "" : "s"} excluded from this scope`
			: "";
	return `${selectedLabel}. ${workLabel}${excludedLabel}.`;
}
