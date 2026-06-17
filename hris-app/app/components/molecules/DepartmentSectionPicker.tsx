import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { cn } from "~/lib/utils";
import { type Department } from "~/services/departments.service";
import { type Section } from "~/services/sections.service";

type DepartmentSectionPickerVariant = "compact" | "datatable" | "report";

type DepartmentSectionPickerProps = {
	departments: Department[];
	sections: Section[];
	departmentId?: string;
	sectionId?: string;
	onDepartmentChange: (departmentId: string) => void;
	onSectionChange: (departmentId: string, sectionId: string) => void;
	variant?: DepartmentSectionPickerVariant;
	className?: string;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	openSubDepartmentId?: string;
	onSubOpenChange?: (departmentId: string, open: boolean) => void;
};

type DepartmentMenuEntry = {
	type: "department";
	department: Department;
	sections: Section[];
};

const MAX_VISIBLE_DEPARTMENT_ITEMS = 11;

const triggerClassByVariant: Record<DepartmentSectionPickerVariant, string> = {
	compact:
		"h-9 min-w-[170px] rounded-md px-3 py-1 text-xs shadow-sm md:text-sm sm:w-[190px]",
	datatable:
		"h-10 min-w-0 rounded-lg px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm md:text-sm sm:w-[220px]",
	report:
		"h-9 min-w-[150px] rounded-md px-3 py-1 text-xs shadow-sm md:text-sm sm:w-[160px]",
};

const contentClassByVariant: Record<DepartmentSectionPickerVariant, string> = {
	compact:
		"max-h-96 min-w-[var(--radix-dropdown-menu-trigger-width)] rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
	datatable:
		"max-h-96 min-w-[var(--radix-dropdown-menu-trigger-width)] rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
	report:
		"max-h-96 min-w-[var(--radix-dropdown-menu-trigger-width)] rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
};

const subContentClassByVariant: Record<DepartmentSectionPickerVariant, string> = {
	compact:
		"max-h-96 min-w-[var(--radix-dropdown-menu-trigger-width)] rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
	datatable:
		"max-h-96 min-w-[var(--radix-dropdown-menu-trigger-width)] rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
	report:
		"max-h-96 min-w-[var(--radix-dropdown-menu-trigger-width)] rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
};

const itemClassByVariant: Record<DepartmentSectionPickerVariant, string> = {
	compact:
		"relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm font-normal outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
	datatable:
		"relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm font-normal outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
	report:
		"relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm font-normal outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
};

const selectedItemClassByVariant: Record<DepartmentSectionPickerVariant, string> = {
	compact: "bg-accent text-accent-foreground",
	datatable: "bg-accent text-accent-foreground",
	report: "bg-accent text-accent-foreground",
};

const subTriggerClassByVariant: Record<DepartmentSectionPickerVariant, string> = {
	compact:
		"relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm font-normal outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground [&>svg]:absolute [&>svg]:right-2 [&>svg]:ml-0 [&>svg]:h-4 [&>svg]:w-4",
	datatable:
		"relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm font-normal outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground [&>svg]:absolute [&>svg]:right-2 [&>svg]:ml-0 [&>svg]:h-4 [&>svg]:w-4",
	report:
		"relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm font-normal outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground [&>svg]:absolute [&>svg]:right-2 [&>svg]:ml-0 [&>svg]:h-4 [&>svg]:w-4",
};

const scrollButtonClassByVariant: Record<DepartmentSectionPickerVariant, string> = {
	compact:
		"flex cursor-default items-center justify-center py-1 outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
	datatable:
		"flex cursor-default items-center justify-center py-1 outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
	report:
		"flex cursor-default items-center justify-center py-1 outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
};

