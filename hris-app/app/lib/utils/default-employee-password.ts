export const buildDefaultEmployeePassword = (
	lastName: string | null | undefined,
	employeeId: string | null | undefined,
	year = new Date().getFullYear(),
): string => {
	const normalizedLastName = String(lastName || "")
		.trim()
		.toLowerCase()
		.replace(/\s+/g, "");
	const normalizedEmployeeId = String(employeeId || "").trim();
	return `${normalizedLastName}${normalizedEmployeeId}!${year}`;
};
