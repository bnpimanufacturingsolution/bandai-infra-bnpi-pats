/**
 * Radio Group Field Component (Molecule)
 *
 * Renders a group of radio buttons with labels and descriptions
 */

import * as React from "react";
import { cn } from "~/lib/utils";
import { Label } from "~/components/ui/label";

export interface RadioOption {
	value: string;
	label: string;
	description?: string;
}

export interface RadioGroupFieldProps {
	name: string;
	value?: string;
	onChange: (value: string) => void;
	options: RadioOption[];
	orientation?: "horizontal" | "vertical";
	disabled?: boolean;
	error?: boolean;
}

export function RadioGroupField({
	name,
	value,
	onChange,
	options,
	orientation = "vertical",
	disabled,
	error,
}: RadioGroupFieldProps) {
	return (
		<div
			className={cn(
				"gap-4",
				orientation === "horizontal" ? "flex flex-wrap" : "flex flex-col",
			)}
			role="radiogroup"
			aria-labelledby={`${name}-label`}>
			{options.map((option) => {
				const isSelected = value === option.value;
				const radioId = `${name}-${option.value}`;

				return (
					<label
						key={option.value}
						htmlFor={radioId}
						className={cn(
							"flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
							"hover:border-primary/50 hover:bg-accent/50",
							isSelected && "border-primary bg-primary/5",
							!isSelected && "border-input",
							error && !isSelected && "border-destructive",
							disabled && "opacity-50 cursor-not-allowed",
						)}>
						<input
							type="radio"
							id={radioId}
							name={name}
							value={option.value}
							checked={isSelected}
							onChange={(e) => onChange(e.target.value)}
							disabled={disabled}
							className="mt-0.5 size-4 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed"
						/>
						<div className="flex-1 min-w-0">
							<div className="text-sm font-medium text-foreground">
								{option.label}
							</div>
							{option.description && (
								<div className="text-sm text-muted-foreground mt-1">
									{option.description}
								</div>
							)}
						</div>
					</label>
				);
			})}
		</div>
	);
}
