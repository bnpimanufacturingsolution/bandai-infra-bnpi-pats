import { useEffect, useMemo, useState } from "react";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { AlertTriangle, Plus, Eye, Edit, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	disciplinaryActionService,
	type DisciplinaryAction,
	type DisciplinaryActionStatus,
} from "~/services/disciplinaryAction.service";
import { useEmployees } from "~/lib/hooks/useEmployees";

const offenseOptions: SelectOption[] = [
	{ value: "TARDINESS", label: "Tardiness" },
	{ value: "ABSENTEEISM", label: "Absenteeism" },
	{ value: "MISCONDUCT", label: "Misconduct" },
	{ value: "POLICY_VIOLATION", label: "Policy Violation" },
	{ value: "PERFORMANCE", label: "Performance" },
	{ value: "OTHER", label: "Other" },
];

const severityOptions: SelectOption[] = [
	{ value: "LOW", label: "Low" },
	{ value: "MEDIUM", label: "Medium" },
	{ value: "HIGH", label: "High" },
];

const statusOptions: SelectOption[] = [
	{ value: "OPEN", label: "Open" },
	{ value: "ONGOING", label: "Ongoing" },
	{ value: "RESOLVED", label: "Resolved" },
	{ value: "DISMISSED", label: "Dismissed" },
];

const statusBadgeVariant = (status: DisciplinaryActionStatus) => {
	switch (status) {
		case "OPEN":
			return "destructive" as const;
		case "ONGOING":
			return "warning" as const;
		case "RESOLVED":
			return "success" as const;
		default:
			return "secondary" as const;
	}
};

interface ActionFormData {
	employeeId: string;
	offenseType: string;
	offenseDate: string;
	description: string;
	severity: string;
	status: DisciplinaryActionStatus;
	actionTaken: string;
	resolutionNotes: string;
}

const emptyForm: ActionFormData = {
	employeeId: "",
	offenseType: "TARDINESS",
	offenseDate: new Date().toISOString().slice(0, 10),
	description: "",
	severity: "MEDIUM",
	status: "OPEN",
	actionTaken: "",
	resolutionNotes: "",
};

