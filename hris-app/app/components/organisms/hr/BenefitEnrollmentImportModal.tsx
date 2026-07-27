import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	AlertCircle,
	Check,
	CheckCircle2,
	CircleDashed,
	Download,
	FileSpreadsheet,
	Loader2,
	Upload,
} from "lucide-react";
import { Modal } from "~/components/atoms/Modal";
import { Button } from "~/components/atoms/Button";
import { FileDropzone } from "~/components/atoms/FileDropzone";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import {
	ALL_BENEFIT_ENROLLMENT_IMPORT_FIELDS,
	BENEFIT_ENROLLMENT_OPTIONAL_FIELDS,
	BENEFIT_ENROLLMENT_REQUIRED_FIELDS,
	BENEFIT_ENROLLMENT_TEMPLATE_HEADERS,
	type BenefitEnrollmentImportField,
} from "~/constants/benefit-enrollment-import-fields";
import { useImportEmployeeBenefits } from "~/lib/hooks/useEmployeeBenefits";
import { cn } from "~/lib/utils";
import {
	applyBenefitColumnMapping,
	autoMapBenefitEnrollmentHeaders,
	buildMappedEnrollmentCsvFile,
	downloadBenefitEnrollmentTemplate,
	getMissingRequiredBenefitMaps,
	parseEnrollmentWorkbook,
	validateMappedEnrollmentRows,
	type MappedEnrollmentRow,
} from "~/lib/utils/benefit-enrollment-import";

type ImportStep = "upload" | "map" | "verify";

const STEPS: Array<{ id: ImportStep; label: string; hint: string }> = [
	{ id: "upload", label: "Upload", hint: "Choose file" },
	{ id: "map", label: "Map", hint: "Match columns" },
	{ id: "verify", label: "Verify", hint: "Review & import" },
];

const UNMAPPED_VALUE = "__unmapped__";

interface BenefitEnrollmentImportModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onImported?: () => void;
}

function StepRail({
	step,
	canVisit,
	onSelect,
}: {
	step: ImportStep;
	canVisit: (id: ImportStep) => boolean;
	onSelect: (id: ImportStep) => void;
}) {
	const currentIndex = STEPS.findIndex((s) => s.id === step);

	return (
		<nav
			aria-label="Import steps"
			className="flex items-center gap-0 rounded-xl border border-neutral-200/80 bg-neutral-50/80 p-1.5">
			{STEPS.map((item, idx) => {
				const isActive = item.id === step;
				const isPast = currentIndex > idx;
				const clickable = canVisit(item.id);
				return (
					<div key={item.id} className="flex min-w-0 flex-1 items-center">
						<button
							type="button"
							disabled={!clickable}
							onClick={() => clickable && onSelect(item.id)}
							className={cn(
								"flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors",
								isActive && "bg-white shadow-sm ring-1 ring-neutral-200/80",
								!isActive && clickable && "hover:bg-white/70",
								!clickable && "cursor-not-allowed opacity-45",
							)}>
							<span
								className={cn(
									"flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
									isActive && "bg-neutral-900 text-white",
									isPast && !isActive && "bg-emerald-500 text-white",
									!isActive && !isPast && "bg-neutral-200/80 text-neutral-500",
								)}>
								{isPast && !isActive ? <Check className="h-3.5 w-3.5" /> : idx + 1}
							</span>
							<span className="min-w-0">
								<span
									className={cn(
										"block text-sm font-medium leading-tight",
										isActive ? "text-neutral-900" : "text-neutral-600",
									)}>
									{item.label}
								</span>
								<span className="hidden text-[11px] text-neutral-400 sm:block">
									{item.hint}
								</span>
							</span>
						</button>
						{idx < STEPS.length - 1 && (
							<div
								className={cn(
									"mx-0.5 hidden h-px w-4 shrink-0 sm:block",
									isPast ? "bg-emerald-300" : "bg-neutral-200",
								)}
							/>
						)}
					</div>
				);
			})}
		</nav>
	);
}

