import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Filter, ArrowLeft } from "lucide-react";
import { useSearchParams, useNavigate } from "react-router";

// Mock leave data - single user
const mockLeaveData = [
	{
		id: "1",
		leaveType: "Vacation Leave",
		startDate: "2026-01-28",
		endDate: "2026-01-30",
		status: "approved",
	},
	{
		id: "2",
		leaveType: "Sick Leave",
		startDate: "2026-02-05",
		endDate: "2026-02-05",
		status: "approved",
	},
];

const LEAVE_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
	"Vacation Leave": {
		bg: "bg-blue-50",
		border: "border-l-blue-500",
		text: "text-blue-700",
		dot: "bg-blue-500",
	},
	"Sick Leave": {
		bg: "bg-red-50",
		border: "border-l-red-500",
		text: "text-red-700",
		dot: "bg-red-500",
	},
	"Remote Work": {
		bg: "bg-green-50",
		border: "border-l-green-500",
		text: "text-green-700",
		dot: "bg-green-500",
	},
	"Personal Leave": {
		bg: "bg-purple-50",
		border: "border-l-purple-500",
		text: "text-purple-700",
		dot: "bg-purple-500",
	},
};

const DAYS_SHORT = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];
const MONTHS_SHORT = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

function getWeekStart(date: Date): Date {
	const d = new Date(date);
	const day = d.getDay();
	const diff = d.getDate() - day + (day === 0 ? -6 : 1);
	d.setDate(diff);
	d.setHours(0, 0, 0, 0);
	return d;
}

function addDays(date: Date, days: number): Date {
	const result = new Date(date);
	result.setDate(result.getDate() + days);
	return result;
}

