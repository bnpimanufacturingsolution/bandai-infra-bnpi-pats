export interface Filing201Requirement {
	value: string;
	label: string;
	optional?: boolean;
}

/**
 * BIR 201 file baseline requirements. Values match the canonical document-type
 * values used by the Documents tab (`documents-tab.tsx`) so uploads land on the
 * same types HR already manages.
 */
export const FILING_201_REQUIREMENTS: Filing201Requirement[] = [
	{ value: "contract", label: "Employment Contract" },
	{ value: "tin_id", label: "TIN ID / BIR Registration" },
	{ value: "sss_id", label: "SSS ID / Number" },
	{ value: "philhealth_id", label: "PhilHealth ID / Number" },
	{ value: "pagibig_id", label: "Pag-IBIG ID / Number" },
	{ value: "birth_certificate", label: "Birth Certificate (PSA)" },
	{ value: "medical_certificate", label: "Medical Certificate" },
	{ value: "nbi_clearance", label: "NBI Clearance" },
	{ value: "diploma", label: "Diploma / Transcript of Records" },
	{ value: "marriage_certificate", label: "Marriage Certificate (PSA)", optional: true },
	{ value: "police_clearance", label: "Police Clearance", optional: true },
];

export interface Filing201Row {
	type: string;
	label: string;
	required: boolean;
	status: "UPLOADED" | "MISSING";
	count: number;
	lastUploadedAt: string | null;
}

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

export function buildFiling201Checklist(
	documents: Array<{ type?: string; createdAt?: string | null } | any> | null | undefined,
): Filing201Row[] {
	const byType = new Map<string, { count: number; lastUploadedAt: string | null }>();
	for (const document of documents || []) {
		const type = normalize(
			typeof document === "string" ? document : (document as any)?.type,
		);
		if (!type) continue;
		const entry = byType.get(type) || { count: 0, lastUploadedAt: null };
		entry.count += 1;
		const createdAt = (document as any)?.createdAt
			? String((document as any).createdAt)
			: null;
		if (createdAt && (!entry.lastUploadedAt || createdAt > entry.lastUploadedAt)) {
			entry.lastUploadedAt = createdAt;
		}
		byType.set(type, entry);
	}

	return FILING_201_REQUIREMENTS.map((requirement) => {
		const entry =
			byType.get(requirement.value) ||
			byType.get(normalize(requirement.label.split(" (")[0])) ||
			null;
		return {
			type: requirement.value,
			label: requirement.label,
			required: !requirement.optional,
			status: entry && entry.count > 0 ? "UPLOADED" : "MISSING",
			count: entry?.count || 0,
			lastUploadedAt: entry?.lastUploadedAt || null,
		};
	});
}

export function summarizeFiling201(rows: Filing201Row[]) {
	const requiredRows = rows.filter((row) => row.required);
	return {
		requiredTotal: requiredRows.length,
		requiredUploaded: requiredRows.filter((row) => row.status === "UPLOADED").length,
		requiredMissing: requiredRows.filter((row) => row.status === "MISSING").length,
	};
}