function MappingFieldRow({
	field,
	headers,
	mapping,
	usedHeaders,
	isRequired,
	onChange,
}: {
	field: BenefitEnrollmentImportField;
	headers: string[];
	mapping?: string;
	usedHeaders: Set<string>;
	isRequired: boolean;
	onChange: (key: string, header: string | null) => void;
}) {
	const isMatched = Boolean(mapping);
	const isExact = mapping === field.key;
	const needsAttention = isRequired && !isMatched;

	return (
		<div
			data-testid={`map-row-${field.key}`}
			data-matched={isMatched ? "true" : "false"}
			className={cn(
				"grid grid-cols-1 items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]",
				isMatched && "border-emerald-200/80 bg-emerald-50/40",
				needsAttention && "border-amber-200 bg-amber-50/50",
				!isMatched && !needsAttention && "border-neutral-200/80 bg-white",
			)}>
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-sm font-medium text-neutral-900">{field.label}</span>
					{isRequired && (
						<span className="rounded-md bg-neutral-900/[0.06] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
							Required
						</span>
					)}
					{isExact && (
						<span className="rounded-md bg-emerald-100/80 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
							Exact match
						</span>
					)}
				</div>
				<p className="mt-0.5 font-mono text-[11px] text-neutral-400">{field.key}</p>
				{field.description && (
					<p className="mt-1 text-xs text-neutral-500">{field.description}</p>
				)}
			</div>

			<div className="min-w-0">
				<Select
					value={mapping || UNMAPPED_VALUE}
					onValueChange={(value) =>
						onChange(field.key, value === UNMAPPED_VALUE ? null : value)
					}>
					<SelectTrigger
						className={cn(
							"h-9 w-full rounded-lg border bg-white text-sm shadow-none",
							isMatched && "border-emerald-200",
							needsAttention && "border-amber-300",
						)}>
						<SelectValue placeholder="Select file column…" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={UNMAPPED_VALUE}>
							<span className="text-neutral-400">Not mapped</span>
						</SelectItem>
						{headers.map((header) => {
							const takenByOther = usedHeaders.has(header) && mapping !== header;
							return (
								<SelectItem key={header} value={header} disabled={takenByOther}>
									<span className="flex items-center gap-2">
										<span className="font-mono text-xs">{header}</span>
										{takenByOther && (
											<span className="text-[10px] text-neutral-400">in use</span>
										)}
									</span>
								</SelectItem>
							);
						})}
					</SelectContent>
				</Select>
			</div>

			<div className="flex items-center justify-start sm:justify-end">
				{isMatched ? (
					<span
						className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800"
						data-testid={`map-status-${field.key}-matched`}>
						<CheckCircle2 className="h-3.5 w-3.5" />
						Matched
					</span>
				) : needsAttention ? (
					<span
						className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900"
						data-testid={`map-status-${field.key}-unmatched`}>
						<AlertCircle className="h-3.5 w-3.5" />
						Not matched
					</span>
				) : (
					<span
						className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-500"
						data-testid={`map-status-${field.key}-optional`}>
						<CircleDashed className="h-3.5 w-3.5" />
						Optional
					</span>
				)}
			</div>
		</div>
	);
}

