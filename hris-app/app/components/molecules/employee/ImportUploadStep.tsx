import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { FileDropzone } from "~/components/atoms/FileDropzone";
import { ConstraintTokenRow } from "~/components/molecules/ConstraintTokens";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

interface ImportUploadStepProps {
	onFileSelect: (file: File) => void;
	onDownloadTemplate?: (count?: number) => void;
	selectedFile?: File | null;
	requiredFields?: string[];
	importEntityLabel?: string;
	mappingNote?: string;
	showTemplateCount?: boolean;
	isPreparingFile?: boolean;
	prepareProgress?: {
		rows: number;
		percent: number;
	};
}

export function ImportUploadStep({
	onFileSelect,
	onDownloadTemplate,
	selectedFile,
	requiredFields = [],
	importEntityLabel = "data",
	mappingNote = "Columns can be mapped in the next step if they don't match exactly.",
	showTemplateCount = false,
	isPreparingFile = false,
	prepareProgress,
}: ImportUploadStepProps) {
	const [templateRowCount, setTemplateRowCount] = useState<number>(1000);
	const requiredFieldsText =
		requiredFields.length > 0 ? requiredFields.join(", ") : "No required fields";

	return (
		<div className="space-y-6">
			{/* Instructions */}
			<div className="relative p-4 bg-orange-50/70 border border-orange-200 rounded-lg">
				<div className="flex justify-between items-start flex-wrap gap-4">
					<div className="flex-1 min-w-[200px]">
						<h4 className="text-sm font-semibold text-orange-800 mb-1">Instructions</h4>
						<p className="text-xs text-orange-700 mb-3">
							Upload a CSV or Excel file containing {importEntityLabel.toLowerCase()}{" "}
							records.
						</p>
						<ConstraintTokenRow
							className="mt-0"
							tokens={[
								{ label: "CSV/XLSX", tone: "default" },
								showTemplateCount
									? { label: "1-10000 rows", tone: "subtle" }
									: null,
							]}
						/>
					</div>
					<div className="flex items-center gap-2">
						{showTemplateCount && (
							<div className="flex items-center gap-2">
								<Label
									htmlFor="template-count"
									className="text-xs font-semibold text-orange-800">
									Rows:
								</Label>
								<Input
									id="template-count"
									type="number"
									min={1}
									max={10000}
									className="h-8 w-20 text-xs bg-background"
									value={templateRowCount}
									onChange={(e) => setTemplateRowCount(Number(e.target.value))}
								/>
							</div>
						)}
						<Button
							variant="outline"
							size="sm"
							className="bg-background h-8 text-xs gap-2"
							onClick={() => onDownloadTemplate?.(templateRowCount)}>
							<Download className="h-3.5 w-3.5" />
							Download Template
						</Button>
					</div>
				</div>

				<div className="text-xs text-orange-900 space-y-2 mt-2">
					<p>
						<strong>Required fields:</strong>{" "}
						<span className="opacity-80">{requiredFieldsText}</span>
					</p>
					<p>
						<strong>Note:</strong> {mappingNote}
					</p>
				</div>
			</div>

			{/* File Upload */}
			<FileDropzone onFileSelect={onFileSelect} />

			{selectedFile && (
				<div className="space-y-2 rounded-lg border border-green-200 bg-green-50 p-3">
					<div className="flex items-center justify-between gap-3 text-sm text-green-800">
						<p className="min-w-0 truncate">
							<strong>Selected file:</strong> {selectedFile.name}
						</p>
						{isPreparingFile && (
							<span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-green-900">
								<Loader2 className="h-3.5 w-3.5 animate-spin" />
								Preparing
							</span>
						)}
					</div>
					{isPreparingFile && (
						<div className="space-y-1.5">
							<div className="h-2 overflow-hidden rounded-full bg-green-100">
								<div
									className="h-full rounded-full bg-green-600 transition-all duration-200"
									style={{
										width: `${Math.max(6, prepareProgress?.percent || 6)}%`,
									}}
								/>
							</div>
							<div className="flex items-center justify-between text-xs text-green-900/80">
								<span>{prepareProgress?.rows || 0} rows read locally</span>
								<span>{prepareProgress?.percent || 0}%</span>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
