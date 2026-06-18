/**
 * Job Application Form Configuration Types
 *
 * This file defines the type system for building dynamic, configurable
 * job application forms with various field types and validation rules.
 */

// ==================== Field Types ====================

export type FieldType =
	| "text"
	| "email"
	| "tel"
	| "textarea"
	| "select"
	| "radio"
	| "checkbox"
	| "date"
	| "file"
	| "url"
	| "number";

export type ValidationRule = {
	type: "required" | "minLength" | "maxLength" | "pattern" | "fileSize" | "fileType";
	value?: string | number | RegExp;
	message: string;
};

export type FieldConstraintToken = {
	label: string;
	isMet?: boolean;
};

// ==================== Field Configuration ====================

export interface BaseFieldConfig {
	id: string;
	name: string;
	label: string;
	type: FieldType;
	placeholder?: string;
	helperText?: string;
	required?: boolean;
	validation?: ValidationRule[];
	constraintTokens?: FieldConstraintToken[];
	disabled?: boolean;
	defaultValue?: string | boolean | File | null;
}

export interface TextFieldConfig extends BaseFieldConfig {
	type: "text" | "email" | "tel" | "url";
	maxLength?: number;
	minLength?: number;
}

export interface TextareaFieldConfig extends BaseFieldConfig {
	type: "textarea";
	rows?: number;
	maxLength?: number;
}

export interface SelectFieldConfig extends BaseFieldConfig {
	type: "select";
	options: Array<{
		value: string;
		label: string;
		disabled?: boolean;
	}>;
	searchable?: boolean;
}

export interface RadioFieldConfig extends BaseFieldConfig {
	type: "radio";
	options: Array<{
		value: string;
		label: string;
		description?: string;
	}>;
	orientation?: "horizontal" | "vertical";
}

export interface CheckboxFieldConfig extends BaseFieldConfig {
	type: "checkbox";
	description?: string;
}

export interface DateFieldConfig extends BaseFieldConfig {
	type: "date";
	minDate?: Date;
	maxDate?: Date;
}

export interface FileFieldConfig extends BaseFieldConfig {
	type: "file";
	accept?: string;
	maxSize?: number; // in MB
	allowedExtensions?: string[];
}

export interface NumberFieldConfig extends BaseFieldConfig {
	type: "number";
	min?: number;
	max?: number;
	step?: number;
}

export type FieldConfig =
	| TextFieldConfig
	| TextareaFieldConfig
	| SelectFieldConfig
	| RadioFieldConfig
	| CheckboxFieldConfig
	| DateFieldConfig
	| FileFieldConfig
	| NumberFieldConfig;

// ==================== Form Section ====================

export interface FormSection {
	id: string;
	title: string;
	description?: string;
	fields: FieldConfig[];
	collapsible?: boolean;
	defaultCollapsed?: boolean;
}

// ==================== Form Configuration ====================

export interface JobApplicationFormConfig {
	id: string;
	title: string;
	description?: string;
	sections: FormSection[];
	submitButtonText?: string;
	successMessage?: string;
	privacyPolicyUrl?: string;
	termsOfServiceUrl?: string;
}

// ==================== Form State & Values ====================

export type FormFieldValue = string | boolean | File | null | undefined;

export type FormValues = Record<string, FormFieldValue>;

export interface FormErrors {
	[fieldName: string]: string;
}

export interface FormState {
	values: FormValues;
	errors: FormErrors;
	touched: Record<string, boolean>;
	isSubmitting: boolean;
	isValid: boolean;
}

// ==================== Form Actions ====================

export type FormAction =
	| { type: "SET_FIELD_VALUE"; payload: { name: string; value: FormFieldValue } }
	| { type: "SET_FIELD_ERROR"; payload: { name: string; error: string } }
	| { type: "SET_FIELD_TOUCHED"; payload: { name: string; touched: boolean } }
	| { type: "SET_ERRORS"; payload: FormErrors }
	| { type: "SET_SUBMITTING"; payload: boolean }
	| { type: "RESET_FORM" };

// ==================== Submission Data ====================

export interface JobApplicationSubmission {
	formId: string;
	positionId?: string;
	organizationId: string;
	submittedAt: Date;
	data: FormValues;
	files?: Record<string, File>;
}
