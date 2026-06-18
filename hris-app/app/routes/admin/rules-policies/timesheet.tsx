import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, Clock3, Loader2, RotateCw, Save, ShieldCheck } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { ConstraintTokenRow } from "~/components/molecules/ConstraintTokens";
import { RulesPoliciesShell } from "~/components/templates/admin/rules-policies-shell";
import { Switch } from "~/components/ui/switch";
import { useTimesheetConfig, useUpdateTimesheetConfig } from "~/lib/hooks/useTimesheets";
import type {
	OvertimeQualificationRule,
	PayrollFinalizationRule,
	RoundingIncrementMinutes,
	RoundingMode,
	TimesheetConfig,
	WorkTimeRoundingRule,
} from "~/services/timesheet.service";

type TimesheetRuleDraft = {
	enableEditBeforeSubmission: boolean;
	enableAutoApprove: boolean;
	rejectBehavior: "REVISE" | "REJECT";
	workTimeRounding: WorkTimeRoundingRule;
	overtimeQualification: OvertimeQualificationRule;
	payrollFinalization: PayrollFinalizationRule;
};

const INCREMENT_OPTIONS: SelectOption[] = [1, 5, 10, 15, 30, 60].map((value) => ({
	value: String(value),
	label: `${value} min`,
}));

const ROUNDING_MODE_OPTIONS: SelectOption[] = [
	{ value: "NONE", label: "No rounding" },
	{ value: "NEAREST", label: "Nearest" },
	{ value: "UP", label: "Round up" },
	{ value: "DOWN", label: "Round down" },
];

const OVERTIME_ROUNDING_MODE_OPTIONS = ROUNDING_MODE_OPTIONS.filter(
	(option) => option.value !== "NONE",
);

const APPLY_TO_OPTIONS: SelectOption[] = [
	{ value: "WORKED_MINUTES", label: "Worked minutes" },
	{ value: "PAYABLE_MINUTES", label: "Payable minutes" },
];

const REJECT_BEHAVIOR_OPTIONS: SelectOption[] = [
	{ value: "REVISE", label: "Return for revision" },
	{ value: "REJECT", label: "Reject outright" },
];

const defaultDraft: TimesheetRuleDraft = {
	enableEditBeforeSubmission: true,
	enableAutoApprove: false,
	rejectBehavior: "REVISE",
	workTimeRounding: {
		enabled: false,
		incrementMinutes: 1,
		mode: "NONE",
		applyTo: "WORKED_MINUTES",
	},
	overtimeQualification: {
		enabled: true,
		minimumMinutesBeforeQualification: 60,
		rounding: {
			enabled: false,
			incrementMinutes: 15,
			mode: "NEAREST",
		},
		basis: "POST_SHIFT_EXCESS",
	},
	payrollFinalization: {
		enabled: true,
		lockTimesheetOnCutoffFinalization: true,
		allowUnlockWithAuthorizedPayrollRun: false,
		freezeComputedValuesOnLock: true,
	},
};

const normalizeConfigDraft = (config?: TimesheetConfig): TimesheetRuleDraft => ({
	enableEditBeforeSubmission: config?.enableEditBeforeSubmission ?? defaultDraft.enableEditBeforeSubmission,
	enableAutoApprove: config?.enableAutoApprove ?? defaultDraft.enableAutoApprove,
	rejectBehavior: config?.rejectBehavior ?? defaultDraft.rejectBehavior,
	workTimeRounding: config?.workTimeRounding ?? defaultDraft.workTimeRounding,
	overtimeQualification: config?.overtimeQualification ?? {
		...defaultDraft.overtimeQualification,
		minimumMinutesBeforeQualification:
			config?.overtimeFlagThresholdMinutes ??
			defaultDraft.overtimeQualification.minimumMinutesBeforeQualification,
	},
	payrollFinalization: config?.payrollFinalization ?? defaultDraft.payrollFinalization,
});

const toIncrement = (value: string): RoundingIncrementMinutes =>
	(Number(value) as RoundingIncrementMinutes) || 1;

const toPositiveInt = (value: string, fallback = 0) => {
	const parsed = Math.floor(Number(value));
	return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
};

