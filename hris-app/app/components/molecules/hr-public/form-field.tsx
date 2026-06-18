import type * as React from "react";

import { cn } from "@/lib/utils";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Input } from "~/components/ui/input";

interface FormFieldProps {
	label: string;
	id: string;
	required?: boolean;
	error?: string;
	type?: "date" | "text" | "email" | "tel" | "textarea" | "file";
	placeholder?: string;
	value?: string;
	onChange?: (value: string) => void;
	onFileChange?: (file: File | null) => void;
	accept?: string;
	className?: string;
	/** Merged into the underlying input/textarea */
	inputClassName?: string;
}

export function FormField({
	label,
	id,
	required = false,
	error,
	type = "text",
	placeholder,
	value,
	onChange,
	onFileChange,
	accept,
	className,
	inputClassName,
}: FormFieldProps) {
	const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
		onChange?.(e.target.value);
	};

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0] || null;
		onFileChange?.(file);
	};

	return (
		<div className={cn("space-y-1.5", className)}>
			<Label htmlFor={id} className="text-[13px] font-medium text-neutral-700">
				{label}
				{required && <span className="text-red-500 ml-1">*</span>}
			</Label>
			{type === "textarea" ? (
				<Textarea
					id={id}
					placeholder={placeholder}
					value={value}
					onChange={handleChange}
					required={required}
					className={cn(error ? "ring-red-400/50" : "", inputClassName)}
				/>
			) : type === "file" ? (
				<Input
					id={id}
					type="file"
					accept={accept}
					onChange={handleFileChange}
					required={required}
					className={cn(error ? "ring-red-400/50" : "", inputClassName)}
				/>
			) : (
				<Input
					id={id}
					type={type}
					placeholder={placeholder}
					value={value}
					onChange={handleChange}
					required={required}
					className={cn(error ? "ring-red-400/50" : "", inputClassName)}
				/>
			)}
			{error && <p className="text-sm text-red-600">{error}</p>}
		</div>
	);
}
