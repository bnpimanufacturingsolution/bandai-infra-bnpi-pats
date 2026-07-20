import { useEffect, useMemo, useState } from "react";
import { Check, Search, Users, X } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { EmployeeAvatar } from "~/components/atoms/EmployeeAvatar";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { HR_MODAL_EMPLOYEE_CLASS } from "~/lib/ui/admin-configuration-modal";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useEmployees } from "~/lib/hooks/useEmployees";
import { useLevels } from "~/lib/hooks/useLevels";
import { usePositions } from "~/lib/hooks/usePositions";
import { useSections } from "~/lib/hooks/useSections";
import { cn } from "~/lib/utils";
import type { Employee } from "~/services/employees.service";
import type { Position } from "~/services/positions.service";

export type EmployeeMultiSelectModalProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	selectedIds: string[];
	onConfirm: (ids: string[]) => void;
	/** When false, only one employee can be selected (edit reassignment). */
	multi?: boolean;
	title?: string;
	description?: string;
};

const ALL_VALUE = "all";

const getEmployeeName = (employee?: Partial<Employee> | null) => {
	const personalInfo = employee?.person?.personalInfo || {};
	const parts = [
		personalInfo.firstName,
		personalInfo.middleName,
		personalInfo.lastName,
	]
		.map((part) => String(part || "").trim())
		.filter(Boolean);
	return parts.join(" ") || employee?.employeeId || "Employee";
};

const getEmployeeRecordId = (employee: Employee) =>
	String((employee as any)?.id || (employee as any)?._id || "").trim();

const getEmployeeAvatar = (employee?: Partial<Employee> | null) =>
	(employee as any)?.user?.avatar ??
	(employee as any)?.avatar ??
	null;

