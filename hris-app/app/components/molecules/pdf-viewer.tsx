import { lazy, Suspense } from "react";

interface PDFViewerProps {
	url: string;
	onLoadSuccess?: () => void;
	initialScale?: number;
	fileName?: string;
}

const PDFViewerContent = lazy(() => import("./pdf-viewer-content"));

const PDFViewerFallback = () => (
	<div className="flex min-h-[320px] items-center justify-center border border-border bg-muted/30 p-8">
		<div className="text-sm text-muted-foreground">Loading PDF viewer...</div>
	</div>
);

export function PDFViewer(props: PDFViewerProps) {
	return (
		<Suspense fallback={<PDFViewerFallback />}>
			<PDFViewerContent {...props} />
		</Suspense>
	);
}
