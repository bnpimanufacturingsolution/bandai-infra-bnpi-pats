const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

export function isValidObjectId(value: string): boolean {
	return OBJECT_ID_REGEX.test(value);
}
