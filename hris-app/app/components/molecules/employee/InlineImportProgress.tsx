import { useEffect, useRef, useState } from "react";
import { Progress } from "~/components/ui/progress";
import { CheckCircle, XCircle, AlertCircle, Loader2, FileText, Download } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import {
	formatElapsedImportTime,
	formatImportDateTime,
	getImportProgressElapsedMs,
	shortenImportError,
} from "~/lib/import-progress-ui";

interface ImportProgressLogEntry {
	row: number;
	employeeId: string;
	fullName?: string;
	success: boolean;
	message?: string;
	createdAt?: string;
}

interface CredentialExportEntry {
	row?: number;
	employeeId: string;
	fullName?: string;
	email: string;
	userName: string;
	password: string;
	role: string;
}

interface InlineImportProgressProps {
	progress: {
		jobId: string;
		status: "processing" | "completed" | "failed";
		total: number;
		processed: number;
		success: number;
		failed: number;
		created?: number;
		updated?: number;
		skipped?: number;
		blocked?: number;
		errors?: Array<{
			row: number;
			employeeId: string;
			error: string;
		}>;
		warnings?: Array<{
			row?: number;
			employeeId: string;
			stage: string;
			message: string;
		}>;
		recentLog?: ImportProgressLogEntry[];
		credentialExports?: CredentialExportEntry[];
		startedAt?: string;
		completedAt?: string;
		durationMs?: number;
	} | null;
	/** True while waiting for first progress response (job started, polling) */
	isLoading?: boolean;
	loadingLabel?: string;
	/** When true, show live activity log (employee import). When false, keep compact (attendance). */
	showLiveLog?: boolean;
	autoDownloadCredentialsOnSuccess?: boolean;
}

