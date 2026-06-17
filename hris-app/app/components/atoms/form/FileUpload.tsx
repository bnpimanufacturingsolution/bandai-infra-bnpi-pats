/**
 * File Upload Field Component (Atom)
 *
 * Provides drag-and-drop file upload functionality with preview
 */

import * as React from "react";
import { cn } from "~/lib/utils";
import { Upload, X, File as FileIcon, Check } from "lucide-react";
import { Button } from "~/components/ui/button";

export interface FileUploadProps {
	name: string;
	value?: File | null;
	onChange: (file: File | null) => void;
	accept?: string;
	maxSize?: number; // in MB
	disabled?: boolean;
	error?: boolean;
	allowedExtensions?: string[];
	compact?: boolean;
}

export function FileUpload({
	name,
	value,
	onChange,
	accept = ".pdf,.doc,.docx",
	maxSize = 5,
	disabled,
	error,
	allowedExtensions,
	compact = false,
}: FileUploadProps) {
	const [isDragging, setIsDragging] = React.useState(false);
	const fileInputRef = React.useRef<HTMLInputElement>(null);
	const effectiveAllowedExtensions = React.useMemo(() => {
		if (allowedExtensions?.length) return allowedExtensions;
		return accept
			.split(",")
			.map((item) => item.trim().toLowerCase())
			.filter((item) => item.startsWith("."))
			.map((item) => item.slice(1))
			.filter(Boolean);
	}, [accept, allowedExtensions]);

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		if (!disabled) {
			setIsDragging(true);
		}
	};

	const handleDragLeave = () => {
		setIsDragging(false);
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);

		if (disabled) return;

		const files = Array.from(e.dataTransfer.files);
		if (files.length > 0) {
			handleFileSelect(files[0]);
		}
	};

	const handleFileSelect = (file: File) => {
		// Validate file size
		if (maxSize && file.size > maxSize * 1024 * 1024) {
			alert(`File size must be less than ${maxSize}MB`);
			return;
		}

		// Validate file type
		const extension = file.name.split(".").pop()?.toLowerCase();
		if (
			effectiveAllowedExtensions.length &&
			extension &&
			!effectiveAllowedExtensions.includes(extension)
		) {
			alert(`File must be one of: ${effectiveAllowedExtensions.join(", ")}`);
			return;
		}

		onChange(file);
	};

	const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files || []);
		if (files.length > 0) {
			handleFileSelect(files[0]);
		}
	};

	const handleRemoveFile = () => {
		onChange(null);
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	const formatFileSize = (bytes: number): string => {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	};

	return (
		<div className="w-full transition-all duration-200">
			<input
				ref={fileInputRef}
				type="file"
				id={name}
				name={name}
				accept={accept}
				onChange={handleFileInputChange}
				disabled={disabled}
				className="sr-only"
				aria-describedby={`${name}-description`}
			/>

			{!value ? (
				<label
					htmlFor={name}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
					className={cn(
						"flex w-full cursor-pointer items-center justify-center border-2 border-dashed transition-colors",
						compact
							? "min-h-[42px] rounded-md px-3 py-1"
							: "min-h-[80px] flex-col rounded-lg",
						isDragging && "border-primary bg-primary/5",
						!isDragging &&
							!error &&
							"border-input hover:border-primary/50 bg-background",
						error && "border-destructive bg-destructive/5",
						disabled && "opacity-50 cursor-not-allowed",
					)}>
					<div
						className={cn(
							"flex items-center justify-center text-center",
							compact ? "gap-2" : "flex-col px-4 py-3",
						)}>
						<Upload
							className={cn(
								compact ? "size-4" : "mb-2 size-6",
								isDragging ? "text-primary" : "text-muted-foreground",
							)}
						/>
						<p className={cn("text-sm", !compact && "mb-1")}>
							<span className="font-semibold text-foreground">Click to upload</span>{" "}
							{!compact ? (
								<span className="text-muted-foreground">or drag and drop</span>
							) : null}
						</p>
						<p className={cn("text-xs text-muted-foreground", compact && "truncate")}>
							{effectiveAllowedExtensions.map((ext) => ext.toUpperCase()).join(", ")}{" "}
							up to {maxSize}MB
						</p>
					</div>
				</label>
			) : (
				<div
					className={cn(
						"flex items-center justify-between border bg-muted/50",
						compact ? "min-h-[42px] rounded-md px-3 py-1" : "rounded-lg p-4",
						error && "border-destructive",
					)}>
					<div className="flex items-center gap-3 min-w-0 flex-1">
						<div className="flex-shrink-0">
							<div
								className={cn(
									"rounded-md bg-primary/10 flex items-center justify-center",
									compact ? "size-7" : "size-10",
								)}>
								<FileIcon className={cn("text-primary", compact ? "size-4" : "size-5")} />
							</div>
						</div>
						<div className="min-w-0 flex-1">
							<p className="text-sm font-medium text-foreground truncate">
								{value.name}
							</p>
							{!compact ? (
								<p className="text-xs text-muted-foreground">
									{formatFileSize(value.size)}
								</p>
							) : null}
						</div>
						<div className="flex items-center gap-2 flex-shrink-0">
							<div
								className={cn(
									"rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center",
									compact ? "size-5" : "size-6",
								)}>
								<Check
									className={cn(
										"text-green-600 dark:text-green-400",
										compact ? "size-3.5" : "size-4",
									)}
								/>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								onClick={handleRemoveFile}
								disabled={disabled}
								className={cn(compact ? "size-7" : "size-8")}>
								<X className="size-4" />
								<span className="sr-only">Remove file</span>
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
