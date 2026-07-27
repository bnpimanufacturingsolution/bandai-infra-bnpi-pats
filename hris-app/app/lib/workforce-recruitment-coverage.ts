import type {
	WorkforceRecruitmentPolicy,
	WorkforceRecruitmentSettings,
} from "~/services/workforce-recruitment-settings.service";

export const ALL_LEVELS_LABEL = "All levels";
export const POSITION_LEVEL_FALLBACK_LABEL = "Position level";
export const OTHER_DEPARTMENT_LABEL = "Other positions";
export const UNASSIGNED_SECTION_LABEL = "Unassigned section";

export type PolicyCoverageRow = WorkforceRecruitmentPolicy & {
	localId: string;
	sectionId?: string | null;
	sectionName: string;
	positionTitle: string;
	levelName: string;
	departmentName: string;
	isPersisted: boolean;
};

export type NormalizedLinkedLevel = {
	id?: string | null;
	name: string;
	rank?: number;
};

type LooseLevel = {
	id?: string | null;
	name?: string | null;
	rank?: number | null;
};

type LooseDepartment = {
	id?: string | null;
	name?: string | null;
};

type LoosePosition = {
	id?: string | null;
	title?: string | null;
	departmentId?: string | null;
	sectionId?: string | null;
	section?: {
		id?: string | null;
		name?: string | null;
		departmentId?: string | null;
		department?: { id?: string | null; name?: string | null } | null;
	} | null;
	levels?: unknown[];
};

type LooseEmployee = {
	departmentId?: string | null;
	department?: { id?: string | null; name?: string | null } | null;
	sectionId?: string | null;
	section?: { id?: string | null; name?: string | null } | null;
	positionId?: string | null;
	position?: { id?: string | null; title?: string | null } | null;
	levelId?: string | null;
	level?: { id?: string | null; name?: string | null } | null;
};

type CoveragePlacement = {
	departmentId: string | null;
	departmentName: string;
	sectionId: string | null;
	sectionName: string;
};

export const normalizeLinkedLevel = (
	rawLevel: unknown,
	levelCatalogById = new Map<string, LooseLevel>(),
): NormalizedLinkedLevel => {
	const candidate = rawLevel as
		| {
				id?: string;
				name?: string;
				rank?: number;
				levelId?: string;
				level?: { id?: string; name?: string; rank?: number };
		  }
		| undefined;
	if (candidate?.level && typeof candidate.level === "object") {
		const id = String(candidate.level.id || candidate.levelId || "").trim();
		const catalogLevel = levelCatalogById.get(id);
		return {
			id,
			name: String(candidate.level.name || catalogLevel?.name || ""),
			rank:
				typeof candidate.level.rank === "number"
					? candidate.level.rank
					: typeof candidate.rank === "number"
						? candidate.rank
						: typeof catalogLevel?.rank === "number"
							? catalogLevel.rank
						: undefined,
		};
	}

	const id = String(candidate?.levelId || candidate?.id || "").trim();
	const catalogLevel = levelCatalogById.get(id);
	return {
		id,
		name: String(candidate?.name || catalogLevel?.name || ""),
		rank:
			typeof candidate?.rank === "number"
				? candidate.rank
				: typeof catalogLevel?.rank === "number"
					? catalogLevel.rank
					: undefined,
	};
};

const normalizeScopeId = (value?: string | null) => String(value || "none");

export const buildRecruitmentCoverageRowKey = (
	departmentId?: string | null,
	sectionId?: string | null,
	positionId?: string | null,
	levelId?: string | null,
) =>
	[departmentId, sectionId, positionId, levelId].map(normalizeScopeId).join(":");

const buildPositionLevelKey = (positionId?: string | null, levelId?: string | null) =>
	[positionId, levelId].map(normalizeScopeId).join(":");

const resolvePositionPlacement = (
	position: LoosePosition | undefined,
	departmentNameById: Map<string, string>,
	fallback?: Partial<CoveragePlacement>,
): CoveragePlacement => {
	const hasPosition = Boolean(position);
	const rawSectionId = String(position?.section?.id || position?.sectionId || "").trim();
	const rawSectionName = String(position?.section?.name || "").trim();
	const hasValidSection = Boolean(rawSectionId && rawSectionName);
	const fallbackSectionId = !hasPosition ? String(fallback?.sectionId || "").trim() : "";
	const fallbackSectionName = !hasPosition ? String(fallback?.sectionName || "").trim() : "";
	const hasValidFallbackSection = Boolean(fallbackSectionId && fallbackSectionName);
	const departmentId =
		String(
			position?.section?.departmentId ||
				position?.section?.department?.id ||
				position?.departmentId ||
				fallback?.departmentId ||
				"",
		).trim() || null;

	return {
		departmentId,
		departmentName:
			String(position?.section?.department?.name || "").trim() ||
			departmentNameById.get(String(departmentId || "")) ||
			fallback?.departmentName ||
			OTHER_DEPARTMENT_LABEL,
		sectionId: hasValidSection
			? rawSectionId
			: hasValidFallbackSection
				? fallbackSectionId
				: null,
		sectionName: hasValidSection
			? rawSectionName
			: hasValidFallbackSection
				? fallbackSectionName
				: UNASSIGNED_SECTION_LABEL,
	};
};