function downloadCredentialExports(entries: CredentialExportEntry[]) {
	if (entries.length === 0) return;

	const escapeCsvValue = (value: string | number | undefined) => {
		const stringValue = value === undefined ? "" : String(value);
		if (/[",\n]/.test(stringValue)) {
			return `"${stringValue.replace(/"/g, '""')}"`;
		}
		return stringValue;
	};

	const headers = ["ROW", "EMPLOYEE_ID", "FULL_NAME", "EMAIL", "USERNAME", "PASSWORD", "ROLE"];
	const lines = [
		headers.join(","),
		...entries.map((entry) =>
			[
				entry.row ?? "",
				entry.employeeId,
				entry.fullName || "",
				entry.email,
				entry.userName,
				entry.password,
				entry.role,
			]
				.map(escapeCsvValue)
				.join(","),
		),
	];

	const now = new Date();
	const pad = (value: number) => String(value).padStart(2, "0");
	const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}`;
	const encoder = new TextEncoder();
	const utf8Bytes = encoder.encode(lines.join("\n"));
	const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
	const csvBytes = new Uint8Array(bom.length + utf8Bytes.length);
	csvBytes.set(bom, 0);
	csvBytes.set(utf8Bytes, bom.length);

	const blob = new Blob([csvBytes], { type: "text/csv;charset=utf-8" });
	const url = window.URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = `employee-login-credentials-${timestamp}.csv`;
	link.click();
	window.URL.revokeObjectURL(url);
}

function getEmployeeDisplayName(
	employeeId: string,
	credentialExports: CredentialExportEntry[],
): string | null {
	const match = credentialExports.find((entry) => entry.employeeId === employeeId);
	return match?.fullName?.trim() || null;
}

function StatTile({
	label,
	value,
	tone = "neutral",
	detail,
}: {
	label: string;
	value: number | string;
	tone?: "neutral" | "success" | "warning" | "danger";
	detail?: string;
}) {
	const valueClass =
		tone === "success"
			? "text-green-700"
			: tone === "warning"
				? "text-amber-700"
				: tone === "danger"
					? "text-red-700"
					: "text-slate-900";

	return (
		<div className="min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2">
			<div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
				{label}
			</div>
			<div className={`mt-1 truncate text-lg font-semibold ${valueClass}`}>{value}</div>
			{detail ? (
				<div className="mt-0.5 truncate text-[11px] text-slate-500">{detail}</div>
			) : null}
		</div>
	);
}

export function InlineImportProgress({
	progress,
	isLoading,
	loadingLabel = "Starting import...",
	showLiveLog = false,
	autoDownloadCredentialsOnSuccess = false,
}: InlineImportProgressProps) {
	const downloadedCredentialJobIdsRef = useRef<Set<string>>(new Set());
	const [downloadedCredentialJobId, setDownloadedCredentialJobId] = useState<string | null>(null);
	const total = progress?.total || 1;
	const percentage = progress ? Math.round((progress.processed / total) * 100) : 0;
	const remaining = progress ? Math.max(progress.total - progress.processed, 0) : 0;
	const created = progress?.created ?? 0;
	const updated = progress?.updated ?? 0;
	const skipped = progress?.skipped ?? 0;
	const blocked = progress?.blocked ?? progress?.failed ?? 0;
	const exceptionCount = skipped + blocked;
	const elapsedMs = getImportProgressElapsedMs(progress);
	const hasErrors = !!(progress?.errors && progress.errors.length > 0);
	const hasWarnings = !!(progress?.warnings && progress.warnings.length > 0);
	const credentialExports = progress?.credentialExports || [];
	const canDownloadCredentials =
		!!progress &&
		(progress.status === "completed" || progress.status === "failed") &&
		credentialExports.length > 0;
	const isProcessing = progress?.status === "processing";
	const isSuccessfulCompletion =
		progress?.status === "completed" &&
		(progress.failed ?? 0) === 0 &&
		(progress.errors?.length ?? 0) === 0;
	const hasFinishedWithIssues =
		!!progress &&
		progress.status !== "processing" &&
		((progress.failed ?? 0) > 0 || (progress.errors?.length ?? 0) > 0);
	const issueCount = Math.max(
		progress?.failed ?? 0,
		progress?.blocked ?? 0,
		progress?.errors?.length ?? 0,
	);
	const credentialDownloadComplete =
		!!progress?.jobId && downloadedCredentialJobId === progress.jobId;

	useEffect(() => {
		if (!autoDownloadCredentialsOnSuccess || !progress?.jobId) return;
		if (!isSuccessfulCompletion || credentialExports.length === 0) return;
		if (downloadedCredentialJobIdsRef.current.has(progress.jobId)) return;

		downloadedCredentialJobIdsRef.current.add(progress.jobId);
		downloadCredentialExports(credentialExports);
		setDownloadedCredentialJobId(progress.jobId);
	}, [
		autoDownloadCredentialsOnSuccess,
		credentialExports,
		isSuccessfulCompletion,
		progress?.jobId,
	]);

	const handleDownloadCredentials = () => {
		if (!progress?.jobId || credentialExports.length === 0) return;
		downloadCredentialExports(credentialExports);
		downloadedCredentialJobIdsRef.current.add(progress.jobId);
		setDownloadedCredentialJobId(progress.jobId);
	};

	// Loading: job started but no progress data yet (e.g. first poll in flight)
	if (isLoading && !progress) {
		return (
			<div className="space-y-3">
				<div className="space-y-3 rounded-lg border border-orange-200 bg-orange-50 p-4">
					<div className="flex items-center justify-between text-sm">
						<span className="font-medium text-orange-900 flex items-center gap-2">
							<Loader2 className="h-4 w-4 animate-spin" />
							{loadingLabel}
						</span>
						<span className="text-orange-700">0%</span>
					</div>
					<div className="h-2 w-full overflow-hidden rounded-full bg-orange-100">
						<div className="h-full w-1/3 animate-pulse rounded-full bg-orange-500" />
					</div>
					<p className="text-xs text-orange-700">Fetching progress...</p>
				</div>
			</div>
		);
	}

	if (!progress) return null;

	return (
		<div className="space-y-3">
			<div
				className={`space-y-3 rounded-lg border p-4 ${
					isProcessing
						? "border-orange-200 bg-orange-50"
						: hasFinishedWithIssues
							? "border-amber-200 bg-amber-50"
							: "border-emerald-200 bg-emerald-50"
				}`}>
				<div className="flex items-center justify-between text-sm">
					<span
						className={`font-medium ${
							isProcessing
								? "text-orange-900"
								: hasFinishedWithIssues
									? "text-amber-900"
									: "text-emerald-900"
						}`}>
						{progress.status === "processing" ? (
							<>
								<Loader2 className="h-3.5 w-3.5 animate-spin inline-block mr-1.5 align-middle" />
								Processing {progress.processed} of {progress.total} records
							</>
						) : hasFinishedWithIssues ? (
							<>
								<AlertCircle className="mr-1.5 inline-block h-3.5 w-3.5 align-middle" />
								Import finished with issues
							</>
						) : (
							<>
								<CheckCircle className="mr-1.5 inline-block h-3.5 w-3.5 align-middle" />
								Import completed
							</>
						)}
					</span>
					<span
						className={`font-semibold ${
							isProcessing
								? "text-orange-900"
								: hasFinishedWithIssues
									? "text-amber-900"
									: "text-emerald-900"
						}`}>
						{percentage}%
					</span>
				</div>

				{isProcessing ? (
					<div className="h-2 w-full overflow-hidden rounded-full bg-orange-100">
						<div
							className="h-full rounded-full bg-orange-500 transition-all duration-300 ease-in-out"
							style={{ width: `${percentage}%` }}
						/>
					</div>
				) : (
					<Progress value={percentage} className="h-2" />
				)}

				<div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
					<StatTile
						label="Processed"
						value={`${progress.processed}/${progress.total}`}
						detail={`${remaining} remaining`}
					/>
					<StatTile
						label="Imported"
						value={progress.success}
						tone="success"
						detail={`${created} created, ${updated} updated`}
					/>
					<StatTile
						label="Exceptions"
						value={exceptionCount}
						tone={blocked > 0 ? "danger" : skipped > 0 ? "warning" : "neutral"}
						detail={`${blocked} blocked, ${skipped} skipped`}
					/>
				</div>

				<div className="grid gap-2 text-xs sm:grid-cols-3">
					<div className="min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2">
						<div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
							Started
						</div>
						<div className="mt-1 truncate font-medium text-slate-900">
							{formatImportDateTime(progress.startedAt)}
						</div>
					</div>
					<div className="min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2">
						<div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
							Elapsed
						</div>
						<div className="mt-1 truncate font-medium text-slate-900">
							{formatElapsedImportTime(elapsedMs)}
						</div>
					</div>
					<div className="min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2">
						<div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
							Completed
						</div>
						<div className="mt-1 truncate font-medium text-slate-900">
							{formatImportDateTime(progress.completedAt)}
						</div>
					</div>
				</div>

				{progress.status !== "processing" && (
					<div
						className={`rounded-md border bg-white px-3 py-2 text-center text-sm font-medium ${
							hasFinishedWithIssues
								? "border-amber-200 text-amber-800"
								: "border-emerald-200 text-emerald-700"
						}`}>
						{hasFinishedWithIssues
							? `Finished. ${progress.success} finalized; ${issueCount} blocked; ${skipped} skipped.`
							: `Done. ${progress.success} record${progress.success === 1 ? "" : "s"} finalized.`}
					</div>
				)}

				{canDownloadCredentials && (
					<div className="flex flex-col gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
						<div className="min-w-0 text-sm">
							<div className="font-medium text-gray-900">
								{credentialDownloadComplete
									? "Credentials CSV downloaded"
									: "Credentials CSV ready"}
							</div>
							<div className="text-xs text-gray-500">
								{credentialExports.length} account
								{credentialExports.length === 1 ? "" : "s"} included
							</div>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="shrink-0 gap-2"
							onClick={handleDownloadCredentials}>
							{credentialDownloadComplete ? (
								<CheckCircle className="h-4 w-4" />
							) : (
								<Download className="h-4 w-4" />
							)}
							{credentialDownloadComplete ? "Download again" : "Download credentials"}
						</Button>
					</div>
				)}
			</div>

			{/* Live activity log (employee import): what's being added / failed */}
			{showLiveLog && progress.recentLog && progress.recentLog.length > 0 && (
				<div className="rounded-xl border border-orange-200 bg-orange-50/60 p-4 space-y-2">
					<div className="flex items-center gap-2 text-sm font-medium text-orange-900">
						<FileText className="h-4 w-4 text-orange-600" />
						Live activity
					</div>
					<div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-orange-100 bg-white p-2 text-xs custom-scrollbar">
						{[...progress.recentLog].reverse().map((entry, idx) => (
							<div
								key={`${entry.row}-${entry.employeeId}-${idx}`}
								className="flex items-start gap-2 py-1.5 border-b border-gray-100 last:border-0">
								{entry.success ? (
									<CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
								) : (
									<XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
								)}
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<span className="shrink-0 text-[10px] uppercase tracking-wide text-gray-400">
											Row {entry.row}
										</span>
										<span
											className={`text-[11px] font-medium ${
												entry.success ? "text-green-700" : "text-red-700"
											}`}>
											{getEmployeeDisplayName(
												entry.employeeId,
												credentialExports,
											) ||
												entry.fullName ||
												entry.employeeId}
										</span>
									</div>
									<div className="mt-0.5 text-[11px] text-gray-500">
										{entry.employeeId}
										{entry.fullName ? ` - ${entry.fullName}` : ""}
										{entry.createdAt
											? ` - ${formatImportDateTime(entry.createdAt)}`
											: ""}
										{entry.message ? ` - ${entry.message}` : ""}
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Error list: all errors (scrollable) */}
			{hasErrors && progress.errors && (
				<div className="p-4 bg-red-50 border border-red-200 rounded-lg space-y-2">
					<div className="flex items-center gap-2 text-sm font-medium text-red-900">
						<AlertCircle className="h-4 w-4 text-red-600" />
						Errors ({progress.errors.length})
					</div>
					<div className="max-h-48 overflow-y-auto space-y-1 bg-white rounded p-2 border border-red-100 text-xs custom-scrollbar">
						{progress.errors.map((error, idx) => (
							<div
								key={idx}
								className="text-gray-700 border-b border-red-100 last:border-0 pb-1.5">
								<div className="font-medium text-red-900">
									Row {error.row}: {error.employeeId}
								</div>
								<div className="text-gray-600 mt-0.5 line-clamp-2">
									{shortenImportError(error.error)}
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{hasWarnings && progress.warnings && (
				<div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
					<div className="flex items-center gap-2 text-sm font-medium text-amber-900">
						<AlertCircle className="h-4 w-4 text-amber-600" />
						Warnings ({progress.warnings.length})
					</div>
					<div className="max-h-40 overflow-y-auto space-y-1 bg-white rounded p-2 border border-amber-100 text-xs custom-scrollbar">
						{progress.warnings.map((warning, idx) => (
							<div
								key={`${warning.employeeId}-${warning.stage}-${idx}`}
								className="text-gray-700 border-b border-amber-100 last:border-0 pb-1.5">
								<div className="font-medium text-amber-900">
									{warning.row ? `Row ${warning.row}: ` : ""}
									{warning.employeeId} [{warning.stage}]
								</div>
								<div className="text-gray-600 mt-0.5 line-clamp-2">
									{shortenImportError(warning.message)}
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