export function EmployeeMultiSelectModal({
	open,
	onOpenChange,
	selectedIds,
	onConfirm,
	multi = true,
	title,
	description,
}: EmployeeMultiSelectModalProps) {
	const [draftIds, setDraftIds] = useState<string[]>(selectedIds);
	const [search, setSearch] = useState("");
	const [departmentId, setDepartmentId] = useState(ALL_VALUE);
	const [sectionId, setSectionId] = useState(ALL_VALUE);
	const [positionId, setPositionId] = useState(ALL_VALUE);
	const [levelId, setLevelId] = useState(ALL_VALUE);

	const {
		data: employeesData,
		isLoading: employeesLoading,
		isError: employeesError,
		isFetching: employeesFetching,
	} = useEmployees(
		{
			page: 1,
			limit: 1000,
			sort: "employeeId",
			order: "asc",
			count: true,
		},
		{ enabled: open },
	);
	const { data: departmentsData } = useDepartments(
		{
			page: 1,
			limit: 200,
			sort: "name",
			order: "asc",
		},
		{ enabled: open },
	);
	const { data: sectionsData } = useSections(
		{
			page: 1,
			limit: 1000,
			sort: "name",
			order: "asc",
			count: true,
		},
		{ enabled: open },
	);
	const { data: positionsData } = usePositions(
		{
			page: 1,
			limit: 1000,
			sort: "title",
			order: "asc",
			count: true,
		},
		{ enabled: open },
	);
	const { data: levelsData } = useLevels(
		{
			page: 1,
			limit: 500,
			sort: "rank",
			order: "asc",
			count: true,
		},
		{ enabled: open },
	);

	const employees = useMemo<Employee[]>(() => {
		const payload = employeesData as any;
		if (Array.isArray(payload?.employees)) return payload.employees;
		if (Array.isArray(payload?.data?.employees)) return payload.data.employees;
		if (Array.isArray(payload?.data)) return payload.data;
		if (Array.isArray(payload)) return payload;
		return [];
	}, [employeesData]);
	const departments = useMemo(
		() => (departmentsData as any)?.departments || [],
		[departmentsData],
	);
	const sections = useMemo(
		() => (sectionsData as any)?.sections || [],
		[sectionsData],
	);
	const positions = useMemo<Position[]>(
		() => (positionsData as any)?.positions || [],
		[positionsData],
	);
	const levels = useMemo(
		() => (levelsData as any)?.levels || [],
		[levelsData],
	);

	useEffect(() => {
		if (!open) return;
		setDraftIds(selectedIds);
		setSearch("");
		setDepartmentId(ALL_VALUE);
		setSectionId(ALL_VALUE);
		setPositionId(ALL_VALUE);
		setLevelId(ALL_VALUE);
	}, [open, selectedIds]);

	const departmentOptions = useMemo<SelectOption[]>(
		() => [
			{ value: ALL_VALUE, label: "All departments" },
			...departments.map((dept: { id: string; name?: string }) => ({
				value: dept.id,
				label: dept.name || dept.id,
			})),
		],
		[departments],
	);

	const sectionOptions = useMemo<SelectOption[]>(() => {
		const scoped =
			departmentId === ALL_VALUE
				? sections
				: sections.filter(
						(section: { departmentId?: string | null }) =>
							String(section.departmentId || "") === departmentId,
					);
		return [
			{ value: ALL_VALUE, label: "All sections" },
			...scoped.map((section: { id: string; name?: string }) => ({
				value: section.id,
				label: section.name || section.id,
			})),
		];
	}, [departmentId, sections]);

	const positionOptions = useMemo<SelectOption[]>(() => {
		const scoped = positions.filter((position) => {
			const posSectionId = String(position.sectionId || position.section?.id || "");
			const posDepartmentId = String(
				position.section?.departmentId || position.section?.department?.id || "",
			);
			if (sectionId !== ALL_VALUE) {
				return posSectionId === sectionId;
			}
			if (departmentId !== ALL_VALUE) {
				// Positions linked to a section in the department, or unscoped
				if (!posSectionId) return true;
				return posDepartmentId === departmentId;
			}
			return true;
		});
		return [
			{ value: ALL_VALUE, label: "All positions" },
			...scoped.map((position) => ({
				value: position.id,
				label: position.title || position.code || position.id,
			})),
		];
	}, [departmentId, positions, sectionId]);

	const levelOptions = useMemo<SelectOption[]>(() => {
		// When a position is selected and it has linked levels, scope level options.
		const selectedPosition =
			positionId !== ALL_VALUE
				? positions.find((position) => position.id === positionId)
				: undefined;
		const linkedLevelIds = new Set(
			(selectedPosition?.levels || selectedPosition?.levelIds || []).map((item) =>
				typeof item === "string" ? item : String(item.id || ""),
			),
		);
		const scoped =
			linkedLevelIds.size > 0
				? levels.filter((level: { id: string }) => linkedLevelIds.has(level.id))
				: levels;
		return [
			{ value: ALL_VALUE, label: "All levels" },
			...scoped.map((level: { id: string; name?: string; rank?: number }) => ({
				value: level.id,
				label: level.name || level.id,
			})),
		];
	}, [levels, positionId, positions]);

	const filteredEmployees = useMemo(() => {
		const query = search.trim().toLowerCase();
		return employees.filter((employee) => {
			if (
				departmentId !== ALL_VALUE &&
				String(employee.departmentId || employee.department?.id || "") !== departmentId
			) {
				return false;
			}
			if (
				sectionId !== ALL_VALUE &&
				String(employee.sectionId || employee.section?.id || "") !== sectionId
			) {
				return false;
			}
			if (
				positionId !== ALL_VALUE &&
				String(employee.positionId || employee.position?.id || "") !== positionId
			) {
				return false;
			}
			if (
				levelId !== ALL_VALUE &&
				String(employee.levelId || employee.level?.id || "") !== levelId
			) {
				return false;
			}
			if (!query) return true;
			const name = getEmployeeName(employee).toLowerCase();
			const code = String(employee.employeeId || "").toLowerCase();
			return name.includes(query) || code.includes(query);
		});
	}, [departmentId, employees, levelId, positionId, search, sectionId]);

	const draftSet = useMemo(() => new Set(draftIds), [draftIds]);
	const hasActiveFilters =
		search.trim().length > 0 ||
		departmentId !== ALL_VALUE ||
		sectionId !== ALL_VALUE ||
		positionId !== ALL_VALUE ||
		levelId !== ALL_VALUE;

	const filteredEmployeeIds = useMemo(
		() =>
			filteredEmployees
				.map((employee) => getEmployeeRecordId(employee))
				.filter(Boolean),
		[filteredEmployees],
	);

	const allFilteredSelected =
		multi &&
		filteredEmployeeIds.length > 0 &&
		filteredEmployeeIds.every((id) => draftSet.has(id));

	const toggleEmployee = (id: string) => {
		if (!id) return;
		if (multi) {
			setDraftIds((prev) =>
				prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
			);
			return;
		}
		setDraftIds([id]);
	};

	const handleSelectAllFiltered = () => {
		if (!multi || filteredEmployeeIds.length === 0) return;
		setDraftIds((prev) => {
			const next = new Set(prev);
			filteredEmployeeIds.forEach((id) => next.add(id));
			return Array.from(next);
		});
	};

	const handleClearFiltered = () => {
		if (!multi || filteredEmployeeIds.length === 0) return;
		const filteredSet = new Set(filteredEmployeeIds);
		setDraftIds((prev) => prev.filter((id) => !filteredSet.has(id)));
	};

	const handleConfirm = () => {
		onConfirm(draftIds);
		onOpenChange(false);
	};

	const handleDepartmentChange = (value: string) => {
		setDepartmentId(value);
		setSectionId(ALL_VALUE);
		setPositionId(ALL_VALUE);
		setLevelId(ALL_VALUE);
	};

	const handleSectionChange = (value: string) => {
		setSectionId(value);
		setPositionId(ALL_VALUE);
		setLevelId(ALL_VALUE);
	};

	const handlePositionChange = (value: string) => {
		setPositionId(value);
		setLevelId(ALL_VALUE);
	};

	const resolvedTitle =
		title || (multi ? "Select employees" : "Select employee");
	const resolvedDescription =
		description ||
		(multi
			? "Choose one or more employees to receive this payroll adjustment."
			: "Choose the employee for this benefit enrollment.");

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title={resolvedTitle}
			description={resolvedDescription}
			className={cn(
				HR_MODAL_EMPLOYEE_CLASS,
				"gap-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white p-0 shadow-xl",
				"[&>div:first-child]:border-b [&>div:first-child]:border-neutral-100 [&>div:first-child]:bg-neutral-50/80 [&>div:first-child]:px-6 [&>div:first-child]:pb-4 [&>div:first-child]:pt-5 [&>div:first-child]:pr-14",
			)}>
			<div className="flex max-h-[min(80vh,720px)] flex-col">
				<div className="space-y-3 border-b border-neutral-100 px-6 py-4">
					<div className="relative">
						<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Search name or employee ID..."
							className="h-10 rounded-lg border-neutral-200 pl-9"
							data-testid="employee-picker-search"
						/>
					</div>

					<div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
						<div className="space-y-1.5">
							<label className="text-xs font-medium text-neutral-600">
								Department
							</label>
							<Select
								options={departmentOptions}
								value={departmentId}
								onChange={handleDepartmentChange}
								placeholder="All departments"
							/>
						</div>
						<div className="space-y-1.5">
							<label className="text-xs font-medium text-neutral-600">Section</label>
							<Select
								options={sectionOptions}
								value={sectionId}
								onChange={handleSectionChange}
								placeholder="All sections"
							/>
						</div>
						<div className="space-y-1.5">
							<label className="text-xs font-medium text-neutral-600">Position</label>
							<Select
								options={positionOptions}
								value={positionId}
								onChange={handlePositionChange}
								placeholder="All positions"
							/>
						</div>
						<div className="space-y-1.5">
							<label className="text-xs font-medium text-neutral-600">Level</label>
							<Select
								options={levelOptions}
								value={levelId}
								onChange={setLevelId}
								placeholder="All levels"
							/>
						</div>
					</div>

					{/* Compact match count (single-select) or full selection toolbar (multi) */}
					{!multi ? (
						<div className="flex items-center justify-between text-xs text-neutral-500">
							<span>
								{filteredEmployees.length} employee
								{filteredEmployees.length === 1 ? "" : "s"}
								{hasActiveFilters ? " match" : ""}
							</span>
							<span className="font-medium text-neutral-700">
								{draftIds.length} selected
							</span>
						</div>
					) : null}
				</div>

				{multi && (
					<div
						className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 bg-neutral-50 px-6 py-3"
						data-testid="employee-picker-selection-bar">
						<div className="flex min-w-0 items-center gap-2.5">
							<span
								className={cn(
									"inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-semibold tabular-nums",
									draftIds.length > 0
										? "bg-neutral-900 text-white"
										: "bg-white text-neutral-600 ring-1 ring-neutral-200",
								)}
								data-testid="employee-picker-selected-count">
								{draftIds.length}
							</span>
							<div className="min-w-0">
								<p className="text-sm font-medium text-neutral-900">
									{draftIds.length === 0
										? "No employees selected"
										: draftIds.length === 1
											? "1 employee selected"
											: `${draftIds.length} employees selected`}
								</p>
								<p className="text-xs text-neutral-500">
									{employeesLoading ||
									(employeesFetching && employees.length === 0)
										? "Loading employees…"
										: hasActiveFilters
											? `${filteredEmployees.length} matching current filters`
											: `${filteredEmployees.length} employee${filteredEmployees.length === 1 ? "" : "s"} available`}
								</p>
							</div>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							{draftIds.length > 0 && (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-9 rounded-lg px-3 text-neutral-600 hover:bg-white hover:text-neutral-900"
									onClick={handleClearFiltered}
									disabled={filteredEmployeeIds.length === 0}
									data-testid="employee-picker-clear-selection">
									Clear
								</Button>
							)}
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="h-9 rounded-lg border-neutral-300 bg-white px-3.5 font-semibold text-neutral-900 shadow-sm hover:bg-neutral-900 hover:text-white"
								onClick={
									allFilteredSelected
										? handleClearFiltered
										: handleSelectAllFiltered
								}
								disabled={
									employeesLoading ||
									(employeesFetching && employees.length === 0) ||
									filteredEmployeeIds.length === 0
								}
								data-testid="employee-picker-select-all">
								{allFilteredSelected
									? hasActiveFilters
										? "Deselect matching"
										: "Deselect all"
									: hasActiveFilters
										? `Select all matching (${filteredEmployeeIds.length})`
										: `Select all (${filteredEmployeeIds.length || "…"})`}
							</Button>
						</div>
					</div>
				)}

				<div className="min-h-0 flex-1 overflow-y-auto bg-neutral-50/40 px-6 py-4 modern-scroll">
					{employeesLoading || (employeesFetching && employees.length === 0) ? (
						<div className="flex h-40 items-center justify-center text-sm text-neutral-500">
							Loading employees...
						</div>
					) : employeesError ? (
						<div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-red-600">
							Failed to load employees. Close and try again.
						</div>
					) : filteredEmployees.length === 0 ? (
						<div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-neutral-500">
							<Users className="h-8 w-8 text-neutral-300" />
							{employees.length === 0
								? "No employees available."
								: "No employees match these filters."}
						</div>
					) : (
						<div
							className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
							data-testid="employee-picker-grid">
							{filteredEmployees.map((employee) => {
								const id = getEmployeeRecordId(employee);
								const selected = draftSet.has(id);
								const name = getEmployeeName(employee);
								return (
									<button
										key={id}
										type="button"
										onClick={() => toggleEmployee(id)}
										data-testid={`employee-card-${id}`}
										aria-pressed={selected}
										className={cn(
											"relative flex flex-col items-center gap-2.5 rounded-xl border px-3 pb-3 pt-4 text-center transition-all",
											selected
												? "border-neutral-900 bg-white shadow-sm ring-1 ring-neutral-900"
												: "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50",
										)}>
										<span
											className={cn(
												"absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border",
												selected
													? "border-neutral-900 bg-neutral-900 text-white"
													: "border-neutral-300 bg-white text-transparent",
											)}>
											<Check className="h-3 w-3" />
										</span>
										<EmployeeAvatar
											src={getEmployeeAvatar(employee)}
											alt={name}
											size="xl"
											className="h-16 w-16 shrink-0"
										/>
										<div className="min-w-0 w-full space-y-0.5">
											<p className="truncate text-sm font-semibold text-neutral-900">
												{name}
											</p>
											<p className="truncate font-mono text-[11px] text-neutral-500">
												{employee.employeeId || "—"}
											</p>
										</div>
									</button>
								);
							})}
						</div>
					)}
				</div>

				<div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-neutral-100 bg-white px-6 py-4">
					{multi ? (
						<p className="text-xs text-neutral-500">
							{draftIds.length === 0
								? "Select at least one employee to continue"
								: `${draftIds.length} ready to confirm`}
						</p>
					) : (
						<span />
					)}
					<div className="flex items-center gap-2.5">
						<Button
							type="button"
							variant="outline"
							className="rounded-lg border-neutral-200"
							onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button
							type="button"
							className="rounded-lg bg-neutral-900 text-white hover:bg-neutral-800"
							onClick={handleConfirm}
							disabled={draftIds.length === 0}
							data-testid="employee-picker-confirm">
							{multi
								? `Confirm (${draftIds.length})`
								: draftIds.length
									? "Confirm"
									: "Select employee"}
						</Button>
					</div>
				</div>
			</div>
		</Modal>
	);
}

