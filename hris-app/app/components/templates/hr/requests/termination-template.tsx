import { useState } from "react";

import {
	useTerminations,
	useCreateTermination,
	useSubmitTermination,
	useHRDirectorApproval,
	useLegalApproval,
	useStartProcessing,
	useCompleteTermination,
	useDeleteTermination,
} from "~/lib/hooks/useTerminations";
import {
	TERMINATION_TYPE_LABELS,
	TERMINATION_STATUS_LABELS,
	type TerminationType,
	type TerminationStatus,
} from "~/zod/termination.zod";
import { format } from "date-fns";
import { Plus, CheckCircle, XCircle, Clock, FileText, Trash2, Send, Play } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "~/components/atoms";
import { Textarea } from "~/components/ui/textarea";
import { useAuth } from "~/lib/hooks/use-auth";
import { useEmployees } from "~/lib/hooks";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Input } from "~/components/ui/input";
import { CalendarDatePicker } from "~/components/ui/calendar-date-picker";

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
			return "info";
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

export function TerminationRequestsPage() {
	const { user } = useAuth();
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [showApprovalDialog, setShowApprovalDialog] = useState(false);
	const [selectedTermination, setSelectedTermination] = useState<any>(null);

	// Form state
	const [employeeId, setEmployeeId] = useState("");
	const [terminationType, setTerminationType] = useState<TerminationType | "">("");
	const [terminationDate, setTerminationDate] = useState("");
	const [lastWorkingDay, setLastWorkingDay] = useState("");
	const [reason, setReason] = useState("");
	const [severancePackage, setSeverancePackage] = useState("");
	const [approvalComments, setApprovalComments] = useState("");

	// Queries and mutations
	const { data: terminationsData, isLoading } = useTerminations({
		document: true,
		pagination: true,
		count: true,
	});
	const { data: employeesData } = useEmployees({
		document: true,
		filter: "employmentStatus:ACTIVE,employmentStatus:PROBATIONARY",
	});

	const createMutation = useCreateTermination();
	const submitMutation = useSubmitTermination();
	const hrDirectorApprovalMutation = useHRDirectorApproval();
	const legalApprovalMutation = useLegalApproval();
	const startProcessingMutation = useStartProcessing();
	const completeMutation = useCompleteTermination();
	const deleteMutation = useDeleteTermination();

	const terminations = terminationsData?.terminations || [];
	const employees = employeesData?.employees || [];

	const resetForm = () => {
		setEmployeeId("");
		setTerminationType("");
		setTerminationDate("");
		setLastWorkingDay("");
		setReason("");
		setSeverancePackage("");
	};

	const handleCreate = async () => {
		if (!employeeId || !terminationType || !terminationDate || !lastWorkingDay || !reason) {
			toast.error("Please fill in all required fields");
			return;
		}

		if (reason.length < 10) {
			toast.error("Reason must be at least 10 characters");
			return;
		}

		try {
			await createMutation.mutateAsync({
				employeeId,
				initiatedById: user?.metadata?.employee?.id || "",
				terminationType: terminationType as TerminationType,
				terminationDate: new Date(terminationDate),
				lastWorkingDay: new Date(lastWorkingDay),
				reason,
				severancePackage: severancePackage || undefined,
				supportingDocuments: [],
				legalApprovalRequired: false,
			});
			toast.success("Termination draft created successfully");
			setShowCreateDialog(false);
			resetForm();
		} catch (error) {
			toast.error("Failed to create termination");
		}
	};

	const handleSubmit = async (terminationId: string) => {
		try {
			await submitMutation.mutateAsync(terminationId);
			toast.success("Termination submitted for approval");
		} catch (error) {
			toast.error("Failed to submit termination");
		}
	};

	const handleApproval = async (action: "approve" | "reject") => {
		if (!selectedTermination) return;

		try {
			const approverId = user?.metadata?.employee?.id || "";
			if (selectedTermination.status === "PENDING_HR_DIRECTOR") {
				await hrDirectorApprovalMutation.mutateAsync({
					terminationId: selectedTermination.id,
					data: { approverId, action, comments: approvalComments || undefined },
				});
			} else if (selectedTermination.status === "PENDING_LEGAL") {
				await legalApprovalMutation.mutateAsync({
					terminationId: selectedTermination.id,
					data: { approverId, action, comments: approvalComments || undefined },
				});
			}
			toast.success(`Termination ${action}d successfully`);
			setShowApprovalDialog(false);
			setSelectedTermination(null);
			setApprovalComments("");
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
			toast.success("Termination completed");
		} catch (error) {
			toast.error("Failed to complete termination");
		}
	};

	const handleDelete = async (terminationId: string) => {
		if (!confirm("Are you sure you want to delete this termination?")) return;
		try {
			await deleteMutation.mutateAsync(terminationId);
			toast.success("Termination deleted");
		} catch (error) {
			toast.error("Failed to delete termination");
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
		<div className="space-y-6 p-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">Termination Management</h1>
					<p className="text-muted-foreground">Manage employee termination requests</p>
				</div>
				<Button onClick={() => setShowCreateDialog(true)}>
					<Plus className="mr-2 h-4 w-4" />
					New Termination
				</Button>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Termination Requests</CardTitle>
				</CardHeader>
				<CardContent>
					{terminations.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12 text-center">
							<FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
							<h3 className="text-lg font-medium">No terminations found</h3>
							<p className="text-muted-foreground">
								Create a new termination request to get started.
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
									<TableHead>Initiated By</TableHead>
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
											{getEmployeeName(termination.employee)}
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
											{getEmployeeName(termination.initiatedBy)}
										</TableCell>
										<TableCell>
											<div className="flex gap-2">
												{termination.status === "DRAFT" && (
													<>
														<Button
															size="sm"
															variant="outline"
															onClick={() =>
																handleSubmit(termination.id)
															}>
															<Send className="h-4 w-4" />
														</Button>
														<Button
															size="sm"
															variant="destructive"
															onClick={() =>
																handleDelete(termination.id)
															}>
															<Trash2 className="h-4 w-4" />
														</Button>
													</>
												)}
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
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

			{/* Create Termination Dialog */}
			<Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>New Termination Request</DialogTitle>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div>
							<Label htmlFor="employee">Employee *</Label>
							<Select value={employeeId} onValueChange={setEmployeeId}>
								<SelectTrigger>
									<SelectValue placeholder="Select employee" />
								</SelectTrigger>
								<SelectContent>
									{employees.map((emp: any) => (
										<SelectItem key={emp.id} value={emp.id}>
											{getEmployeeName(emp)} ({emp.employeeId})
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div>
							<Label htmlFor="type">Termination Type *</Label>
							<Select
								value={terminationType}
								onValueChange={(v) => setTerminationType(v as TerminationType)}>
								<SelectTrigger>
									<SelectValue placeholder="Select type" />
								</SelectTrigger>
								<SelectContent>
									{Object.entries(TERMINATION_TYPE_LABELS).map(([key, label]) => (
										<SelectItem key={key} value={key}>
											{label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div>
								<Label htmlFor="terminationDate">Termination Date *</Label>
								<CalendarDatePicker
									value={terminationDate}
									onChange={setTerminationDate}
								/>
							</div>
							<div>
								<Label htmlFor="lastWorkingDay">Last Working Day *</Label>
								<CalendarDatePicker
									value={lastWorkingDay}
									onChange={setLastWorkingDay}
								/>
							</div>
						</div>

						<div>
							<Label htmlFor="reason">Reason *</Label>
							<Textarea
								id="reason"
								placeholder="Detailed reason for termination (min 10 characters)"
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								rows={3}
							/>
						</div>

						<div>
							<Label htmlFor="severance">Severance Package (optional)</Label>
							<Input
								id="severance"
								placeholder="e.g., 2 months salary + benefits"
								value={severancePackage}
								onChange={(e) => setSeverancePackage(e.target.value)}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setShowCreateDialog(false)}>
							Cancel
						</Button>
						<Button onClick={handleCreate} disabled={createMutation.isPending}>
							{createMutation.isPending ? "Creating..." : "Create Draft"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Approval Dialog */}
			<Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Review Termination</DialogTitle>
					</DialogHeader>
					{selectedTermination && (
						<div className="space-y-4 py-4">
							<div className="grid grid-cols-2 gap-4">
								<div>
									<Label className="text-muted-foreground text-sm">
										Employee
									</Label>
									<p className="font-medium">
										{getEmployeeName(selectedTermination.employee)}
									</p>
								</div>
								<div>
									<Label className="text-muted-foreground text-sm">Type</Label>
									<p className="font-medium">
										{
											TERMINATION_TYPE_LABELS[
												selectedTermination.terminationType as TerminationType
											]
										}
									</p>
								</div>
							</div>
							<div>
								<Label className="text-muted-foreground text-sm">Reason</Label>
								<p className="font-medium">{selectedTermination.reason}</p>
							</div>
							<div>
								<Label htmlFor="comments">Comments (optional)</Label>
								<Textarea
									id="comments"
									placeholder="Add your comments..."
									value={approvalComments}
									onChange={(e) => setApprovalComments(e.target.value)}
									rows={2}
								/>
							</div>
						</div>
					)}
					<DialogFooter className="flex gap-2">
						<Button variant="outline" onClick={() => setShowApprovalDialog(false)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={() => handleApproval("reject")}
							disabled={
								hrDirectorApprovalMutation.isPending ||
								legalApprovalMutation.isPending
							}>
							<XCircle className="h-4 w-4 mr-1" />
							Reject
						</Button>
						<Button
							onClick={() => handleApproval("approve")}
							disabled={
								hrDirectorApprovalMutation.isPending ||
								legalApprovalMutation.isPending
							}>
							<CheckCircle className="h-4 w-4 mr-1" />
							Approve
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

export default TerminationRequestsPage;
