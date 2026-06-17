/**
 * BIR Form 2316 - Complete Type Definitions
 * Certificate of Compensation Payment/Tax Withheld
 *
 * All 56 fields as per official BIR Form 2316
 */

/**
 * Complete BIR Form 2316 Interface
 * All fields mapped to box numbers
 */
export interface BIRForm2316 {
	// ========================================
	// HEADER - PERIOD
	// ========================================

	/** Box 1: For the Year (YYYY) */
	year: number;

	/** Box 2: For the Period From (MMDD) To (MMDD) */
	periodFrom: string; // Format: MMDD
	periodTo: string; // Format: MMDD

	// ========================================
	// PART I - EMPLOYEE INFORMATION
	// ========================================

	/** Box 3: Employee TIN */
	employeeTin: string;

	/** Box 4: Employee Name (Last, First, Middle Name) */
	employeeLastName: string;
	employeeFirstName: string;
	employeeMiddleName?: string;

	/** Box 5: RDO Code */
	rdoCode: string;

	/** Box 6: Registered Address */
	registeredAddress: string;

	/** Box 6A: ZIP Code (Registered Address) */
	registeredAddressZipCode: string;

	/** Box 6B: Local Home Address */
	localHomeAddress?: string;

	/** Box 6C: ZIP Code (Local Home Address) */
	localHomeAddressZipCode?: string;

	/** Box 6D: Foreign Address */
	foreignAddress?: string;

	/** Box 7: Date of Birth (MM/DD/YYYY) */
	dateOfBirth: string; // Format: MM/DD/YYYY

	/** Box 8: Contact Number */
	contactNumber: string;

	/** Box 9: Statutory Minimum Wage rate per day */
	statutoryMinimumWagePerDay?: number;

	/** Box 10: Statutory Minimum Wage rate per month */
	statutoryMinimumWagePerMonth?: number;

	/** Box 11: Minimum Wage Earner (MWE) checkbox */
	isMinimumWageEarner: boolean;

	// ========================================
	// PART II - EMPLOYER INFO (PRESENT)
	// ========================================

	/** Box 12: Present Employer TIN */
	presentEmployerTin: string;

	/** Box 13: Present Employer's Name */
	presentEmployerName: string;

	/** Box 14: Present Employer Registered Address */
	presentEmployerAddress: string;

	/** Box 14A: ZIP Code (Present Employer) */
	presentEmployerZipCode: string;

	/** Box 15: Type of Employer (Main / Secondary) */
	employerType: "MAIN" | "SECONDARY";

	// ========================================
	// PART III - EMPLOYER INFO (PREVIOUS)
	// ========================================

	/** Box 16: Previous Employer TIN */
	previousEmployerTin?: string;

	/** Box 17: Previous Employer's Name */
	previousEmployerName?: string;

	/** Box 18: Previous Employer Registered Address */
	previousEmployerAddress?: string;

	/** Box 18A: ZIP Code (Previous Employer) */
	previousEmployerZipCode?: string;

	// ========================================
	// PART IV-A - SUMMARY
	// ========================================

	/** Box 19: Gross Compensation Income from Present Employer */
	grossCompensationPresentEmployer: number;

	/** Box 20: Total Non-Taxable/Exempt Compensation (Present Employer) */
	totalNonTaxablePresentEmployer: number;

	/** Box 21: Taxable Compensation Income from Present Employer */
	taxableCompensationPresentEmployer: number;

	/** Box 22: Taxable Compensation Income from Previous Employer */
	taxableCompensationPreviousEmployer: number;

	/** Box 23: Gross Taxable Compensation Income */
	grossTaxableCompensation: number;

	/** Box 24: Tax Due */
	taxDue: number;

	/** Box 25: Amount of Taxes Withheld */
	taxesWithheld: number;

	/** Box 25A: Amount of Taxes Withheld – Present Employer */
	taxesWithheldPresentEmployer: number;

