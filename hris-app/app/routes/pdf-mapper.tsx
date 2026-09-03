import { lazy, Suspense, useState } from "react";
import pdf2316 from "~/assets/forms/2316 Sep 2021 ENCS_Final_corrected.pdf";

const PdfFieldMapper = lazy(() => import("~/components/PdfFieldMapper"));

export default function PdfMapperRoute() {
	const [pdfPath] = useState<string>(pdf2316);

	return (
		<div style={{ width: "100%", height: "100vh" }}>
			<Suspense fallback={<div style={{ padding: "2rem" }}>Loading PDF mapper...</div>}>
				<PdfFieldMapper pdfUrl={pdfPath} />
			</Suspense>
		</div>
	);
}
