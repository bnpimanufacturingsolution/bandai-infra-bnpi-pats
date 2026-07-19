export type DeviceEventSearchTerms = {
	raw: string;
	literalContains: string;
	literalPrefix: string;
	exactCandidates: string[];
};

/**
 * PostgreSQL LIKE/ILIKE treats %, _ and the escape character as syntax. Device
 * event search is an operator-facing literal search, so those characters must
 * be escaped before the pattern is passed through Prisma's tagged template.
 */
export const escapePostgresLikeLiteral = (value: string) =>
	value.replace(/[\\%_]/g, (character) => `\\${character}`);

export const buildDeviceEventSearchTerms = (value: unknown): DeviceEventSearchTerms => {
	const raw = String(value || "").trim();
	const escaped = escapePostgresLikeLiteral(raw);
	const exactCandidates = [raw];

	if (/^\d+$/.test(raw)) {
		const stripped = raw.replace(/^0+/, "") || "0";
		exactCandidates.push(stripped, stripped.padStart(5, "0"));
	}

	return {
		raw,
		literalContains: `%${escaped}%`,
		literalPrefix: `${escaped}%`,
		exactCandidates: [...new Set(exactCandidates.filter(Boolean))],
	};
};
