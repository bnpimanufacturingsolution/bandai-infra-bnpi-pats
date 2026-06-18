import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface PDFViewerModalProps {
	isOpen: boolean;
	pdfUrl: string;
	title: string;
	onClose: () => void;
}

export default function MoleculePDFViewerModalContent({
	isOpen,
	pdfUrl,
	title,
	onClose,
}: PDFViewerModalProps) {
	const [numPages, setNumPages] = useState<number | null>(null);
	const [currentPage, setCurrentPage] = useState(1);
	const [scale, setScale] = useState(1);
	const [isLoading, setIsLoading] = useState(true);

	const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
		setNumPages(numPages);
		setIsLoading(false);
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
			<div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-screen flex flex-col">
				<div className="flex items-center justify-between p-4 border-b border-gray-200">
					<h2 className="text-lg font-semibold text-gray-900 truncate">{title}</h2>
					<button
						onClick={onClose}
						className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
						<X className="w-5 h-5" />
					</button>
				</div>

				<div className="flex items-center justify-between p-3 bg-gray-50 border-b border-gray-200">
					<div className="flex items-center gap-2">
						<button
							onClick={() => currentPage > 1 && setCurrentPage(currentPage - 1)}
							disabled={currentPage <= 1}
							className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed transition">
							<ChevronLeft className="w-4 h-4" />
						</button>
						<span className="text-sm text-gray-600 min-w-fit">
							Page {currentPage}
							{numPages && ` of ${numPages}`}
						</span>
						<button
							onClick={() => numPages && currentPage < numPages && setCurrentPage(currentPage + 1)}
							disabled={!numPages || currentPage >= numPages}
							className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed transition">
							<ChevronRight className="w-4 h-4" />
						</button>
					</div>

					<div className="flex items-center gap-2">
						<button
							onClick={() => setScale(Math.max(scale - 0.2, 0.5))}
							disabled={scale <= 0.5}
							className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed transition"
							title="Zoom out">
							<ZoomOut className="w-4 h-4" />
						</button>
						<span className="text-sm text-gray-600 min-w-fit">
							{Math.round(scale * 100)}%
						</span>
						<button
							onClick={() => setScale(Math.min(scale + 0.2, 2))}
							disabled={scale >= 2}
							className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed transition"
							title="Zoom in">
							<ZoomIn className="w-4 h-4" />
						</button>
					</div>
				</div>

				<div className="flex-1 overflow-auto bg-gray-100 flex items-center justify-center">
					{isLoading && (
						<div className="flex items-center justify-center h-full">
							<div className="text-center">
								<div className="w-8 h-8 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-3"></div>
								<p className="text-gray-600">Loading PDF...</p>
							</div>
						</div>
					)}
					<Document
						file={pdfUrl}
						onLoadSuccess={onDocumentLoadSuccess}
						onLoadError={(error) => {
							console.error("Failed to load PDF:", error);
							setIsLoading(false);
						}}
						loading={<div></div>}>
						<Page pageNumber={currentPage} scale={scale} />
					</Document>
				</div>

				<div className="px-4 py-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-500 text-center">
					Use arrow keys or buttons to navigate, and controls to zoom
				</div>
			</div>
		</div>
	);
}
