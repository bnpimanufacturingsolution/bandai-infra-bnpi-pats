import { useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "~/components/ui/button";
import { DocumentFileViewer } from "~/components/molecules/document-file-viewer";

export default function DocumentViewer() {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();

	const fileUrl = searchParams.get("url") || "";
	const fileName = searchParams.get("name") || "Document";
	const fileExt = searchParams.get("ext") || "";

	const handleDownload = () => {
		const link = document.createElement("a");
		link.href = fileUrl;
		link.download = fileName || "document";
		link.target = "_blank";
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	const handleBack = useCallback(() => {
		navigate(-1);
	}, [navigate]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				handleBack();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handleBack]);

	if (!fileUrl) {
		return (
			<div className="flex h-screen items-center justify-center bg-background">
				<div className="text-center">
					<p className="mb-4 text-destructive">No document URL provided</p>
					<Button onClick={handleBack} variant="outline">
						Go Back
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full w-full flex-col bg-background">
			<div className="flex-shrink-0 border-b border-border bg-card px-4 py-3 sm:px-6">
				<div className="flex items-center justify-between gap-4">
					<div className="flex min-w-0 items-center gap-3">
						<Button
							variant="ghost"
							size="sm"
							onClick={handleBack}
							className="flex-shrink-0">
							<ArrowLeft className="mr-2 h-4 w-4" />
							Back
						</Button>
						<div className="min-w-0">
							<h2 className="truncate text-base font-semibold text-foreground sm:text-lg">
								{fileName}
							</h2>
						</div>
					</div>
					<Button
						variant="ghost"
						size="sm"
						onClick={handleDownload}
						className="flex-shrink-0">
						<Download className="h-4 w-4 sm:mr-2" />
						<span className="hidden sm:inline">Download</span>
					</Button>
				</div>
			</div>

			<div className="flex-1 overflow-hidden bg-muted/30">
				<DocumentFileViewer url={fileUrl} fileName={fileName} ext={fileExt} />
			</div>

			<div className="flex-shrink-0 border-t border-border bg-card px-4 py-2 sm:px-6">
				<div className="flex items-center justify-center text-xs text-muted-foreground">
					<span>ESC Back</span>
				</div>
			</div>
		</div>
	);
}
