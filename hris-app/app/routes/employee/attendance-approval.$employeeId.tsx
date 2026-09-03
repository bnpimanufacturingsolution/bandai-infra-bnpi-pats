import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import {
	CheckCircle,
	XCircle,
	Clock,
	User,
	ArrowLeft,
	AlertCircle,
	Calendar,
	Save,
	CheckSquare,
} from "lucide-react";
import type { AttendanceRecord, AttendanceApprovalStatus } from "~/types/attendance";

interface EmployeeAttendanceApprovalProps {
	employeeId: string;
}

export default function EmployeeAttendanceApproval() {
	const { employeeId } = useParams<{ employeeId: string }>();
	const navigate = useNavigate();
	const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
	const [employeeInfo, setEmployeeInfo] = useState<{
		name: string;
		department: string;
		weekStart: string;
		weekEnd: string;
	} | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [hasChanges, setHasChanges] = useState(false);

	// Sample data - in real app, this would come from API
	useEffect(() => {
		if (!employeeId) return;

		// Simulate API call
		setTimeout(() => {
			const sampleData = getSampleAttendanceData(employeeId);
			setAttendanceRecords(sampleData.records);
			setEmployeeInfo(sampleData.employeeInfo);
			setIsLoading(false);
		}, 500);
	}, [employeeId]);

	const getSampleAttendanceData = (empId: string) => {
		const today = new Date();
		const dayOfWeek = today.getDay();
		const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
		const monday = new Date(today.setDate(diff));
		const sunday = new Date(monday);
		sunday.setDate(monday.getDate() + 6);

		const weekStart = monday.toISOString().split("T")[0];
		const weekEnd = sunday.toISOString().split("T")[0];

		const employeeMap: Record<string, { name: string; department: string }> = {
			EMP001: { name: "Sarah Johnson", department: "Development" },
			EMP002: { name: "Mike Chen", department: "Development" },
			EMP003: { name: "Emily Davis", department: "Design" },
			EMP004: { name: "David Wilson", department: "DevOps" },
		};

		const employee = employeeMap[empId] || { name: "Unknown Employee", department: "Unknown" };

		const records: AttendanceRecord[] = [
			{
				id: "1",
				employeeId: empId,
				date: weekStart,
				clockIn: "08:10 AM",
				clockOut: "05:00 PM",
				hoursWorked: 8.5,
				status: "present",
				approvalStatus: "pending_approval",
			},
			{
				id: "2",
				employeeId: empId,
				date: new Date(new Date(weekStart).getTime() + 86400000)
					.toISOString()
					.split("T")[0],
				clockIn: "08:25 AM",
				clockOut: "05:15 PM",
				hoursWorked: 8.0,
				status: "late",
				approvalStatus: "pending_approval",
				notes: "Traffic delay",
			},
			{
				id: "3",
				employeeId: empId,
				date: new Date(new Date(weekStart).getTime() + 172800000)
					.toISOString()
					.split("T")[0],
				clockIn: "-",
				clockOut: "-",
				hoursWorked: 0,
				status: "absent",
				approvalStatus: "rejected",
				managerNotes: "No clock-in recorded",
			},
			{
				id: "4",
				employeeId: empId,
				date: new Date(new Date(weekStart).getTime() + 259200000)
					.toISOString()
					.split("T")[0],
				clockIn: "08:05 AM",
				clockOut: "05:00 PM",
				hoursWorked: 8.5,
				status: "present",
				approvalStatus: "approved",
			},
			{
				id: "5",
				employeeId: empId,
				date: new Date(new Date(weekStart).getTime() + 345600000)
					.toISOString()
					.split("T")[0],
				clockIn: "08:20 AM",
				clockOut: "05:10 PM",
				hoursWorked: 8.0,
				status: "present",
				approvalStatus: "pending_approval",
			},
		];

		return {
			records,
			employeeInfo: {
				name: employee.name,
				department: employee.department,
				weekStart,
				weekEnd,
			},
		};
	};

	const getStatusIcon = (status: string) => {
		switch (status) {
			case "present":
				return <CheckCircle className="w-4 h-4 text-green-600" />;
			case "late":
				return <AlertCircle className="w-4 h-4 text-yellow-600" />;
			case "absent":
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
			default:
				return `${baseClasses} bg-gray-100 text-gray-800`;
		}
	};

	const getApprovalStatusBadge = (status: AttendanceApprovalStatus) => {
		const baseClasses = "px-2 py-1 text-xs rounded-full font-medium";
		switch (status) {
			case "approved":
				return `${baseClasses} bg-green-100 text-green-800`;
			case "rejected":
				return `${baseClasses} bg-red-100 text-red-800`;
			case "pending_approval":
				return `${baseClasses} bg-yellow-100 text-yellow-800`;
			case "pending_hr_review":
				return `${baseClasses} bg-blue-100 text-blue-800`;
			default:
				return `${baseClasses} bg-gray-100 text-gray-800`;
		}
	};

	const handleApprove = (recordId: string) => {
		const currentRecord = attendanceRecords.find((r) => r.id === recordId);
		const isCurrentlyApproved = currentRecord?.approvalStatus === "approved";

		if (isCurrentlyApproved) {
			// If already approved, change back to pending
			setAttendanceRecords((prev) =>
				prev.map((record) =>
					record.id === recordId
						? {
								...record,
								approvalStatus: "pending_approval" as AttendanceApprovalStatus,
								managerNotes: undefined,
							}
						: record,
				),
			);
		} else {
			// If not approved, approve it
			setAttendanceRecords((prev) =>
				prev.map((record) =>
					record.id === recordId
						? {
								...record,
								approvalStatus: "approved" as AttendanceApprovalStatus,
								managerNotes: undefined,
							}
						: record,
				),
			);
		}
		setHasChanges(true);
	};

	const handleReject = (recordId: string) => {
		const currentRecord = attendanceRecords.find((r) => r.id === recordId);
		const isCurrentlyRejected = currentRecord?.approvalStatus === "rejected";

		if (isCurrentlyRejected) {
			// If already rejected, change back to pending
			setAttendanceRecords((prev) =>
				prev.map((record) =>
					record.id === recordId
						? {
								...record,
								approvalStatus: "pending_approval" as AttendanceApprovalStatus,
								managerNotes: undefined,
							}
						: record,
				),
			);
		} else {
			// If not rejected, ask for reason and reject
			const reason = prompt("Please provide a reason for rejection:");
			if (reason) {
				setAttendanceRecords((prev) =>
					prev.map((record) =>
						record.id === recordId
							? {
									...record,
									approvalStatus: "rejected" as AttendanceApprovalStatus,
									managerNotes: reason,
								}
							: record,
					),
				);
			}
		}
		setHasChanges(true);
	};

	const handleApproveAllPending = () => {
		setAttendanceRecords((prev) =>
			prev.map((record) =>
				record.approvalStatus === "pending_approval"
					? { ...record, approvalStatus: "approved" as AttendanceApprovalStatus }
					: record,
			),
		);
		setHasChanges(true);
	};

	const handleSaveChanges = () => {
		// TODO: Implement API call to save all changes
		console.log("Saving attendance approvals:", attendanceRecords);
		setHasChanges(false);
		// Navigate back to main approvals page
		navigate("/employee/approvals");
	};

	const getDayName = (date: string) => {
		const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
		return days[new Date(date).getDay()];
	};

	const formatDate = (date: string) => {
		return new Date(date).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
		});
	};

	// Summary calculations
	const totalRecords = attendanceRecords.length;
	const approvedRecords = attendanceRecords.filter((r) => r.approvalStatus === "approved").length;
	const rejectedRecords = attendanceRecords.filter((r) => r.approvalStatus === "rejected").length;
	const pendingRecords = attendanceRecords.filter(
		(r) => r.approvalStatus === "pending_approval",
	).length;

	const columns: Column<AttendanceRecord>[] = [
		{
			key: "date",
			label: "Date",
			render: (v) => (
				<div className="flex flex-col">
					<span className="text-gray-900 font-medium">{formatDate(String(v))}</span>
					<span className="text-xs text-gray-500">{getDayName(String(v))}</span>
				</div>
			),
		},
		{
			key: "clockIn",
			label: "Time In",
			render: (v) => <span className="text-gray-900">{String(v) || "-"}</span>,
		},
		{
			key: "clockOut",
			label: "Time Out",
			render: (v) => <span className="text-gray-900">{String(v) || "-"}</span>,
		},
		{
			key: "hoursWorked",
			label: "Total Hours",
			render: (v) => (
				<span className="text-gray-900 font-medium">
					{Number(v) > 0 ? `${Number(v).toFixed(1)}h` : "-"}
				</span>
			),
		},
		{
			key: "status",
			label: "Status",
			render: (v) => (
				<div className="flex items-center gap-2">
					{getStatusIcon(String(v))}
					<span className={getStatusBadge(String(v))}>
						{String(v).charAt(0).toUpperCase() + String(v).slice(1)}
					</span>
				</div>
			),
		},
		{
			key: "approvalStatus",
			label: "Approval Status",
			render: (v) => (
				<span className={getApprovalStatusBadge(v as AttendanceApprovalStatus)}>
					{v === "pending_approval"
						? "Pending"
						: v === "pending_hr_review"
							? "Pending HR"
							: String(v).charAt(0).toUpperCase() + String(v).slice(1)}
				</span>
			),
		},
		{
			key: "actions",
			label: "Actions",
			render: (_v, item) => {
				const isApproved = item.approvalStatus === "approved";
				const isRejected = item.approvalStatus === "rejected";
				const isPending = item.approvalStatus === "pending_approval";

				return (
					<div className="flex items-center justify-end gap-2">
						{isPending ? (
							// Show both action buttons for pending items
							<>
								<button
									onClick={() => handleApprove(item.id)}
									className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-all duration-200 shadow-sm hover:shadow">
									<CheckCircle className="w-4 h-4" />
									Approve
								</button>
								<button
									onClick={() => handleReject(item.id)}
									className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-red-600 border border-transparent rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-all duration-200 shadow-sm">
									<XCircle className="w-4 h-4" />
									Reject
								</button>
							</>
						) : isApproved ? (
							// Show approved state with option to undo
							<div className="flex items-center gap-2">
								<div className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 rounded-lg border border-green-200">
									<CheckCircle className="w-4 h-4" />
									Approved
								</div>
								<button
									onClick={() => handleApprove(item.id)}
									className="inline-flex items-center justify-center w-8 h-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-all duration-200"
									title="Undo approval">
									<XCircle className="w-4 h-4" />
								</button>
							</div>
						) : isRejected ? (
							// Show rejected state with option to undo
							<div className="flex items-center gap-2">
								<div className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 rounded-lg border border-red-200">
									<XCircle className="w-4 h-4" />
									Rejected
								</div>
								<button
									onClick={() => handleReject(item.id)}
									className="inline-flex items-center justify-center w-8 h-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-all duration-200"
									title="Undo rejection">
									<CheckCircle className="w-4 h-4" />
								</button>
							</div>
						) : null}
					</div>
				);
			},
		},
	];

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="text-center">
					<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto"></div>
					<p className="mt-2 text-gray-600">Loading attendance records...</p>
				</div>
			</div>
		);
	}

	if (!employeeInfo) {
		return (
			<div className="text-center py-8">
				<AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
				<h3 className="text-lg font-semibold text-gray-900 mb-2">Employee Not Found</h3>
				<p className="text-gray-600 mb-4">The requested employee could not be found.</p>
				<Button onClick={() => navigate("/employee/approvals")}>
					<ArrowLeft className="w-4 h-4 mr-2" />
					Back to Approvals
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Button
						variant="outline"
						size="sm"
						onClick={() => navigate("/employee/approvals")}>
						<ArrowLeft className="w-4 h-4 mr-2" />
						Back to Approvals
					</Button>
					<div>
						<h1 className="text-2xl font-bold text-gray-900">
							Employee Weekly Attendance Approval
						</h1>
						<p className="text-gray-600">
							Review and approve daily attendance records for {employeeInfo.name}
						</p>
					</div>
				</div>
			</div>

			{/* Employee Info Card */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-3">
						<User className="w-5 h-5 text-orange-600" />
						Employee Information
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Employee Name
							</label>
							<p className="text-gray-900 font-medium">{employeeInfo.name}</p>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Department
							</label>
							<p className="text-gray-900">{employeeInfo.department}</p>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Week Period
							</label>
							<p className="text-gray-900">
								{formatDate(employeeInfo.weekStart)} -{" "}
								{formatDate(employeeInfo.weekEnd)}
							</p>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Summary Stats */}
			<div className="grid grid-cols-1 md:grid-cols-4 gap-6">
				<Card>
					<CardContent className="pt-6">
						<div className="flex items-center">
							<div className="p-2 bg-blue-100 rounded-lg">
								<Calendar className="w-5 h-5 text-blue-600" />
							</div>
							<div className="ml-4">
								<p className="text-sm font-medium text-gray-600">Total Days</p>
								<p className="text-2xl font-bold text-gray-900">{totalRecords}</p>
							</div>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-6">
						<div className="flex items-center">
							<div className="p-2 bg-green-100 rounded-lg">
								<CheckCircle className="w-5 h-5 text-green-600" />
							</div>
							<div className="ml-4">
								<p className="text-sm font-medium text-gray-600">Approved</p>
								<p className="text-2xl font-bold text-gray-900">
									{approvedRecords}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-6">
						<div className="flex items-center">
							<div className="p-2 bg-red-100 rounded-lg">
								<XCircle className="w-5 h-5 text-red-600" />
							</div>
							<div className="ml-4">
								<p className="text-sm font-medium text-gray-600">Rejected</p>
								<p className="text-2xl font-bold text-gray-900">
									{rejectedRecords}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-6">
						<div className="flex items-center">
							<div className="p-2 bg-yellow-100 rounded-lg">
								<Clock className="w-5 h-5 text-yellow-600" />
							</div>
							<div className="ml-4">
								<p className="text-sm font-medium text-gray-600">Pending</p>
								<p className="text-2xl font-bold text-gray-900">{pendingRecords}</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Actions Bar */}
			<div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
				<div className="flex items-center gap-3">
					{pendingRecords > 0 && (
						<Button
							variant="outline"
							onClick={handleApproveAllPending}
							className="border-green-600 text-green-600 hover:bg-green-50">
							<CheckSquare className="w-4 h-4 mr-2" />
							Approve All Pending Days
						</Button>
					)}
				</div>
				<div className="flex items-center gap-3">
					{hasChanges && (
						<span className="text-sm text-orange-600 font-medium">
							You have unsaved changes
						</span>
					)}
					<Button
						onClick={handleSaveChanges}
						disabled={!hasChanges}
						className="bg-orange-600 hover:bg-orange-700 text-white">
						<Save className="w-4 h-4 mr-2" />
						Save Changes
					</Button>
				</div>
			</div>

			{/* Attendance Records Table */}
			<DataTable<AttendanceRecord>
				title="Daily Attendance Records"
				description=""
				data={attendanceRecords}
				columns={columns}
				searchFields={["date", "status"]}
				itemsPerPage={10}
				emptyMessage="No attendance records found"
				emptyDescription="There are no attendance records for this employee in the selected week."
			/>
		</div>
	);
}
