/**
 * Mock BIR Form 2316 data for testing PDF field mapper
 * Based on test-bir-2316.ts Test Case 1: Complete Form
 */

import { getBoxMappingForField, extractFieldNumber } from "./box-field-mapper";
import type { BIRForm2316 } from "../types/bir-2316";

/**
 * Type-safe helper to get a value from BIRForm2316 by key
 * This ensures type safety and will error if the key doesn't exist
 */
function getValueByKey<K extends keyof BIRForm2316>(
	data: BIRForm2316,
	key: K,
): BIRForm2316[K] | undefined {
	return data[key];
}

/**
 * Type-safe helper to check if a key exists in BIRForm2316
 */
function isValidBIRKey(key: string): key is keyof BIRForm2316 {
	// This will be checked at runtime, but TypeScript will enforce the type
	return (
		key in
		{
			year: true,
			periodFrom: true,
			periodTo: true,
			employeeTin: true,
			employeeLastName: true,
			employeeFirstName: true,
			employeeMiddleName: true,
			rdoCode: true,
			registeredAddress: true,
			registeredAddressZipCode: true,
			localHomeAddress: true,
			localHomeAddressZipCode: true,
			foreignAddress: true,
			dateOfBirth: true,
			contactNumber: true,
			statutoryMinimumWagePerDay: true,
			statutoryMinimumWagePerMonth: true,
			isMinimumWageEarner: true,
			presentEmployerTin: true,
			presentEmployerName: true,
			presentEmployerAddress: true,
			presentEmployerZipCode: true,
			employerType: true,
			previousEmployerTin: true,
			previousEmployerName: true,
			previousEmployerAddress: true,
			previousEmployerZipCode: true,
			grossCompensationPresentEmployer: true,
			totalNonTaxablePresentEmployer: true,
			taxableCompensationPresentEmployer: true,
			taxableCompensationPreviousEmployer: true,
			grossTaxableCompensation: true,
			taxDue: true,
			taxesWithheldPresentEmployer: true,
			taxesWithheldPreviousEmployer: true,
			totalTaxesWithheldAdjusted: true,
			taxCreditPERA: true,
			totalTaxesWithheld: true,
			basicSalaryMWENonTaxable: true,
			holidayPayMWE: true,
			overtimePayMWE: true,
			nightShiftDifferentialMWE: true,
			hazardPayMWE: true,
			thirteenthMonthPayNonTaxable: true,
			deMinimisBenefits: true,
			contributionsUnionDues: true,
			otherNonTaxableCompensation: true,
			totalNonTaxableCompensation: true,
			basicSalaryTaxable: true,
			representation: true,
			transportation: true,
			cola: true,
			housingAllowance: true,
			othersLineA: true,
			othersAmountA: true,
			othersLineB: true,
			othersAmountB: true,
			commission: true,
			profitSharing: true,
			fees: true,
			thirteenthMonthPayTaxable: true,
			hazardPayTaxable: true,
			overtimePayTaxable: true,
			supplementaryOthersLineA: true,
			supplementaryOthersAmountA: true,
			supplementaryOthersLineB: true,
			supplementaryOthersAmountB: true,
			totalTaxableCompensation: true,
			employerSignatory: true,
			employerSignatoryTitle: true,
			employerSignatureDate: true,
			employeeSignatory: true,
			employeeSignatureDate: true,
			employeeCTCNo: true,
			employeeValidIDNo: true,
			employeeIDPlaceOfIssue: true,
			employeeIDDateIssued: true,
			employeeCTCAmount: true,
			substitutedFilingSignatory: true,
			substitutedFilingDate: true,
			substitutedFilingEmployeeSignatureDate: true,
			substitutedFilingIDDateIssued: true,
		}
	);
}

/**
 * Generate mock BIR Form 2316 data matching the test script
 * This matches the structure after generateBIRForm2316() is called
 */
