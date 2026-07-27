import { CalendarDays } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { useAuth } from "~/lib/hooks/use-auth";
import { useCalendarItems } from "~/lib/hooks/use-calendar-items";
import type { CalendarItem } from "~/zod/calendar-item.zod";

interface EmployeeCalendarCardProps {
	employeeId?: string;
}

type DashboardCalendarType = "HOLIDAY" | "LEAVE" | "BIRTHDAY" | "OFF";

interface DashboardCalendarItem {
	id: string;
	title: string;
	startDate: Date;
	displayDate: string;
	type: DashboardCalendarType;
}

const monthLabelFormatter = new Intl.DateTimeFormat("en-US", {
	month: "long",
	year: "numeric",
});

const rowDateFormatter = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	year: "numeric",
});

const typeChipClass: Record<DashboardCalendarType, string> = {
	HOLIDAY: "bg-blue-50 text-blue-700 border-blue-200",
	LEAVE: "bg-violet-50 text-violet-700 border-violet-200",
	BIRTHDAY: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
	OFF: "bg-gray-100 text-gray-700 border-gray-200",
};

const EVENT_FILTER_PARAM =
	"leave,birthday,holiday-regular,holiday-special-non-working,holiday-special-working,off";
const LEAVE_FILTER_PARAM = "Vacation Leave,Sick Leave,Remote Work,Personal Leave";

const normalize = (value: unknown) => String(value || "").trim();
const normalizeLower = (value: unknown) => normalize(value).toLowerCase();

const getDashboardType = (item: CalendarItem): DashboardCalendarType => {
	if (item.type === "HOLIDAY") return "HOLIDAY";
	if (item.type === "BIRTHDAY") return "BIRTHDAY";

	const tags = Array.isArray(item.tags) ? item.tags.map((tag) => String(tag).toLowerCase()) : [];
	const title = String(item.title || "").toLowerCase();
	if (tags.includes("leave") || title.includes("leave")) return "LEAVE";

	return "OFF";
};

const isEmployeeScopedItem = (item: CalendarItem, employeeId?: string): boolean => {
	if (!employeeId) return false;

	const source = item as any;
	const metadata = source?.metadata || {};
	const targetId = normalizeLower(employeeId);

	const directMatchCandidates = [
		source?.assignedEmployeeId,
		source?.employeeId,
		source?.userEmployeeId,
		metadata?.assignedEmployeeId,
		metadata?.employeeId,
		metadata?.targetEmployeeId,
		metadata?.requesterEmployeeId,
	];

	if (directMatchCandidates.some((value) => normalizeLower(value) === targetId)) {
		return true;
	}

	const arrayCandidates = [
		source?.assignedEmployeeIds,
		metadata?.assignedEmployeeIds,
		metadata?.employeeIds,
	];

	for (const candidate of arrayCandidates) {
		if (Array.isArray(candidate)) {
			if (candidate.some((value) => normalizeLower(value) === targetId)) {
				return true;
			}
		}
	}

	return false;
};

