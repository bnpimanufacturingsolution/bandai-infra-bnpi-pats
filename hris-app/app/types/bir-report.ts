// BIR Form 2316 - Certificate of Compensation Payment/Tax Withheld Types

export interface BIR2316EmployeeInfo {
	tin: string; // REQUIRED
	lastName: string; // REQUIRED
	firstName: string; // REQUIRED
	middleName?: string;
	address: {
		street: string; // REQUIRED
		city: string; // REQUIRED
		province: string; // REQUIRED
		zipCode: string; // REQUIRED
	};
	birthDate: string; // REQUIRED
	civilStatus?: "Single" | "Married" | "Widowed" | "Separated" | "Divorced"; // REQUIRED
	contactNumber?: string; // REQUIRED
	qualifiedDependents?: number; // Number of qualified dependents
	zipCode?: string;
}

export interface BIR2316EmployerInfo {
	tin: string; // REQUIRED
	name: string; // REQUIRED
	address: {
		street: string; // REQUIRED
		city: string; // REQUIRED
		province: string; // REQUIRED
		zipCode: string; // REQUIRED
	};
	rdoCode: string; // REQUIRED - Revenue District Office Code
	lineOfBusiness?: string; // Line of business
	zipCode?: string;
}

export interface BIR2316MonthlyData {
	month: string; // REQUIRED
	basicSalary: number; // REQUIRED
	overtime: number; // REQUIRED
	holiday: number; // REQUIRED
	nightDifferential: number; // REQUIRED
	allowances: number; // REQUIRED
	bonuses: number; // REQUIRED
	commissions: number; // REQUIRED
	taxable13thMonth: number; // REQUIRED
	otherTaxable: number; // REQUIRED
	grossCompensation: number; // REQUIRED - Total gross compensation
	nonTaxable13thMonth: number; // REQUIRED - Non-taxable portion (up to 90,000)
	deMinimisBenefits: number; // REQUIRED - De minimis benefits exempt from tax
	otherNonTaxableCompensation?: number; // Other non-taxable compensation
	taxableCompensation: number; // REQUIRED - Taxable compensation income
	taxWithheld: number; // REQUIRED - Tax withheld for the month
}

export interface BIR2316AnnualSummary {
	totalGrossCompensation: number; // REQUIRED
	totalNonTaxable13thMonth: number; // REQUIRED - Total non-taxable 13th month and other benefits
	totalDeMinimisBenefits: number; // REQUIRED
	totalOtherNonTaxableCompensation?: number; // Other non-taxable compensation
	totalTaxableCompensation: number; // REQUIRED - Total taxable compensation income
	totalTaxWithheld: number; // REQUIRED - Total tax withheld for the year
	totalPremiumPayOnRetirement?: number; // Premium pay on retirement
	taxDue?: number; // Computed tax due
	overWithholding?: number; // Over withholding amount
	underWithholding?: number; // Under withholding amount
}

export interface BIR2316PreviousEmployer {
	tin?: string; // Previous employer TIN
	name?: string; // Previous employer name
	totalCompensation?: number; // Total compensation from previous employer
	totalTaxWithheld?: number; // Total tax withheld by previous employer
}

export interface BIR2316Data {
	employee: BIR2316EmployeeInfo; // REQUIRED
	employer: BIR2316EmployerInfo; // REQUIRED
	year: number; // REQUIRED - Tax year
	monthlyData: BIR2316MonthlyData[]; // REQUIRED - Monthly breakdown (12 months)
	annualSummary: BIR2316AnnualSummary; // REQUIRED
	previousEmployer?: BIR2316PreviousEmployer; // Previous employer info if applicable
	substitutedFiling?: boolean; // Whether employee qualifies for substituted filing
	dateGenerated: string; // REQUIRED - Date when form was generated
	preparedBy?: string; // Person who prepared the form
	preparedByTitle?: string; // Title of person who prepared
	approvedBy?: string; // REQUIRED - Employer's authorized representative
	approvedByTitle?: string; // Title of authorized representative
	employeeSignature?: string; // Employee signature (if available)
	employeeSignatureDate?: string; // Date employee signed
}
