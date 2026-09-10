import { useEffect, useMemo, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "~/components/ui/drawer";
import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { Checkbox } from "~/components/atoms/Checkbox";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { Skeleton } from "~/components/ui/skeleton";
import {
	useApplicationAccessDetail,
	useUpdateApplicationAccess,
} from "~/lib/hooks/useApplicationAccess";
import {
	buildAccessUpdatePayload,
	selectionFromExplicit,
	epmrSubroleLabel,
	lmsRoleLabel,
	provisioningLabel,
	provenanceCaption,
} from "~/lib/application-access-ui";
import type { ApplicationAccessCatalog } from "~/services/application-access.service";

interface ManageAccessDrawerProps {
	employeeId: string | null;
	open: boolean;
	onClose: () => void;
	catalog?: ApplicationAccessCatalog;
}

interface DrawerFormState {
	lmsRoleOverride: string; // "" = no explicit override (policy default)
	epmrSubroles: string[];
}

const NO_OVERRIDE = "__default__";

const toFormState = (
	lmsRoleOverride: string | null,
	epmrSubroles: string[],
): DrawerFormState => ({
	lmsRoleOverride: lmsRoleOverride || NO_OVERRIDE,
	epmrSubroles: [...epmrSubroles],
});

export function ManageAccessDrawer({ employeeId, open, onClose, catalog }: ManageAccessDrawerProps) {
	const { data, isLoading, isError, error, refetch } = useApplicationAccessDetail(employeeId || "");
	const updateMutation = useUpdateApplicationAccess();

	const [form, setForm] = useState<DrawerFormState | null>(null);

	const detail = data?.data ?? null;
	const employee = detail?.employee ?? null;
	const explicit = detail?.explicitConfig ?? null;
	const effective = detail?.effective ?? null;

	const defaultSubroles = catalog?.defaultEpmrSubroles ?? ["epmr_ratee", "epmr_rater"];
	const explicitOnlySubroles = catalog?.epmrSubroles?.explicitOnly ?? ["epmr_admin", "epmr_qa"];
	const allSubroles = useMemo(
		() => [...defaultSubroles, ...explicitOnlySubroles],
		[defaultSubroles, explicitOnlySubroles],
	);

	// Populate form only when fresh detail arrives; never show guessed state.
	useEffect(() => {
		if (!detail) return;
		if (effective?.inherited) {
			// Superadmin: system-controlled — form not editable.
			setForm(null);
			return;
		}
		const selection = explicit
			? selectionFromExplicit(explicit, defaultSubroles)
			: [...defaultSubroles];
		setForm(toFormState(explicit?.lmsRoleOverride ?? null, selection));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [detail, employeeId]);

	const lmsRoleOptions: SelectOption[] = [
		{ value: NO_OVERRIDE, label: "Default (Employee)" },
		{ value: "employee", label: "Employee" },
		{ value: "instructor", label: "Instructor" },
		{ value: "admin", label: "Admin" },
	];

	const inherited = Boolean(effective?.inherited);
	const eligible = Boolean(effective?.eligible);
	const editable = Boolean(form) && !inherited && eligible && !updateMutation.isPending;

	const dirty = useMemo(() => {
		if (!form || !detail) return false;
		const current = explicit
			? selectionFromExplicit(explicit, defaultSubroles)
			: [...defaultSubroles];
		const sameSelection =
			form.epmrSubroles.length === current.length &&
			form.epmrSubroles.every((subrole) => current.includes(subrole));
		const formOverride = form.lmsRoleOverride === NO_OVERRIDE ? null : form.lmsRoleOverride;
		return !sameSelection || formOverride !== (explicit?.lmsRoleOverride ?? null);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [form, detail, defaultSubroles]);

	const handleSave = () => {
		if (!employeeId || !form || !dirty) return;
		const payload = buildAccessUpdatePayload(
			{
				lmsRoleOverride: (form.lmsRoleOverride === NO_OVERRIDE ? null : form.lmsRoleOverride) as
					| "employee"
					| "instructor"
					| "admin"
					| null,
				epmrSubroles: form.epmrSubroles,
			},
			explicitOnlySubroles,
			defaultSubroles,
		);
		updateMutation.mutate(
			{ employeeId, payload },
			{
				onSuccess: () => {
					onClose();
				},
				// On failure keep the drawer + form state intact for correction.
			},
		);
	};

	return (
		<Drawer
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
			direction="right">
			<DrawerContent className="ml-auto flex h-full min-h-0 w-full min-w-0 flex-col border-l border-neutral-200 bg-white shadow-xl sm:!max-w-[min(92vw,32rem)]">
				{isLoading || !detail ? (
					isError ? (
						<>
							<DrawerHeader className="shrink-0 border-b border-neutral-100">
								<DrawerTitle className="text-base font-semibold text-neutral-900">
									Manage Access
								</DrawerTitle>
								<DrawerDescription className="text-sm text-neutral-500">
									Unable to load access configuration.
								</DrawerDescription>
							</DrawerHeader>
							<div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
								<p className="text-sm text-neutral-500">
									{(error as any)?.message || "Please try again."}
								</p>
								<Button variant="outline" size="sm" onClick={() => refetch()}>
									Retry
								</Button>
							</div>
						</>
					) : (
						<>
							<DrawerHeader className="shrink-0 border-b border-neutral-100">
								<DrawerTitle className="text-base font-semibold text-neutral-900">
									Manage Access
								</DrawerTitle>
								<DrawerDescription className="text-sm text-neutral-500">
									Loading access configuration...
								</DrawerDescription>
							</DrawerHeader>
							<div className="flex-1 space-y-4 p-6" aria-busy="true">
								<Skeleton className="h-5 w-40" />
								<Skeleton className="h-4 w-24" />
								<Skeleton className="h-9 w-full" />
								<Skeleton className="h-8 w-full" />
								<Skeleton className="h-8 w-full" />
							</div>
						</>
					)
				) : (
					<>
						<DrawerHeader className="shrink-0 space-y-3 border-b border-neutral-100 pb-4">
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0 space-y-1">
									<DrawerTitle className="text-base font-semibold leading-snug text-neutral-900">
										{employee?.name || "Employee"}
									</DrawerTitle>
									<DrawerDescription className="text-sm text-neutral-500">
										{[employee?.employeeNumber, employee?.department].filter(Boolean).join(" · ") || "—"}
									</DrawerDescription>
								</div>
								<DrawerClose asChild>
									<button
										type="button"
										className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
										aria-label="Close">
										×
									</button>
								</DrawerClose>
							</div>
							{effective && (
								<div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
									{eligible ? (
										<Badge variant="success-soft">Eligible</Badge>
									) : (
										<Badge variant="secondary">
											{(employee?.employmentStatus || "blocked").toLowerCase().replace(/_/g, " ")}
										</Badge>
									)}
									<span aria-hidden="true">·</span>
									<span>
										Provisioning: {provisioningLabel(detail?.provisioning?.status)}
									</span>
								</div>
							)}
						</DrawerHeader>

						<div className="flex-1 space-y-6 overflow-y-auto p-6">
							{inherited ? (
								<div
									className="rounded-lg border border-blue-200 bg-blue-50 p-4"
									role="note"
									aria-label="System controlled access">
									<div className="flex items-center gap-2">
										<ShieldCheck className="h-5 w-5 text-blue-600" aria-hidden="true" />
										<p className="text-sm font-medium text-blue-900">System controlled</p>
									</div>
									<p className="mt-2 text-sm text-blue-800">
										This employee has superadmin access inherited from their LMS
										role. All EPMR access is granted automatically and cannot be
										edited here.
									</p>
									<div className="mt-3 space-y-2">
										<div className="text-xs font-medium text-blue-700">LMS Role</div>
										<div className="text-sm text-blue-900">Superadmin</div>
										<div className="text-xs font-medium text-blue-700">EPMR Access</div>
										<div className="flex flex-wrap gap-1">
											{(effective?.epmrSubroles ?? []).map((subrole) => (
												<Badge key={subrole} variant="outline" className="border-blue-200 bg-white text-xs text-blue-800">
													{epmrSubroleLabel(subrole)}
												</Badge>
											))}
										</div>
									</div>
								</div>
							) : !eligible ? (
								<div
									className="rounded-lg border border-neutral-200 bg-neutral-50 p-4"
									role="note"
									aria-label="Access unavailable">
									<p className="text-sm font-medium text-neutral-900">Access unavailable</p>
									<p className="mt-2 text-sm text-neutral-600">
										Access cannot be granted because this employee's employment
										status ({(employee?.employmentStatus || "").toLowerCase().replace(/_/g, " ") || "blocked"})
										is not eligible. Contact HR if you believe this is incorrect.
									</p>
								</div>
							) : (
								<>
									<div>
										<label
											htmlFor="lms-role-select"
											className="mb-1 block text-sm font-medium text-neutral-700">
											LMS Role
										</label>
										<div id="lms-role-select">
											<Select
												options={lmsRoleOptions}
												value={form?.lmsRoleOverride ?? NO_OVERRIDE}
												onChange={(value) =>
													setForm((prev) =>
														prev ? { ...prev, lmsRoleOverride: value } : prev,
													)
												}
												disabled={!editable}
												aria-label="LMS Role"
											/>
										</div>
										<p className="mt-1 text-xs text-neutral-400">
											{form?.lmsRoleOverride && form.lmsRoleOverride !== NO_OVERRIDE
												? "Configured"
												: "Default access"}
										</p>
									</div>

									<fieldset>
										<legend className="mb-2 block text-sm font-medium text-neutral-700">
											EPMR Access
										</legend>
										<div className="space-y-2">
											{allSubroles.map((subrole) => {
												const isDefault = defaultSubroles.includes(subrole);
												const checked = form?.epmrSubroles.includes(subrole) ?? false;
												return (
													<label
														key={subrole}
														className="flex items-center gap-3 rounded-md border border-neutral-200 px-3 py-2.5 text-sm"
														data-testid={`epmr-subrole-${subrole}`}>
														<Checkbox
															checked={checked}
															disabled={!editable}
															onCheckedChange={(next) => {
																setForm((prev) => {
																	if (!prev) return prev;
																	const set = new Set(prev.epmrSubroles);
																	if (next === true) set.add(subrole);
																	else set.delete(subrole);
																	return { ...prev, epmrSubroles: Array.from(set) };
																});
															}}
															aria-label={`${epmrSubroleLabel(subrole)} access`}
														/>
														<span className="text-neutral-800">
															{epmrSubroleLabel(subrole)}
														</span>
														{isDefault && (
															<span className="ml-auto text-xs text-neutral-400">Default</span>
														)}
													</label>
												);
											})}
										</div>
										<p className="mt-2 text-xs text-neutral-400">
											Ratee and Rater are granted by default; unticking removes access.
											Admin and QA are optional additions.
										</p>
									</fieldset>
								</>
							)}
						</div>

						<DrawerFooter className="flex shrink-0 flex-row items-center justify-between gap-2 border-t border-neutral-100 bg-neutral-50/50 sm:justify-end">
							<p className="mr-auto text-xs text-neutral-400" aria-live="polite">
								{inherited
									? provenanceCaption({ eligible, inherited, hasExplicitConfig: Boolean(explicit) })
									: updateMutation.isPending
										? "Saving..."
										: dirty
											? "Unsaved changes"
											: ""}
							</p>
							<Button type="button" variant="outline" onClick={onClose} disabled={updateMutation.isPending}>
								Cancel
							</Button>
							{editable && (
								<Button
									type="button"
									onClick={handleSave}
									disabled={!editable || !dirty}
									data-testid="manage-access-save">
									{updateMutation.isPending ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
											Saving...
										</>
									) : (
										"Save"
									)}
								</Button>
							)}
						</DrawerFooter>
					</>
				)}
			</DrawerContent>
		</Drawer>
	);
}
