import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { type Department } from "~/services/departments.service";
import { cn } from "~/lib/utils";

type DepartmentSelectProps = {
	departments: Department[];
	value?: string;
	onValueChange: (value: string) => void;
	allLabel?: string;
	placeholder?: string;
	disabled?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	triggerId?: string;
	className?: string;
	triggerClassName?: string;
	contentClassName?: string;
};

export function DepartmentSelect({
	departments,
	value,
	onValueChange,
	allLabel = "All Departments",
	placeholder = "Department",
	disabled,
	open,
	onOpenChange,
	triggerId,
	className,
	triggerClassName,
	contentClassName,
}: DepartmentSelectProps) {
	return (
		<div className={cn("min-w-[150px] max-w-full shrink-0 sm:min-w-[180px]", className)}>
			<Select
				value={value && value !== "all" ? value : "all"}
				onValueChange={onValueChange}
				open={open}
				onOpenChange={onOpenChange}
				disabled={disabled}>
				<SelectTrigger
					id={triggerId}
					data-ui="department-select-trigger"
					className={cn(
						"h-10 w-full rounded-xl border-neutral-200 bg-white text-xs font-semibold text-slate-700 shadow-sm focus:ring-2 focus:ring-primary/20",
						triggerClassName,
					)}>
					<SelectValue placeholder={placeholder} />
				</SelectTrigger>
				<SelectContent data-ui="department-select-popup" className={contentClassName}>
					<SelectItem value="all" data-ui="department-select-item">
						{allLabel}
					</SelectItem>
					{departments.map((department) => (
						<SelectItem
							key={department.id}
							value={department.id}
							data-ui="department-select-item">
							{department.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
