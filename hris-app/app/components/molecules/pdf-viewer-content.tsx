import { useState, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
	ChevronLeft,
	ChevronRight,
	ZoomIn,
	ZoomOut,
	RotateCw,
	Download,
	Loader2,
	ExternalLink,
	FileWarning,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Set up PDF.js worker only when the PDF viewer chunk loads.
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
	url: string;
	onLoadSuccess?: () => void;
	initialScale?: number;
	fileName?: string;
}

export default function PDFViewerContent({
	url,
	onLoadSuccess,
	initialScale = 1,
	fileName,
}: PDFViewerProps) {
	const [numPages, setNumPages] = useState<number | null>(null);
	const [pageNumber, setPageNumber] = useState(1);
	const [scale, setScale] = useState(initialScale);
	const [rotation, setRotation] = useState(0);
	const [isDragging, setIsDragging] = useState(false);
	const [position, setPosition] = useState({ x: 0, y: 0 });
	const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

	const containerRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const [containerWidth, setContainerWidth] = useState<number>(800);

	useEffect(() => {
		if (!containerRef.current) return;

		const resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				setContainerWidth(entry.contentRect.width);
			}
		});

		resizeObserver.observe(containerRef.current);
		setContainerWidth(containerRef.current.clientWidth);

		return () => resizeObserver.disconnect();
	}, []);

	function onDocumentLoadSuccessInternal({ numPages }: { numPages: number }) {
		setNumPages(numPages);
		onLoadSuccess?.();
	}

	const changePage = (offset: number) => {
		setPageNumber((prev) => Math.max(1, Math.min(prev + offset, numPages || 1)));
	};

	const previousPage = () => changePage(-1);
	const nextPage = () => changePage(1);

	const zoomIn = () => setScale((prev) => Math.min(prev + 0.2, 4.0));
	const zoomOut = () => setScale((prev) => Math.max(prev - 0.2, 0.5));

	const rotate = () => setRotation((prev) => (prev + 90) % 360);

	const handleMouseDown = (e: React.MouseEvent) => {
		if (e.button === 0) {
			setIsDragging(true);
			setDragStart({
				x: e.clientX - position.x,
				y: e.clientY - position.y,
			});
		}
	};

	const handleMouseMove = (e: React.MouseEvent) => {
		if (isDragging) {
			setPosition({
				x: e.clientX - dragStart.x,
				y: e.clientY - dragStart.y,
			});
		}
	};

	const handleMouseUp = () => setIsDragging(false);
	const handleMouseLeave = () => setIsDragging(false);

	const resetView = () => {
		setScale(1);
		setPosition({ x: 0, y: 0 });
		setRotation(0);
	};

	const handleDownload = async () => {
		try {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error("Failed to download file");
			}
			const blob = await response.blob();
			const blobUrl = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = blobUrl;
			link.download = fileName || "document.pdf";
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(blobUrl);
		} catch (error) {
			console.error("Download failed:", error);
		}
	};

	const handleOpenFile = () => {
		window.open(url, "_blank", "noopener,noreferrer");
	};

	const renderPreviewUnavailable = () => (
		<div className="flex min-h-[320px] items-center justify-center p-8 text-center">
			<div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-sm">
				<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
					<FileWarning className="h-6 w-6 text-muted-foreground" />
				</div>
				<h3 className="text-base font-semibold text-foreground">Preview unavailable</h3>
				<p className="mt-2 text-sm text-muted-foreground">
					This file could not be rendered as a PDF. You can still open or download it.
				</p>
				<div className="mt-5 flex flex-wrap items-center justify-center gap-2">
					<Button type="button" variant="outline" size="sm" onClick={handleOpenFile}>
						<ExternalLink className="mr-2 h-4 w-4" />
						Open file
					</Button>
					<Button type="button" variant="outline" size="sm" onClick={handleDownload}>
						<Download className="mr-2 h-4 w-4" />
						Download
					</Button>
				</div>
			</div>
		</div>
	);

	const baseWidth = containerWidth ? containerWidth - 48 : undefined;

	return (
		<div className="w-full h-full flex flex-col bg-muted/30 overflow-hidden border border-border">
			<div className="flex items-center justify-between p-2 border-b border-border bg-background sticky top-0 z-10 shrink-0">
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						onClick={previousPage}
						disabled={pageNumber <= 1}
						className="h-8 w-8 p-0">
						<ChevronLeft className="h-4 w-4" />
					</Button>
					<span className="text-xs font-medium min-w-[80px] text-center">
						Page {pageNumber} of {numPages || "--"}
					</span>
					<Button
						variant="ghost"
						size="sm"
						onClick={nextPage}
						disabled={numPages ? pageNumber >= numPages : true}
						className="h-8 w-8 p-0">
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>

				<div className="flex items-center gap-1">
					<Button variant="ghost" size="sm" onClick={zoomOut} className="h-8 w-8 p-0">
						<ZoomOut className="h-4 w-4" />
					</Button>
					<span className="text-xs font-medium min-w-[50px] text-center">
						{Math.round(scale * 100)}%
					</span>
					<Button variant="ghost" size="sm" onClick={zoomIn} className="h-8 w-8 p-0">
						<ZoomIn className="h-4 w-4" />
					</Button>
					<div className="w-[1px] h-4 bg-border mx-1" />
					<Button variant="ghost" size="sm" onClick={rotate} className="h-8 w-8 p-0">
						<RotateCw className="h-4 w-4" />
					</Button>
					<Button variant="ghost" size="sm" onClick={resetView} className="h-8 px-2 text-xs">
						Reset
					</Button>
					<div className="w-[1px] h-4 bg-border mx-1" />
					<Button
						variant="ghost"
						size="sm"
						onClick={handleDownload}
						className="h-8 w-8 p-0">
						<Download className="h-4 w-4" />
					</Button>
				</div>
			</div>

			<div
				ref={containerRef}
				className="flex-1 overflow-auto bg-muted/20 relative"
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseUp={handleMouseUp}
				onMouseLeave={handleMouseLeave}
				style={{ cursor: isDragging ? "grabbing" : "grab" }}>
				<div
					ref={contentRef}
					className="inline-block p-6"
					style={{
						transform: `translate(${position.x}px, ${position.y}px)`,
						transition: isDragging ? "none" : "transform 0.2s ease-out",
					}}>
					<div className="shadow-2xl bg-white inline-block">
						<Document
							file={url}
							onLoadSuccess={onDocumentLoadSuccessInternal}
							loading={
								<div className="fixed inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none">
									<Loader2 className="h-10 w-10 animate-spin text-primary" />
									<p className="text-sm text-muted-foreground">Loading Document...</p>
								</div>
							}
							error={renderPreviewUnavailable()}>
							<Page
								pageNumber={pageNumber}
								width={baseWidth}
								scale={scale}
								rotate={rotation}
								renderAnnotationLayer={true}
								renderTextLayer={true}
							/>
						</Document>
					</div>
				</div>
			</div>
		</div>
	);
}
