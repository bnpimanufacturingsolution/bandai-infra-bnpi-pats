import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { DataTable } from "~/components/atoms/DataTable";
import type { Column, FilterOption } from "~/components/atoms/DataTable";
import {
	LayoutList,
	Calendar as CalendarIcon,
	ChevronLeft,
	ChevronRight,
	Clock,
	CheckCircle,
	Play,
	Pause,
	Timer,
	Lock,
	MoreVertical,
	Edit,
	Trash2,
	Archive,
	Eye,
} from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "~/lib/hooks/use-auth";
import {
	useTodayAttendance,
	useClockIn,
	useClockOut,
	useEmployeeAttendance,
} from "~/lib/hooks/useEmployees";
import { TimesheetModal } from "~/components/organisms/timesheet-modal";
import {
	TimesheetCalendar,
	type TimesheetBreakdownDay,
} from "~/components/molecules/TimesheetCalendar";
import { TimesheetHoursOverview } from "~/components/molecules/TimesheetHoursOverview";
import { startOfMonth, endOfMonth, addMonths, subMonths, format } from "date-fns";
import { toast } from "sonner";
import {
	getAttendanceDisplayStatus,
	getAttendanceFilterBucket,
	getAttendancePrimaryMarker,
	matchesAttendanceFilter,
} from "~/lib/utils/attendance-status";
import type { AttendanceFilterValue } from "~/lib/utils/attendance-status";
import { getEmployeeActionBlock } from "~/lib/employee-action-block";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";

interface AttendanceTabProps {
	employeeIdOverride?: string;
	hideTodaySection?: boolean;
}

