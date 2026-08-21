import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Clock, Pencil } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { Modal } from "~/components/atoms/Modal";
import { DepartmentSectionPicker } from "~/components/molecules/DepartmentSectionPicker";
import { EmployeeTableCell } from "~/components/molecules/EmployeeTableCell";
import { ChangeWeeklyScheduleModal } from "~/components/organisms/employee-detail/change-weekly-schedule-modal";
import { AdminTablePageShell } from "~/components/templates/AdminTablePageShell";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useEmployeeScheduleRoster } from "~/lib/hooks/useEmployees";
import { useSections } from "~/lib/hooks/useSections";
import { cn } from "~/lib/utils";
import {
	daysFromEmbeddedPattern,
	summarizeEmbeddedSchedule,
} from "~/lib/utils/weekly-hours-schedule";
import type { Department } from "~/services/departments.service";
import type { Employee } from "~/services/employees.service";
import type { Section } from "~/services/sections.service";

const DEFAULT_PAGE_SIZE = 25;

const employeeDisplayName = (employee?: Employee | null) => {
	const firstName = employee?.person?.personalInfo?.firstName || "";
	const lastName = employee?.person?.personalInfo?.lastName || "";
	return `${firstName} ${lastName}`.trim() || employee?.employeeId || "";
};

function ScheduleWeekStrip({
	employee,
	compact = false,
}: {
	employee: Employee;
	compact?: boolean;
}) {
	const hasPattern = (employee.embeddedSchedule?.pattern?.length || 0) > 0;
	if (!hasPattern) {
		return <span className="text-sm text-gray-400">No schedule</span>;
	}
	const days = daysFromEmbeddedPattern(
		employee.embeddedSchedule?.pattern,
		employee.embeddedSchedule?.cycleDays,
	).slice(0, 7);
	const summary = summarizeEmbeddedSchedule(employee.embeddedSchedule);
	return (
		<div
			className={cn("flex flex-wrap gap-1", compact ? "max-w-[42rem]" : "")}
			title={summary}>
			{days.map((day) => (
				<span
					key={`${employee.id}-${day.day}`}
					className={cn(
						"inline-flex min-w-[4.5rem] flex-col rounded border px-1.5 py-1 leading-tight",
						compact ? "text-[10px]" : "text-xs",
						day.isOff
							? "border-gray-200 bg-gray-50 text-gray-500"
							: "border-orange-100 bg-orange-50 text-gray-800",
					)}>
					<span className="font-semibold uppercase tracking-wide">{day.label}</span>
					<span>{day.isOff ? "Off" : `${day.startTime}–${day.endTime}`}</span>
				</span>
			))}
		</div>
	);
}

function EmployeeSchedulePreviewModal({
	open,
	employee,
	onOpenChange,
	onChangeSchedule,
}: {
	open: boolean;
	employee: Employee | null;
	onOpenChange: (open: boolean) => void;
	onChangeSchedule: () => void;
}) {
	if (!employee) return null;
	const name = employeeDisplayName(employee);
	const departmentName = employee.department?.name || "No department";
	const sectionName = employee.section?.name || "No section";
	const templateName = employee.embeddedSchedule?.templateName;

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title={`${name} schedule`}
			description={`${departmentName} · ${sectionName}`}
			className="max-w-3xl border border-gray-200 bg-white p-5 sm:p-6">
			<div className="space-y-4" data-testid="employee-schedule-preview">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="text-sm font-medium text-gray-900">{name}</p>
						<p className="text-xs text-gray-500">{employee.employeeId}</p>
						{templateName ? (
							<p className="mt-1 text-xs text-gray-600">Template: {templateName}</p>
						) : null}
					</div>
					<Button type="button" size="sm" onClick={onChangeSchedule} data-testid="change-weekly-hours">
						<Pencil className="h-4 w-4" />
						Change schedule
					</Button>
				</div>
				<div>
					<div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
						<Clock className="h-3.5 w-3.5" />
						Current week
					</div>
					<ScheduleWeekStrip employee={employee} />
				</div>
			</div>
		</Modal>
	);
}