export default function AdminTimesheetRulesPage() {
	const { data: config, isLoading } = useTimesheetConfig();
	const updateConfig = useUpdateTimesheetConfig();
	const [draft, setDraft] = useState<TimesheetRuleDraft>(defaultDraft);

	useEffect(() => {
		if (config) setDraft(normalizeConfigDraft(config));
	}, [config]);

	const baseline = useMemo(() => normalizeConfigDraft(config), [config]);
	const isDirty = JSON.stringify(draft) !== JSON.stringify(baseline);
	const isSaving = updateConfig.isPending;

	const saveDraft = async () => {
		await updateConfig.mutateAsync({
			enableEditBeforeSubmission: draft.enableEditBeforeSubmission,
			enableAutoApprove: draft.enableAutoApprove,
			rejectBehavior: draft.rejectBehavior,
			overtimeFlagThresholdMinutes:
				draft.overtimeQualification.minimumMinutesBeforeQualification,
			workTimeRounding: draft.workTimeRounding,
			overtimeQualification: draft.overtimeQualification,
			payrollFinalization: draft.payrollFinalization,
		});
	};

	const headerActions = (
		<>
			<Button
				type="button"
				variant="outline"
				className="h-9 rounded-md"
				disabled={!isDirty || isSaving}
				onClick={() => setDraft(baseline)}>
				<RotateCw className="h-4 w-4" />
				Discard
			</Button>
			<Button
				type="button"
				className="h-9 rounded-md bg-orange-600 text-white hover:bg-orange-700"
				disabled={!isDirty || isSaving}
				onClick={saveDraft}>
				{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
				{isSaving ? "Saving..." : "Save Changes"}
			</Button>
		</>
	);

	if (isLoading) {
		return (
			<RulesPoliciesShell title="Timesheet Settings" actions={headerActions}>
				<div className="flex min-h-[320px] items-center justify-center rounded-lg border border-gray-200 bg-white">
					<Loader2 className="h-7 w-7 animate-spin text-orange-600" />
				</div>
			</RulesPoliciesShell>
		);
	}

	return (
		<RulesPoliciesShell title="Timesheet Settings" actions={headerActions}>
			<div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
				<section className="min-w-0 rounded-lg border border-gray-200 bg-white p-3">
					<SectionHeader icon={<Clock3 className="h-4 w-4" />} title="Work Time And Overtime" />
					<div className="mt-3 overflow-hidden rounded-md border border-gray-200 bg-white">
						<RowToggle
							label="Work Time Rounding"
							checked={draft.workTimeRounding.enabled}
							onCheckedChange={(enabled) =>
								setDraft((current) => ({
									...current,
									workTimeRounding: { ...current.workTimeRounding, enabled },
								}))
							}
						/>
						<div className="grid gap-3 border-t border-gray-100 px-3 py-3 md:grid-cols-3">
							<Field label="Increment">
								<Select
									value={String(draft.workTimeRounding.incrementMinutes)}
									onChange={(value) =>
										setDraft((current) => ({
											...current,
											workTimeRounding: {
												...current.workTimeRounding,
												incrementMinutes: toIncrement(value),
											},
										}))
									}
									options={INCREMENT_OPTIONS}
									disabled={!draft.workTimeRounding.enabled || isSaving}
								/>
							</Field>
							<Field label="Mode">
								<Select
									value={draft.workTimeRounding.mode}
									onChange={(value) =>
										setDraft((current) => ({
											...current,
											workTimeRounding: {
												...current.workTimeRounding,
												mode: value as RoundingMode,
											},
										}))
									}
									options={ROUNDING_MODE_OPTIONS}
									disabled={!draft.workTimeRounding.enabled || isSaving}
								/>
							</Field>
							<Field label="Apply To">
								<Select
									value={draft.workTimeRounding.applyTo}
									onChange={(value) =>
										setDraft((current) => ({
											...current,
											workTimeRounding: {
												...current.workTimeRounding,
												applyTo: value as WorkTimeRoundingRule["applyTo"],
											},
										}))
									}
									options={APPLY_TO_OPTIONS}
									disabled={!draft.workTimeRounding.enabled || isSaving}
								/>
							</Field>
						</div>

						<RowToggle
							label="Overtime Qualification"
							checked={draft.overtimeQualification.enabled}
							onCheckedChange={(enabled) =>
								setDraft((current) => ({
									...current,
									overtimeQualification: {
										...current.overtimeQualification,
										enabled,
									},
								}))
							}
						/>
						<div className="grid gap-3 border-t border-gray-100 px-3 py-3 md:grid-cols-3">
							<Field label="Minimum Excess">
								<Input
									type="number"
									min={0}
									step={1}
									value={draft.overtimeQualification.minimumMinutesBeforeQualification}
									onChange={(event) =>
										setDraft((current) => ({
											...current,
											overtimeQualification: {
												...current.overtimeQualification,
												minimumMinutesBeforeQualification: toPositiveInt(
													event.target.value,
													0,
												),
											},
										}))
									}
									className="h-10 rounded-md border-gray-200 bg-white text-sm"
									disabled={!draft.overtimeQualification.enabled || isSaving}
								/>
								<ConstraintTokenRow tokens={[{ label: "Minutes", tone: "subtle" }]} />
							</Field>
							<Field label="OT Round Increment">
								<Select
									value={String(draft.overtimeQualification.rounding.incrementMinutes)}
									onChange={(value) =>
										setDraft((current) => ({
											...current,
											overtimeQualification: {
												...current.overtimeQualification,
												rounding: {
													...current.overtimeQualification.rounding,
													incrementMinutes: toIncrement(value),
												},
											},
										}))
									}
									options={INCREMENT_OPTIONS}
									disabled={!draft.overtimeQualification.enabled || isSaving}
								/>
							</Field>
							<Field label="OT Round Mode">
								<Select
									value={draft.overtimeQualification.rounding.mode}
									onChange={(value) =>
										setDraft((current) => ({
											...current,
											overtimeQualification: {
												...current.overtimeQualification,
												rounding: {
													...current.overtimeQualification.rounding,
													mode: value as OvertimeQualificationRule["rounding"]["mode"],
												},
											},
										}))
									}
									options={OVERTIME_ROUNDING_MODE_OPTIONS}
									disabled={!draft.overtimeQualification.enabled || isSaving}
								/>
							</Field>
						</div>
					</div>
				</section>

				<section className="min-w-0 rounded-lg border border-gray-200 bg-white p-3">
					<SectionHeader icon={<ShieldCheck className="h-4 w-4" />} title="Review And Locking" />
					<div className="mt-3 overflow-hidden rounded-md border border-gray-200 bg-white">
						<RowToggle
							label="Employee Edit Before Submit"
							checked={draft.enableEditBeforeSubmission}
							onCheckedChange={(enableEditBeforeSubmission) =>
								setDraft((current) => ({ ...current, enableEditBeforeSubmission }))
							}
						/>
						<RowToggle
							label="Auto Approve Timesheet"
							checked={draft.enableAutoApprove}
							onCheckedChange={(enableAutoApprove) =>
								setDraft((current) => ({ ...current, enableAutoApprove }))
							}
							disabled
						/>
						<div className="border-t border-gray-100 px-3 py-3">
							<Field label="Reject Behavior">
								<Select
									value={draft.rejectBehavior}
									onChange={(value) =>
										setDraft((current) => ({
											...current,
											rejectBehavior: value as TimesheetRuleDraft["rejectBehavior"],
										}))
									}
									options={REJECT_BEHAVIOR_OPTIONS}
									disabled={isSaving}
								/>
							</Field>
						</div>
						<RowToggle
							label="Payroll Finalization"
							checked={draft.payrollFinalization.enabled}
							onCheckedChange={(enabled) =>
								setDraft((current) => ({
									...current,
									payrollFinalization: { ...current.payrollFinalization, enabled },
								}))
							}
						/>
						<RowToggle
							label="Lock On Cutoff"
							checked={draft.payrollFinalization.lockTimesheetOnCutoffFinalization}
							onCheckedChange={(lockTimesheetOnCutoffFinalization) =>
								setDraft((current) => ({
									...current,
									payrollFinalization: {
										...current.payrollFinalization,
										lockTimesheetOnCutoffFinalization,
									},
								}))
							}
							disabled={!draft.payrollFinalization.enabled}
						/>
						<RowToggle
							label="Freeze Computed Values"
							checked={draft.payrollFinalization.freezeComputedValuesOnLock}
							onCheckedChange={(freezeComputedValuesOnLock) =>
								setDraft((current) => ({
									...current,
									payrollFinalization: {
										...current.payrollFinalization,
										freezeComputedValuesOnLock,
									},
								}))
							}
							disabled={!draft.payrollFinalization.enabled}
						/>
					</div>
				</section>
			</div>

			<section className="rounded-lg border border-gray-200 bg-white p-3">
				<SectionHeader icon={<CheckCircle2 className="h-4 w-4" />} title="Source Of Truth Snapshot" />
				<div className="mt-3 grid gap-0 overflow-hidden rounded-md border border-gray-200 divide-y divide-gray-100 md:grid-cols-3 md:divide-x md:divide-y-0">
					<Snapshot label="Work rounding" value={draft.workTimeRounding.enabled ? `${draft.workTimeRounding.mode} / ${draft.workTimeRounding.incrementMinutes} min` : "Off"} />
					<Snapshot label="OT threshold" value={draft.overtimeQualification.enabled ? `${draft.overtimeQualification.minimumMinutesBeforeQualification} min excess` : "Off"} />
					<Snapshot label="Payroll lock" value={draft.payrollFinalization.lockTimesheetOnCutoffFinalization ? "Cutoff finalization" : "Manual only"} />
				</div>
			</section>
		</RulesPoliciesShell>
	);
}

function SectionHeader({ icon, title }: { icon: ReactNode; title: string }) {
	return (
		<div className="flex min-h-10 items-center gap-2 border-b border-gray-100 pb-3">
			<span className="text-orange-600">{icon}</span>
			<h2 className="text-sm font-semibold text-gray-900">{title}</h2>
		</div>
	);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="min-w-0 space-y-1.5">
			<label className="text-xs font-medium text-gray-600">{label}</label>
			{children}
		</div>
	);
}

function RowToggle({
	label,
	checked,
	disabled,
	onCheckedChange,
}: {
	label: string;
	checked: boolean;
	disabled?: boolean;
	onCheckedChange: (checked: boolean) => void;
}) {
	return (
		<div className="flex min-h-10 items-center justify-between gap-3 border-t border-gray-100 px-3 py-2 first:border-t-0">
			<p className="min-w-0 break-words text-sm font-medium text-gray-900">{label}</p>
			<Switch
				checked={checked}
				disabled={disabled}
				onCheckedChange={onCheckedChange}
				className="shrink-0 data-[state=checked]:bg-orange-600"
			/>
		</div>
	);
}

function Snapshot({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0 px-3 py-2.5">
			<p className="text-xs font-medium text-gray-500">{label}</p>
			<p className="mt-1 truncate text-sm font-semibold text-gray-900">{value}</p>
		</div>
	);
}