export function getMockBIR2316Data(): BIRForm2316 {
	// Based on testCompleteForm() from test-bir-2316.ts
	// Monthly salary: 35,000, 12 months
	// Calculated values from the test script

	const monthlySalary = 35000;
	const monthsWorked = 12;
	const annualBasicSalary = monthlySalary * monthsWorked; // 420,000

	// Estimated annual contributions (SSS + PhilHealth + Pag-IBIG)
	const annualContributions = 15900; // Approximate annual contributions

	// 13th month pay
	const thirteenthMonthTotal = 35000;
	const thirteenthMonthNonTaxable = Math.min(thirteenthMonthTotal, 90000); // 35,000
	const thirteenthMonthTaxable = Math.max(thirteenthMonthTotal - 90000, 0); // 0

	// Estimated annual tax (simplified)
	const annualTax = 12000; // Approximate

	// De minimis benefits
	const deMinimisBenefits = 2500;

	const mockData: BIRForm2316 = {
		// ========================================
		// HEADER - PERIOD
		// ========================================
		year: 2025,
		periodFrom: "0101", // Format: MM/DD
		periodTo: "1231", // Format: MM/DD

		// ========================================
		// PART I - EMPLOYEE INFORMATION
		// ========================================
		employeeTin: "123-456-789-00000",
		employeeLastName: "DELA CRUZ",
		employeeFirstName: "JUAN",
		employeeMiddleName: "SANTOS",
		rdoCode: "039",
		registeredAddress: "123 Sample Street, Barangay San Miguel, Makati City, Metro Manila",
		registeredAddressZipCode: "1200",
		localHomeAddress: "456 Home Avenue, Barangay Poblacion, Makati City",
		localHomeAddressZipCode: "1210",
		foreignAddress: "",
		dateOfBirth: "05151990", // Format: MM/DD/YYYY
		contactNumber: "09171234567",
		statutoryMinimumWagePerDay: 610,
		statutoryMinimumWagePerMonth: 15000,
		isMinimumWageEarner: false,

		// ========================================
		// PART II - EMPLOYER INFO (PRESENT)
		// ========================================
		presentEmployerTin: "000-111-222-00000",
		presentEmployerName: "ABC CORPORATION",
		presentEmployerAddress: "456 Business Avenue, Makati City, Metro Manila",
		presentEmployerZipCode: "1226",
		employerType: "X-X",

		// ========================================
		// PART III - EMPLOYER INFO (PREVIOUS)
		// ========================================
		previousEmployerTin: "111-222-333-00000",
		previousEmployerName: "XYZ SOLUTIONS INC.",
		previousEmployerAddress: "789 Previous Employer Street, Quezon City, Metro Manila",
		previousEmployerZipCode: "1100",

		// ========================================
		// PART IV-A - SUMMARY
		// ========================================
		grossCompensationPresentEmployer: 504900, // Total compensation (54,900 + 450,000)
		totalNonTaxablePresentEmployer: 54900, // Non-taxable total
		taxableCompensationPresentEmployer: 450000, // Taxable total (sum of lines 39-51B)
		taxableCompensationPreviousEmployer: 0,
		grossTaxableCompensation: 450000,
		taxDue: annualTax,
		taxesWithheldPresentEmployer: annualTax,
		taxesWithheldPreviousEmployer: 0,
		totalTaxesWithheldAdjusted: annualTax,
		taxCreditPERA: 0,
		totalTaxesWithheld: annualTax,

		// ========================================
		// PART IV-B A - NON-TAXABLE
		// ========================================
		basicSalaryMWENonTaxable: 0,
		holidayPayMWE: 0,
		overtimePayMWE: 0,
		nightShiftDifferentialMWE: 0,
		hazardPayMWE: 0,
		thirteenthMonthPayNonTaxable: thirteenthMonthNonTaxable,
		deMinimisBenefits: deMinimisBenefits,
		contributionsUnionDues: annualContributions,
		otherNonTaxableCompensation: 0,
		totalNonTaxableCompensation: 54900,

		// ========================================
		// PART IV-B B - TAXABLE REGULAR
		// ========================================
		basicSalaryTaxable: annualBasicSalary,
		representation: 12000,
		transportation: 12000,
		cola: 6000,
		housingAllowance: 0,

		othersLineA: "TAXABLE ALLOWANCES",
		othersAmountA: 0,
		othersLineB: "",
		othersAmountB: 0,

		// ========================================
		// PART IV-B B - SUPPLEMENTARY
		// ========================================
		commission: 0,
		profitSharing: 0,
		fees: 0,
		thirteenthMonthPayTaxable: thirteenthMonthTaxable,
		hazardPayTaxable: 0,
		overtimePayTaxable: 0,
		supplementaryOthersLineA: "",
		supplementaryOthersAmountA: 0,
		supplementaryOthersLineB: "",
		supplementaryOthersAmountB: 0,
		totalTaxableCompensation: 450000, // Sum of lines 39-51B: 420,000 + 12,000 + 12,000 + 6,000 = 450,000

		// ========================================
		// SIGNATURES
		// ========================================
		// Box 53: Employer signature line + title + date signed
		employerSignatory: "MARIA CLARA SANTOS",
		employerSignatoryTitle: "HR Manager",
		employerSignatureDate: "01152025",

		// Box 54: Employee signature section
		// Printed name (signatory) + date and ID/CTC details; actual signature is handwritten.
		employeeSignatory: "JUAN SANTOS DELA CRUZ",
		employeeSignatureDate: "01202025",
		// employeeCTCNo: "CTC-123456",
		// employeeValidIDNo: "CTC-123456",
		// employeeIDPlaceOfIssue: "LTO Makati",
		// employeeIDDateIssued: "01152023",
		// employeeCTCAmount: 200.0,

		// Substituted filing (sample values so Box 55 & 56 are fully populated)
		substitutedFilingSignatory: "",
		substitutedFilingDate: "",
		substitutedFilingEmployeeSignatureDate: "",
		substitutedFilingIDDateIssued: "",
	};

	return mockData;
}

/**
 * Map box numbers to BIR Form 2316 data keys
 * Some boxes have multiple inputs - this maps to the possible parts
 * Based on official BIR Form 2316 box numbers
 */
