import { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { useNavigate } from "react-router";
import { mockChecklistResponse, type ChecklistItemMock } from "~/lib/mock-checklist-data";
import { useAuth } from "~/lib/hooks/use-auth";
import {
	useCreateOnboardingChecklist,
	useOnboardingRoster,
	useOnboardingTemplates,
	useOnboardingVisibleChecklist,
	useSignOnboardingItem,
	useUnsignOnboardingItem,
} from "~/lib/hooks/useOnboarding";
import type { OnboardingVisibleItem } from "~/zod/onboarding";

// ---------------------------------------------------------------------------
// Mock/demo fallback renderer (used when the live onboarding API is unavailable)
// ---------------------------------------------------------------------------

function buildTree(items: ChecklistItemMock[]): Map<string | null, ChecklistItemMock[]> {
	const map = new Map<string | null, ChecklistItemMock[]>();
	for (const item of items) {
		const key = item.parentId ?? null;
		const arr = map.get(key) ?? [];
		arr.push(item);
		map.set(key, arr);
	}
	for (const [key, arr] of map) {
		map.set(
			key,
			arr.sort((a, b) => a.order - b.order),
		);
	}
	return map;
}

function MockRow({
	item,
	childrenMap,
}: {
	item: ChecklistItemMock;
	childrenMap: Map<string | null, ChecklistItemMock[]>;
}) {
	const children = childrenMap.get(item.id) ?? [];
	const isParent = children.length > 0;
	const depth = item.number.split(".").length - 1;

	return (
		<>
			<tr className={`border-b hover:bg-gray-50 ${isParent ? "bg-gray-50/50" : ""}`}>
				<td className={`px-4 py-2 text-sm text-gray-900 ${depth > 0 ? "pl-8" : ""}`}>
					{item.number}
				</td>
				<td className={`px-4 py-2 text-sm text-gray-900 ${isParent ? "font-medium" : ""}`}>
					{item.title}
				</td>
				<td className="px-4 py-2 text-sm text-gray-600">{item.responsibleDepartment}</td>
				<td className="px-4 py-2 text-center">
					<div
						className={`mx-auto flex h-5 w-5 items-center justify-center rounded border-2 ${
							item.completed ? "border-purple-500 bg-purple-500" : "border-gray-300"
						}`}>
						{item.completed && (
							<svg
								className="h-3 w-3 text-white"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={3}
									d="M5 13l4 4L19 7"
								/>
							</svg>
						)}
					</div>
				</td>
				<td className="px-4 py-2 text-sm text-gray-600">{item.dateCompleted || ""}</td>
				<td className="px-4 py-2 text-sm text-gray-600">{item.remarks}</td>
			</tr>
			{children.map((child) => (
				<MockRow key={child.id} item={child} childrenMap={childrenMap} />
			))}
		</>
	);
}

function MockChecklistTable() {
	const items = mockChecklistResponse.items;
	const childrenMap = useMemo(() => buildTree(items), [items]);
	const sectionItems = useMemo(() => {
		const map = new Map<string, ChecklistItemMock[]>();
		for (const item of items) {
			if (item.sectionId) {
				const arr = map.get(item.sectionId) ?? [];
				arr.push(item);
				map.set(item.sectionId, arr);
			}
		}
		return map;
	}, [items]);

	return (
		<div className="space-y-6">
			<div className="rounded bg-amber-100 px-4 py-2 text-sm text-amber-900">
				Demo data — the live onboarding service could not be reached.
			</div>
			{mockChecklistResponse.sections.map((section) => {
				const itemsInSection = sectionItems.get(section.id) ?? [];
				const topLevelInSection = itemsInSection.filter((item) => !item.parentId);
				return (
					<div key={section.id} className="overflow-hidden rounded-lg border">
						<div className="border-b bg-gray-100 px-4 py-3">
							<h3 className="text-sm font-semibold text-gray-800">{section.title}</h3>
						</div>
						<div className="overflow-x-auto">
							<table className="w-full border-collapse">
								<thead>
									<tr className="border-b bg-gray-50 text-xs">
										<th className="w-16 px-4 py-2 text-left font-semibold text-gray-600">#</th>
										<th className="px-4 py-2 text-left font-semibold text-gray-600">Task</th>
										<th className="w-28 px-4 py-2 text-left font-semibold text-gray-600">
											Responsible
										</th>
										<th className="w-24 px-4 py-2 text-center font-semibold text-gray-600">
											Completed
										</th>
										<th className="w-32 px-4 py-2 text-left font-semibold text-gray-600">
											Date Completed
										</th>
										<th className="w-40 px-4 py-2 text-left font-semibold text-gray-600">
											Remarks/Signature
										</th>
									</tr>
								</thead>
								<tbody>
									{topLevelInSection.map((item) => (
										<MockRow key={item.id} item={item} childrenMap={childrenMap} />
									))}
								</tbody>
							</table>
						</div>
					</div>
				);
			})}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Live checklist
// ---------------------------------------------------------------------------

interface SignDialogState {
	mode: "sign" | "unsign";
	item: OnboardingVisibleItem;
}

function LiveRow({
	item,
	depth,
	onSign,
	onUnsign,
}: {
	item: OnboardingVisibleItem;
	depth: number;
	onSign: (item: OnboardingVisibleItem) => void;
	onUnsign: (item: OnboardingVisibleItem) => void;
}) {
	const children = item.children ?? [];
	const isParent = children.length > 0;
	const completed = item.status === "COMPLETED";

	return (
		<>
			<tr className={`border-b hover:bg-gray-50 ${isParent ? "bg-gray-50/50" : ""}`}>
				<td className={`px-4 py-2 text-sm text-gray-900 ${depth > 0 ? "pl-8" : ""}`}>
					{item.number}
				</td>
				<td className={`px-4 py-2 text-sm text-gray-900 ${isParent ? "font-medium" : ""}`}>
					{item.title}
				</td>
				<td className="px-4 py-2 text-sm text-gray-600">
					{item.responsibleDepartmentName || (
						<span className="italic text-gray-400">unassigned</span>
					)}
				</td>
				<td className="px-4 py-2 text-center">
					<button
						type="button"
						title={
							completed
								? item.signedByName
									? `Signed by ${item.signedByName}`
									: "Completed"
								: item.canSign
									? "Sign with your password"
									: item.isContextOnly
										? "Context item — HR/Admin signs this"
										: "Not your department"
						}
						disabled={!completed && !item.canSign}
						onClick={() => {
							if (completed) {
								onUnsign(item);
							} else if (item.canSign) {
								onSign(item);
							}
						}}
						className={`mx-auto flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
							completed
								? "border-purple-500 bg-purple-500"
								: item.canSign
									? "cursor-pointer border-gray-300 hover:border-purple-400"
									: "cursor-not-allowed border-gray-200 opacity-50"
						}`}>
						{completed && (
							<svg
								className="h-3 w-3 text-white"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={3}
									d="M5 13l4 4L19 7"
								/>
							</svg>
						)}
					</button>
				</td>
				<td className="px-4 py-2 text-sm text-gray-600">
					{item.completedDate ? new Date(item.completedDate).toLocaleDateString() : ""}
				</td>
				<td className="px-4 py-2 text-sm text-gray-600">
					{item.signedByName ? (
						<span>
							{item.signedByName}
							{item.remarks ? ` — ${item.remarks}` : ""}
						</span>
					) : (
						item.remarks || ""
					)}
				</td>
			</tr>
			{children.map((child) => (
				<LiveRow
					key={child.id}
					item={child}
					depth={depth + 1}
					onSign={onSign}
					onUnsign={onUnsign}
				/>
			))}
		</>
	);
}

export function AdminOnboardingChecklist() {
	const navigate = useNavigate();
	const { user } = useAuth();
	const role = String(user?.role || "");
	const isManager =
		role === "admin" ||
		role === "hris-admin" ||
		role === "hris-hr-manager" ||
		role === "hris-hr-user";

	const rosterQuery = useOnboardingRoster();
	const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
	const employees = rosterQuery.data?.employees ?? [];
	const selectedEmployee =
		employees.find((e) => e.employeeId === selectedEmployeeId) ?? employees[0] ?? null;
	const checklistId = selectedEmployee?.checklist?.id ?? null;

	const visibleQuery = useOnboardingVisibleChecklist(checklistId);
	const templatesQuery = useOnboardingTemplates({ enabled: isManager });
	const createChecklistMutation = useCreateOnboardingChecklist();
	const [templateId, setTemplateId] = useState<string>("");
	const [signDialog, setSignDialog] = useState<SignDialogState | null>(null);
	const [password, setPassword] = useState("");
	const [remarks, setRemarks] = useState("");
	const signMutation = useSignOnboardingItem(checklistId);
	const unsignMutation = useUnsignOnboardingItem(checklistId);

	const openSign = (mode: "sign" | "unsign", item: OnboardingVisibleItem) => {
		if (mode === "sign") {
			setSignDialog({ mode, item });
			return;
		}
		if (isManager) {
			setSignDialog({ mode, item });
		}
	};

	const submitDialog = async () => {
		if (!signDialog) return;
		try {
			if (signDialog.mode === "sign") {
				if (!password) return;
				await signMutation.mutateAsync({
					itemId: signDialog.item.id,
					payload: { password, remarks: remarks || null },
				});
			} else {
				await unsignMutation.mutateAsync({
					itemId: signDialog.item.id,
					reason: remarks || undefined,
				});
			}
			setSignDialog(null);
			setPassword("");
			setRemarks("");
		} catch {
			// toast handled by the mutation hook; keep the dialog open for retry
		}
	};

	const createChecklist = () => {
		if (!selectedEmployee || !templateId) return;
		createChecklistMutation.mutate(
			{ employeeId: selectedEmployee.employeeId, templateId },
			{
				onSuccess: () => void rosterQuery.refetch(),
			},
		);
	};

	// Live API unreachable -> demo fallback (coexists with the mock builder UI)
	if (rosterQuery.isError) {
		return (
			<Card>
				<CardHeader className="pb-2">
					<div className="flex items-center justify-between">
						<CardTitle>{mockChecklistResponse.name}</CardTitle>
						<Button
							variant="secondary"
							onClick={() => navigate("/admin/configuration/onboarding/builder")}>
							Go to Builder
						</Button>
					</div>
				</CardHeader>
				<CardContent className="max-h-[75vh] overflow-auto pb-10">
					<MockChecklistTable />
				</CardContent>
			</Card>
		);
	}

	const checklist = visibleQuery.data?.checklist ?? null;

	return (
		<Card>
			<CardHeader className="pb-2">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<CardTitle>Onboarding Checklist</CardTitle>
					<div className="flex items-center gap-2">
						<select
							aria-label="Onboarding employee"
							className="h-9 rounded border border-gray-300 px-2 text-sm"
							value={selectedEmployee?.employeeId ?? ""}
							onChange={(event) => setSelectedEmployeeId(event.target.value)}>
							{employees.length === 0 && <option value="">No onboarding employees</option>}
							{employees.map((employee) => (
								<option key={employee.employeeId} value={employee.employeeId}>
									{employee.name} ({employee.department ?? "no dept"})
								</option>
							))}
						</select>
						<Button
							variant="secondary"
							onClick={() => navigate("/admin/configuration/onboarding/builder")}>
							Go to Builder
						</Button>
					</div>
				</div>
			</CardHeader>
			<CardContent className="max-h-[75vh] overflow-auto pb-10">
				{rosterQuery.isLoading ? (
					<p className="text-sm text-gray-500">Loading onboarding employees…</p>
				) : !selectedEmployee ? (
					<p className="text-sm text-gray-500">
						No employees are currently in onboarding.
					</p>
				) : !checklistId ? (
					isManager ? (
						<div className="space-y-3 rounded-lg border p-4">
							<h3 className="text-sm font-semibold">
								{selectedEmployee.name} has no checklist yet
							</h3>
							<div className="flex items-center gap-2">
								<select
									aria-label="Template"
									className="h-9 rounded border border-gray-300 px-2 text-sm"
									value={templateId}
									onChange={(event) => setTemplateId(event.target.value)}>
									<option value="">Select template…</option>
									{(templatesQuery.data?.templates ?? []).map((template) => (
										<option key={template.id} value={template.id}>
											{template.name}
										</option>
									))}
								</select>
								<Button
									disabled={!templateId || createChecklistMutation.isPending}
									onClick={createChecklist}>
									Create Checklist
								</Button>
							</div>
						</div>
					) : (
						<p className="text-sm text-gray-500">
							No checklist has been created for {selectedEmployee.name} yet.
						</p>
					)
				) : visibleQuery.isLoading ? (
					<p className="text-sm text-gray-500">Loading checklist…</p>
				) : !checklist ? (
					<p className="text-sm text-gray-500">Checklist could not be loaded.</p>
				) : (
					<div className="space-y-6">
						<div>
							<div className="mb-1 flex items-center justify-between text-sm">
								<span className="font-semibold">{checklist.title}</span>
								<span className="text-gray-500">{checklist.completionPercentage}%</span>
							</div>
							<div className="h-2 w-full rounded bg-gray-100">
								<div
									className="h-2 rounded bg-purple-500"
									style={{ width: `${checklist.completionPercentage}%` }}
								/>
							</div>
							{checklist.view === "department" && (
								<p className="mt-2 text-xs text-gray-500">
									Showing items for your department ({checklist.viewer.department});
									unassigned rows are context only and are signed by HR/Admin.
								</p>
							)}
							{checklist.view === "self" && (
								<p className="mt-2 text-xs text-gray-500">
									This is your onboarding checklist. Responsible departments and HR will
									sign each item as it is completed.
								</p>
							)}
						</div>
						{checklist.sections.map((section) => (
							<div key={section.id} className="overflow-hidden rounded-lg border">
								<div className="border-b bg-gray-100 px-4 py-3">
									<h3 className="text-sm font-semibold text-gray-800">{section.title}</h3>
								</div>
								<div className="overflow-x-auto">
									<table className="w-full border-collapse">
										<thead>
											<tr className="border-b bg-gray-50 text-xs">
												<th className="w-16 px-4 py-2 text-left font-semibold text-gray-600">
													#
												</th>
												<th className="px-4 py-2 text-left font-semibold text-gray-600">
													Task
												</th>
												<th className="w-28 px-4 py-2 text-left font-semibold text-gray-600">
													Responsible
												</th>
												<th className="w-24 px-4 py-2 text-center font-semibold text-gray-600">
													Completed
												</th>
												<th className="w-32 px-4 py-2 text-left font-semibold text-gray-600">
													Date Completed
												</th>
												<th className="w-40 px-4 py-2 text-left font-semibold text-gray-600">
													Remarks/Signature
												</th>
											</tr>
										</thead>
										<tbody>
											{section.items.map((item) => (
												<LiveRow
													key={item.id}
													item={item}
													depth={0}
													onSign={(target) => openSign("sign", target)}
													onUnsign={(target) => openSign("unsign", target)}
												/>
											))}
										</tbody>
									</table>
								</div>
							</div>
						))}
					</div>
				)}
			</CardContent>

			<Dialog
				open={!!signDialog}
				onOpenChange={(open) => {
					if (!open) {
						setSignDialog(null);
						setPassword("");
						setRemarks("");
					}
				}}>
				<DialogContent className="max-w-md">
					<DialogTitle>
						{signDialog?.mode === "sign"
							? `Sign: ${signDialog.item.number ? `${signDialog.item.number} — ` : ""}${signDialog.item.title}`
							: `Revert signature: ${signDialog?.item.title ?? ""}`}
					</DialogTitle>
					<div className="space-y-3">
						{signDialog?.mode === "sign" ? (
							<div className="space-y-1">
								<label className="text-sm text-gray-600" htmlFor="sign-password">
									Confirm your password (signature)
								</label>
								<Input
									id="sign-password"
									type="password"
									value={password}
									onChange={(event) => setPassword(event.target.value)}
									autoComplete="current-password"
								/>
							</div>
						) : (
							<p className="text-sm text-gray-600">
								This item was signed by {signDialog?.item.signedByName}. HR/Admin can
								revert it.
							</p>
						)}
						<div className="space-y-1">
							<label className="text-sm text-gray-600" htmlFor="sign-remarks">
								{signDialog?.mode === "sign" ? "Remarks (optional)" : "Reason (optional)"}
							</label>
							<Input
								id="sign-remarks"
								value={remarks}
								onChange={(event) => setRemarks(event.target.value)}
							/>
						</div>
						<div className="flex justify-end gap-2">
							<Button variant="secondary" onClick={() => setSignDialog(null)}>
								Cancel
							</Button>
							<Button
								disabled={
									signDialog?.mode === "sign"
										? !password || signMutation.isPending
										: unsignMutation.isPending
								}
								onClick={submitDialog}>
								{signDialog?.mode === "sign" ? "Sign" : "Revert"}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</Card>
	);
}
