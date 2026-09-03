import type React from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface FormTextareaProps {
	label: string;
	name: string;
	value: string;
	onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
	placeholder?: string;
	disabled?: boolean;
	rows?: number;
	error?: string;
	helpText?: string;
}

export function FormTextarea({
	label,
	name,
	value,
	onChange,
	placeholder,
	disabled = false,
	rows = 4,
	error,
	helpText,
}: FormTextareaProps) {
	return (
		<div className="space-y-2">
			<Label htmlFor={name}>{label}</Label>
			<Textarea
				id={name}
				name={name}
				value={value}
				onChange={onChange}
				placeholder={placeholder}
				disabled={disabled}
				rows={rows}
				className={error ? "border-red-500" : ""}
			/>
			{helpText && !error && <p className="text-xs text-gray-500">{helpText}</p>}
			{error && <p className="text-xs text-red-500">{error}</p>}
		</div>
	);
}
