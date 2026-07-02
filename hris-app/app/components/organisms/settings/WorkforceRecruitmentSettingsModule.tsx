import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CircleAlert, Loader2 } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { RulesPoliciesShell } from "~/components/templates/admin/rules-policies-shell";
import { Select, type SelectOption } from "~/components/atoms/Select";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "~/components/ui/accordion";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useLevels } from "~/lib/hooks/useLevels";
import { usePositions } from "~/lib/hooks/usePositions";
import {
	useUpdateWorkforceRecruitmentSettings,
	useWorkforceRecruitmentHeadcounts,
	useWorkforceRecruitmentSettings,
} from "~/lib/hooks/useWorkforceRecruitmentSettings";
import {
	buildRecruitmentCoverageRowKey,
	buildRecruitmentCoverageRows,
	type PolicyCoverageRow,
} from "~/lib/workforce-recruitment-coverage";
import type {
	WorkforceRecruitmentPolicy,
	WorkforceRecruitmentSettings,
} from "~/services/workforce-recruitment-settings.service";

interface WorkforceRecruitmentSettingsModuleProps {
	showHeader?: boolean;
	primaryActionLabel?: string;
	onPrimarySuccess?: () => void;
}

type CoveragePositionGroup = {
	positionId: string;
	positionTitle: string;
	rows: PolicyCoverageRow[];
	health: ReturnType<typeof getCoverageHealth>;
};

const ToggleTile = ({
	label,
	checked,
	onCheckedChange,
}: {
	label: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
}) => (
	<div className="flex min-h-10 items-center justify-between gap-3 border-b border-gray-100 px-3 py-2.5 last:border-b-0">
		<p className="min-w-0 break-words text-sm font-medium leading-5 text-gray-900">{label}</p>
		<Switch
			checked={checked}
			onCheckedChange={onCheckedChange}
			className="shrink-0 data-[state=checked]:bg-orange-600"
		/>
	</div>
);

const ControlLabel = ({ children }: { children: ReactNode }) => (
	<p className="text-xs font-medium text-gray-600">{children}</p>
);

const getCoverageHealth = (rows: PolicyCoverageRow[]) => {
	const activeRows = rows.filter((row) => row.isActive);
	const currentHeadcount = rows.reduce(
		(total, row) => total + Number(row.currentHeadcount || 0),
		0,
	);
	const targetHeadcount = rows.reduce(
		(total, row) => total + Number(row.targetHeadcount || 0),
		0,
	);
	return {
		currentHeadcount,
		targetHeadcount,
		configured: rows.filter((row) => Number(row.targetHeadcount || 0) > 0).length,
		missing: rows.filter((row) => Number(row.targetHeadcount || 0) <= 0).length,
		blocking: activeRows.filter((row) => row.limitBehavior === "BLOCK").length,
		belowCurrent: activeRows.filter(
			(row) =>
				typeof row.currentHeadcount === "number" &&
				Number(row.targetHeadcount || 0) > 0 &&
				Number(row.targetHeadcount || 0) < Number(row.currentHeadcount || 0),
		).length,
	};
};

const CompactStat = ({
	label,
	value,
	tone = "default",
}: {
	label: string;
	value: number | string;
	tone?: "default" | "red";
}) => {
	const toneClass =
		tone === "red"
			? "border-red-200 bg-red-50 text-red-700"
			: "border-gray-200 bg-white text-gray-700";

	return (
		<span
			className={`inline-flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${toneClass}`}>
			<span className="text-gray-500">{label}</span>
			<span className="font-semibold tabular-nums text-gray-900">{value}</span>
		</span>
	);
};

const CoverageHealthStats = ({
	health,
	showBelow = true,
}: {
	health: ReturnType<typeof getCoverageHealth>;
	showBelow?: boolean;
}) => (
	<div className="flex flex-wrap items-center gap-1.5">
		<CompactStat
			label="Current/Target"
			value={`${health.currentHeadcount}/${health.targetHeadcount}`}
		/>
		<CompactStat label="Set" value={health.configured} />
		<CompactStat label="Pending" value={health.missing} />
		{showBelow && health.belowCurrent ? (
			<CompactStat label="Below" value={health.belowCurrent} tone="red" />
		) : null}
	</div>
);

