import { cn } from "@/lib/utils";
import { Text } from "@/components/atoms/Text";
import type { ReactNode } from "react";

interface FormFieldProps {
	label: string;
	htmlFor?: string;
	helperText?: string;
	error?: string;
	optional?: boolean;
	children: ReactNode;
	className?: string;
}

export const FormField = ({
	label,
	htmlFor,
	helperText,
	error,
	optional = false,
	children,
	className,
}: FormFieldProps) => {
	return (
		<div className={cn("space-y-2", className)}>
			<div className="flex items-center gap-2">
				<Text as="label" variant="label" className="text-foreground">
					{label}
				</Text>
				{optional && <span className="text-xs text-muted-foreground">(Optional)</span>}
			</div>
			{children}
			{helperText && !error && (
				<Text variant="caption" className="text-muted-foreground">
					{helperText}
				</Text>
			)}
			{error && (
				<Text variant="caption" className="text-destructive">
					{error}
				</Text>
			)}
		</div>
	);
};
