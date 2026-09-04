import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import {
	Building2,
	User,
	ArrowRight,
	Calendar,
	Send,
	ShieldCheck,
	Sparkles,
	FileText,
	AlertCircle,
	CheckCircle,
	ArrowLeft,
	Briefcase,
	MapPin,
	Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import { Label } from "~/components/atoms/Label";
import { Badge } from "~/components/atoms/Badge";
import { Textarea } from "~/components/ui/textarea";
import { SearchableSelect } from "~/components/ui/searchable-select";
import { EmployeePickerSelect } from "~/components/molecules/employee/EmployeePickerSelect";
import { EmployeeAvatar } from "~/components/atoms/EmployeeAvatar";
import { useAuth } from "~/lib/hooks/use-auth";
import { useEmployee, useEmployees } from "~/lib/hooks/useEmployees";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useSections } from "~/lib/hooks/useSections";
import { usePositions } from "~/lib/hooks/usePositions";
import { useCreateRequest, useRequests } from "~/lib/hooks/useRequests";
import { toast } from "sonner";

const getEmployeeName = (emp?: any): string => {
	if (!emp) return "Unnamed employee";
	const info = emp?.person?.personalInfo;
	const name = `${info?.firstName || emp?.person?.firstName || emp?.firstName || ""} ${info?.lastName || emp?.person?.lastName || emp?.lastName || ""}`.trim();
	if (name) return name;
	if (emp?.fullName) return emp.fullName;
	if (emp?.name) return emp.name;
	if (emp?.user?.name) return emp.user.name;
	return emp?.employeeId ? `Employee ${emp.employeeId}` : "Unnamed employee";
};

