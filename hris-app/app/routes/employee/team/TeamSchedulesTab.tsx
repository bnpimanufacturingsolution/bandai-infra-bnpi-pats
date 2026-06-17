import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "~/components/atoms/Button";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Select } from "~/components/atoms/Select";
import { EmployeeTableCell } from "~/components/molecules/EmployeeTableCell";
import { ShiftSnapshotFormFields } from "~/components/organisms/schedule/ShiftSnapshotFormFields";
import {
	useCreateEmployeeSchedule,
	useEmployeeSchedules,
	useEmployees,
	useScheduleTemplates,
} from "~/lib/hooks";
import { useAuth } from "~/lib/hooks/use-auth";

const ShiftSnapshotFormSchema = z.object({
	name: z.string().optional().nullable(),
	code: z.string().optional().nullable(),
	isOvernight: z.boolean().optional(),
	isOff: z.boolean().optional(),
	timeSlots: z
		.array(
			z.object({
				type: z.string().min(1),
				label: z.string().optional().nullable(),
				startTime: z.string().min(1),
				endTime: z.string().min(1),
			}),
		)
		.optional(),
});

const AssignmentFormSchema = z
	.object({
		employeeId: z.string().min(1),
		scheduleSelector: z.string().min(1),
		startDate: z.string().min(1),
		endDate: z.string().optional().nullable(),
		shiftTypeId: z.string().optional().nullable(),
		shiftSnapshot: ShiftSnapshotFormSchema.optional().nullable(),
	})
	.superRefine((value, ctx) => {
		if (value.scheduleSelector === "__manual__" && !value.shiftSnapshot) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Manual Input requires shift snapshot details.",
				path: ["shiftSnapshot"],
			});
		}
	});

type AssignmentFormData = z.infer<typeof AssignmentFormSchema>;

const buildManualShiftSnapshot = () => ({
	name: "",
	code: "",
	isOvernight: false,
	isOff: false,
	timeSlots: [{ type: "work", label: "Work Slot", startTime: "00:00", endTime: "00:00" }],
});

