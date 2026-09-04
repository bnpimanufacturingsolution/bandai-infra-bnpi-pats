import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import {
	Award,
	User,
	ArrowRight,
	Calendar,
	Send,
	ShieldCheck,
	Sparkles,
	DollarSign,
	TrendingUp,
	FileText,
	AlertCircle,
	CheckCircle,
	ArrowLeft,
	Briefcase,
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
import { usePositions } from "~/lib/hooks/usePositions";
import { useLevels } from "~/lib/hooks/useLevels";
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

export default function PromotionSalaryPage() {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const initialEmployeeId = searchParams.get("employeeId") || "";

	const { user } = useAuth();
	const { mutate: createRequest, isPending: isSubmitting } = useCreateRequest({
		showErrorToast: true,
	});

	const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(initialEmployeeId);
	const [targetPositionId, setTargetPositionId] = useState<string>("");
	const [targetLevelId, setTargetLevelId] = useState<string>("");
	const [newSalary, setNewSalary] = useState<string>("");
	const [effectiveDate, setEffectiveDate] = useState<string>(
		new Date().toISOString().slice(0, 10),
	);
	const [justification, setJustification] = useState<string>("");
	const [promotionManagesPeople, setPromotionManagesPeople] = useState<boolean>(false);

	// Sync query param
	useEffect(() => {
		if (initialEmployeeId && initialEmployeeId !== selectedEmployeeId) {
			setSelectedEmployeeId(initialEmployeeId);
		}
	}, [initialEmployeeId]);

	// Fetch selected employee details
	const { data: employeeData, isLoading: isLoadingEmployee } = useEmployee(
		selectedEmployeeId,
		["id", "employeeId", "person.personalInfo", "department", "position", "level", "reportTo", "basicSalary", "employmentStatus", "employmentType"],
		undefined,
	);
	const employee = employeeData as any;

	const { data: activeRequestsData } = useRequests(
		selectedEmployeeId
			? {
					targetEmployeeId: selectedEmployeeId,
					limit: 10,
				}
			: { enabled: false },
	);

	const activeExistingPromotionRequest = useMemo(() => {
		const requests = (activeRequestsData?.data || (activeRequestsData as any)?.requests || []) as any[];
		return requests.find(
			(r: any) =>
				(r.type === "PROMOTION" || r.type === "SALARY_CHANGE") &&
				!["APPROVED", "REJECTED", "CANCELLED", "COMPLETED"].includes(
					String(r.currentWorkflowStateKey || r.status || "").toUpperCase(),
				),
		);
	}, [activeRequestsData]);

	// Populate initial salary when employee loads
	useEffect(() => {
		if (employee?.basicSalary && !newSalary) {
			setNewSalary(String(employee.basicSalary));
		}
	}, [employee]);

	// Fetch organizational lists
	const { data: employeesData } = useEmployees({
		page: 1,
		limit: 1000,
		fields: ["id", "employeeId", "person.personalInfo", "department", "position", "level", "reportTo", "isManager", "isHrManager", "role"],
	});
	const { data: positionsData } = usePositions({ page: 1, limit: 1000 });
	const { data: levelsData } = useLevels({ page: 1, limit: 1000 });

	const allEmployees = useMemo(() => {
		const payload = employeesData as any;
		return (payload?.employees || payload?.data?.employees || payload?.data || []) as any[];
	}, [employeesData]);

	const positions = useMemo(() => {
		const payload = positionsData as any;
		return (payload?.positions || payload?.data || []) as any[];
	}, [positionsData]);

	const levels = useMemo(() => {
		const payload = levelsData as any;
		return (payload?.levels || payload?.data || []) as any[];
	}, [levelsData]);

	const currentSalary = Number(employee?.basicSalary || 0);
	const proposedSalary = parseFloat(newSalary) || 0;
	const salaryDelta = proposedSalary - currentSalary;
	const percentIncrease =
		currentSalary > 0 && proposedSalary > currentSalary
			? ((salaryDelta / currentSalary) * 100).toFixed(1)
			: "0.0";

	const handleEmployeeSelect = (empId: string) => {
		setSelectedEmployeeId(empId);
		setNewSalary("");
		setSearchParams(empId ? { employeeId: empId } : {});
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!selectedEmployeeId) {
			toast.error("Please select an employee");
			return;
		}
		if (!targetPositionId && !targetLevelId && (!proposedSalary || proposedSalary === currentSalary)) {
			toast.error("Please specify a new position, job level, or updated salary");
			return;
		}
		if (!effectiveDate) {
			toast.error("Please select an effective date");
			return;
		}

		const targetPos = positions.find((p: any) => String(p.id) === targetPositionId);
		const targetLvl = levels.find((l: any) => String(l.id) === targetLevelId);
		const actionType = targetPositionId || targetLevelId ? "PROMOTION" : "SALARY_CHANGE";

		createRequest(
			{
				type: actionType,
				targetEmployeeId: selectedEmployeeId,
				startDate: new Date(effectiveDate),
				description:
					justification ||
					(actionType === "PROMOTION"
						? `Promotion to ${targetPos?.title || targetLvl?.name || "new level"}`
						: `Salary adjustment to ${proposedSalary.toLocaleString()}`),
				metadata: {
					panType: actionType,
					actionType,
					newPosition: targetPos?.title || "",
					newPositionId: targetPositionId || "",
					promotionLevel: targetLvl?.name || "",
					promotionLevelId: targetLevelId || "",
					newSalary: String(proposedSalary),
					currentSalary: String(currentSalary),
					salaryDelta: String(salaryDelta),
					percentIncrease: `${percentIncrease}%`,
					promotionManagesPeople: promotionManagesPeople ? "YES" : "NO",
					justification,
					effectiveDate,
				},
			},
			{
				onSuccess: () => {
					toast.success(
						`Personnel Action Notice (${actionType === "PROMOTION" ? "Promotion" : "Salary Change"}) created successfully!`,
					);
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
						<span>Promotion & Salary Increase</span>
					</div>
					<h1 className="text-2xl font-bold tracking-tight">Promotion & Salary Increase</h1>
					<p className="text-sm text-muted-foreground">
						Initiate a formal Personnel Action Notice (PAN) to advance an employee&apos;s title, job level, or compensation.
					</p>
				</div>
				<Badge variant="outline" className="gap-1.5 py-1 px-3 bg-purple-50 text-purple-700 border-purple-200">
					<ShieldCheck className="h-4 w-4" /> PAN Governed
				</Badge>
			</div>

			<form onSubmit={handleSubmit} className="space-y-6">
				{/* Step 1: Select Employee */}
				<Card>
					<CardHeader>
						<CardTitle className="text-lg flex items-center gap-2">
							<User className="h-5 w-5 text-purple-600" />
							1. Select Employee
						</CardTitle>
						<CardDescription>
							Choose the employee being considered for promotion or compensation adjustment.
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

						{/* Current Profile & Compensation Card */}
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
											ID: {employee.employeeId} • {employee.department?.name || "No Dept"}
										</p>
									</div>
								</div>
								<div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
									<div>
										<span className="text-muted-foreground block">Current Position:</span>
										<span className="font-medium text-foreground">
											{employee.position?.title || "N/A"}
										</span>
									</div>
									<div>
										<span className="text-muted-foreground block">Current Level:</span>
										<span className="font-medium text-foreground">
											{employee.level?.name || "Entry"}
										</span>
									</div>
									<div>
										<span className="text-muted-foreground block">Current Basic Salary:</span>
										<span className="font-semibold text-emerald-700">
											₱{currentSalary.toLocaleString("en-US", { minimumFractionDigits: 2 })}
										</span>
									</div>
								</div>
							</div>
						)}

						{/* Existing Active Promotion Request Warning Banner */}
						{selectedEmployeeId && activeExistingPromotionRequest && (
							<div className="bg-amber-50/90 border border-amber-200 rounded-lg p-4 flex items-start gap-3 text-amber-950 mt-2">
								<AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
								<div className="space-y-1 flex-1">
									<h5 className="font-semibold text-sm">Active Promotion/Salary Request In Progress</h5>
									<p className="text-xs text-amber-900/90">
										This employee already has an active pending {activeExistingPromotionRequest.type.replace(/_/g, " ")} request (
										<strong>{activeExistingPromotionRequest.code || activeExistingPromotionRequest.id}</strong>
										) currently undergoing review. You cannot create a second concurrent request until the existing one is resolved or cancelled.
									</p>
									<div className="pt-2">
										<Link
											to={`/employee/requests?search=${activeExistingPromotionRequest.code || ""}`}
											className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 underline hover:text-amber-950">
											View Existing Request in Approval Hub <ArrowRight className="h-3 w-3" />
										</Link>
									</div>
								</div>
							</div>
						)}
					</CardContent>
				</Card>

				{/* Step 2: Proposed Promotion & Compensation */}
				<Card>
					<CardHeader>
						<CardTitle className="text-lg flex items-center gap-2">
							<Award className="h-5 w-5 text-amber-600" />
							2. Proposed Position, Level & Salary
						</CardTitle>
						<CardDescription>
							Select the advanced position, job level, and updated basic salary.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-5">
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<Label className="mb-1.5 block">New Position / Title</Label>
								<SearchableSelect
									value={targetPositionId}
									onValueChange={setTargetPositionId}
									placeholder="Select new position..."
									options={positions.map((pos: any) => ({
										value: String(pos.id),
										label: `${pos.title} (${pos.code || "No code"})`,
									}))}
								/>
							</div>

							<div>
								<Label className="mb-1.5 block">New Job Level</Label>
								<SearchableSelect
									value={targetLevelId}
									onValueChange={setTargetLevelId}
									placeholder="Select new rank / level..."
									options={levels.map((lvl: any) => ({
										value: String(lvl.id),
										label: lvl.rank ? `${lvl.name} (Rank ${lvl.rank})` : lvl.name,
									}))}
								/>
							</div>

							<div>
								<Label className="mb-1.5 block">New Basic Salary (PHP)</Label>
								<div className="relative">
									<span className="absolute left-3 top-2.5 text-gray-500 font-semibold">₱</span>
									<input
										type="number"
										step="0.01"
										value={newSalary}
										onChange={(e) => setNewSalary(e.target.value)}
										placeholder="e.g. 35000.00"
										className="flex h-10 w-full rounded-md border border-input bg-background pl-8 pr-3 py-2 text-sm ring-offset-background"
									/>
								</div>
							</div>

							<div className="flex items-center gap-3 pt-6">
								<input
									type="checkbox"
									id="managesPeople"
									checked={promotionManagesPeople}
									onChange={(e) => setPromotionManagesPeople(e.target.checked)}
									className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
								/>
								<Label htmlFor="managesPeople" className="text-sm font-medium cursor-pointer">
									Promote to Leadership / Supervisory role (Line Leader or Manager)
								</Label>
							</div>
						</div>

						{/* Live Compensation Increase Summary */}
						{proposedSalary > 0 && currentSalary > 0 && (
							<div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
								<div className="flex items-center gap-2.5">
									<TrendingUp className="h-5 w-5 text-emerald-600" />
									<div>
										<span className="text-xs text-emerald-900 block font-medium">
											Compensation Adjustment Impact:
										</span>
										<span className="text-sm font-bold text-emerald-950">
											₱{currentSalary.toLocaleString()} ➔ ₱{proposedSalary.toLocaleString()} (
											{salaryDelta >= 0 ? `+₱${salaryDelta.toLocaleString()}` : `-₱${Math.abs(salaryDelta).toLocaleString()}`})
										</span>
									</div>
								</div>
								<Badge className="bg-emerald-600 text-white text-xs px-3 py-1 font-bold">
									+{percentIncrease}% Increase
								</Badge>
							</div>
						)}
					</CardContent>
				</Card>

				{/* Step 3: Effective Date & Performance Justification */}
				<Card>
					<CardHeader>
						<CardTitle className="text-lg flex items-center gap-2">
							<Calendar className="h-5 w-5 text-emerald-600" />
							3. Effective Date & Performance Justification
						</CardTitle>
						<CardDescription>
							Set when the promotion takes effect and summarize the employee&apos;s performance achievements.
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
							<Label className="mb-1.5 block">Promotion / Salary Justification</Label>
							<Textarea
								value={justification}
								onChange={(e) => setJustification(e.target.value)}
								rows={3}
								placeholder="Summarize key performance ratings, accomplishments, and rationale for this promotion or salary adjustment..."
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
						disabled={isSubmitting || !selectedEmployeeId || Boolean(activeExistingPromotionRequest)}
						className="bg-purple-600 hover:bg-purple-700 text-white gap-2">
						<Send className="h-4 w-4" />
						{isSubmitting
							? "Submitting PAN Request..."
							: activeExistingPromotionRequest
								? "Active Request In Progress"
								: "Submit Promotion / Salary PAN Request"}
					</Button>
				</div>
			</form>
		</div>
	);
}
