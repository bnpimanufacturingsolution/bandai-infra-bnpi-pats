import { useState } from "react";
import { format } from "date-fns";
import { Clock, CheckCircle, XCircle, Play, FileText, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "~/components/atoms";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { TerminationReviewModal } from "~/components/molecules/TerminationReviewModal";
import {
	useTerminations,
	useHRDirectorApproval,
	useLegalApproval,
	useStartProcessing,
	useCompleteTermination,
} from "~/lib/hooks/useTerminations";
import {
	TERMINATION_TYPE_LABELS,
	TERMINATION_STATUS_LABELS,
	type TerminationType,
	type TerminationStatus,
} from "~/zod/termination.zod";
import { useAuth } from "~/lib/hooks/use-auth";

// Helper to get status badge variant
const getStatusVariant = (status: TerminationStatus) => {
	switch (status) {
		case "DRAFT":
			return "secondary";
		case "PENDING_HR_DIRECTOR":
		case "PENDING_LEGAL":
			return "warning";
		case "APPROVED":
			return "success";
		case "REJECTED":
			return "destructive";
		case "PROCESSING":
			return "default";
		case "COMPLETED":
			return "default";
		default:
			return "secondary";
	}
};

// Helper to get employee full name
const getEmployeeName = (employee: any): string => {
	if (!employee?.person?.personalInfo) return employee?.employeeId || "Unknown";
	const { firstName, lastName } = employee.person.personalInfo;
	return `${firstName || ""} ${lastName || ""}`.trim() || employee.employeeId;
};

export default function TerminationList() {
	const { user } = useAuth();
	const [showApprovalDialog, setShowApprovalDialog] = useState(false);
	const [selectedTermination, setSelectedTermination] = useState<any>(null);

	// Queries and mutations
	const { data: terminationsData, isLoading } = useTerminations({
		document: true,
		pagination: true,
		count: true,
	});

	const hrDirectorApprovalMutation = useHRDirectorApproval();
	const legalApprovalMutation = useLegalApproval();
	const startProcessingMutation = useStartProcessing();
	const completeMutation = useCompleteTermination();

	const terminations = terminationsData?.terminations || [];

	const handleApproval = async (action: "approve" | "reject", comments: string) => {
		if (!selectedTermination) return;

		try {
			const approverId = user?.metadata?.employee?.id || "";
			if (selectedTermination.status === "PENDING_HR_DIRECTOR") {
				await hrDirectorApprovalMutation.mutateAsync({
					terminationId: selectedTermination.id,
					data: { approverId, action, comments: comments || undefined },
				});
			} else if (selectedTermination.status === "PENDING_LEGAL") {
				await legalApprovalMutation.mutateAsync({
					terminationId: selectedTermination.id,
					data: { approverId, action, comments: comments || undefined },
				});
			}
			toast.success(`Termination ${action}d successfully`);
			setShowApprovalDialog(false);
			setSelectedTermination(null);
		} catch (error) {
			toast.error(`Failed to ${action} termination`);
		}
	};

	const handleStartProcessing = async (terminationId: string) => {
		try {
			await startProcessingMutation.mutateAsync(terminationId);
			toast.success("Processing started");
		} catch (error) {
			toast.error("Failed to start processing");
		}
	};

	const handleComplete = async (terminationId: string) => {
		try {
			await completeMutation.mutateAsync({ terminationId });
			toast.success("Termination completed - Employee status updated");
		} catch (error) {
			toast.error("Failed to complete termination");
		}
	};

	const openApprovalDialog = (termination: any) => {
		setSelectedTermination(termination);
		setShowApprovalDialog(true);
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-[400px]">
				<Clock className="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<AlertTriangle className="h-5 w-5" />
						All Terminations
					</CardTitle>
				</CardHeader>
				<CardContent>
					{terminations.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12 text-center">
							<FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
							<h3 className="text-lg font-medium">No terminations found</h3>
							<p className="text-muted-foreground">
								Termination requests will appear here when created from Employee
								Management.
							</p>
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Number</TableHead>
									<TableHead>Employee</TableHead>
									<TableHead>Type</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Last Working Day</TableHead>
									<TableHead>Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{terminations.map((termination: any) => (
									<TableRow key={termination.id}>
										<TableCell className="font-mono text-sm">
											{termination.terminationNumber}
										</TableCell>
										<TableCell>
											<div>
												<p className="font-medium">
													{getEmployeeName(termination.employee)}
												</p>
												<p className="text-xs text-muted-foreground">
													{termination.employee?.employeeId}
												</p>
											</div>
										</TableCell>
										<TableCell>
											{
												TERMINATION_TYPE_LABELS[
													termination.terminationType as TerminationType
												]
											}
										</TableCell>
										<TableCell>
											<Badge variant={getStatusVariant(termination.status)}>
												{
													TERMINATION_STATUS_LABELS[
														termination.status as TerminationStatus
													]
												}
											</Badge>
										</TableCell>
										<TableCell>
											{format(
												new Date(termination.lastWorkingDay),
												"MMM d, yyyy",
											)}
										</TableCell>
										<TableCell>
											<div className="flex gap-2">
												{(termination.status === "PENDING_HR_DIRECTOR" ||
													termination.status === "PENDING_LEGAL") && (
													<Button
														size="sm"
														variant="default"
														onClick={() =>
															openApprovalDialog(termination)
														}>
														Review
													</Button>
												)}
												{termination.status === "APPROVED" && (
													<Button
														size="sm"
														variant="outline"
														onClick={() =>
															handleStartProcessing(termination.id)
														}>
														<Play className="h-4 w-4 mr-1" />
														Start
													</Button>
												)}
												{termination.status === "PROCESSING" && (
													<Button
														size="sm"
														variant="default"
														onClick={() =>
															handleComplete(termination.id)
														}>
														<CheckCircle className="h-4 w-4 mr-1" />
														Complete
													</Button>
												)}
												{termination.status === "COMPLETED" && (
													<span className="text-sm text-green-600 font-medium">
														✓ Done
													</span>
												)}
												{termination.status === "REJECTED" && (
													<span className="text-sm text-red-600 font-medium">
														Rejected
													</span>
												)}
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

			<TerminationReviewModal
				open={showApprovalDialog}
				onOpenChange={setShowApprovalDialog}
				termination={selectedTermination}
				onConfirm={handleApproval}
				isProcessing={
					hrDirectorApprovalMutation.isPending || legalApprovalMutation.isPending
				}
			/>
		</div>
	);
}