const BOX_NUMBER_TO_DATA_KEYS: Record<string, string[]> = {
	"1": ["year"],
	"2": ["periodFrom", "periodTo"], // Box 2 has 2 inputs: From and To
	"3": ["employeeTin", "employeeTin", "employeeTin", "employeeTin"], // Box 3 (TIN) has 4 input boxes - all map to same TIN value (will split the TIN like 123-456-789-000)
	"4": ["employeeFirstName"], // Box 4 has 1 input - full name combined (Last, First, Middle)
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
	"12": ["presentEmployerTin", "presentEmployerTin", "presentEmployerTin", "presentEmployerTin"], // Box 12 (Present Employer TIN) has 4 input boxes - all map to same TIN value (will split the TIN like 000-111-222-000)
	"13": ["presentEmployerName"],
	"14": ["presentEmployerAddress"],
	"14a": ["presentEmployerZipCode"],
	"15": ["employerType", "employerType"], // Box 15 has 2 inputs: MAIN and SECONDARY
	"16": [
		"previousEmployerTin",
		"previousEmployerTin",
		"previousEmployerTin",
		"previousEmployerTin",
	], // Box 16 (Previous Employer TIN) has 4 input boxes - all map to same TIN value (will split the TIN)
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
	"44a": ["othersLineA", "othersAmountA"], // Description + Amount
	"44b": ["othersLineB", "othersAmountB"], // Description + Amount
	"45": ["commission"],
	"46": ["profitSharing"],
	"47": ["fees"],
	"48": ["thirteenthMonthPayTaxable"],
	"49": ["hazardPayTaxable"],
	"50": ["overtimePayTaxable"],
	"51a": ["supplementaryOthersLineA", "supplementaryOthersAmountA"],
	"51b": ["supplementaryOthersLineB", "supplementaryOthersAmountB"],
	"52": ["totalTaxableCompensation"],
	// Box 53: Employer signature line + date signed
	"53": ["employerSignatory", "employerSignatureDate"],
	// Box 54: Employee signature section (printed name + date + CTC/ID details)
	// Inputs on form: Employee name, Date Signed, CTC/Valid ID No., Place of Issue, Date Issued, Amount Paid (if CTC)
	"54": [
		"employeeSignatory",
		"employeeSignatureDate",
		"employeeCTCNo",
		"employeeIDPlaceOfIssue",
		"employeeIDDateIssued",
		"employeeCTCAmount",
	],
	// Box 55: Substituted filing - employer/authorized agent signature + date
	"55": ["substitutedFilingSignatory", "substitutedFilingDate"],
	// Box 56: Substituted filing - employee signature date + ID date issued
	"56": ["substitutedFilingEmployeeSignatureDate", "substitutedFilingIDDateIssued"],
};

/**
 * Legacy single key mapping for backwards compatibility
 * This is used when we don't know which specific input of a multi-input box
 */
const BOX_NUMBER_TO_DATA_KEY: Record<string, string> = {
	"1": "year",
	"2": "periodFrom", // Default to periodFrom, but Box 2 has 2 inputs
	"3": "employeeTin", // Default to employeeTin, but Box 3 has 4 inputs
	"4": "employeeFirstName", // Box 4 has 1 input (full name combined)
	"5": "rdoCode",
	"6": "registeredAddress",
	"6a": "registeredAddressZipCode",
	"6b": "localHomeAddress",
	"6c": "localHomeAddressZipCode",
	"6d": "foreignAddress",
	"7": "dateOfBirth",
	"8": "contactNumber",
	"9": "statutoryMinimumWagePerDay",
	"10": "statutoryMinimumWagePerMonth",
	"11": "isMinimumWageEarner",
	"12": "presentEmployerTin",
	"13": "presentEmployerName",
	"14": "presentEmployerAddress",
	"14a": "presentEmployerZipCode",
	"15": "employerType", // Default to first input, but Box 15 has 2 inputs
	"16": "previousEmployerTin",
	"17": "previousEmployerName",
	"18": "previousEmployerAddress",
	"18a": "previousEmployerZipCode",
	"19": "grossCompensationPresentEmployer",
	"20": "totalNonTaxablePresentEmployer",
	"21": "taxableCompensationPresentEmployer",
	"22": "taxableCompensationPreviousEmployer",
	"23": "grossTaxableCompensation",
	"24": "taxDue",
	"25a": "taxesWithheldPresentEmployer",
	"25b": "taxesWithheldPreviousEmployer",
	"26": "totalTaxesWithheldAdjusted",
	"27": "taxCreditPERA",
	"28": "totalTaxesWithheld",
	"29": "basicSalaryMWENonTaxable",
	"30": "holidayPayMWE",
	"31": "overtimePayMWE",
	"32": "nightShiftDifferentialMWE",
	"33": "hazardPayMWE",
	"34": "thirteenthMonthPayNonTaxable",
	"35": "deMinimisBenefits",
	"36": "contributionsUnionDues",
	"37": "otherNonTaxableCompensation",
	"38": "totalNonTaxableCompensation",
	"39": "basicSalaryTaxable",
	"40": "representation",
	"41": "transportation",
	"42": "cola",
	"43": "housingAllowance",
	"44a": "othersLineA", // Default to description
	"44b": "othersLineB",
	"45": "commission",
	"46": "profitSharing",
	"47": "fees",
	"48": "thirteenthMonthPayTaxable",
	"49": "hazardPayTaxable",
	"50": "overtimePayTaxable",
	"51a": "supplementaryOthersLineA",
	"51b": "supplementaryOthersLineB",
	"52": "totalTaxableCompensation",
	// Default keys for signature section (first inputs)
	"53": "employerSignatory",
	"54": "employeeSignatory",
	"55": "substitutedFilingSignatory",
	"56": "substitutedFilingEmployeeSignatureDate",
};