export default function AttendanceTab({
	employeeIdOverride,
	hideTodaySection = false,
}: AttendanceTabProps = {}) {
	const [searchParams, setSearchParams] = useSearchParams();
	const { user } = useAuth();
	const actionBlock = getEmployeeActionBlock(user?.metadata?.employee);

	// Use override if provided, otherwise use logged-in user's employee ID
	const employeeId = employeeIdOverride || user?.metadata?.employee?.id || "";

	// Get search and pagination params from URL
	const searchQuery = searchParams.get("search") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const { data: todayAttendanceData, isLoading, error } = useTodayAttendance(employeeId);

	const [viewMode, setViewMode] = useState<"list" | "calendar">("calendar");
	const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilterValue>("ALL");
	const [currentMonth, setCurrentMonth] = useState(new Date());

	// Compute query params based on view mode
	const queryParams = useMemo(() => {
		if (viewMode === "calendar") {
			const start = startOfMonth(currentMonth);
			const end = endOfMonth(currentMonth);
			return {
				dateFrom: start.toISOString(),
				dateTo: end.toISOString(),
				limit: 100, // Fetch enough records for the month
				pagination: false, // Attempt to disable pagination if supported, otherwise limit handles it
			};
		}
		return {
			page: pageParam,
			limit: limitParam,
			query: searchQuery,
			sort: "date",
			order: "desc",
			count: true,
		};
	}, [viewMode, currentMonth, pageParam, limitParam, searchQuery]);

	const {
		data: attendanceHistoryData,
		isLoading: isHistoryLoading,
		error: historyError,
	} = useEmployeeAttendance(employeeId, queryParams as any);
	const effectiveStartDateRaw =
		(attendanceHistoryData as any)?.employment?.effectiveStartDate ||
		(todayAttendanceData as any)?.effectiveStartDate ||
		(todayAttendanceData as any)?.employmentStartDate ||
		null;
	const effectiveStartMonth = effectiveStartDateRaw
		? startOfMonth(new Date(effectiveStartDateRaw))
		: null;
	const todayMonth = startOfMonth(new Date());
	const currentMonthStart = startOfMonth(currentMonth);
	const canGoPrevMonth = effectiveStartMonth ? currentMonthStart > effectiveStartMonth : true;
	const canGoNextMonth = currentMonthStart < todayMonth;

	const attendanceItems = (attendanceHistoryData as any)?.attendances || [];
	const pagination = (attendanceHistoryData as any)?.pagination;
	const filteredAttendanceItems = useMemo(
		() =>
			attendanceItems.filter((record: any) =>
				matchesAttendanceFilter(record, attendanceFilter),
			),
		[attendanceItems, attendanceFilter],
	);

	// Calendar View Data Transformation
	const calendarData = useMemo(() => {
		if (!attendanceItems.length) return [];

		// Helper to calculate duration in HH:MM format
		const getDurationHHMM = (startStr?: string, endStr?: string) => {
			if (!startStr || !endStr) return "0:00";
			const start = new Date(startStr);
			const end = new Date(endStr);
			const diffMs = end.getTime() - start.getTime();
			const totalMinutes = Math.floor(diffMs / 60000);
			const hours = Math.floor(totalMinutes / 60);
			const minutes = totalMinutes % 60;
			return `${hours}:${minutes.toString().padStart(2, "0")}`;
		};

		return filteredAttendanceItems.map((record: any) => {
			// Use existing fields if available in HH:MM, otherwise default or calculate
			const hoursWorked =
				record.hoursWorked || getDurationHHMM(record.timeIn, record.timeOut);
			const leaveEntries = Array.isArray(record.leaveEntries) ? record.leaveEntries : [];
			const holidayEntries = Array.isArray(record.holidayEntries)
				? record.holidayEntries
				: [];
			const primaryMarker = getAttendancePrimaryMarker(record);
			const leaveType =
				record.leaveType ||
				leaveEntries[0]?.leaveType ||
				(record.status === "LEAVE" ? "LEAVE" : undefined);

			return {
				date: record.date, // ISO string
				hoursWorked: hoursWorked,
				regularHours: record.regularHours || "0:00",
				overtimeHours: record.overtimeHours || "0:00",
				undertimeHours: record.undertimeHours || "0:00",
				lateHours: record.lateHours || "0:00",
				earlyOutHours: record.earlyOutHours || "0:00",
				breakMinutes: record.breakMinutes || 0,
				status: record.status,
				timeIn: record.timeIn,
				timeOut: record.timeOut,
				leaveType: leaveType,
				leaveEntries: leaveEntries,
				holidayEntries: holidayEntries,
				primaryMarker: primaryMarker,
				metadata: record.metadata,
				approvalStatus: "DRAFT",
				employeeNotes: null,
				approverNotes: null,
			} as TimesheetBreakdownDay;
		});
	}, [filteredAttendanceItems]);

	// Calendar View Hours Aggregation
	const calendarHours = useMemo(() => {
		const initial = {
			totalHoursWorked: 0,
			totalRegularHours: 0,
			totalOvertimeHours: 0,
			totalLateHours: 0,
			totalUndertimeHours: 0,
			totalEarlyOutHours: 0,
		};

		// Helper to time string to minutes
		const toMinutes = (timeStr?: string) => {
			if (!timeStr || timeStr === "0:00") return 0;
			const [h, m] = timeStr.split(":").map(Number);
			return h * 60 + (m || 0);
		};

		// Helper minutes to time string
		const toTimeStr = (minutes: number) => {
			const h = Math.floor(minutes / 60);
			const m = minutes % 60;
			return `${h}:${m.toString().padStart(2, "0")}`;
		};

		const totals = calendarData.reduce((acc: typeof initial, day: TimesheetBreakdownDay) => {
			acc.totalHoursWorked += toMinutes(day.hoursWorked);
			acc.totalRegularHours += toMinutes(day.regularHours);
			acc.totalOvertimeHours += toMinutes(day.overtimeHours);
			acc.totalLateHours += toMinutes(day.lateHours);
			acc.totalUndertimeHours += toMinutes(day.undertimeHours);
			acc.totalEarlyOutHours += toMinutes(day.earlyOutHours);
			return acc;
		}, initial);

		return {
			totalHoursWorked: toTimeStr(totals.totalHoursWorked),
			totalRegularHours: toTimeStr(totals.totalRegularHours),
			totalOvertimeHours: toTimeStr(totals.totalOvertimeHours),
			totalLateHours: toTimeStr(totals.totalLateHours),
			totalUndertimeHours: toTimeStr(totals.totalUndertimeHours),
			totalEarlyOutHours: toTimeStr(totals.totalEarlyOutHours),
		};
	}, [calendarData]);

	const handleMonthChange = (direction: "prev" | "next") => {
		setCurrentMonth((prev) => {
			const prevMonth = startOfMonth(prev);
			if (direction === "prev") {
				if (!canGoPrevMonth) return prevMonth;
				return subMonths(prevMonth, 1);
			}
			if (!canGoNextMonth) return prevMonth;
			return addMonths(prevMonth, 1);
		});
	};

	const clockInMutation = useClockIn();
	const clockOutMutation = useClockOut();

	// Pagination handlers
	const handlePageChange = (page: number) => {
		setSearchParams((prev) => {
			const newParams = new URLSearchParams(prev);
			newParams.set("page", page.toString());
			return newParams;
		});
	};

	const handleSearch = (query: string) => {
		setSearchParams((prev) => {
			const newParams = new URLSearchParams(prev);
			if (query) {
				newParams.set("search", query);
			} else {
				newParams.delete("search");
			}
			newParams.set("page", "1"); // Reset to first page on search
			return newParams;
		});
	};

	console.log("Raw todayAttendanceData:", JSON.stringify(todayAttendanceData, null, 2));
	console.log(JSON.stringify(attendanceHistoryData, null, 2));

	const [openDropdown, setOpenDropdown] = useState<string | null>(null);

	// Deep linking: Initialize modal state from URL on mount only
	const initialModalOpen = searchParams.get("action") === "view-timesheet";
	const [isTimesheetModalOpen, setIsTimesheetModalOpen] = useState(initialModalOpen);

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as HTMLElement;
			if (!target.closest("[data-dropdown]")) {
				setOpenDropdown(null);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	// Process real attendance data
	const getTodayAttendanceInfo = () => {
		console.log("getTodayAttendanceInfo - todayAttendanceData:", todayAttendanceData);

		if (!todayAttendanceData) {
			console.log("No attendance data found, returning default values");
			return {
				clockIn: null,
				clockOut: null,
				status: "Not Clocked In",
				hasTimeIn: false,
				hasTimeOut: false,
				isPreStart: false,
				effectiveStartDate: null as string | null,
			};
		}

		const hasTimeIn = !!todayAttendanceData.timeIn;
		const hasTimeOut = !!todayAttendanceData.timeOut;
		const isPreStart = Boolean((todayAttendanceData as any).isPreStart);

		console.log("hasTimeIn:", hasTimeIn, "timeIn value:", todayAttendanceData.timeIn);
		console.log("hasTimeOut:", hasTimeOut, "timeOut value:", todayAttendanceData.timeOut);

		// Format time strings
		const formatTime = (timeString: string) => {
			if (!timeString) return null;
			const date = new Date(timeString);
			return date.toLocaleTimeString("en-US", {
				hour: "2-digit",
				minute: "2-digit",
				hour12: true,
			});
		};

		// Determine status based on real data
		const getStatus = () => {
			const marker = getAttendancePrimaryMarker(todayAttendanceData as any);
			if (isPreStart) return "Pre-Start";
			if (marker === "HOLIDAY") return "Holiday";
			if (marker === "LEAVE") return "Leave";
			if (!hasTimeIn) return "Not Clocked In";
			if (todayAttendanceData.status === "LATE") return "Late";
			if (todayAttendanceData.status === "HALF_DAY") return "Half Day";
			return "Present";
		};

		const result = {
			clockIn: todayAttendanceData.timeIn ? formatTime(todayAttendanceData.timeIn) : null,
			clockOut: todayAttendanceData.timeOut ? formatTime(todayAttendanceData.timeOut) : null,
			status: getStatus(),
			hasTimeIn,
			hasTimeOut,
			isPreStart,
			effectiveStartDate:
				(todayAttendanceData as any).effectiveStartDate ||
				(todayAttendanceData as any).employmentStartDate ||
				null,
		};

		console.log("Final attendance result:", result);
		return result;
	};

	const todayAttendance = getTodayAttendanceInfo();

	// Clock in/out handlers
	const handleClockIn = async () => {
		if (actionBlock.blocked) return;
		if (!user?.metadata?.employee?.id) return;

		try {
			await clockInMutation.mutateAsync({
				employeeId: user.metadata?.employee?.id,
				// You can add location and notes here if needed
			});
		} catch (error) {
			console.error("Clock in failed:", error);
		}
	};

	const handleClockOut = async () => {
		if (actionBlock.blocked) return;
		if (!user?.metadata?.employee?.id) return;

		try {
			await clockOutMutation.mutateAsync({
				employeeId: user.metadata?.employee?.id,
				// You can add location and notes here if needed
			});
		} catch (error) {
			console.error("Clock out failed:", error);
		}
	};

	const handleClockAction = () => {
		if (actionBlock.blocked) return;
		if (todayAttendance.isPreStart) return;
		if (todayAttendance.hasTimeIn && !todayAttendance.hasTimeOut) {
			handleClockOut();
		} else {
			handleClockIn();
		}
	};

	// Process attendance history data
	const getAttendanceHistory = () => {
		if (!attendanceItems || attendanceItems.length === 0) {
			return [];
		}

		// Get attendances directly from the data
		const attendanceRecords = filteredAttendanceItems;

		return attendanceRecords.map((record: any) => {
			// Format time strings
			const formatTime = (timeString: string) => {
				if (!timeString) return "-";
				const date = new Date(timeString);
				return date.toLocaleTimeString("en-US", {
					hour: "2-digit",
					minute: "2-digit",
					hour12: true,
				});
			};

			// Format date
			const formatDate = (dateString: string) => {
				const date = new Date(dateString);
				return date.toLocaleDateString("en-US", {
					year: "numeric",
					month: "2-digit",
					day: "2-digit",
				});
			};

			// Calculate total hours
			const calculateTotalHours = (timeIn: string, timeOut: string) => {
				if (!timeIn || !timeOut) return "-";
				const start = new Date(timeIn);
				const end = new Date(timeOut);
				const diffMs = end.getTime() - start.getTime();
				const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
				const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
				return `${diffHours}h ${diffMinutes}m`;
			};

			// Map status
			return {
				id: record.id,
				date: formatDate(record.date),
				clockIn: formatTime(record.timeIn),
				clockOut: formatTime(record.timeOut),
				totalHours:
					record.hoursWorked || calculateTotalHours(record.timeIn, record.timeOut),
				regularHours: record.regularHours || "0:00",
				overtimeHours: record.overtimeHours || "0:00",
				undertimeHours: record.undertimeHours || "0:00",
				lateHours: record.lateHours || "0:00",
				earlyOutHours: record.earlyOutHours || "0:00",
				breakMinutes: record.breakMinutes || 0,
				status: getAttendanceDisplayStatus(record),
				statusBucket: getAttendanceFilterBucket(record),
				overtime: record.overtimeHours || "0h 00m",
			};
		});
	};

	const attendanceHistory = getAttendanceHistory();
	const listTotalItems =
		attendanceFilter === "ALL"
			? pagination?.total || attendanceHistory.length
			: attendanceHistory.length;

	const getStatusBadge = (status: string) => {
		switch (status) {
			case "Present":
				return (
					<Badge className="bg-green-500 text-white hover:bg-green-600">{status}</Badge>
				);
			case "Late":
				return (
					<Badge className="bg-yellow-500 text-white hover:bg-yellow-600">{status}</Badge>
				);
			case "Absent":
				return <Badge className="bg-red-500 text-white hover:bg-red-600">{status}</Badge>;
			case "Not Clocked In":
				return (
					<Badge className="bg-amber-500 text-white hover:bg-amber-600">{status}</Badge>
				);
			case "Pre-Start":
				return <Badge className="bg-blue-500 text-white hover:bg-blue-600">{status}</Badge>;
			case "Rest Day":
				return (
					<Badge className="bg-orange-500 text-white hover:bg-orange-600">{status}</Badge>
				);
			case "Half Day":
				return (
					<Badge className="bg-yellow-500 text-white hover:bg-yellow-600">{status}</Badge>
				);
			case "Leave":
				return (
					<Badge className="bg-violet-500 text-white hover:bg-violet-600">{status}</Badge>
				);
			case "Holiday":
				return <Badge className="bg-blue-500 text-white hover:bg-blue-600">{status}</Badge>;
			default:
				return <Badge className="bg-gray-500 text-white hover:bg-gray-600">{status}</Badge>;
		}
	};

	// Action Dropdown Component with Portal
	const ActionDropdown = ({ item, type }: { item: any; type: string }) => {
		const buttonRef = useRef<HTMLButtonElement>(null);
		const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
		const isOpen = openDropdown === `${type}-${item.id}`;

		useEffect(() => {
			if (isOpen && buttonRef.current) {
				const updatePosition = () => {
					if (buttonRef.current) {
						const rect = buttonRef.current.getBoundingClientRect();
						const dropdownWidth = 192; // w-48 = 192px

						setPosition({
							top: rect.bottom + 4,
							left: rect.right - dropdownWidth,
						});
					}
				};

				updatePosition();
				window.addEventListener("scroll", updatePosition, true);
				window.addEventListener("resize", updatePosition);

				return () => {
					window.removeEventListener("scroll", updatePosition, true);
					window.removeEventListener("resize", updatePosition);
				};
			} else {
				setPosition(null);
			}
		}, [isOpen]);

		const handleToggle = (e: React.MouseEvent) => {
			e.stopPropagation();
			setOpenDropdown(isOpen ? null : `${type}-${item.id}`);
		};

		const handleAction = (action: () => void) => {
			action();
			setOpenDropdown(null);
		};

		return (
			<>
				<Button
					ref={buttonRef}
					variant="ghost"
					size="sm"
					onClick={handleToggle}
					className="h-8 w-8 p-0"
					data-dropdown>
					<MoreVertical className="h-4 w-4" />
				</Button>
				{isOpen &&
					position &&
					createPortal(
						<div
							className="fixed w-48 bg-white border border-gray-200 rounded-md shadow-lg"
							data-dropdown
							style={{
								top: `${position.top}px`,
								left: `${position.left}px`,
								zIndex: 9999,
							}}>
							<div className="py-1">
								<button
									onClick={() => handleAction(() => console.log("View", item.id))}
									className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2">
									<Eye className="w-4 h-4" />
									View Details
								</button>
								{type !== "location" && (
									<>
										<button
											onClick={() =>
												handleAction(() => console.log("Edit", item.id))
											}
											className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2">
											<Edit className="w-4 h-4" />
											Edit
										</button>
										<button
											onClick={() =>
												handleAction(() => console.log("Archive", item.id))
											}
											className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2">
											<Archive className="w-4 h-4" />
											Archive
										</button>
										<button
											onClick={() =>
												handleAction(() => console.log("Delete", item.id))
											}
											className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2 text-red-600">
											<Trash2 className="w-4 h-4" />
											Delete
										</button>
									</>
								)}
							</div>
						</div>,
						document.body,
					)}
			</>
		);
	};

	// Define columns for Attendance
	const attendanceColumns: Column<any>[] = [
		{
			key: "date",
			label: "Date",
			sortable: true,
			searchable: true,
		},
		{
			key: "clockIn",
			label: "Time In",
			sortable: true,
		},
		{
			key: "clockOut",
			label: "Time Out",
			sortable: true,
		},
		{
			key: "totalHours",
			label: "Hours",
			sortable: true,
		},
		{
			key: "regularHours",
			label: "Regular",
			sortable: true,
			className: "hidden md:table-cell",
		},
		{
			key: "lateHours",
			label: "Late",
			sortable: true,
			className: "hidden lg:table-cell",
			render: (value: any) => {
				if (value && value !== "0:00" && value !== "0h 0m") {
					return <span className="text-red-600 font-medium">{value}</span>;
				}
				return <span className="text-gray-400">{value || "-"}</span>;
			},
		},
		{
			key: "earlyOutHours",
			label: "Early Out",
			sortable: true,
			className: "hidden lg:table-cell",
			render: (value: any) => {
				if (value && value !== "0:00" && value !== "0h 0m") {
					return <span className="text-red-600 font-medium">{value}</span>;
				}
				return <span className="text-gray-400">{value || "-"}</span>;
			},
		},
		{
			key: "overtimeHours",
			label: "Excess time",
			sortable: true,
			className: "hidden md:table-cell",
			render: (value: any) => {
				if (value && value !== "0:00" && value !== "0h 0m") {
					return <span className="text-gray-900 font-medium">{value}</span>;
				}
				return <span className="text-gray-400">{value || "-"}</span>;
			},
		},
		{
			key: "undertimeHours",
			label: "Undertime",
			sortable: true,
			className: "hidden md:table-cell",
			render: (value: any) => {
				if (value && value !== "0:00" && value !== "0h 0m") {
					return <span className="text-orange-500 font-medium">{value}</span>;
				}
				return <span className="text-gray-400">{value || "-"}</span>;
			},
		},
		{
			key: "status",
			label: "Status",
			sortable: true,
			render: (value: any) => getStatusBadge(value as string),
		},
	];

	// Filter options
	const statusFilters: FilterOption[] = [
		{
			key: "statusBucket",
			label: "Category",
			options: [
				{ value: "", label: "All" },
				{ value: "WORK_DAY", label: "Work Day" },
				{ value: "HOLIDAY", label: "Holiday" },
				{ value: "LEAVE", label: "Leave" },
			],
		},
	];

	const handleTimesheetSubmit = (timesheetData: any) => {
		console.log("Timesheet submitted:", timesheetData);
		toast.success("Timesheet submitted successfully!");
		setIsTimesheetModalOpen(false);
		// Remove action param from URL
		setSearchParams((prev) => {
			const newParams = new URLSearchParams(prev);
			newParams.delete("action");
			return newParams;
		});
		// TODO: Integrate with your actual timesheet submission API
	};

	const handleOpenTimesheetModal = () => {
		setIsTimesheetModalOpen(true);
		// Add deep link to URL
		setSearchParams((prev) => {
			const newParams = new URLSearchParams(prev);
			newParams.set("action", "view-timesheet");
			return newParams;
		});
	};

	const handleCloseTimesheetModal = () => {
		setIsTimesheetModalOpen(false);
		// Remove action param from URL
		setSearchParams((prev) => {
			const newParams = new URLSearchParams(prev);
			newParams.delete("action");
			return newParams;
		});
	};

	return (
		<div className="space-y-6">
			{/* Timesheet Modal */}
			<TimesheetModal
				isOpen={isTimesheetModalOpen}
				onClose={handleCloseTimesheetModal}
				employeeId={employeeId}
			/>
			{/* Clock In/Out Section - Only show if not hidden */}
			{!hideTodaySection && (
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					{isLoading ? (
						<>
							{/* Today's Attendance Skeleton */}
							<Card className="lg:col-span-2">
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<Clock className="w-5 h-5" />
										Today&apos;s Attendance
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="flex items-center justify-center h-48">
										<div className="text-gray-600 text-sm">
											Loading attendance data...
										</div>
									</div>
								</CardContent>
							</Card>

							{/* Quick Actions Skeleton */}
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<Timer className="w-5 h-5" />
										Quick Actions
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="flex items-center justify-center h-48">
										<div className="text-gray-600 text-sm">Loading...</div>
									</div>
								</CardContent>
							</Card>
						</>
					) : error ? (
						<>
							{/* Error State */}
							<Card className="lg:col-span-2">
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<Clock className="w-5 h-5" />
										Today&apos;s Attendance
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="flex items-center justify-center h-48">
										<div className="text-red-500 text-sm">
											Error loading attendance data
										</div>
									</div>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<Timer className="w-5 h-5" />
										Quick Actions
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="flex items-center justify-center h-48">
										<div className="text-red-500 text-sm">Error</div>
									</div>
								</CardContent>
							</Card>
						</>
					) : (
						<>
							<Card className="lg:col-span-2">
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<Clock className="w-5 h-5" />
										Today&apos;s Attendance
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-6">
									{todayAttendance.isPreStart && (
										<div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
											Attendance will be available on{" "}
											<span className="font-semibold">
												{todayAttendance.effectiveStartDate
													? new Date(
															todayAttendance.effectiveStartDate,
														).toLocaleDateString()
													: "your start date"}
											</span>
											.
										</div>
									)}
									{/* Current Status */}
									<div className="grid grid-cols-2 gap-4">
										<div className="bg-orange-50 p-4 rounded-lg">
											<div className="flex items-center gap-2 mb-2">
												<Play className="w-4 h-4 text-orange-600" />
												<span className="text-sm font-medium text-orange-800">
													Clock In
												</span>
											</div>
											<div className="text-2xl font-bold text-orange-900">
												{todayAttendance.clockIn || "Not clocked in"}
											</div>
										</div>
										<div className="bg-orange-50 p-4 rounded-lg">
											<div className="flex items-center gap-2 mb-2">
												<Pause className="w-4 h-4 text-orange-600" />
												<span className="text-sm font-medium text-orange-800">
													Clock Out
												</span>
											</div>
											<div className="text-2xl font-bold text-orange-900">
												{todayAttendance.clockOut || "Not clocked out"}
											</div>
										</div>
									</div>

									{/* Status */}
									<div className="p-4 border rounded-lg">
										<div className="flex items-center gap-2 mb-2">
											<CheckCircle className="w-4 h-4 text-green-600" />
											<span className="text-sm font-medium text-gray-700">
												Status
											</span>
										</div>
										{getStatusBadge(todayAttendance.status)}
									</div>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<Timer className="w-5 h-5" />
										Quick Actions
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-3">
									<Button
										className={`w-full flex items-center gap-2 ${
											actionBlock.blocked ||
											todayAttendance.isPreStart ||
											(todayAttendance.hasTimeIn &&
												todayAttendance.hasTimeOut)
												? "bg-gray-400 hover:bg-gray-400 cursor-not-allowed"
												: "bg-orange-600 hover:bg-orange-700"
										} text-white`}
										onClick={handleClockAction}
										disabled={
											actionBlock.blocked ||
											todayAttendance.isPreStart ||
											clockInMutation.isPending ||
											clockOutMutation.isPending ||
											(todayAttendance.hasTimeIn &&
												todayAttendance.hasTimeOut)
										}>
										{clockInMutation.isPending || clockOutMutation.isPending ? (
											<>
												<Timer className="w-4 h-4 animate-spin" />
												Processing...
											</>
										) : actionBlock.blocked ? (
											<>
												<Lock className="w-4 h-4" />
												Actions Blocked
											</>
										) : todayAttendance.isPreStart ? (
											<>
												<CalendarIcon className="w-4 h-4" />
												Not Yet Started
											</>
										) : todayAttendance.hasTimeIn &&
										  todayAttendance.hasTimeOut ? (
											<>
												<CheckCircle className="w-4 h-4" />
												Already Clocked Out
											</>
										) : todayAttendance.hasTimeIn &&
										  !todayAttendance.hasTimeOut ? (
											<>
												<Pause className="w-4 h-4" />
												Clock Out
											</>
										) : (
											<>
												<Play className="w-4 h-4" />
												Clock In
											</>
										)}
									</Button>
									{actionBlock.blocked && (
										<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
											{actionBlock.message}
										</div>
									)}
									<Button
										variant="outline"
										className="w-full flex items-center gap-2"
										onClick={handleOpenTimesheetModal}>
										<CheckCircle className="w-4 h-4" />
										Submit Timesheet
									</Button>
								</CardContent>
							</Card>
						</>
					)}
				</div>
			)}

			{/* Attendance Records */}
			<div className="flex flex-col space-y-4">
				<div className="flex flex-col sm:flex-row items-center justify-between gap-4">
					<div className="flex items-center gap-2">
						<h2 className="text-lg font-semibold text-gray-900">Attendance History</h2>
						{viewMode === "calendar" && (
							<div className="flex items-center gap-1 bg-gray-100 rounded-md p-1 ml-2">
								<Button
									variant="ghost"
									size="icon"
									className="h-6 w-6"
									disabled={!canGoPrevMonth}
									onClick={() => handleMonthChange("prev")}>
									<ChevronLeft className="h-4 w-4" />
								</Button>
								<span className="text-sm font-medium px-2 min-w-[100px] text-center">
									{format(currentMonth, "MMMM yyyy")}
								</span>
								<Button
									variant="ghost"
									size="icon"
									className="h-6 w-6"
									disabled={!canGoNextMonth}
									onClick={() => handleMonthChange("next")}>
									<ChevronRight className="h-4 w-4" />
								</Button>
							</div>
						)}
					</div>

					<div className="flex items-center gap-2">
						<div className="min-w-[150px]">
							<Select
								value={attendanceFilter}
								onValueChange={(value) =>
									setAttendanceFilter(value as AttendanceFilterValue)
								}>
								<SelectTrigger className="h-9 bg-white">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="ALL">All</SelectItem>
									<SelectItem value="WORK_DAY">Work Day</SelectItem>
									<SelectItem value="HOLIDAY">Holiday</SelectItem>
									<SelectItem value="LEAVE">Leave</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="flex items-center bg-gray-100 p-1 rounded-lg">
							<button
								onClick={() => setViewMode("calendar")}
								className={`p-1.5 rounded-md transition-all ${
									viewMode === "calendar"
										? "bg-white shadow text-primary"
										: "text-gray-500 hover:text-gray-700"
								}`}
								title="Calendar View">
								<CalendarIcon className="w-4 h-4" />
							</button>
							<button
								onClick={() => setViewMode("list")}
								className={`p-1.5 rounded-md transition-all ${
									viewMode === "list"
										? "bg-white shadow text-primary"
										: "text-gray-500 hover:text-gray-700"
								}`}
								title="List View">
								<LayoutList className="w-4 h-4" />
							</button>
						</div>
					</div>
				</div>

				{viewMode === "list" ? (
					<DataTable
						title="Attendance"
						data={attendanceHistory}
						columns={attendanceColumns}
						filters={statusFilters}
						searchFields={["date"]}
						onExport={() => console.log("Export attendance")}
						{...(!employeeIdOverride && {
							renderActions: (item: any) => (
								<ActionDropdown item={item} type="attendance" />
							),
						})}
						isLoading={isHistoryLoading}
						emptyMessage="No attendance records found"
						emptyDescription="Your attendance history will appear here."
						itemsPerPage={limitParam}
						currentPage={pageParam}
						totalItems={listTotalItems}
						onSearch={handleSearch}
						onPageChange={handlePageChange}
						searchValue={searchQuery || ""}
					/>
				) : (
					<div className="space-y-4">
						{/* Summary Cards */}
						<TimesheetHoursOverview hours={calendarHours} />

						{/* Calendar */}
						<TimesheetCalendar
							breakdown={calendarData}
							className="bg-white"
							onDayClick={(day) => {
								console.log("Day clicked:", day);
								// Could open a detail modal here if needed
							}}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