export default function DisciplinaryActionPage() {
	const queryClient = useQueryClient();
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [isViewModalOpen, setIsViewModalOpen] = useState(false);
	const [editing, setEditing] = useState<DisciplinaryAction | null>(null);
	const [viewing, setViewing] = useState<DisciplinaryAction | null>(null);
	const [searchText, setSearchText] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState("all");
	const [page, setPage] = useState(1);

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedSearch(searchText), 400);
		return () => clearTimeout(timer);
	}, [searchText]);

	const { data: employeesData } = useEmployees({ limit: 1000 });
	const employees = useMemo(() => {
		const raw = (employeesData as any)?.data;
		return Array.isArray(raw) ? raw : raw?.employees || [];
	}, [employeesData]);

	const employeeOptions: SelectOption[] = useMemo(
		() =>
			employees.map((emp: any) => ({
				value: String(emp.id),
				label:
					`${emp.person?.personalInfo?.firstName || ""} ${
						emp.person?.personalInfo?.lastName || ""
					}`.trim() || String(emp.employeeId || emp.id),
			})),
		[employees],
	);

	const employeeNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const option of employeeOptions) map.set(option.value, option.label);
		return map;
	}, [employeeOptions]);

	const { data, isLoading } = useQuery({
		queryKey: ["disciplinary-actions", page, debouncedSearch, statusFilter],
		queryFn: () =>
			disciplinaryActionService.list({
				page,
				limit: 20,
				query: debouncedSearch || undefined,
				status: statusFilter === "all" ? undefined : statusFilter,
			}),
	});

	const actions = data?.disciplinaryActions || [];
	const total = data?.count || 0;

	const [form, setForm] = useState<ActionFormData>(emptyForm);

	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: ["disciplinary-actions"] });

	const openCreate = () => {
		setEditing(null);
		setForm(emptyForm);
		setIsModalOpen(true);
	};

	const openEdit = (action: DisciplinaryAction) => {
		setEditing(action);
		setForm({
			employeeId: action.employeeId,
			offenseType: action.offenseType,
			offenseDate: action.offenseDate?.slice(0, 10) || emptyForm.offenseDate,
			description: action.description,
			severity: action.severity,
			status: action.status,
			actionTaken: action.actionTaken || "",
			resolutionNotes: action.resolutionNotes || "",
		});
		setIsModalOpen(true);
	};

	const onSubmit = async () => {
		if (!form.employeeId || !form.description) {
			toast.error("Employee and description are required");
			return;
		}
		try {
			if (editing) {
				await disciplinaryActionService.update(editing.id, {
					offenseType: form.offenseType,
					offenseDate: form.offenseDate,
					description: form.description,
					severity: form.severity,
					status: form.status,
					actionTaken: form.actionTaken || undefined,
					resolutionNotes: form.resolutionNotes || undefined,
				});
				toast.success("Disciplinary action updated");
			} else {
				await disciplinaryActionService.create({
					employeeId: form.employeeId,
					offenseType: form.offenseType,
					offenseDate: form.offenseDate,
					description: form.description,
					severity: form.severity,
					status: form.status,
					actionTaken: form.actionTaken || undefined,
				});
				toast.success("Disciplinary action filed");
			}
			setIsModalOpen(false);
			refresh();
		} catch (error: any) {
			toast.error(error?.message || "Failed to save disciplinary action");
		}
	};

	const handleDelete = async (action: DisciplinaryAction) => {
		if (
			!window.confirm(
				`Delete disciplinary action for ${action.employeeName || action.employeeId}?`,
			)
		)
			return;
		try {
			await disciplinaryActionService.remove(action.id);
			toast.success("Disciplinary action deleted");
			refresh();
		} catch (error: any) {
			toast.error(error?.message || "Failed to delete disciplinary action");
		}
	};

	const columns: Column<DisciplinaryAction>[] = [
		{
			key: "employee",
			label: "Employee",
			render: (_value, action) =>
				action.employeeName || employeeNameById.get(action.employeeId) || action.employeeId,
		},
		{
			key: "offenseType",
			label: "Offense",
			render: (_value, action) => action.offenseType.replaceAll("_", " "),
		},
		{
			key: "offenseDate",
			label: "Date",
			render: (_value, action) => action.offenseDate?.slice(0, 10) || "-",
		},
		{
			key: "severity",
			label: "Severity",
			render: (_value, action) => (
				<Badge variant={action.severity === "HIGH" ? "destructive" : "secondary"}>
					{action.severity}
				</Badge>
			),
		},
		{
			key: "status",
			label: "Status",
			render: (_value, action) => (
				<Badge variant={statusBadgeVariant(action.status)}>{action.status}</Badge>
			),
		},
		{
			key: "rowActions",
			label: "Actions",
			render: (_value, action) => (
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => {
							setViewing(action);
							setIsViewModalOpen(true);
						}}>
						<Eye className="h-4 w-4" />
					</Button>
					<Button variant="ghost" size="sm" onClick={() => openEdit(action)}>
						<Edit className="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="text-red-600"
						onClick={() => handleDelete(action)}>
						<Trash2 className="h-4 w-4" />
					</Button>
				</div>
			),
		},
	];

	return (
		<div className="flex h-full min-h-0 flex-col gap-6 p-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-lg font-semibold text-slate-950">Disciplinary Action</h1>
					<p className="text-sm text-slate-500">
						Monitor employee disciplinary cases with severity and status tracking.
					</p>
				</div>
				<Button onClick={openCreate}>
					<Plus className="mr-2 h-4 w-4" />
					File Action
				</Button>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<div className="w-full md:w-72">
					<Input
						placeholder="Search description, offense, employee…"
						value={searchText}
						onChange={(event) => {
							setSearchText(event.target.value);
							setPage(1);
						}}
					/>
				</div>
				<div className="w-full md:w-48">
					<Select
						options={[{ value: "all", label: "All Statuses" }, ...statusOptions]}
						value={statusFilter}
						onChange={(value) => {
							setStatusFilter(value);
							setPage(1);
						}}
					/>
				</div>
			</div>

			<DataTable
				title="Disciplinary Cases"
				data={actions}
				columns={columns}
				isLoading={isLoading}
				emptyMessage="No disciplinary actions found"
				emptyDescription="File an action to start monitoring a case."
				itemsPerPage={20}
				currentPage={page}
				totalItems={total}
				onPageChange={setPage}
				containedScroll
			/>

			<Modal
				open={isModalOpen}
				onClose={() => setIsModalOpen(false)}
				title={editing ? "Edit disciplinary action" : "File disciplinary action"}>
				<div className="space-y-3">
					{!editing ? (
						<div>
							<label className="mb-1 block text-sm font-medium">Employee</label>
							<Select
								options={[
									{ value: "", label: "Select employee…", disabled: true },
									...employeeOptions,
								]}
								value={form.employeeId}
								onChange={(value) => setForm((prev) => ({ ...prev, employeeId: value }))}
							/>
						</div>
					) : null}

					<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
						<div>
							<label className="mb-1 block text-sm font-medium">Offense Type</label>
							<Select
								options={offenseOptions}
								value={form.offenseType}
								onChange={(value) => setForm((prev) => ({ ...prev, offenseType: value }))}
							/>
						</div>
						<div>
							<label className="mb-1 block text-sm font-medium">Offense Date</label>
							<Input
								type="date"
								value={form.offenseDate}
								onChange={(event) =>
									setForm((prev) => ({ ...prev, offenseDate: event.target.value }))
								}
							/>
						</div>
						<div>
							<label className="mb-1 block text-sm font-medium">Severity</label>
							<Select
								options={severityOptions}
								value={form.severity}
								onChange={(value) => setForm((prev) => ({ ...prev, severity: value }))}
							/>
						</div>
						<div>
							<label className="mb-1 block text-sm font-medium">Status</label>
							<Select
								options={statusOptions}
								value={form.status}
								onChange={(value) =>
									setForm((prev) => ({ ...prev, status: value as DisciplinaryActionStatus }))
								}
							/>
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
						<label className="mb-1 block text-sm font-medium">Action Taken (optional)</label>
						<Input
							value={form.actionTaken}
							onChange={(event) =>
								setForm((prev) => ({ ...prev, actionTaken: event.target.value }))
							}
						/>
					</div>

					{editing ? (
						<div>
							<label className="mb-1 block text-sm font-medium">
								Resolution Notes (optional)
							</label>
							<textarea
								className="min-h-[60px] w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
								value={form.resolutionNotes}
								onChange={(event) =>
									setForm((prev) => ({ ...prev, resolutionNotes: event.target.value }))
								}
							/>
						</div>
					) : null}

					<div className="flex justify-end gap-2 pt-2">
						<Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
							Cancel
						</Button>
						<Button type="button" onClick={onSubmit}>
							{editing ? "Save changes" : "File action"}
						</Button>
					</div>
				</div>
			</Modal>

			<Modal
				open={isViewModalOpen}
				onClose={() => setIsViewModalOpen(false)}
				title="Disciplinary action details">
				{viewing ? (
					<div className="space-y-2 text-sm">
						<div className="flex items-center gap-2">
							<AlertTriangle className="h-4 w-4 text-amber-500" />
							<span className="font-semibold">
								{viewing.offenseType.replaceAll("_", " ")} · {viewing.severity}
							</span>
						</div>
						<p>
							<span className="text-slate-500">Employee:</span>{" "}
							{viewing.employeeName || viewing.employeeId}
						</p>
						<p>
							<span className="text-slate-500">Date:</span>{" "}
							{viewing.offenseDate?.slice(0, 10)}
						</p>
						<p>
							<span className="text-slate-500">Status:</span> {viewing.status}
						</p>
						<p>
							<span className="text-slate-500">Description:</span> {viewing.description}
						</p>
						{viewing.actionTaken ? (
							<p>
								<span className="text-slate-500">Action taken:</span> {viewing.actionTaken}
							</p>
						) : null}
						{viewing.resolutionNotes ? (
							<p>
								<span className="text-slate-500">Resolution:</span>{" "}
								{viewing.resolutionNotes}
							</p>
						) : null}
					</div>
				) : null}
			</Modal>
		</div>
	);
}