/**
 * Map BIR Form 2316 field names to common PDF field names
 * This helps match the mapper field names to the actual data
 */
/**
 * Track field occurrences for boxes with multiple inputs
 * This helps map sequential fields like "Field 2", "Field 3" to the correct input
 */
let fieldOccurrenceTracker: Record<string, number> = {};
let globalFieldIndex = 0; // Track global field sequence

export function resetFieldOccurrenceTracker() {
	fieldOccurrenceTracker = {};
	globalFieldIndex = 0;
}

/**
 * Get the value for a specific box input
 * @param boxNumber Box number (e.g., "1", "2", "3")
 * @param inputIndex 0-based index of which input in that box
 * @param data The mock data object
 */
function getValueForBoxInput(
	boxNumber: string,
	inputIndex: number,
	data: BIRForm2316,
): string | number | undefined {
	const possibleKeys = BOX_NUMBER_TO_DATA_KEYS[boxNumber];

	if (!possibleKeys || possibleKeys.length === 0) {
		console.log(`[FieldMapper] Box ${boxNumber} not found in BOX_NUMBER_TO_DATA_KEYS`);
		return undefined;
	}

	// Clamp input index to valid range
	inputIndex = Math.max(0, Math.min(inputIndex, possibleKeys.length - 1));
	const selectedKey = possibleKeys[inputIndex];

	console.log(
		`[FieldMapper] Getting value for Box ${boxNumber}, input ${inputIndex + 1}/${possibleKeys.length} -> "${selectedKey}"`,
	);

	// Special handling for Box 3 (Employee TIN) - split TIN across 4 inputs
	if (boxNumber === "3" && data.employeeTin) {
		const tin = String(data.employeeTin).replace(/-/g, ""); // Remove dashes
		// TIN format: 12345678900000 (14 digits) - split into 3 parts of 3 digits + 1 part of 5 digits
		const parts = [
			tin.substring(0, 3), // "123"
			tin.substring(3, 6), // "456"
			tin.substring(6, 9), // "789"
			tin.substring(9, 14), // "00000" (5 digits)
		];
		if (parts[inputIndex]) {
			console.log(
				`[FieldMapper] ✓ Employee TIN part ${inputIndex + 1}: "${parts[inputIndex]}"`,
			);
			return parts[inputIndex];
		}
	}

	// Special handling for Box 12 (Present Employer TIN) - split TIN across 4 inputs
	if (boxNumber === "12" && data.presentEmployerTin) {
		const tin = String(data.presentEmployerTin).replace(/-/g, ""); // Remove dashes
		// TIN format: 00011122200000 (14 digits) - split into 3 parts of 3 digits + 1 part of 5 digits
		const parts = [
			tin.substring(0, 3), // "000"
			tin.substring(3, 6), // "111"
			tin.substring(6, 9), // "222"
			tin.substring(9, 14), // "00000" (5 digits)
		];
		if (parts[inputIndex]) {
			console.log(
				`[FieldMapper] ✓ Present Employer TIN part ${inputIndex + 1}: "${parts[inputIndex]}"`,
			);
			return parts[inputIndex];
		}
	}

	// Special handling for Box 16 (Previous Employer TIN) - split TIN across 4 inputs
	if (boxNumber === "16" && data.previousEmployerTin) {
		const tin = String(data.previousEmployerTin).replace(/-/g, ""); // Remove dashes
		// TIN format: 14 digits - split into 3 parts of 3 digits + 1 part of 5 digits
		const parts = [
			tin.substring(0, 3),
			tin.substring(3, 6),
			tin.substring(6, 9),
			tin.substring(9, 14), // 5 digits
		];
		if (parts[inputIndex]) {
			console.log(
				`[FieldMapper] ✓ Previous Employer TIN part ${inputIndex + 1}: "${parts[inputIndex]}"`,
			);
			return parts[inputIndex];
		}
	}

	// Special handling for Box 2 (Period) - 2 inputs
	if (boxNumber === "2") {
		if (inputIndex === 0) {
			const value = data.periodFrom || "";
			console.log(`[FieldMapper] ✓ Box 2 input 1 (periodFrom): "${value}"`);
			return value;
		} else {
			const value = data.periodTo || "";
			console.log(`[FieldMapper] ✓ Box 2 input 2 (periodTo): "${value}"`);
			return value;
		}
	}

	// Special handling for Box 15 (Employer Type) - 2 inputs
	if (boxNumber === "15") {
		const employerType = String(data.employerType || "");
		// Parse "X-X" format: first X = MAIN, second X = SECONDARY
		const parts = employerType.split("-");
		if (inputIndex === 0) {
			// First input: "X" if first part is "X", otherwise empty
			const value = parts[0] === "X" ? "X" : "";
			console.log(`[FieldMapper] ✓ Box 15 input 1 (MAIN): "${value}"`);
			return value;
		} else {
			// Second input: "000" if second part is "X", otherwise empty
			const value = parts[1] === "X" ? "" : "";
			console.log(`[FieldMapper] ✓ Box 15 input 2 (SECONDARY): "${value}"`);
			return value;
		}
	}

	// Special handling for Box 1 (Year) - return plain number without decimals
	if (boxNumber === "1") {
		const year = data.year;
		if (typeof year === "number") {
			console.log(`[FieldMapper] ✓ Box 1 (Year): ${year}`);
			return year; // Return as number, will be formatted correctly
		}
	}

	// Special handling for Box 4 (Employee Name) - 1 input, return full name
	if (boxNumber === "4") {
		const lastName = data.employeeLastName || "";
		const firstName = data.employeeFirstName || "";
		const middleName = data.employeeMiddleName || "";
		const fullName = `${lastName}, ${firstName}${middleName ? " " + middleName : ""}`.trim();
		console.log(`[FieldMapper] ✓ Box 4 (Employee Name): "${fullName}"`);
		return fullName || undefined;
	}

	// For all other boxes, use the selected key from the array with type safety
	if (isValidBIRKey(selectedKey)) {
		const value = getValueByKey(data, selectedKey);
		if (value !== undefined) {
			console.log(
				`[FieldMapper] ✓ SUCCESS: Box ${boxNumber}, input ${inputIndex + 1} -> "${selectedKey}" = ${value}`,
			);
			return value as string | number | undefined;
		}
	}
	console.log(
		`[FieldMapper] ✗ Data key "${selectedKey}" not found or invalid in BIRForm2316 for Box ${boxNumber}`,
	);
	return undefined;
}

