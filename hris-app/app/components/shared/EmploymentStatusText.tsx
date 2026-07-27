import { CategoricalText, type CategoricalTextTone, formatCategoricalTextLabel } from "~/components/atoms/CategoricalText";

const employmentStatusToneByKey: Record<string, CategoricalTextTone> = {
	ACTIVE: "green",
	ONBOARDING: "blue",
	PROBATIONARY: "blue",
	ON_LEAVE: "amber",
	RESIGNATION_REQUESTED: "amber",
	SERVING_NOTICE: "orange",
	OFFBOARDING: "purple",
	TERMINATED: "red",
	RESIGNED: "gray",
	RETIRED: "gray",
	FORMER_EMPLOYEE: "gray",
	INACTIVE: "slate",
};

const normalizeEmploymentStatusKey = (status?: string | null) =>
	String(status || "")
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");

const getEmploymentStatusTone = (status?: string | null): CategoricalTextTone =>
	employmentStatusToneByKey[normalizeEmploymentStatusKey(status)] || "neutral";

export function EmploymentStatusText({ status }: { status?: string | null }) {
	const cleanStatus = String(status || "").trim();
	if (!cleanStatus || cleanStatus === "N/A" || cleanStatus === "-") {
		return <span className="text-gray-400">-</span>;
	}

	return (
		<CategoricalText
			value={formatCategoricalTextLabel(cleanStatus)}
			tone={getEmploymentStatusTone(cleanStatus)}
		/>
	);
}
