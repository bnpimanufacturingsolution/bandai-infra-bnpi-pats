/**
 * Dynamic Form Field Component (Molecule)
 *
 * Renders the appropriate form field based on configuration
 */

import * as React from "react";
import type { FieldConfig, FormFieldValue } from "~/types/job-application-form.types";
import { FormFieldGroup } from "~/components/atoms/form/FormFieldGroup";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Checkbox } from "~/components/ui/checkbox";
import { RadioGroupField } from "./RadioGroupField";
import { FileUpload } from "~/components/atoms/form/FileUpload";
import { Label } from "~/components/ui/label";
import { CalendarDatePicker } from "~/components/ui/calendar-date-picker";
import { cn } from "~/lib/utils";

export interface DynamicFormFieldProps {
	config: FieldConfig;
	value: FormFieldValue;
	error?: string;
	touched?: boolean;
	onChange: (value: FormFieldValue) => void;
	onBlur?: () => void;
	disabled?: boolean;
	compact?: boolean;
}

export function DynamicFormField({
	config,
	value,
	error,
	touched,
	onChange,
	onBlur,
	disabled,
	compact = false,
}: DynamicFormFieldProps) {
	const showError = Boolean(error && (touched ?? true));
	const visibleError = showError ? error : undefined;
	const compactControlClassName = compact ? "h-[42px] min-h-[42px]" : undefined;
	const constraintTokens = config.constraintTokens || [];

	// Render based on field type
	const renderInput = () => {
		switch (config.type) {
			case "text":
			case "email":
			case "tel":
			case "url": {
				const textConfig = config as Extract<
					FieldConfig,
					{ type: "text" | "email" | "tel" | "url" }
				>;
				return (
					<Input
						type={config.type}
						id={config.name}
						name={config.name}
						value={(value as string) || ""}
						onChange={(e) => onChange(e.target.value)}
						onBlur={onBlur}
						placeholder={config.placeholder}
						disabled={disabled || config.disabled}
						aria-invalid={!!showError}
						maxLength={textConfig.maxLength}
						className={compactControlClassName}
					/>
				);
			}

			case "number": {
				const numberConfig = config as Extract<FieldConfig, { type: "number" }>;
				return (
					<Input
						type="number"
						id={config.name}
						name={config.name}
						value={(value as string) || ""}
						onChange={(e) => onChange(e.target.value)}
						onBlur={onBlur}
						placeholder={config.placeholder}
						disabled={disabled || config.disabled}
						aria-invalid={!!showError}
						min={numberConfig.min}
						max={numberConfig.max}
						step={numberConfig.step}
						className={compactControlClassName}
					/>
				);
			}

			case "textarea": {
				const textareaConfig = config as Extract<FieldConfig, { type: "textarea" }>;
				return (
					<Textarea
						id={config.name}
						name={config.name}
						value={(value as string) || ""}
						onChange={(e) => onChange(e.target.value)}
						onBlur={onBlur}
						placeholder={config.placeholder}
						disabled={disabled || config.disabled}
						aria-invalid={!!showError}
						rows={textareaConfig.rows || 4}
						maxLength={textareaConfig.maxLength}
						className="resize-none"
					/>
				);
			}

			case "select": {
				const selectConfig = config as Extract<FieldConfig, { type: "select" }>;
				return (
					<Select
						value={(value as string) || ""}
						onValueChange={onChange as (value: string) => void}
						disabled={disabled || config.disabled}>
						<SelectTrigger
							id={config.name}
							aria-invalid={!!showError}
							onBlur={onBlur}
							className={compactControlClassName}>
							<SelectValue placeholder={config.placeholder || "Select an option"} />
						</SelectTrigger>
						<SelectContent>
							{selectConfig.options.map((option) => (
								<SelectItem
									key={option.value}
									value={option.value}
									disabled={option.disabled}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				);
			}

			case "radio": {
				const radioConfig = config as Extract<FieldConfig, { type: "radio" }>;
				return (
					<RadioGroupField
						name={config.name}
						value={(value as string) || ""}
						onChange={onChange as (value: string) => void}
						options={radioConfig.options}
						orientation={radioConfig.orientation}
						disabled={disabled || config.disabled}
						error={!!showError}
					/>
				);
			}

			case "checkbox": {
				const checkboxConfig = config as Extract<FieldConfig, { type: "checkbox" }>;
				return (
					<div className="flex items-start gap-3">
						<Checkbox
							id={config.name}
							name={config.name}
							checked={!!value}
							onCheckedChange={onChange as (checked: boolean) => void}
							disabled={disabled || config.disabled}
							aria-invalid={!!showError}
							className="mt-0.5"
						/>
						<div className="flex-1 min-w-0">
							<Label
								htmlFor={config.name}
								className="text-sm font-normal cursor-pointer">
								{config.label}
								{config.required && (
									<span className="text-destructive ml-1">*</span>
								)}
							</Label>
							{checkboxConfig.description && (
								<p className="text-sm text-muted-foreground mt-1">
									{checkboxConfig.description}
								</p>
							)}
						</div>
					</div>
				);
			}

			case "date": {
				const dateConfig = config as Extract<FieldConfig, { type: "date" }>;
				const dateValue =
					value instanceof Date
						? value.toISOString().split("T")[0]
						: (value as string) || "";

				return (
					<CalendarDatePicker
						value={dateValue}
						onChange={onChange as (value: string) => void}
						placeholder={config.placeholder || "MM/DD/YYYY"}
						disabled={disabled || config.disabled}
						minDate={dateConfig.minDate}
						maxDate={dateConfig.maxDate}
						className={cn(
							compactControlClassName,
							showError
								? "border-destructive focus-visible:ring-destructive/20"
								: undefined,
						)}
					/>
				);
			}

			case "file": {
				const fileConfig = config as Extract<FieldConfig, { type: "file" }>;
				return (
					<FileUpload
						name={config.name}
						value={value instanceof File ? value : null}
						onChange={onChange as (file: File | null) => void}
						accept={fileConfig.accept}
						maxSize={fileConfig.maxSize}
						allowedExtensions={fileConfig.allowedExtensions}
						disabled={disabled || config.disabled}
						error={!!showError}
						compact={compact}
					/>
				);
			}

			default:
				return <div>Unsupported field type</div>;
		}
	};

	// Checkbox fields have their own label rendering
	if (config.type === "checkbox") {
		if (compact) {
			return (
				<FormFieldGroup
					name={config.name}
					label={config.label}
					required={config.required}
					error={visibleError}
					helperText={config.helperText}
					constraintTokens={constraintTokens}
					disabled={disabled || config.disabled}>
					<label
						htmlFor={config.name}
						className={cn(
							"flex h-[42px] min-h-[42px] cursor-pointer items-center gap-3 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow]",
							"focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
							showError && "border-destructive ring-destructive/20",
							(disabled || config.disabled) && "cursor-not-allowed opacity-50",
						)}>
						<Checkbox
							id={config.name}
							name={config.name}
							checked={!!value}
							onCheckedChange={onChange as (checked: boolean) => void}
							disabled={disabled || config.disabled}
							aria-invalid={!!showError}
						/>
						<span className="truncate text-muted-foreground">
							{(config as Extract<FieldConfig, { type: "checkbox" }>).description ||
								"Yes"}
						</span>
					</label>
				</FormFieldGroup>
			);
		}

		return (
			<FormFieldGroup
				name={config.name}
				error={visibleError}
				helperText={config.helperText}
				constraintTokens={constraintTokens}
				disabled={disabled || config.disabled}>
				{renderInput()}
			</FormFieldGroup>
		);
	}

	// All other fields use the standard FormFieldGroup
	return (
		<FormFieldGroup
			name={config.name}
			label={config.label}
			required={config.required}
			error={visibleError}
			helperText={config.helperText}
			constraintTokens={constraintTokens}
			disabled={disabled || config.disabled}>
			{renderInput()}
		</FormFieldGroup>
	);
}
