/**
 * Convert Employee data to BIR Form 2316 Input
 * Uses the new employee fields (employer, employmentHistory, etc.)
 */

import type { BIRForm2316Input } from "./bir-2316.types";
import { calculatePayroll } from "./tax-calculator.helper";

interface EmployeeData {
	id: string;
	employeeId: string;
	employmentHireDate: Date | null;
	employmentTerminationDate?: Date | null;
	employmentStatus?: string;
	basicSalary: number;
	employer?: {
		name: string;
		tin: string;
		rdoCode: string;
		branchCode: string;
		address: string;
	} | null;
	person?: {
		personalInfo?: {
			firstName?: string | null;
			lastName?: string | null;
			middleName?: string | null;
			dateOfBirth?: string | Date | null;
		} | null;
		contactInfo?: {
			email?: string | null;
			phone?: string | null;
			phones?: Array<{
				number?: string | null;
				isPrimary?: boolean | null;
			}>;
			address?:
				| string
				| Array<{
						street?: string | null;
						address2?: string | null;
						city?: string | null;
						state?: string | null;
						country?: string | null;
						postalCode?: string | null;
						zipCode?: string | null;
						houseNumber?: string | null;
				  }>;
		} | null;
	} | null;
	employmentHistory?: Array<{
		employer: {
			name: string;
			tin: string;
			rdoCode: string;
			branchCode: string;
			address: string;
		};
		startDate: Date;
		endDate?: Date | null;
		salary?: number | null;
	}>;
	employeePayrolls?: Array<{
		basicPay: number;
		overtimePay: number;
		nightDiffPay: number;
		holidayPay: number;
		allowances: number;
		bonuses: number;
		taxAmount: number;
		sssContribution: number;
		philHealthContribution: number;
		pagibigContribution: number;
		grossPay: number;
		createdAt: Date;
	}>;
	documents?: Array<{
		type: string;
		number: string;
		issueDate?: Date;
		expiryDate?: Date | null;
		fileUrl?: string | null;
	}>;
}

/**
 * Convert Employee data to BIR Form 2316 Input
 */
