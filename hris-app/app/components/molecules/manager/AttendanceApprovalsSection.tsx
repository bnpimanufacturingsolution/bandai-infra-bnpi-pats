import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import { SummaryCard } from "~/components/atoms/SummaryCard";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import {
	CheckCircle,
	XCircle,
	Clock,
	Calendar,
	User,
	AlertCircle,
	Eye,
	ChevronLeft,
	ChevronRight,
	FileText,
	TrendingUp,
	MoreVertical,
	Archive,
	Trash2,
} from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { WeeklyAttendanceApproval, AttendanceRecord } from "~/types/attendance";

interface AttendanceApprovalsSectionProps {
	onApprove?: (employeeId: string, weekStart: string, weekEnd: string) => void;
	onReject?: (employeeId: string, weekStart: string, weekEnd: string, reason: string) => void;
	onViewDetails?: (employeeId: string, weekStart: string, weekEnd: string) => void;
}

export default function AttendanceApprovalsSection({
	onApprove,
	onReject,
	onViewDetails,
}: AttendanceApprovalsSectionProps) {
	const navigate = useNavigate();
	const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
	const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Element;
			if (!target.closest("[data-dropdown]")) {
				setDropdownOpen(null);
			}
		};

		document.addEventListener("click", handleClickOutside);
		return () => {
			document.removeEventListener("click", handleClickOutside);
		};
	}, [dropdownOpen]);

	// Calculate week dates
	const getWeekDates = (offset: number = 0) => {
		const today = new Date();
		const dayOfWeek = today.getDay();
		const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust for Monday start
		const monday = new Date(today.setDate(diff));
		monday.setDate(monday.getDate() + offset * 7);

		const sunday = new Date(monday);
		sunday.setDate(monday.getDate() + 6);

		return {
			start: monday.toISOString().split("T")[0],
			end: sunday.toISOString().split("T")[0],
			displayStart: monday.toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
				year: "numeric",
			}),
			displayEnd: sunday.toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
				year: "numeric",
			}),
		};
	};

	const currentWeek = getWeekDates(currentWeekOffset);

	// Sample weekly attendance data for team members
	const weeklyAttendanceData: WeeklyAttendanceApproval[] = [
		{
			employeeId: "EMP001",
			employeeName: "Sarah Johnson",
			department: "Development",
			weekStartDate: currentWeek.start,
			weekEndDate: currentWeek.end,
			totalHours: 42.5,
			totalDays: 5,
			presentDays: 5,
			lateDays: 0,
			absentDays: 0,
			approvalStatus: "pending_approval",
			records: [
				{
					id: "1",
					employeeId: "EMP001",
					date: currentWeek.start,
					clockIn: "08:30 AM",
					clockOut: "05:30 PM",
					hoursWorked: 8.5,
					status: "present",
				},
				{
					id: "2",
					employeeId: "EMP001",
					date: new Date(new Date(currentWeek.start).getTime() + 86400000)
						.toISOString()
						.split("T")[0],
					clockIn: "08:45 AM",
					clockOut: "05:45 PM",
					hoursWorked: 8.5,
					status: "present",
				},
				{
					id: "3",
					employeeId: "EMP001",
					date: new Date(new Date(currentWeek.start).getTime() + 172800000)
						.toISOString()
						.split("T")[0],
					clockIn: "08:30 AM",
					clockOut: "06:00 PM",
					hoursWorked: 9,
					status: "present",
				},
				{
					id: "4",
					employeeId: "EMP001",
					date: new Date(new Date(currentWeek.start).getTime() + 259200000)
						.toISOString()
						.split("T")[0],
					clockIn: "08:30 AM",
					clockOut: "05:30 PM",
					hoursWorked: 8.5,
					status: "present",
				},
				{
					id: "5",
					employeeId: "EMP001",
					date: new Date(new Date(currentWeek.start).getTime() + 345600000)
						.toISOString()
						.split("T")[0],
					clockIn: "08:30 AM",
					clockOut: "06:00 PM",
					hoursWorked: 8.5,
					status: "present",
				},
			],
		},
		{
			employeeId: "EMP002",
			employeeName: "Mike Chen",
			department: "Development",
			weekStartDate: currentWeek.start,
			weekEndDate: currentWeek.end,
			totalHours: 40,
			totalDays: 5,
			presentDays: 4,
			lateDays: 1,
			absentDays: 0,
			approvalStatus: "pending_approval",
			records: [
				{
					id: "6",
					employeeId: "EMP002",
					date: currentWeek.start,
					clockIn: "09:15 AM",
					clockOut: "05:30 PM",
					hoursWorked: 8,
					status: "late",
					notes: "Traffic delay",
				},
				{
					id: "7",
					employeeId: "EMP002",
					date: new Date(new Date(currentWeek.start).getTime() + 86400000)
						.toISOString()
						.split("T")[0],
					clockIn: "08:30 AM",
					clockOut: "05:30 PM",
					hoursWorked: 8,
					status: "present",
				},
				{
					id: "8",
					employeeId: "EMP002",
					date: new Date(new Date(currentWeek.start).getTime() + 172800000)
						.toISOString()
						.split("T")[0],
					clockIn: "08:30 AM",
					clockOut: "05:30 PM",
					hoursWorked: 8,
					status: "present",
				},
				{
					id: "9",
					employeeId: "EMP002",
					date: new Date(new Date(currentWeek.start).getTime() + 259200000)
						.toISOString()
						.split("T")[0],
					clockIn: "08:30 AM",
					clockOut: "05:30 PM",
					hoursWorked: 8,
					status: "present",
				},
				{
					id: "10",
					employeeId: "EMP002",
					date: new Date(new Date(currentWeek.start).getTime() + 345600000)
						.toISOString()
						.split("T")[0],
					clockIn: "08:30 AM",
					clockOut: "05:30 PM",
					hoursWorked: 8,
					status: "present",
				},
			],
		},
		{
			employeeId: "EMP003",
			employeeName: "Emily Davis",
			department: "Design",
			weekStartDate: currentWeek.start,
			weekEndDate: currentWeek.end,
			totalHours: 32,
			totalDays: 5,
			presentDays: 4,
			lateDays: 0,
			absentDays: 1,
			approvalStatus: "pending_approval",
			records: [
				{
					id: "11",
					employeeId: "EMP003",
					date: currentWeek.start,
					clockIn: "08:30 AM",
					clockOut: "05:30 PM",
					hoursWorked: 8,
					status: "present",
				},
				{
					id: "12",
					employeeId: "EMP003",
					date: new Date(new Date(currentWeek.start).getTime() + 86400000)
						.toISOString()
						.split("T")[0],
					clockIn: "-",
					clockOut: "-",
					hoursWorked: 0,
					status: "sick",
					notes: "Medical certificate provided",
				},
				{
					id: "13",
					employeeId: "EMP003",
					date: new Date(new Date(currentWeek.start).getTime() + 172800000)
						.toISOString()
						.split("T")[0],
					clockIn: "08:30 AM",
					clockOut: "05:30 PM",
					hoursWorked: 8,
					status: "present",
				},
				{
					id: "14",
					employeeId: "EMP003",
					date: new Date(new Date(currentWeek.start).getTime() + 259200000)
						.toISOString()
						.split("T")[0],
					clockIn: "08:30 AM",
					clockOut: "05:30 PM",
					hoursWorked: 8,
					status: "present",
				},
				{
					id: "15",
					employeeId: "EMP003",
					date: new Date(new Date(currentWeek.start).getTime() + 345600000)
						.toISOString()
						.split("T")[0],
					clockIn: "08:30 AM",
					clockOut: "05:30 PM",
					hoursWorked: 8,
					status: "present",
				},
			],
		},
		{
			employeeId: "EMP004",
			employeeName: "David Wilson",
			department: "DevOps",
			weekStartDate: currentWeek.start,
			weekEndDate: currentWeek.end,
			totalHours: 45,
			totalDays: 5,
			presentDays: 5,
			lateDays: 0,
			absentDays: 0,
			approvalStatus: "approved",
			records: [
				{
					id: "16",
					employeeId: "EMP004",
					date: currentWeek.start,
					clockIn: "08:00 AM",
					clockOut: "06:00 PM",
					hoursWorked: 9.5,
					status: "overtime",
				},
				{
					id: "17",
					employeeId: "EMP004",
					date: new Date(new Date(currentWeek.start).getTime() + 86400000)
						.toISOString()
						.split("T")[0],
					clockIn: "08:00 AM",
					clockOut: "06:00 PM",
					hoursWorked: 9.5,
					status: "overtime",
				},
				{
					id: "18",
					employeeId: "EMP004",
					date: new Date(new Date(currentWeek.start).getTime() + 172800000)
						.toISOString()
						.split("T")[0],
					clockIn: "08:00 AM",
					clockOut: "05:30 PM",
					hoursWorked: 9,
					status: "present",
				},
				{
					id: "19",
					employeeId: "EMP004",
					date: new Date(new Date(currentWeek.start).getTime() + 259200000)
						.toISOString()
						.split("T")[0],
					clockIn: "08:00 AM",
					clockOut: "05:30 PM",
					hoursWorked: 9,
					status: "present",
				},
				{
					id: "20",
					employeeId: "EMP004",
					date: new Date(new Date(currentWeek.start).getTime() + 345600000)
						.toISOString()
						.split("T")[0],
					clockIn: "08:00 AM",
					clockOut: "05:30 PM",
					hoursWorked: 8,
					status: "present",
				},
			],
		},
	];

	const getStatusIcon = (status: string) => {
		switch (status) {
			case "present":
			case "overtime":
				return <CheckCircle className="w-4 h-4 text-green-600" />;
			case "late":
				return <AlertCircle className="w-4 h-4 text-yellow-600" />;
			case "absent":
			case "sick":
			case "vacation":
				return <XCircle className="w-4 h-4 text-red-600" />;
			default:
				return <Clock className="w-4 h-4 text-gray-600" />;
		}
	};

	const getStatusBadge = (status: string) => {
		const baseClasses = "px-2 py-1 text-xs rounded-full font-medium";
		switch (status) {
			case "present":
				return `${baseClasses} bg-green-100 text-green-800`;
			case "late":
				return `${baseClasses} bg-yellow-100 text-yellow-800`;
			case "absent":
				return `${baseClasses} bg-red-100 text-red-800`;
			case "sick":
			case "vacation":
				return `${baseClasses} bg-blue-100 text-blue-800`;
			case "overtime":
				return `${baseClasses} bg-purple-100 text-purple-800`;
			default:
				return `${baseClasses} bg-gray-100 text-gray-800`;
		}
	};

	const getApprovalBadge = (status: string) => {
		const baseClasses = "px-2 py-1 text-xs rounded-full font-medium";
		switch (status) {
			case "approved":
				return `${baseClasses} bg-green-100 text-green-800`;
			case "pending_approval":
				return `${baseClasses} bg-yellow-100 text-yellow-800`;
			case "rejected":
				return `${baseClasses} bg-red-100 text-red-800`;
			case "pending_hr_review":
				return `${baseClasses} bg-blue-100 text-blue-800`;
			default:
				return `${baseClasses} bg-gray-100 text-gray-800`;
		}
	};

	const handleArchive = (employeeId: string) => {
		console.log("Archiving attendance record for:", employeeId);
		// TODO: Implement archive functionality
		setDropdownOpen(null);
	};

	const handleDelete = (employeeId: string) => {
		const confirmed = window.confirm(
			"Are you sure you want to delete this attendance record? This action cannot be undone.",
		);
		if (confirmed) {
			console.log("Deleting attendance record for:", employeeId);
			// TODO: Implement delete functionality
		}
		setDropdownOpen(null);
	};

	const toggleDropdown = (employeeId: string) => {
		setDropdownOpen(dropdownOpen === employeeId ? null : employeeId);
	};

	const closeDropdown = (employeeId: string) => {
		setDropdownOpen(null);
	};

	const handleViewDetails = (employeeId: string) => {
		// Navigate to the detailed employee attendance approval page
		navigate(`/employee/attendance-approval/${employeeId}`);
	};

	// Summary metrics
	const totalEmployees = weeklyAttendanceData.length;
	const pendingApprovals = weeklyAttendanceData.filter(
		(a) => a.approvalStatus === "pending_approval",
	).length;
	const approvedCount = weeklyAttendanceData.filter(
		(a) => a.approvalStatus === "approved",
	).length;
	const totalHours = weeklyAttendanceData.reduce((sum, a) => sum + a.totalHours, 0);

	// DataTable columns
	type AttendanceRow = (typeof weeklyAttendanceData)[number];
	const columns: Column<AttendanceRow>[] = useMemo(
		() => [
			{
				key: "employeeName",
				label: "Employee",
				sortable: true,
				render: (_v, item) => (
					<div className="flex items-center gap-3">
						<div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
							<User className="w-4 h-4 text-orange-600" />
						</div>
						<div className="flex flex-col">
							<span className="text-gray-900 font-medium">{item.employeeName}</span>
							<span className="text-xs text-gray-500">{item.employeeId}</span>
						</div>
					</div>
				),
			},
			{ key: "department", label: "Department", sortable: true },
			{
				key: "totalDays",
				label: "Work Days",
				sortable: true,
				render: (_v, item) => (
					<div className="flex flex-col">
						<span className="text-gray-900 font-medium">{item.totalDays} days</span>
						<span className="text-xs text-gray-500">
							{item.presentDays} present, {item.lateDays} late, {item.absentDays}{" "}
							absent
						</span>
					</div>
				),
			},
			{
				key: "totalHours",
				label: "Total Hours",
				sortable: true,
				render: (v) => (
					<span className="text-gray-900 font-medium">{Number(v).toFixed(1)}h</span>
				),
			},
			{
				key: "approvalStatus",
				label: "Status",
				render: (v) => {
					const status = String(v);
					return (
						<span className={getApprovalBadge(status)}>
							{status === "pending_approval"
								? "Pending"
								: status === "pending_hr_review"
									? "Pending HR"
									: status.charAt(0).toUpperCase() + status.slice(1)}
						</span>
					);
				},
			},
		],
		[],
	);

	return (
		<div className="space-y-6">
			{/* Header with Week Navigation */}
			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-xl font-bold text-gray-900">Weekly Attendance Approvals</h3>
					<p className="text-gray-600">
						Review and approve team attendance for the week before HR processing
					</p>
				</div>
				<div className="flex items-center gap-3">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setCurrentWeekOffset(currentWeekOffset - 1)}>
						<ChevronLeft className="w-4 h-4" />
					</Button>
					<div className="text-center px-4 py-2 bg-gray-50 rounded-lg">
						<div className="text-sm font-medium text-gray-900">
							{currentWeek.displayStart} - {currentWeek.displayEnd}
						</div>
						<div className="text-xs text-gray-500">
							{currentWeekOffset === 0
								? "Current Week"
								: currentWeekOffset === -1
									? "Last Week"
									: `${Math.abs(currentWeekOffset)} weeks ago`}
						</div>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setCurrentWeekOffset(currentWeekOffset + 1)}
						disabled={currentWeekOffset >= 0}>
						<ChevronRight className="w-4 h-4" />
					</Button>
				</div>
			</div>

			{/* Summary Cards */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
				<SummaryCard title="Team Members" value={totalEmployees} color="blue" icon={User} />
				<SummaryCard
					title="Pending Approvals"
					value={pendingApprovals}
					color="orange"
					icon={Clock}
				/>
				<SummaryCard
					title="Approved"
					value={approvedCount}
					color="green"
					icon={CheckCircle}
				/>
				<SummaryCard
					title="Total Hours"
					value={`${totalHours.toFixed(1)}h`}
					color="purple"
					icon={TrendingUp}
				/>
			</div>

			{/* Actions Bar */}
			{pendingApprovals > 0 && (
				<div className="flex items-center gap-3 bg-orange-50 p-4 rounded-lg border border-orange-200">
					<AlertCircle className="w-5 h-5 text-orange-600" />
					<span className="text-orange-800 font-medium">
						{pendingApprovals} employee(s) have pending attendance approvals. Click
						&quot;Review&quot; to approve individual records.
					</span>
				</div>
			)}

			{/* DataTable */}
			<DataTable<AttendanceRow>
				title="Team Attendance Records"
				description={`Weekly attendance for ${currentWeek.displayStart} - ${currentWeek.displayEnd}`}
				data={weeklyAttendanceData}
				columns={columns}
				searchFields={["employeeName", "employeeId", "department"]}
				filters={[
					{
						key: "approvalStatus",
						label: "Approval Status",
						options: [
							{ value: "pending_approval", label: "Pending" },
							{ value: "approved", label: "Approved" },
							{ value: "rejected", label: "Rejected" },
							{ value: "pending_hr_review", label: "Pending HR Review" },
						],
					},
					{
						key: "department",
						label: "Department",
						options: Array.from(
							new Set(weeklyAttendanceData.map((a) => a.department)),
						).map((d) => ({
							value: d,
							label: d,
						})),
					},
				]}
				itemsPerPage={10}
				renderActions={(item) => {
					const isOpen = dropdownOpen === item.employeeId;

					return (
						<div className="relative" data-dropdown>
							<Button
								variant="outline"
								size="sm"
								onClick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									toggleDropdown(item.employeeId);
								}}
								className="flex items-center justify-center w-8 h-8 p-0">
								<MoreVertical className="h-4 w-4" />
							</Button>
							{isOpen && (
								<div
									className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-[9999]"
									style={{ zIndex: 9999 }}
									data-dropdown
									onClick={(e) => e.stopPropagation()}>
									<div className="py-1">
										<button
											onClick={(e) => {
												e.stopPropagation();
												handleViewDetails(item.employeeId);
												closeDropdown(item.employeeId);
											}}
											className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
											<Eye className="h-4 w-4" />
											Review
										</button>
										<button
											onClick={(e) => {
												e.stopPropagation();
												handleArchive(item.employeeId);
												closeDropdown(item.employeeId);
											}}
											className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
											<Archive className="h-4 w-4" />
											Archive
										</button>
										<hr className="my-1" />
										<button
											onClick={(e) => {
												e.stopPropagation();
												handleDelete(item.employeeId);
												closeDropdown(item.employeeId);
											}}
											className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50">
											<Trash2 className="h-4 w-4" />
											Delete
										</button>
									</div>
								</div>
							)}
						</div>
					);
				}}
				emptyMessage="No attendance records found for this week"
				emptyDescription="Try selecting a different week to view attendance records."
			/>
		</div>
	);
}
