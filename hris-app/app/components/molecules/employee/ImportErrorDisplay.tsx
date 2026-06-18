import { AlertCircle, AlertTriangle, X } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";

interface ImportError {
	summary?: {
		total?: number;
		totalRows?: number;
		successful?: number;
		success?: number;
		failed?: number;
		created?: number;
		updated?: number;
	};
	results?: Array<{
		row: number;
		success: boolean;
		error?: string;
		data?: any;
		employeeId?: string;
		date?: string;
		action?: string;
	}>;
}

interface ImportErrorDisplayProps {
	error: ImportError | string;
	onDismiss: () => void;
}

export function ImportErrorDisplay({ error, onDismiss }: ImportErrorDisplayProps) {
	const isDetailedError = typeof error === "object" && error.results;

	if (!isDetailedError) {
		return (
			<div className="p-4 bg-red-50 border border-red-200 rounded-lg">
				<div className="flex items-start gap-3">
					<AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
					<div className="flex-1">
						<h4 className="text-sm font-semibold text-red-900 mb-1">Import Failed</h4>
						<p className="text-xs text-red-700">
							{typeof error === "string" ? error : "An error occurred during import"}
						</p>
					</div>
					<Button variant="ghost" size="icon" onClick={onDismiss} className="h-6 w-6">
						<X className="h-4 w-4" />
					</Button>
				</div>
			</div>
		);
	}

	const failedResults = error.results?.filter((r) => !r.success) || [];
	const total = error.summary?.total || error.summary?.totalRows || 0;
	const successful = error.summary?.successful || error.summary?.success || 0;
	const failed = error.summary?.failed || 0;

	return (
		<div className="space-y-4">
			{/* Summary */}
			<div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
				<div className="flex items-start gap-3">
					<AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
					<div className="flex-1">
						<h4 className="text-sm font-semibold text-yellow-900 mb-1">
							Import Completed with Errors
						</h4>
						<p className="text-xs text-yellow-700">
							{successful} of {total} records imported successfully. {failed} failed.
						</p>
					</div>
					<Button variant="ghost" size="icon" onClick={onDismiss} className="h-6 w-6">
						<X className="h-4 w-4" />
					</Button>
				</div>
			</div>

			{/* Failed Records */}
			{failedResults.length > 0 && (
				<div className="border rounded-lg overflow-hidden">
					<div className="bg-gray-50 px-4 py-2 border-b">
						<h5 className="text-sm font-semibold text-gray-900">Failed Records</h5>
					</div>
					<div className="max-h-64 overflow-y-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-20">Row</TableHead>
									<TableHead className="w-32">Employee ID</TableHead>
									<TableHead>Error</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{failedResults.map((result, idx) => (
									<TableRow key={idx}>
										<TableCell className="font-mono text-xs">
											{result.row}
										</TableCell>
										<TableCell className="font-mono text-xs">
											{result.employeeId || "-"}
										</TableCell>
										<TableCell className="text-xs text-red-600">
											{result.error || "Unknown error"}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				</div>
			)}
		</div>
	);
}
