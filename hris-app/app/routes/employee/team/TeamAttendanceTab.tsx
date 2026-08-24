import { useMemo, useState, useRef, useEffect } from "react";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { useEmployees } from "~/lib/hooks/useEmployees";
import { useAuth } from "~/lib/hooks/use-auth";
import { usePayrollPeriods } from "~/lib/hooks/usePayrollPeriods";
import { EmployeeTableCell } from "~/components/molecules/EmployeeTableCell";
import { Check, X, Clock, AlertCircle, MoreHorizontal, Eye } from "lucide-react";

type TeamAttendanceTabProps = {
	teamEmployees: Array<any>;
};

export default function TeamAttendanceTab({ teamEmployees }: TeamAttendanceTabProps) {
	const { user } = useAuth();
	const employeeId = user?.metadata?.employee?.id;

	// Fetch payroll periods
	const { data: payrollPeriodsResponse, isLoading: isLoadingPeriods } = usePayrollPeriods({
		page: 1,
		limit: 10,
		sort: "startDate",
		order: "desc",
	});

	const payrollPeriods = useMemo(
		() => payrollPeriodsResponse?.data?.payrollPeriods || [],
		[payrollPeriodsResponse],
	);
	const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");

	// Auto-select first period when loaded
	useEffect(() => {
		if (payrollPeriods.length > 0 && !selectedPeriodId) {
			setSelectedPeriodId(payrollPeriods[0].id);
		}
	}, [payrollPeriods, selectedPeriodId]);

	const selectedPeriod = payrollPeriods.find((p) => p.id === selectedPeriodId);

	// Calculate approval deadline (cutoff day - 2)
	const getApprovalDeadline = () => {
		if (!selectedPeriod?.cutoffDay) return null;
		const deadlineDay = selectedPeriod.cutoffDay - 2;
		return deadlineDay > 0 ? deadlineDay : 1;
	};

	const approvalDeadline = getApprovalDeadline();
	const currentDay = new Date().getDate();

	// Check if approval deadline has passed
	const isDeadlinePassed = approvalDeadline ? currentDay > approvalDeadline : false;

	// Fetch employees with attendance status counts
	const { data: employeesWithAttendance, isLoading } = useEmployees({
		page: 1,
		limit: 100,
		filter: employeeId ? `reportTo.id:${employeeId}` : undefined,
		fields: "id,employeeId,person.personalInfo.firstName,person.personalInfo.lastName,person.personalInfo.middleName,activeEmployeeSchedule.schedule.name,employmentHireDate",
		aggregateBy: "attendances",
		countBy: "status",
		document: "true",
		pagination: "false",
	});

	// Extract employees from response
	const employeesData = useMemo(
		() =>
			employeesWithAttendance?.employees ||
			(Array.isArray(employeesWithAttendance?.data)
				? employeesWithAttendance.data
				: employeesWithAttendance?.data?.employees || []),
		[employeesWithAttendance],
	);

	// Generate mock attendance data with realistic patterns
	const attendanceData = useMemo(() => {
		// If no employees from API, create mock team data
		const baseData =
			employeesData.length > 0
				? employeesData
				: [
						{
							id: "1",
							employeeId: "EMP001",
							person: { personalInfo: { firstName: "John", lastName: "Doe" } },
						},
						{
							id: "2",
							employeeId: "EMP002",
							person: { personalInfo: { firstName: "Jane", lastName: "Smith" } },
						},
						{
							id: "3",
							employeeId: "EMP003",
							person: { personalInfo: { firstName: "Mike", lastName: "Johnson" } },
						},
						{
							id: "4",
							employeeId: "EMP004",
							person: { personalInfo: { firstName: "Sarah", lastName: "Williams" } },
						},
						{
							id: "5",
							employeeId: "EMP005",
							person: { personalInfo: { firstName: "David", lastName: "Brown" } },
						},
						{
							id: "6",
							employeeId: "EMP006",
							person: { personalInfo: { firstName: "Emily", lastName: "Davis" } },
						},
						{
							id: "7",
							employeeId: "EMP007",
							person: { personalInfo: { firstName: "Chris", lastName: "Wilson" } },
						},
						{
							id: "8",
							employeeId: "EMP008",
							person: { personalInfo: { firstName: "Lisa", lastName: "Taylor" } },
						},
					];

		return baseData.map((employee: any, index: number) => {
			const firstName = employee?.person?.personalInfo?.firstName || "";
			const lastName = employee?.person?.personalInfo?.lastName || "";
			const middleName = employee?.person?.personalInfo?.middleName || "";
			const name = [firstName, middleName, lastName].filter(Boolean).join(" ");

			// Generate realistic mock attendance counts based on 15-day period
			const totalDays = 15;
			const presentCount = Math.floor(Math.random() * 4) + (totalDays - 5); // 10-14 days
			const leaveCount = Math.floor(Math.random() * 3); // 0-2 days
			const absentCount = totalDays - presentCount - leaveCount;

			// Get schedule name
			const scheduleName =
				employee?.activeEmployeeSchedule?.schedule?.name || "Regular Shift";

			// Mock timesheet approval status with variety
			const timesheetStatus: "approved" | "pending" | "rejected" =
				index % 5 === 0 ? "pending" : index % 8 === 0 ? "rejected" : "approved";

			const timesheetSubmittedDate =
				timesheetStatus !== "pending"
					? new Date(2026, 0, Math.floor(Math.random() * 5) + 1).toISOString()
					: null;

			// Mock total hours worked
			const hoursWorked = presentCount * 8 + (Math.random() * 2 - 1); // ~8 hrs/day with variance
			const overtimeHours = Math.random() > 0.7 ? Math.floor(Math.random() * 10) : 0;

			// Mock leave approval details so managers see who signed off
			const leaveApprovers = [
				"Maria Reyes",
				"Paolo Cruz",
				"Diana Lee",
				"HR Desk",
				"Team Lead",
			];
			const latestLeaveApprovedBy =
				leaveCount > 0 ? leaveApprovers[index % leaveApprovers.length] : null;
			const latestLeaveDate =
				leaveCount > 0
					? new Date(2026, 0, Math.floor(Math.random() * 10) + 2).toISOString()
					: null;
			const latestLeaveType =
				leaveCount > 0 ? ["Sick Leave", "Vacation", "Emergency Leave"][index % 3] : null;

			// Build a compact daily highlight log for the cutoff period
			const dailyActivity = Array.from({ length: 5 }, (_, dayIndex) => {
				const statusBucket =
					dayIndex === 1 && leaveCount > 0
						? "leave"
						: dayIndex === 2 && absentCount > 0
							? "absent"
							: "present";
				return {
					label: `Day ${dayIndex + 1}`,
					status: statusBucket,
					note:
						statusBucket === "leave"
							? `${latestLeaveType || "Leave"} approved by ${latestLeaveApprovedBy || "Manager"}`
							: statusBucket === "absent"
								? "No clock in/out recorded"
								: "On time",
					approvedBy: statusBucket === "leave" ? latestLeaveApprovedBy : undefined,
				};
			});

			return {
				id: employee.id,
				name: name || employee.employeeId || `Employee ${index + 1}`,
				employeeId: employee.employeeId || `EMP${String(index + 1).padStart(3, "0")}`,
				scheduleName,
				presentCount,
				leaveCount,
				absentCount,
				timesheetStatus,
				timesheetSubmittedDate,
				hoursWorked: parseFloat(hoursWorked.toFixed(2)),
				overtimeHours,
				latestLeaveApprovedBy,
				latestLeaveDate,
				latestLeaveType,
				dailyActivity,
			};
		});
	}, [employeesData]);

	// Define DataTable columns
	type AttendanceRow = (typeof attendanceData)[number];
	const columns: Column<AttendanceRow>[] = useMemo(
		() => [
			{
				key: "name",
				label: "Employee",
				render: (_value, item) => (
					<EmployeeTableCell
						profileId={item.id}
						fullName={item.name}
						employeeId={item.employeeId}
						stopPropagation
					/>
				),
			},
			{
				key: "scheduleName",
				label: "Schedule",
				render: (value) => <span className="text-sm text-gray-700">{value as string}</span>,
			},
			{
				key: "presentCount",
				label: "Present",
				render: (value) => (
					<div className="flex items-center gap-2">
						<span className="text-lg font-semibold text-green-700">
							{value as number}
						</span>
						<span className="text-xs text-gray-500">days</span>
					</div>
				),
			},
			{
				key: "leaveCount",
				label: "Leave",
				render: (value) => (
					<div className="flex items-center gap-2">
						<span className="text-lg font-semibold text-blue-700">
							{value as number}
						</span>
						<span className="text-xs text-gray-500">days</span>
					</div>
				),
			},
			{
				key: "absentCount",
				label: "Absent",
				render: (value) => (
					<div className="flex items-center gap-2">
						<span className="text-lg font-semibold text-red-700">
							{value as number}
						</span>
						<span className="text-xs text-gray-500">days</span>
					</div>
				),
			},
			{
				key: "hoursWorked",
				label: "Hours",
				render: (value, item) => (
					<div className="flex flex-col">
						<span className="text-sm font-medium text-gray-900">
							{value as number} hrs
						</span>
						{item.overtimeHours > 0 && (
							<span className="text-xs text-orange-600">
								+{item.overtimeHours} OT
							</span>
						)}
					</div>
				),
			},
			{
				key: "latestLeaveType",
				label: "Latest Update",
				render: (_value, item) => (
					<div className="flex flex-col gap-1 text-sm text-gray-800">
						{item.latestLeaveType ? (
							<>
								<span className="inline-flex items-center gap-2 text-[13px] font-semibold text-blue-800">
									<Clock className="w-3.5 h-3.5" />
									{item.latestLeaveType}
								</span>
								<span className="text-xs text-gray-600">
									Approved by {item.latestLeaveApprovedBy || "Manager"} on{" "}
									{item.latestLeaveDate
										? new Date(item.latestLeaveDate).toLocaleDateString()
										: "N/A"}
								</span>
							</>
						) : (
							<span className="text-xs text-gray-500">No recent leave requests</span>
						)}
					</div>
				),
			},
			{
				key: "timesheetStatus",
				label: "Approval Status",
				render: (value, item) => {
					const status = value as "approved" | "pending" | "rejected";

					if (status === "approved") {
						return (
							<div className="flex flex-col gap-1">
								<span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-green-100 text-green-800 border border-green-200 w-fit">
									<Check className="w-3.5 h-3.5" />
									Approved
								</span>
								{item.timesheetSubmittedDate && (
									<span className="text-xs text-gray-500">
										{new Date(item.timesheetSubmittedDate).toLocaleDateString()}
									</span>
								)}
							</div>
						);
					}

					if (status === "rejected") {
						return (
							<div className="flex flex-col gap-1">
								<span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-red-100 text-red-800 border border-red-200 w-fit">
									<X className="w-3.5 h-3.5" />
									Rejected
								</span>
								{item.timesheetSubmittedDate && (
									<span className="text-xs text-gray-500">
										{new Date(item.timesheetSubmittedDate).toLocaleDateString()}
									</span>
								)}
								<button
									onClick={() =>
										console.log(
											"Review rejected timesheet for",
											item.employeeId,
										)
									}
									className="text-xs text-blue-600 hover:text-blue-700 underline w-fit font-medium">
									Review Details
								</button>
							</div>
						);
					}

					// Pending status - show action buttons
					return (
						<div className="flex flex-col gap-2">
							<span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200 w-fit">
								<Clock className="w-3.5 h-3.5" />
								Pending Review
							</span>
							<div className="flex items-center gap-2">
								<button
									onClick={() => {
										console.log("✓ Approve timesheet for", item.employeeId);
										// TODO: Call API to approve timesheet
									}}
									className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition-colors shadow-sm">
									<Check className="w-3.5 h-3.5" />
									Approve
								</button>
								<button
									onClick={() => {
										console.log("✗ Reject timesheet for", item.employeeId);
										// TODO: Show reject reason modal
									}}
									className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition-colors shadow-sm">
									<X className="w-3.5 h-3.5" />
									Reject
								</button>
							</div>
						</div>
					);
				},
			},
		],
		[],
	);

	const [selectedRow, setSelectedRow] = useState<AttendanceRow | null>(null);

	// Row actions (3-dots) matching overview pattern
	const RowActions = ({ onView }: { onView: () => void }) => {
		const [open, setOpen] = useState(false);
		const ref = useRef<HTMLDivElement | null>(null);

		useEffect(() => {
			const onDocClick = (e: MouseEvent) => {
				if (ref.current && !ref.current.contains(e.target as Node)) {
					setOpen(false);
				}
			};
			document.addEventListener("click", onDocClick);
			return () => document.removeEventListener("click", onDocClick);
		}, []);

		return (
			<div className="relative" ref={ref}>
				<button
					aria-haspopup="menu"
					aria-expanded={open}
					onClick={(e) => {
						e.stopPropagation();
						setOpen((v) => !v);
					}}
					className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-neutral-100 border border-transparent">
					<MoreHorizontal className="w-4 h-4 text-neutral-600" />
				</button>
				{open && (
					<div
						role="menu"
						className="absolute right-0 top-full mt-1 min-w-[170px] bg-white border border-neutral-200 rounded-lg shadow-lg z-[9999] py-1">
						<button
							role="menuitem"
							onClick={(e) => {
								e.stopPropagation();
								onView();
								setOpen(false);
							}}
							className="w-full flex items-center gap-3 px-3 py-2 text-[13px] text-neutral-800 hover:bg-neutral-50">
							<Eye className="w-4 h-4 text-neutral-600" />
							<span>View details</span>
						</button>
					</div>
				)}
			</div>
		);
	};

	const handleView = (item: AttendanceRow) => {
		setSelectedRow(item);
	};

	// Calculate summary stats
	const summaryStats = useMemo(() => {
		const pending = attendanceData.filter((d) => d.timesheetStatus === "pending").length;
		const approved = attendanceData.filter((d) => d.timesheetStatus === "approved").length;
		const rejected = attendanceData.filter((d) => d.timesheetStatus === "rejected").length;
		const totalHours = attendanceData.reduce((sum, d) => sum + d.hoursWorked, 0);
		const totalOT = attendanceData.reduce((sum, d) => sum + d.overtimeHours, 0);
		return {
			pending,
			approved,
			rejected,
			total: attendanceData.length,
			totalHours: totalHours.toFixed(1),
			totalOT,
		};
	}, [attendanceData]);

	// Build cutoff daily digest so managers see what happened per day (compact list)
	const cutoffHighlights = useMemo(() => {
		const periodStart = selectedPeriod?.startDate
			? new Date(selectedPeriod.startDate)
			: new Date(2026, 0, 1);

		return Array.from({ length: 5 }, (_, i) => {
			const date = new Date(periodStart);
			date.setDate(periodStart.getDate() + i);

			const leaveSamples = attendanceData.filter((d) => d.latestLeaveApprovedBy).slice(0, 2);
			return {
				label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
				present: Math.max(0, attendanceData.length - (i % 3)),
				leave: leaveSamples.length,
				approvals:
					leaveSamples.length > 0
						? leaveSamples
								.map(
									(d) =>
										`${d.latestLeaveType || "Leave"} by ${d.latestLeaveApprovedBy}`,
								)
								.join("; ")
						: "No leave approvals",
			};
		});
	}, [attendanceData, selectedPeriod]);

	return (
		<div className="space-y-6">
			<div className="flex items-start justify-between">
				<div className="space-y-1">
					<h2 className="text-xl font-semibold text-neutral-900">Team Attendance</h2>
					<p className="text-sm text-neutral-500">
						Review and approve team member attendance records for the selected payroll
						period.
					</p>
				</div>
			</div>

			{/* Approval Deadline Alert */}
			{selectedPeriod && approvalDeadline && (
				<div
					className={`p-4 rounded-lg border-2 ${
						isDeadlinePassed ? "bg-red-50 border-red-300" : "bg-blue-50 border-blue-300"
					}`}>
					<div className="flex items-start gap-3">
						{isDeadlinePassed ? (
							<AlertCircle className="w-6 h-6 text-red-600 mt-0.5 flex-shrink-0" />
						) : (
							<Clock className="w-6 h-6 text-blue-600 mt-0.5 flex-shrink-0" />
						)}
						<div className="flex-1">
							<h3
								className={`font-semibold text-base ${
									isDeadlinePassed ? "text-red-900" : "text-blue-900"
								}`}>
								{isDeadlinePassed
									? "⚠️ Approval Deadline Passed"
									: "⏰ Timesheet Approval Deadline"}
							</h3>
							<p
								className={`text-sm mt-1 ${
									isDeadlinePassed ? "text-red-700" : "text-blue-700"
								}`}>
								{isDeadlinePassed ? (
									<>
										The approval deadline was on{" "}
										<strong>day {approvalDeadline}</strong> of this month.
										Please approve pending timesheets as soon as possible to
										process payroll on time.
									</>
								) : (
									<>
										All timesheets must be approved by{" "}
										<strong>day {approvalDeadline}</strong> of this month
										(Payroll Cutoff: Day {selectedPeriod.cutoffDay}).
										{summaryStats.pending > 0 && (
											<span className="ml-1 font-semibold">
												{summaryStats.pending}{" "}
												{summaryStats.pending === 1
													? "timesheet"
													: "timesheets"}{" "}
												pending.
											</span>
										)}
									</>
								)}
							</p>
						</div>
					</div>
				</div>
			)}

			{/* Summary Stats Cards */}
			<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
				<div className="bg-white p-4 rounded-lg border-2 border-gray-200 shadow-sm">
					<div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
						Total Team
					</div>
					<div className="text-3xl font-bold text-gray-900 mt-2">
						{summaryStats.total}
					</div>
				</div>
				<div className="bg-orange-50 p-4 rounded-lg border-2 border-orange-300 shadow-sm">
					<div className="text-xs font-medium text-orange-700 uppercase tracking-wide">
						Pending
					</div>
					<div className="text-3xl font-bold text-orange-700 mt-2">
						{summaryStats.pending}
					</div>
				</div>
				<div className="bg-green-50 p-4 rounded-lg border-2 border-green-300 shadow-sm">
					<div className="text-xs font-medium text-green-700 uppercase tracking-wide">
						Approved
					</div>
					<div className="text-3xl font-bold text-green-700 mt-2">
						{summaryStats.approved}
					</div>
				</div>
				<div className="bg-red-50 p-4 rounded-lg border-2 border-red-300 shadow-sm">
					<div className="text-xs font-medium text-red-700 uppercase tracking-wide">
						Rejected
					</div>
					<div className="text-3xl font-bold text-red-700 mt-2">
						{summaryStats.rejected}
					</div>
				</div>
				<div className="bg-purple-50 p-4 rounded-lg border-2 border-purple-300 shadow-sm">
					<div className="text-xs font-medium text-purple-700 uppercase tracking-wide">
						Total Hours
					</div>
					<div className="text-3xl font-bold text-purple-700 mt-2">
						{summaryStats.totalHours}
					</div>
				</div>
				<div className="bg-amber-50 p-4 rounded-lg border-2 border-amber-300 shadow-sm">
					<div className="text-xs font-medium text-amber-700 uppercase tracking-wide">
						Overtime
					</div>
					<div className="text-3xl font-bold text-amber-700 mt-2">
						{summaryStats.totalOT}
					</div>
				</div>
			</div>

			{/* Period Selector */}
			<div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
				<div className="flex items-center gap-4">
					<label className="text-sm font-semibold text-gray-700">Payroll Period:</label>
					{isLoadingPeriods ? (
						<div className="h-10 w-64 bg-gray-200 animate-pulse rounded-lg"></div>
					) : (
						<select
							value={selectedPeriodId}
							onChange={(e) => setSelectedPeriodId(e.target.value)}
							className="flex-1 px-4 py-2.5 border-2 border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent">
							{payrollPeriods.length > 0 ? (
								payrollPeriods.map((period) => (
									<option key={period.id} value={period.id}>
										{period.name} (
										{new Date(period.startDate).toLocaleDateString()} -{" "}
										{new Date(period.endDate).toLocaleDateString()})
										{period.cutoffDay && ` • Cutoff: Day ${period.cutoffDay}`}
									</option>
								))
							) : (
								<option value="">
									Jan 1-15, 2026 (Mock Period) • Cutoff: Day 15
								</option>
							)}
						</select>
					)}
				</div>
			</div>

			<div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
				<div className="order-1 lg:order-1">
					{/* Team Attendance Approval Table */}
					<DataTable<AttendanceRow>
						title="Team Attendance Records"
						description=""
						data={attendanceData}
						columns={columns}
						searchFields={["name", "employeeId"]}
						itemsPerPage={10}
						renderActions={(item) => <RowActions onView={() => handleView(item)} />}
						emptyMessage="No team attendance records found"
						emptyDescription="There are no attendance records to review for this period."
					/>
				</div>
				<div className="order-2 lg:order-2">
					{/* Cutoff daily digest */}
					<div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 space-y-3">
						<div className="flex items-center justify-between gap-4">
							<div className="space-y-1">
								<p className="text-sm font-semibold text-neutral-900">
									Cutoff Daily Highlights
								</p>
								<p className="text-xs text-neutral-500">
									Compact snapshot beside the table so records stay the focus.
								</p>
							</div>
							<span className="text-xs font-medium text-neutral-600 bg-neutral-100 px-3 py-1 rounded-full border border-neutral-200">
								{selectedPeriod?.name || "Mock Period Jan 1-15, 2026"}
							</span>
						</div>
						<div className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-neutral-50">
							{cutoffHighlights.map((day) => (
								<div
									key={day.label}
									className="flex flex-wrap items-center gap-3 px-4 py-3">
									<div className="flex items-center gap-2">
										<span className="text-xs font-semibold text-neutral-700">
											{day.label}
										</span>
										<span className="text-[11px] text-neutral-500">
											{day.present} present
										</span>
									</div>
									<span className="text-[11px] font-medium text-blue-800 bg-blue-50 border border-blue-200 px-2 py-1 rounded-full">
										{day.leave} on leave
									</span>
									<p className="text-xs text-neutral-600 flex-1 min-w-[180px]">
										{day.approvals}
									</p>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>

			{selectedRow && (
				<div className="fixed inset-0 z-50 flex items-center justify-center px-4">
					<div
						className="absolute inset-0 bg-black/40"
						role="presentation"
						onClick={() => setSelectedRow(null)}
					/>
					<div className="relative w-full max-w-3xl bg-white rounded-xl shadow-2xl border border-neutral-200 p-6 space-y-5">
						<div className="flex items-start justify-between gap-3">
							<div>
								<p className="text-xs font-semibold text-neutral-500">Employee</p>
								<h3 className="text-lg font-semibold text-neutral-900">
									{selectedRow.name}
								</h3>
								<p className="text-xs text-neutral-500">{selectedRow.employeeId}</p>
							</div>
							<button
								onClick={() => setSelectedRow(null)}
								className="text-sm text-neutral-600 hover:text-neutral-900">
								Close
							</button>
						</div>

						<div className="grid grid-cols-2 md:grid-cols-3 gap-3">
							<div className="p-3 rounded-lg border border-neutral-200 bg-neutral-50">
								<p className="text-[11px] text-neutral-500">Schedule</p>
								<p className="text-sm font-semibold text-neutral-900">
									{selectedRow.scheduleName}
								</p>
							</div>
							<div className="p-3 rounded-lg border border-neutral-200 bg-neutral-50">
								<p className="text-[11px] text-neutral-500">Hours</p>
								<p className="text-sm font-semibold text-neutral-900">
									{selectedRow.hoursWorked} hrs
								</p>
								{selectedRow.overtimeHours > 0 && (
									<p className="text-[11px] text-amber-700 font-medium">
										+{selectedRow.overtimeHours} OT
									</p>
								)}
							</div>
							<div className="p-3 rounded-lg border border-neutral-200 bg-neutral-50">
								<p className="text-[11px] text-neutral-500">Attendance</p>
								<p className="text-sm font-semibold text-neutral-900">
									{selectedRow.presentCount} present · {selectedRow.leaveCount}{" "}
									leave · {selectedRow.absentCount} absent
								</p>
							</div>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="space-y-2">
								<p className="text-xs font-semibold text-neutral-600">
									Timesheet status
								</p>
								<div
									className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium ${selectedRow.timesheetStatus === "approved" ? "bg-green-50 text-green-800 border-green-200" : ""} ${selectedRow.timesheetStatus === "pending" ? "bg-orange-50 text-orange-800 border-orange-200" : ""} ${selectedRow.timesheetStatus === "rejected" ? "bg-red-50 text-red-800 border-red-200" : ""}`}>
									{selectedRow.timesheetStatus === "approved" && (
										<Check className="w-3.5 h-3.5" />
									)}
									{selectedRow.timesheetStatus === "pending" && (
										<Clock className="w-3.5 h-3.5" />
									)}
									{selectedRow.timesheetStatus === "rejected" && (
										<X className="w-3.5 h-3.5" />
									)}
									<span className="capitalize">
										{selectedRow.timesheetStatus}
									</span>
								</div>
								{selectedRow.timesheetSubmittedDate && (
									<p className="text-xs text-neutral-500">
										Submitted{" "}
										{new Date(
											selectedRow.timesheetSubmittedDate,
										).toLocaleDateString()}
									</p>
								)}
							</div>
							<div className="space-y-2">
								<p className="text-xs font-semibold text-neutral-600">
									Latest leave
								</p>
								{selectedRow.latestLeaveType ? (
									<div className="p-3 border border-neutral-200 rounded-lg bg-neutral-50 space-y-1">
										<p className="text-sm font-semibold text-neutral-900">
											{selectedRow.latestLeaveType}
										</p>
										<p className="text-xs text-neutral-600">
											Approved by{" "}
											{selectedRow.latestLeaveApprovedBy || "Manager"}
										</p>
										<p className="text-xs text-neutral-500">
											{selectedRow.latestLeaveDate
												? new Date(
														selectedRow.latestLeaveDate,
													).toLocaleDateString()
												: "Date unavailable"}
										</p>
									</div>
								) : (
									<p className="text-xs text-neutral-500">
										No recent leave approvals
									</p>
								)}
							</div>
						</div>

						<div className="space-y-2">
							<p className="text-xs font-semibold text-neutral-600">
								Daily activity (cutoff)
							</p>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
								{selectedRow.dailyActivity?.map((day) => (
									<div
										key={day.label}
										className="p-3 border border-neutral-200 rounded-lg bg-white">
										<div className="flex items-center justify-between">
											<span className="text-xs font-semibold text-neutral-700">
												{day.label}
											</span>
											<span className="text-[11px] text-neutral-500 capitalize">
												{day.status}
											</span>
										</div>
										<p className="mt-1 text-sm text-neutral-800">{day.note}</p>
										{day.approvedBy && (
											<p className="text-[11px] text-neutral-500">
												Approved by {day.approvedBy}
											</p>
										)}
									</div>
								))}
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
