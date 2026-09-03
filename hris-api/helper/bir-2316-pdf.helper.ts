/**
 * BIR 2316 PDF Generation Helper
 * Ported from frontend utilities for backend PDF generation
 */

import { PDFFont } from "pdf-lib";
import type { BIRForm2316 } from "./bir-2316.types";

// ========================================
// INTERFACES
// ========================================

export interface PDFField {
	name: string;
	coordinates: { x: number; y: number };
	dimensions: { width: number; height: number };
	fontSize: number;
	value?: string;
	letterSpacing?: number;
	textAlign?: "left" | "center" | "right";
	verticalAlign?: "top" | "middle" | "bottom";
}

export interface BoxFieldMapping {
	boxNumber: string;
	inputIndex: number;
	totalInputs: number;
}

// ========================================
// TEXT LAYOUT UTILITIES
// ========================================

/**
 * Wrap text into multiple lines so that each line fits within maxWidth.
 * Uses pdf-lib font metrics for accurate width calculation.
 */
export function wrapTextToWidth(
	text: string,
	maxWidth: number,
	font: PDFFont,
	fontSize: number,
	letterSpacing: number,
): string[] {
	if (!text) return [];

	const paragraphs = text.split("\n");
	const lines: string[] = [];

	for (const paragraph of paragraphs) {
		const words = paragraph.split(" ");
		let currentLine = "";

		for (const word of words) {
			// If the word itself is longer than the box, hard-break it by characters
			const testWordWidth =
				font.widthOfTextAtSize(word, fontSize) +
				Math.max(0, word.length - 1) * letterSpacing;
			if (testWordWidth > maxWidth) {
				if (currentLine.trim()) {
					lines.push(currentLine.trimEnd());
					currentLine = "";
				}

				let chunk = "";
				for (const ch of word) {
					const testChunk = chunk + ch;
					const chunkWidth =
						font.widthOfTextAtSize(testChunk, fontSize) +
						Math.max(0, testChunk.length - 1) * letterSpacing;
					if (chunk && chunkWidth > maxWidth) {
						lines.push(chunk);
						chunk = ch;
					} else {
						chunk = testChunk;
					}
				}
				if (chunk) {
					currentLine = chunk + " ";
				}
				continue;
			}

			const testLine = currentLine ? `${currentLine}${word} ` : `${word} `;
			const textWidth =
				font.widthOfTextAtSize(testLine.trimEnd(), fontSize) +
				Math.max(0, testLine.trimEnd().length - 1) * letterSpacing;

			if (textWidth <= maxWidth) {
				currentLine = testLine;
			} else {
				if (currentLine.trim()) {
					lines.push(currentLine.trimEnd());
				}
				currentLine = `${word} `;
			}
		}

		if (currentLine.trim()) {
			lines.push(currentLine.trimEnd());
		}

		// Preserve explicit paragraph break
		if (paragraph.trim() === "" && paragraphs.length > 1) {
			lines.push("");
		}
	}

	return lines;
}

// ========================================
// BOX FIELD MAPPING
// ========================================

/**
 * Maps sequential field numbers to box numbers
 * This matches the frontend box-field-mapper.ts
 */
