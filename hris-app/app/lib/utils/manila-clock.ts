export const MANILA_TIME_ZONE = "Asia/Manila";

/** Same clock as Device Events: format an instant in Asia/Manila. */
export function formatManilaClockTime(value: string | Date | null | undefined): string {
	if (!value) return "";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return new Intl.DateTimeFormat("en-US", {
		timeZone: MANILA_TIME_ZONE,
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	}).format(date);
}
