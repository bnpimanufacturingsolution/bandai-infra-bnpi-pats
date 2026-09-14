import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import { Skeleton } from "~/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { useAuth } from "~/lib/hooks/use-auth";
import {
	useCreateOnboardingChecklist,
	useOnboardingChecklistsForEmployee,
	useOnboardingRosterForEmployee,
	useOnboardingVisibleChecklist,
	useSignOnboardingItem,
	useUnsignOnboardingItem,
} from "~/lib/hooks/useOnboarding";
import type { OnboardingVisibleItem } from "~/zod/onboarding";

const MANAGER_ROLES = new Set(["admin", "hris-admin", "super_admin", "superadmin"]);
const HR_ROLES = new Set(["hris-hr-manager", "hris-hr-user"]);

export interface OnboardingChecklistEmployeeRef {
	/** Employee internal id (PK). */
	id: string;
	/** Employee number/identifier (used for roster fallback lookup). */
	employeeNumber: string;
	name: string;
}

interface OnboardingChecklistPanelProps {
	employee: OnboardingChecklistEmployeeRef;
	className?: string;
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
	// No responsible department = section row: never counted, no sign-off required.
	// (Historically signed section rows keep the completed indicator + manager unsign.)
	const isSectionRow = !completed && !String(item.responsibleDepartmentId || "").trim();