/** Compact selected-employee chips shown under the select button. */
export function SelectedEmployeeChips({
	employees,
	selectedIds,
	onRemove,
	disabled,
}: {
	employees: Employee[];
	selectedIds: string[];
	onRemove?: (id: string) => void;
	disabled?: boolean;
}) {
	const byId = useMemo(() => {
		const map = new Map<string, Employee>();
		employees.forEach((employee) => {
			const id = getEmployeeRecordId(employee);
			if (id) map.set(id, employee);
		});
		return map;
	}, [employees]);

	if (selectedIds.length === 0) return null;

	return (
		<div className="flex flex-wrap gap-2" data-testid="selected-employee-chips">
			{selectedIds.map((id) => {
				const employee = byId.get(id);
				const name = employee ? getEmployeeName(employee) : "Employee";
				const code = employee?.employeeId || id;
				return (
					<div
						key={id}
						className="flex max-w-full items-center gap-2 rounded-full border border-neutral-200 bg-white py-1 pl-1 pr-2 text-xs shadow-sm">
						<EmployeeAvatar
							src={getEmployeeAvatar(employee)}
							alt={name}
							size="sm"
							className="h-6 w-6 shrink-0"
						/>
						<span className="min-w-0 truncate font-medium text-neutral-800">{name}</span>
						<span className="shrink-0 font-mono text-[10px] text-neutral-400">
							{code}
						</span>
						{onRemove && !disabled && (
							<button
								type="button"
								aria-label={`Remove ${name}`}
								className="ml-0.5 rounded-full p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
								onClick={() => onRemove(id)}>
								<X className="h-3 w-3" />
							</button>
						)}
					</div>
				);
			})}
		</div>
	);
}
