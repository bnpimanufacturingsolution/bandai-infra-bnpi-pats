import { Download } from "lucide-react";
import { useState } from "react";

interface FileDropzoneProps {
	onFileSelect: (file: File) => void;
	accept?: string;
	className?: string;
}

export function FileDropzone({
	onFileSelect,
	accept = ".xlsx,.xls,.csv",
	className = "",
}: FileDropzoneProps) {
	const [isDragging, setIsDragging] = useState(false);

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
		const file = e.dataTransfer.files[0];
		if (file && isValidFile(file)) {
			onFileSelect(file);
		}
	};

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			onFileSelect(file);
		}
	};

	const isValidFile = (file: File) => {
		const validExtensions = accept.split(",").map((ext) => ext.trim());
		return validExtensions.some((ext) => file.name.endsWith(ext.replace(".", "")));
	};

	return (
		<div
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
			className={`relative border-2 border-dashed rounded-lg p-10 text-center transition-all cursor-pointer ${
				isDragging
					? "border-primary bg-primary/10"
					: "border-orange-200 bg-orange-50/40 hover:border-orange-300 hover:bg-orange-50/70"
			} ${className}`}>
			<input
				type="file"
				accept={accept}
				onChange={handleFileChange}
				className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
			/>
			<div className="flex flex-col items-center gap-3">
				<div
					className={`p-4 rounded-full transition-colors ${
						isDragging ? "bg-primary/15" : "bg-orange-100"
					}`}>
					<Download
						className={`h-8 w-8 transition-colors ${
							isDragging ? "text-primary" : "text-orange-500"
						}`}
					/>
				</div>
				<p className="text-sm font-semibold text-foreground">
					{isDragging ? "Drop your file here" : "Drag & drop your file here"}
				</p>
				<p className="text-xs text-muted-foreground">or click to browse</p>
			</div>
		</div>
	);
}