const resolveEmployeeFallbackPlacement = (
	employee: LooseEmployee,
	departmentNameById: Map<string, string>,
): CoveragePlacement => {
	const rawSectionId = String(employee.section?.id || employee.sectionId || "").trim();
	const rawSectionName = String(employee.section?.name || "").trim();
	const hasValidSection = Boolean(rawSectionId && rawSectionName);
	const departmentId =
		String(employee.department?.id || employee.departmentId || "").trim() || null;

	return {
		departmentId,
		departmentName:
			String(employee.department?.name || "").trim() ||
			departmentNameById.get(String(departmentId || "")) ||
			OTHER_DEPARTMENT_LABEL,
		sectionId: hasValidSection ? rawSectionId : null,
		sectionName: hasValidSection ? rawSectionName : UNASSIGNED_SECTION_LABEL,
	};
};

const getLevelsForPosition = (
	position: LoosePosition,
	levelCatalogById: Map<string, LooseLevel>,
): NormalizedLinkedLevel[] => {
	const linkedLevels = (Array.isArray(position.levels) ? position.levels : [])
		.map((level) => normalizeLinkedLevel(level, levelCatalogById))
		.filter((level) => level.id && level.name);

	if (!linkedLevels.length) {
		return [{ id: null, name: ALL_LEVELS_LABEL, rank: undefined }];
	}

	return linkedLevels.slice().sort((left, right) => {
		const leftRank = typeof left.rank === "number" ? left.rank : Number.MAX_SAFE_INTEGER;
		const rightRank = typeof right.rank === "number" ? right.rank : Number.MAX_SAFE_INTEGER;
		if (leftRank !== rightRank) return leftRank - rightRank;
		return String(left.name || "").localeCompare(String(right.name || ""));
	});
};

const buildCoverageRow = ({
	policy,
	positionId,
	positionTitle,
	level,
	placement,
	index,
}: {
	policy?: WorkforceRecruitmentPolicy;
	positionId: string;
	positionTitle: string;
	level: {
		id?: string | null;
		name: string;
	};
	placement: CoveragePlacement;
	index: number;
}): PolicyCoverageRow => ({
	localId: policy?.id || `coverage-${positionId}-${level.id || "none"}-${index}`,
	id: policy?.id || `draft-${positionId}-${level.id || "none"}-${index}`,
	departmentId: placement.departmentId,
	sectionId: placement.sectionId,
	positionId,
	levelId: level.id || null,
	targetHeadcount: Number(policy?.targetHeadcount || 0),
	limitBehavior: policy?.limitBehavior === "WARN" ? "WARN" : "BLOCK",
	defaultWorkflowCode: policy?.defaultWorkflowCode || "",
	autoCreateJobOnApproval: policy?.autoCreateJobOnApproval !== false,
	jobType: policy?.jobType || "",
	jobLocation: policy?.jobLocation || "",
	jobTags: Array.isArray(policy?.jobTags) ? policy.jobTags : [],
	jobDescriptionTemplate: policy?.jobDescriptionTemplate || "",
	isActive: policy?.isActive !== false,
	currentHeadcount: policy?.currentHeadcount,
	availableHeadcount: policy?.availableHeadcount,
	positionTitle,
	levelName: level.name,
	departmentName: placement.departmentName,
	sectionName: placement.sectionName,
	isPersisted: Boolean(policy?.id),
});

