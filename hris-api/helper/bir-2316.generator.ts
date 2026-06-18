/**
 * BIR Form 2316 Generator
 * Complete implementation with all 56 fields
 */

import type { BIRForm2316, BIRForm2316Input, BIRValidationResult } from "./bir-2316.types";
import { formatPHP } from "./tax-calculator.helper";

/**
 * Generate complete BIR Form 2316 from input data
 */
export function generateBIRForm2316(input: BIRForm2316Input): BIRForm2316 {
	const periodFrom = input.periodFrom || "0101";
	const periodTo = input.periodTo || "1231";

	// Calculate totals
	const comp = input.compensationPresent;

	// Part IV-B A: Non-Taxable
	const basicSalaryMWENonTaxable = comp.basicSalaryMWE || 0;
	const holidayPayMWE = comp.holidayPayMWE || 0;
	const overtimePayMWE = comp.overtimePayMWE || 0;
	const nightShiftDifferentialMWE = comp.nightShiftDifferentialMWE || 0;
	const hazardPayMWE = comp.hazardPayMWE || 0;
	const thirteenthMonthPayNonTaxable = comp.thirteenthMonthPayNonTaxable;
	const deMinimisBenefits = comp.deMinimisBenefits;
	const contributionsUnionDues = comp.contributionsUnionDues;
	const otherNonTaxable = comp.otherNonTaxable || 0;

	const totalNonTaxable =
		basicSalaryMWENonTaxable +
		holidayPayMWE +
		overtimePayMWE +
		nightShiftDifferentialMWE +
		hazardPayMWE +
		thirteenthMonthPayNonTaxable +
		deMinimisBenefits +
		contributionsUnionDues +
		otherNonTaxable;

	// Part IV-B B: Taxable Regular
	const basicSalaryTaxable = comp.basicSalaryTaxable;
	const representation = comp.representation || 0;
	const transportation = comp.transportation || 0;
	const cola = comp.cola || 0;
	const housingAllowance = comp.housingAllowance || 0;
	const othersAmountA = comp.othersA?.amount || 0;
	const othersAmountB = comp.othersB?.amount || 0;

	// Part IV-B B: Supplementary
	const commission = comp.commission || 0;
	const profitSharing = comp.profitSharing || 0;
	const fees = comp.fees || 0;
	const thirteenthMonthPayTaxable = comp.thirteenthMonthPayTaxable;
	const hazardPayTaxable = comp.hazardPayTaxable || 0;
	const overtimePayTaxable = comp.overtimePayTaxable || 0;
	const supplementaryOthersAmountA = comp.supplementaryOthersA?.amount || 0;
	const supplementaryOthersAmountB = comp.supplementaryOthersB?.amount || 0;

	// Total Taxable Compensation
	const totalTaxable =
		basicSalaryTaxable +
		representation +
		transportation +
		cola +
		housingAllowance +
		othersAmountA +
		othersAmountB +
		commission +
		profitSharing +
		fees +
		thirteenthMonthPayTaxable +
		hazardPayTaxable +
		overtimePayTaxable +
		supplementaryOthersAmountA +
		supplementaryOthersAmountB;

	// Part IV-A: Summary
	const grossCompensationPresentEmployer = totalNonTaxable + totalTaxable;
	const taxableCompensationPresentEmployer = totalTaxable;
	const taxableCompensationPreviousEmployer = input.compensationPrevious?.taxableIncome || 0;
	const grossTaxableCompensation =
		taxableCompensationPresentEmployer + taxableCompensationPreviousEmployer;

	const taxDue = input.tax.taxDue;
	const taxesWithheldPresentEmployer = input.tax.taxWithheldPresent;
	const taxesWithheldPreviousEmployer = input.tax.taxWithheldPrevious || 0;
	const taxesWithheld = taxesWithheldPresentEmployer + taxesWithheldPreviousEmployer;
	const taxCreditPERA = input.tax.taxCreditPERA || 0;
	const totalTaxesWithheld = taxesWithheld + taxCreditPERA;

	return {
		// Header
		year: input.year,
		periodFrom,
		periodTo,

		// Part I - Employee Information
		employeeTin: input.employee.tin,
		employeeLastName: input.employee.lastName.toUpperCase(),
		employeeFirstName: input.employee.firstName.toUpperCase(),
		employeeMiddleName: input.employee.middleName?.toUpperCase(),
		rdoCode: input.employee.rdoCode,
		registeredAddress: input.employee.registeredAddress,
		registeredAddressZipCode: input.employee.registeredAddressZipCode,
		localHomeAddress: input.employee.localHomeAddress,
		localHomeAddressZipCode: input.employee.localHomeAddressZipCode,
		foreignAddress: input.employee.foreignAddress,
		dateOfBirth: input.employee.dateOfBirth,
		contactNumber: input.employee.contactNumber,
		statutoryMinimumWagePerDay: input.employee.statutoryMinimumWagePerDay,
		statutoryMinimumWagePerMonth: input.employee.statutoryMinimumWagePerMonth,
		isMinimumWageEarner: input.employee.isMinimumWageEarner || false,

		// Part II - Present Employer
		presentEmployerTin: input.presentEmployer.tin,
		presentEmployerName: input.presentEmployer.name.toUpperCase(),
		presentEmployerAddress: input.presentEmployer.address,
		presentEmployerZipCode: input.presentEmployer.zipCode,
		employerType: input.presentEmployer.type,

		// Part III - Previous Employer
		previousEmployerTin: input.previousEmployer?.tin,
		previousEmployerName: input.previousEmployer?.name.toUpperCase(),
		previousEmployerAddress: input.previousEmployer?.address,
		previousEmployerZipCode: input.previousEmployer?.zipCode,

		// Part IV-A - Summary
		grossCompensationPresentEmployer: roundAmount(grossCompensationPresentEmployer),
		totalNonTaxablePresentEmployer: roundAmount(totalNonTaxable),
		taxableCompensationPresentEmployer: roundAmount(taxableCompensationPresentEmployer),
		taxableCompensationPreviousEmployer: roundAmount(taxableCompensationPreviousEmployer),
		grossTaxableCompensation: roundAmount(grossTaxableCompensation),
		taxDue: roundAmount(taxDue),
		taxesWithheld: roundAmount(taxesWithheld),
		taxesWithheldPresentEmployer: roundAmount(taxesWithheldPresentEmployer),
		taxesWithheldPreviousEmployer: roundAmount(taxesWithheldPreviousEmployer),
		totalTaxesWithheldAdjusted: roundAmount(taxesWithheld),
		taxCreditPERA: roundAmount(taxCreditPERA),
		totalTaxesWithheld: roundAmount(totalTaxesWithheld),

		// Part IV-B A - Non-Taxable
		basicSalaryMWENonTaxable: roundAmount(basicSalaryMWENonTaxable),
		holidayPayMWE: roundAmount(holidayPayMWE),
		overtimePayMWE: roundAmount(overtimePayMWE),
		nightShiftDifferentialMWE: roundAmount(nightShiftDifferentialMWE),
		hazardPayMWE: roundAmount(hazardPayMWE),
		thirteenthMonthPayNonTaxable: roundAmount(thirteenthMonthPayNonTaxable),
		deMinimisBenefits: roundAmount(deMinimisBenefits),
		contributionsUnionDues: roundAmount(contributionsUnionDues),
		otherNonTaxableCompensation: roundAmount(otherNonTaxable),
		totalNonTaxableCompensation: roundAmount(totalNonTaxable),

		// Part IV-B B - Taxable Regular
		basicSalaryTaxable: roundAmount(basicSalaryTaxable),
		representation: roundAmount(representation),
		transportation: roundAmount(transportation),
		cola: roundAmount(cola),
		housingAllowance: roundAmount(housingAllowance),
		othersDescription: comp.othersA?.description,
		othersLineA: comp.othersA?.description,
		othersAmountA: roundAmount(othersAmountA),
		othersLineB: comp.othersB?.description,
		othersAmountB: roundAmount(othersAmountB),

		// Part IV-B B - Supplementary
		commission: roundAmount(commission),
		profitSharing: roundAmount(profitSharing),
		fees: roundAmount(fees),
		thirteenthMonthPayTaxable: roundAmount(thirteenthMonthPayTaxable),
		hazardPayTaxable: roundAmount(hazardPayTaxable),
		overtimePayTaxable: roundAmount(overtimePayTaxable),
		supplementaryOthersDescription: comp.supplementaryOthersA?.description,
		supplementaryOthersLineA: comp.supplementaryOthersA?.description,
		supplementaryOthersAmountA: roundAmount(supplementaryOthersAmountA),
		supplementaryOthersLineB: comp.supplementaryOthersB?.description,
		supplementaryOthersAmountB: roundAmount(supplementaryOthersAmountB),
		totalTaxableCompensation: roundAmount(totalTaxable),

		// Signatures
		employerSignatory: input.presentEmployer.signatory,
		employerSignatoryTitle: input.presentEmployer.signatoryTitle,
		employeeCTCNo: input.employee.ctcNo,
		employeeValidIDNo: input.employee.validIDNo,
		employeeIDType: input.employee.idType,
		employeeIDPlaceOfIssue: input.employee.idPlaceOfIssue,
		employeeIDDateIssued: input.employee.idDateIssued,
	};
}