	/** Box 25B: Amount of Taxes Withheld – Previous Employer */
	taxesWithheldPreviousEmployer: number;

	/** Box 26: Total Amount of Taxes Withheld as adjusted */
	totalTaxesWithheldAdjusted: number;

	/** Box 27: 5% Tax Credit (PERA Act of 2008) */
	taxCreditPERA: number;

	/** Box 28: Total Taxes Withheld */
	totalTaxesWithheld: number;

	// ========================================
	// PART IV-B A - NON-TAXABLE
	// ========================================

	/** Box 29: Basic Salary (MWE; non-taxable) */
	basicSalaryMWENonTaxable: number;

	/** Box 30: Holiday Pay (MWE) */
	holidayPayMWE: number;

	/** Box 31: Overtime Pay (MWE) */
	overtimePayMWE: number;

	/** Box 32: Night Shift Differential (MWE) */
	nightShiftDifferentialMWE: number;

	/** Box 33: Hazard Pay (MWE) */
	hazardPayMWE: number;

	/** Box 34: 13th Month Pay and Other Benefits (non-taxable up to cap) */
	thirteenthMonthPayNonTaxable: number;

	/** Box 35: De Minimis Benefits */
	deMinimisBenefits: number;

	/** Box 36: SSS, GSIS, PHIC, PAG-IBIG, Union Dues (employee share) */
	contributionsUnionDues: number;

	/** Box 37: Salaries and Other Forms of Compensation (non-taxable) */
	otherNonTaxableCompensation: number;

	/** Box 38: Total Non-Taxable/Exempt Compensation Income */
	totalNonTaxableCompensation: number;

	// ========================================
	// PART IV-B B - TAXABLE REGULAR
	// ========================================

	/** Box 39: Basic Salary (taxable) */
	basicSalaryTaxable: number;

	/** Box 40: Representation */
	representation: number;

	/** Box 41: Transportation */
	transportation: number;

	/** Box 42: Cost of Living Allowance (COLA) */
	cola: number;

	/** Box 43: Fixed Housing Allowance */
	housingAllowance: number;

	/** Box 44: Others (specify) */
	othersDescription?: string;

	/** Box 44A: Others (specify) – line A */
	othersLineA?: string;
	othersAmountA?: number;

	/** Box 44B: Others (specify) – line B */
	othersLineB?: string;
	othersAmountB?: number;

	// ========================================
	// PART IV-B B - SUPPLEMENTARY
	// ========================================

	/** Box 45: Commission */
	commission: number;

	/** Box 46: Profit Sharing */
	profitSharing: number;

	/** Box 47: Fees Including Director's Fees */
	fees: number;

	/** Box 48: Taxable 13th Month Benefits (excess) */
	thirteenthMonthPayTaxable: number;

	/** Box 49: Hazard Pay (taxable) */
	hazardPayTaxable: number;

	/** Box 50: Overtime Pay (taxable) */
	overtimePayTaxable: number;

	/** Box 51: Others (specify) */
	supplementaryOthersDescription?: string;

	/** Box 51A: Others – amount line A */
	supplementaryOthersLineA?: string;
	supplementaryOthersAmountA?: number;

	/** Box 51B: Others – amount line B */
	supplementaryOthersLineB?: string;
	supplementaryOthersAmountB?: number;

	/** Box 52: Total Taxable Compensation Income */
	totalTaxableCompensation: number;

	// ========================================
	// SIGNATURES
	// ========================================

	/** Box 53: Present Employer/Authorized Agent – Signature over Printed Name */
	employerSignatory: string;
	employerSignatoryTitle?: string;
	employerSignatureDate?: string;

	/** Box 54: Employee Signature; CTC/Valid ID No.; Place of Issue; Date Signed */
	employeeSignatureDate?: string;
	employeeCTCNo?: string;
	employeeValidIDNo?: string;
	employeeIDType?: string;
	employeeIDPlaceOfIssue?: string;
	employeeIDDateIssued?: string;

