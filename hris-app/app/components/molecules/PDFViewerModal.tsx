import { lazy, Suspense } from "react";

interface PDFViewerModalProps {
	isOpen: boolean;
	pdfUrl: string;
	title: string;
	onClose: () => void;
}

const MoleculePDFViewerModalContent = lazy(() => import("./PDFViewerModal-content"));

export function PDFViewerModal(props: PDFViewerModalProps) {
	return (
		<Suspense fallback={null}>
			<MoleculePDFViewerModalContent {...props} />
		</Suspense>
	);
}