export function convertEmployeeToBIR2316Input(
	employee: EmployeeData,
	year: number,
): BIRForm2316Input {
	const personalInfo = employee.person?.personalInfo || {};
	const contactInfo = employee.person?.contactInfo || {};
	const currentEmployer = employee.employer;

	// Extract employee name
	const firstName = personalInfo.firstName || "";
	const lastName = personalInfo.lastName || "";
	const middleName = personalInfo.middleName || "";

	// Extract address (use contactInfo address or default)
	let address = "";
	if (typeof contactInfo.address === "string") {
		address = contactInfo.address;
	} else if (Array.isArray(contactInfo.address) && contactInfo.address.length > 0) {
		const primaryAddress = contactInfo.address[0];
		address = [
			primaryAddress.houseNumber,
			primaryAddress.street,
			primaryAddress.address2,
			primaryAddress.city,
			primaryAddress.state,
			primaryAddress.country,
			primaryAddress.zipCode || primaryAddress.postalCode,
		]
			.filter(Boolean)
			.join(" ");
	}
	// Extract ZIP code from address (simple extraction, adjust as needed)
	const zipCode = extractZipCode(address);

	// Calculate period from hire date
	// If hire date is null, default to start of the year
	const employmentHireDate = employee.employmentHireDate 
		? new Date(employee.employmentHireDate)
		: new Date(year, 0, 1);
	const periodStart =
		employmentHireDate.getFullYear() === year ? employmentHireDate : new Date(year, 0, 1);
	const periodEnd =
		employmentHireDate.getFullYear() === year && employee.employmentStatus !== "TERMINATED"
			? new Date(year, 11, 31)
			: employee.employmentTerminationDate &&
				  new Date(employee.employmentTerminationDate).getFullYear() === year
				? new Date(employee.employmentTerminationDate)
				: new Date(year, 11, 31);

	const periodFrom = formatDateMMDD(periodStart);
	const periodTo = formatDateMMDD(periodEnd);

	// Calculate months worked in the year
	const monthsWorked = calculateMonthsWorked(periodStart, periodEnd);

	// Aggregate payroll data for the year
	const payrollData = aggregatePayrollData(employee.employeePayrolls || [], year);

	// Calculate annual compensation
	const annualBasicSalary = payrollData.totalBasicPay || employee.basicSalary * monthsWorked;
	const annualOvertime = payrollData.totalOvertimePay;
	const annualHolidayPay = payrollData.totalHolidayPay;
	const annualNightDiff = payrollData.totalNightDiffPay;
	const annualAllowances = payrollData.totalAllowances;
	const annualBonuses = payrollData.totalBonuses;

	// 13th month pay (typically equal to one month's basic salary)
	const thirteenthMonthPay = employee.basicSalary;

	// Calculate non-taxable 13th month (first 90,000 is tax-free)
	const nonTaxable13th = Math.min(thirteenthMonthPay + annualBonuses, 90000);
	const taxable13th = Math.max(thirteenthMonthPay + annualBonuses - 90000, 0);

	// Calculate contributions
	const monthlyPayroll = calculatePayroll(employee.basicSalary);
	const annualSSS = payrollData.totalSSS || monthlyPayroll.contributions.sss * monthsWorked;
	const annualPhilHealth =
		payrollData.totalPhilHealth || monthlyPayroll.contributions.philHealth * monthsWorked;
	const annualPagIBIG =
		payrollData.totalPagIBIG || monthlyPayroll.contributions.pagIbig * monthsWorked;
	const totalContributions = annualSSS + annualPhilHealth + annualPagIBIG;

	// Calculate taxable compensation
	const grossCompensation =
		annualBasicSalary + thirteenthMonthPay + annualBonuses + annualAllowances;
	const taxableCompensation = grossCompensation - totalContributions - nonTaxable13th;

	// Calculate tax
	const annualTaxWithheld = payrollData.totalTax || monthlyPayroll.withholdingTax * monthsWorked;
	const monthlyTaxableIncome = taxableCompensation / 12;
	const monthlyTax = monthlyPayroll.withholdingTax;
	const annualTaxDue = monthlyTax * monthsWorked;

	// Get previous employer from employment history
	// DISABLED: Not showing previous employer for now, even if employment history exists
	// const previousEmployer = getPreviousEmployerForYear(employee.employmentHistory || [], year);
	const previousEmployer = null; // Temporarily disabled

	// Build BIR Form 2316 Input
	const input: BIRForm2316Input = {
		year,
		periodFrom,
		periodTo,

		// Employee info
		employee: {
			tin: extractTinFromDocuments(employee.documents),
			lastName: lastName.toUpperCase(),
			firstName: firstName.toUpperCase(),
			middleName: middleName ? middleName.toUpperCase() : undefined,
			rdoCode: currentEmployer?.rdoCode || "",
			registeredAddress: address,
			registeredAddressZipCode: zipCode,
			localHomeAddress: address,
			localHomeAddressZipCode: zipCode,
			dateOfBirth:
				personalInfo.dateOfBirth instanceof Date
					? formatDateMMDDYYYY(personalInfo.dateOfBirth)
					: typeof personalInfo.dateOfBirth === "string"
						? personalInfo.dateOfBirth
						: "",
			contactNumber:
				contactInfo.phone ||
				contactInfo.phones?.find((p) => p.isPrimary)?.number ||
				contactInfo.phones?.[0]?.number ||
				"",
			isMinimumWageEarner: employee.basicSalary <= 25000, // Approximate minimum wage threshold
		},

		// Present employer
		presentEmployer: {
			tin: currentEmployer?.tin || "",
			name: currentEmployer?.name || "",
			address: currentEmployer?.address || "",
			zipCode: extractZipCode(currentEmployer?.address || ""),
			type: "MAIN",
			signatory: "Authorized Signatory",
			signatoryTitle: "HR Manager",
		},

		// Previous employer (if applicable) - DISABLED for now
		// Even if employment history exists, we're not showing previous employer
		previousEmployer: undefined,

		// Compensation from present employer (Part IV - Present Employer)
		compensationPresent: {
			// Non-taxable
			thirteenthMonthPayNonTaxable: roundAmount(nonTaxable13th),
			deMinimisBenefits: 0, // TODO: Calculate from benefits data
			contributionsUnionDues: roundAmount(totalContributions),
			otherNonTaxable: 0,

			// Taxable - Regular
			basicSalaryTaxable: roundAmount(annualBasicSalary),
			transportation: roundAmount(annualAllowances * 0.3), // Estimate
			cola: roundAmount(annualAllowances * 0.2), // Estimate
			housingAllowance: roundAmount(annualAllowances * 0.5), // Estimate

			// Taxable - Supplementary
			thirteenthMonthPayTaxable: roundAmount(taxable13th),
			overtimePayTaxable: roundAmount(annualOvertime),
			hazardPayTaxable: roundAmount(annualNightDiff),
		},

		// Compensation from previous employer (if applicable) - DISABLED
		compensationPrevious: undefined,

		// Tax information (Part IV - Tax)
		tax: {
			taxDue: roundAmount(annualTaxDue),
			taxWithheldPresent: roundAmount(annualTaxWithheld),
			taxWithheldPrevious: 0,
		},
	};

	return input;
}

