import { AlertTriangle, Clock, FileWarning, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { useAuth } from "~/lib/hooks/use-auth";
import {
	useAttendanceMetricsDetailed,
	useDocumentComplianceMetrics,
	useNoWorkReport,
} from "~/lib/hooks/useMetrics";

interface HrQueueCardProps {
	role: "hr-user" | "hr-manager";
}

type QueueTimeframe = "today" | "last_7_days" | "month_to_date" | "this_month";

function formatLocalDate(date: Date) {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, "0");
	const day = `${date.getDate()}`.padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function formatDisplayDate(date: Date) {
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function formatRangeLabel(from: Date, to: Date) {
	const fromMonthDay = from.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
	const toMonthDayYear = to.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});

	return `${fromMonthDay}-${toMonthDayYear}`;
}

function getDateWindow(now: Date, timeframe: QueueTimeframe) {
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

	switch (timeframe) {
		case "last_7_days": {
			const from = new Date(today);
			from.setDate(today.getDate() - 6);
			return {
				from,
				to: today,
				label: `Last 7 days | ${formatRangeLabel(from, today)}`,
			};
		}
		case "month_to_date": {
			const from = new Date(today.getFullYear(), today.getMonth(), 1);
			return {
				from,
				to: today,
				label: `Month to date | ${formatRangeLabel(from, today)}`,
			};
		}
		case "this_month": {
			const from = new Date(today.getFullYear(), today.getMonth(), 1);
			const to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
			return {
				from,
				to,
				label: `This month | ${formatRangeLabel(from, to)}`,
			};
		}
		case "today":
		default:
			return {
				from: today,
				to: today,
				label: `Today | ${formatDisplayDate(today)}`,
			};
	}
}

function buildPath(path: string, params: Record<string, string | undefined>) {
	const searchParams = new URLSearchParams();

	Object.entries(params).forEach(([key, value]) => {
		if (value) {
			searchParams.set(key, value);
		}
	});

	const query = searchParams.toString();
	return query ? `${path}?${query}` : path;
}

export function HrQueueCard({ role }: HrQueueCardProps) {
	const navigate = useNavigate();
	const { user } = useAuth();
	const [timeframe, setTimeframe] = useState<QueueTimeframe>("today");
	const windowConfig = useMemo(() => getDateWindow(new Date(), timeframe), [timeframe]);

	const organizationId = user?.organizationId || user?.organization?.id;
	const from = formatLocalDate(windowConfig.from);
	const to = formatLocalDate(windowConfig.to);
	const reportDay = formatLocalDate(windowConfig.to);
	const month = `${windowConfig.from.getMonth() + 1}`;
	const year = `${windowConfig.from.getFullYear()}`;

	const { data: attendanceData, isLoading: isLoadingAttendance } = useAttendanceMetricsDetailed(
		from,
		to,
		10,
		1,
	);
	const { data: complianceData, isLoading: isLoadingCompliance } =
		useDocumentComplianceMetrics(organizationId);
	const { data: noWorkData, isLoading: isLoadingNoWork } = useNoWorkReport(reportDay);

	const attendanceMetrics = attendanceData?.metrics?.attendanceObligationDetailed?.metrics;
	const complianceCount =
		complianceData?.metrics?.documentComplianceMetrics?.nonCompliantEmployees?.length || 0;
	const noWorkCount = noWorkData?.metrics?.noWorkReport?.noWorkCount || 0;

	const tardinessPath = buildPath("/hr/reports/attendance", {
		tab: "tardiness",
		from,
		to,
		month,
		year,
	});
	const noWorkPath = buildPath("/hr/reports/workforce", {
		tab: "nowork",
		from,
		to,
		month,
		year,
	});
	const compliancePath = "/hr/employee-documents#non-compliant-employees";
	const isLoading = isLoadingAttendance || isLoadingCompliance || isLoadingNoWork;

	const items = useMemo(
		() => [
			{
				label: "Late Cases",
				value: attendanceMetrics?.totalLate || 0,
				icon: Clock,
				path: tardinessPath,
				basis: windowConfig.label,
				className: "bg-amber-50 text-amber-700 border-amber-100",
			},
			{
				label: "Absent Cases",
				value: noWorkCount,
				icon: AlertTriangle,
				path: noWorkPath,
				basis: windowConfig.label,
				className: "bg-red-50 text-red-700 border-red-100",
			},
			{
				label: "Compliance Tasks",
				value: complianceCount,
				icon: ShieldCheck,
				path: compliancePath,
				basis: `As of | ${formatDisplayDate(windowConfig.to)}`,
				className: "bg-blue-50 text-blue-700 border-blue-100",
			},
			{
				label: role === "hr-manager" ? "Workforce Reports" : "Attendance Reports",
				value: role === "hr-manager" ? noWorkCount : attendanceMetrics?.totalLate || 0,
				icon: FileWarning,
				path: role === "hr-manager" ? noWorkPath : tardinessPath,
				basis: windowConfig.label,
				className: "bg-orange-50 text-orange-700 border-orange-100",
			},
		],
		[
			attendanceMetrics?.totalLate,
			complianceCount,
			compliancePath,
			noWorkCount,
			noWorkPath,
			role,
			tardinessPath,
			windowConfig.label,
			windowConfig.to,
		],
	);

	const viewAllPath = role === "hr-manager" ? noWorkPath : tardinessPath;

	return (
		<Card id="dashboard-hr-queue">
			<CardHeader>
				<div className="flex items-start justify-between gap-4">
					<div>
						<CardTitle className="flex items-center gap-2">
							<FileWarning className="h-5 w-5 text-orange-500" />
							{role === "hr-manager"
								? "Workforce / Compliance Queue"
								: "Attendance Exceptions / HR Queue"}
						</CardTitle>
						<p className="mt-1 text-xs text-gray-500">
							Counts reflect the selected date window
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Select
							value={timeframe}
							onValueChange={(value) => setTimeframe(value as QueueTimeframe)}>
							<SelectTrigger className="h-9 w-[150px] border-gray-200 bg-white text-xs shadow-sm">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="today">Today</SelectItem>
								<SelectItem value="last_7_days">Last 7 Days</SelectItem>
								<SelectItem value="month_to_date">Month to Date</SelectItem>
								<SelectItem value="this_month">This Month</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="flex h-32 items-center justify-center">
						<div className="text-sm text-gray-600">Loading queue...</div>
					</div>
				) : (
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						{items.map((item) => (
							<button
								key={item.label}
								onClick={() => navigate(item.path)}
								className={`rounded-lg border p-3 text-left transition-colors hover:bg-gray-50 ${item.className}`}>
								<div className="flex items-center justify-between">
									<item.icon className="h-4 w-4" />
									<span className="text-lg font-bold">{item.value}</span>
								</div>
								<p className="mt-2 text-xs font-medium">{item.label}</p>
								<p className="mt-1 text-[11px] text-current/70">{item.basis}</p>
							</button>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
