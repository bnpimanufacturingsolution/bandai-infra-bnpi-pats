const normalizeInput = (value: string | null | undefined): string => {
	return String(value || "").trim();
};

export const buildBulkDefaultPassword = (
	lastName: string | null | undefined,
	employeeId: string | null | undefined,
	year = new Date().getFullYear(),
): string => {
	const normalizedLastName = normalizeInput(lastName).toLowerCase().replace(/\s+/g, "");
	const normalizedEmployeeId = normalizeInput(employeeId);
	return `${normalizedLastName}${normalizedEmployeeId}!${year}`;
};

export const buildLegacyBulkDefaultPassword = (
	lastName: string | null | undefined,
	employeeId: string | null | undefined,
	year = new Date().getFullYear(),
): string => {
	const legacyLastName = normalizeInput(lastName).toLowerCase();
	const normalizedEmployeeId = normalizeInput(employeeId);
	return `${legacyLastName}${normalizedEmployeeId}!${year}`;
};

export const buildBulkPasswordCandidates = (
	lastName: string | null | undefined,
	employeeId: string | null | undefined,
	year = new Date().getFullYear(),
): string[] => {
	const primary = buildBulkDefaultPassword(lastName, employeeId, year);
	const legacy = buildLegacyBulkDefaultPassword(lastName, employeeId, year);
	const unique = new Set([primary, legacy]);
	return Array.from(unique);
};