/**
 * Helper functions
 */

/**
 * Extract TIN number from employee documents
 * Returns empty string if TIN document not found
 */
function extractTinFromDocuments(
	documents?: Array<{
		type: string;
		number: string;
		issueDate?: Date;
		expiryDate?: Date | null;
		fileUrl?: string | null;
	}>,
): string {
	if (!documents || !Array.isArray(documents)) return "";

	const tinDoc = documents.find(
		(doc) => doc.type === "TIN" || doc.type === "tin_id" || doc.type?.toLowerCase() === "tin",
	);

	return tinDoc?.number || "";
}

function formatDateMMDD(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${month}${day}`;
}

function formatDateMMDDYYYY(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const year = date.getFullYear();
	return `${month}${day}${year}`;
}

function extractZipCode(address: string): string {
	// Simple extraction - looks for 4-digit zip code pattern
	const zipMatch = address.match(/\b\d{4}\b/);
	return zipMatch ? zipMatch[0] : "0000";
}

function calculateMonthsWorked(startDate: Date, endDate: Date): number {
	const start = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
	const end = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
	const months =
		(end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
	return Math.max(1, months);
}

function aggregatePayrollData(
	payrolls: EmployeeData["employeePayrolls"],
	year: number,
): {
	totalBasicPay: number;
	totalOvertimePay: number;
	totalHolidayPay: number;
	totalNightDiffPay: number;
	totalAllowances: number;
	totalBonuses: number;
	totalTax: number;
	totalSSS: number;
	totalPhilHealth: number;
	totalPagIBIG: number;
} {
	const yearPayrolls =
		payrolls?.filter((p) => {
			const payrollYear = new Date(p.createdAt).getFullYear();
			return payrollYear === year;
		}) || [];

	return {
		totalBasicPay: yearPayrolls.reduce((sum, p) => sum + (p.basicPay || 0), 0),
		totalOvertimePay: yearPayrolls.reduce((sum, p) => sum + (p.overtimePay || 0), 0),
		totalHolidayPay: yearPayrolls.reduce((sum, p) => sum + (p.holidayPay || 0), 0),
		totalNightDiffPay: yearPayrolls.reduce((sum, p) => sum + (p.nightDiffPay || 0), 0),
		totalAllowances: yearPayrolls.reduce((sum, p) => sum + (p.allowances || 0), 0),
		totalBonuses: yearPayrolls.reduce((sum, p) => sum + (p.bonuses || 0), 0),
		totalTax: yearPayrolls.reduce((sum, p) => sum + (p.taxAmount || 0), 0),
		totalSSS: yearPayrolls.reduce((sum, p) => sum + (p.sssContribution || 0), 0),
		totalPhilHealth: yearPayrolls.reduce((sum, p) => sum + (p.philHealthContribution || 0), 0),
		totalPagIBIG: yearPayrolls.reduce((sum, p) => sum + (p.pagibigContribution || 0), 0),
	};
}

function roundAmount(amount: number): number {
	return Math.round(amount * 100) / 100;
}

function getPreviousEmployerForYear(
	employmentHistory: EmployeeData["employmentHistory"],
	year: number,
): NonNullable<EmployeeData["employmentHistory"]>[0] | null {
	if (!employmentHistory || employmentHistory.length === 0) return null;

	// Find the most recent previous employer that ended before or during the year
	const previousEmployers = employmentHistory
		.filter((eh) => {
			if (!eh.endDate) return false;
			const endYear = new Date(eh.endDate).getFullYear();
			return endYear <= year;
		})
		.sort((a, b) => {
			const dateA = a.endDate ? new Date(a.endDate).getTime() : 0;
			const dateB = b.endDate ? new Date(b.endDate).getTime() : 0;
			return dateB - dateA; // Most recent first
		});

	return previousEmployers.length > 0 ? previousEmployers[0] : null;
}