/**
 * Validate BIR Form 2316
 */
export function validateBIRForm2316(form: BIRForm2316): BIRValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	// Required fields validation
	if (!form.year || form.year < 2000 || form.year > 2100) {
		errors.push("Invalid year");
	}

	if (!form.employeeTin || !validateTIN(form.employeeTin)) {
		errors.push("Invalid employee TIN");
	}

	if (!form.employeeLastName || !form.employeeFirstName) {
		errors.push("Employee name is required");
	}

	if (!form.presentEmployerTin || !validateTIN(form.presentEmployerTin)) {
		errors.push("Invalid present employer TIN");
	}

	if (!form.presentEmployerName) {
		errors.push("Present employer name is required");
	}

	// Calculation validations
	const calculatedGross = form.totalNonTaxableCompensation + form.totalTaxableCompensation;
	if (Math.abs(calculatedGross - form.grossCompensationPresentEmployer) > 0.01) {
		errors.push(
			`Gross compensation mismatch: calculated ${calculatedGross} vs reported ${form.grossCompensationPresentEmployer}`,
		);
	}

	const calculatedTotalTaxable =
		form.taxableCompensationPresentEmployer + form.taxableCompensationPreviousEmployer;
	if (Math.abs(calculatedTotalTaxable - form.grossTaxableCompensation) > 0.01) {
		errors.push("Gross taxable compensation mismatch");
	}

	// Warnings
	if (form.taxDue < 0) {
		warnings.push("Tax due is negative");
	}

	if (form.totalTaxesWithheld < form.taxDue) {
		warnings.push("Taxes withheld is less than tax due - employee may owe taxes");
	}

	if (form.thirteenthMonthPayNonTaxable > 90000) {
		warnings.push("Non-taxable 13th month pay exceeds ₱90,000 cap");
	}

	return {
		isValid: errors.length === 0,
		errors,
		warnings,
	};
}

