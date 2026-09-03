import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";

export type HrDataTableSelectOption = {
	value: string;
	label: string;
};

export const hrDataTableSelectTriggerClass =
	"h-10 w-full min-w-0 rounded-lg border-neutral-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm";

export const hrDataTablePopoverSelectTriggerClass =
	"h-9 w-full sm:w-full min-w-0 rounded-md border-neutral-200 bg-white px-3 text-xs font-medium text-gray-700 shadow-sm focus:ring-2 focus:ring-primary/20";

export const hrDataTableFilterClass = "min-w-[170px] flex-[1_1_170px] sm:max-w-[220px]";

export const hrDataTableDepartmentFilterClass =
	"min-w-[190px] flex-[1_1_220px] sm:max-w-[280px]";

type HrDataTableManagerFilterProps = {
	value?: string;
	options: HrDataTableSelectOption[];
	onValueChange: (value: string) => void;
	placeholder?: string;
	dataUi?: string;
	open?: boolean;
	triggerClassName?: string;
};

export function HrDataTableManagerFilter({
	value,
	options,
	onValueChange,
	placeholder = "All Manager",
	dataUi,
	open,
	triggerClassName = hrDataTableSelectTriggerClass,
}: HrDataTableManagerFilterProps) {
	const contentDataUi = dataUi?.replace("-trigger", "-popup");
	const itemDataUi = dataUi?.replace("-trigger", "-item");

	return (
		<Select value={value || "all"} onValueChange={onValueChange} open={open}>
			<SelectTrigger data-ui={dataUi} className={triggerClassName}>
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent data-ui={contentDataUi}>
				{options.map((option) => (
					<SelectItem key={option.value} value={option.value} data-ui={itemDataUi}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