const serializeUnmatchedPolicies = (policies: WorkforceRecruitmentPolicy[]) =>
	policies.map((policy) => ({
		id: policy.id,
		departmentId: policy.departmentId || null,
		sectionId: policy.sectionId || null,
		positionId: policy.positionId || null,
		levelId: policy.levelId || null,
		targetHeadcount: policy.targetHeadcount,
		limitBehavior: policy.limitBehavior,
		defaultWorkflowCode: policy.defaultWorkflowCode || null,
		autoCreateJobOnApproval: policy.autoCreateJobOnApproval,
		jobType: policy.jobType || null,
		jobLocation: policy.jobLocation || null,
		jobTags: policy.jobTags || [],
		jobDescriptionTemplate: policy.jobDescriptionTemplate || null,
		isActive: policy.isActive,
	}));

const serializeManagedPolicies = (rows: PolicyCoverageRow[]) =>
	rows
		.filter((row) => {
			if (row.isPersisted) return true;
			return (
				Number(row.targetHeadcount || 0) > 0 ||
				row.limitBehavior === "BLOCK" ||
				row.isActive === false ||
				Boolean(row.defaultWorkflowCode || row.jobType || row.jobLocation) ||
				Boolean(row.jobDescriptionTemplate) ||
				(Array.isArray(row.jobTags) && row.jobTags.length > 0)
			);
		})
		.map(
			({
				localId,
				positionTitle,
				levelName,
				departmentName,
				sectionName,
				isPersisted,
				currentHeadcount,
				availableHeadcount,
				...policy
			}) => ({
				...(String(policy.id).startsWith("draft-") ? {} : { id: policy.id }),
				...policy,
				defaultWorkflowCode: policy.defaultWorkflowCode || null,
				jobType: policy.jobType || null,
				jobLocation: policy.jobLocation || null,
				jobDescriptionTemplate: policy.jobDescriptionTemplate || null,
			}),
		);

const PolicyCoverageMetrics = ({
	row,
}: {
	row: Pick<
		PolicyCoverageRow,
		"targetHeadcount" | "currentHeadcount"
	>;
}) => {
	const currentHeadcount = Number(row.currentHeadcount || 0);
	const hasTarget = Number(row.targetHeadcount || 0) > 0;
	const isBelowCurrent = hasTarget && Number(row.targetHeadcount || 0) < currentHeadcount;
	const remaining = hasTarget
		? Math.max(0, Number(row.targetHeadcount || 0) - currentHeadcount)
		: null;

	return (
		<div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-gray-500">
			<span
				className={`font-medium ${
					isBelowCurrent ? "text-red-700" : hasTarget ? "text-gray-700" : "text-gray-500"
				}`}>
				{hasTarget ? `Open ${remaining}` : "Set target"}
			</span>
			{isBelowCurrent ? (
				<span className="rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 font-semibold text-red-700">
					Below
				</span>
			) : null}
		</div>
	);
};

const HeadcountPairInput = ({
	row,
	onTargetChange,
	compact = false,
}: {
	row: Pick<
		PolicyCoverageRow,
		"localId" | "targetHeadcount" | "currentHeadcount"
	>;
	onTargetChange: (value: number) => void;
	compact?: boolean;
}) => {
	const needsSetup = Number(row.targetHeadcount || 0) <= 0;
	const currentHeadcount = Number(row.currentHeadcount || 0);
	const isBelowCurrent =
		Number(row.targetHeadcount || 0) > 0 && Number(row.targetHeadcount || 0) < currentHeadcount;

	return (
		<div className={compact ? "space-y-1" : "space-y-2"}>
			{compact ? null : <ControlLabel>Headcount</ControlLabel>}
			<div className={compact ? "flex items-center gap-1.5" : "flex items-center gap-3"}>
				<Input
					value={String(currentHeadcount)}
					disabled
					className={`rounded-md border-gray-200 bg-gray-100 text-center font-semibold text-gray-700 disabled:opacity-100 ${
						compact ? "h-8 w-16 px-2 text-xs" : "h-10"
					}`}
				/>
				<span className={compact ? "text-xs font-semibold text-gray-400" : "text-lg font-semibold text-gray-400"}>/</span>
				<Input
					type="number"
					min={currentHeadcount}
					value={String(row.targetHeadcount || 0)}
					onChange={(event) =>
						onTargetChange(Math.max(0, Number(event.target.value || 0)))
					}
					className={`rounded-md bg-white text-center font-semibold ${
						compact ? "h-8 w-16 px-2 text-xs" : "h-10"
					} ${
						isBelowCurrent
							? "border-red-300 bg-red-50/60 focus-visible:ring-red-200"
							: needsSetup
								? "border-gray-300 bg-white focus-visible:ring-gray-200"
								: "border-gray-200"
					}`}
				/>
			</div>
			{compact ? null : <div className="flex items-center justify-between text-xs">
				<span className="font-medium text-gray-500">Current / Target</span>
				{isBelowCurrent ? (
					<span className="font-medium text-red-700">
						Target must be at least {currentHeadcount}
					</span>
				) : needsSetup ? (
					<span className="font-medium text-amber-700">Set target</span>
				) : null}
			</div>}
		</div>
	);
};

