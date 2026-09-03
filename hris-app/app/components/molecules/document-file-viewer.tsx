import { Download, ExternalLink, FileWarning, ImageIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import { PDFViewer } from "~/components/molecules/pdf-viewer";
import { detectDocumentFileKind } from "~/lib/utils/document-file";

interface DocumentFileViewerProps {
	url: string;
	fileName?: string | null;
	ext?: string | null;
	className?: string;
}

const openFile = (url: string) => {
	window.open(url, "_blank", "noopener,noreferrer");
};

const downloadFile = (url: string, fileName?: string | null) => {
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName || "document";
	link.target = "_blank";
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
};

function DocumentFileActions({ url, fileName }: Pick<DocumentFileViewerProps, "url" | "fileName">) {
	return (
		<div className="flex flex-wrap items-center justify-center gap-2">
			<Button type="button" variant="outline" size="sm" onClick={() => openFile(url)}>
				<ExternalLink className="mr-2 h-4 w-4" />
				Open file
			</Button>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() => downloadFile(url, fileName)}>
				<Download className="mr-2 h-4 w-4" />
				Download
			</Button>
		</div>
	);
}

export function DocumentFileViewer({ url, fileName, ext, className }: DocumentFileViewerProps) {
	const fileKind = detectDocumentFileKind({ url, fileName, ext });

	if (fileKind === "pdf") {
		return <PDFViewer url={url} fileName={fileName || undefined} />;
	}

	if (fileKind === "image") {
		return (
			<div className={`flex h-full w-full flex-col bg-muted/30 ${className || ""}`}>
				<div className="flex items-center justify-between gap-3 border-b border-border bg-background px-3 py-2">
					<div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
						<ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
						<span className="truncate">{fileName || "Image document"}</span>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => openFile(url)}>
							<ExternalLink className="mr-2 h-4 w-4" />
							Open
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => downloadFile(url, fileName)}>
							<Download className="mr-2 h-4 w-4" />
							Download
						</Button>
					</div>
				</div>
				<div className="flex-1 overflow-auto p-4 sm:p-6">
					<div className="flex min-h-full items-center justify-center">
						<img
							src={url}
							alt={fileName || "Employee document"}
							className="max-h-full max-w-full rounded-lg border border-border bg-white object-contain shadow-xl"
						/>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div
			className={`flex h-full w-full items-center justify-center bg-muted/30 p-6 ${className || ""}`}>
			<div className="w-full max-w-md rounded-xl border border-border bg-background p-6 text-center shadow-sm">
				<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
					<FileWarning className="h-6 w-6 text-muted-foreground" />
				</div>
				<h3 className="text-base font-semibold text-foreground">Preview unavailable</h3>
				<p className="mt-2 text-sm text-muted-foreground">
					This file type is supported, but in-app preview is not available. You can still
					open or download it.
				</p>
				<div className="mt-5">
					<DocumentFileActions url={url} fileName={fileName} />
				</div>
			</div>
		</div>
	);
}
