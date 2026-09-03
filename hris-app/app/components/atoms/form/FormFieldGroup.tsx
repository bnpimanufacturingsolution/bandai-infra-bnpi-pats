/**
 * Form Field Group Component (Atom)
 *
 * Provides consistent structure for form fields with label, input, error, and helper text
 */

import * as React from "react";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";
import { AlertCircle } from "lucide-react";

export interface FormFieldGroupProps {
	name: string;
	label?: string;
	required?: boolean;
	error?: string;
	helperText?: string;
	constraintTokens?: Array<{ label: string; isMet?: boolean }>;
	children: React.ReactNode;
	className?: string;
	disabled?: boolean;
}

export function FormFieldGroup({
	name,
	label,
	required,
	error,
	helperText,
	constraintTokens = [],
	children,
	className,
	disabled,
}: FormFieldGroupProps) {
	const hasError = !!error;

	return (
		<div className={cn("space-y-2", className)} data-disabled={disabled}>
			{label && (
				<Label htmlFor={name} className={cn(hasError && "text-destructive")}>
					{label}
					{required && (
						<span className="text-destructive ml-1" aria-label="required">
							*
						</span>
					)}
				</Label>
			)}

			<div className="relative">{children}</div>

			{error && (
				<div className="flex items-start gap-2 text-sm text-destructive" role="alert">
					<AlertCircle className="size-4 mt-0.5 shrink-0" />
					<span>{error}</span>
				</div>
			)}

			{constraintTokens.length > 0 ? (
				<div className="flex flex-wrap gap-1.5">
					{constraintTokens.map((token) => (
						<span
							key={token.label}
							className={cn(
								"rounded-md border px-2 py-0.5 text-[11px] font-medium",
								token.isMet === false
									? "border-red-200 bg-red-50 text-red-700"
									: "border-gray-200 bg-gray-50 text-gray-600",
							)}>
							{token.label}
						</span>
					))}
				</div>
			) : null}

			{!error && helperText && <p className="text-sm text-muted-foreground">{helperText}</p>}
		</div>
	);
}
