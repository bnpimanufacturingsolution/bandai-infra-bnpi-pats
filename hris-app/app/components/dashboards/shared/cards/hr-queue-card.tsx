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
			},
			{
				label: "Absent Cases",
				value: noWorkCount,
				icon: AlertTriangle,
				path: noWorkPath,
				basis: windowConfig.label,
			},
			{
				label: "Compliance Tasks",
				value: complianceCount,
				icon: ShieldCheck,
				path: compliancePath,
				basis: `As of | ${formatDisplayDate(windowConfig.to)}`,
			},
			{
				label: role === "hr-manager" ? "Workforce Reports" : "Attendance Reports",
				value: role === "hr-manager" ? noWorkCount : attendanceMetrics?.totalLate || 0,
				icon: FileWarning,
				path: role === "hr-manager" ? noWorkPath : tardinessPath,
				basis: windowConfig.label,
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
		<Card id="dashboard-hr-queue" className="h-full gap-4 overflow-hidden py-4">
			<CardHeader className="pb-2">
				<div className="flex items-start justify-between gap-4">
					<div>
						<CardTitle className="flex items-center gap-2 text-base font-semibold">
							<FileWarning className="h-4 w-4 text-gray-400" />
							{role === "hr-manager" ? "Workforce Queue" : "HR Queue"}
						</CardTitle>
						<p className="mt-0.5 text-xs text-gray-400">Selected window</p>
					</div>
					<div className="flex items-center gap-2">
						<Select
							value={timeframe}
							onValueChange={(value) => setTimeframe(value as QueueTimeframe)}>
							<SelectTrigger className="h-8 w-[118px] border-gray-200 bg-white text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="today">Today</SelectItem>
								<SelectItem value="last_7_days">Last 7d</SelectItem>
								<SelectItem value="month_to_date">MTD</SelectItem>
								<SelectItem value="this_month">This month</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>
			</CardHeader>
			<CardContent className="min-h-0 flex-1 pt-0">
				{isLoading ? (
					<div className="flex h-20 items-center justify-center text-sm text-gray-500">Loading...</div>
				) : (
					<div className="grid h-full min-h-0 grid-cols-2 gap-2">
						{items.map((item) => (
							<button
								key={item.label}
								onClick={() => navigate(item.path)}
								className="min-h-0 rounded-lg border border-neutral-300 bg-gray-50 px-3 py-2.5 text-left shadow-sm transition-all hover:border-neutral-400 hover:bg-white hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200">
								<div className="flex items-start justify-between gap-2">
									<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white">
										<item.icon className="h-3.5 w-3.5 text-gray-500" />
									</div>
									<span className="text-xl font-semibold tabular-nums text-gray-900">
										{item.value}
									</span>
								</div>
								<div className="mt-2 text-xs font-medium text-gray-700">{item.label}</div>
								<div className="mt-0.5 text-[10px] text-gray-400">{item.basis}</div>
							</button>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
