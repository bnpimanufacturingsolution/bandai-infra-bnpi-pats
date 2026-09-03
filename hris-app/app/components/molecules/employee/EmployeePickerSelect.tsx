import * as React from "react";
import { Check, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "~/components/atoms/Button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { useEmployee, useEmployees } from "~/lib/hooks/useEmployees";
import { cn } from "~/lib/utils";
import type { Employee } from "~/services/employees.service";

type ScopeFilter = "context" | "all";
type WorkforceSourceFilter = "ALL" | "DIRECT" | "AGENCY";
type EmployeeOption = Employee & { _id?: string };

interface EmployeePickerSelectProps {
	value?: string | null;
	onValueChange?: (value: string) => void;
	placeholder?: string;
	searchPlaceholder?: string;
	departmentId?: string | null;
	sectionId?: string | null;
	agencyId?: string | null;
	excludeEmployeeId?: string | null;
	className?: string;
	error?: boolean;
	disabled?: boolean;
}

const EMPLOYEE_PICKER_FIELDS = [
	"id",
	"employeeId",
	"deviceEmpId",
	"person.personalInfo",
	"departmentId",
	"department.id",
	"department.name",
	"department.code",
	"sectionId",
	"section.id",
	"section.name",
	"section.code",
	"position.id",
	"position.title",
	"position.code",
	"level.id",
	"level.name",
	"level.rank",
	"employmentStatus",
	"workforceSource",
	"agencyId",
	"agency.id",
	"agency.name",
	"agency.code",
	"reportToId",
];

const getEmployeeId = (employee?: Partial<EmployeeOption> | null) =>
	String(employee?._id || employee?.id || "").trim();

const getEmployeeName = (employee?: Partial<Employee> | null) => {
	const info = employee?.person?.personalInfo;
	const name = `${info?.firstName || ""} ${info?.lastName || ""}`.trim();
	return name || employee?.employeeId || "Unnamed employee";
};

const getAssignmentLabel = (employee?: Partial<Employee> | null) =>
	[
		employee?.department?.name,
		employee?.section?.name,
		employee?.position?.title || employee?.level?.name,
	]
		.filter(Boolean)
		.join(" / ");

const compactFilterValue = (value?: string | null) =>
	String(value || "")
		.trim()
		.replaceAll(",", "\\,");

const buildEmployeeFilter = (params: {
	scope: ScopeFilter;
	departmentId?: string | null;
	sectionId?: string | null;
	source: WorkforceSourceFilter;
	agencyId?: string | null;
}) => {
	const filters: string[] = [];
	if (params.scope === "context") {
		if (params.departmentId) filters.push(`departmentId:${compactFilterValue(params.departmentId)}`);
		if (params.sectionId) filters.push(`sectionId:${compactFilterValue(params.sectionId)}`);
	}
	if (params.source !== "ALL") {
		filters.push(`workforceSource:${params.source}`);
		if (params.source === "AGENCY" && params.agencyId) {
			filters.push(`agencyId:${compactFilterValue(params.agencyId)}`);
		}
	}
	return filters.join(",");
};

function useDebouncedValue<T>(value: T, delayMs = 300) {
	const [debounced, setDebounced] = React.useState(value);

	React.useEffect(() => {
		const timeout = window.setTimeout(() => setDebounced(value), delayMs);
		return () => window.clearTimeout(timeout);
	}, [delayMs, value]);

	return debounced;
}

export function EmployeePickerSelect({
	value,
	onValueChange,
	placeholder = "Select employee",
	searchPlaceholder = "Search employee...",
	departmentId,
	sectionId,
	agencyId,
	excludeEmployeeId,
	className,
	error = false,
	disabled = false,
}: EmployeePickerSelectProps) {
	const [open, setOpen] = React.useState(false);
	const [query, setQuery] = React.useState("");
	const [scope, setScope] = React.useState<ScopeFilter>("context");
	const [source, setSource] = React.useState<WorkforceSourceFilter>("ALL");
	const scrollParentRef = React.useRef<HTMLDivElement>(null);
	const listId = React.useId();
	const debouncedQuery = useDebouncedValue(query);
	const hasContext = Boolean(departmentId || sectionId);
	const effectiveScope: ScopeFilter = hasContext ? scope : "all";
	const filter = buildEmployeeFilter({
		scope: effectiveScope,
		departmentId,
		sectionId,
		source,
		agencyId,
	});

	const { data, isFetching, isError, refetch } = useEmployees(
		{
			page: 1,
			limit: 50,
			query: debouncedQuery,
			fields: EMPLOYEE_PICKER_FIELDS,
			document: true,
			count: true,
			sort: "employeeId",
			order: "asc",
			...(filter ? { filter } : {}),
		},
		{ enabled: open },
	);
	const { data: selectedEmployee } = useEmployee(value || "", EMPLOYEE_PICKER_FIELDS);
	const selectedEmployeeId = getEmployeeId(selectedEmployee);
	const fetchedEmployees = React.useMemo(() => {
		const payload = (data as any)?.employees
			? data
			: Array.isArray((data as any)?.data)
				? { employees: (data as any).data }
				: (data as any)?.data || {};
		return payload?.employees || [];
	}, [data]);
	const candidates = React.useMemo(() => {
		const rows: Employee[] = [];
		const seen = new Set<string>();
		const excludedId = String(excludeEmployeeId || "").trim();

		if (selectedEmployee && selectedEmployeeId && selectedEmployeeId !== excludedId) {
			rows.push(selectedEmployee as Employee);
			seen.add(selectedEmployeeId);
		}

		for (const employee of fetchedEmployees) {
			const id = getEmployeeId(employee);
			if (!id || id === excludedId || seen.has(id)) continue;
			rows.push(employee);
			seen.add(id);
		}

		return rows;
	}, [excludeEmployeeId, fetchedEmployees, selectedEmployee, selectedEmployeeId]);
	const totalCount = Number(
		(data as any)?.count ||
			(data as any)?.data?.count ||
			(data as any)?.pagination?.total ||
			(data as any)?.data?.pagination?.total ||
			candidates.length ||
			0,
	);
	const selectedLabel = selectedEmployee
		? `${getEmployeeName(selectedEmployee)} (${selectedEmployee.employeeId || "No ID"})`
		: "";
	const rowVirtualizer = useVirtualizer({
		count: candidates.length,
		getScrollElement: () => scrollParentRef.current,
		estimateSize: () => 60,
		overscan: 6,
	});

	React.useEffect(() => {
		if (open) rowVirtualizer.scrollToIndex(0);
	}, [debouncedQuery, effectiveScope, open, rowVirtualizer, source]);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					role="combobox"
					aria-controls={listId}
					aria-expanded={open}
					disabled={disabled}
					className={cn(
						"mt-1 flex min-h-[42px] w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm font-normal leading-normal text-foreground hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary",
						error && "border-red-300 focus:border-red-500 focus:ring-red-500",
						disabled && "cursor-not-allowed opacity-50",
						className,
					)}>
					<span className="truncate">{value ? selectedLabel || value : placeholder}</span>
					<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-[min(560px,calc(100vw-32px))] p-0">
				<div className="border-b border-border p-3">
					<div className="flex h-10 items-center gap-2 rounded-md border border-border px-3">
						<Search className="h-4 w-4 shrink-0 text-muted-foreground" />
						<input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder={searchPlaceholder}
							className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
						/>
						{isFetching ? (
							<Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
						) : null}
					</div>
					<div className="mt-3 flex flex-wrap items-center gap-2">
						<button
							type="button"
							disabled={!hasContext}
							onClick={() => setScope("context")}
							className={cn(
								"rounded-md border px-2.5 py-1 text-xs font-medium",
								effectiveScope === "context"
									? "border-orange-200 bg-orange-50 text-orange-700"
									: "border-border text-muted-foreground hover:bg-muted/40",
								!hasContext && "cursor-not-allowed opacity-50",
							)}>
							Current org unit
						</button>
						<button
							type="button"
							onClick={() => setScope("all")}
							className={cn(
								"rounded-md border px-2.5 py-1 text-xs font-medium",
								effectiveScope === "all"
									? "border-orange-200 bg-orange-50 text-orange-700"
									: "border-border text-muted-foreground hover:bg-muted/40",
							)}>
							All units
						</button>
						{(["ALL", "DIRECT", "AGENCY"] as WorkforceSourceFilter[]).map((option) => (
							<button
								key={option}
								type="button"
								onClick={() => setSource(option)}
								className={cn(
									"rounded-md border px-2.5 py-1 text-xs font-medium",
									source === option
										? "border-orange-200 bg-orange-50 text-orange-700"
										: "border-border text-muted-foreground hover:bg-muted/40",
								)}>
								{option === "ALL" ? "All sources" : option}
							</button>
						))}
					</div>
				</div>

				<div id={listId} ref={scrollParentRef} className="max-h-[320px] overflow-y-auto">
					{isError ? (
						<div className="p-4 text-sm text-muted-foreground">
							Failed to load employees.
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="ml-2"
								onClick={() => refetch()}>
								Retry
							</Button>
						</div>
					) : candidates.length === 0 && !isFetching ? (
						<div className="p-4 text-sm text-muted-foreground">
							No employees found.
							{effectiveScope === "context" ? (
								<button
									type="button"
									className="ml-2 font-medium text-orange-700 hover:text-orange-800"
									onClick={() => setScope("all")}>
									Search all units
								</button>
							) : null}
						</div>
					) : (
						<div
							className="relative w-full"
							style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
							{rowVirtualizer.getVirtualItems().map((virtualRow) => {
								const employee = candidates[virtualRow.index];
								const employeeId = getEmployeeId(employee);
								const selected = employeeId === value;
								const sourceLabel =
									employee.workforceSource === "AGENCY"
										? employee.agency?.code || employee.agency?.name || "Agency"
										: "Direct";

								return (
									<button
										key={employeeId}
										type="button"
										className={cn(
											"absolute left-0 top-0 flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left hover:bg-muted/40",
											selected && "bg-orange-50",
										)}
										style={{
											height: `${virtualRow.size}px`,
											transform: `translateY(${virtualRow.start}px)`,
										}}
										onClick={() => {
											onValueChange?.(selected ? "" : employeeId);
											setOpen(false);
										}}>
										<div className="min-w-0 flex-1">
											<div className="truncate text-sm font-medium text-foreground">
												{getEmployeeName(employee)}{" "}
												<span className="font-normal text-muted-foreground">
													({employee.employeeId || "No ID"})
												</span>
											</div>
											<div className="truncate text-xs text-muted-foreground">
												{[
													employee.deviceEmpId
														? `Device ID ${employee.deviceEmpId}`
														: null,
													getAssignmentLabel(employee) || "No assignment",
												]
													.filter(Boolean)
													.join(" - ")}
											</div>
										</div>
										<span className="max-w-28 shrink-0 truncate text-xs text-muted-foreground">
											{sourceLabel}
										</span>
										<Check
											className={cn(
												"h-4 w-4 shrink-0",
												selected ? "opacity-100" : "opacity-0",
											)}
										/>
									</button>
								);
							})}
						</div>
					)}
				</div>
				<div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
					Showing {candidates.length} of {totalCount || candidates.length}
				</div>
			</PopoverContent>
		</Popover>
	);
}
