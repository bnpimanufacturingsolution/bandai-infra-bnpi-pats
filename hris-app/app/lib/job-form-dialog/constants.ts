import type { SelectOption } from "~/components/atoms/Select";

export const JOB_TYPES: SelectOption[] = [
	{ value: "Full-time", label: "Full-time" },
	{ value: "Part-time", label: "Part-time" },
	{ value: "Contract", label: "Contract" },
	{ value: "Temporary", label: "Temporary" },
	{ value: "Internship", label: "Internship" },
];

export const TAG_VARIANTS: SelectOption[] = [
	{ value: "default", label: "Default (Gray)" },
	{ value: "primary", label: "Primary (Blue)" },
	{ value: "secondary", label: "Secondary (Purple)" },
	{ value: "success", label: "Success (Green)" },
	{ value: "warning", label: "Warning (Yellow)" },
	{ value: "destructive", label: "Destructive (Red)" },
	{ value: "info", label: "Info (Cyan)" },
	{ value: "outline", label: "Outline" },
];

export const DEFAULT_JOB_TYPE = "Full-time";
export const DEFAULT_TAG_VARIANT = "default";