const FIELD_TO_BOX_MAPPING: BoxFieldMapping[] = [
	{ boxNumber: "1", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "2", inputIndex: 0, totalInputs: 2 },
	{ boxNumber: "2", inputIndex: 1, totalInputs: 2 },
	{ boxNumber: "3", inputIndex: 0, totalInputs: 4 },
	{ boxNumber: "3", inputIndex: 1, totalInputs: 4 },
	{ boxNumber: "3", inputIndex: 2, totalInputs: 4 },
	{ boxNumber: "3", inputIndex: 3, totalInputs: 4 },
	{ boxNumber: "4", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "5", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "6", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "6a", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "6b", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "6c", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "6d", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "7", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "8", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "9", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "10", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "11", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "12", inputIndex: 0, totalInputs: 4 },
	{ boxNumber: "12", inputIndex: 1, totalInputs: 4 },
	{ boxNumber: "12", inputIndex: 2, totalInputs: 4 },
	{ boxNumber: "12", inputIndex: 3, totalInputs: 4 },
	{ boxNumber: "13", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "14", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "14a", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "15", inputIndex: 0, totalInputs: 2 },
	{ boxNumber: "15", inputIndex: 1, totalInputs: 2 },
	{ boxNumber: "16", inputIndex: 0, totalInputs: 4 },
	{ boxNumber: "16", inputIndex: 1, totalInputs: 4 },
	{ boxNumber: "16", inputIndex: 2, totalInputs: 4 },
	{ boxNumber: "16", inputIndex: 3, totalInputs: 4 },
	{ boxNumber: "17", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "18", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "18a", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "19", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "20", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "21", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "22", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "23", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "24", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "25a", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "25b", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "26", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "27", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "28", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "29", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "30", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "31", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "32", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "33", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "34", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "35", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "36", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "37", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "38", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "39", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "40", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "41", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "42", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "43", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "44a", inputIndex: 0, totalInputs: 2 },
	{ boxNumber: "44a", inputIndex: 1, totalInputs: 2 },
	{ boxNumber: "44b", inputIndex: 0, totalInputs: 2 },
	{ boxNumber: "44b", inputIndex: 1, totalInputs: 2 },
	{ boxNumber: "45", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "46", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "47", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "48", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "49", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "50", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "51a", inputIndex: 0, totalInputs: 2 },
	{ boxNumber: "51a", inputIndex: 1, totalInputs: 2 },
	{ boxNumber: "51b", inputIndex: 0, totalInputs: 2 },
	{ boxNumber: "51b", inputIndex: 1, totalInputs: 2 },
	{ boxNumber: "52", inputIndex: 0, totalInputs: 1 },
	{ boxNumber: "53", inputIndex: 0, totalInputs: 2 },
	{ boxNumber: "53", inputIndex: 1, totalInputs: 2 },
	{ boxNumber: "54", inputIndex: 0, totalInputs: 6 },
	{ boxNumber: "54", inputIndex: 1, totalInputs: 6 },
	{ boxNumber: "54", inputIndex: 2, totalInputs: 6 },
	{ boxNumber: "54", inputIndex: 3, totalInputs: 6 },
	{ boxNumber: "54", inputIndex: 4, totalInputs: 6 },
	{ boxNumber: "54", inputIndex: 5, totalInputs: 6 },
	{ boxNumber: "55", inputIndex: 0, totalInputs: 2 },
	{ boxNumber: "55", inputIndex: 1, totalInputs: 2 },
	{ boxNumber: "56", inputIndex: 0, totalInputs: 2 },
];

/**
 * Get box mapping for a sequential field number
 */
export function getBoxMappingForField(fieldNumber: number): BoxFieldMapping | undefined {
	if (fieldNumber < 1 || fieldNumber > FIELD_TO_BOX_MAPPING.length) {
		return undefined;
	}
	return FIELD_TO_BOX_MAPPING[fieldNumber - 1];
}

/**
 * Extract field number from field name (e.g., "Field 1" → 1)
 */
export function extractFieldNumber(fieldName: string): number | null {
	const normalized = fieldName
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]/g, "");

	const match = normalized.match(/(?:field|box)?(\d+)/);
	if (match && match[1]) {
		return parseInt(match[1]);
	}

	return null;
}

// ========================================
// BOX NUMBER TO DATA KEY MAPPING
// ========================================

/**
 * Map box numbers to BIR Form 2316 data keys
 */
