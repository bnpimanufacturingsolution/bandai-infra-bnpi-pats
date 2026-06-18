import { Input } from "~/components/atoms/Input";
import { Select, type SelectOption } from "~/components/atoms/Select";
import type { UseFormRegister } from "react-hook-form";

interface FormFieldProps {
	label: string;
	required?: boolean;
	error?: string;
	helpText?: string;
	children: React.ReactNode;
}

export function FormField({ label, required, error, helpText, children }: FormFieldProps) {
	return (
		<div>
			<label className="block text-sm font-medium text-gray-700 mb-2">
				{label} {required && <span className="text-red-500">*</span>}
			</label>
			{children}
			{helpText && <p className="text-xs text-gray-500 mt-1">{helpText}</p>}
			{error && <p className="text-xs text-red-500 mt-1">{error}</p>}
		</div>
	);
}

interface InputFieldProps {
	label: string;
	name: string;
	register: UseFormRegister<any>;
	required?: boolean;
	placeholder?: string;
	error?: string;
	helpText?: string;
	type?: string;
}

export function InputField({
	label,
	name,
	register,
	required,
	placeholder,
	error,
	helpText,
	type = "text",
}: InputFieldProps) {
	return (
		<FormField label={label} required={required} error={error} helpText={helpText}>
			<Input {...register(name)} placeholder={placeholder} type={type} />
		</FormField>
	);
}

interface TextAreaFieldProps {
	label: string;
	name: string;
	register: UseFormRegister<any>;
	required?: boolean;
	placeholder?: string;
	error?: string;
	helpText?: string;
	rows?: number;
}

export function TextAreaField({
	label,
	name,
	register,
	required,
	placeholder,
	error,
	helpText,
	rows = 4,
}: TextAreaFieldProps) {
	return (
		<FormField label={label} required={required} error={error} helpText={helpText}>
			<textarea
				{...register(name)}
				placeholder={placeholder}
				rows={rows}
				className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent min-h-[100px]"
			/>
		</FormField>
	);
}

interface SelectFieldProps {
	label: string;
	options: SelectOption[];
	value: string;
	onChange: (value: string) => void;
	required?: boolean;
	placeholder?: string;
	error?: string;
	helpText?: string;
	disabled?: boolean;
}

export function SelectField({
	label,
	options,
	value,
	onChange,
	required,
	placeholder,
	error,
	helpText,
	disabled,
}: SelectFieldProps) {
	return (
		<FormField label={label} required={required} error={error} helpText={helpText}>
			<Select
				options={options}
				value={value}
				onChange={onChange}
				placeholder={placeholder}
				disabled={disabled}
			/>
		</FormField>
	);
}