export function DepartmentSectionPicker({
	departments,
	sections,
	departmentId,
	sectionId,
	onDepartmentChange,
	onSectionChange,
	variant = "compact",
	className,
	open,
	onOpenChange,
	openSubDepartmentId,
	onSubOpenChange,
}: DepartmentSectionPickerProps) {
	const selectedDepartment = departments.find((dept) => dept.id === departmentId);
	const selectedSection = sections.find((section) => section.id === sectionId);
	const departmentScopeValue = selectedDepartment?.id || "all";
	const departmentFilterLabel =
		selectedDepartment && selectedSection
			? `${selectedDepartment.name} / ${selectedSection.name}`
			: selectedDepartment?.name || "All Departments";

	const sectionsByDepartment = useMemo(() => {
		const grouped = new Map<string, Section[]>();
		sections.forEach((section) => {
			if (!section.departmentId) return;
			const existing = grouped.get(section.departmentId) || [];
			existing.push(section);
			grouped.set(section.departmentId, existing);
		});
		return grouped;
	}, [sections]);
	const departmentEntries = useMemo<DepartmentMenuEntry[]>(
		() =>
			departments.map((department) => ({
				type: "department",
				department,
				sections: sectionsByDepartment.get(department.id) || [],
			})),
		[departments, sectionsByDepartment],
	);
	const [departmentWindowStart, setDepartmentWindowStart] = useState(0);
	const allDepartmentsItemCount = 1;
	const totalTopLevelItems = allDepartmentsItemCount + departmentEntries.length;
	const visibleTopLevelCount = Math.min(MAX_VISIBLE_DEPARTMENT_ITEMS, totalTopLevelItems);
	const maxDepartmentWindowStart = Math.max(0, totalTopLevelItems - visibleTopLevelCount);
	const canScrollDepartmentsUp = departmentWindowStart > 0;
	const canScrollDepartmentsDown = departmentWindowStart < maxDepartmentWindowStart;
	const selectedTopLevelIndex = selectedDepartment
		? allDepartmentsItemCount +
			departmentEntries.findIndex((entry) => entry.department.id === selectedDepartment.id)
		: 0;
	const visibleTopLevelItems = useMemo(() => {
		const topLevelItems = [
			{ type: "all" as const },
			...departmentEntries,
		];
		return topLevelItems.slice(
			departmentWindowStart,
			departmentWindowStart + visibleTopLevelCount,
		);
	}, [departmentEntries, departmentWindowStart, visibleTopLevelCount]);

	const departmentMenuContentClass = contentClassByVariant[variant];
	const departmentSubContentClass = subContentClassByVariant[variant];
	const departmentMenuItemClass = itemClassByVariant[variant];
	const departmentSubTriggerClass = subTriggerClassByVariant[variant];
	const scrollButtonClass = scrollButtonClassByVariant[variant];
	const selectedItemClass = selectedItemClassByVariant[variant];
	const selectedCheckClass = "h-4 w-4";

	useEffect(() => {
		setDepartmentWindowStart((current) => Math.min(current, maxDepartmentWindowStart));
	}, [maxDepartmentWindowStart]);

	const resetWindowToSelection = () => {
		const nextStart = Math.min(
			Math.max(0, selectedTopLevelIndex - Math.floor(visibleTopLevelCount / 2)),
			maxDepartmentWindowStart,
		);
		setDepartmentWindowStart(nextStart);
	};

	const handleMenuOpenChange = (nextOpen: boolean) => {
		if (nextOpen) resetWindowToSelection();
		onOpenChange?.(nextOpen);
	};

	const renderScrollButton = (direction: "up" | "down") => {
		const canScroll = direction === "up" ? canScrollDepartmentsUp : canScrollDepartmentsDown;
		if (!canScroll) return null;

		const Icon = direction === "up" ? ChevronUp : ChevronDown;
		return (
			<button
				type="button"
				aria-label={
					direction === "up" ? "Show previous departments" : "Show more departments"
				}
				data-ui={`timesheet-department-scroll-${direction}`}
				className={scrollButtonClass}
				onPointerDown={(event) => event.preventDefault()}
				onClick={(event) => {
					event.preventDefault();
					event.stopPropagation();
					setDepartmentWindowStart((current) =>
						direction === "up"
							? Math.max(0, current - 1)
							: Math.min(maxDepartmentWindowStart, current + 1),
					);
				}}>
				<Icon className="h-4 w-4" />
			</button>
		);
	};

	const renderDepartmentEntry = (entry: DepartmentMenuEntry) => {
		const dept = entry.department;
		const departmentSections = entry.sections;
		const isDepartmentSelected = departmentId === dept.id && !sectionId;
		const isDepartmentScopeSelected = departmentId === dept.id;

		if (departmentSections.length === 0) {
			return (
				<DropdownMenuItem
					key={dept.id}
					data-ui="timesheet-department-item"
					onSelect={() => onDepartmentChange(dept.id)}
					className={cn(departmentMenuItemClass, isDepartmentSelected && selectedItemClass)}>
					<span className="truncate">{dept.name}</span>
					<span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
						{isDepartmentSelected ? <Check className={selectedCheckClass} /> : null}
					</span>
				</DropdownMenuItem>
			);
		}

		return (
			<DropdownMenuSub
				key={dept.id}
				{...(openSubDepartmentId !== undefined
					? {
							open: openSubDepartmentId === dept.id,
							onOpenChange: (isOpen: boolean) => onSubOpenChange?.(dept.id, isOpen),
						}
					: {})}>
				<DropdownMenuSubTrigger
					data-ui="timesheet-department-sub-trigger"
					className={cn(
						departmentSubTriggerClass,
						isDepartmentScopeSelected && selectedItemClass,
					)}>
					<span className="truncate">{dept.name}</span>
				</DropdownMenuSubTrigger>
				<DropdownMenuSubContent
					sideOffset={4}
					alignOffset={-4}
					data-ui="timesheet-department-sub-content"
					className={departmentSubContentClass}>
					<DropdownMenuItem
						data-ui="timesheet-department-item"
						onSelect={() => onDepartmentChange(dept.id)}
						className={cn(departmentMenuItemClass, isDepartmentSelected && selectedItemClass)}>
						<span className="truncate">All {dept.name} sections</span>
						<span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
							{isDepartmentSelected ? <Check className={selectedCheckClass} /> : null}
						</span>
					</DropdownMenuItem>
					{departmentSections.map((section) => {
						const isSectionSelected = sectionId === section.id;
						return (
							<DropdownMenuItem
								key={section.id}
								data-ui="timesheet-department-item"
								onSelect={() => onSectionChange(dept.id, section.id)}
								className={cn(departmentMenuItemClass, isSectionSelected && selectedItemClass)}>
								<span className="truncate">{section.name}</span>
								<span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
									{isSectionSelected ? <Check className={selectedCheckClass} /> : null}
								</span>
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuSubContent>
			</DropdownMenuSub>
		);
	};

	return (
		<DropdownMenu open={open} onOpenChange={handleMenuOpenChange}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label="Filter by department or section"
					data-ui="timesheet-department-trigger"
					className={cn(
						"flex w-full items-center justify-between gap-2 border border-neutral-200 bg-white text-left outline-none transition-[color,box-shadow] hover:bg-neutral-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
						triggerClassByVariant[variant],
						className,
					)}>
					<span className="truncate">{departmentFilterLabel}</span>
					<ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				data-ui="timesheet-department-popup"
				className={departmentMenuContentClass}>
				{renderScrollButton("up")}
				{visibleTopLevelItems.map((entry) =>
					entry.type === "all" ? (
						<DropdownMenuItem
							key="all"
							data-ui="timesheet-department-item"
							onSelect={() => onDepartmentChange("all")}
							className={cn(
								departmentMenuItemClass,
								departmentScopeValue === "all" && selectedItemClass,
							)}>
							<span className="truncate">All Departments</span>
							<span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
								{departmentScopeValue === "all" ? (
									<Check className={selectedCheckClass} />
								) : null}
							</span>
						</DropdownMenuItem>
					) : (
						renderDepartmentEntry(entry)
					),
				)}
				{renderScrollButton("down")}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export const TimesheetDepartmentSectionPicker = DepartmentSectionPicker;
