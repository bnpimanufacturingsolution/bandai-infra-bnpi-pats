export interface DefaultLeaveBalanceEntry {
	leaveType: "VACATION" | "SICK" | "PERSONAL";
	totalEntitled: number;
	used: number;
	pending: number;
	available: number;
	carriedOver: null;
	maxCarryOver: null;
	periodStart: Date;
	periodEnd: Date;
}

export function createDefaultLeaveBalances(forDate: Date = new Date()): DefaultLeaveBalanceEntry[] {
	const currentYear = forDate.getFullYear();
	const periodStart = new Date(currentYear, 0, 1);
	const periodEnd = new Date(currentYear, 11, 31);

	return [
		{
			leaveType: "VACATION",
			totalEntitled: 15,
			used: 0,
			pending: 0,
			available: 15,
			carriedOver: null,
			maxCarryOver: null,
			periodStart,
			periodEnd,
		},
		{
			leaveType: "SICK",
			totalEntitled: 10,
			used: 0,
			pending: 0,
			available: 10,
			carriedOver: null,
			maxCarryOver: null,
			periodStart,
			periodEnd,
		},
		{
			leaveType: "PERSONAL",
			totalEntitled: 5,
			used: 0,
			pending: 0,
			available: 5,
			carriedOver: null,
			maxCarryOver: null,
			periodStart,
			periodEnd,
		},
	];
}

export function ensureDefaultLeaveBalances<T extends { leaveBalances?: unknown; leaveBalancesLastUpdated?: Date | null }>(
	employeeData: T,
	forDate: Date = new Date(),
): T & {
	leaveBalances: DefaultLeaveBalanceEntry[] | unknown;
	leaveBalancesLastUpdated?: Date | null;
} {
	const existingLeaveBalances = Array.isArray(employeeData.leaveBalances)
		? employeeData.leaveBalances
		: [];

	if (existingLeaveBalances.length > 0) {
		return {
			...employeeData,
			leaveBalances: existingLeaveBalances,
		};
	}

	return {
		...employeeData,
		leaveBalances: createDefaultLeaveBalances(forDate),
		leaveBalancesLastUpdated: new Date(),
	};
}