const CoveragePositionTable = ({
	positionGroups,
	limitBehaviorOptions,
	onCoverageFieldChange,
}: {
	positionGroups: CoveragePositionGroup[];
	limitBehaviorOptions: SelectOption[];
	onCoverageFieldChange: <K extends keyof PolicyCoverageRow>(
		localId: string,
		field: K,
		value: PolicyCoverageRow[K],
	) => void;
}) => (
	<div className="overflow-x-auto">
		<table className="w-full min-w-[760px] text-sm">
			<thead>
				<tr className="border-y border-gray-200 bg-neutral-50 text-left text-[10px] font-bold uppercase text-gray-600">
					<th className="w-[38%] px-3 py-2">Position</th>
					<th className="w-[14%] px-3 py-2 text-right">Current</th>
					<th className="w-[16%] px-3 py-2 text-right">Target</th>
					<th className="w-[20%] px-3 py-2">Limit</th>
					<th className="w-[12%] px-3 py-2 text-right">Active</th>
				</tr>
			</thead>
			<tbody>
				{positionGroups.flatMap((positionGroup) => positionGroup.rows).map((row) => (
					<tr
						key={row.localId}
						className="border-b border-gray-100 bg-white hover:bg-neutral-50">
						<td className="px-3 py-1.5">
							<p className="truncate text-sm font-medium text-gray-900">
								{row.positionTitle}
							</p>
							{row.levelId ? (
								<p className="truncate text-xs font-medium text-gray-500">
									{row.levelName}
								</p>
							) : null}
							<PolicyCoverageMetrics row={row} />
						</td>
						<td className="px-3 py-1.5 text-right">
							<span className="tabular-nums text-sm font-semibold text-gray-800">
								{Number(row.currentHeadcount || 0)}
							</span>
						</td>
						<td className="px-3 py-1.5">
							<div className="flex justify-end">
								<HeadcountPairInput
									row={row}
									compact
									onTargetChange={(value) =>
										onCoverageFieldChange(row.localId, "targetHeadcount", value)
									}
								/>
							</div>
						</td>
						<td className="px-3 py-1.5">
							<Select
								options={limitBehaviorOptions}
								value={row.limitBehavior}
								onChange={(value) =>
									onCoverageFieldChange(
										row.localId,
										"limitBehavior",
										value === "BLOCK" ? "BLOCK" : "WARN",
									)
								}
								className="h-8 rounded-md border-gray-200 bg-white text-xs"
							/>
						</td>
						<td className="px-3 py-1.5">
							<div className="flex justify-end">
								<Switch
									checked={row.isActive}
									onCheckedChange={(checked) =>
										onCoverageFieldChange(row.localId, "isActive", checked)
									}
									className="data-[state=checked]:bg-orange-600"
								/>
							</div>
						</td>
					</tr>
				))}
			</tbody>
		</table>
	</div>
);

const CoveragePositionAccordions = ({
	positionGroups,
	limitBehaviorOptions,
	onCoverageFieldChange,
}: {
	positionGroups: CoveragePositionGroup[];
	limitBehaviorOptions: SelectOption[];
	onCoverageFieldChange: <K extends keyof PolicyCoverageRow>(
		localId: string,
		field: K,
		value: PolicyCoverageRow[K],
	) => void;
}) => (
	<CoveragePositionTable
		positionGroups={positionGroups}
		limitBehaviorOptions={limitBehaviorOptions}
		onCoverageFieldChange={onCoverageFieldChange}
	/>
);

