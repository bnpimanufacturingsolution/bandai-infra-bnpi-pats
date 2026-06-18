import { useState, useMemo, useEffect, useCallback, useContext } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { useSearchParams, useNavigate } from "react-router";
import {
	getWeekStart,
	getMonthStart,
	getMonthGridDays,
	addDays,
	addMonths,
	formatDateKey,
	isSameDay,
	formatDateRange,
	formatMonthRange,
	isWeekend,
	isFirstOfMonth,
	DAYS_SHORT,
	MONTHS_SHORT,
} from "~/lib/utils/calendar-utils";
import { buildReturnToFormUrl } from "~/lib/utils/deep-linking";
import AuthContext from "~/contexts/auth-context";
import { useCalendarItems } from "~/lib/hooks/use-calendar-items";
import type { CalendarItem } from "~/zod/calendar-item.zod";

// Helper function to map CalendarItem type to EventType
const mapCalendarItemTypeToEventType = (itemType: string, metadata?: any): EventType => {
	switch (itemType) {
		case "MEETING":
			return "off";
		case "COMPANY_EVENT":
			return "off";
		case "HOLIDAY":
			// Check metadata for holiday type
			if (metadata?.holidayType === "regular") {
				return "holiday-regular";
			} else if (metadata?.holidayType === "special-non-working") {
				return "holiday-special-non-working";
			} else if (metadata?.holidayType === "special-working") {
				return "holiday-special-working";
			}
			return "off";
		case "BIRTHDAY":
			return "birthday";
		case "EVENT":
		case "DEADLINE":
		case "REMINDER":
		default:
			return "off";
	}
};

