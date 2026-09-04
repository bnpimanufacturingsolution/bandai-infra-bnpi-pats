import { useState } from "react";
import { BookOpen, Edit, Eye, Gavel, MoreVertical, Plus, RotateCw, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { Badge } from "~/components/atoms/Badge";
import { Modal } from "~/components/atoms/Modal";
import { Switch } from "~/components/ui/switch";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	disciplinaryRulesService,
	type DisciplinaryRule,
	type DisciplinaryRuleCategory,
	type DisciplinaryRuleSeverity,
	type DisciplinaryRulePayload,
} from "~/services/disciplinaryRules.service";

const CATEGORIES: SelectOption[] = [
	{ value: "ATTENDANCE", label: "Attendance" },
	{ value: "PUNCTUALITY", label: "Punctuality" },
	{ value: "BEHAVIOR", label: "Behavior" },
	{ value: "MISCONDUCT", label: "Misconduct" },
	{ value: "PERFORMANCE", label: "Performance" },
	{ value: "SAFETY", label: "Safety" },
	{ value: "POLICY_VIOLATION", label: "Policy Violation" },
	{ value: "HARASSMENT", label: "Harassment" },
	{ value: "DRESS_CODE", label: "Dress Code" },
	{ value: "OTHER", label: "Other" },
];

const SEVERITIES: SelectOption[] = [
	{ value: "LOW", label: "Low" },
	{ value: "MEDIUM", label: "Medium" },
	{ value: "HIGH", label: "High" },
	{ value: "CRITICAL", label: "Critical" },
];

const severityTextColor = (severity: DisciplinaryRuleSeverity) => {
	switch (severity) {
		case "LOW":
			return "text-green-600 font-semibold";
		case "MEDIUM":
			return "text-yellow-600 font-semibold";
		case "HIGH":
			return "text-red-600 font-semibold";
		case "CRITICAL":
			return "text-red-700 font-bold";
	}
};

const AUTO_ESCALATION_CODE = "DISC-ATT-004";

const SEVERITY_TIERS: Array<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL"> = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const STANDARD_STEP_HINTS: Record<(typeof SEVERITY_TIERS)[number], { action: string; employeeStep: string; managerStep: string; responseWindowDays: number }> = {
	LOW: {
		action: "Verbal counseling / documented coaching",
		employeeStep: "Attend coaching with your supervisor and acknowledge expectations; correct the behavior immediately.",
		managerStep: "Conduct private counseling, document the outcome, inform HR.",
		responseWindowDays: 0,
	},
	MEDIUM: {
		action: "Written warning + counseling",
		employeeStep: "Receive and sign the written warning; submit a written explanation within 5 calendar days.",
		managerStep: "Issue the written warning with HR, secure acknowledgment, file in the 201 record.",
		responseWindowDays: 5,
	},
	HIGH: {
		action: "Final written warning / suspension + notice to explain",
		employeeStep: "Respond to the Notice to Explain in writing within 5 calendar days and attend the administrative hearing (a representative may accompany).",
		managerStep: "Lead the investigation with HR, serve the NTE, schedule the hearing, recommend the decision.",
		responseWindowDays: 5,
	},
	CRITICAL: {
		action: "Termination process (twin-notice) with management escalation",
		employeeStep: "Respond to the Notice to Explain in writing within 5 calendar days and attend the hearing with counsel/representative of choice.",
		managerStep: "Escalate to HR + management; run the two-notice due process (NTE, hearing, Notice of Decision).",
		responseWindowDays: 5,
	},
};

const emptyPlanStep = () => ({ action: "", employeeStep: "", managerStep: "", responseWindowDays: null as number | null });

interface RuleFormData {
	code: string;
	title: string;
	category: DisciplinaryRuleCategory;
	severity: DisciplinaryRuleSeverity;
	description: string;
	consequences: string;
	consequencePlan: Partial<Record<(typeof SEVERITY_TIERS)[number], { action: string; employeeStep: string; managerStep: string; responseWindowDays: number | null }>>;
	isActive: boolean;
}

