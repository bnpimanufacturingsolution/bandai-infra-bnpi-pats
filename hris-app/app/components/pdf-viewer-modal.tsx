import { lazy, Suspense } from "react";

interface PDFViewerModalProps {
	isOpen: boolean;
	onClose: () => void;
	fileUrl: string;
	fileName?: string;
}

const PDFViewerModalContent = lazy(() => import("./pdf-viewer-modal-content"));

export function PDFViewerModal(props: PDFViewerModalProps) {
	return (
		<Suspense fallback={null}>
			<PDFViewerModalContent {...props} />
		</Suspense>
	);
}
