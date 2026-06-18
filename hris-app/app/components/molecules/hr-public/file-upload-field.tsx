import * as React from "react";
import { Eye, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "~/components/ui/label";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { DocumentFileViewer } from "~/components/molecules/document-file-viewer";
import {
	detectDocumentFileKind,
	EMPLOYEE_DOCUMENT_ACCEPT,
	validateEmployeeDocumentFile,
} from "~/lib/utils/document-file";

interface FileUploadFieldProps {
	label: string;
	subtitle?: string;
	id: string;
	required?: boolean;
	accept?: string;
	onFileChange?: (file: File | null) => void;
	maxSize?: number; // in MB
	error?: string | null;
	helperText?: string;
	buttonText?: string;
	/** Use PDF/image rules from employee documents (same as employee/:id uploads). */
	useEmployeeDocumentRules?: boolean;
}

export function FileUploadField({
	label,
	subtitle,
	id,
	required = false,
	accept = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingdocument",
	onFileChange,
	maxSize = 10,
	error: externalError,
	helperText,
	buttonText = "Click to upload or drag and drop",
	useEmployeeDocumentRules = false,
}: FileUploadFieldProps) {
	const [isDragging, setIsDragging] = React.useState(false);
	const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [previewOpen, setPreviewOpen] = React.useState(false);
	const fileInputRef = React.useRef<HTMLInputElement>(null);

	const previewUrl = React.useMemo(() => {
		if (!selectedFile) return null;
		return URL.createObjectURL(selectedFile);
	}, [selectedFile]);

	React.useEffect(() => {
		return () => {
			if (previewUrl) URL.revokeObjectURL(previewUrl);
		};
	}, [previewUrl]);

	const previewKind =
		previewUrl && selectedFile
			? detectDocumentFileKind({
					url: previewUrl,
					fileName: selectedFile.name,
				})
			: "other";
	const canPreview = previewKind === "pdf" || previewKind === "image";

	const validateFile = (file: File): boolean => {
		if (useEmployeeDocumentRules) {
			const empErr = validateEmployeeDocumentFile(file);
			if (empErr) {
				setError(empErr);
				return false;
			}
			setError(null);
			return true;
		}

		const fileSizeMB = file.size / (1024 * 1024);
		if (fileSizeMB > maxSize) {
			setError(`File size must be less than ${maxSize}MB`);
			return false;
		}

		const acceptedTypes = accept.split(",").map((type) => type.trim());
		const fileExtension = `.${file.name.split(".").pop()?.toLowerCase()}`;
		const isValidType =
			acceptedTypes.includes(fileExtension) ||
			acceptedTypes.includes(file.type) ||
			acceptedTypes.some((type) => {
				if (type.includes("*")) {
					const baseType = type.split("/")[0];
					return file.type.startsWith(baseType);
				}
				return false;
			});

		if (!isValidType) {
			setError("Please upload a valid file type");
			return false;
		}

		setError(null);
		return true;
	};

	const effectiveAccept = useEmployeeDocumentRules ? EMPLOYEE_DOCUMENT_ACCEPT : accept;

	const handleFileChange = (file: File | null) => {
		if (file && validateFile(file)) {
			setSelectedFile(file);
			onFileChange?.(file);
		} else if (!file) {
			setSelectedFile(null);
			onFileChange?.(null);
		}
	};

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(true);
	};

	const handleDragLeave = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);

		const files = e.dataTransfer.files;
		if (files && files.length > 0) {
			handleFileChange(files[0]);
		}
	};

	const handleClick = () => {
		fileInputRef.current?.click();
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files;
		if (files && files.length > 0) {
			handleFileChange(files[0]);
		}
	};

	return (
		<div className="space-y-2">
			<Label htmlFor={id}>
				{label}
				{required && <span className="ml-1 text-red-500">*</span>}
			</Label>
			{subtitle && <p className="text-sm text-slate-600">{subtitle}</p>}

			<div
				onClick={handleClick}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
				className={cn(
					"relative cursor-pointer rounded-2xl p-6 text-center transition-all sm:p-7",
					"bg-[#faf6f3] ring-1 ring-inset ring-dashed ring-[#dfd6d0]",
					isDragging &&
						"bg-[color-mix(in_srgb,var(--theme-red)_6%,#faf6f3)] ring-[var(--theme-red)]/35",
					(error || externalError) && "bg-red-50/80 ring-red-200/80 ring-dashed",
				)}>
				<input
					ref={fileInputRef}
					id={id}
					type="file"
					accept={effectiveAccept}
					onChange={handleInputChange}
					required={required}
					className="hidden"
				/>

				<div className="flex flex-col items-center gap-2.5">
					<div className="rounded-full bg-[color-mix(in_srgb,var(--theme-red)_12%,white)] p-2.5">
						<Upload className="h-7 w-7 text-[var(--theme-red)]" />
					</div>
					<div>
						<p className="text-[15px] font-medium text-neutral-900">{buttonText}</p>
						<p className="mt-0.5 text-xs text-neutral-500">
							{helperText || `Accepted files up to ${maxSize}MB`}
						</p>
					</div>
				</div>

				{selectedFile && (
					<div
						className="mt-3 w-full min-w-0"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}>
						<div className="flex flex-col gap-2 rounded-xl bg-white/95 px-3 py-2.5 text-left shadow-sm ring-1 ring-black/[0.06] sm:flex-row sm:items-center sm:justify-between sm:gap-3">
							<div className="min-w-0 flex-1 overflow-hidden">
								<p
									className="break-words text-sm font-medium leading-snug text-neutral-900 line-clamp-2 sm:line-clamp-1 sm:truncate"
									title={selectedFile.name}>
									{selectedFile.name}
								</p>
								<p className="text-xs text-neutral-500">
									{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
								</p>
							</div>
							{canPreview && previewUrl ? (
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-9 shrink-0 rounded-full border-0 bg-[#faf6f3] text-neutral-800 ring-1 ring-[#e8dede]/90 hover:bg-[#f0ebe5]"
									onClick={() => setPreviewOpen(true)}>
									<Eye className="mr-1.5 h-4 w-4 text-[var(--theme-red)]" />
									Preview
								</Button>
							) : null}
						</div>
					</div>
				)}
			</div>

			{(externalError || error) && (
				<p className="text-sm text-red-600">{externalError || error}</p>
			)}

			<Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
				<DialogContent
					showCloseButton
					className="flex max-h-[min(90vh,880px)] w-[calc(100vw-1.5rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
					<DialogHeader className="shrink-0 border-b border-[#ece8e6] px-4 py-3 text-left">
						<DialogTitle className="truncate pr-8 text-base font-semibold text-neutral-900">
							{selectedFile?.name || "Preview"}
						</DialogTitle>
					</DialogHeader>
					{previewUrl && selectedFile ? (
						<div className="min-h-[min(70vh,720px)] flex-1 overflow-hidden bg-neutral-100/80">
							<DocumentFileViewer
								url={previewUrl}
								fileName={selectedFile.name}
								ext={
									selectedFile.name.includes(".")
										? selectedFile.name.split(".").pop()
										: undefined
								}
								className="h-full min-h-[50vh]"
							/>
						</div>
					) : null}
				</DialogContent>
			</Dialog>
		</div>
	);
}
