/**
 * Box to Field Sequential Mapping
 * Maps sequential field numbers to box numbers and their inputs
 *
 * Based on BIR Form 2316 structure:
 * - Box 1: 1 input (Year)
 * - Box 2: 2 inputs (Period From, Period To)
 * - Box 3: 4 inputs (TIN - 4 parts)
 * - Box 4: 1 input (Employee Name)
 * - Box 5: 1 input (RDO Code)
 */

export interface BoxFieldMapping {
	boxNumber: string;
	inputIndex: number; // 0-based index for which input in that box
	totalInputs: number; // Total number of inputs for this box
}

/**
 * Maps sequential field numbers to box numbers
 * Field 1, Field 2, Field 3, etc. map to boxes sequentially
 */
const FIELD_TO_BOX_MAPPING: BoxFieldMapping[] = [
	// Field 1
	{ boxNumber: "1", inputIndex: 0, totalInputs: 1 },

	// Field 2, 3 → Box 2 (2 inputs)
	{ boxNumber: "2", inputIndex: 0, totalInputs: 2 }, // Field 2 → Box 2, input 1 (periodFrom)
	{ boxNumber: "2", inputIndex: 1, totalInputs: 2 }, // Field 3 → Box 2, input 2 (periodTo)

	// Field 4, 5, 6, 7 → Box 3 (4 inputs)
	{ boxNumber: "3", inputIndex: 0, totalInputs: 4 }, // Field 4 → Box 3, input 1 (TIN part 1)
	{ boxNumber: "3", inputIndex: 1, totalInputs: 4 }, // Field 5 → Box 3, input 2 (TIN part 2)
	{ boxNumber: "3", inputIndex: 2, totalInputs: 4 }, // Field 6 → Box 3, input 3 (TIN part 3)
	{ boxNumber: "3", inputIndex: 3, totalInputs: 4 }, // Field 7 → Box 3, input 4 (TIN part 4)

	// Field 8 → Box 4 (1 input)
	{ boxNumber: "4", inputIndex: 0, totalInputs: 1 },

	// Field 9 → Box 5 (1 input - RDO Code)
	{ boxNumber: "5", inputIndex: 0, totalInputs: 1 },

	// Field 10 → Box 6 (Registered Address)
	{ boxNumber: "6", inputIndex: 0, totalInputs: 1 },

	// Field 11 → Box 6a (Registered Address Zip Code)
	{ boxNumber: "6a", inputIndex: 0, totalInputs: 1 },

	// Field 12 → Box 6b (Local Home Address)
	{ boxNumber: "6b", inputIndex: 0, totalInputs: 1 },

	// Field 13 → Box 6c (Local Home Address Zip Code)
	{ boxNumber: "6c", inputIndex: 0, totalInputs: 1 },

	// Field 14 → Box 6d (Foreign Address - optional)
	{ boxNumber: "6d", inputIndex: 0, totalInputs: 1 },

	// Field 15 → Box 7 (Date of Birth)
	{ boxNumber: "7", inputIndex: 0, totalInputs: 1 },

	// Field 16 → Box 8 (Contact Number)
	{ boxNumber: "8", inputIndex: 0, totalInputs: 1 },

	// Field 17 → Box 9 (Statutory Minimum Wage per day)
	{ boxNumber: "9", inputIndex: 0, totalInputs: 1 },

	// Field 18 → Box 10 (Statutory Minimum Wage per month)
	{ boxNumber: "10", inputIndex: 0, totalInputs: 1 },

	// Field 19 → Box 11 (Minimum Wage Earner)
	{ boxNumber: "11", inputIndex: 0, totalInputs: 1 },

	// Field 20, 21, 22, 23 → Box 12 (4 inputs - Present Employer TIN)
	{ boxNumber: "12", inputIndex: 0, totalInputs: 4 }, // Field 20 → Box 12, input 1 (TIN part 1)
	{ boxNumber: "12", inputIndex: 1, totalInputs: 4 }, // Field 21 → Box 12, input 2 (TIN part 2)
	{ boxNumber: "12", inputIndex: 2, totalInputs: 4 }, // Field 22 → Box 12, input 3 (TIN part 3)
	{ boxNumber: "12", inputIndex: 3, totalInputs: 4 }, // Field 23 → Box 12, input 4 (TIN part 4)

	// Field 24 → Box 13 (Present Employer Name)
	{ boxNumber: "13", inputIndex: 0, totalInputs: 1 },

	// Field 25 → Box 14 (Present Employer Address)
	{ boxNumber: "14", inputIndex: 0, totalInputs: 1 },

	// Field 26 → Box 14a (Present Employer Zip Code)
	{ boxNumber: "14a", inputIndex: 0, totalInputs: 1 },

	// Field 27, 28 → Box 15 (2 inputs - Employer Type)
	{ boxNumber: "15", inputIndex: 0, totalInputs: 2 }, // Field 27 → Box 15, input 1 (MAIN)
	{ boxNumber: "15", inputIndex: 1, totalInputs: 2 }, // Field 28 → Box 15, input 2 (SECONDARY)

	// Field 29, 30, 31, 32 → Box 16 (4 inputs - Previous Employer TIN)
	{ boxNumber: "16", inputIndex: 0, totalInputs: 4 }, // Field 29 → Box 16, input 1 (TIN part 1)
	{ boxNumber: "16", inputIndex: 1, totalInputs: 4 }, // Field 30 → Box 16, input 2 (TIN part 2)
	{ boxNumber: "16", inputIndex: 2, totalInputs: 4 }, // Field 31 → Box 16, input 3 (TIN part 3)
	{ boxNumber: "16", inputIndex: 3, totalInputs: 4 }, // Field 32 → Box 16, input 4 (TIN part 4)

	// Field 33 → Box 17 (Previous Employer Name)
	{ boxNumber: "17", inputIndex: 0, totalInputs: 1 },

	// Field 34 → Box 18 (Previous Employer Address)
	{ boxNumber: "18", inputIndex: 0, totalInputs: 1 },

	// Field 35 → Box 18a (Previous Employer Zip Code)
	{ boxNumber: "18a", inputIndex: 0, totalInputs: 1 },

	// Field 36 → Box 19 (Gross Compensation Present Employer)
	{ boxNumber: "19", inputIndex: 0, totalInputs: 1 },

	// Field 37 → Box 20 (Total Non-Taxable Present Employer)
	{ boxNumber: "20", inputIndex: 0, totalInputs: 1 },

	// Field 38 → Box 21 (Taxable Compensation Present Employer)
	{ boxNumber: "21", inputIndex: 0, totalInputs: 1 },

	// Field 39 → Box 22 (Taxable Compensation Previous Employer)
	{ boxNumber: "22", inputIndex: 0, totalInputs: 1 },

	// Field 40 → Box 23 (Gross Taxable Compensation)
	{ boxNumber: "23", inputIndex: 0, totalInputs: 1 },

	// Field 41 → Box 24 (Tax Due)
	{ boxNumber: "24", inputIndex: 0, totalInputs: 1 },

	// Field 42 → Box 25a (Taxes Withheld Present Employer)
	{ boxNumber: "25a", inputIndex: 0, totalInputs: 1 },

	// Field 43 → Box 25b (Taxes Withheld Previous Employer)
	{ boxNumber: "25b", inputIndex: 0, totalInputs: 1 },

	// Field 44 → Box 26 (Total Taxes Withheld Adjusted)
	{ boxNumber: "26", inputIndex: 0, totalInputs: 1 },

	// Field 45 → Box 27 (Tax Credit PERA)
	{ boxNumber: "27", inputIndex: 0, totalInputs: 1 },

	// Field 46 → Box 28 (Total Taxes Withheld)
	{ boxNumber: "28", inputIndex: 0, totalInputs: 1 },

	// Field 47 → Box 29 (Basic Salary MWE Non-Taxable)
	{ boxNumber: "29", inputIndex: 0, totalInputs: 1 },

	// Field 49 → Box 30 (Holiday Pay MWE)
	{ boxNumber: "30", inputIndex: 0, totalInputs: 1 },

	// Field 50 → Box 31 (Overtime Pay MWE)
	{ boxNumber: "31", inputIndex: 0, totalInputs: 1 },

	// Field 51 → Box 32 (Night Shift Differential MWE)
	{ boxNumber: "32", inputIndex: 0, totalInputs: 1 },

	// Field 52 → Box 33 (Hazard Pay MWE)
	{ boxNumber: "33", inputIndex: 0, totalInputs: 1 },

	// Field 53 → Box 34 (13th Month Pay Non-Taxable)
	{ boxNumber: "34", inputIndex: 0, totalInputs: 1 },

	// Field 54 → Box 35 (De Minimis Benefits)
	{ boxNumber: "35", inputIndex: 0, totalInputs: 1 },

	// Field 55 → Box 36 (Contributions Union Dues)
	{ boxNumber: "36", inputIndex: 0, totalInputs: 1 },

	// Field 56 → Box 37 (Other Non-Taxable Compensation)
	{ boxNumber: "37", inputIndex: 0, totalInputs: 1 },

	// Field 57 → Box 38 (Total Non-Taxable Compensation)
	{ boxNumber: "38", inputIndex: 0, totalInputs: 1 },

	// Field 58 → Box 39 (Basic Salary Taxable)
	{ boxNumber: "39", inputIndex: 0, totalInputs: 1 },

	// Field 59 → Box 40 (Representation)
	{ boxNumber: "40", inputIndex: 0, totalInputs: 1 },

	// Field 60 → Box 41 (Transportation)
	{ boxNumber: "41", inputIndex: 0, totalInputs: 1 },

	// Field 61 → Box 42 (COLA)
	{ boxNumber: "42", inputIndex: 0, totalInputs: 1 },

	// Field 62 → Box 43 (Housing Allowance)
	{ boxNumber: "43", inputIndex: 0, totalInputs: 1 },

	// Field 63 → Box 44a input 1 (Others Description A)
	{ boxNumber: "44a", inputIndex: 0, totalInputs: 2 },

	// Field 64 → Box 44a input 2 (Others Amount A)
	{ boxNumber: "44a", inputIndex: 1, totalInputs: 2 },

	// Field 65 → Box 44b input 1 (Others Description B)
	{ boxNumber: "44b", inputIndex: 0, totalInputs: 2 },

	// Field 66 → Box 44b input 2 (Others Amount B)
	{ boxNumber: "44b", inputIndex: 1, totalInputs: 2 },

	// Field 67 → Box 45 (Commission)
	{ boxNumber: "45", inputIndex: 0, totalInputs: 1 },

	// Field 68 → Box 46 (Profit Sharing)
	{ boxNumber: "46", inputIndex: 0, totalInputs: 1 },

	// Field 69 → Box 47 (Fees)
	{ boxNumber: "47", inputIndex: 0, totalInputs: 1 },

	// Field 70 → Box 48 (13th Month Pay Taxable)
	{ boxNumber: "48", inputIndex: 0, totalInputs: 1 },

	// Field 71 → Box 49 (Hazard Pay Taxable)
	{ boxNumber: "49", inputIndex: 0, totalInputs: 1 },

	// Field 72 → Box 50 (Overtime Pay Taxable)
	{ boxNumber: "50", inputIndex: 0, totalInputs: 1 },

	// Field 73 → Box 51a input 1 (Supplementary Others Description A)
	{ boxNumber: "51a", inputIndex: 0, totalInputs: 2 },

	// Field 74 → Box 51a input 2 (Supplementary Others Amount A)
	{ boxNumber: "51a", inputIndex: 1, totalInputs: 2 },

	// Field 75 → Box 51b input 1 (Supplementary Others Description B)
	{ boxNumber: "51b", inputIndex: 0, totalInputs: 2 },

	// Field 76 → Box 51b input 2 (Supplementary Others Amount B)
	{ boxNumber: "51b", inputIndex: 1, totalInputs: 2 },

	// Field 77 → Box 52 (Total Taxable Compensation)
	{ boxNumber: "52", inputIndex: 0, totalInputs: 1 },

	// Field 78, 79 → Box 53 (2 inputs - Employer Signatory & Date Signed)
	{ boxNumber: "53", inputIndex: 0, totalInputs: 2 }, // Field 78 → Employer Signatory
	{ boxNumber: "53", inputIndex: 1, totalInputs: 2 }, // Field 79 → Employer Signature Date

	// Field 80–85 → Box 54 (Employee signature + CTC details, including amount paid if CTC)
	{ boxNumber: "54", inputIndex: 0, totalInputs: 6 }, // Field 80 → Employee Signatory
	{ boxNumber: "54", inputIndex: 1, totalInputs: 6 }, // Field 81 → Employee Signature Date
	{ boxNumber: "54", inputIndex: 2, totalInputs: 6 }, // Field 82 → Employee CTC/Valid ID No.
	{ boxNumber: "54", inputIndex: 3, totalInputs: 6 }, // Field 83 → CTC Place of Issue
	{ boxNumber: "54", inputIndex: 4, totalInputs: 6 }, // Field 84 → CTC Date Issued
	{ boxNumber: "54", inputIndex: 5, totalInputs: 6 }, // Field 85 → Amount Paid, if CTC

	// Field 86, 87 → Box 55 (Substituted filing – employer signatory & date)
	{ boxNumber: "55", inputIndex: 0, totalInputs: 2 }, // Field 86 → Substituted Filing Signatory
	{ boxNumber: "55", inputIndex: 1, totalInputs: 2 }, // Field 87 → Substituted Filing Date

	// Field 88 → Box 56 (Substituted filing – employee signature date)
	{ boxNumber: "56", inputIndex: 0, totalInputs: 2 }, // Field 88 → Substituted Filing Employee Signature Date
];

/**
 * Get box mapping for a sequential field number
 * @param fieldNumber The sequential field number (1, 2, 3, etc.)
 * @returns Box mapping or undefined if field number is too high
 */
export function getBoxMappingForField(fieldNumber: number): BoxFieldMapping | undefined {
	if (fieldNumber < 1 || fieldNumber > FIELD_TO_BOX_MAPPING.length) {
		return undefined;
	}
	return FIELD_TO_BOX_MAPPING[fieldNumber - 1]; // Convert to 0-based index
}

/**
 * Extract field number from field name (e.g., "Field 1" → 1, "field2" → 2)
 */
export function extractFieldNumber(fieldName: string): number | null {
	const normalized = fieldName
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]/g, "");

	// Match patterns like "field1", "field2", "1", "2", etc.
	const match = normalized.match(/(?:field|box)?(\d+)/);
	if (match && match[1]) {
		return parseInt(match[1]);
	}

	return null;
}
