/**
 * Payroll Period Code Helper
 * Generates unique codes for payroll periods based on start and end dates
 */

/**
 * Generate a payroll period code from start and end dates
 * Format: PP-YYYYMMDD-YYYYMMDD
 * Example: PP-20260101-20260115
 * 
 * @param startDate - Start date of the payroll period
 * @param endDate - End date of the payroll period
 * @returns Generated code string
 */
export function generatePayrollPeriodCode(startDate: Date, endDate: Date): string {
	const formatDate = (date: Date): string => {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}${month}${day}`;
	};

	const startStr = formatDate(startDate);
	const endStr = formatDate(endDate);
	
	return `PP-${startStr}-${endStr}`;
}