export default function TeamSchedulesTab() {
	const { user } = useAuth();
	const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);

	const isAllowed = !!user?.metadata?.employee?.isDepartmentManager || user?.role === "admin";
	const managerEmployeeId = user?.metadata?.employee?.id || "";

	const { data: employeesData } = useEmployees({ page: 1, limit: 1000, count: true });
	const { data: assignmentsData, isLoading: isLoadingAssignments } = useEmployeeSchedules(
		undefined,
		{
			enabled: true,
		},
	);
	const { data: templatesData } = useScheduleTemplates(
		{ page: 1, limit: 1000, document: true, count: true },
		{ enabled: true },
	);
	const createAssignmentMutation = useCreateEmployeeSchedule();

	const employees =
		(employeesData as any)?.employees || (employeesData as any)?.data?.employees || [];
	const scopedEmployees = useMemo(() => {
		if (!managerEmployeeId) return employees;
		return employees.filter(
			(employee: any) =>
				employee?.id === managerEmployeeId || employee?.reportTo?.id === managerEmployeeId,
		);
	}, [employees, managerEmployeeId]);
	const scopedEmployeeIdSet = useMemo(
		() => new Set(scopedEmployees.map((employee: any) => String(employee.id))),
		[scopedEmployees],
	);
	const employeeIdByObjectId = useMemo(
		() =>
			new Map(
				scopedEmployees.map((employee: any) => [
					String(employee.id),
					String(employee.employeeId || "").trim(),
				]),
			),
		[scopedEmployees],
	);

	const assignments = (assignmentsData as any)?.schedules || [];
	const teamAssignments =
		scopedEmployeeIdSet.size > 0
			? assignments.filter((assignment) =>
					scopedEmployeeIdSet.has(String(assignment.employeeId)),
				)
			: assignments;

	const employeeOptions = scopedEmployees.map((employee: any) => ({
		value: employee.id,
		label: `${employee.employeeId} - ${employee.person?.personalInfo?.firstName || ""} ${employee.person?.personalInfo?.lastName || ""}`.trim(),
	}));
	const templateOptions = (templatesData?.scheduleTemplates || []).map((template) => ({
		value: template.id,
		label: `${template.name} (${template.code})`,
	}));
	const scheduleSelectorOptions = [
		{ value: "__manual__", label: "Manual Input" },
		...templateOptions,
	];
	const form = useForm<AssignmentFormData, any, AssignmentFormData>({
		resolver: zodResolver(AssignmentFormSchema),
		defaultValues: {
			employeeId: "",
			scheduleSelector: "",
			startDate: "",
			endDate: "",
			shiftTypeId: "",
			shiftSnapshot: null,
		},
	});
	const { watch, setValue, handleSubmit, register, control, reset } = form;

	const assignmentColumns: Column<any>[] = [
		{
			key: "employee",
			label: "Employee",
			render: (_value, item) => (
				<EmployeeTableCell
					profileId={item.employee?.id || String(item.employeeId || "")}
					fullName={`${item.employee?.person?.personalInfo?.firstName || "Employee"} ${item.employee?.person?.personalInfo?.lastName || ""}`.trim()}
					employeeId={
						item.employee?.employeeId ||
						employeeIdByObjectId.get(String(item.employeeId)) ||
						"-"
					}
				/>
			),
		},
		{
			key: "scheduleTemplate",
			label: "Template",
			render: (_value, item) => (
				<div>
					<p className="font-medium text-gray-900">
						{item.scheduleName ||
							item.scheduleTemplate?.name ||
							item.scheduleTemplateId ||
							"Schedule"}
					</p>
					<p className="text-xs text-gray-500">
						{item.scheduleCode || item.scheduleTemplate?.code || ""}
					</p>
				</div>
			),
		},
		{
			key: "startDate",
			label: "Start",
			render: (value) => (
				<span className="text-sm text-gray-600">{String(value).slice(0, 10)}</span>
			),
		},
		{
			key: "endDate",
			label: "End",
			render: (value) => (
				<span className="text-sm text-gray-600">
					{value ? String(value).slice(0, 10) : "Open-ended"}
				</span>
			),
		},
	];

	const resetAssignmentForm = () => {
		reset({
			employeeId: "",
			scheduleSelector: "",
			startDate: "",
			endDate: "",
			shiftTypeId: "",
			shiftSnapshot: null,
		});
	};

	const submitAssignment = async (values: AssignmentFormData) => {
		await createAssignmentMutation.mutateAsync({
			employeeId: values.employeeId,
			scheduleTemplateId:
				values.scheduleSelector === "__manual__" ? undefined : values.scheduleSelector,
			shiftSnapshot:
				values.scheduleSelector === "__manual__" ? values.shiftSnapshot || null : null,
			shiftTypeId:
				values.scheduleSelector === "__manual__" ? values.shiftTypeId || null : null,
			startDate: values.startDate,
			endDate: values.endDate || null,
		});
		resetAssignmentForm();
		setAssignmentModalOpen(false);
	};

	const assignmentTitleActions = isAllowed ? (
		<Button onClick={() => setAssignmentModalOpen(true)}>Assign Template</Button>
	) : null;

	if (!isAllowed) {
		return (
			<div className="rounded-xl border border-red-200 bg-red-50 p-6">
				<h1 className="text-lg font-semibold text-red-800">Access restricted</h1>
				<p className="mt-1 text-sm text-red-700">
					You are not allowed to access team schedules.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<DataTable
				title="Team Schedule Assignments"
				description=""
				data={teamAssignments}
				columns={assignmentColumns}
				isLoading={isLoadingAssignments}
				titleActions={assignmentTitleActions}
				emptyMessage="No team assignments found"
				emptyDescription="Assign a schedule template to start building the team schedule."
			/>

			<Modal
				open={assignmentModalOpen}
				onOpenChange={(open) => {
					setAssignmentModalOpen(open);
					if (!open) resetAssignmentForm();
				}}
				title="Assign Schedule Template"
				description="Use the new employee schedule assignment flow."
				className="sm:max-w-[640px] bg-slate-50 border-none shadow-[0_20px_50px_rgba(0,0,0,0.1)]">
				<form onSubmit={handleSubmit(submitAssignment)} className="space-y-4">
					<div>
						<label className="mb-1 block text-sm font-medium text-gray-700">
							Employee
						</label>
						<Select
							options={employeeOptions}
							value={watch("employeeId")}
							onChange={(value) => setValue("employeeId", value || "")}
							placeholder="Select employee"
						/>
					</div>
					<div>
						<label className="mb-1 block text-sm font-medium text-gray-700">
							Schedule
						</label>
						<Select
							options={scheduleSelectorOptions}
							value={watch("scheduleSelector")}
							onChange={(value) => {
								const next = value || "";
								setValue("scheduleSelector", next);
								if (next === "__manual__" && !watch("shiftSnapshot")) {
									setValue("shiftSnapshot", buildManualShiftSnapshot());
								}
								if (next !== "__manual__") {
									setValue("shiftSnapshot", null);
									setValue("shiftTypeId", "");
								}
							}}
							placeholder="Manual Input or Select Template"
						/>
					</div>
					{watch("scheduleSelector") === "__manual__" ? (
						<div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
							<ShiftSnapshotFormFields
								control={control}
								register={register}
								setValue={setValue}
								watch={watch}
								basePath="shiftSnapshot"
								defaultTimeSlots={buildManualShiftSnapshot().timeSlots}
							/>
						</div>
					) : null}
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div>
							<label className="mb-1 block text-sm font-medium text-gray-700">
								Start Date
							</label>
							<Input type="date" {...register("startDate")} />
						</div>
						<div>
							<label className="mb-1 block text-sm font-medium text-gray-700">
								End Date
							</label>
							<Input type="date" {...register("endDate")} />
						</div>
					</div>
					<div className="flex justify-end gap-3 border-t pt-4">
						<Button variant="outline" onClick={() => setAssignmentModalOpen(false)}>
							Cancel
						</Button>
						<Button disabled={createAssignmentMutation.isPending} type="submit">
							Assign
						</Button>
					</div>
				</form>
			</Modal>
		</div>
	);
}
