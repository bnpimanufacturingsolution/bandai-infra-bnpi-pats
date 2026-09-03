/**
 * Form Section Component (Organism)
 *
 * Renders a collapsible section of form fields with title and description
 */

import * as React from "react";
import type {
	FormSection as FormSectionType,
	FormFieldValue,
} from "~/types/job-application-form.types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "~/components/ui/card";
import { DynamicFormField } from "~/components/molecules/form/DynamicFormField";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { cn } from "~/lib/utils";

export interface FormSectionProps {
	section: FormSectionType;
	values: Record<string, FormFieldValue>;
	errors: Record<string, string>;
	touched: Record<string, boolean>;
	onChange: (name: string, value: FormFieldValue) => void;
	onBlur: (name: string) => void;
	disabled?: boolean;
}

export function FormSection({
	section,
	values,
	errors,
	touched,
	onChange,
	onBlur,
	disabled,
}: FormSectionProps) {
	const [isOpen, setIsOpen] = React.useState(!section.defaultCollapsed);

	const content = (
		<div className="space-y-6">
			{section.fields.map((field) => (
				<DynamicFormField
					key={field.id}
					config={field}
					value={values[field.name]}
					error={errors[field.name]}
					touched={touched[field.name]}
					onChange={(value) => onChange(field.name, value)}
					onBlur={() => onBlur(field.name)}
					disabled={disabled}
				/>
			))}
		</div>
	);

	if (section.collapsible) {
		return (
			<Collapsible open={isOpen} onOpenChange={setIsOpen}>
				<Card>
					<CollapsibleTrigger className="w-full">
						<CardHeader>
							<div className="flex items-center justify-between w-full">
								<div className="text-left flex-1">
									<CardTitle>{section.title}</CardTitle>
									{section.description && (
										<CardDescription className="mt-1.5">
											{section.description}
										</CardDescription>
									)}
								</div>
								<ChevronDown
									className={cn(
										"size-5 text-muted-foreground transition-transform duration-200 shrink-0 ml-4",
										isOpen && "rotate-180",
									)}
								/>
							</div>
						</CardHeader>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<CardContent>{content}</CardContent>
					</CollapsibleContent>
				</Card>
			</Collapsible>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>{section.title}</CardTitle>
				{section.description && (
					<CardDescription className="mt-1.5">{section.description}</CardDescription>
				)}
			</CardHeader>
			<CardContent>{content}</CardContent>
		</Card>
	);
}