/**
 * Validate Philippine TIN format
 */
function validateTIN(tin: string): boolean {
	// Format: XXX-XXX-XXX-XXX or XXXXXXXXXXXX
	const tinPattern = /^\d{3}-?\d{3}-?\d{3}-?\d{3}$/;
	return tinPattern.test(tin);
}

/**
 * Round amount to 2 decimal places
 */
function roundAmount(amount: number): number {
	return Math.round(amount * 100) / 100;
}

/**
 * Print BIR Form 2316 to console (all fields)
 */
export function printBIRForm2316(form: BIRForm2316): void {
	const line = "=".repeat(100);
	const sectionLine = "-".repeat(100);

	console.log("\n" + line);
	console.log("BIR FORM 2316".padStart(55));
	console.log("CERTIFICATE OF COMPENSATION PAYMENT/TAX WITHHELD".padStart(68));
	console.log(line);

	// Header
	console.log(`\nBox 1  | For the Year: ${form.year}`);
	console.log(`Box 2  | Period: ${form.periodFrom} to ${form.periodTo}`);

	// Part I - Employee Information
	console.log("\n" + sectionLine);
	console.log("PART I - EMPLOYEE INFORMATION");
	console.log(sectionLine);

	console.log(`Box 3  | Employee TIN: ${form.employeeTin}`);
	console.log(
		`Box 4  | Employee Name: ${form.employeeLastName}, ${form.employeeFirstName}${form.employeeMiddleName ? " " + form.employeeMiddleName : ""}`,
	);
	console.log(`Box 5  | RDO Code: ${form.rdoCode}`);
	console.log(`Box 6  | Registered Address: ${form.registeredAddress}`);
	console.log(`Box 6A | ZIP Code (Registered): ${form.registeredAddressZipCode}`);

	if (form.localHomeAddress) {
		console.log(`Box 6B | Local Home Address: ${form.localHomeAddress}`);
		console.log(`Box 6C | ZIP Code (Local Home): ${form.localHomeAddressZipCode || "N/A"}`);
	}

	if (form.foreignAddress) {
		console.log(`Box 6D | Foreign Address: ${form.foreignAddress}`);
	}

	console.log(`Box 7  | Date of Birth: ${form.dateOfBirth}`);
	console.log(`Box 8  | Contact Number: ${form.contactNumber}`);

	if (form.statutoryMinimumWagePerDay) {
		console.log(
			`Box 9  | Statutory Minimum Wage (Daily): ${formatPHP(form.statutoryMinimumWagePerDay)}`,
		);
	}

	if (form.statutoryMinimumWagePerMonth) {
		console.log(
			`Box 10 | Statutory Minimum Wage (Monthly): ${formatPHP(form.statutoryMinimumWagePerMonth)}`,
		);
	}

	console.log(`Box 11 | Minimum Wage Earner: ${form.isMinimumWageEarner ? "YES" : "NO"}`);

	// Part II - Present Employer
	console.log("\n" + sectionLine);
	console.log("PART II - PRESENT EMPLOYER INFORMATION");
	console.log(sectionLine);

	console.log(`Box 12 | Present Employer TIN: ${form.presentEmployerTin}`);
	console.log(`Box 13 | Present Employer Name: ${form.presentEmployerName}`);
	console.log(`Box 14 | Present Employer Address: ${form.presentEmployerAddress}`);
	console.log(`Box 14A| Present Employer ZIP Code: ${form.presentEmployerZipCode}`);
	console.log(`Box 15 | Type of Employer: ${form.employerType}`);

	// Part III - Previous Employer
	if (form.previousEmployerTin) {
		console.log("\n" + sectionLine);
		console.log("PART III - PREVIOUS EMPLOYER INFORMATION");
		console.log(sectionLine);

		console.log(`Box 16 | Previous Employer TIN: ${form.previousEmployerTin}`);
		console.log(`Box 17 | Previous Employer Name: ${form.previousEmployerName || "N/A"}`);
		console.log(`Box 18 | Previous Employer Address: ${form.previousEmployerAddress || "N/A"}`);
		console.log(
			`Box 18A| Previous Employer ZIP Code: ${form.previousEmployerZipCode || "N/A"}`,
		);
	}

	// Part IV-A - Summary
	console.log("\n" + sectionLine);
	console.log("PART IV-A - SUMMARY OF COMPENSATION INCOME AND TAXES WITHHELD");
	console.log(sectionLine);

	console.log(
		`Box 19 | Gross Compensation (Present):           ${formatPHP(form.grossCompensationPresentEmployer).padStart(20)}`,
	);
	console.log(
		`Box 20 | Non-Taxable/Exempt (Present):           ${formatPHP(form.totalNonTaxablePresentEmployer).padStart(20)}`,
	);
	console.log(
		`Box 21 | Taxable Compensation (Present):         ${formatPHP(form.taxableCompensationPresentEmployer).padStart(20)}`,
	);
	console.log(
		`Box 22 | Taxable Compensation (Previous):        ${formatPHP(form.taxableCompensationPreviousEmployer).padStart(20)}`,
	);
	console.log(
		`Box 23 | Gross Taxable Compensation:             ${formatPHP(form.grossTaxableCompensation).padStart(20)}`,
	);
	console.log(
		`Box 24 | Tax Due:                                ${formatPHP(form.taxDue).padStart(20)}`,
	);
	console.log(
		`Box 25 | Amount of Taxes Withheld:               ${formatPHP(form.taxesWithheld).padStart(20)}`,
	);
	console.log(
		`Box 25A| Taxes Withheld (Present):               ${formatPHP(form.taxesWithheldPresentEmployer).padStart(20)}`,
	);
	console.log(
		`Box 25B| Taxes Withheld (Previous):              ${formatPHP(form.taxesWithheldPreviousEmployer).padStart(20)}`,
	);
	console.log(
		`Box 26 | Total Taxes Withheld (Adjusted):        ${formatPHP(form.totalTaxesWithheldAdjusted).padStart(20)}`,
	);
	console.log(
		`Box 27 | 5% Tax Credit (PERA):                   ${formatPHP(form.taxCreditPERA).padStart(20)}`,
	);
	console.log(
		`Box 28 | Total Taxes Withheld:                   ${formatPHP(form.totalTaxesWithheld).padStart(20)}`,
	);

	// Part IV-B A - Non-Taxable
	console.log("\n" + sectionLine);
	console.log("PART IV-B A - NON-TAXABLE/EXEMPT COMPENSATION INCOME");
	console.log(sectionLine);

	if (form.basicSalaryMWENonTaxable > 0) {
		console.log(
			`Box 29 | Basic Salary (MWE):                     ${formatPHP(form.basicSalaryMWENonTaxable).padStart(20)}`,
		);
	}
	if (form.holidayPayMWE > 0) {
		console.log(
			`Box 30 | Holiday Pay (MWE):                      ${formatPHP(form.holidayPayMWE).padStart(20)}`,
		);
	}
	if (form.overtimePayMWE > 0) {
		console.log(
			`Box 31 | Overtime Pay (MWE):                     ${formatPHP(form.overtimePayMWE).padStart(20)}`,
		);
	}
	if (form.nightShiftDifferentialMWE > 0) {
		console.log(
			`Box 32 | Night Shift Differential (MWE):        ${formatPHP(form.nightShiftDifferentialMWE).padStart(20)}`,
		);
	}
	if (form.hazardPayMWE > 0) {
		console.log(
			`Box 33 | Hazard Pay (MWE):                       ${formatPHP(form.hazardPayMWE).padStart(20)}`,
		);
	}
	console.log(
		`Box 34 | 13th Month Pay (Non-Taxable):           ${formatPHP(form.thirteenthMonthPayNonTaxable).padStart(20)}`,
	);
	console.log(
		`Box 35 | De Minimis Benefits:                    ${formatPHP(form.deMinimisBenefits).padStart(20)}`,
	);
	console.log(
		`Box 36 | SSS/PHIC/PAG-IBIG/Union Dues:           ${formatPHP(form.contributionsUnionDues).padStart(20)}`,
	);
	if (form.otherNonTaxableCompensation > 0) {
		console.log(
			`Box 37 | Other Non-Taxable Compensation:         ${formatPHP(form.otherNonTaxableCompensation).padStart(20)}`,
		);
	}
	console.log(
		`Box 38 | TOTAL NON-TAXABLE COMPENSATION:         ${formatPHP(form.totalNonTaxableCompensation).padStart(20)}`,
	);

	// Part IV-B B - Taxable
	console.log("\n" + sectionLine);
	console.log("PART IV-B B - TAXABLE COMPENSATION INCOME");
	console.log(sectionLine);
	console.log("REGULAR COMPENSATION:");

	console.log(
		`Box 39 | Basic Salary (Taxable):                 ${formatPHP(form.basicSalaryTaxable).padStart(20)}`,
	);
	if (form.representation > 0) {
		console.log(
			`Box 40 | Representation:                         ${formatPHP(form.representation).padStart(20)}`,
		);
	}
	if (form.transportation > 0) {
		console.log(
			`Box 41 | Transportation:                         ${formatPHP(form.transportation).padStart(20)}`,
		);
	}
	if (form.cola > 0) {
		console.log(
			`Box 42 | Cost of Living Allowance:              ${formatPHP(form.cola).padStart(20)}`,
		);
	}
	if (form.housingAllowance > 0) {
		console.log(
			`Box 43 | Fixed Housing Allowance:                ${formatPHP(form.housingAllowance).padStart(20)}`,
		);
	}
	if (form.othersLineA) {
		console.log(
			`Box 44A| ${form.othersLineA.padEnd(40)} ${formatPHP(form.othersAmountA || 0).padStart(20)}`,
		);
	}
	if (form.othersLineB) {
		console.log(
			`Box 44B| ${form.othersLineB.padEnd(40)} ${formatPHP(form.othersAmountB || 0).padStart(20)}`,
		);
	}

	console.log("\nSUPPLEMENTARY COMPENSATION:");

	if (form.commission > 0) {
		console.log(
			`Box 45 | Commission:                              ${formatPHP(form.commission).padStart(20)}`,
		);
	}
	if (form.profitSharing > 0) {
		console.log(
			`Box 46 | Profit Sharing:                         ${formatPHP(form.profitSharing).padStart(20)}`,
		);
	}
	if (form.fees > 0) {
		console.log(
			`Box 47 | Fees (Including Director's Fees):       ${formatPHP(form.fees).padStart(20)}`,
		);
	}
	if (form.thirteenthMonthPayTaxable > 0) {
		console.log(
			`Box 48 | 13th Month Pay (Taxable):               ${formatPHP(form.thirteenthMonthPayTaxable).padStart(20)}`,
		);
	}
	if (form.hazardPayTaxable > 0) {
		console.log(
			`Box 49 | Hazard Pay (Taxable):                   ${formatPHP(form.hazardPayTaxable).padStart(20)}`,
		);
	}
	if (form.overtimePayTaxable > 0) {
		console.log(
			`Box 50 | Overtime Pay (Taxable):                 ${formatPHP(form.overtimePayTaxable).padStart(20)}`,
		);
	}
	if (form.supplementaryOthersLineA) {
		console.log(
			`Box 51A| ${form.supplementaryOthersLineA.padEnd(40)} ${formatPHP(form.supplementaryOthersAmountA || 0).padStart(20)}`,
		);
	}
	if (form.supplementaryOthersLineB) {
		console.log(
			`Box 51B| ${form.supplementaryOthersLineB.padEnd(40)} ${formatPHP(form.supplementaryOthersAmountB || 0).padStart(20)}`,
		);
	}

	console.log(
		`\nBox 52 | TOTAL TAXABLE COMPENSATION:             ${formatPHP(form.totalTaxableCompensation).padStart(20)}`,
	);

	// Signatures
	console.log("\n" + sectionLine);
	console.log("SIGNATURES AND CERTIFICATION");
	console.log(sectionLine);

	console.log(
		`Box 53 | Employer Signatory: ${form.employerSignatory}${form.employerSignatoryTitle ? " (" + form.employerSignatoryTitle + ")" : ""}`,
	);
	console.log(
		`Box 54 | Employee ID: ${form.employeeValidIDNo || "N/A"} (${form.employeeIDType || "N/A"})`,
	);
	if (form.employeeCTCNo) {
		console.log(`       | CTC No.: ${form.employeeCTCNo}`);
	}

	console.log(line + "\n");
}

export default { generateBIRForm2316, validateBIRForm2316, printBIRForm2316 };
