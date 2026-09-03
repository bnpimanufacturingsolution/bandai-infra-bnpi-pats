import type React from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface FormSelectProps {
	label?: string;
	name: string;
	value: string | number;
	onChange: (value: string) => void;
	options: Array<{ value: string | number; label: string }>;
	disabled?: boolean;
	error?: string;
	helpText?: string;
	placeholder?: string;
}

export function FormSelect({
	label,
	name,
	value,
	onChange,
	options,
	disabled = false,
	error,
	helpText,
	placeholder,
}: FormSelectProps) {
	return (
		<div className="space-y-2">
			{label && <Label htmlFor={name}>{label}</Label>}
			<Select value={String(value)} onValueChange={onChange} disabled={disabled}>
				<SelectTrigger id={name} className={error ? "border-red-500" : ""}>
					<SelectValue placeholder={placeholder} />
				</SelectTrigger>
				<SelectContent>
					{options.map((option) => (
						<SelectItem key={option.value} value={String(option.value)}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{helpText && !error && <p className="text-xs text-gray-500">{helpText}</p>}
			{error && <p className="text-xs text-red-500">{error}</p>}
		</div>
	);
}
