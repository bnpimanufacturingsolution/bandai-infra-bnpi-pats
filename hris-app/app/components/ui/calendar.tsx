import * as React from "react";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import {
	DayPicker,
	getDefaultClassNames,
	type DayButton,
	type DropdownProps,
} from "react-day-picker";

import { cn } from "~/lib/utils";
import { Button, buttonVariants } from "~/components/ui/button";

export interface Holiday {
	date: Date;
	name: string;
	type: "COMPANY" | "GOVERNMENT";
	description?: string;
	id?: string;
}

function Calendar({
	className,
	classNames,
	showOutsideDays = true,
	captionLayout = "label",
	buttonVariant = "ghost",
	formatters,
	components,
	holidays,
	onHolidayClick,
	...props
}: React.ComponentProps<typeof DayPicker> & {
	buttonVariant?: React.ComponentProps<typeof Button>["variant"];
	holidays?: Holiday[];
	onHolidayClick?: (holiday: Holiday) => void;
}) {
	const defaultClassNames = getDefaultClassNames();
	void holidays;
	void onHolidayClick;

	return (
		<DayPicker
			showOutsideDays={showOutsideDays}
			className={cn(
				"bg-background group/calendar p-3 [--cell-size:--spacing(8)] [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
				String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
				String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
				className,
			)}
			captionLayout={captionLayout}
			formatters={{
				formatMonthDropdown: (date) => date.toLocaleString("default", { month: "short" }),
				...formatters,
			}}
			classNames={{
				root: cn("w-fit", defaultClassNames.root),
				months: cn("flex gap-4 flex-col md:flex-row relative", defaultClassNames.months),
				month: cn(
					"flex flex-col w-full",
					captionLayout === "label" ? "gap-4" : "gap-2",
					defaultClassNames.month,
				),
				nav: cn(
					"pointer-events-none flex items-center gap-1 w-full absolute top-0 inset-x-0 justify-between",
					defaultClassNames.nav,
				),
				button_previous: cn(
					buttonVariants({ variant: buttonVariant }),
					"pointer-events-auto size-(--cell-size) aria-disabled:opacity-50 p-0 select-none",
					defaultClassNames.button_previous,
				),
				button_next: cn(
					buttonVariants({ variant: buttonVariant }),
					"pointer-events-auto size-(--cell-size) aria-disabled:opacity-50 p-0 select-none",
					defaultClassNames.button_next,
				),
				month_caption: cn(
					"flex items-center justify-center w-full px-(--cell-size)",
					captionLayout === "label" ? "h-(--cell-size)" : "min-h-9",
					defaultClassNames.month_caption,
				),
				dropdowns: cn(
					"w-full flex items-center text-sm font-medium justify-center min-h-9 gap-2",
					defaultClassNames.dropdowns,
				),
				dropdown_root: cn(
					"relative has-focus:border-ring border border-input shadow-xs has-focus:ring-ring/50 has-focus:ring-[3px] rounded-md",
					defaultClassNames.dropdown_root,
				),
				dropdown: cn("absolute bg-popover inset-0 opacity-0", defaultClassNames.dropdown),
				caption_label: cn(
					"select-none font-medium",
					captionLayout === "label"
						? "text-sm"
						: "rounded-md pl-2 pr-1 flex items-center gap-1 text-sm h-8 [&>svg]:text-muted-foreground [&>svg]:size-3.5",
					defaultClassNames.caption_label,
				),
				table: "w-full border-collapse",
				weekdays: cn("flex", defaultClassNames.weekdays),
				weekday: cn(
					"text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem] select-none",
					defaultClassNames.weekday,
				),
				week: cn("flex w-full mt-2", defaultClassNames.week),
				week_number_header: cn(
					"select-none w-(--cell-size)",
					defaultClassNames.week_number_header,
				),
				week_number: cn(
					"text-[0.8rem] select-none text-muted-foreground",
					defaultClassNames.week_number,
				),
				day: cn(
					"relative w-full h-full p-0 text-center [&:last-child[data-selected=true]_button]:rounded-r-md group/day aspect-square select-none hover:bg-orange-100 hover:text-orange-900",
					props.showWeekNumber
						? "[&:nth-child(2)[data-selected=true]_button]:rounded-l-md"
						: "[&:first-child[data-selected=true]_button]:rounded-l-md",
					defaultClassNames.day,
				),
				day_selected:
					"bg-orange-500 text-white hover:bg-orange-500 hover:text-white focus:bg-orange-500 focus:text-white",
				range_start: cn("rounded-l-md", defaultClassNames.range_start),
				range_middle: cn("rounded-none", defaultClassNames.range_middle),
				range_end: cn("rounded-r-md", defaultClassNames.range_end),
				today: cn(
					"bg-transparent text-foreground data-[selected=true]:bg-orange-500 data-[selected=true]:text-white",
					defaultClassNames.today,
				),
				outside: cn(
					"text-muted-foreground aria-selected:text-muted-foreground",
					defaultClassNames.outside,
				),
				disabled: cn("text-muted-foreground opacity-50", defaultClassNames.disabled),
				hidden: cn("invisible", defaultClassNames.hidden),
				...classNames,
			}}
			components={{
				Root: ({ className, rootRef, ...props }) => {
					return (
						<div
							data-slot="calendar"
							ref={rootRef}
							className={cn(className)}
							{...props}
						/>
					);
				},
				Chevron: ({ className, orientation, ...props }) => {
					if (orientation === "left") {
						return <ChevronLeftIcon className={cn("size-4", className)} {...props} />;
					}

					if (orientation === "right") {
						return <ChevronRightIcon className={cn("size-4", className)} {...props} />;
					}

					return <ChevronDownIcon className={cn("size-4", className)} {...props} />;
				},
				Dropdown: CalendarDropdown,
				DayButton: CalendarDayButton,
				WeekNumber: ({ children, ...props }) => {
					return (
						<td {...props}>
							<div className="flex size-(--cell-size) items-center justify-center text-center">
								{children}
							</div>
						</td>
					);
				},
				...components,
			}}
			{...props}
		/>
	);
}