	if (isSectionRow) {
		return (
			<>
				<tr className={`border-b hover:bg-gray-50 ${isParent ? "bg-gray-50/50" : ""}`}>
					<td className={`px-4 py-2 text-sm text-gray-900 ${depth > 0 ? "pl-8" : ""}`}>
						{item.number}
					</td>
					<td className={`px-4 py-2 text-sm text-gray-900 ${isParent ? "font-medium" : ""}`}>
						{item.title}
					</td>
					<td className="px-4 py-2 text-sm text-gray-600" />
					<td className="px-4 py-2 text-center" />
					<td className="px-4 py-2 text-sm text-gray-600" />
					<td className="px-4 py-2 text-sm text-gray-600" />
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
					{item.responsibleDepartmentName ?? ""}
				</td>
				<td className="px-4 py-2 text-center">
					<button
						type="button"
						aria-label={`Sign item ${item.number} ${item.title}`}
						title={
							completed
								? item.signedByName
									? `Signed by ${item.signedByName}`
									: "Completed"
								: item.canSign
									? "Sign with your password"
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

interface SignDialogState {
	mode: "sign" | "unsign";
	item: OnboardingVisibleItem;
}

function ChecklistSkeleton() {
	return (
		<div className="space-y-6" aria-label="Loading checklist">
			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<Skeleton className="h-5 w-52" />
					<Skeleton className="h-4 w-10" />
				</div>
				<Skeleton className="h-2 w-full rounded-full" />
			</div>
			{[0, 1].map((section) => (
				<div key={section} className="space-y-2 rounded-lg border p-4">
					<Skeleton className="h-4 w-64" />
					{[0, 1, 2].map((row) => (
						<div key={row} className="flex items-center gap-4 pt-2">
							<Skeleton className="h-4 w-8" />
							<Skeleton className="h-4 flex-1" />
							<Skeleton className="h-4 w-20" />
							<Skeleton className="h-5 w-5 rounded" />
							<Skeleton className="h-4 w-24" />
						</div>
					))}
				</div>
			))}
		</div>
	);
}

export default function OnboardingChecklistPanel({
	employee,
	className,
}: OnboardingChecklistPanelProps) {
	const { user } = useAuth();
	const role = String(user?.role || "");
	const isManager = MANAGER_ROLES.has(role) || HR_ROLES.has(role);

	const checklistsQuery = useOnboardingChecklistsForEmployee(employee.id, isManager);
	const rosterQuery = useOnboardingRosterForEmployee(employee.employeeNumber);

	const checklistId = useMemo(() => {
		const direct = checklistsQuery.data?.checklists?.[0]?.id ?? null;
		if (direct) return direct;
		const entry = (rosterQuery.data?.employees ?? []).find((e) => e.employeeId === employee.id);
		return entry?.checklist?.id ?? null;
	}, [checklistsQuery.data, rosterQuery.data, employee.id]);

	const visibleQuery = useOnboardingVisibleChecklist(checklistId);
	const createChecklistMutation = useCreateOnboardingChecklist();
	const signMutation = useSignOnboardingItem(checklistId);
	const unsignMutation = useUnsignOnboardingItem(checklistId);

	const [dialog, setDialog] = useState<SignDialogState | null>(null);
	const [password, setPassword] = useState("");
	const [remarks, setRemarks] = useState("");
	const [inlineError, setInlineError] = useState<string | null>(null);

	const openDialog = (mode: "sign" | "unsign", item: OnboardingVisibleItem) => {
		if (mode === "unsign" && !isManager) return;
		setInlineError(null);
		setPassword("");
		setRemarks("");
		setDialog({ mode, item });
	};

	const submitDialog = async () => {
		if (!dialog) return;
		setInlineError(null);
		try {
			if (dialog.mode === "sign") {
				if (!password) {
					setInlineError("Password is required to sign.");
					return;
				}
				await signMutation.mutateAsync({
					itemId: dialog.item.id,
					payload: { password, remarks: remarks || null },
				});
			} else {
				await unsignMutation.mutateAsync({
					itemId: dialog.item.id,
					reason: remarks || undefined,
				});
			}
			setDialog(null);
		} catch (error: any) {
			setInlineError(error?.message || "Unable to sign this item.");
		}
	};

	const provision = () => {
		createChecklistMutation.mutate({ employeeId: employee.id });
	};

	const checklist = visibleQuery.data?.checklist ?? null;
	const resolving = isManager ? checklistsQuery.isLoading : rosterQuery.isLoading;

	return (
		<Card className={className}>
			<CardHeader className="pb-2">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<CardTitle>
						Onboarding Checklist —{" "}
						{checklist?.title?.replace(/^Onboarding Checklist - /, "") || employee.name}
					</CardTitle>
					{isManager && !resolving && !checklistId && (
						<Button
							variant="secondary"
							onClick={provision}
							disabled={createChecklistMutation.isPending}>
							{createChecklistMutation.isPending
								? "Provisioning…"
								: "Provision Checklist"}
						</Button>
					)}
				</div>
			</CardHeader>
			<CardContent className="overflow-auto pb-8">
				{resolving || (checklistId && visibleQuery.isLoading) ? (
					<ChecklistSkeleton />
				) : !checklistId ? (
					<p className="text-sm text-gray-500">
						{isManager
							? "No checklist has been provisioned for this employee yet."
							: "A checklist has not been created for this employee yet."}
					</p>
				) : !checklist ? (
					<p className="text-sm text-gray-500">Checklist could not be loaded.</p>
				) : (
					<div className="space-y-6">
						<div>
							<div className="mb-1 flex items-center justify-between text-sm">
								<span className="font-semibold">
									{checklist.employee?.name ?? employee.name}
								</span>
								<span className="text-gray-500">
									{checklist.completionPercentage}%
								</span>
							</div>
							<div className="h-2 w-full rounded bg-gray-100">
								<div
									className="h-2 rounded bg-purple-500 transition-all"
									style={{ width: `${checklist.completionPercentage}%` }}
								/>
							</div>
							{checklist.view === "department" && (
								<p className="mt-2 text-xs text-gray-500">
									Showing items for your department ({checklist.viewer.department}
									); unassigned rows are sections — no sign-off required and not
									counted toward completion.
								</p>
							)}
							{checklist.view === "self" && (
								<p className="mt-2 text-xs text-gray-500">
									This is your onboarding checklist. Responsible departments and
									HR sign each item as it is completed — you cannot sign it
									yourself.
								</p>
							)}
						</div>
						{checklist.sections.map((section) => (
							<div key={section.id} className="overflow-hidden rounded-lg border">
								<div className="border-b bg-gray-100 px-4 py-3">
									<h3 className="text-sm font-semibold text-gray-800">
										{section.title}
									</h3>
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
													onSign={(target) => openDialog("sign", target)}
													onUnsign={(target) =>
														openDialog("unsign", target)
													}
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
				open={!!dialog}
				onOpenChange={(open) => {
					if (!open) {
						setDialog(null);
						setInlineError(null);
					}
				}}>
				<DialogContent className="max-w-md">
					<DialogTitle>
						{dialog?.mode === "sign"
							? `Sign: ${dialog.item.number ? `${dialog.item.number} — ` : ""}${dialog.item.title}`
							: `Revert signature: ${dialog?.item.title ?? ""}`}
					</DialogTitle>
					<div className="space-y-3">
						{dialog?.mode === "sign" ? (
							<>
								<p className="text-sm text-gray-600">
									This records your official sign-off. Enter your account password
									to confirm — your name will be added to the Remarks/Signature
									column.
								</p>
								<div className="space-y-1">
									<label
										className="text-sm text-gray-600"
										htmlFor="sign-password">
										Password
									</label>
									<Input
										id="sign-password"
										type="password"
										value={password}
										onChange={(event) => setPassword(event.target.value)}
										autoComplete="current-password"
										onKeyDown={(event) => {
											if (event.key === "Enter") submitDialog();
										}}
									/>
								</div>
							</>
						) : (
							<p className="text-sm text-gray-600">
								This item was signed by {dialog?.item.signedByName}. HR/Admin can
								revert it.
							</p>
						)}
						<div className="space-y-1">
							<label className="text-sm text-gray-600" htmlFor="sign-remarks">
								{dialog?.mode === "sign"
									? "Remarks (optional)"
									: "Reason (optional)"}
							</label>
							<Input
								id="sign-remarks"
								value={remarks}
								onChange={(event) => setRemarks(event.target.value)}
							/>
						</div>
						{inlineError && (
							<p role="alert" className="text-sm text-red-600">
								{inlineError}
							</p>
						)}
						<div className="flex justify-end gap-2">
							<Button variant="secondary" onClick={() => setDialog(null)}>
								Cancel
							</Button>
							<Button
								disabled={
									dialog?.mode === "sign"
										? !password || signMutation.isPending
										: unsignMutation.isPending
								}
								onClick={submitDialog}>
								{dialog?.mode === "sign" ? "Sign" : "Revert"}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</Card>
	);
}