export function EmployeeCalendarCard({ employeeId }: EmployeeCalendarCardProps) {
	const navigate = useNavigate();
	const { user } = useAuth();
	const organizationId = user?.organizationId || "";
	const now = new Date();
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
	const monthLabel = monthLabelFormatter.format(now);

	const { data: calendarItemsResponse, isLoading } = useCalendarItems(
		organizationId,
		now.getFullYear(),
		organizationId
			? {
					limit: 200,
				}
			: undefined,
	);

	const calendarItems = useMemo<CalendarItem[]>(() => {
		if (Array.isArray(calendarItemsResponse)) {
			return calendarItemsResponse;
		}

		const nestedItems = (calendarItemsResponse as any)?.data?.items;
		if (Array.isArray(nestedItems)) {
			return nestedItems;
		}

		return [];
	}, [calendarItemsResponse]);

	const upcomingItems = useMemo<DashboardCalendarItem[]>(() => {
		const typePriority: Record<DashboardCalendarType, number> = {
			HOLIDAY: 0,
			LEAVE: 1,
			BIRTHDAY: 2,
			OFF: 3,
		};

		return calendarItems
			.filter((item) => item.status === "ACTIVE")
			.filter((item) => {
				const dashboardType = getDashboardType(item);
				if (dashboardType === "HOLIDAY") {
					return true;
				}
				return isEmployeeScopedItem(item, employeeId);
			})
			.map((item) => {
				const start = new Date(item.startDate);
				return {
					id: item.id,
					title: item.title,
					startDate: start,
					displayDate: rowDateFormatter.format(start),
					type: getDashboardType(item),
				};
			})
			.filter((item) => {
				const itemDayStart = new Date(
					item.startDate.getFullYear(),
					item.startDate.getMonth(),
					item.startDate.getDate(),
				);
				return itemDayStart >= todayStart && itemDayStart <= currentMonthEnd;
			})
			.sort((a, b) => {
				const dateDiff = a.startDate.getTime() - b.startDate.getTime();
				if (dateDiff !== 0) return dateDiff;
				return typePriority[a.type] - typePriority[b.type];
			})
			.slice(0, 3);
	}, [calendarItems, currentMonthEnd, employeeId, todayStart]);

	const handleViewAll = () => {
		const params = new URLSearchParams();
		const todayIsoDate = [
			now.getFullYear(),
			String(now.getMonth() + 1).padStart(2, "0"),
			String(now.getDate()).padStart(2, "0"),
		].join("-");

		params.set("date", todayIsoDate);
		params.set("weeks", "3");
		params.set("events", EVENT_FILTER_PARAM);
		params.set("leaves", LEAVE_FILTER_PARAM);

		navigate(`/calendar?${params.toString()}`);
	};

	const handleItemClick = (item: DashboardCalendarItem) => {
		const params = new URLSearchParams();
		const itemIsoDate = [
			item.startDate.getFullYear(),
			String(item.startDate.getMonth() + 1).padStart(2, "0"),
			String(item.startDate.getDate()).padStart(2, "0"),
		].join("-");

		params.set("date", itemIsoDate);
		params.set("weeks", "3");
		params.set("events", EVENT_FILTER_PARAM);
		params.set("leaves", LEAVE_FILTER_PARAM);
		params.set("eventId", item.id);

		navigate(`/calendar?${params.toString()}`);
	};

	return (
		<Card id="dashboard-employee-calendar" className="h-full gap-4 py-4">
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between">
					<CardTitle className="flex items-center gap-2 text-base font-semibold">
						<CalendarDays className="h-4 w-4 text-gray-400" />
						Calendar
					</CardTitle>
					<button
						onClick={handleViewAll}
						className="text-xs text-gray-400 hover:text-gray-600">
						View all →
					</button>
				</div>
				<p className="text-xs text-gray-500">{monthLabel}</p>
			</CardHeader>
			<CardContent className="pt-0">
				{isLoading ? (
					<p className="text-sm text-gray-500">Loading...</p>
				) : upcomingItems.length === 0 ? (
					<p className="text-sm text-gray-500">No upcoming items this month.</p>
				) : (
					<div className="space-y-1">
						{upcomingItems.map((item) => (
							<button
								key={item.id}
								type="button"
								onClick={() => handleItemClick(item)}
								className="w-full rounded-lg border border-gray-100 px-3 py-1.5 text-left transition hover:bg-gray-50">
								<div className="flex items-center justify-between gap-2">
									<p className="truncate text-sm font-medium text-gray-800">{item.title}</p>
									<span
										className={`shrink-0 rounded px-1.5 py-px text-[10px] font-medium ${typeChipClass[item.type]}`}>
										{item.type}
									</span>
								</div>
								<p className="text-xs text-gray-400">{item.displayDate}</p>
							</button>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