// Helper function to format time from Date
const formatTime = (date: Date): string => {
	return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

// Mock leave data
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

type EventType =
	| "meeting"
	| "company"
	| "leave"
	| "birthday"
	| "off"
	| "holiday-regular"
	| "holiday-special-non-working"
	| "holiday-special-working";

const ALL_EVENT_TYPES: EventType[] = [
	"leave",
	"birthday",
	"holiday-regular",
	"holiday-special-non-working",
	"holiday-special-working",
	"off",
];

const EVENT_LABELS: Record<EventType, string> = {
	meeting: "Meetings",
	company: "Company",
	leave: "Leave",
	birthday: "Birthday",
	"holiday-regular": "Regular Holiday",
	"holiday-special-non-working": "Special (Non-Working)",
	"holiday-special-working": "Special (Working)",
	off: "Off",
};

interface CalendarEvent {
	id: number;
	title: string;
	time: string;
	duration: string;
	type: EventType;
	date: string;
	holidayType?: "regular" | "special-non-working" | "special-working";
	metadata?: any;
}

interface LeaveData {
	id: string;
	leaveType: string;
	startDate: string;
	endDate: string;
	status: string;
}

const EVENT_COLORS: Record<EventType, { bg: string; border: string; text: string; dot: string }> = {
	meeting: {
		bg: "bg-blue-50",
		border: "border-l-blue-500",
		text: "text-slate-700",
		dot: "bg-blue-500",
	},
	company: {
		bg: "bg-teal-50",
		border: "border-l-teal-500",
		text: "text-teal-700",
		dot: "bg-teal-500",
	},
	leave: { bg: "bg-red-50", border: "border-l-red-400", text: "text-red-600", dot: "bg-red-400" },
	birthday: {
		bg: "bg-fuchsia-50",
		border: "border-l-fuchsia-500",
		text: "text-fuchsia-700",
		dot: "bg-fuchsia-500",
	},
	off: {
		bg: "bg-gray-50",
		border: "border-l-gray-400",
		text: "text-gray-500",
		dot: "bg-gray-400",
	},
	"holiday-regular": {
		bg: "bg-red-50",
		border: "border-l-red-600",
		text: "text-red-700",
		dot: "bg-red-600",
	},
	"holiday-special-non-working": {
		bg: "bg-orange-50",
		border: "border-l-orange-500",
		text: "text-orange-700",
		dot: "bg-orange-500",
	},
	"holiday-special-working": {
		bg: "bg-yellow-50",
		border: "border-l-yellow-500",
		text: "text-yellow-700",
		dot: "bg-yellow-500",
	},
};

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

const EVENT_DAY_TINTS: Record<EventType, string> = {
	meeting: "bg-blue-50/25",
	company: "bg-teal-50/25",
	leave: "bg-red-50/25",
	birthday: "bg-fuchsia-50/30",
	off: "bg-gray-50/30",
	"holiday-regular": "bg-red-50/40",
	"holiday-special-non-working": "bg-orange-50/35",
	"holiday-special-working": "bg-yellow-50/35",
};

const LEAVE_DAY_TINTS: Record<string, string> = {
	"Vacation Leave": "bg-blue-50/25",
	"Sick Leave": "bg-red-50/25",
	"Remote Work": "bg-green-50/25",
	"Personal Leave": "bg-purple-50/25",
};

export default function CalendarPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();
	const authContext = useContext(AuthContext);
	const user = authContext?.user;

	// Get employee ID and organization ID
	const employeeId = user?.metadata?.employee?.id;
	const organizationId = user?.organizationId;

	// Get query parameters
	const type = searchParams.get("type");
	const previewLeaveType = searchParams.get("leaveType");
	const previewStartDate = searchParams.get("startDate");
	const previewEndDate = searchParams.get("endDate");
	const statusParam = searchParams.get("status");
	const fromParam = searchParams.get("from");
	const dateParam = searchParams.get("date");
	const weeksParam = searchParams.get("weeks");
	const viewParam = searchParams.get("view");
	const eventsParam = searchParams.get("events");
	const leavesParam = searchParams.get("leaves");
	const eventIdParam = searchParams.get("eventId");

	// Determine if we're in leave mode
	const isLeaveMode = type === "leave";

	// Preview mode for leave
	const hasPreview = isLeaveMode && previewLeaveType && previewStartDate && previewEndDate;

	// Helper to update search params
	const updateSearchParams = useCallback(
		(fn: (params: URLSearchParams) => void) => {
			setSearchParams((prev) => {
				const next = new URLSearchParams(prev);
				fn(next);
				return next;
			});
		},
		[setSearchParams],
	);

	// Get year from URL or use undefined (optional)
	const yearParam = searchParams.get("year");
	const year = yearParam ? parseInt(yearParam, 10) : undefined;

	// Fetch calendar items filtered by employee ID
	const { data: calendarItemsData, isLoading: isLoadingCalendarItems } = useCalendarItems(
		organizationId || "",
		year, // Optional year parameter
		employeeId
			? {
					limit: 1000,
				}
			: undefined,
	);
	// filter: { assignedEmployeeId: employeeId },

	const data = (calendarItemsData as any)?.data?.items || [];

	// Initialize state from URL params or defaults
	const [viewMode, setViewMode] = useState<"week" | "month">(() =>
		viewParam === "month" ? "month" : "week",
	);

	const [weeksToShow, setWeeksToShow] = useState<1 | 2 | 3>(() => {
		if (weeksParam) {
			const weeks = parseInt(weeksParam, 10);
			if (weeks === 1 || weeks === 2 || weeks === 3) return weeks;
		}
		return isLeaveMode ? 2 : 3;
	});

	const [startDate, setStartDate] = useState(() => {
		if (dateParam) {
			const parsedDate = new Date(dateParam);
			if (!isNaN(parsedDate.getTime())) {
				return viewParam === "month" ? getMonthStart(parsedDate) : getWeekStart(parsedDate);
			}
		}
		return viewParam === "month" ? getMonthStart(new Date()) : getWeekStart(new Date());
	});

	const [currentTime, setCurrentTime] = useState(new Date());

	const sanitizeEventTypes = useCallback((rawTypes: string[]): EventType[] => {
		return rawTypes.filter((type): type is EventType =>
			ALL_EVENT_TYPES.includes(type as EventType),
		);
	}, []);

	// General calendar state - initialize from URL
	const [visibleEventTypes, setVisibleEventTypes] = useState<Set<EventType>>(() => {
		if (eventsParam) {
			const eventTypes = sanitizeEventTypes(eventsParam.split(",").filter(Boolean));
			if (eventTypes.length > 0) {
				return new Set(eventTypes);
			}
		}
		return new Set(ALL_EVENT_TYPES);
	});

	// Leave calendar state - initialize from URL
	const [visibleLeaveTypes, setVisibleLeaveTypes] = useState<Set<string>>(() => {
		if (leavesParam) {
			return new Set(leavesParam.split(",").filter(Boolean));
		}
		return new Set(["Vacation Leave", "Sick Leave", "Remote Work", "Personal Leave"]);
	});

	// Track highlighted event ID from URL
	const [highlightedEventId, setHighlightedEventId] = useState<string | null>(
		eventIdParam || null,
	);

	const today = useMemo(() => new Date(), []);

	// Update current time every minute (only for general calendar)
	useEffect(() => {
		if (!isLeaveMode) {
			const interval = setInterval(() => {
				setCurrentTime(new Date());
			}, 60000);
			return () => clearInterval(interval);
		}
	}, [isLeaveMode]);

	// Navigate to today (defined before use in useEffect)
	const navigateToToday = useCallback(() => {
		setStartDate(viewMode === "month" ? getMonthStart(new Date()) : getWeekStart(new Date()));
	}, [viewMode]);

	// Keyboard navigation
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "t" || e.key === "T") {
				navigateToToday();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [navigateToToday]);

	// Keep local view mode synchronized when URL changes via browser navigation
	useEffect(() => {
		setViewMode(viewParam === "month" ? "month" : "week");
	}, [viewParam]);

	// Auto-clear highlighted event after 3 seconds if set from URL
	useEffect(() => {
		if (eventIdParam && highlightedEventId) {
			const timer = setTimeout(() => {
				setHighlightedEventId(null);
			}, 3000);
			return () => clearTimeout(timer);
		}
	}, [eventIdParam, highlightedEventId]);

	// Handle back navigation
	const handleBack = () => {
		if (fromParam) {
			const modalAction = searchParams.get("modalAction");

			// If modalAction is provided, navigate back with that action to open the modal
			if (modalAction) {
				// Use utility to build URL with deep link parameters
				const returnUrl = buildReturnToFormUrl(
					fromParam,
					previewLeaveType || undefined,
					previewStartDate || undefined,
					previewEndDate || undefined,
				);
				navigate(returnUrl);
			} else {
				navigate(`/${fromParam.replace(/-/g, "/")}`);
			}
		} else {
			// Default to approvals requests page, otherwise go back in history
			navigate("/employee/approvals/requests");
		}
	};

	const days = useMemo(() => {
		if (viewMode === "month") {
			return getMonthGridDays(startDate);
		}
		const result: Date[] = [];
		const totalDays = weeksToShow * 7;
		for (let i = 0; i < totalDays; i++) {
			result.push(addDays(startDate, i));
		}
		return result;
	}, [startDate, viewMode, weeksToShow]);

	const monthAnchor = useMemo(() => getMonthStart(startDate), [startDate]);
	const isCurrentMonthCell = useCallback(
		(date: Date) =>
			date.getMonth() === monthAnchor.getMonth() &&
			date.getFullYear() === monthAnchor.getFullYear(),
		[monthAnchor],
	);

	const { range: dateRange, subtitle: dateSubtitle } = useMemo(() => {
		if (viewMode === "month") {
			return formatMonthRange(startDate);
		}
		return formatDateRange(days);
	}, [days, startDate, viewMode]);

	// Group calendar items by date - span events across their full date range
	const eventsByDate = useMemo(() => {
		const map = new Map<string, CalendarItem[]>();

		if (!data || data.length === 0) {
			return map;
		}

		data.forEach((item: CalendarItem) => {
			// Skip if item is not active
			if (item.status !== "ACTIVE") {
				return;
			}

			// Parse startDate and endDate - handle both string and Date objects
			const startDate =
				typeof item.startDate === "string" ? new Date(item.startDate) : item.startDate;
			const endDate =
				typeof item.endDate === "string" ? new Date(item.endDate) : item.endDate;

			// For multi-day events, add to all days in the range
			let current = new Date(startDate);
			const end = new Date(endDate);

			while (current <= end) {
				const dateKey = formatDateKey(current);
				const existing = map.get(dateKey) || [];

				// Only add if not already in the list (prevent duplicates)
				if (!existing.find((e) => e.id === item.id)) {
					existing.push(item);
				}

				map.set(dateKey, existing);
				current = addDays(current, 1);
			}
		});

		return map;
	}, [data]);

	// Leave data by date
	const leavesByDate = useMemo(() => {
		const map = new Map<string, LeaveData[]>();
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

	// Sync state changes to URL params
	useEffect(() => {
		updateSearchParams((next) => {
			// Update date param (format as YYYY-MM-DD)
			const dateStr = startDate.toISOString().split("T")[0];
			next.set("date", dateStr);

			// Update view param
			if (viewMode === "month") {
				next.set("view", "month");
			} else {
				next.delete("view");
			}

			// Update weeks param
			next.set("weeks", weeksToShow.toString());

			// Update events param (comma-separated)
			if (visibleEventTypes.size > 0) {
				const sanitized = sanitizeEventTypes(Array.from(visibleEventTypes));
				next.set("events", sanitized.join(","));
			} else {
				next.delete("events");
			}

			// Update leaves param (comma-separated)
			if (visibleLeaveTypes.size > 0) {
				next.set("leaves", Array.from(visibleLeaveTypes).join(","));
			} else {
				next.delete("leaves");
			}

			// Update eventId param if set
			if (highlightedEventId) {
				next.set("eventId", highlightedEventId);
			} else {
				next.delete("eventId");
			}
		});
	}, [
		startDate,
		viewMode,
		weeksToShow,
		visibleEventTypes,
		visibleLeaveTypes,
		highlightedEventId,
		sanitizeEventTypes,
		updateSearchParams,
	]);

	const handlePrevWeek = () => {
		if (viewMode === "month") {
			setStartDate(getMonthStart(addMonths(startDate, -1)));
			return;
		}
		setStartDate(addDays(startDate, -7));
	};

	const handleNextWeek = () => {
		if (viewMode === "month") {
			setStartDate(getMonthStart(addMonths(startDate, 1)));
			return;
		}
		setStartDate(addDays(startDate, 7));
	};

	const handleWeeksChange = (weeks: 1 | 2 | 3) => {
		setWeeksToShow(weeks);
	};

	const toggleEventType = useCallback((eventType: EventType) => {
		setVisibleEventTypes((prev) => {
			const next = new Set(prev);
			if (next.has(eventType)) {
				next.delete(eventType);
			} else {
				next.add(eventType);
			}
			return next;
		});
	}, []);

	const toggleLeaveType = useCallback((leaveType: string) => {
		setVisibleLeaveTypes((prev) => {
			const next = new Set(prev);
			if (next.has(leaveType)) {
				next.delete(leaveType);
			} else {
				next.add(leaveType);
			}
			return next;
		});
	}, []);

	const getEventsForDate = (date: Date): CalendarItem[] => {
		const key = formatDateKey(date);
		const items = eventsByDate.get(key) || [];
		return items.filter((item) => {
			const eventType = mapCalendarItemTypeToEventType(item.type, item.metadata);
			return visibleEventTypes.has(eventType);
		});
	};

	// Calculate event counts per day for dynamic column widths
	const eventCountsByDate = useMemo(() => {
		const counts = new Map<string, number>();
		days.forEach((date) => {
			const key = formatDateKey(date);
			const items = eventsByDate.get(key) || [];
			const filteredItems = items.filter((item) => {
				const eventType = mapCalendarItemTypeToEventType(item.type, item.metadata);
				return visibleEventTypes.has(eventType);
			});
			counts.set(key, filteredItems.length);
		});
		return counts;
	}, [days, eventsByDate, visibleEventTypes]);

	const getLeavesForDate = (date: Date): LeaveData[] => {
		const key = formatDateKey(date);
		const leaves = leavesByDate.get(key) || [];
		return leaves.filter((l) => visibleLeaveTypes.has(l.leaveType));
	};

	const getEventDayTintClass = useCallback((events: CalendarItem[]): string => {
		if (!events.length) return "";

		const priority: EventType[] = [
			"holiday-regular",
			"holiday-special-non-working",
			"holiday-special-working",
			"leave",
			"company",
			"meeting",
			"off",
		];

		const eventTypes = new Set(
			events.map((item) => mapCalendarItemTypeToEventType(item.type, item.metadata)),
		);

		for (const type of priority) {
			if (eventTypes.has(type)) {
				return EVENT_DAY_TINTS[type];
			}
		}

		return "";
	}, []);

	const getLeaveDayTintClass = useCallback((leaves: LeaveData[]): string => {
		if (!leaves.length) return "";
		const primaryType = leaves[0]?.leaveType;
		return LEAVE_DAY_TINTS[primaryType] || "bg-gray-50/20";
	}, []);

	const isToday = (date: Date): boolean => isSameDay(date, today);

	const getCurrentTimePosition = (): number => {
		const hours = currentTime.getHours();
		const minutes = currentTime.getMinutes();
		// Assuming calendar shows 8am-6pm (10 hours)
		const startHour = 8;
		const endHour = 18;
		const totalMinutes = (endHour - startHour) * 60;
		const currentMinutes = (hours - startHour) * 60 + minutes;
		return Math.max(0, Math.min(100, (currentMinutes / totalMinutes) * 100));
	};

	return (
		<div className="h-[calc(100vh-5rem)] flex flex-col bg-gray-50">
			{/* Back Button - Only show in leave mode with from param */}
			{isLeaveMode && fromParam && (
				<div className="px-6 pt-6 pb-2 flex-shrink-0">
					<button
						onClick={handleBack}
						className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-[#e60000] transition-colors">
						<ArrowLeft className="w-4 h-4" />
						Back
					</button>
				</div>
			)}

			{/* Header */}
			<div className="px-6 py-6 flex-shrink-0">
				<div className="flex items-center justify-between gap-6 mb-6">
					{/* Left: Navigation + Title */}
					<div className="flex items-center gap-5">
						{/* Navigation Arrows */}
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
							<button
								type="button"
								aria-label="Go to today"
								onClick={navigateToToday}
								className="px-3 py-2 text-xs font-medium text-gray-600 border border-gray-300 bg-white hover:bg-gray-50 hover:text-[#e60000] hover:border-[#e60000] transition-all">
								Today
							</button>
						</div>

						{/* Title */}
						<div>
							<h1 className="text-2xl font-semibold text-gray-900">{dateRange}</h1>
							<p className="mt-1 text-sm text-gray-500">{dateSubtitle}</p>
						</div>
					</div>

					{/* Right: View + Week Toggle */}
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-1 border border-gray-300 bg-white">
							<button
								type="button"
								onClick={() => {
									setViewMode("week");
									setStartDate(getWeekStart(startDate));
								}}
								className={`px-4 py-2 text-xs font-medium transition-all ${
									viewMode === "week"
										? "bg-[#e60000] text-white"
										: "bg-white text-gray-600 hover:bg-gray-50 hover:text-[#e60000]"
								}`}>
								Week
							</button>
							<button
								type="button"
								onClick={() => {
									setViewMode("month");
									setStartDate(getMonthStart(startDate));
								}}
								className={`px-4 py-2 text-xs font-medium transition-all ${
									viewMode === "month"
										? "bg-[#e60000] text-white"
										: "bg-white text-gray-600 hover:bg-gray-50 hover:text-[#e60000]"
								}`}>
								Month
							</button>
						</div>

						{viewMode === "week" && (
							<div className="flex items-center gap-1 border border-gray-300 bg-white">
								{([1, 2, 3] as const).map((weeks) => (
									<button
										key={weeks}
										type="button"
										onClick={() => handleWeeksChange(weeks)}
										className={`px-4 py-2 text-xs font-medium transition-all ${
											weeksToShow === weeks
												? "bg-[#e60000] text-white"
												: "bg-white text-gray-600 hover:bg-gray-50 hover:text-[#e60000]"
										}`}>
										{weeks} Week{weeks > 1 ? "s" : ""}
									</button>
								))}
							</div>
						)}
					</div>
				</div>

				{/* Controls Row - For both leave mode and general calendar */}
				<div className="flex items-center justify-between gap-4">
					{/* Legend chips */}
					<div className="flex flex-wrap items-center gap-2">
						{isLeaveMode
							? // Leave type buttons
								Object.entries(LEAVE_COLORS).map(([leaveType, colors]) => {
									const isActive = visibleLeaveTypes.has(leaveType);
									return (
										<button
											key={leaveType}
											type="button"
											onClick={() => toggleLeaveType(leaveType)}
											className={`inline-flex items-center gap-2 border px-3 py-1.5 text-xs font-medium transition-all ${
												isActive
													? "border-gray-300 bg-white text-gray-900 hover:border-[#e60000]"
													: "border-gray-200 bg-gray-50 text-gray-400 opacity-50 hover:opacity-100"
											}`}>
											<span className={`h-2 w-2 ${colors.dot}`} />
											<span>{leaveType}</span>
										</button>
									);
								})
							: // Event type buttons for general calendar
								ALL_EVENT_TYPES.map((eventType) => {
									const isActive = visibleEventTypes.has(eventType);
									const colors = EVENT_COLORS[eventType];
									return (
										<button
											key={eventType}
											type="button"
											onClick={() => toggleEventType(eventType)}
											className={`inline-flex items-center gap-2 border px-3 py-1.5 text-xs font-medium transition-all ${
												isActive
													? "border-gray-300 bg-white text-gray-900 hover:border-[#e60000]"
													: "border-gray-200 bg-gray-50 text-gray-400 opacity-50 hover:opacity-100"
											}`}>
											<span className={`h-2 w-2 ${colors.dot}`} />
											<span>{EVENT_LABELS[eventType]}</span>
										</button>
									);
								})}
					</div>
				</div>
			</div>

			{/* Calendar Grid */}
			<div className="px-6 pb-6 flex-1 flex flex-col min-h-0">
				{isLeaveMode ? (
					viewMode === "month" ? (
						<div className="w-full bg-white border border-gray-200 h-full flex flex-col min-h-0">
							<div className="grid grid-cols-7 border-b border-gray-200">
								{DAYS_SHORT.map((dayName) => (
									<div
										key={dayName}
										className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 text-center border-r border-gray-200 last:border-r-0">
										{dayName}
									</div>
								))}
							</div>
							<div className="grid grid-cols-7 grid-rows-6 flex-1 min-h-0">
								{days.map((date, index) => {
									const leaves = getLeavesForDate(date);
									const isWeekendDay = isWeekend(date);
									const isTodayDate = isToday(date);
									const inCurrentMonth = isCurrentMonthCell(date);
									const leaveTintClass = getLeaveDayTintClass(leaves);
									const dateKey = formatDateKey(date);
									const isInPreviewRange =
										hasPreview &&
										dateKey >= previewStartDate! &&
										dateKey <= previewEndDate!;
									const isApproved = statusParam === "APPROVED";

									return (
										<div
											key={index}
											className={`border-r border-b border-gray-200 last:border-r-0 p-2 min-h-0 overflow-hidden ${leaveTintClass} ${
												isWeekendDay ? "bg-gray-50/50" : ""
											} ${isTodayDate ? "bg-red-50/30" : ""}`}>
											<div className="mb-1 flex items-center justify-between">
												<span
													className={`text-xs font-semibold ${
														inCurrentMonth
															? isTodayDate
																? "text-[#e60000]"
																: "text-gray-900"
															: "text-gray-400"
													}`}>
													{date.getDate()}
												</span>
												{isTodayDate && (
													<span className="text-[9px] font-bold text-[#e60000] uppercase">
														Today
													</span>
												)}
											</div>

											<div className="space-y-1">
												{leaves.slice(0, 2).map((leave) => {
													const colors =
														LEAVE_COLORS[leave.leaveType] ||
														LEAVE_COLORS["Vacation Leave"];
													return (
														<div
															key={leave.id}
															className={`${colors.bg} ${colors.border} border-l-3 px-2 py-1`}>
															<p
																className={`text-[10px] font-medium ${colors.text} truncate`}>
																{leave.leaveType}
															</p>
														</div>
													);
												})}

												{leaves.length > 2 && (
													<div className="text-[10px] text-gray-500 px-1">
														+{leaves.length - 2} more
													</div>
												)}

												{isInPreviewRange && (
													<div
														className={`${isApproved ? "bg-green-50 border-l-green-500" : "bg-red-50 border-l-[#e60000]"} border-l-3 px-2 py-1 border ${isApproved ? "border-solid border-green-300" : "border-dashed border-red-300"}`}>
														<p
															className={`text-[10px] font-medium ${isApproved ? "text-green-700" : "text-[#e60000]"} truncate`}>
															{previewLeaveType}
														</p>
													</div>
												)}
											</div>
										</div>
									);
								})}
							</div>
						</div>
					) : (
						// Leave calendar - table layout
						<table className="w-full bg-white border border-gray-200 border-collapse table-fixed h-full">
							{/* Days Header */}
							<thead>
								<tr>
									{days.map((date, index) => {
										const dayIndex = date.getDay();
										const dayName =
											DAYS_SHORT[dayIndex === 0 ? 6 : dayIndex - 1];
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
															isTodayDate
																? "text-[#e60000]"
																: "text-gray-900"
														}`}>
														{date.getDate()}
													</span>
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
							<tbody className="h-full">
								<tr className="h-full">
									{days.map((date, index) => {
										const leaves = getLeavesForDate(date);
										const isWeekendDay = isWeekend(date);
										const isTodayDate = isToday(date);
										const leaveTintClass = getLeaveDayTintClass(leaves);

										return (
											<td
												key={index}
												className={`border-r border-gray-200 last:border-r-0 px-3 py-2 align-top ${leaveTintClass} ${
													isWeekendDay ? "bg-gray-50/50" : ""
												} ${isTodayDate ? "bg-red-50/30" : ""}`}>
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
															const dateKey = formatDateKey(date);
															const isInPreviewRange =
																dateKey >= previewStartDate! &&
																dateKey <= previewEndDate!;

															// Check if this is an approved leave
															const isApproved =
																statusParam === "APPROVED";
															return isInPreviewRange ? (
																<div
																	className={`${isApproved ? "bg-green-50 border-l-green-500" : "bg-red-50 border-l-[#e60000]"} border-l-3 px-2 py-2 border ${isApproved ? "border-solid border-green-300" : "border-dashed border-red-300"}`}>
																	<p
																		className={`text-xs font-medium ${isApproved ? "text-green-700" : "text-[#e60000]"} truncate`}>
																		{previewLeaveType}
																	</p>
																	<span
																		className={`text-[10px] ${isApproved ? "text-green-600" : "text-red-600"}`}>
																		{isApproved
																			? "Approved"
																			: "Preview"}
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
					)
				) : viewMode === "month" ? (
					<div className="w-full bg-white border border-gray-200 h-full flex flex-col min-h-0">
						<div className="grid grid-cols-7 border-b border-gray-200">
							{DAYS_SHORT.map((dayName) => (
								<div
									key={dayName}
									className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 text-center border-r border-gray-200 last:border-r-0">
									{dayName}
								</div>
							))}
						</div>
						<div className="grid grid-cols-7 grid-rows-6 flex-1 min-h-0">
							{days.map((date, index) => {
								const events = getEventsForDate(date);
								const isWeekendDay = isWeekend(date);
								const isTodayDate = isToday(date);
								const inCurrentMonth = isCurrentMonthCell(date);
								const eventTintClass = getEventDayTintClass(events);

								return (
									<div
										key={index}
										className={`border-r border-b border-gray-200 last:border-r-0 p-2 min-h-0 overflow-hidden ${eventTintClass} ${
											isWeekendDay ? "bg-gray-50/50" : ""
										} ${isTodayDate ? "bg-red-50/30" : ""}`}>
										<div className="mb-1 flex items-center justify-between">
											<span
												className={`text-xs font-semibold ${
													inCurrentMonth
														? isTodayDate
															? "text-[#e60000]"
															: "text-gray-900"
														: "text-gray-400"
												}`}>
												{date.getDate()}
											</span>
											{isTodayDate && (
												<span className="text-[9px] font-bold text-[#e60000] uppercase">
													Today
												</span>
											)}
										</div>

										<div className="space-y-1">
											{events.slice(0, 2).map((item) => {
												const eventType = mapCalendarItemTypeToEventType(
													item.type,
													item.metadata,
												);
												const colors = EVENT_COLORS[eventType];
												const isHighlighted =
													highlightedEventId === item.id;
												return (
													<div
														key={item.id}
														className={`${colors.bg} ${colors.border} border-l-3 px-2 py-1 cursor-pointer rounded-sm ${
															isHighlighted
																? "ring-2 ring-[#e60000] ring-offset-1"
																: ""
														}`}
														onClick={() =>
															setHighlightedEventId(
																highlightedEventId === item.id
																	? null
																	: item.id,
															)
														}>
														<p
															className={`text-[10px] font-medium ${colors.text} truncate`}>
															{item.title}
														</p>
													</div>
												);
											})}

											{events.length > 2 && (
												<div className="text-[10px] text-gray-500 px-1">
													+{events.length - 2} more
												</div>
											)}
										</div>
									</div>
								);
							})}
						</div>
					</div>
				) : (
					// General calendar - table layout (matching leave calendar)
					<table className="w-full bg-white border border-gray-200 border-collapse table-fixed h-full">
						{/* Days Header */}
						<thead>
							<tr>
								{days.map((date, index) => {
									const dayIndex = date.getDay();
									const dayName = DAYS_SHORT[dayIndex === 0 ? 6 : dayIndex - 1];
									const isWeekendDay = isWeekend(date);
									const isTodayDate = isToday(date);
									const isFirstDay = isFirstOfMonth(date);
									const eventCount =
										eventCountsByDate.get(formatDateKey(date)) || 0;
									const hasEvents = eventCount > 0;

									// Calculate width: columns with events get more space
									const baseWidth = 100 / days.length;
									const widthPercent = hasEvents
										? baseWidth * 1.5 // 50% wider for columns with events
										: baseWidth * 0.9; // Slightly narrower for empty columns

									return (
										<th
											key={index}
											className={`px-3 py-4 text-center border-r border-b border-gray-200 last:border-r-0 font-normal ${
												isWeekendDay ? "bg-gray-50" : ""
											}`}
											style={{ width: `${widthPercent}%` }}>
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
														isTodayDate
															? "text-[#e60000]"
															: "text-gray-900"
													}`}>
													{date.getDate()}
												</span>
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

						{/* Events Grid */}
						<tbody className="h-full">
							<tr className="h-full">
								{days.map((date, index) => {
									const events = getEventsForDate(date);
									const isWeekendDay = isWeekend(date);
									const isTodayDate = isToday(date);
									const eventTintClass = getEventDayTintClass(events);
									const eventCount =
										eventCountsByDate.get(formatDateKey(date)) || 0;
									const hasEvents = eventCount > 0;

									// Calculate width: columns with events get more space
									const baseWidth = 100 / days.length;
									const widthPercent = hasEvents
										? baseWidth * 1.5 // 50% wider for columns with events
										: baseWidth * 0.9; // Slightly narrower for empty columns

									return (
										<td
											key={index}
											className={`relative border-r border-gray-200 last:border-r-0 px-2 py-2 align-top min-w-0 ${eventTintClass} ${
												isWeekendDay ? "bg-gray-50/50" : ""
											} ${isTodayDate ? "bg-red-50/30" : ""}`}
											style={{ width: `${widthPercent}%` }}>
											{/* Current time indicator */}
											{isTodayDate && (
												<div
													className="absolute left-0 right-0 flex items-center z-10 pointer-events-none"
													style={{ top: `${getCurrentTimePosition()}%` }}>
													<div className="w-2 h-2 rounded-full bg-[#e60000] -ml-1" />
													<div className="flex-1 h-px bg-[#e60000]/60" />
													<span className="text-[10px] font-medium text-[#e60000] ml-1">
														{currentTime.toLocaleTimeString([], {
															hour: "2-digit",
															minute: "2-digit",
														})}
													</span>
												</div>
											)}

											{/* Events */}
											<div className="space-y-1.5">
												{events.map((item) => {
													const eventType =
														mapCalendarItemTypeToEventType(
															item.type,
															item.metadata,
														);
													const colors = EVENT_COLORS[eventType];
													const isHoliday =
														eventType === "holiday-regular" ||
														eventType ===
															"holiday-special-non-working" ||
														eventType === "holiday-special-working";
													const time = item.isAllDay
														? "All Day"
														: formatTime(new Date(item.startDate));
													const isHighlighted =
														highlightedEventId === item.id;
													return (
														<div
															key={item.id}
															className={`${colors.bg} ${colors.border} border-l-3 px-1.5 py-1 cursor-pointer hover:brightness-95 transition-all rounded-sm ${
																isHighlighted
																	? "ring-2 ring-[#e60000] ring-offset-1 shadow-lg"
																	: ""
															}`}
															onClick={() => {
																if (
																	highlightedEventId !== item.id
																) {
																	setHighlightedEventId(item.id);
																} else {
																	setHighlightedEventId(null);
																}
															}}>
															<p
																className={`text-[11px] font-medium ${colors.text} break-words leading-snug`}
																title={item.title}>
																{item.title}
															</p>
															<div className="flex items-center gap-1 mt-0.5">
																<Clock className="w-2.5 h-2.5 text-gray-400 flex-shrink-0" />
																<span className="text-[9px] text-gray-500">
																	{time}
																</span>
															</div>
															{eventType === "company" && (
																<span className="text-[9px] text-teal-600 font-medium mt-0.5 block">
																	Company
																</span>
															)}
															{isHoliday &&
																item.metadata?.category && (
																	<span
																		className={`text-[9px] ${colors.text} font-medium mt-0.5 block break-words leading-tight`}>
																		{item.metadata.category}
																	</span>
																)}
														</div>
													);
												})}
											</div>
										</td>
									);
								})}
							</tr>
						</tbody>
					</table>
				)}
			</div>
		</div>
	);
}
