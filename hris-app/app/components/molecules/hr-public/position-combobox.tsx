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
import type { Position } from "~/services/positions.service";

interface PositionComboboxProps {
	positions: Position[];
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	isLoading?: boolean;
}

export function PositionCombobox({
	positions,
	value,
	onChange,
	disabled,
	isLoading,
}: PositionComboboxProps) {
	const [open, setOpen] = React.useState(false);

	const selectedPosition = positions.find((position) => position.id === value);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					className="w-full justify-between"
					disabled={disabled || isLoading}>
					{selectedPosition ? selectedPosition.title : "Select position..."}
					<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-full p-0" align="start">
				<Command>
					<CommandInput placeholder="Search position..." />
					<CommandList>
						<CommandEmpty>
							{isLoading ? "Loading positions..." : "No position found."}
						</CommandEmpty>
						<CommandGroup>
							{positions.map((position) => (
								<CommandItem
									key={position.id}
									value={position.title}
									onSelect={() => {
										onChange(position.id);
										setOpen(false);
									}}>
									<Check
										className={cn(
											"mr-2 h-4 w-4",
											value === position.id ? "opacity-100" : "opacity-0",
										)}
									/>
									{position.title}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
