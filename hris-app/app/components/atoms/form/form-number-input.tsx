import type React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FormNumberInputProps {
	label: string;
	name: string;
	value: number;
	onChange: (value: number) => void;
	placeholder?: string;
	disabled?: boolean;
	min?: number;
	max?: number;
	step?: number;
	error?: string;
	helpText?: string;
}

export function FormNumberInput({
	label,
	name,
	value,
	onChange,
	placeholder,
	disabled = false,
	min,
	max,
	step = 1,
	error,
	helpText,
}: FormNumberInputProps) {
	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newValue = e.target.value === "" ? 0 : Number(e.target.value);
		onChange(newValue);
	};

	return (
		<div className="space-y-2">
			<Label htmlFor={name}>{label}</Label>
			<Input
				id={name}
				type="number"
				name={name}
				value={value}
				onChange={handleChange}
				placeholder={placeholder}
				disabled={disabled}
				min={min}
				max={max}
				step={step}
				className={error ? "border-red-500" : ""}
			/>
			{helpText && !error && <p className="text-xs text-gray-500">{helpText}</p>}
			{error && <p className="text-xs text-red-500">{error}</p>}
		</div>
	);
}
