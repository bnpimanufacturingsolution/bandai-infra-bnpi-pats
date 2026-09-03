import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import {
	X,
	Calendar,
	Clock,
	MapPin,
	Monitor,
	FileText,
	CheckCircle,
	XCircle,
	AlertCircle,
	TrendingUp,
} from "lucide-react";
import type { AttendanceRecord } from "~/types/attendance";

interface AttendanceDetailModalProps {
	isOpen: boolean;
	onClose: () => void;
	employeeName: string;
	employeeId: string;
	department: string;
	weekStartDate: string;
	weekEndDate: string;
	records: AttendanceRecord[];
	onApprove?: () => void;
	onReject?: () => void;
}

export default function AttendanceDetailModal({
	isOpen,
	onClose,
	employeeName,
	employeeId,
	department,
	weekStartDate,
	weekEndDate,
	records,
	onApprove,
	onReject,
}: AttendanceDetailModalProps) {
	const getStatusIcon = (status: string) => {
		switch (status) {
			case "present":
			case "overtime":
				return <CheckCircle className="w-5 h-5 text-green-600" />;
			case "late":
				return <AlertCircle className="w-5 h-5 text-yellow-600" />;
			case "absent":
			case "sick":
			case "vacation":
				return <XCircle className="w-5 h-5 text-red-600" />;
			default:
				return <Clock className="w-5 h-5 text-gray-600" />;
		}
	};

	const getStatusBadge = (status: string) => {
		const baseClasses = "px-3 py-1 text-sm rounded-full font-medium";
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

	const formatDate = (dateStr: string) => {
		const date = new Date(dateStr);
		return date.toLocaleDateString("en-US", {
			weekday: "long",
			month: "long",
			day: "numeric",
			year: "numeric",
		});
	};

	const totalHours = records.reduce((sum, r) => sum + r.hoursWorked, 0);
	const presentDays = records.filter(
		(r) => r.status === "present" || r.status === "overtime",
	).length;
	const lateDays = records.filter((r) => r.status === "late").length;
	const absentDays = records.filter((r) => r.status === "absent" || r.status === "sick").length;

	return (
		<Modal open={isOpen} onOpenChange={(v) => !v && onClose()} className="max-w-4xl">
			<div className="space-y-6">
				{/* Header */}
				<div className="flex items-start justify-between">
					<div>
						<h2 className="text-2xl font-bold text-gray-900">
							Weekly Attendance Details
						</h2>
						<p className="text-gray-600 mt-1">
							{employeeName} ({employeeId}) • {department}
						</p>
						<p className="text-sm text-gray-500 mt-1">
							Week: {new Date(weekStartDate).toLocaleDateString()} -{" "}
							{new Date(weekEndDate).toLocaleDateString()}
						</p>
					</div>
					<button
						onClick={onClose}
						className="text-gray-400 hover:text-gray-600 transition-colors">
						<X className="w-6 h-6" />
					</button>
				</div>

				{/* Summary Stats */}
				<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
					<div className="bg-blue-50 rounded-lg p-4">
						<div className="flex items-center gap-2 mb-1">
							<Calendar className="w-4 h-4 text-blue-600" />
							<span className="text-sm text-blue-600 font-medium">Total Days</span>
						</div>
						<p className="text-2xl font-bold text-blue-900">{records.length}</p>
					</div>
					<div className="bg-green-50 rounded-lg p-4">
						<div className="flex items-center gap-2 mb-1">
							<CheckCircle className="w-4 h-4 text-green-600" />
							<span className="text-sm text-green-600 font-medium">Present</span>
						</div>
						<p className="text-2xl font-bold text-green-900">{presentDays}</p>
					</div>
					<div className="bg-yellow-50 rounded-lg p-4">
						<div className="flex items-center gap-2 mb-1">
							<AlertCircle className="w-4 h-4 text-yellow-600" />
							<span className="text-sm text-yellow-600 font-medium">Late</span>
						</div>
						<p className="text-2xl font-bold text-yellow-900">{lateDays}</p>
					</div>
					<div className="bg-purple-50 rounded-lg p-4">
						<div className="flex items-center gap-2 mb-1">
							<TrendingUp className="w-4 h-4 text-purple-600" />
							<span className="text-sm text-purple-600 font-medium">Total Hours</span>
						</div>
						<p className="text-2xl font-bold text-purple-900">
							{totalHours.toFixed(1)}h
						</p>
					</div>
				</div>

				{/* Daily Records */}
				<div>
					<h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Attendance</h3>
					<div className="space-y-3 max-h-96 overflow-y-auto">
						{records.map((record) => (
							<Card key={record.id} className="border border-gray-200">
								<CardContent className="p-4">
									<div className="flex items-start justify-between">
										<div className="flex items-start gap-4 flex-1">
											<div className="p-2 bg-gray-100 rounded-lg">
												{getStatusIcon(record.status)}
											</div>
											<div className="flex-1">
												<div className="flex items-center gap-3 mb-2">
													<h4 className="font-semibold text-gray-900">
														{formatDate(record.date)}
													</h4>
													<span className={getStatusBadge(record.status)}>
														{record.status.charAt(0).toUpperCase() +
															record.status.slice(1)}
													</span>
												</div>
												<div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
													<div className="flex items-center gap-2 text-gray-600">
														<Clock className="w-4 h-4" />
														<span>In: {record.clockIn || "N/A"}</span>
													</div>
													<div className="flex items-center gap-2 text-gray-600">
														<Clock className="w-4 h-4" />
														<span>Out: {record.clockOut || "N/A"}</span>
													</div>
													<div className="flex items-center gap-2 text-gray-600">
														<TrendingUp className="w-4 h-4" />
														<span>
															{record.hoursWorked.toFixed(1)} hours
														</span>
													</div>
													{record.location && (
														<div className="flex items-center gap-2 text-gray-600">
															<MapPin className="w-4 h-4" />
															<span>{record.location}</span>
														</div>
													)}
												</div>
												{record.notes && (
													<div className="mt-3 flex items-start gap-2 text-sm">
														<FileText className="w-4 h-4 text-gray-400 mt-0.5" />
														<span className="text-gray-600 italic">
															{record.notes}
														</span>
													</div>
												)}
												{record.device && (
													<div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
														<Monitor className="w-3 h-3" />
														<span>Device: {record.device}</span>
													</div>
												)}
											</div>
										</div>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				</div>

				{/* Action Buttons */}
				<div className="flex items-center justify-end gap-3 pt-4 border-t">
					<Button variant="outline" onClick={onClose}>
						Close
					</Button>
					{onReject && (
						<Button
							variant="outline"
							className="text-red-600 border-red-600 hover:bg-red-50"
							onClick={onReject}>
							<XCircle className="w-4 h-4 mr-2" />
							Reject Week
						</Button>
					)}
					{onApprove && (
						<Button
							className="bg-green-600 hover:bg-green-700 text-white"
							onClick={onApprove}>
							<CheckCircle className="w-4 h-4 mr-2" />
							Approve Week
						</Button>
					)}
				</div>
			</div>
		</Modal>
	);
}
