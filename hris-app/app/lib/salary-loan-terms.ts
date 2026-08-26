export interface SalaryLoanTerms {
	total: number;
	monthly: number;
	end: string;
}

/**
 * BNPI salary-loan term math: simple annual interest pro-rated by term.
 * total = principal * (1 + rate% * term/12); monthly = total / term.
 */
export function computeSalaryLoanTerms(
	principal: number,
	annualRatePercent: number,
	termMonths: number,
	startDate: string,
): SalaryLoanTerms {
	const safePrincipal = Number(principal) || 0;
	const safeTerm = Math.max(0, Math.floor(Number(termMonths) || 0));
	const total =
		Math.round(safePrincipal * (1 + (Number(annualRatePercent) / 100) * (safeTerm / 12)) * 100) /
		100;
	const monthly = safeTerm > 0 ? Math.round((total / safeTerm) * 100) / 100 : 0;
	let end = "";
	if (startDate && safeTerm > 0 && !Number.isNaN(new Date(startDate).getTime())) {
		const endDate = new Date(startDate);
		endDate.setMonth(endDate.getMonth() + safeTerm);
		end = endDate.toISOString().slice(0, 10);
	}
	return { total, monthly, end };
}
