import { useState, useEffect, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Button } from "~/components/ui/button";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

if (typeof window !== "undefined") {
	pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

interface PDFViewerModalProps {
	isOpen: boolean;
	onClose: () => void;
	fileUrl: string;
	fileName?: string;
}

export default function PDFViewerModalContent({
	isOpen,
	onClose,
	fileUrl,
	fileName,
}: PDFViewerModalProps) {
	const [numPages, setNumPages] = useState<number>(0);
	const [pageNumber, setPageNumber] = useState<number>(1);
	const [scale, setScale] = useState<number>(1.0);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);

	function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
		setNumPages(numPages);
		setIsLoading(false);
		setError(null);
	}

	function onDocumentLoadError(error: Error) {
		console.error("Error loading PDF:", error);
		setError("Failed to load PDF. Please try again.");
		setIsLoading(false);
	}

	const goToPrevPage = useCallback(() => {
		setPageNumber((prev) => Math.max(prev - 1, 1));
	}, []);

	const goToNextPage = useCallback(() => {
		setPageNumber((prev) => Math.min(prev + 1, numPages));
	}, [numPages]);

	const zoomIn = useCallback(() => {
		setScale((prev) => Math.min(prev + 0.2, 3.0));
	}, []);

	const zoomOut = useCallback(() => {
		setScale((prev) => Math.max(prev - 0.2, 0.5));
	}, []);

	const handleDownload = () => {
		const link = document.createElement("a");
		link.href = fileUrl;
		link.download = fileName || "document.pdf";
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			switch (e.key) {
				case "Escape":
					onClose();
					break;
				case "ArrowLeft":
					e.preventDefault();
					goToPrevPage();
					break;
				case "ArrowRight":
					e.preventDefault();
					goToNextPage();
					break;
				case "+":
				case "=":
					e.preventDefault();
					zoomIn();
					break;
				case "-":
					e.preventDefault();
					zoomOut();
					break;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, onClose, goToPrevPage, goToNextPage, zoomIn, zoomOut]);

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-[9999] bg-black flex flex-col">
			<div className="bg-black border-b border-neutral-800 px-6 py-3 flex-shrink-0">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-4">
						<h2 className="text-lg font-semibold text-white">
							{fileName || "Document Viewer"}
						</h2>
						{numPages > 0 && (
							<span className="text-sm text-neutral-400">
								Page {pageNumber} of {numPages}
							</span>
						)}
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={handleDownload}
							className="text-white hover:bg-neutral-800">
							<Download className="w-4 h-4 mr-2" />
							Download
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={onClose}
							className="text-white hover:bg-neutral-800">
							<X className="w-5 h-5" />
						</Button>
					</div>
				</div>
			</div>

			<div className="bg-black border-b border-neutral-800 px-6 py-2 flex-shrink-0">
				<div className="flex items-center justify-center gap-4">
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={goToPrevPage}
							disabled={pageNumber <= 1}
							className="text-white hover:bg-neutral-700 disabled:opacity-30">
							<ChevronLeft className="w-4 h-4" />
						</Button>
						<div className="flex items-center gap-2 min-w-[100px] justify-center">
							<input
								type="number"
								min={1}
								max={numPages}
								value={pageNumber}
								onChange={(e) => {
									const page = parseInt(e.target.value, 10);
									if (page >= 1 && page <= numPages) {
										setPageNumber(page);
									}
								}}
								className="w-16 px-2 py-1 text-center bg-neutral-700 border border-neutral-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
							/>
							<span className="text-sm text-neutral-400">/ {numPages}</span>
						</div>
						<Button
							variant="ghost"
							size="sm"
							onClick={goToNextPage}
							disabled={pageNumber >= numPages}
							className="text-white hover:bg-neutral-700 disabled:opacity-30">
							<ChevronRight className="w-4 h-4" />
						</Button>
					</div>

					<div className="flex items-center gap-2 ml-4">
						<Button
							variant="ghost"
							size="sm"
							onClick={zoomOut}
							disabled={scale <= 0.5}
							className="text-white hover:bg-neutral-700 disabled:opacity-30">
							<ZoomOut className="w-4 h-4" />
						</Button>
						<span className="text-sm text-white min-w-[60px] text-center">
							{Math.round(scale * 100)}%
						</span>
						<Button
							variant="ghost"
							size="sm"
							onClick={zoomIn}
							disabled={scale >= 3.0}
							className="text-white hover:bg-neutral-700 disabled:opacity-30">
							<ZoomIn className="w-4 h-4" />
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setScale(1.0)}
							className="text-white hover:bg-neutral-700 text-xs ml-2">
							Reset
						</Button>
					</div>
				</div>
			</div>

			<div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-neutral-950">
				{isLoading && (
					<div className="flex flex-col items-center justify-center h-full">
						<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
						<p className="text-white text-sm">Loading PDF...</p>
					</div>
				)}

				{error && (
					<div className="flex flex-col items-center justify-center h-full">
						<div className="bg-red-900/50 border border-red-700 rounded-lg p-6 max-w-md">
							<p className="text-red-200 text-sm mb-4">{error}</p>
							<Button variant="outline" size="sm" onClick={onClose} className="w-full">
								Close
							</Button>
						</div>
					</div>
				)}

				{!error && (
					<div className="pdf-container">
						<Document
							file={fileUrl}
							onLoadSuccess={onDocumentLoadSuccess}
							onLoadError={onDocumentLoadError}
							loading={
								<div className="flex items-center justify-center min-h-[600px]">
									<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
								</div>
							}>
							<Page
								pageNumber={pageNumber}
								scale={scale}
								renderTextLayer={true}
								renderAnnotationLayer={true}
								className="shadow-2xl"
							/>
						</Document>
					</div>
				)}
			</div>

			<div className="bg-black border-t border-neutral-800 px-6 py-2 flex-shrink-0">
				<div className="flex items-center justify-center gap-6 text-xs text-neutral-500">
					<span>Left/Right navigate pages</span>
					<span>+/- zoom in/out</span>
					<span>ESC close</span>
				</div>
			</div>
		</div>
	);
}
