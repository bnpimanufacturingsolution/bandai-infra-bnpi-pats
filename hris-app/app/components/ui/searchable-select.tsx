"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "~/lib/utils";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "~/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";

export interface SearchableSelectOption {
	value: string;
	label: string;
	description?: string;
	badge?: string;
}

interface SearchableSelectProps {
	options: SearchableSelectOption[];
	value?: string;
	onValueChange?: (value: string) => void;
	placeholder?: string;
	searchPlaceholder?: string;
	emptyText?: string;
	emptyActionLabel?: string;
	onEmptyActionSelect?: () => void;
	onOpenChange?: (open: boolean) => void;
	className?: string;
	disabled?: boolean;
}

export function SearchableSelect({
	options,
	value,
	onValueChange,
	placeholder = "Select option...",
	searchPlaceholder = "Search...",
	emptyText = "No option found.",
	emptyActionLabel,
	onEmptyActionSelect,
	onOpenChange,
	className,
	disabled = false,
}: SearchableSelectProps) {
	const [open, setOpen] = React.useState(false);
	const listId = React.useId();
	const selectedOption = React.useMemo(
		() => options.find((option) => option.value === value),
		[options, value],
	);
	const handleOpenChange = React.useCallback(
		(nextOpen: boolean) => {
			setOpen(nextOpen);
			onOpenChange?.(nextOpen);
		},
		[onOpenChange],
	);

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<button
					type="button"
					role="combobox"
					aria-controls={listId}
					aria-expanded={open}
					disabled={disabled}
					className={cn(
						"mt-1 w-full flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-foreground hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary font-normal text-sm leading-normal min-h-[42px]",
						disabled && "opacity-50 cursor-not-allowed",
						className,
					)}>
					<span className="truncate">
						{value ? selectedOption?.label || value : placeholder}
					</span>
					<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				data-filter-select
				align="start"
				className="w-[var(--radix-popover-trigger-width)] min-w-[12rem] p-0">
				<Command>
					<CommandInput placeholder={searchPlaceholder} className="h-9" />
					<CommandList id={listId}>
						<CommandEmpty>
							<div className="px-3 py-2 text-sm text-muted-foreground">
								<p>{emptyText}</p>
								{emptyActionLabel && onEmptyActionSelect ? (
									<button
										type="button"
										className="mt-2 text-sm font-medium text-orange-700 hover:text-orange-800"
										onClick={() => {
											setOpen(false);
											onEmptyActionSelect();
										}}>
										{emptyActionLabel}
									</button>
								) : null}
							</div>
						</CommandEmpty>
					<CommandGroup>
						{options.map((option) => (
							<CommandItem
								key={option.value}
								value={`${option.label} ${option.value}`}
								keywords={[option.label, option.description || "", option.badge || "", option.value]}
								onSelect={() => {
									const newValue = option.value === value ? "" : option.value;
									onValueChange?.(newValue);
									setOpen(false);
								}}>
									<div className="min-w-0 flex-1">
										<div className="truncate text-sm">{option.label}</div>
										{option.description ? (
											<div className="truncate text-xs text-muted-foreground">
												{option.description}
											</div>
										) : null}
									</div>
									{option.badge ? (
										<span className="ml-3 shrink-0 text-xs text-muted-foreground">
											{option.badge}
										</span>
									) : null}
									<Check
										className={cn(
											"ml-auto h-4 w-4",
											value === option.value ? "opacity-100" : "opacity-0",
										)}
									/>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
