import { Clock, Lock } from "lucide-react";
import MobileSiteLayout from "~/layouts/mobile-site-layout";
import { useAuth } from "~/lib/hooks/use-auth";
import { useEffect, useState } from "react";
import {
	useMarkAttendance,
	useUpdateAttendanceRecord,
	useTodayAttendance,
} from "~/lib/hooks/useEmployees";
import { getEmployeeActionBlock } from "~/lib/employee-action-block";

export default function SiteHome() {
	const { user } = useAuth();
	const [currentDateTime, setCurrentDateTime] = useState(new Date());

	// Get employee ID from user
	const employeeId = user?.metadata?.employee?.id;
	const actionBlock = getEmployeeActionBlock(user?.metadata?.employee);

	// Fetch today's attendance
	const { data: todayAttendance, isLoading: isLoadingAttendance } = useTodayAttendance(
		employeeId || "",
	);

	// Mutations
	const markAttendanceMutation = useMarkAttendance();
	const updateAttendanceMutation = useUpdateAttendanceRecord();

	// Update time every minute
	useEffect(() => {
		const timer = setInterval(() => {
			setCurrentDateTime(new Date());
		}, 60000);
		return () => clearInterval(timer);
	}, []);

	const formatDateTime = (date: Date) => {
		const options: Intl.DateTimeFormatOptions = {
			month: "2-digit",
			day: "2-digit",
			year: "numeric",
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		};
		return date.toLocaleString("en-US", options).replace(",", "");
	};

	const formatTime = (dateString?: string | null) => {
		if (!dateString) return "--:--";
		const date = new Date(dateString);
		return date.toLocaleTimeString("en-US", {
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		});
	};

	const getInitials = (firstName?: string, lastName?: string) => {
		if (!firstName) return "U";
		return firstName.charAt(0).toUpperCase();
	};

	// Check if user has clocked in/out
	const hasTimeIn = !!todayAttendance?.timeIn;
	const hasTimeOut = !!todayAttendance?.timeOut;

	// Disable buttons logic
	const isClockInDisabled = actionBlock.blocked || hasTimeIn || markAttendanceMutation.isPending;
	const isClockOutDisabled =
		actionBlock.blocked || !hasTimeIn || updateAttendanceMutation.isPending;

	// Handle Clock In
	const handleClockIn = async () => {
		if (actionBlock.blocked) return;
		if (!employeeId) return;

		try {
			await markAttendanceMutation.mutateAsync({
				employeeId,
				data: {
					status: "PRESENT",
				},
			});
		} catch (error) {
			console.error("Clock in failed:", error);
		}
	};

	// Handle Clock Out
	const handleClockOut = async () => {
		if (actionBlock.blocked) return;
		if (!employeeId || !todayAttendance?.id) return;

		try {
			await updateAttendanceMutation.mutateAsync({
				employeeId,
				attendanceId: todayAttendance.id,
				data: {
					timeOut: new Date().toISOString(),
				},
			});
		} catch (error) {
			console.error("Clock out failed:", error);
		}
	};

	return (
		<MobileSiteLayout>
			<div className="min-h-screen bg-white">
				{/* Header */}
				<div className="bg-white px-6 py-4 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="w-12 h-12 bg-gradient-to-br from-[#ff9e20] to-[#dd5502] rounded-full flex items-center justify-center">
							<div className="w-8 h-8 bg-white rounded-full"></div>
						</div>
						<div>
							<h1 className="text-lg font-bold text-gray-900">
								Welcome,{" "}
								{user?.metadata?.employee?.personalInfo?.firstName || "User"}!
							</h1>
							<p className="text-xs text-gray-500">
								{formatDateTime(currentDateTime)}
							</p>
						</div>
					</div>
					<div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-[#ffb94a] to-[#f97907] flex items-center justify-center">
						<div className="w-full h-full flex items-center justify-center text-white font-bold">
							{getInitials(
								user?.metadata?.employee?.personalInfo?.firstName,
								user?.metadata?.employee?.personalInfo?.lastName,
							)}
						</div>
					</div>
				</div>

				{/* Main Content */}
				<div className="px-6 py-4 space-y-6">
					{/* Expected Attendance */}
					<div>
						<p className="text-sm text-gray-700 mb-4">
							Expected attendance: <span className="font-semibold">9:00 am</span>
						</p>
						{actionBlock.blocked && (
							<div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
								<div className="mb-1 flex items-center gap-2 font-semibold">
									<Lock className="h-4 w-4" />
									Attendance actions blocked
								</div>
								<p className="text-xs leading-5 text-amber-800">
									{actionBlock.message}
								</p>
							</div>
						)}

						<div className="grid grid-cols-2 gap-4">
							<button
								onClick={handleClockIn}
								disabled={isClockInDisabled}
								className={`rounded-xl p-5 flex flex-col items-center gap-2 transition-colors ${
									isClockInDisabled
										? "bg-gray-200 cursor-not-allowed opacity-50"
										: "bg-[#ffebc6]/50 hover:bg-[#ffebc6] hover:cursor-pointer"
								}`}>
								<div className="w-11 h-11 bg-white rounded-full flex items-center justify-center shadow-sm">
									<Clock className="w-5 h-5 text-gray-800" />
								</div>
								<span className="text-sm font-medium text-gray-900">Clock In</span>
								{hasTimeIn && (
									<span className="text-xs text-green-600 font-semibold">
										{formatTime(todayAttendance?.timeIn || null)}
									</span>
								)}
							</button>
							<button
								onClick={handleClockOut}
								disabled={isClockOutDisabled}
								className={`rounded-xl p-5 flex flex-col items-center gap-2 transition-colors ${
									isClockOutDisabled
										? "bg-gray-200 cursor-not-allowed opacity-50"
										: "bg-lime-100/50 hover:bg-lime-100 hover:cursor-pointer"
								}`}>
								<div className="w-11 h-11 bg-white rounded-full flex items-center justify-center shadow-sm">
									<Clock className="w-5 h-5 text-gray-800" />
								</div>
								<span className="text-sm font-medium text-gray-900">Clock Out</span>
								{hasTimeOut && (
									<span className="text-xs text-green-600 font-semibold">
										{formatTime(todayAttendance?.timeOut || null)}
									</span>
								)}
							</button>
						</div>
					</div>

					<div>
						<h2 className="text-base font-bold text-gray-900 mb-4">
							Time Logs for Today
						</h2>
						{todayAttendance ? (
							<div className="flex items-center gap-3">
								<div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-[#ffb94a] to-[#f97907] flex items-center justify-center flex-shrink-0">
									<div className="w-full h-full flex items-center justify-center text-white text-xs font-bold">
										{getInitials(
											user?.metadata?.employee?.personalInfo?.firstName,
											user?.metadata?.employee?.personalInfo?.lastName,
										)}
									</div>
								</div>
								<div>
									<p className="text-sm font-semibold text-gray-900">
										{todayAttendance.status}
									</p>
									<p className="text-xs text-gray-500">
										{new Date(todayAttendance.date).toLocaleDateString(
											"en-US",
											{
												month: "2-digit",
												day: "2-digit",
												year: "numeric",
											},
										)}{" "}
										- In: {formatTime(todayAttendance.timeIn)} | Out:{" "}
										{formatTime(todayAttendance.timeOut)}
									</p>
								</div>
							</div>
						) : (
							<p className="text-sm text-gray-500">No attendance records for today</p>
						)}
					</div>
				</div>
			</div>
		</MobileSiteLayout>
	);
}