export function EmployeeSchedulesPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const searchQuery = searchParams.get("search") || "";
	const departmentFilter = searchParams.get("departmentId") || "";
	const sectionFilter = searchParams.get("sectionId") || "";
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || DEFAULT_PAGE_SIZE;
	const [previewEmployee, setPreviewEmployee] = useState<Employee | null>(null);
	const [editorOpen, setEditorOpen] = useState(false);

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const filterParts = ["employmentStatus:ACTIVE"];
	if (departmentFilter && departmentFilter !== "all") {
		filterParts.push(`departmentId:${departmentFilter}`);
	}
	if (sectionFilter && sectionFilter !== "all") {
		filterParts.push(`sectionId:${sectionFilter}`);
	}

	const { data: employeesData, isLoading } = useEmployeeScheduleRoster({
		page: pageParam,
		limit: limitParam,
		query: searchQuery || undefined,
		filter: filterParts.join(","),
		sort: "employeeId",
		order: "asc",
		count: true,
	});
	const employeesPayload =
		(employeesData as any)?.employees || (employeesData as any)?.pagination
			? (employeesData as any)
			: Array.isArray((employeesData as any)?.data)
				? {
						employees: (employeesData as any).data,
						pagination: (employeesData as any)?.pagination,
					}
				: (employeesData as any)?.data || {};
	const roster: Employee[] = employeesPayload?.employees || [];
	const pagination = employeesPayload?.pagination;

	const { data: departmentsData } = useDepartments({
		page: 1,
		limit: 1000,
		sort: "name",
		order: "asc",
	});
	const departments: Department[] =
		(departmentsData as { departments?: Department[] } | undefined)?.departments || [];

	const { data: sectionsData } = useSections({
		page: 1,
		limit: 1000,
		sort: "name",
		order: "asc",
	});
	const sections = useMemo(() => {
		const payload = sectionsData as { sections?: Section[] } | undefined;
		return payload?.sections || [];
	}, [sectionsData]);

	const openPreview = (employee: Employee) => {
		setPreviewEmployee(employee);
		setEditorOpen(false);
	};

	const openEditor = (employee: Employee) => {
		setPreviewEmployee(employee);
		setEditorOpen(true);
	};

	const columns: Column<Employee>[] = [
		{
			key: "employeeId",
			label: "Employee",
			render: (_value, employee) => (
				<EmployeeTableCell
					fullName={employeeDisplayName(employee)}
					employeeId={employee.employeeId}
					stopPropagation
				/>
			),
		},
		{
			key: "department",
			label: "Department",
			render: (_value, employee) => (
				<span className="text-sm text-gray-700">{employee.department?.name || "—"}</span>
			),
		},
		{
			key: "section",
			label: "Section",
			render: (_value, employee) => (
				<span className="text-sm text-gray-700">{employee.section?.name || "—"}</span>
			),
		},
		{
			key: "embeddedSchedule",
			label: "Current schedule",
			render: (_value, employee) => <ScheduleWeekStrip employee={employee} compact />,
		},
	];

	return (
		<AdminTablePageShell className="gap-3">
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				<DataTable
					title="Employee Schedules"
					data={roster}
					columns={columns}
					containedScroll
					density="compact"
					showExport={false}
					showFilters={false}
					searchPlaceholder="Search name or employee ID..."
					searchWidth="w-64"
					searchValue={searchQuery}
					onSearch={(query) => {
						updateSearchParams((next) => {
							if (query) next.set("search", query);
							else next.delete("search");
							next.set("page", "1");
						});
					}}
					customFilters={
						<div className="min-w-[190px] sm:w-[240px]" data-testid="employee-schedule-org-filter">
							<DepartmentSectionPicker
								variant="datatable"
								departments={departments}
								sections={sections}
								departmentId={departmentFilter}
								sectionId={sectionFilter}
								onDepartmentChange={(nextValue) => {
									updateSearchParams((next) => {
										if (!nextValue || nextValue === "all") next.delete("departmentId");
										else next.set("departmentId", nextValue);
										next.delete("sectionId");
										next.set("page", "1");
									});
								}}
								onSectionChange={(nextDepartmentId, nextSectionId) => {
									updateSearchParams((next) => {
										if (nextDepartmentId && nextDepartmentId !== "all") {
											next.set("departmentId", nextDepartmentId);
										} else {
											next.delete("departmentId");
										}
										if (nextSectionId) next.set("sectionId", nextSectionId);
										else next.delete("sectionId");
										next.set("page", "1");
									});
								}}
							/>
						</div>
					}
					onRowClick={openPreview}
					renderActions={(employee) => (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => openEditor(employee)}
							data-testid={`change-schedule-${employee.id}`}>
							<Pencil className="h-4 w-4" />
							Change
						</Button>
					)}
					actionColumnWidth="6.5rem"
					isLoading={isLoading}
					emptyMessage="No employees found"
					emptyDescription="Try another department, section, or search."
					itemsPerPage={limitParam}
					currentPage={pageParam}
					totalItems={pagination?.total || roster.length}
					totalPages={pagination?.totalPages}
					onPageChange={(page) => {
						updateSearchParams((next) => next.set("page", String(page)));
					}}
				/>
			</div>

			<EmployeeSchedulePreviewModal
				open={Boolean(previewEmployee) && !editorOpen}
				employee={previewEmployee}
				onOpenChange={(open) => {
					if (!open) {
						setPreviewEmployee(null);
						setEditorOpen(false);
					}
				}}
				onChangeSchedule={() => setEditorOpen(true)}
			/>

			{previewEmployee ? (
				<ChangeWeeklyScheduleModal
					open={editorOpen}
					onOpenChange={(open) => {
						setEditorOpen(open);
						if (open) return;
						const next = roster.find((employee) => employee.id === previewEmployee.id);
						if (next) setPreviewEmployee(next);
					}}
					employee={previewEmployee}
					employeeName={employeeDisplayName(previewEmployee)}
				/>
			) : null}
		</AdminTablePageShell>
	);
}