const emptyForm = (): RuleFormData => ({
	code: "",
	title: "",
	category: "ATTENDANCE",
	severity: "MEDIUM",
	description: "",
	consequences: "",
	consequencePlan: {},
	isActive: true,
});

const planFromRule = (rule: DisciplinaryRule | null): RuleFormData["consequencePlan"] => {
	const plan: RuleFormData["consequencePlan"] = {};
	for (const tier of SEVERITY_TIERS) {
		const step = rule?.consequencePlan?.[tier];
		if (step && (step.action || step.employeeStep)) {
			plan[tier] = {
				action: step.action || "",
				employeeStep: step.employeeStep || "",
				managerStep: step.managerStep || "",
				responseWindowDays: step.responseWindowDays ?? null,
			};
		}
	}
	return plan;
};

export default function AdminDisciplinaryRuleBookPage() {
	const queryClient = useQueryClient();
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [isViewModalOpen, setIsViewModalOpen] = useState(false);
	const [editing, setEditing] = useState<DisciplinaryRule | null>(null);
	const [viewing, setViewing] = useState<DisciplinaryRule | null>(null);
	const [categoryFilter, setCategoryFilter] = useState("all");
	const [severityFilter, setSeverityFilter] = useState("all");
	const [form, setForm] = useState<RuleFormData>(emptyForm());
	const [page, setPage] = useState(1);

	const { data, isLoading } = useQuery({
		queryKey: ["disciplinary-rules", page, categoryFilter, severityFilter],
		queryFn: () =>
			disciplinaryRulesService.list({
				page,
				limit: 10,
				category: categoryFilter === "all" ? undefined : (categoryFilter as DisciplinaryRuleCategory),
				severity: severityFilter === "all" ? undefined : (severityFilter as DisciplinaryRuleSeverity),
			}),
	});

	const rules = data?.rules || [];
	const total = data?.count || 0;
	const totalPages = data?.pagination?.totalPages || Math.max(1, Math.ceil(total / 10));

	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: ["disciplinary-rules"] });

	const openCreate = () => {
		setEditing(null);
		setForm({ ...emptyForm(), consequencePlan: planFromRule(null) });
		setIsModalOpen(true);
	};

	const openEdit = (rule: DisciplinaryRule) => {
		setEditing(rule);
		setForm({
			code: rule.code || "",
			title: rule.title,
			category: rule.category,
			severity: rule.severity,
			description: rule.description,
			consequences: rule.consequences || "",
			consequencePlan: planFromRule(rule),
			isActive: rule.isActive,
		});
		setIsModalOpen(true);
	};

	const onSubmit = async () => {
		if (!form.title || !form.description) {
			toast.error("Title and description are required");
			return;
		}
		try {
			// Only tiers with content are sent; empty tiers fall back to the
			// standard progressive-discipline plan at notification time.
			const consequencePlan: DisciplinaryRulePayload["consequencePlan"] = {};
			for (const tier of SEVERITY_TIERS) {
				const step = form.consequencePlan[tier];
				if (step && (step.action || step.employeeStep)) {
					consequencePlan[tier] = {
						action: step.action || "",
						employeeStep: step.employeeStep || "",
						managerStep: step.managerStep || null,
						responseWindowDays: step.responseWindowDays ?? null,
					};
				}
			}
			const payload: DisciplinaryRulePayload = {
				code: form.code || undefined,
				title: form.title,
				category: form.category,
				severity: form.severity,
				description: form.description,
				consequences: form.consequences || undefined,
				consequencePlan,
				isActive: form.isActive,
			};
			if (editing) {
				await disciplinaryRulesService.update(editing.id, payload);
				toast.success("Rule updated");
			} else {
				await disciplinaryRulesService.create(payload);
				toast.success("Rule created");
			}
			setIsModalOpen(false);
			refresh();
		} catch (error: any) {
			toast.error(error?.message || "Failed to save rule");
		}
	};

	const handleDelete = async (rule: DisciplinaryRule) => {
		if (!window.confirm(`Delete rule "${rule.title}"?`)) return;
		try {
			await disciplinaryRulesService.remove(rule.id);
			toast.success("Rule deleted");
			refresh();
		} catch (error: any) {
			toast.error(error?.message || "Failed to delete rule");
		}
	};

	const toggleActive = async (rule: DisciplinaryRule) => {
		try {
			await disciplinaryRulesService.update(rule.id, { isActive: !rule.isActive });
			toast.success(rule.isActive ? "Rule deactivated" : "Rule activated");
			refresh();
		} catch (error: any) {
			toast.error(error?.message || "Failed to toggle rule");
		}
	};

	const columns: Column<DisciplinaryRule>[] = [
		{
			key: "code",
			label: "Code",
			width: "12%",
			render: (_value, rule) => (
				<span className={`font-mono text-xs ${rule.code === AUTO_ESCALATION_CODE ? "font-bold text-orange-700" : "text-gray-500"}`}>
					{rule.code || "-"}
					{rule.code === AUTO_ESCALATION_CODE ? (
						<span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-orange-100 px-1 py-0.5 text-[10px] font-medium text-orange-800">
							<Gavel className="h-3 w-3" />
							auto
						</span>
					) : null}
				</span>
			),
		},
		{
			key: "title",
			label: "Title",
			width: "32%",
			render: (_value, rule) => (
				<span className="block truncate text-sm font-medium text-gray-900">{rule.title}</span>
			),
		},
		{
			key: "category",
			label: "Category",
			width: "16%",
			render: (_value, rule) => (
				<span className="block truncate text-sm text-gray-600">
					{rule.category.replaceAll("_", " ")}
				</span>
			),
		},
		{
			key: "severity",
			label: "Severity",
			width: "10%",
			render: (_value, rule) => (
				<span className={severityTextColor(rule.severity)}>{rule.severity}</span>
			),
		},
		{
			key: "isActive",
			label: "Active",
			width: "8%",
			render: (_value, rule) => (
				<Switch
					checked={rule.isActive}
					onCheckedChange={() => toggleActive(rule)}
					className="data-[state=checked]:bg-orange-600"
				/>
			),
		},
		{
			key: "rowActions",
			label: "Actions",
			width: "12%",
			render: (_value, rule) => (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" size="sm" className="flex items-center justify-center w-8 h-8 p-0">
							<MoreVertical className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-48">
						<DropdownMenuItem onClick={() => { setViewing(rule); setIsViewModalOpen(true); }}>
							<Eye className="h-4 w-4 mr-2" />
							View Details
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => openEdit(rule)}>
							<Edit className="h-4 w-4 mr-2" />
							Edit
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => handleDelete(rule)}
							className="text-red-600 focus:text-red-600 focus:bg-red-50">
							<Trash2 className="h-4 w-4 mr-2" />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			),
		},
	];

	const categoryOptions: SelectOption[] = [
		{ value: "all", label: "All Categories" },
		...CATEGORIES,
	];

	const severityOptions: SelectOption[] = [
		{ value: "all", label: "All Severities" },
		...SEVERITIES,
	];

	return (
		<div className="flex h-full min-h-0 flex-col gap-6 p-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-lg font-semibold text-slate-950">Disciplinary Rule Book</h1>
					<p className="text-sm text-slate-500">
						Progressive-discipline rulebook with severity and status tracking.
					</p>
				</div>
				<Button onClick={openCreate}>
					<Plus className="mr-2 h-4 w-4" />
					Add Rule
				</Button>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<div className="w-full md:w-44">
					<Select
						options={categoryOptions}
						value={categoryFilter}
						onChange={(value) => {
							setCategoryFilter(value);
							setPage(1);
						}}
					/>
				</div>
				<div className="w-full md:w-44">
					<Select
						options={severityOptions}
						value={severityFilter}
						onChange={(value) => {
							setSeverityFilter(value);
							setPage(1);
						}}
					/>
				</div>
				<Button type="button" variant="outline" className="h-9 rounded-md" onClick={() => refresh()}>
					<RotateCw className="h-4 w-4" />
					Refresh
				</Button>
			</div>

			<DataTable
				title="Rules"
				data={rules}
				columns={columns}
				isLoading={isLoading}
				emptyMessage="No disciplinary rules found"
				emptyDescription="Click Add Rule to create the first rule in the rulebook."
				density="compact"
				itemsPerPage={10}
				currentPage={page}
				totalItems={total}
				totalPages={totalPages}
				onPageChange={setPage}
				showSearch={false}
				containedScroll
			/>

			<Modal
				open={isModalOpen}
				onOpenChange={setIsModalOpen}
				title={editing ? "Edit rule" : "Add rule"}>
				<div className="space-y-3">
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
						<div>
							<label className="mb-1 block text-sm font-medium">Code</label>
							<Input
								placeholder="e.g. DISC-ATT-006"
								value={form.code}
								onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
							/>
						</div>
						<div>
							<label className="mb-1 block text-sm font-medium">Category</label>
							<Select
								options={CATEGORIES}
								value={form.category}
								onChange={(value) =>
									setForm((prev) => ({ ...prev, category: value as DisciplinaryRuleCategory }))
								}
							/>
						</div>
					</div>
					<div>
						<label className="mb-1 block text-sm font-medium">Title</label>
						<Input
							value={form.title}
							onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
						/>
					</div>
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
						<div>
							<label className="mb-1 block text-sm font-medium">Severity</label>
							<Select
								options={SEVERITIES}
								value={form.severity}
								onChange={(value) =>
									setForm((prev) => ({
										...prev,
										severity: value as DisciplinaryRuleSeverity,
									}))
								}
							/>
						</div>
						<div className="flex items-end pb-2">
							<div className="flex items-center gap-2">
								<Switch
									checked={form.isActive}
									onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))}
									className="data-[state=checked]:bg-orange-600"
								/>
								<span className="text-sm text-gray-600">Active</span>
							</div>
						</div>
					</div>
					<div>
						<label className="mb-1 block text-sm font-medium">Description</label>
						<textarea
							className="min-h-[70px] w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
							value={form.description}
							onChange={(event) =>
								setForm((prev) => ({ ...prev, description: event.target.value }))
							}
						/>
					</div>
					<div>
						<label className="mb-1 block text-sm font-medium">Consequences</label>
						<textarea
							className="min-h-[60px] w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
							value={form.consequences}
							onChange={(event) =>
								setForm((prev) => ({ ...prev, consequences: event.target.value }))
							}
						/>
					</div>
					<div>
						<label className="mb-1 block text-sm font-medium">
							Consequence plan — next steps per severity tier
						</label>
						<p className="mb-2 text-xs text-slate-500">
							Used when a case becomes official: the employee and their manager are notified with the matching tier's next step. Empty tiers fall back to the standard progressive-discipline ladder.
						</p>
						<div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-neutral-200 p-2">
							{SEVERITY_TIERS.map((tier) => {
								const step = form.consequencePlan[tier] || emptyPlanStep();
								return (
									<div key={tier} className="rounded-md border border-neutral-100 bg-neutral-50 p-2">
										<div className="mb-1.5 flex items-center justify-between">
											<span className={`text-xs font-bold ${tier === "CRITICAL" ? "text-red-700" : tier === "HIGH" ? "text-red-600" : tier === "MEDIUM" ? "text-yellow-600" : "text-green-600"}`}>
												{tier}
											</span>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="h-6 px-2 text-xs"
												onClick={() =>
													setForm((prev) => ({
														...prev,
														consequencePlan: {
															...prev.consequencePlan,
															[tier]: { ...STANDARD_STEP_HINTS[tier] },
														},
													}))
												}>
												Insert standard
											</Button>
										</div>
										<Input
											placeholder="Action (e.g. Written warning + counseling)"
											className="mb-1.5"
											value={step.action}
											onChange={(event) =>
												setForm((prev) => ({
													...prev,
													consequencePlan: {
														...prev.consequencePlan,
														[tier]: { ...(prev.consequencePlan[tier] || emptyPlanStep()), action: event.target.value },
													},
												}))
											}
										/>
										<textarea
											className="mb-1.5 w-full rounded-md border border-neutral-200 px-2 py-1.5 text-xs"
											placeholder="Employee next step"
											value={step.employeeStep}
											onChange={(event) =>
												setForm((prev) => ({
													...prev,
													consequencePlan: {
														...prev.consequencePlan,
														[tier]: { ...(prev.consequencePlan[tier] || emptyPlanStep()), employeeStep: event.target.value },
													},
												}))
											}
										/>
										<textarea
											className="mb-1.5 w-full rounded-md border border-neutral-200 px-2 py-1.5 text-xs"
											placeholder="Manager next step"
											value={step.managerStep}
											onChange={(event) =>
												setForm((prev) => ({
													...prev,
													consequencePlan: {
														...prev.consequencePlan,
														[tier]: { ...(prev.consequencePlan[tier] || emptyPlanStep()), managerStep: event.target.value },
													},
												}))
											}
										/>
										<Input
											type="number"
											min={0}
											max={90}
											placeholder="Response window (days)"
											value={step.responseWindowDays ?? ""}
											onChange={(event) =>
												setForm((prev) => ({
													...prev,
													consequencePlan: {
														...prev.consequencePlan,
														[tier]: {
															...(prev.consequencePlan[tier] || emptyPlanStep()),
															responseWindowDays: event.target.value === "" ? null : Number(event.target.value),
														},
													},
												}))
											}
										/>
									</div>
								);
							})}
						</div>
					</div>
					<div className="flex justify-end gap-2 pt-2">
						<Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
							Cancel
						</Button>
						<Button type="button" onClick={onSubmit}>
							{editing ? "Save changes" : "Create rule"}
						</Button>
					</div>
				</div>
			</Modal>

			<Modal
				open={isViewModalOpen}
				onOpenChange={setIsViewModalOpen}
				title="Rule details">
				{viewing ? (
					<div className="space-y-2 text-sm">
						<div className="flex items-center gap-2">
							<BookOpen className="h-4 w-4 text-orange-500" />
							<span className="font-semibold">
								{viewing.code || "No code"} — {viewing.title}
							</span>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-sm text-gray-600">{viewing.category.replaceAll("_", " ")}</span>
							<span className={severityTextColor(viewing.severity)}>{viewing.severity}</span>
							<Badge variant={viewing.isActive ? "success" : "secondary"}>
								{viewing.isActive ? "Active" : "Inactive"}
							</Badge>
						</div>
						<p>
							<span className="text-slate-500">Description:</span> {viewing.description}
						</p>
						{viewing.consequences ? (
							<p>
								<span className="text-slate-500">Consequences:</span> {viewing.consequences}
							</p>
						) : null}
						{SEVERITY_TIERS.map((tier) => {
							const step = viewing.consequencePlan?.[tier];
							if (!step || (!step.action && !step.employeeStep)) return null;
							return (
								<div key={tier} className="rounded-md border border-neutral-200 bg-neutral-50 p-2">
									<p className={`text-xs font-bold ${tier === "CRITICAL" ? "text-red-700" : tier === "HIGH" ? "text-red-600" : tier === "MEDIUM" ? "text-yellow-600" : "text-green-600"}`}>
										{tier}: {step.action}
									</p>
									{step.employeeStep ? (
										<p className="mt-0.5 text-xs text-slate-600">
											<span className="font-medium">Employee:</span> {step.employeeStep}
											{step.responseWindowDays ? ` (${step.responseWindowDays} day(s) to respond)` : ""}
										</p>
									) : null}
									{step.managerStep ? (
										<p className="mt-0.5 text-xs text-slate-600">
											<span className="font-medium">Manager:</span> {step.managerStep}
										</p>
									) : null}
								</div>
							);
						})}
					</div>
				) : null}
			</Modal>
		</div>
	);
}