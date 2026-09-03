export interface ParsedLeaveCreditRow {
	employeeId: string;
	leaveType: string;
	totalEntitled: number;
}

export interface ParseLeaveCreditsResult {
	rows: ParsedLeaveCreditRow[];
	errors: string[];
}

/**
 * Parses the annual leave credits upload CSV/TSV.
 * Expected header row containing employeeId, leaveType, totalEntitled
 * (case-insensitive, order-independent). Extra columns are ignored.
 */
export function parseLeaveCreditsCsv(text: string): ParseLeaveCreditsResult {
	const errors: string[] = [];
	const rows: ParsedLeaveCreditRow[] = [];

	const lines = String(text || "")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	if (lines.length === 0) {
		return { rows, errors: ["File is empty"] };
	}

	const delimiter = lines[0].includes("\t") ? "\t" : ",";
	const headers = lines[0]
		.split(delimiter)
		.map((header) =>
			header
				.trim()
				.toLowerCase()
				.replace(/^"|"$/g, "")
				.replace(/[\s_-]/g, ""),
		);

	const indexOf = (...names: string[]) =>
		headers.findIndex((header) => names.includes(header));

	const idIndex = indexOf("employeeid", "employee");
	const typeIndex = indexOf("leavetype");
	const entitledIndex = indexOf("totalentitled", "entitled");

	if (idIndex === -1 || typeIndex === -1 || entitledIndex === -1) {
		return {
			rows,
			errors: [
				"Header row must include columns: employeeId, leaveType, totalEntitled",
			],
		};
	}

	for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
		const cells = lines[lineIndex].split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ""));
		const lineNo = lineIndex + 1;
		const employeeId = cells[idIndex] || "";
		const leaveType = (cells[typeIndex] || "").toUpperCase();
		const entitled = Number(cells[entitledIndex]);

		if (!employeeId) errors.push(`Line ${lineNo}: missing employeeId`);
		else if (!leaveType) errors.push(`Line ${lineNo}: missing leaveType`);
		else if (!Number.isFinite(entitled) || entitled < 0)
			errors.push(`Line ${lineNo}: totalEntitled must be a number >= 0`);
		else rows.push({ employeeId, leaveType, totalEntitled: entitled });
	}

	return { rows, errors };
}
