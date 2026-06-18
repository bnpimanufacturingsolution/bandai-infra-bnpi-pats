export type CandidateType = "PROMOTION" | "REGULARIZATION" | "TERMINATION" | "TRANSFER";

export interface EligibilityResult {
	isEligible: boolean;
	type?: CandidateType;
	reason?: string;
}

export const checkEligibility = (employee: any): EligibilityResult => {
	const now = new Date();
	const hireDate = new Date(employee.employmentHireDate);
	const monthsTenure =
		(now.getFullYear() - hireDate.getFullYear()) * 12 + (now.getMonth() - hireDate.getMonth());

	// 1. Regularization Check
	// Logic: Probationary employees approaching 6 months (e.g., within 1 month of probation end)
	if (employee.employmentType === "PROBATIONARY") {
		const probationEndDate = employee.probationEndDate
			? new Date(employee.probationEndDate)
			: null;

		// If no probation end date, assume 6 months from hire
		const targetRegularizationDate =
			probationEndDate || new Date(hireDate.setMonth(hireDate.getMonth() + 6));

		const oneMonthBefore = new Date(targetRegularizationDate);
		oneMonthBefore.setMonth(oneMonthBefore.getMonth() - 1);

		if (now >= oneMonthBefore) {
			return {
				isEligible: true,
				type: "REGULARIZATION",
				reason: "Approaching end of probation period (6 months)",
			};
		}
	}

	// 2. Promotion Check
	// Logic: Regular employees with > 18 months tenure
	// Note: In a real scenario, we would also check performance ratings if available in the Employee model.
	if (employee.employmentType === "REGULAR" && monthsTenure >= 18) {
		return {
			isEligible: true,
			type: "PROMOTION",
			reason: `Tenure > 1.5 years (${monthsTenure} months) - Review for promotion`,
		};
	}

	// 3. Termination Check
	// Logic: Requires specific attendance/violation data which is not currently available in the lightweight employee list.
	// We strictly avoid mocking this actionable status.

	// 4. Transfer Check
	// Logic: Requires specific request or business logic.

	return { isEligible: false };
};