export function mapFieldNameToData(
	fieldName: string,
	data: BIRForm2316,
): string | number | undefined {
	if (!fieldName || fieldName.trim() === "") {
		return undefined;
	}

	// Normalize field name for matching (lowercase, remove spaces/special chars)
	const normalized = fieldName
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]/g, "");

	console.log(
		`[FieldMapper] Trying to match field: "${fieldName}" (normalized: "${normalized}")`,
	);

	// FIRST: Try sequential field mapping (Field 1, Field 2, etc. → Box mapping)
	const fieldNumber = extractFieldNumber(fieldName);
	if (fieldNumber) {
		const boxMapping = getBoxMappingForField(fieldNumber);
		if (boxMapping) {
			console.log(
				`[FieldMapper] Found sequential mapping: "${fieldName}" (Field ${fieldNumber}) → Box ${boxMapping.boxNumber}, input ${boxMapping.inputIndex + 1}/${boxMapping.totalInputs}`,
			);

			// Use the box mapping to get the correct value
			return getValueForBoxInput(boxMapping.boxNumber, boxMapping.inputIndex, data);
		}
	}

	// Step 0: Check if it's a box number (Field 1, Box 1, field1, box1, etc.)
	// Try multiple patterns to catch different formats
	let boxNum: string | null = null;

	// Pattern 1: "field1", "box1", "field2", etc.
	const pattern1 = normalized.match(/^(field|box)(\d+[a-z]?)$/);
	if (pattern1 && pattern1[2]) {
		boxNum = pattern1[2].toLowerCase();
		console.log(`[FieldMapper] Pattern 1 matched "${normalized}": boxNum = "${boxNum}"`);
	} else {
		console.log(`[FieldMapper] Pattern 1 did NOT match "${normalized}"`);
	}

	// Pattern 2: Just numbers like "1", "2", "3" (if normalized is just a number)
	if (!boxNum && /^\d+[a-z]?$/.test(normalized)) {
		boxNum = normalized.toLowerCase();
	}

	// Pattern 3: Extract number from end of string (for "field1", "box2", etc.)
	if (!boxNum) {
		const numberMatch = normalized.match(/(\d+[a-z]?)$/);
		console.log(
			`[FieldMapper] Pattern 3 check for "${normalized}": numberMatch =`,
			numberMatch,
			`length = ${normalized.length}`,
		);
		if (numberMatch && numberMatch[1] && normalized.length <= 10) {
			// Only for simple names like "field1"
			boxNum = numberMatch[1].toLowerCase();
			console.log(`[FieldMapper] Pattern 3 matched "${normalized}": boxNum = "${boxNum}"`);
		}
	}

	console.log(`[FieldMapper] Final boxNum for "${fieldName}":`, boxNum);

	if (boxNum) {
		const dataKey = BOX_NUMBER_TO_DATA_KEY[boxNum];

		// Use BOX_NUMBER_TO_DATA_KEYS to determine how many inputs this box has
		const possibleKeys = BOX_NUMBER_TO_DATA_KEYS[boxNum];

		if (!possibleKeys || possibleKeys.length === 0) {
			console.log(`[FieldMapper] Box number ${boxNum} not found in BOX_NUMBER_TO_DATA_KEYS`);
			return undefined;
		}

		console.log(
			`[FieldMapper] Box ${boxNum} has ${possibleKeys.length} input(s) in BOX_NUMBER_TO_DATA_KEYS`,
		);

		// Determine which input index this field represents
		let inputIndex = 0;
		const lowerFieldName = fieldName.toLowerCase();
		let suffixIndex: number | undefined;

		if (possibleKeys.length > 1) {
			if (/(?:-|_|\s)(desc|description)$/.test(lowerFieldName)) {
				suffixIndex = 0;
			} else if (/(?:-|_|\s)?(amount|amt|value)$/.test(lowerFieldName)) {
				suffixIndex = possibleKeys.length - 1;
			}
		}

		const indexMatch = normalized.match(/(\d+)[-_]?(\d+)$/);
		if (suffixIndex !== undefined) {
			inputIndex = Math.max(0, Math.min(suffixIndex, possibleKeys.length - 1));
			console.log(
				`[FieldMapper] Detected suffix-based input index for "${fieldName}": ${inputIndex + 1}`,
			);
		} else if (indexMatch && indexMatch[2]) {
			// Field name like "field2-1" or "field3_2" - explicit input index
			inputIndex = parseInt(indexMatch[2]) - 1;
			console.log(
				`[FieldMapper] Detected explicit numeric input index from field name: ${inputIndex + 1}`,
			);
		} else {
			// Use sequential tracking - increment counter for this box number
			if (!fieldOccurrenceTracker[boxNum]) {
				fieldOccurrenceTracker[boxNum] = 0;
			} else {
				fieldOccurrenceTracker[boxNum]++;
			}
			inputIndex = fieldOccurrenceTracker[boxNum];
			console.log(
				`[FieldMapper] Using sequential input index for Box ${boxNum}: ${inputIndex + 1} (occurrence ${fieldOccurrenceTracker[boxNum] + 1})`,
			);
		}

		// Clamp to valid range
		inputIndex = Math.max(0, Math.min(inputIndex, possibleKeys.length - 1));
		const selectedKey = possibleKeys[inputIndex];

		console.log(
			`[FieldMapper] Box ${boxNum}, input ${inputIndex + 1}/${possibleKeys.length} -> dataKey "${selectedKey}"`,
		);

		// Special handling for Box 3 (Employee TIN) - split TIN across 4 inputs
		if (boxNum === "3" && data.employeeTin) {
			const tin = String(data.employeeTin).replace(/-/g, ""); // Remove dashes
			// TIN format: 12345678900000 (14 digits) - split into 3 parts of 3 digits + 1 part of 5 digits
			const parts = [
				tin.substring(0, 3), // "123"
				tin.substring(3, 6), // "456"
				tin.substring(6, 9), // "789"
				tin.substring(9, 14), // "00000" (5 digits)
			];
			if (parts[inputIndex]) {
				console.log(
					`[FieldMapper] ✓ Employee TIN part ${inputIndex + 1}: "${parts[inputIndex]}"`,
				);
				return parts[inputIndex];
			}
		}

		// Special handling for Box 12 (Present Employer TIN) - split TIN across 4 inputs
		if (boxNum === "12" && data.presentEmployerTin) {
			const tin = String(data.presentEmployerTin).replace(/-/g, ""); // Remove dashes
			// TIN format: 00011122200000 (14 digits) - split into 3 parts of 3 digits + 1 part of 5 digits
			const parts = [
				tin.substring(0, 3), // "000"
				tin.substring(3, 6), // "111"
				tin.substring(6, 9), // "222"
				tin.substring(9, 14), // "00000" (5 digits)
			];
			if (parts[inputIndex]) {
				console.log(
					`[FieldMapper] ✓ Present Employer TIN part ${inputIndex + 1}: "${parts[inputIndex]}"`,
				);
				return parts[inputIndex];
			}
		}

		// Special handling for Box 16 (Previous Employer TIN) - split TIN across 4 inputs
		if (boxNum === "16" && data.previousEmployerTin) {
			const tin = String(data.previousEmployerTin).replace(/-/g, ""); // Remove dashes
			// TIN format: 14 digits - split into 3 parts of 3 digits + 1 part of 5 digits
			const parts = [
				tin.substring(0, 3),
				tin.substring(3, 6),
				tin.substring(6, 9),
				tin.substring(9, 14), // 5 digits
			];
			if (parts[inputIndex]) {
				console.log(
					`[FieldMapper] ✓ Previous Employer TIN part ${inputIndex + 1}: "${parts[inputIndex]}"`,
				);
				return parts[inputIndex];
			}
		}

		// Special handling for Box 2 (Period) - 2 inputs
		if (boxNum === "2") {
			if (inputIndex === 0) {
				const value = data.periodFrom || "";
				console.log(`[FieldMapper] ✓ Box 2 input 1 (periodFrom): "${value}"`);
				return value;
			} else {
				const value = data.periodTo || "";
				console.log(`[FieldMapper] ✓ Box 2 input 2 (periodTo): "${value}"`);
				return value;
			}
		}

		// Special handling for Box 15 (Employer Type) - 2 inputs
		if (boxNum === "15") {
			const employerType = String(data.employerType || "");
			// Parse "X-X" format: first X = MAIN, second X = SECONDARY
			const parts = employerType.split("-");
			if (inputIndex === 0) {
				// First input: "X" if first part is "X", otherwise empty
				const value = parts[0] === "X" ? "X" : "";
				console.log(`[FieldMapper] ✓ Box 15 input 1 (MAIN): "${value}"`);
				return value;
			} else {
				// Second input: "X" if second part is "X", otherwise empty
				const value = parts[1] === "X" ? "X" : "";
				console.log(`[FieldMapper] ✓ Box 15 input 2 (SECONDARY): "${value}"`);
				return value;
			}
		}

		// Special handling for Box 4 (Employee Name) - 1 input, return full name
		if (boxNum === "4") {
			const lastName = data.employeeLastName || "";
			const firstName = data.employeeFirstName || "";
			const middleName = data.employeeMiddleName || "";
			const fullName =
				`${lastName}, ${firstName}${middleName ? " " + middleName : ""}`.trim();
			console.log(`[FieldMapper] ✓ Box 4 (Employee Name): "${fullName}"`);
			return fullName || undefined;
		}

		// For all other boxes, use the selected key from the array with type safety
		if (isValidBIRKey(selectedKey)) {
			const value = getValueByKey(data, selectedKey);
			if (value !== undefined) {
				console.log(
					`[FieldMapper] ✓ SUCCESS: "${fieldName}" -> Box ${boxNum}, input ${inputIndex + 1} -> "${selectedKey}" = ${value}`,
				);
				return value as string | number | undefined;
			}
		}
		console.log(
			`[FieldMapper] ✗ Data key "${selectedKey}" not found or invalid in BIRForm2316 for Box ${boxNum}`,
		);
		return undefined;
	}

	// Common field name variations - EXPANDED MAPPING
	const fieldMappings: Record<string, string> = {
		// Year and Period
		year: "year",
		foryear: "year",
		theyear: "year",

		// Period
		periodfrom: "periodFrom",
		periodto: "periodTo",
		period: "periodFrom",
		from: "periodFrom",
		to: "periodTo",

		// Employee TIN
		tin: "employeeTin",
		employeetin: "employeeTin",
		etin: "employeeTin",

		// Employee Name
		name: "employeeFirstName",
		lastname: "employeeLastName",
		firstname: "employeeFirstName",
		middlename: "employeeMiddleName",
		fullname: "employeeFirstName",
		employeename: "employeeFirstName",
		last: "employeeLastName",
		first: "employeeFirstName",
		middle: "employeeMiddleName",

		// RDO
		rdo: "rdoCode",
		rdocode: "rdoCode",
		rdo39: "rdoCode",

		// Address
		address: "registeredAddress",
		registeredaddress: "registeredAddress",
		regaddress: "registeredAddress",
		homeaddress: "localHomeAddress",
		localhomeaddress: "localHomeAddress",

		// ZIP Code
		zipcode: "registeredAddressZipCode",
		zip: "registeredAddressZipCode",
		zipregistered: "registeredAddressZipCode",
		ziplocal: "localHomeAddressZipCode",

		// Date of Birth
		birthdate: "dateOfBirth",
		dateofbirth: "dateOfBirth",
		dob: "dateOfBirth",
		birth: "dateOfBirth",
		birthday: "dateOfBirth",

		// Contact
		contact: "contactNumber",
		phonenumber: "contactNumber",
		cellphone: "contactNumber",
		phone: "contactNumber",
		mobile: "contactNumber",

		// Minimum Wage Earner
		mwe: "isMinimumWageEarner",
		minimumwageearner: "isMinimumWageEarner",
		minimumwage: "isMinimumWageEarner",

		// CTC and ID
		ctc: "employeeCTCNo",
		ctcno: "employeeCTCNo",
		validid: "employeeValidIDNo",
		idnumber: "employeeValidIDNo",
		idno: "employeeValidIDNo",
		id: "employeeValidIDNo",
		idplace: "employeeIDPlaceOfIssue",
		idissued: "employeeIDDateIssued",

		// Employer
		employertin: "presentEmployerTin",
		presentemployertin: "presentEmployerTin",
		petin: "presentEmployerTin",
		employername: "presentEmployerName",
		presentemployername: "presentEmployerName",
		companyname: "presentEmployerName",
		company: "presentEmployerName",
		employeraddress: "presentEmployerAddress",
		presentemployeraddress: "presentEmployerAddress",
		employerzip: "presentEmployerZipCode",
		employertype: "employerType",

		// Signatory
		signatory: "employerSignatory",
		employersignatory: "employerSignatory",
		signedby: "employerSignatory",

		// Compensation
		basicsalary: "basicSalaryTaxable",
		basicsal: "basicSalaryTaxable",
		salary: "basicSalaryTaxable",
		grosscompensation: "grossCompensationPresentEmployer",
		gross: "grossCompensationPresentEmployer",
		taxable: "taxableCompensationPresentEmployer",
		taxablecompensation: "taxableCompensationPresentEmployer",

		// Tax
		taxdue: "taxDue",
		taxwithheld: "taxesWithheldPresentEmployer",
		taxeswithheld: "taxesWithheldPresentEmployer",
		withheld: "taxesWithheldPresentEmployer",

		// 13th Month
		"13thmonth": "thirteenthMonthPayNonTaxable",
		thirteenthmonth: "thirteenthMonthPayNonTaxable",
		"13th": "thirteenthMonthPayNonTaxable",

		// Other
		deminimis: "deMinimisBenefits",
		contributions: "contributionsUnionDues",
		totalnontaxable: "totalNonTaxableCompensation",
		totaltaxable: "totalTaxableCompensation",
		representation: "representation",
		transportation: "transportation",
		cola: "cola",
	};

	// Step 1: Try direct mapping first
	const mappedKey = fieldMappings[normalized];
	if (mappedKey && isValidBIRKey(mappedKey)) {
		const value = getValueByKey(data, mappedKey);
		if (value !== undefined) {
			console.log(
				`[FieldMapper] Found match via mapping: "${fieldName}" -> "${mappedKey}" = ${value}`,
			);
			return value as string | number | undefined;
		}
	}

	// Step 2: Try direct key matches (exact normalized match)
	for (const key of Object.keys(data) as Array<keyof BIRForm2316>) {
		const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
		if (normalized === normalizedKey) {
			const value = getValueByKey(data, key);
			console.log(`[FieldMapper] Found exact match: "${fieldName}" -> "${key}" = ${value}`);
			return value as string | number | undefined;
		}
	}

	// Step 3: Try contains matches (field name contains data key or vice versa)
	for (const key of Object.keys(data) as Array<keyof BIRForm2316>) {
		const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");

		// Check if normalized field name contains key or key contains field name
		if (normalizedKey.length > 0 && normalized.length > 0) {
			// If either is contained in the other (at least 3 chars to avoid false positives)
			if (
				(normalizedKey.length >= 3 && normalized.includes(normalizedKey)) ||
				(normalized.length >= 3 && normalizedKey.includes(normalized))
			) {
				const value = getValueByKey(data, key);
				console.log(
					`[FieldMapper] Found contains match: "${fieldName}" -> "${key}" = ${value}`,
				);
				return value as string | number | undefined;
			}
		}
	}

	// Step 4: Try word-by-word matching (split by common words)
	const words = normalized.split(/(\d+|[a-z]+)/).filter((w) => w.length > 2);
	for (const key of Object.keys(data) as Array<keyof BIRForm2316>) {
		const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
		const keyWords = normalizedKey.split(/(\d+|[a-z]+)/).filter((w) => w.length > 2);

		// If any significant word matches
		const matchingWords = words.filter((w) => keyWords.includes(w));
		if (
			matchingWords.length > 0 &&
			matchingWords.length >= Math.min(words.length, keyWords.length) * 0.5
		) {
			const value = getValueByKey(data, key);
			console.log(`[FieldMapper] Found word match: "${fieldName}" -> "${key}" = ${value}`);
			return value as string | number | undefined;
		}
	}

	console.log(`[FieldMapper] No match found for: "${fieldName}"`);
	return undefined;
}

