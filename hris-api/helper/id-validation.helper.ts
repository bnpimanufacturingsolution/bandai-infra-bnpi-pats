const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const CUID_REGEX = /^c[a-z0-9]{8,}$/;
const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidEntityId = (value: unknown): boolean => {
	if (typeof value !== "string") return false;
	const trimmed = value.trim();
	if (!trimmed) return false;
	return OBJECT_ID_REGEX.test(trimmed) || CUID_REGEX.test(trimmed) || UUID_REGEX.test(trimmed);
};

