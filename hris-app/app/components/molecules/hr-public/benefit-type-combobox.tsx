import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface BenefitType {
	id: string;
	name: string;
	description?: string;
	fixedAmount?: number;
}

interface BenefitTypeComboboxProps {
	benefitTypes: BenefitType[];
	value: string;
	onChange: (value: string, benefitType?: BenefitType) => void;
	disabled?: boolean;
	isLoading?: boolean;
	placeholder?: string;
}

export function BenefitTypeCombobox({
	benefitTypes,
	value,
	onChange,
	disabled,
	isLoading,
	placeholder = "Select benefit type...",
}: BenefitTypeComboboxProps) {
	const [open, setOpen] = React.useState(false);

	const selectedBenefitType = benefitTypes.find((type) => type.id === value);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					className="h-10 w-full justify-between px-2.5 py-1.5 text-sm font-normal border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
					disabled={disabled || isLoading}>
					<span className="truncate">
						{selectedBenefitType ? selectedBenefitType.name : placeholder}
					</span>
					<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[280px] p-0" align="start">
				<Command>
					<CommandInput placeholder="Search benefit type..." />
					<CommandList>
						<CommandEmpty>
							{isLoading ? "Loading benefit types..." : "No benefit type found."}
						</CommandEmpty>
						<CommandGroup>
							{benefitTypes.map((type) => (
								<CommandItem
									key={type.id}
									value={type.name}
									onSelect={() => {
										onChange(type.id, type);
										setOpen(false);
									}}>
									<Check
										className={cn(
											"mr-2 h-4 w-4",
											value === type.id ? "opacity-100" : "opacity-0",
										)}
									/>
									<div className="flex flex-col">
										<span>{type.name}</span>
										{type.description && (
											<span className="text-xs text-gray-500 truncate max-w-[200px]">
												{type.description}
											</span>
										)}
									</div>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
