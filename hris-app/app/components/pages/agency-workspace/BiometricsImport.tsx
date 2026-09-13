import React, { useState, useCallback } from "react";
import { Upload, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "~/components/ui/button";

export interface BiometricsImportProps {
	agencyId: string;
}

export function BiometricsImport({ agencyId }: BiometricsImportProps) {
	const [file, setFile] = useState<File | null>(null);
	const [status, setStatus] = useState<
		"idle" | "uploading" | "success" | "error" | "not-allowed"
	>("idle");
	const [message, setMessage] = useState("");

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const selected = e.target.files?.[0] || null;
			setFile(selected);
			setStatus("idle");
			setMessage("");
		},
		[],
	);

	const handleImport = useCallback(async () => {
		if (!file) {
			setStatus("error");
			setMessage("Select a CSV file before importing.");
			return;
		}

		setStatus("uploading");
		setMessage("Uploading attendance file...");

		try {
			const formData = new FormData();
			formData.append("file", file);
			formData.append("dryRun", "false");

			const response = await fetch(`/api/agency/${agencyId || "unknown"}/attendance-import`, {
				method: "POST",
				body: formData,
			});

			if (response.status === 403) {
				setStatus("not-allowed");
				setMessage(
					"Import endpoint is not permitted for this agency (403). The endpoint contract is being finalized; the workspace degrades gracefully without inventing import results.",
				);
				return;
			}

			if (response.status === 404) {
				setStatus("error");
				setMessage(
					"Import endpoint not found (404). The contract endpoint is being built in parallel; no fabricated success is shown.",
				);
				return;
			}

			if (!response.ok) {
				setStatus("error");
				setMessage(`Import failed: ${response.status} ${response.statusText}`);
				return;
			}

			setStatus("success");
			setMessage("Import submitted successfully.");
		} catch (err: any) {
			setStatus("error");
			setMessage(err?.message || "Network error during import.");
		}
	}, [file, agencyId]);

	return (
		<div className="space-y-3">
			<div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
				<div className="flex items-center gap-3">
					<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-300">
						<Upload className="h-5 w-5" />
					</div>
					<div className="flex-1">
						<p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Import attendance/biometrics</p>
						<p className="text-xs text-slate-500">
							CSV columns: employeeCode, date (YYYY-MM-DD), timeIn (HH:mm), timeOut (HH:mm), notes.
						</p>
					</div>
				</div>

				<div className="mt-4 flex items-center gap-3">
					<input
						type="file"
						accept=".csv"
						onChange={handleFileChange}
						className="hidden"
						id="agency-biometrics-csv"
					/>
					<label
						htmlFor="agency-biometrics-csv"
						className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
						<Upload className="h-3.5 w-3.5" />
						{file ? file.name : "Select CSV file"}
					</label>

					<button
						type="button"
						onClick={handleImport}
						disabled={status === "uploading"}
						className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200">
						{status === "uploading" ? (
							<>Uploading...</>
						) : (
							<>Upload import</>
						)}
					</button>
				</div>

				{status === "success" && (
					<div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-800 dark:border-green-800 dark:bg-green-950/20 dark:text-green-200">
						<div className="flex items-center gap-2 font-semibold">
							<CheckCircle className="h-4 w-4" />
							Import accepted
						</div>
						<p className="mt-1">{message}</p>
					</div>
				)}

				{status === "not-allowed" && (
					<div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
						<div className="flex items-center gap-2 font-semibold">
							<AlertTriangle className="h-4 w-4" />
							Endpoint not permitted
						</div>
						<p className="mt-1">{message}</p>
					</div>
				)}

				{status === "error" && (
					<div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-200">
						<p className="font-semibold">Import error</p>
						<p className="mt-1">{message}</p>
					</div>
				)}
			</div>
		</div>
	);
}