const MONTH_SHORT_LABELS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

export function orderCalendarDropdownOptions(
	options: Array<{ value?: string | number; label?: string; disabled?: boolean }> = [],
) {
	const isYearDropdown = options.length > 12;
	const normalized = options.map((option) => ({
		value: String(option.value),
		label: String(option.label ?? option.value ?? ""),
		disabled: option.disabled,
		numeric: Number(option.value),
	}));

	if (!isYearDropdown) {
		const minValue = Math.min(...normalized.map((option) => option.numeric), 0);
		return {
			isYearDropdown,
			selectOptions: normalized.map((option) => {
				const monthIndex = minValue === 0 ? option.numeric : option.numeric - 1;
				return {
					value: option.value,
					label: MONTH_SHORT_LABELS[monthIndex] ?? option.label,
					disabled: option.disabled,
				};
			}),
		};
	}

	const newestFirst = [...normalized].sort((left, right) => right.numeric - left.numeric);
	return {
		isYearDropdown,
		selectOptions: newestFirst.map((option) => ({
			value: option.value,
			label: option.label,
			disabled: option.disabled,
		})),
	};
}

export function calendarYearGridPage(
	selectedYear: number,
	years: number[],
	pageSize = 12,
): { years: number[]; page: number; pageCount: number } {
	const sorted = [...new Set(years)].sort((left, right) => left - right);
	if (sorted.length === 0) {
		return { years: [], page: 0, pageCount: 0 };
	}
	const selectedIndex = Math.max(
		0,
		sorted.findIndex((year) => year === selectedYear),
	);
	const page = Math.floor((selectedIndex === -1 ? 0 : selectedIndex) / pageSize);
	const start = page * pageSize;
	return {
		years: sorted.slice(start, start + pageSize),
		page,
		pageCount: Math.ceil(sorted.length / pageSize),
	};
}