	/** Box 55: Employer/Authorized Agent Signature (substituted filing) */
	substitutedFilingSignatory?: string;
	substitutedFilingDate?: string;

	/** Box 56: Employee Signature; Date Signed; Date Issued (ID) (substituted filing) */
	substitutedFilingEmployeeSignatureDate?: string;
	substitutedFilingIDDateIssued?: string;
}

/**
 * Input data for generating BIR Form 2316
 */
export interface BIRForm2316Input {
	// Year and period
	year: number;
	periodFrom?: string;
	periodTo?: string;

	// Employee info
	employee: {
		tin: string;
		lastName: string;
		firstName: string;
		middleName?: string;
		rdoCode: string;
		registeredAddress: string;
		registeredAddressZipCode: string;
		localHomeAddress?: string;
		localHomeAddressZipCode?: string;
		foreignAddress?: string;
		dateOfBirth: string;
		contactNumber: string;
		isMinimumWageEarner?: boolean;
		statutoryMinimumWagePerDay?: number;
		statutoryMinimumWagePerMonth?: number;
		// Signature info
		ctcNo?: string;
		validIDNo?: string;
		idType?: string;
		idPlaceOfIssue?: string;
		idDateIssued?: string;
	};

	// Present employer
	presentEmployer: {
		tin: string;
		name: string;
		address: string;
		zipCode: string;
		type: "MAIN" | "SECONDARY";
		signatory: string;
		signatoryTitle?: string;
	};

	// Previous employer (optional)
	previousEmployer?: {
		tin: string;
		name: string;
		address: string;
		zipCode: string;
	};

	// Compensation from present employer
	compensationPresent: {
		// Non-taxable (MWE)
		basicSalaryMWE?: number;
		holidayPayMWE?: number;
		overtimePayMWE?: number;
		nightShiftDifferentialMWE?: number;
		hazardPayMWE?: number;

		// Non-taxable (General)
		thirteenthMonthPayNonTaxable: number;
		deMinimisBenefits: number;
		contributionsUnionDues: number;
		otherNonTaxable?: number;

		// Taxable - Regular
		basicSalaryTaxable: number;
		representation?: number;
		transportation?: number;
		cola?: number;
		housingAllowance?: number;
		othersA?: { description: string; amount: number };
		othersB?: { description: string; amount: number };

		// Taxable - Supplementary
		commission?: number;
		profitSharing?: number;
		fees?: number;
		thirteenthMonthPayTaxable: number;
		hazardPayTaxable?: number;
		overtimePayTaxable?: number;
		supplementaryOthersA?: { description: string; amount: number };
		supplementaryOthersB?: { description: string; amount: number };
	};

	// Compensation from previous employer (optional)
	compensationPrevious?: {
		taxableIncome: number;
		taxWithheld: number;
	};

	// Tax information
	tax: {
		taxDue: number;
		taxWithheldPresent: number;
		taxWithheldPrevious?: number;
		taxCreditPERA?: number;
	};
}

/**
 * BIR Form 2316 Display Format
 */
export interface BIRForm2316Display {
	formTitle: string;
	header: {
		year: number;
		period: string;
	};
	partI: {
		title: string;
		fields: Array<{ box: string; label: string; value: string | number | boolean }>;
	};
	partII: {
		title: string;
		fields: Array<{ box: string; label: string; value: string | number }>;
	};
	partIII: {
		title: string;
		fields: Array<{ box: string; label: string; value: string | number }>;
	};
	partIVA: {
		title: string;
		fields: Array<{ box: string; label: string; value: number }>;
	};
	partIVBA: {
		title: string;
		fields: Array<{ box: string; label: string; value: number }>;
	};
	partIVBB: {
		title: string;
		fields: Array<{ box: string; label: string; value: number | string }>;
	};
	signatures: {
		employer: string;
		employee: string;
	};
}

/**
 * Validation result
 */
export interface BIRValidationResult {
	isValid: boolean;
	errors: string[];
	warnings: string[];
}