export function BenefitEnrollmentImportModal({
	open,
	onOpenChange,
	onImported,
}: BenefitEnrollmentImportModalProps) {
	const importMutation = useImportEmployeeBenefits();
	const [step, setStep] = useState<ImportStep>("upload");
	const [file, setFile] = useState<File | null>(null);
	const [headers, setHeaders] = useState<string[]>([]);
	const [rows, setRows] = useState<string[][]>([]);
	const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
	const [isParsing, setIsParsing] = useState(false);
	const [parseError, setParseError] = useState<string | null>(null);
	const [importErrors, setImportErrors] = useState<Array<{ row: number; error: string }>>([]);
	const [importSummary, setImportSummary] = useState<{
		success: number;
		failed: number;
	} | null>(null);

	const resetState = useCallback(() => {
		setStep("upload");
		setFile(null);
		setHeaders([]);
		setRows([]);
		setColumnMapping({});
		setIsParsing(false);
		setParseError(null);
		setImportErrors([]);
		setImportSummary(null);
	}, []);

	useEffect(() => {
		if (!open) resetState();
	}, [open, resetState]);

	const handleFileSelect = async (selected: File) => {
		setFile(selected);
		setParseError(null);
		setImportErrors([]);
		setImportSummary(null);
		setIsParsing(true);
		try {
			const parsed = await parseEnrollmentWorkbook(selected);
			setHeaders(parsed.headers);
			setRows(parsed.rows);
			setColumnMapping(autoMapBenefitEnrollmentHeaders(parsed.headers));
			setStep("map");
		} catch (error: any) {
			setParseError(error?.message || "Failed to parse file");
			toast.error(error?.message || "Failed to parse file");
		} finally {
			setIsParsing(false);
		}
	};

	const missingRequired = useMemo(
		() => getMissingRequiredBenefitMaps(columnMapping),
		[columnMapping],
	);

	const mappedRows: MappedEnrollmentRow[] = useMemo(
		() => applyBenefitColumnMapping(headers, rows, columnMapping),
		[headers, rows, columnMapping],
	);

	const previewIssues = useMemo(
		() => validateMappedEnrollmentRows(mappedRows),
		[mappedRows],
	);

	const usedHeaders = useMemo(
		() => new Set(Object.values(columnMapping).filter(Boolean)),
		[columnMapping],
	);

	const mappingStats = useMemo(() => {
		const required = BENEFIT_ENROLLMENT_REQUIRED_FIELDS;
		const optional = BENEFIT_ENROLLMENT_OPTIONAL_FIELDS;
		const requiredMatched = required.filter((f) => columnMapping[f.key]).length;
		const optionalMatched = optional.filter((f) => columnMapping[f.key]).length;
		const benefitCovered = Boolean(columnMapping.BENEFIT_CODE || columnMapping.BENEFIT_TYPE);
		// Count BENEFIT_CODE as unmatched for badge if neither code nor type is mapped
		const requiredUnmatched = required.filter((f) => {
			if (f.key === "BENEFIT_CODE") return !benefitCovered;
			return !columnMapping[f.key];
		}).length;
		const unusedFileHeaders = headers.filter((h) => !usedHeaders.has(h));
		return {
			requiredMatched,
			requiredTotal: required.length,
			requiredUnmatched,
			optionalMatched,
			optionalTotal: optional.length,
			unusedFileHeaders,
			allRequiredMatched: missingRequired.length === 0,
		};
	}, [columnMapping, headers, missingRequired.length, usedHeaders]);

	const handleMappingChange = (key: string, header: string | null) => {
		setColumnMapping((prev) => {
			const next = { ...prev };
			if (!header) {
				delete next[key];
			} else {
				for (const [k, v] of Object.entries(next)) {
					if (v === header && k !== key) delete next[k];
				}
				next[key] = header;
			}
			return next;
		});
	};

	const canGoToVerify = missingRequired.length === 0 && rows.length > 0;
	const canImport = canGoToVerify && previewIssues.length === 0 && !importMutation.isPending;

	const handleImport = async () => {
		if (!canImport) return;
		setImportErrors([]);
		setImportSummary(null);
		try {
			const csv = buildMappedEnrollmentCsvFile(mappedRows);
			const result = await importMutation.mutateAsync(csv);
			setImportSummary({ success: result.success, failed: result.failed });
			setImportErrors((result.errors || []).map((e) => ({ row: e.row, error: e.error })));
			if (result.success > 0) onImported?.();
			if (result.failed === 0 && result.success > 0) onOpenChange(false);
		} catch (error: any) {
			toast.error(error?.message || "Import failed");
		}
	};

	const previewColumns = useMemo(() => {
		const keys = Object.keys(columnMapping).filter((k) => columnMapping[k]);
		const preferred = [
			"EMPLOYEE_NUMBER",
			"EMPLOYEE_NAME",
			"BENEFIT_CODE",
			"BENEFIT_TYPE",
			"AMOUNT",
			"START_DATE",
			"END_DATE",
			"NAME",
		];
		return [
			...preferred.filter((k) => keys.includes(k)),
			...keys.filter((k) => !preferred.includes(k)),
		];
	}, [columnMapping]);

	const canVisit = (id: ImportStep) => {
		if (id === "upload") return true;
		if (id === "map") return Boolean(file && headers.length);
		if (id === "verify") return canGoToVerify;
		return false;
	};

	const fieldLabel = (key: string) =>
		ALL_BENEFIT_ENROLLMENT_IMPORT_FIELDS.find((f) => f.key === key)?.label || key;

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title="Bulk upload enrollments"
			description="Import many enrollments at once. Use the template for zero mapping, or map your own columns."
			className="max-w-3xl">
			<div className="space-y-5" data-testid="benefit-enrollment-import-modal">
				<StepRail step={step} canVisit={canVisit} onSelect={setStep} />

				{/* ── Upload ───────────────────────────────────────── */}
				{step === "upload" && (
					<div className="space-y-4" data-testid="benefit-import-upload">
						<div className="flex flex-col gap-3 rounded-2xl border border-neutral-200/90 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
							<div className="min-w-0 space-y-1">
								<p className="text-sm font-medium text-neutral-900">
									Start with the template
								</p>
								<p className="text-xs leading-relaxed text-neutral-500">
									Headers match the import schema exactly (
									{BENEFIT_ENROLLMENT_TEMPLATE_HEADERS.slice(0, 4).join(", ")}
									…). No column mapping needed when you keep them.
								</p>
							</div>
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="h-9 shrink-0 gap-1.5 rounded-lg border-neutral-200"
								onClick={() => downloadBenefitEnrollmentTemplate()}
								data-testid="benefit-import-download-template">
								<Download className="h-3.5 w-3.5" />
								Download template
							</Button>
						</div>

						<div className="relative">
							<FileDropzone
								onFileSelect={handleFileSelect}
								className="!rounded-2xl !border-neutral-200 !bg-neutral-50/50 hover:!border-neutral-300 hover:!bg-neutral-50 !p-12"
							/>
							{isParsing && (
								<div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/70 backdrop-blur-[1px]">
									<span className="inline-flex items-center gap-2 text-sm text-neutral-700">
										<Loader2 className="h-4 w-4 animate-spin" />
										Reading file…
									</span>
								</div>
							)}
						</div>

						{file && (
							<div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm text-neutral-700">
								<FileSpreadsheet className="h-4 w-4 shrink-0 text-neutral-400" />
								<span className="min-w-0 truncate font-medium">{file.name}</span>
							</div>
						)}

						{parseError && (
							<p
								className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700"
								data-testid="import-parse-error">
								{parseError}
							</p>
						)}

						<p className="text-center text-[11px] text-neutral-400">
							Accepts .xlsx, .xls, or .csv · Required: employee number, benefit code,
							amount, start date
						</p>
					</div>
				)}

				{/* ── Map ──────────────────────────────────────────── */}
				{step === "map" && (
					<div className="space-y-4" data-testid="benefit-import-map">
						{/* Status summary */}
						<div className="flex flex-wrap items-center gap-2">
							{mappingStats.allRequiredMatched ? (
								<span
									className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-100"
									data-testid="map-summary-ready">
									<CheckCircle2 className="h-3.5 w-3.5" />
									All required fields matched
								</span>
							) : (
								<span
									className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-100"
									data-testid="map-summary-missing">
									<AlertCircle className="h-3.5 w-3.5" />
									{mappingStats.requiredUnmatched} required not matched
								</span>
							)}
							<span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">
								{mappingStats.requiredMatched + mappingStats.optionalMatched} of{" "}
								{mappingStats.requiredTotal + mappingStats.optionalTotal} fields
								mapped
							</span>
							<span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">
								{rows.length} row{rows.length === 1 ? "" : "s"} · {file?.name}
							</span>
						</div>

						{/* Legend */}
						<div className="flex flex-wrap items-center gap-4 text-[11px] text-neutral-500">
							<span className="inline-flex items-center gap-1.5">
								<span className="h-2 w-2 rounded-full bg-emerald-500" />
								Matched
							</span>
							<span className="inline-flex items-center gap-1.5">
								<span className="h-2 w-2 rounded-full bg-amber-400" />
								Required · not matched
							</span>
							<span className="inline-flex items-center gap-1.5">
								<span className="h-2 w-2 rounded-full bg-neutral-300" />
								Optional · skipped
							</span>
						</div>

						{/* File columns overview */}
						{headers.length > 0 && (
							<div className="rounded-xl border border-neutral-200/80 bg-neutral-50/50 px-3 py-2.5">
								<p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
									Columns in your file
								</p>
								<div className="flex flex-wrap gap-1.5">
									{headers.map((header) => {
										const isUsed = usedHeaders.has(header);
										return (
											<span
												key={header}
												className={cn(
													"inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] ring-1",
													isUsed
														? "bg-emerald-50 text-emerald-800 ring-emerald-100"
														: "bg-white text-neutral-500 ring-neutral-200",
												)}
												title={isUsed ? "Mapped" : "Not used"}>
												{isUsed ? (
													<Check className="h-3 w-3" />
												) : (
													<span className="h-1.5 w-1.5 rounded-full bg-neutral-300" />
												)}
												{header}
											</span>
										);
									})}
								</div>
							</div>
						)}

						<div className="max-h-[42vh] space-y-4 overflow-y-auto pr-0.5">
							<section className="space-y-2">
								<h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
									Required
								</h3>
								<div className="space-y-2">
									{BENEFIT_ENROLLMENT_REQUIRED_FIELDS.map((field) => (
										<MappingFieldRow
											key={field.key}
											field={field}
											headers={headers}
											mapping={columnMapping[field.key]}
											usedHeaders={usedHeaders}
											isRequired
											onChange={handleMappingChange}
										/>
									))}
								</div>
							</section>

							<section className="space-y-2">
								<h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
									Optional
								</h3>
								<div className="space-y-2">
									{BENEFIT_ENROLLMENT_OPTIONAL_FIELDS.map((field) => (
										<MappingFieldRow
											key={field.key}
											field={field}
											headers={headers}
											mapping={columnMapping[field.key]}
											usedHeaders={usedHeaders}
											isRequired={false}
											onChange={handleMappingChange}
										/>
									))}
								</div>
							</section>
						</div>

						{missingRequired.length > 0 && (
							<p
								className="rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-900"
								data-testid="import-missing-maps">
								Map these required fields to continue:{" "}
								<span className="font-medium">
									{missingRequired
										.map((k) =>
											k.includes(" or ")
												? k
												: fieldLabel(k) || k,
										)
										.join(", ")}
								</span>
							</p>
						)}
					</div>
				)}

				{/* ── Verify ───────────────────────────────────────── */}
				{step === "verify" && (
					<div className="space-y-4" data-testid="benefit-import-verify">
						<div className="flex flex-wrap items-center gap-2">
							<span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
								{mappedRows.length} enrollment
								{mappedRows.length === 1 ? "" : "s"}
							</span>
							{previewIssues.length > 0 ? (
								<span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-red-100">
									<AlertCircle className="h-3.5 w-3.5" />
									{previewIssues.length} issue
									{previewIssues.length === 1 ? "" : "s"}
								</span>
							) : (
								<span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-100">
									<CheckCircle2 className="h-3.5 w-3.5" />
									Ready to import
								</span>
							)}
						</div>

						{previewIssues.length > 0 && (
							<ul className="max-h-28 space-y-1 overflow-y-auto rounded-xl border border-red-100 bg-red-50/50 p-3 text-xs text-red-800">
								{previewIssues.slice(0, 20).map((issue, i) => (
									<li key={`${issue.row}-${issue.field}-${i}`}>
										Row {issue.row}: {issue.message}
									</li>
								))}
							</ul>
						)}

						<div className="overflow-hidden rounded-xl border border-neutral-200">
							<div className="max-h-64 overflow-auto">
								<table className="min-w-full text-xs">
									<thead className="sticky top-0 bg-neutral-50/95 backdrop-blur-sm">
										<tr className="border-b border-neutral-200">
											<th className="px-3 py-2 text-left text-[11px] font-medium text-neutral-400">
												#
											</th>
											{previewColumns.map((col) => (
												<th
													key={col}
													className="px-3 py-2 text-left text-[11px] font-medium text-neutral-500 whitespace-nowrap">
													{fieldLabel(col)}
												</th>
											))}
										</tr>
									</thead>
									<tbody>
										{mappedRows.slice(0, 100).map((row, idx) => (
											<tr
												key={idx}
												className="border-t border-neutral-100 hover:bg-neutral-50/80">
												<td className="px-3 py-2 tabular-nums text-neutral-400">
													{idx + 1}
												</td>
												{previewColumns.map((col) => (
													<td
														key={col}
														className="max-w-[10rem] truncate px-3 py-2 text-neutral-700"
														title={row[col]}>
														{row[col] || (
															<span className="text-neutral-300">—</span>
														)}
													</td>
												))}
											</tr>
										))}
									</tbody>
								</table>
							</div>
							{mappedRows.length > 100 && (
								<p className="border-t border-neutral-100 px-3 py-1.5 text-[11px] text-neutral-400">
									Showing first 100 of {mappedRows.length} rows
								</p>
							)}
						</div>

						{importSummary && (
							<div
								className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm text-neutral-700"
								data-testid="benefit-import-summary">
								Imported <strong className="text-neutral-900">{importSummary.success}</strong>
								, failed{" "}
								<strong className="text-neutral-900">{importSummary.failed}</strong>
							</div>
						)}

						{importErrors.length > 0 && (
							<ul
								className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-red-100 bg-red-50/40 p-3 text-xs text-red-800"
								data-testid="benefit-import-errors">
								{importErrors.map((err, i) => (
									<li key={`${err.row}-${i}`}>
										Row {err.row}: {err.error}
									</li>
								))}
							</ul>
						)}
					</div>
				)}

				{/* ── Footer ───────────────────────────────────────── */}
				<div className="flex items-center justify-between gap-2 border-t border-neutral-100 pt-4">
					<Button
						type="button"
						variant="ghost"
						className="h-9 text-neutral-600"
						onClick={() => onOpenChange(false)}
						disabled={importMutation.isPending}>
						Cancel
					</Button>
					<div className="flex items-center gap-2">
						{step !== "upload" && (
							<Button
								type="button"
								variant="outline"
								className="h-9 rounded-lg border-neutral-200"
								onClick={() => setStep(step === "verify" ? "map" : "upload")}
								disabled={importMutation.isPending}>
								Back
							</Button>
						)}
						{step === "map" && (
							<Button
								type="button"
								className="h-9 rounded-lg bg-neutral-900 text-white hover:bg-neutral-800"
								onClick={() => setStep("verify")}
								disabled={!canGoToVerify}
								data-testid="benefit-import-next-verify">
								Continue to verify
							</Button>
						)}
						{step === "verify" && (
							<Button
								type="button"
								onClick={handleImport}
								disabled={!canImport}
								className="h-9 gap-1.5 rounded-lg bg-orange-600 text-white hover:bg-orange-700"
								data-testid="benefit-import-submit">
								{importMutation.isPending ? (
									<>
										<Loader2 className="h-4 w-4 animate-spin" />
										Importing…
									</>
								) : (
									<>
										<Upload className="h-3.5 w-3.5" />
										Import {mappedRows.length} enrollment
										{mappedRows.length === 1 ? "" : "s"}
									</>
								)}
							</Button>
						)}
					</div>
				</div>
			</div>
		</Modal>
	);
}
