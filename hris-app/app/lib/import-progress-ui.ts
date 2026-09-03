export type ImportProgressTiming = {
	startedAt?: string;
	completedAt?: string;
	durationMs?: number;
} | null | undefined;

export function shortenImportError(error: string, maxLength: number = 80): string {
	const line =
		error.split("\n").find((entry) => entry.includes("Error") || entry.includes("Invalid")) ||
		error.split("\n")[0];

	return line.length > maxLength ? `${line.slice(0, maxLength)}...` : line;
}

export function parseImportDateMs(value?: string | null): number | null {
	if (!value) return null;
	const ms = new Date(value).getTime();
	return Number.isFinite(ms) ? ms : null;
}

export function formatImportDateTime(value?: string | null): string {
	const ms = parseImportDateMs(value);
	if (ms === null) return "-";
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		second: "2-digit",
	}).format(new Date(ms));
}

export function formatElapsedImportTime(ms?: number | null): string {
	if (!ms || ms < 0) return "-";
	if (ms < 1000) return `${ms}ms`;

	const totalSeconds = Math.round(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;

	if (minutes === 0) return `${seconds}s`;
	if (minutes < 60) return `${minutes}m ${seconds}s`;

	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	return `${hours}h ${remainingMinutes}m`;
}

export function getImportProgressElapsedMs(
	progress: ImportProgressTiming,
	nowMs: number = Date.now(),
): number | null {
	if (typeof progress?.durationMs === "number") return progress.durationMs;

	const startedAtMs = parseImportDateMs(progress?.startedAt);
	if (startedAtMs === null) return null;

	return (parseImportDateMs(progress?.completedAt) ?? nowMs) - startedAtMs;
}