/**
 * Format value for display in PDF field
 */
// Boxes that represent monetary amounts and should always be shown with 2 decimals
const MONETARY_BOXES = new Set([
	// Part I - Statutory Minimum Wage
	"9",
	"10",

	// Part IV-A Summary
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
	// Part IV-B A/B Non-taxable & Taxable
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

export function formatFieldValue(value: string | number | undefined, boxNumber?: string): string {
	if (value === undefined || value === null) {
		return "";
	}

	if (typeof value === "number") {
		// Special handling for year (Box 1) - no decimals, no commas
		if (boxNumber === "1") {
			return value.toString();
		}

		// Always format monetary boxes with 2 decimals (even 0, small amounts)
		if (boxNumber && MONETARY_BOXES.has(boxNumber)) {
			return value.toLocaleString("en-US", {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			});
		}

		// Fallback heuristic for other numeric fields
		if (value >= 1000 && value < 10000) {
			// Could be year or amount - check if it's a year (4 digits, reasonable range)
			if (value >= 2000 && value <= 2100) {
				// Likely a year
				return value.toString();
			}
		}

		// Format large numbers as currency (with commas, 2 decimals)
		if (value >= 1000) {
			return value.toLocaleString("en-US", {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			});
		}

		// Small non-monetary numbers - just return as string
		return value.toString();
	}

	return String(value);
}