export default function TransferPage() {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const initialEmployeeId = searchParams.get("employeeId") || "";

	const { user } = useAuth();
	const { mutate: createRequest, isPending: isSubmitting } = useCreateRequest({
		showErrorToast: true,
	});

	const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(initialEmployeeId);
	const [targetDepartmentId, setTargetDepartmentId] = useState<string>("");
	const [targetSectionId, setTargetSectionId] = useState<string>("");
	const [targetPositionId, setTargetPositionId] = useState<string>("");
	const [targetLocation, setTargetLocation] = useState<string>("ONSITE");
	const [targetSupervisorId, setTargetSupervisorId] = useState<string>("");
	const [effectiveDate, setEffectiveDate] = useState<string>(
		new Date().toISOString().slice(0, 10),
	);
	const [justification, setJustification] = useState<string>("");

	// Sync query param
	useEffect(() => {
		if (initialEmployeeId && initialEmployeeId !== selectedEmployeeId) {
			setSelectedEmployeeId(initialEmployeeId);
		}
	}, [initialEmployeeId]);

	// Fetch selected employee details
	const { data: employeeData, isLoading: isLoadingEmployee } = useEmployee(
		selectedEmployeeId,
		["id", "employeeId", "person.personalInfo", "department", "position", "level", "reportTo", "employmentType", "employmentStatus", "workLocation"],
		undefined,
	);
	const employee = employeeData as any;

	const { data: activeRequestsData } = useRequests(
		selectedEmployeeId
			? {
					targetEmployeeId: selectedEmployeeId,
					type: "TRANSFER",
					limit: 10,
				}
			: { enabled: false },
	);

	const activeExistingTransferRequest = useMemo(() => {
		const requests = (activeRequestsData?.data || (activeRequestsData as any)?.requests || []) as any[];
		return requests.find(
			(r: any) =>
				r.type === "TRANSFER" &&
				!["APPROVED", "REJECTED", "CANCELLED", "COMPLETED"].includes(
					String(r.currentWorkflowStateKey || r.status || "").toUpperCase(),
				),
		);
	}, [activeRequestsData]);

	// Fetch organizational lists
	const { data: employeesData } = useEmployees({
		page: 1,
		limit: 1000,
		fields: ["id", "employeeId", "person.personalInfo", "department", "position", "level", "reportTo", "isManager", "isHrManager", "role"],
	});
	const { data: departmentsData } = useDepartments({ page: 1, limit: 1000 });
	const { data: sectionsData } = useSections({ page: 1, limit: 1000 });
	const { data: positionsData } = usePositions({ page: 1, limit: 1000 });

	const allEmployees = useMemo(() => {
		const payload = employeesData as any;
		return (payload?.employees || payload?.data?.employees || payload?.data || []) as any[];
	}, [employeesData]);

	const departments = useMemo(() => {
		const payload = departmentsData as any;
		return (payload?.departments || payload?.data || []) as any[];
	}, [departmentsData]);

	const sections = useMemo(() => {
		const payload = sectionsData as any;
		return (payload?.sections || payload?.data || []) as any[];
	}, [sectionsData]);

	const positions = useMemo(() => {
		const payload = positionsData as any;
		return (payload?.positions || payload?.data || []) as any[];
	}, [positionsData]);

	// Filter sections for the selected department
	const availableSections = useMemo(() => {
		if (!targetDepartmentId) return [];
		return sections.filter((s: any) => String(s.departmentId) === targetDepartmentId);
	}, [sections, targetDepartmentId]);

	// Auto-resolve Department Head / Manager for the target department
	const resolvedDepartmentManager = useMemo(() => {
		if (!targetDepartmentId) return null;
		return (
			allEmployees.find((emp: any) => {
				if (emp.id === selectedEmployeeId) return false;
				if (String(emp.departmentId || emp.department?.id) !== targetDepartmentId)
					return false;
				const role = String(emp.role || "").toLowerCase();
				return (
					emp.isManager === true ||
					emp.isHrManager === true ||
					role === "hris-employee-manager" ||
					role === "hris-hr-manager" ||
					role === "hris-line-leader"
				);
			}) || null
		);
	}, [allEmployees, targetDepartmentId, selectedEmployeeId]);

	// Potential supervisors list in target department
	const candidateSupervisors = useMemo(() => {
		if (!targetDepartmentId) return [];
		return allEmployees.filter((emp: any) => {
			if (emp.id === selectedEmployeeId) return false;
			return String(emp.departmentId || emp.department?.id) === targetDepartmentId;
		});
	}, [allEmployees, targetDepartmentId, selectedEmployeeId]);

	const handleEmployeeSelect = (empId: string) => {
		setSelectedEmployeeId(empId);
		setSearchParams(empId ? { employeeId: empId } : {});
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!selectedEmployeeId) {
			toast.error("Please select an employee to transfer");
			return;
		}
		if (!targetDepartmentId && !targetPositionId) {
			toast.error("Please specify a target department or position");
			return;
		}
		if (!effectiveDate) {
			toast.error("Please select an effective date");
			return;
		}

		const targetDept = departments.find((d: any) => String(d.id) === targetDepartmentId);
		const targetPos = positions.find((p: any) => String(p.id) === targetPositionId);
		const targetSec = sections.find((s: any) => String(s.id) === targetSectionId);
		const supervisorId =
			targetSupervisorId || (resolvedDepartmentManager ? resolvedDepartmentManager.id : "");

		createRequest(
			{
				type: "TRANSFER",
				targetEmployeeId: selectedEmployeeId,
				startDate: new Date(effectiveDate),
				description: justification || `Transfer to ${targetDept?.name || "new department"}`,
				metadata: {
					panType: "TRANSFER",
					actionType: "TRANSFER",
					newDepartment: targetDept?.name || "",
					newDepartmentId: targetDepartmentId || "",
					newPosition: targetPos?.title || "",
					newPositionId: targetPositionId || "",
					newSection: targetSec?.name || "",
					newSectionId: targetSectionId || "",
					newLocation: targetLocation,
					newSupervisorId: supervisorId,
					justification,
					effectiveDate,
				},
			},
			{
				onSuccess: () => {
					toast.success("Personnel Action Notice (Transfer) created successfully!");
					navigate("/employee/requests/pan");
				},
			},
		);
	};

	return (
		<div className="container mx-auto py-6 px-4 max-w-5xl space-y-6">
			{/* Breadcrumbs & Header */}
			<div className="flex items-center justify-between border-b pb-4">
				<div>
					<div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
						<Link to="/hr/employees" className="hover:underline flex items-center gap-1">
							<ArrowLeft className="h-3.5 w-3.5" /> Employee Directory
						</Link>
						<span>/</span>
						<span className="text-foreground font-medium">Personnel Actions</span>
						<span>/</span>
						<span>Transfer</span>
					</div>
					<h1 className="text-2xl font-bold tracking-tight">Change Department & Position</h1>
					<p className="text-sm text-muted-foreground">
						Initiate a formal Personnel Action Notice (PAN) to reassign an employee to a new
						department, section, or position.
					</p>
				</div>
				<Badge variant="outline" className="gap-1.5 py-1 px-3 bg-blue-50 text-blue-700 border-blue-200">
					<ShieldCheck className="h-4 w-4" /> PAN Governed
				</Badge>
			</div>

			<form onSubmit={handleSubmit} className="space-y-6">
				{/* Step 1: Select Employee */}
				<Card>
					<CardHeader>
						<CardTitle className="text-lg flex items-center gap-2">
							<User className="h-5 w-5 text-blue-600" />
							1. Select Employee
						</CardTitle>
						<CardDescription>
							Choose the employee undergoing transfer or departmental reassignment.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="max-w-md">
							<Label className="mb-1.5 block">Employee Name or ID</Label>
							<EmployeePickerSelect
								value={selectedEmployeeId}
								onValueChange={handleEmployeeSelect}
								placeholder="Search employee by name or ID..."
								searchPlaceholder="Search by name, employee ID, or department..."
							/>
						</div>

						{/* Current Profile Card */}
						{selectedEmployeeId && employee && (
							<div className="bg-slate-50 border rounded-lg p-4 mt-3 flex flex-wrap items-center justify-between gap-4">
								<div className="flex items-center gap-3">
									<EmployeeAvatar
										employee={{
											firstName:
												employee.person?.personalInfo?.firstName ||
												employee.person?.firstName ||
												employee.firstName,
											lastName:
												employee.person?.personalInfo?.lastName ||
												employee.person?.lastName ||
												employee.lastName,
											photo: employee.person?.personalInfo?.photo || employee.person?.photo,
										}}
										size="lg"
									/>
									<div>
										<h4 className="font-semibold text-base">
											{getEmployeeName(employee)}
										</h4>
										<p className="text-xs text-muted-foreground">
											ID: {employee.employeeId} • {employee.employmentType || "Regular"}
										</p>
									</div>
								</div>
								<div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
									<div>
										<span className="text-muted-foreground block">Current Dept:</span>
										<span className="font-medium text-foreground">
											{employee.department?.name || "N/A"}
										</span>
									</div>
									<div>
										<span className="text-muted-foreground block">Current Position:</span>
										<span className="font-medium text-foreground">
											{employee.position?.title || "N/A"}
										</span>
									</div>
									<div>
										<span className="text-muted-foreground block">Current Supervisor:</span>
										<span className="font-medium text-foreground">
											{employee.reportTo
												? getEmployeeName(employee.reportTo)
												: "None assigned"}
										</span>
									</div>
								</div>
							</div>
						)}

						{/* Existing Active Transfer Request Warning Banner */}
						{selectedEmployeeId && activeExistingTransferRequest && (
							<div className="bg-amber-50/90 border border-amber-200 rounded-lg p-4 flex items-start gap-3 text-amber-950 mt-2">
								<AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
								<div className="space-y-1 flex-1">
									<h5 className="font-semibold text-sm">Active Transfer Request In Progress</h5>
									<p className="text-xs text-amber-900/90">
										This employee already has an active pending Transfer request (
										<strong>{activeExistingTransferRequest.code || activeExistingTransferRequest.id}</strong>
										) currently undergoing review. You cannot create a second concurrent transfer request until the existing one is resolved or cancelled.
									</p>
									<div className="pt-2">
										<Link
											to={`/employee/requests?search=${activeExistingTransferRequest.code || ""}`}
											className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 underline hover:text-amber-950">
											View Existing Request in Approval Hub <ArrowRight className="h-3 w-3" />
										</Link>
									</div>
								</div>
							</div>
						)}
					</CardContent>
				</Card>

				{/* Step 2: Target Movement Details */}
				<Card>
					<CardHeader>
						<CardTitle className="text-lg flex items-center gap-2">
							<Building2 className="h-5 w-5 text-indigo-600" />
							2. Proposed Department & Position
						</CardTitle>
						<CardDescription>
							Specify the new organizational unit, section, position, and work location.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-5">
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<Label className="mb-1.5 block">
									New Department <span className="text-red-500">*</span>
								</Label>
								<SearchableSelect
									value={targetDepartmentId}
									onValueChange={(val) => {
										setTargetDepartmentId(val);
										setTargetSectionId("");
										setTargetSupervisorId("");
									}}
									placeholder="Select target department..."
									options={departments.map((dept: any) => ({
										value: String(dept.id),
										label: `${dept.name} (${dept.code || "No code"})`,
									}))}
								/>
							</div>

							<div>
								<Label className="mb-1.5 block">New Section (Optional)</Label>
								<SearchableSelect
									value={targetSectionId}
									onValueChange={setTargetSectionId}
									placeholder={
										targetDepartmentId ? "Select section..." : "Select department first"
									}
									disabled={!targetDepartmentId}
									options={availableSections.map((sec: any) => ({
										value: String(sec.id),
										label: sec.name,
									}))}
								/>
							</div>

							<div>
								<Label className="mb-1.5 block">New Position / Job Title</Label>
								<SearchableSelect
									value={targetPositionId}
									onValueChange={setTargetPositionId}
									placeholder="Keep current or select new position..."
									options={positions.map((pos: any) => ({
										value: String(pos.id),
										label: `${pos.title} (${pos.code || "No code"})`,
									}))}
								/>
							</div>

							<div>
								<Label className="mb-1.5 block">Work Location</Label>
								<select
									value={targetLocation}
									onChange={(e) => setTargetLocation(e.target.value)}
									className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
									<option value="ONSITE">Onsite</option>
									<option value="REMOTE">Remote</option>
									<option value="HYBRID">Hybrid</option>
								</select>
							</div>
						</div>

						{/* Automated Reporting Manager Resolution Card */}
						{targetDepartmentId && (
							<div className="bg-indigo-50/70 border border-indigo-100 rounded-lg p-4 space-y-3">
								<div className="flex items-center justify-between">
									<h4 className="text-sm font-semibold text-indigo-950 flex items-center gap-1.5">
										<Sparkles className="h-4 w-4 text-indigo-600" />
										Automated Reporting Line Preview
									</h4>
									<Badge variant="secondary" className="text-xs bg-indigo-100 text-indigo-800">
										Department Head
									</Badge>
								</div>
								<p className="text-xs text-indigo-900/80">
									Based on the new department, the employee will automatically report to the
									department head or manager unless overridden below:
								</p>

								<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded border border-indigo-100">
									<div className="flex items-center gap-2.5">
										<Users className="h-5 w-5 text-indigo-600" />
										<div>
											<span className="text-xs text-muted-foreground block">
												Auto-Resolved Manager:
											</span>
											<span className="text-sm font-semibold text-gray-900">
												{resolvedDepartmentManager
													? `${getEmployeeName(resolvedDepartmentManager)} (${resolvedDepartmentManager.position?.title || "Manager"})`
													: "No dedicated Department Head found (will remain unassigned)"}
											</span>
										</div>
									</div>

									{candidateSupervisors.length > 1 && (
										<div className="min-w-[200px]">
											<Label className="text-xs mb-1 block">Override Direct Supervisor</Label>
											<select
												value={targetSupervisorId}
												onChange={(e) => setTargetSupervisorId(e.target.value)}
												className="h-8 text-xs w-full rounded border px-2 py-1 bg-white">
												<option value="">Default ({resolvedDepartmentManager ? "Auto" : "None"})</option>
												{candidateSupervisors.map((sup: any) => (
													<option key={sup.id} value={sup.id}>
														{getEmployeeName(sup)} (
														{sup.position?.title || "Supervisor"})
													</option>
												))}
											</select>
										</div>
									)}
								</div>
							</div>
						)}
					</CardContent>
				</Card>

				{/* Step 3: Effective Date & Justification */}
				<Card>
					<CardHeader>
						<CardTitle className="text-lg flex items-center gap-2">
							<Calendar className="h-5 w-5 text-emerald-600" />
							3. Effective Date & Justification
						</CardTitle>
						<CardDescription>
							Set when the transfer takes effect and explain the organizational rationale.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="max-w-xs">
							<Label className="mb-1.5 block">
								Effective Date <span className="text-red-500">*</span>
							</Label>
							<input
								type="date"
								value={effectiveDate}
								onChange={(e) => setEffectiveDate(e.target.value)}
								className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
							/>
						</div>

						<div>
							<Label className="mb-1.5 block">Reason / Business Justification</Label>
							<Textarea
								value={justification}
								onChange={(e) => setJustification(e.target.value)}
								rows={3}
								placeholder="Explain why this department/position transfer is needed (e.g. project realignment, staffing optimization)..."
							/>
						</div>
					</CardContent>
				</Card>

				{/* Submission Action Bar */}
				<div className="flex items-center justify-between pt-4 border-t">
					<Button
						type="button"
						variant="outline"
						onClick={() => navigate("/hr/employees")}>
						Cancel
					</Button>

					<Button
						type="submit"
						disabled={isSubmitting || !selectedEmployeeId || Boolean(activeExistingTransferRequest)}
						className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
						<Send className="h-4 w-4" />
						{isSubmitting
							? "Submitting PAN Request..."
							: activeExistingTransferRequest
								? "Active Transfer In Progress"
								: "Submit Transfer PAN Request"}
					</Button>
				</div>
			</form>
		</div>
	);
}