export const buildRecruitmentCoverageRows = ({
	settings,
	positions,
	employees,
	departments,
	levels = [],
}: {
	settings: WorkforceRecruitmentSettings;
	positions: LoosePosition[];
	employees: LooseEmployee[];
	departments: LooseDepartment[];
	levels?: LooseLevel[];
}): PolicyCoverageRow[] => {
	const departmentNameById = new Map(
		departments.map((department) => [
			String(department.id || ""),
			String(department.name || ""),
		]),
	);
	const levelCatalogById = new Map(
		levels
			.filter((level) => level?.id)
			.map((level) => [String(level.id), level]),
	);
	const positionById = new Map(
		positions
			.filter((position) => position?.id)
			.map((position) => [String(position.id), position]),
	);
	const levelNameByPositionLevel = new Map<string, string>();

	positions.forEach((position) => {
		const positionId = String(position.id || "");
		getLevelsForPosition(position, levelCatalogById).forEach((level) => {
			levelNameByPositionLevel.set(
				buildPositionLevelKey(positionId, level.id || null),
				level.name,
			);
		});
	});

	const exactPolicyMap = new Map<string, WorkforceRecruitmentPolicy>();
	const legacyPolicyMap = new Map<string, WorkforceRecruitmentPolicy>();

	settings.policies
		.filter((policy) => policy.positionId)
		.forEach((policy) => {
			const exactKey = buildRecruitmentCoverageRowKey(
				policy.departmentId || null,
				policy.sectionId || null,
				policy.positionId || null,
				policy.levelId || null,
			);
			if (!exactPolicyMap.has(exactKey)) {
				exactPolicyMap.set(exactKey, policy);
			}

			if (!policy.sectionId) {
				const legacyKey = buildPositionLevelKey(policy.positionId, policy.levelId || null);
				if (!legacyPolicyMap.has(legacyKey)) {
					legacyPolicyMap.set(legacyKey, policy);
				}
			}
		});

	const nextRows: PolicyCoverageRow[] = [];
	const seenScopeKeys = new Set<string>();
	const matchedPolicyIds = new Set<string>();

	const resolvePolicy = (
		scopeKey: string,
		positionId: string,
		levelId?: string | null,
	) => {
		const exactPolicy = exactPolicyMap.get(scopeKey);
		if (exactPolicy && !matchedPolicyIds.has(String(exactPolicy.id))) {
			matchedPolicyIds.add(String(exactPolicy.id));
			return exactPolicy;
		}

		const legacyPolicy = legacyPolicyMap.get(buildPositionLevelKey(positionId, levelId || null));
		if (legacyPolicy && !matchedPolicyIds.has(String(legacyPolicy.id))) {
			matchedPolicyIds.add(String(legacyPolicy.id));
			return legacyPolicy;
		}

		return undefined;
	};

	const pushCoverageRow = ({
		positionId,
		positionTitle,
		level,
		placement,
		index,
	}: {
		positionId?: string | null;
		positionTitle?: string | null;
		level: { id?: string | null; name?: string | null };
		placement: CoveragePlacement;
		index: number;
	}) => {
		const resolvedPositionId = String(positionId || "").trim();
		if (!resolvedPositionId) return;
		const scopeKey = buildRecruitmentCoverageRowKey(
			placement.departmentId,
			placement.sectionId,
			resolvedPositionId,
			level.id || null,
		);
		if (seenScopeKeys.has(scopeKey)) return;
		seenScopeKeys.add(scopeKey);

		nextRows.push(
			buildCoverageRow({
				policy: resolvePolicy(scopeKey, resolvedPositionId, level.id || null),
				positionId: resolvedPositionId,
				positionTitle: String(positionTitle || "Unknown position"),
				level: {
					id: level.id || null,
					name: level.name || POSITION_LEVEL_FALLBACK_LABEL,
				},
				placement,
				index,
			}),
		);
	};

	positions.forEach((position, positionIndex) => {
		const positionId = String(position.id || "").trim();
		if (!positionId) return;
		const placement = resolvePositionPlacement(position, departmentNameById);
		getLevelsForPosition(position, levelCatalogById).forEach((level, levelIndex) => {
			pushCoverageRow({
				positionId,
				positionTitle: position.title || null,
				level,
				placement,
				index: positionIndex * 1000 + levelIndex,
			});
		});
	});

	employees.forEach((employee, employeeIndex) => {
		const positionId = String(employee.position?.id || employee.positionId || "").trim();
		if (!positionId) return;
		const position = positionById.get(positionId);
		const fallbackPlacement = resolveEmployeeFallbackPlacement(employee, departmentNameById);
		const placement = position
			? resolvePositionPlacement(position, departmentNameById, fallbackPlacement)
			: fallbackPlacement;
		pushCoverageRow({
			positionId,
			positionTitle: position?.title || employee.position?.title || null,
			level: {
				id: employee.level?.id || employee.levelId || null,
				name: employee.level?.name || null,
			},
			placement,
			index: 100000 + employeeIndex,
		});
	});

	settings.policies
		.filter((policy) => policy.positionId && !matchedPolicyIds.has(String(policy.id)))
		.forEach((policy, policyIndex) => {
			const positionId = String(policy.positionId || "").trim();
			const position = positionById.get(positionId);
			const policyPlacement = resolvePositionPlacement(position, departmentNameById, {
				departmentId: policy.departmentId || null,
				departmentName:
					departmentNameById.get(String(policy.departmentId || "")) || OTHER_DEPARTMENT_LABEL,
				sectionId: policy.sectionId || null,
				sectionName: UNASSIGNED_SECTION_LABEL,
			});
			const knownLevelName = levelNameByPositionLevel.get(
				buildPositionLevelKey(positionId, policy.levelId || null),
			);
			pushCoverageRow({
				positionId,
				positionTitle: position?.title || null,
				level: {
					id: policy.levelId || null,
					name:
						knownLevelName ||
						(policy.levelId ? POSITION_LEVEL_FALLBACK_LABEL : ALL_LEVELS_LABEL),
				},
				placement: policyPlacement,
				index: 200000 + policyIndex,
			});
		});

	return nextRows;
};