const BOX_NUMBER_TO_DATA_KEYS: Record<string, string[]> = {
	"1": ["year"],
	"2": ["periodFrom", "periodTo"],
	"3": ["employeeTin", "employeeTin", "employeeTin", "employeeTin"],
	"4": ["employeeFirstName"],
	"5": ["rdoCode"],
	"6": ["registeredAddress"],
	"6a": ["registeredAddressZipCode"],
	"6b": ["localHomeAddress"],
	"6c": ["localHomeAddressZipCode"],
	"6d": ["foreignAddress"],
	"7": ["dateOfBirth"],
	"8": ["contactNumber"],
	"9": ["statutoryMinimumWagePerDay"],
	"10": ["statutoryMinimumWagePerMonth"],
	"11": ["isMinimumWageEarner"],
	"12": ["presentEmployerTin", "presentEmployerTin", "presentEmployerTin", "presentEmployerTin"],
	"13": ["presentEmployerName"],
	"14": ["presentEmployerAddress"],
	"14a": ["presentEmployerZipCode"],
	"15": ["employerType", "employerType"],
	"16": [
		"previousEmployerTin",
		"previousEmployerTin",
		"previousEmployerTin",
		"previousEmployerTin",
	],
	"17": ["previousEmployerName"],
	"18": ["previousEmployerAddress"],
	"18a": ["previousEmployerZipCode"],
	"19": ["grossCompensationPresentEmployer"],
	"20": ["totalNonTaxablePresentEmployer"],
	"21": ["taxableCompensationPresentEmployer"],
	"22": ["taxableCompensationPreviousEmployer"],
	"23": ["grossTaxableCompensation"],
	"24": ["taxDue"],
	"25a": ["taxesWithheldPresentEmployer"],
	"25b": ["taxesWithheldPreviousEmployer"],
	"26": ["totalTaxesWithheldAdjusted"],
	"27": ["taxCreditPERA"],
	"28": ["totalTaxesWithheld"],
	"29": ["basicSalaryMWENonTaxable"],
	"30": ["holidayPayMWE"],
	"31": ["overtimePayMWE"],
	"32": ["nightShiftDifferentialMWE"],
	"33": ["hazardPayMWE"],
	"34": ["thirteenthMonthPayNonTaxable"],
	"35": ["deMinimisBenefits"],
	"36": ["contributionsUnionDues"],
	"37": ["otherNonTaxableCompensation"],
	"38": ["totalNonTaxableCompensation"],
	"39": ["basicSalaryTaxable"],
	"40": ["representation"],
	"41": ["transportation"],
	"42": ["cola"],
	"43": ["housingAllowance"],
	"44a": ["othersLineA", "othersAmountA"],
	"44b": ["othersLineB", "othersAmountB"],
	"45": ["commission"],
	"46": ["profitSharing"],
	"47": ["fees"],
	"48": ["thirteenthMonthPayTaxable"],
	"49": ["hazardPayTaxable"],
	"50": ["overtimePayTaxable"],
	"51a": ["supplementaryOthersLineA", "supplementaryOthersAmountA"],
	"51b": ["supplementaryOthersLineB", "supplementaryOthersAmountB"],
	"52": ["totalTaxableCompensation"],
	"53": ["employerSignatory", "employerSignatureDate"],
	"54": [
		"employeeSignatory",
		"employeeSignatureDate",
		"employeeCTCNo",
		"employeeIDPlaceOfIssue",
		"employeeIDDateIssued",
		"employeeCTCAmount",
	],
	"55": ["substitutedFilingSignatory", "substitutedFilingDate"],
	"56": ["substitutedFilingEmployeeSignatureDate", "substitutedFilingIDDateIssued"],
};

// ========================================
// FIELD OCCURRENCE TRACKER
// ========================================

const fieldOccurrenceTracker: Record<string, number> = {};

/**
 * Reset field occurrence tracker for sequential mapping
 */
export function resetFieldOccurrenceTracker(): void {
	Object.keys(fieldOccurrenceTracker).forEach((key) => delete fieldOccurrenceTracker[key]);
}

// ========================================
// FIELD DATA MAPPING
// ========================================

/**
 * Map field name to actual data from BIR 2316
 */
