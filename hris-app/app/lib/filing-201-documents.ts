export interface Filing201Requirement {
	value: string;
	label: string;
	optional?: boolean;
	required?: boolean;
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
	{ value: "occupational_permit", label: "Occupational Permit" },
	{ value: "valid_id", label: "Valid ID (Primary)" },
	{
		value: "dependent_birth_certificate",
		label: "Birth Certificate of Dependents (PSA)",
		optional: true,
	},
	{ value: "sss_employee_static_info", label: "SSS Employee Static Information" },
	{ value: "sss_employment_history", label: "SSS Employment History", optional: true },
	{ value: "tin_bir_1905", label: "TIN Verification Slip & BIR Form 1905" },
	{ value: "pagibig_transfer_form", label: "Pag-IBIG Transfer Form", optional: true },
	{
		value: "certificate_of_employment",
		label: "Certificate of Employment from Previous Companies",
		optional: true,
	},
	{
		value: "certificate_of_training",
		label: "Certificate of Trainings Attended",
		optional: true,
	},
	{ value: "prc_id", label: "PRC ID", optional: true },
	{ value: "bir_2316", label: "BIR Form 2316 for Current Year" },
	{ value: "picture_1x1", label: "1x1 Picture in Business Attire" },
	{ value: "picture_2x2", label: "2x2 Picture in Business Attire" },
	{ value: "passport_size_picture", label: "Passport Size Picture in Business Attire" },
	{ value: "location_map", label: "Location Map of House" },
];

export interface Filing201Row {
	type: string;
	label: string;
	required: boolean;
	status: "UPLOADED" | "MISSING";
	count: number;
	lastUploadedAt: string | null;
}

/**
 * Canonical aliases used by the document save path
 * (`normalizeDocumentTypeValue` in `employee-document-action-modal.tsx`).
 * Stored `type` may be either the canonical value (`philhealth_id`) or the
 * alias (`philhealth`); both must match the same 201 requirement.
 */
const TYPE_ALIASES: Record<string, string> = {
	// canonical / alias pairs (save path may store either form)
	philhealth_id: "philhealth",
	philhealth: "philhealth",
	sss_id: "sss",
	sss: "sss",
	tin_id: "tin",
	tin: "tin",
	pagibig_id: "pagibig",
	pagibig: "pagibig",
	pag_ibig_id: "pagibig",
	// other document types that may appear in stored records
	contract: "contract",
	birth_certificate: "birth_certificate",
	medical_certificate: "medical_certificate",
	nbi_clearance: "nbi_clearance",
	diploma: "diploma",
	marriage_certificate: "marriage_certificate",
	police_clearance: "police_clearance",
	passport: "passport",
	driver_license: "driver_license",
	payslip: "payslip",
	certificate: "certificate",
	transcript: "transcript",
	clearance: "clearance",
	barangay_clearance: "barangay_clearance",
	occupational_permit: "occupational_permit",
	valid_id: "valid_id",
	dependent_birth_certificate: "dependent_birth_certificate",
	sss_employee_static_info: "sss_employee_static_info",
	sss_employment_history: "sss_employment_history",
	tin_bir_1905: "tin_bir_1905",
	pagibig_transfer_form: "pagibig_transfer_form",
	certificate_of_employment: "certificate_of_employment",
	certificate_of_training: "certificate_of_training",
	prc_id: "prc_id",
	bir_2316: "bir_2316",
	picture_1x1: "picture_1x1",
	picture_2x2: "picture_2x2",
	passport_size_picture: "passport_size_picture",
	location_map: "location_map",
};

const normalize = (value: unknown) =>
	String(value || "")
		.trim()
		.toLowerCase();

const normalizeTypeForMatch = (value: unknown) =>
	TYPE_ALIASES[normalize(value)] || normalize(value);

export function buildFiling201Checklist(
	documents: Array<{ type?: string; createdAt?: string | null } | any> | null | undefined,
	requirements: Filing201Requirement[] = FILING_201_REQUIREMENTS,
): Filing201Row[] {
	const byType = new Map<string, { count: number; lastUploadedAt: string | null }>();
	for (const document of documents || []) {
		const type = normalizeTypeForMatch(
			typeof document === "string" ? document : (document as any)?.type,
		);
		if (!type) continue;
		const entry = byType.get(type) || { count: 0, lastUploadedAt: null };
		entry.count += 1;
		const createdAt = (document as any)?.createdAt ? String((document as any).createdAt) : null;
		if (createdAt && (!entry.lastUploadedAt || createdAt > entry.lastUploadedAt)) {
			entry.lastUploadedAt = createdAt;
		}
		byType.set(type, entry);
	}

	return requirements.map((requirement) => {
		const entry =
			byType.get(normalizeTypeForMatch(requirement.value)) ||
			byType.get(normalizeTypeForMatch(requirement.label.split(" (")[0])) ||
			null;
		return {
			type: requirement.value,
			label: requirement.label,
			required: requirement.required ?? !requirement.optional,
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