export function WorkforceRecruitmentSettingsModule({
	showHeader = true,
	primaryActionLabel = "Save Changes",
	onPrimarySuccess,
}: WorkforceRecruitmentSettingsModuleProps) {
	const { data: settings, isLoading: isLoadingSettings } = useWorkforceRecruitmentSettings();
	const updateMutation = useUpdateWorkforceRecruitmentSettings();
	const { data: departmentsData, isLoading: isLoadingDepartments } = useDepartments({
		page: 1,
		limit: 1000,
	});
	const { data: positionsData, isLoading: isLoadingPositions } = usePositions({
		page: 1,
		limit: 1000,
		fields:
			"id,title,departmentId,sectionId,section.id,section.name,section.code,section.departmentId,section.department.id,section.department.name,levels,levels.id,levels.levelId,levels.level.id,levels.level.name,levels.level.rank",
	});
	const { data: levelsData, isLoading: isLoadingLevels } = useLevels({
		limit: 1000,
	});
	const { data: headcountsData, isLoading: isLoadingHeadcounts } =
		useWorkforceRecruitmentHeadcounts();

	const [draft, setDraft] = useState<WorkforceRecruitmentSettings | null>(null);
	const [coverageRows, setCoverageRows] = useState<PolicyCoverageRow[]>([]);

	const departments = departmentsData?.departments || [];
	const positions = positionsData?.positions || [];
	const levels = useMemo(
		() => (levelsData as any)?.levels || (levelsData as any)?.data?.levels || [],
		[levelsData],
	);
	const headcounts = headcountsData || [];

	useEffect(() => {
		if (!settings) return;

		setDraft({
			...settings,
			policies: settings.policies.map((policy) => ({ ...policy })),
		});
		setCoverageRows(
			buildRecruitmentCoverageRows({
				settings,
				positions,
				employees: [],
				headcounts,
				departments,
				levels,
			}),
		);
	}, [departments, headcounts, levels, positions, settings]);

	const unmatchedPolicies = useMemo(() => {
		if (!settings) return [];
		const managedIds = new Set(
			coverageRows.filter((row) => row.isPersisted).map((row) => String(row.id)),
		);
		return settings.policies.filter((policy) => !managedIds.has(String(policy.id)));
	}, [coverageRows, settings]);

	const setDraftField = <K extends keyof WorkforceRecruitmentSettings>(
		field: K,
		value: WorkforceRecruitmentSettings[K],
	) => {
		setDraft((current) => (current ? { ...current, [field]: value } : current));
	};

	const setCoverageField = <K extends keyof PolicyCoverageRow>(
		localId: string,
		field: K,
		value: PolicyCoverageRow[K],
	) => {
		setCoverageRows((current) => {
			let changed = false;
			const next = current.map((row) => {
				if (row.localId !== localId) return row;
				if (Object.is(row[field], value)) return row;
				changed = true;
				return { ...row, [field]: value };
			});
			return changed ? next : current;
		});
	};

	const serializedCurrent = useMemo(
		() =>
			JSON.stringify({
				isEnabled: draft?.isEnabled,
				enforceDepartmentManagerScope: draft?.enforceDepartmentManagerScope,
				defaultWorkflowCode: draft?.defaultWorkflowCode,
				autoCreateJobOnApproval: draft?.autoCreateJobOnApproval,
				policies: [
					...serializeUnmatchedPolicies(unmatchedPolicies),
					...serializeManagedPolicies(coverageRows),
				],
			}),
		[coverageRows, draft, unmatchedPolicies],
	);
	const serializedOriginal = useMemo(
		() =>
			JSON.stringify({
				isEnabled: settings?.isEnabled,
				enforceDepartmentManagerScope: settings?.enforceDepartmentManagerScope,
				defaultWorkflowCode: settings?.defaultWorkflowCode,
				autoCreateJobOnApproval: settings?.autoCreateJobOnApproval,
				policies: settings ? serializeUnmatchedPolicies(settings.policies) : [],
			}),
		[settings],
	);
	const isDirty = serializedCurrent !== serializedOriginal;

	const summary = useMemo(() => {
		const activeRows = coverageRows.filter((row) => row.isActive);
		const currentHeadcount = coverageRows.reduce(
			(total, row) => total + Number(row.currentHeadcount || 0),
			0,
		);
		const targetHeadcount = coverageRows.reduce(
			(total, row) => total + Number(row.targetHeadcount || 0),
			0,
		);
		return {
			currentHeadcount,
			targetHeadcount,
			configured: coverageRows.filter((row) => Number(row.targetHeadcount || 0) > 0).length,
			missing: coverageRows.filter((row) => Number(row.targetHeadcount || 0) <= 0).length,
			blocking: activeRows.filter((row) => row.limitBehavior === "BLOCK").length,
			belowCurrent: activeRows.filter(
				(row) =>
					typeof row.currentHeadcount === "number" &&
					Number(row.targetHeadcount || 0) > 0 &&
					Number(row.targetHeadcount || 0) < Number(row.currentHeadcount || 0),
			).length,
		};
	}, [coverageRows]);

	const departmentCoverageGroups = useMemo(() => {
		const positionGroups = new Map<
			string,
			{
				positionId: string;
				positionTitle: string;
				departmentName: string;
				departmentKey: string;
				sectionKey: string;
				sectionName: string;
				rows: PolicyCoverageRow[];
			}
		>();

		coverageRows.forEach((row) => {
			const key = buildRecruitmentCoverageRowKey(
				row.departmentId,
				row.sectionId,
				row.positionId,
				null,
			);
			const current = positionGroups.get(key);
			if (current) {
				current.rows.push(row);
				return;
			}
			positionGroups.set(key, {
				positionId: String(row.positionId),
				positionTitle: row.positionTitle,
				departmentName: row.departmentName,
				departmentKey: row.departmentId || row.departmentName || "unassigned",
				sectionKey: row.sectionId ? row.sectionId : "unassigned-section",
				sectionName: row.sectionName,
				rows: [row],
			});
		});

		const departments = new Map<
			string,
			{
				departmentKey: string;
				departmentName: string;
				sectionGroups: Array<{
					sectionKey: string;
					sectionName: string;
					positionGroups: CoveragePositionGroup[];
					rows: PolicyCoverageRow[];
					health: ReturnType<typeof getCoverageHealth>;
				}>;
				positionsWithoutSection: CoveragePositionGroup[];
				rowsWithoutSection: PolicyCoverageRow[];
				rows: PolicyCoverageRow[];
			}
		>();

		Array.from(positionGroups.values()).forEach((group) => {
			const sortedRows = group.rows
				.slice()
				.sort((left, right) => left.levelName.localeCompare(right.levelName));
			const department =
				departments.get(group.departmentKey) ||
					{
						departmentKey: group.departmentKey,
						departmentName: group.departmentName,
						sectionGroups: [],
						positionsWithoutSection: [],
						rowsWithoutSection: [],
						rows: [],
					};

			const positionGroup = {
				positionId: group.positionId,
				positionTitle: group.positionTitle,
				rows: sortedRows,
				health: getCoverageHealth(sortedRows),
			};

			if (group.sectionKey === "unassigned-section") {
				department.positionsWithoutSection.push(positionGroup);
				department.rowsWithoutSection.push(...sortedRows);
			} else {
				let section = department.sectionGroups.find(
					(sectionGroup) => sectionGroup.sectionKey === group.sectionKey,
				);
				if (!section) {
					section = {
						sectionKey: group.sectionKey,
						sectionName: group.sectionName,
						positionGroups: [],
						rows: [],
						health: getCoverageHealth([]),
					};
					department.sectionGroups.push(section);
				}

				section.positionGroups.push(positionGroup);
				section.rows.push(...sortedRows);
				section.health = getCoverageHealth(section.rows);
			}

			department.rows.push(...sortedRows);
			departments.set(group.departmentKey, department);
		});

		return Array.from(departments.values())
			.map((group) => ({
				...group,
				health: getCoverageHealth(group.rows),
				sectionGroups: group.sectionGroups
					.map((sectionGroup) => ({
						...sectionGroup,
						health: getCoverageHealth(sectionGroup.rows),
						positionGroups: sectionGroup.positionGroups.sort((left, right) =>
							left.positionTitle.localeCompare(right.positionTitle),
						),
					}))
					.sort((left, right) =>
						left.sectionName.localeCompare(right.sectionName),
					),
				positionsWithoutSection: group.positionsWithoutSection.sort((left, right) =>
					left.positionTitle.localeCompare(right.positionTitle),
				),
				positionsWithoutSectionHealth: getCoverageHealth(group.rowsWithoutSection),
			}))
			.sort((left, right) => left.departmentName.localeCompare(right.departmentName));
	}, [coverageRows]);

	const limitBehaviorOptions: SelectOption[] = [
		{ value: "WARN", label: "Warn only" },
		{ value: "BLOCK", label: "Block request" },
	];

	const handleReset = () => {
		if (!settings) return;
		setDraft({
			...settings,
			policies: settings.policies.map((policy) => ({ ...policy })),
		});
		setCoverageRows(
			buildRecruitmentCoverageRows({
				settings,
				positions,
				employees: [],
				headcounts,
				departments,
				levels,
			}),
		);
	};

	const handleSave = async () => {
		if (!draft) return;
		if (summary.belowCurrent > 0) {
			return;
		}

		await updateMutation.mutateAsync({
			isEnabled: draft.isEnabled,
			enforceDepartmentManagerScope: draft.enforceDepartmentManagerScope,
			defaultWorkflowCode: draft.defaultWorkflowCode,
			autoCreateJobOnApproval: draft.autoCreateJobOnApproval,
			policies: [
				...serializeUnmatchedPolicies(unmatchedPolicies),
				...serializeManagedPolicies(coverageRows),
			],
		});
		onPrimarySuccess?.();
	};

	if (
		isLoadingSettings ||
		isLoadingDepartments ||
		isLoadingPositions ||
		isLoadingLevels ||
		isLoadingHeadcounts ||
		!draft
	) {
		return (
			<div className="flex min-h-[320px] items-center justify-center">
				<Loader2 className="h-8 w-8 animate-spin text-orange-600" />
			</div>
		);
	}

	const actions = (
		<>
			<Button
				type="button"
				variant="outline"
				onClick={handleReset}
				disabled={!isDirty || updateMutation.isPending}>
				Discard Changes
			</Button>
			<Button
				type="button"
				onClick={handleSave}
				disabled={!isDirty || updateMutation.isPending || summary.belowCurrent > 0}
				className="bg-orange-600 text-white hover:bg-orange-700">
				{updateMutation.isPending ? (
					<>
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						Saving...
					</>
				) : (
					primaryActionLabel
				)}
			</Button>
		</>
	);

	const content = (
		<>
			{summary.belowCurrent ? (
				<div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
					<div className="flex items-center gap-2">
						<CircleAlert className="h-4 w-4 text-red-700" />
						<p className="text-sm font-semibold text-red-900">
							{summary.belowCurrent} recruitment target
							{summary.belowCurrent === 1 ? " is" : "s are"} below current headcount
						</p>
					</div>
				</div>
			) : null}

			<div className="grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)] xl:items-start">
				<div className="space-y-3">
					<div className="rounded-lg border border-gray-200 bg-white p-3">
						<div className="overflow-hidden rounded-md border border-gray-200 bg-white">
							<ToggleTile
								label="Enable workforce recruitment"
								checked={draft.isEnabled}
								onCheckedChange={(checked) => setDraftField("isEnabled", checked)}
							/>
							<ToggleTile
								label="Restrict managers to own department"
								checked={draft.enforceDepartmentManagerScope}
								onCheckedChange={(checked) =>
									setDraftField("enforceDepartmentManagerScope", checked)
								}
							/>
							<ToggleTile
								label="Auto-create job on final approval"
								checked={draft.autoCreateJobOnApproval}
								onCheckedChange={(checked) =>
									setDraftField("autoCreateJobOnApproval", checked)
								}
							/>
						</div>
					</div>

				</div>

				<div className="rounded-lg border border-gray-200 bg-white p-3">
					<div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
						<h2 className="text-sm font-semibold text-gray-900">Recruitment Coverage</h2>
						<CoverageHealthStats health={summary} />
					</div>

					<div className="mt-3">
						{coverageRows.length ? (
							<Accordion
								type="multiple"
								defaultValue={departmentCoverageGroups
									.slice(0, 2)
									.map((group) => group.departmentKey)}
								className="overflow-hidden rounded-md border border-gray-200 bg-white">
								{departmentCoverageGroups.map((departmentGroup) => (
									<AccordionItem
										key={departmentGroup.departmentKey}
										value={departmentGroup.departmentKey}
										className="border-b border-gray-200 last:border-b-0">
										<AccordionTrigger className="rounded-none bg-neutral-100 px-4 py-3 hover:bg-neutral-50 hover:no-underline data-[state=open]:bg-neutral-50">
											<div className="flex min-w-0 flex-1 flex-col gap-2 text-left lg:flex-row lg:items-center lg:justify-between">
												<div className="min-w-0">
													<p className="truncate text-[15px] font-semibold text-gray-950">
														{departmentGroup.departmentName}
													</p>
													<p className="text-xs font-medium text-gray-500">
														{departmentGroup.sectionGroups.length} sections / {departmentGroup.rows.length} positions
													</p>
												</div>
												<CoverageHealthStats health={departmentGroup.health} />
											</div>
										</AccordionTrigger>
										<AccordionContent className="bg-white pb-0">
											<div className="space-y-2 bg-white p-2 sm:p-3">
												{departmentGroup.sectionGroups.length ? (
													<Accordion
														type="multiple"
														defaultValue={departmentGroup.sectionGroups
															.slice(0, 4)
															.map((sectionGroup) => sectionGroup.sectionKey)}
														className="space-y-2">
														{departmentGroup.sectionGroups.map((sectionGroup) => (
															<AccordionItem
																key={sectionGroup.sectionKey}
																value={sectionGroup.sectionKey}
																className="overflow-hidden rounded-md border border-gray-200 bg-white">
																<AccordionTrigger className="bg-white px-3 py-2.5 hover:no-underline data-[state=open]:border-b data-[state=open]:border-gray-100 data-[state=open]:bg-neutral-50">
																	<div className="flex min-w-0 flex-1 flex-col gap-2 text-left lg:flex-row lg:items-center lg:justify-between">
																		<div className="min-w-0">
																			<p className="truncate text-sm font-semibold text-gray-900">
																				{sectionGroup.sectionName}
																			</p>
																			<p className="text-xs font-medium text-gray-500">
																				{sectionGroup.positionGroups.length} positions / {sectionGroup.rows.length} targets
																			</p>
																		</div>
																		<CoverageHealthStats
																			health={sectionGroup.health}
																			showBelow={false}
																		/>
																	</div>
																</AccordionTrigger>
																<AccordionContent className="bg-white pb-0">
																	<div className="bg-white">
																		<CoveragePositionAccordions
																			positionGroups={sectionGroup.positionGroups}
																			limitBehaviorOptions={limitBehaviorOptions}
																			onCoverageFieldChange={setCoverageField}
																		/>
																	</div>
																</AccordionContent>
															</AccordionItem>
														))}
													</Accordion>
												) : null}
												{departmentGroup.positionsWithoutSection.length ? (
													<div className="overflow-hidden rounded-md border border-gray-200 bg-white">
														<div className="flex min-w-0 flex-col gap-2 border-b border-gray-100 bg-neutral-50 px-3 py-2.5 text-left lg:flex-row lg:items-center lg:justify-between">
															<div className="min-w-0">
																<p className="truncate text-sm font-semibold text-gray-900">
																	No section on employee record
																</p>
																<p className="text-xs font-medium text-gray-500">
																	{departmentGroup.positionsWithoutSection.length} positions / {departmentGroup.rowsWithoutSection.length} targets
																</p>
															</div>
															<CoverageHealthStats
																health={departmentGroup.positionsWithoutSectionHealth}
																showBelow={false}
															/>
														</div>
														<div className="bg-white">
															<CoveragePositionAccordions
																positionGroups={departmentGroup.positionsWithoutSection}
																limitBehaviorOptions={limitBehaviorOptions}
																onCoverageFieldChange={setCoverageField}
															/>
														</div>
													</div>
												) : null}
											</div>
										</AccordionContent>
									</AccordionItem>
								))}
							</Accordion>
					) : (
						<div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
							No recruitment coverage found
						</div>
					)}
				</div>
			</div>
			</div>

			{!showHeader ? <div className="flex flex-wrap justify-end gap-3">{actions}</div> : null}
		</>
	);

	if (showHeader) {
		return (
			<RulesPoliciesShell title="Workforce Recruitment" actions={actions}>
				{content}
			</RulesPoliciesShell>
		);
	}

	return <div className="w-full space-y-3 p-0">{content}</div>;
}

export default WorkforceRecruitmentSettingsModule;
