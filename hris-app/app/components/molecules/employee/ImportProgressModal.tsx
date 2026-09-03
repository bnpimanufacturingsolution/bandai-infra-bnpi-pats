import { useEffect } from "react";
import { Modal } from "~/components/atoms/Modal";
import { Progress } from "~/components/ui/progress";
import { CheckCircle, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ImportJobProgress } from "~/lib/hooks/useImportProgress";

interface ImportProgressModalProps {
	open: boolean;
	progress: ImportJobProgress | null | undefined;
	onComplete: (success: boolean) => void;
}

export function ImportProgressModal({ open, progress, onComplete }: ImportProgressModalProps) {
	const percentage = progress ? Math.round((progress.processed / progress.total) * 100) : 0;
	const isComplete = progress?.status === "completed";
	const isFailed = progress?.status === "failed";
	const isProcessing = progress?.status === "processing";

	// Handle completion
	useEffect(() => {
		if (isComplete) {
			const hasErrors = (progress?.failed || 0) > 0;
			if (hasErrors) {
				toast.warning(
					`Import completed with ${progress.failed} failed records out of ${progress.total}`,
				);
			} else {
				toast.success(`Successfully imported ${progress.success} employees!`);
			}

			// Auto-close after a short delay
			const timer = setTimeout(() => {
				onComplete(true);
			}, 1500);

			return () => clearTimeout(timer);
		} else if (isFailed) {
			toast.error("Import failed. Please try again.");
			onComplete(false);
		}
	}, [isComplete, isFailed, progress, onComplete]);

	if (!progress) {
		return null;
	}

	return (
		<Modal
			open={open}
			onOpenChange={(shouldOpen) => {
				// Prevent closing while processing
				if (!shouldOpen && isProcessing) {
					toast.info("Please wait for the import to complete");
					return;
				}
				if (!shouldOpen) {
					onComplete(false);
				}
			}}
			title="Importing Employees"
			description="Please wait while we process your employee data"
			className="max-w-lg">
			<div className="space-y-6">
				{/* Progress Bar */}
				<div className="space-y-2">
					<div className="flex justify-between text-sm">
						<span className="text-gray-600">
							Processing {progress.processed} of {progress.total} employees
						</span>
						<span className="font-semibold text-gray-900">{percentage}%</span>
					</div>
					<Progress value={percentage} className="h-3" />
				</div>

				{/* Status Counts */}
				<div className="grid grid-cols-2 gap-4">
					<div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
						<CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
						<div>
							<div className="text-xs text-green-600 font-medium">Successful</div>
							<div className="text-lg font-bold text-green-900">
								{progress.success}
							</div>
						</div>
					</div>
					<div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
						<XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
						<div>
							<div className="text-xs text-red-600 font-medium">Failed</div>
							<div className="text-lg font-bold text-red-900">{progress.failed}</div>
						</div>
					</div>
				</div>

				{/* Recent Errors */}
				{progress?.errors && progress.errors.length > 0 && (
					<div className="space-y-2">
						<div className="flex items-center gap-2 text-sm font-medium text-gray-700">
							<AlertCircle className="h-4 w-4 text-orange-500" />
							Recent Errors (showing last {Math.min(5, progress?.errors?.length || 0)}
							)
						</div>
						<div className="max-h-32 overflow-y-auto space-y-1 bg-gray-50 rounded-lg p-3 border border-gray-200">
							{progress?.errors
								.slice(-5)
								.reverse()
								.map((error, idx) => (
									<div key={idx} className="text-xs text-gray-600">
										<span className="font-medium text-gray-900">
											Row {error.row}:
										</span>{" "}
										{error.employeeId} - {error.error}
									</div>
								))}
						</div>
					</div>
				)}

				{/* Processing Status */}
				{isProcessing && (
					<div className="flex items-center justify-center gap-2 text-sm text-blue-600 p-3 bg-blue-50 rounded-lg border border-blue-200">
						<Loader2 className="h-4 w-4 animate-spin" />
						<span>Import in progress... Please do not close this window.</span>
					</div>
				)}

				{/* Completion Status */}
				{isComplete && (
					<div className="flex items-center justify-center gap-2 text-sm text-green-600 p-3 bg-green-50 rounded-lg border border-green-200">
						<CheckCircle className="h-4 w-4" />
						<span>Import completed successfully!</span>
					</div>
				)}
			</div>
		</Modal>
	);
}