function CalendarDropdown({
	options = [],
	value,
	onChange,
	disabled,
	"aria-label": ariaLabel,
}: DropdownProps) {
	const [open, setOpen] = React.useState(false);
	const rootRef = React.useRef<HTMLDivElement>(null);
	const { isYearDropdown, selectOptions } = orderCalendarDropdownOptions(options);
	const selectedValue = value === undefined ? "" : String(value);
	const selectedOption =
		selectOptions.find((option) => option.value === selectedValue) ?? selectOptions[0];
	const yearValues = React.useMemo(
		() => selectOptions.map((option) => Number(option.value)),
		[selectOptions],
	);
	const selectedYear = Number(selectedValue);
	const [yearPage, setYearPage] = React.useState(
		() => calendarYearGridPage(selectedYear, yearValues).page,
	);

	React.useEffect(() => {
		setYearPage(calendarYearGridPage(selectedYear, yearValues).page);
	}, [selectedYear]);

	React.useEffect(() => {
		if (!open) return;
		const handlePointer = (event: MouseEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", handlePointer);
		return () => document.removeEventListener("mousedown", handlePointer);
	}, [open]);

	const handleChange = (nextValue: string) => {
		onChange?.({
			target: { value: nextValue },
		} as React.ChangeEvent<HTMLSelectElement>);
		setOpen(false);
	};

	const pagedYears = React.useMemo(() => {
		const grid = calendarYearGridPage(selectedYear, yearValues);
		const start = yearPage * 12;
		return {
			years: yearValues
				.slice()
				.sort((left, right) => left - right)
				.filter((year, index, all) => all.indexOf(year) === index)
				.slice(start, start + 12),
			pageCount: grid.pageCount,
		};
	}, [selectedYear, yearPage, yearValues]);

	return (
		<div ref={rootRef} className="relative shrink-0" aria-label={ariaLabel}>
			<button
				type="button"
				disabled={disabled}
				onClick={() => setOpen((current) => !current)}
				className={cn(
					"inline-flex h-8 min-w-[4.5rem] items-center justify-between gap-1 rounded-md border border-neutral-200 bg-white px-2.5 text-sm font-medium text-neutral-900 shadow-sm",
					"hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50",
					open && "border-orange-400 ring-2 ring-orange-100",
				)}>
				<span>{selectedOption?.label || (isYearDropdown ? "Year" : "Month")}</span>
				<ChevronDownIcon className="size-3.5 text-neutral-500" />
			</button>
			{open ? (
				<div className="absolute left-1/2 top-[calc(100%+6px)] z-30 w-[220px] -translate-x-1/2 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg">
					{isYearDropdown ? (
						<div className="space-y-2">
							<div className="flex items-center justify-between px-1">
								<button
									type="button"
									className="rounded-md p-1 hover:bg-neutral-100 disabled:opacity-30"
									disabled={yearPage <= 0}
									onClick={() => setYearPage((page) => Math.max(0, page - 1))}>
									<ChevronLeftIcon className="size-4" />
								</button>
								<p className="text-xs font-medium text-neutral-500">
									{pagedYears.years[0]}
									{pagedYears.years.length > 1
										? ` – ${pagedYears.years[pagedYears.years.length - 1]}`
										: ""}
								</p>
								<button
									type="button"
									className="rounded-md p-1 hover:bg-neutral-100 disabled:opacity-30"
									disabled={yearPage >= pagedYears.pageCount - 1}
									onClick={() =>
										setYearPage((page) =>
											Math.min(pagedYears.pageCount - 1, page + 1),
										)
									}>
									<ChevronRightIcon className="size-4" />
								</button>
							</div>
							<div className="grid grid-cols-4 gap-1">
								{pagedYears.years.map((year) => {
									const active = String(year) === selectedValue;
									return (
										<button
											key={year}
											type="button"
											onClick={() => handleChange(String(year))}
											className={cn(
												"h-8 rounded-md text-sm font-medium",
												active
													? "bg-orange-500 text-white"
													: "text-neutral-800 hover:bg-orange-50",
											)}>
											{year}
										</button>
									);
								})}
							</div>
						</div>
					) : (
						<div className="grid grid-cols-3 gap-1">
							{selectOptions.map((option) => {
								const active = option.value === selectedValue;
								return (
									<button
										key={option.value}
										type="button"
										disabled={option.disabled}
										onClick={() => handleChange(option.value)}
										className={cn(
											"h-8 rounded-md text-sm font-medium",
											active
												? "bg-orange-500 text-white"
												: "text-neutral-800 hover:bg-orange-50",
											option.disabled && "opacity-40",
										)}>
										{option.label}
									</button>
								);
							})}
						</div>
					)}
				</div>
			) : null}
		</div>
	);
}

function CalendarDayButton({
	className,
	day,
	modifiers,
	...props
}: React.ComponentProps<typeof DayButton>) {
	const defaultClassNames = getDefaultClassNames();

	const ref = React.useRef<HTMLButtonElement>(null);
	React.useEffect(() => {
		if (modifiers.focused) ref.current?.focus();
	}, [modifiers.focused]);

	return (
		<Button
			ref={ref}
			variant="ghost"
			size="icon"
			data-day={day.date.toLocaleDateString()}
			data-selected-single={
				modifiers.selected &&
				!modifiers.range_start &&
				!modifiers.range_end &&
				!modifiers.range_middle
			}
			data-range-start={modifiers.range_start}
			data-range-end={modifiers.range_end}
			data-range-middle={modifiers.range_middle}
			className={cn(
				"data-[selected-single=true]:bg-orange-500 data-[selected-single=true]:text-white data-[range-middle=true]:bg-orange-100 data-[range-middle=true]:text-orange-900 data-[range-start=true]:bg-orange-500 data-[range-start=true]:text-white data-[range-end=true]:bg-orange-500 data-[range-end=true]:text-white group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-ring/50 dark:hover:text-accent-foreground flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-[3px] data-[range-end=true]:rounded-md data-[range-end=true]:rounded-r-md data-[range-middle=true]:rounded-none data-[range-start=true]:rounded-md data-[range-start=true]:rounded-l-md [&>span]:text-xs [&>span]:opacity-70 hover:bg-orange-100 hover:text-orange-900",
				defaultClassNames.day,
				className,
			)}
			{...props}
		/>
	);
}

export { Calendar, CalendarDayButton };
