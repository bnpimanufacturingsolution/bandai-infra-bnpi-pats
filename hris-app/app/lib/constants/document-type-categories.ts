import type { SelectOption } from "~/components/atoms/Select";

export const DOCUMENT_TYPE_CATEGORY_OPTIONS: SelectOption[] = [
	{ value: "COMPLIANCE", label: "Compliance" },
	{ value: "ONBOARDING", label: "Onboarding" },
	{ value: "PAYROLL", label: "Payroll" },
	{ value: "LEGAL", label: "Legal" },
	{ value: "OTHER", label: "Other" },
];

export const getDocumentTypeCategoryLabel = (category?: string | null) => {
	const normalized = String(category || "OTHER").toUpperCase();
	return (
		DOCUMENT_TYPE_CATEGORY_OPTIONS.find((option) => option.value === normalized)?.label ||
		normalized
			.toLowerCase()
			.split("_")
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(" ")
	);
};