export function mapFieldNameToData(
	fieldName: string,
	data: BIRForm2316,
): string | number | undefined {
	const normalized = fieldName
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]/g, "");

	// Try box-based mapping first
	const fieldNumber = extractFieldNumber(fieldName);
	if (fieldNumber !== null) {
		const boxMapping = getBoxMappingForField(fieldNumber);
		if (boxMapping) {
			const { boxNumber, inputIndex } = boxMapping;
			const dataKeys = BOX_NUMBER_TO_DATA_KEYS[boxNumber];

			if (!dataKeys) {
				return undefined;
			}

			const selectedKey = dataKeys[inputIndex];
			if (!selectedKey) {
				return undefined;
			}

			// Special handling for TIN boxes (3, 12, 16) - split TIN into 4 parts
			if (["3", "12", "16"].includes(boxNumber)) {
				const tinKey = selectedKey as keyof BIRForm2316;
				const tinValue = data[tinKey];
				if (typeof tinValue === "string") {
					const parts = tinValue.split("-");
					return parts[inputIndex] || "";
				}
				return "";
			}

			// Special handling for Box 15 (Employer Type) - split "X-X" format
			if (boxNumber === "15") {
				const employerType = data.employerType;
				if (inputIndex === 0) {
					return employerType === "MAIN" ? "X" : "";
				}
				return employerType === "SECONDARY" ? "X" : "";
			}

			// Special handling for Box 4 (Employee Name) - combine name parts
			if (boxNumber === "4") {
				const lastName = data.employeeLastName || "";
				const firstName = data.employeeFirstName || "";
				const middleName = data.employeeMiddleName || "";
				return (
					`${lastName}, ${firstName}${middleName ? " " + middleName : ""}`.trim() ||
					undefined
				);
			}

			// Get value from data using selected key
			const value = data[selectedKey as keyof BIRForm2316];
			if (typeof value === "boolean") {
				return value ? "X" : "";
			}
			return value !== undefined ? value : undefined;
		}
	}

	// Fallback: try direct property name matching
	const dataKey = Object.keys(data).find((key) => {
		const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
		return normalizedKey === normalized;
	});

	if (dataKey) {
		const value = data[dataKey as keyof BIRForm2316];
		if (typeof value === "boolean") {
			return value ? "X" : "";
		}
		return value;
	}

	return undefined;
}

// ========================================
// VALUE FORMATTING
// ========================================

/**
 * Boxes that represent monetary amounts and should always be shown with 2 decimals
 */
const MONETARY_BOXES = new Set([
	"9",
	"10",
	"19",
	"20",
	"21",
	"22",
	"23",
	"24",
	"25",
	"25a",
	"25b",
	"26",
	"27",
	"28",
	"29",
	"30",
	"31",
	"32",
	"33",
	"34",
	"35",
	"36",
	"37",
	"38",
	"39",
	"40",
	"41",
	"42",
	"43",
	"44a",
	"44b",
	"45",
	"46",
	"47",
	"48",
	"49",
	"50",
	"51a",
	"51b",
	"52",
]);

/**
 * Format value for display in PDF field
 */
export function formatFieldValue(value: string | number | undefined, boxNumber?: string): string {
	if (value === undefined || value === null) {
		return "";
	}

	if (typeof value === "number") {
		// Special handling for year (Box 1) - no decimals, no commas
		if (boxNumber === "1") {
			return value.toString();
		}

		// Always format monetary boxes with 2 decimals
		if (boxNumber && MONETARY_BOXES.has(boxNumber)) {
			return value.toLocaleString("en-US", {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			});
		}

		// Fallback heuristic for other numeric fields
		if (value >= 1000 && value < 10000) {
			// Could be year - check if it's in reasonable range
			if (value >= 2000 && value <= 2100) {
				return value.toString();
			}
		}

		// Format large numbers as currency
		if (value >= 1000) {
			return value.toLocaleString("en-US", {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			});
		}

		return value.toString();
	}

	return String(value);
}