function formatDateKey(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isSameDay(date1: Date, date2: Date): boolean {
	return (
		date1.getFullYear() === date2.getFullYear() &&
		date1.getMonth() === date2.getMonth() &&
		date1.getDate() === date2.getDate()
	);
}

export function LeaveCalendarPage() {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const [weeksToShow, setWeeksToShow] = useState<1 | 2 | 3>(2);
	const [startDate, setStartDate] = useState(() => getWeekStart(new Date()));
	const [visibleTypes, setVisibleTypes] = useState<Set<string>>(
		new Set(["Vacation Leave", "Sick Leave", "Remote Work", "Personal Leave"]),
	);

	const today = useMemo(() => new Date(), []);

	// Get query parameters for preview
	const previewLeaveType = searchParams.get("leaveType");
	const previewStartDate = searchParams.get("startDate");
	const previewEndDate = searchParams.get("endDate");
	const fromParam = searchParams.get("from");
	const hasPreview = previewLeaveType && previewStartDate && previewEndDate;

	// Handle back navigation
	const handleBack = () => {
		if (fromParam) {
			// Convert encoded path back (replace - with /)
			const decodedPath = fromParam.replace(/-/g, "/");
			navigate(`/${decodedPath}`);
		} else {
			// Default to approvals requests page, otherwise go back in history
			navigate("/employee/approvals/requests");
		}
	};

	const days = useMemo(() => {
		const result: Date[] = [];
		const totalDays = weeksToShow * 7;
		for (let i = 0; i < totalDays; i++) {
			result.push(addDays(startDate, i));
		}
		return result;
	}, [startDate, weeksToShow]);

	const dateRange = useMemo(() => {
		const start = days[0];
		const end = days[days.length - 1];
		const startMonth = MONTHS[start.getMonth()];
		const endMonth = MONTHS[end.getMonth()];
		const startYear = start.getFullYear();
		const endYear = end.getFullYear();

		if (startYear !== endYear) {
			return `${startMonth} ${startYear} - ${endMonth} ${endYear}`;
		} else if (start.getMonth() !== end.getMonth()) {
			return `${startMonth} - ${endMonth} ${startYear}`;
		} else {
			return `${startMonth} ${startYear}`;
		}
	}, [days]);

	const dateSubtitle = useMemo(() => {
		const start = days[0];
		const end = days[days.length - 1];
		return `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]} - ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}`;
	}, [days]);

	const leavesByDate = useMemo(() => {
		const map = new Map<string, typeof mockLeaveData>();
		mockLeaveData.forEach((leave) => {
			const start = new Date(leave.startDate);
			const end = new Date(leave.endDate);
			let current = new Date(start);
			while (current <= end) {
				const key = formatDateKey(current);
				const existing = map.get(key) || [];
				if (!existing.find((l) => l.id === leave.id)) {
					existing.push(leave);
				}
				map.set(key, existing);
				current = addDays(current, 1);
			}
		});
		return map;
	}, []);

	const handlePrevWeek = () => {
		setStartDate(addDays(startDate, -7));
	};

	const handleNextWeek = () => {
		setStartDate(addDays(startDate, 7));
	};

	const toggleLeaveType = (type: string) => {
		setVisibleTypes((prev) => {
			const next = new Set(prev);
			if (next.has(type)) {
				next.delete(type);
			} else {
				next.add(type);
			}
			return next;
		});
	};

	const getLeavesForDate = (date: Date) => {
		const key = formatDateKey(date);
		const leaves = leavesByDate.get(key) || [];
		return leaves.filter((l) => visibleTypes.has(l.leaveType));
	};

	const isToday = (date: Date): boolean => isSameDay(date, today);

	const isWeekend = (date: Date): boolean => {
		const day = date.getDay();
		return day === 0 || day === 6;
	};

	const isFirstOfMonth = (date: Date): boolean => date.getDate() === 1;

	return (
		<div className="min-h-screen bg-gray-50">
			{/* Back Button */}
			<div className="px-6 pt-6 pb-2">
				<button
					onClick={handleBack}
					className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-[#e60000] transition-colors">
					<ArrowLeft className="w-4 h-4" />
					Back
				</button>
			</div>

			{/* Header */}
			<div className="px-6 py-6">
				<div className="flex items-center justify-between gap-6 mb-6">
					{/* Left: Title */}
					<div>
						<h1 className="text-2xl font-semibold text-gray-900">{dateRange}</h1>
						<p className="text-sm text-gray-500 mt-1">{dateSubtitle}</p>
					</div>

					{/* Right: Navigation */}
					<div className="flex items-center gap-2">
						<button
							type="button"
							aria-label="Previous week"
							onClick={handlePrevWeek}
							className="p-2 text-gray-600 border border-gray-300 bg-white hover:bg-gray-50 hover:text-[#e60000] hover:border-[#e60000] transition-all">
							<ChevronLeft className="h-5 w-5" />
						</button>
						<button
							type="button"
							aria-label="Next week"
							onClick={handleNextWeek}
							className="p-2 text-gray-600 border border-gray-300 bg-white hover:bg-gray-50 hover:text-[#e60000] hover:border-[#e60000] transition-all">
							<ChevronRight className="h-5 w-5" />
						</button>
					</div>
				</div>

				{/* Controls Row */}
				<div className="flex items-center justify-between gap-4">
					{/* Legend chips */}
					<div className="flex flex-wrap items-center gap-2">
						{Object.entries(LEAVE_COLORS).map(([type, colors]) => {
							const isActive = visibleTypes.has(type);
							return (
								<button
									key={type}
									type="button"
									onClick={() => toggleLeaveType(type)}
									className={`inline-flex items-center gap-2 border px-3 py-1.5 text-xs font-medium transition-all ${
										isActive
											? "border-gray-300 bg-white text-gray-900 hover:border-[#e60000]"
											: "border-gray-200 bg-gray-50 text-gray-400 opacity-50 hover:opacity-100"
									}`}>
									<span className={`h-2 w-2 ${colors.dot}`} />
									<span>{type}</span>
								</button>
							);
						})}
					</div>

					{/* View tabs */}
					<div className="flex items-center gap-1 border border-gray-300 bg-white">
						{([1, 2, 3] as const).map((weeks) => (
							<button
								key={weeks}
								type="button"
								onClick={() => setWeeksToShow(weeks)}
								className={`px-4 py-2 text-xs font-medium transition-all ${
									weeksToShow === weeks
										? "bg-[#e60000] text-white"
										: "bg-white text-gray-600 hover:bg-gray-50 hover:text-[#e60000]"
								}`}>
								{weeks} Week{weeks > 1 ? "s" : ""}
							</button>
						))}
					</div>
				</div>
			</div>

			{/* Calendar Grid */}
			<div className="px-6 pb-6">
				<table className="w-full bg-white border border-gray-200 border-collapse table-fixed">
					{/* Days Header */}
					<thead>
						<tr>
							{days.map((date, index) => {
								const dayIndex = date.getDay();
								const dayName = DAYS_SHORT[dayIndex === 0 ? 6 : dayIndex - 1];
								const isWeekendDay = isWeekend(date);
								const isTodayDate = isToday(date);
								const isFirstDay = isFirstOfMonth(date);

								return (
									<th
										key={index}
										className={`px-3 py-4 text-center border-r border-b border-gray-200 last:border-r-0 font-normal ${
											isWeekendDay ? "bg-gray-50" : ""
										}`}>
										<p
											className={`text-[10px] font-semibold uppercase tracking-wide mb-2 ${
												isTodayDate
													? "text-[#e60000]"
													: isWeekendDay
														? "text-gray-400"
														: "text-gray-500"
											}`}>
											{dayName}
										</p>
										<div className="flex flex-col items-center justify-center">
											<span
												className={`text-xl font-semibold ${
													isTodayDate ? "text-[#e60000]" : "text-gray-900"
												}`}>
												{date.getDate()}
											</span>
											{/* Reserve consistent height for label (Today/Month) */}
											<span className="h-3 flex items-center">
												{isTodayDate && (
													<span className="text-[8px] font-bold text-[#e60000] uppercase">
														Today
													</span>
												)}
												{isFirstDay && !isTodayDate && (
													<span className="text-[8px] font-bold text-[#e60000] uppercase">
														{MONTHS_SHORT[date.getMonth()]}
													</span>
												)}
											</span>
										</div>
									</th>
								);
							})}
						</tr>
					</thead>

					{/* Leaves Grid */}
					<tbody>
						<tr>
							{days.map((date, index) => {
								const leaves = getLeavesForDate(date);
								const isWeekendDay = isWeekend(date);
								const isTodayDate = isToday(date);

								return (
									<td
										key={index}
										className={`border-r border-gray-200 last:border-r-0 px-3 py-2 align-top h-[520px] ${
											isWeekendDay ? "bg-gray-50/50" : ""
										} ${isTodayDate ? "bg-red-50/30" : ""}`}>
										{/* Leave blocks */}
										<div className="space-y-2">
											{leaves.map((leave) => {
												const colors =
													LEAVE_COLORS[leave.leaveType] ||
													LEAVE_COLORS["Vacation Leave"];
												return (
													<div
														key={leave.id}
														className={`${colors.bg} ${colors.border} border-l-3 px-2 py-2 cursor-pointer hover:brightness-95 transition-all`}>
														<p
															className={`text-xs font-medium ${colors.text} truncate`}>
															{leave.leaveType}
														</p>
														<span className="text-[10px] text-gray-500 capitalize">
															{leave.status}
														</span>
													</div>
												);
											})}

											{/* Preview leave if in preview mode */}
											{hasPreview &&
												(() => {
													// Compare as date strings (YYYY-MM-DD) to avoid timezone issues
													const dateKey = formatDateKey(date);
													const isInPreviewRange =
														dateKey >= previewStartDate! &&
														dateKey <= previewEndDate!;
													return isInPreviewRange ? (
														<div className="bg-red-50 border-l-3 border-l-[#e60000] px-2 py-2 border border-dashed border-red-300">
															<p className="text-xs font-medium text-[#e60000] truncate">
																{previewLeaveType}
															</p>
															<span className="text-[10px] text-red-600">
																Preview
															</span>
														</div>
													) : null;
												})()}
										</div>
									</td>
								);
							})}
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	);
}
