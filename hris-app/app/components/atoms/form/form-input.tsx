import type React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FormInputProps {
	label: string;
	name: string;
	value: string | number;
	onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
	type?: string;
	placeholder?: string;
	disabled?: boolean;
	error?: string;
	helpText?: string;
}

export function FormInput({
	label,
	name,
	value,
	onChange,
	type = "text",
	placeholder,
	disabled = false,
	error,
	helpText,
}: FormInputProps) {
	return (
		<div className="space-y-2">
			<Label htmlFor={name}>{label}</Label>
			<Input
				id={name}
				type={type}
				name={name}
				value={value}
				onChange={onChange}
				placeholder={placeholder}
				disabled={disabled}
				className={error ? "border-red-500" : ""}
			/>
			{helpText && !error && <p className="text-xs text-gray-500">{helpText}</p>}
			{error && <p className="text-xs text-red-500">{error}</p>}
		</div>
	);
}
