import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { AttendanceDailyTrendTab } from "./tabs/AttendanceDailyTrendTab";
import { PerfectAttendanceTab } from "./tabs/PerfectAttendanceTab";
import { TardinessUndetimeTab } from "./tabs/TardinessUndetimeTab";
import { OvertimeTab } from "./tabs/OvertimeTab";
import { LeaveBalanceTab } from "./tabs/LeaveBalanceTab";

const visibleTabs = new Set(["trend", "perfect", "tardiness", "overtime", "leave"]);

/**
 * Attendance & Time Tracking Reports Page
 * Contains tabs for:
 * - Daily Trend by Department
 * - Perfect Attendance
 * - Tardiness & Undertime
 * - Overtime
 * - Leave Balance
 */
export default function AttendanceReportsPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const requestedTab = searchParams.get("tab") || "perfect";
	const currentTab = visibleTabs.has(requestedTab) ? requestedTab : "perfect";

	useEffect(() => {
		if (visibleTabs.has(requestedTab)) return;

		const nextSearchParams = new URLSearchParams(searchParams);
		nextSearchParams.set("tab", "perfect");
		setSearchParams(nextSearchParams, { replace: true });
	}, [requestedTab, searchParams, setSearchParams]);

	const handleTabChange = (tab: string) => {
		const nextSearchParams = new URLSearchParams(searchParams);
		nextSearchParams.set("tab", tab);
		setSearchParams(nextSearchParams);
	};

	return (
		<div className="flex flex-col gap-6">
			<Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
				<TabsList className="grid h-auto w-full grid-cols-2 gap-2 mb-6 md:grid-cols-5">
					<TabsTrigger value="trend" className="whitespace-normal text-center text-xs leading-tight md:text-sm">
						Daily Trend
					</TabsTrigger>
					<TabsTrigger value="perfect" className="whitespace-normal text-center text-xs leading-tight md:text-sm">
						Perfect Attendance
					</TabsTrigger>
					<TabsTrigger value="tardiness" className="whitespace-normal text-center text-xs leading-tight md:text-sm">
						Tardiness & Undertime
					</TabsTrigger>
					<TabsTrigger value="overtime" className="whitespace-normal text-center text-xs leading-tight md:text-sm">
						Overtime
					</TabsTrigger>
					<TabsTrigger value="leave" className="whitespace-normal text-center text-xs leading-tight md:text-sm">
						Leave Balance
					</TabsTrigger>
				</TabsList>

				{/* Daily Trend Tab */}
				<TabsContent value="trend" className="space-y-4">
					<AttendanceDailyTrendTab />
				</TabsContent>

				{/* Perfect Attendance Tab */}
				<TabsContent value="perfect" className="space-y-4">
					<PerfectAttendanceTab />
				</TabsContent>

				{/* Tardiness & Undertime Tab */}
				<TabsContent value="tardiness" className="space-y-4">
					<TardinessUndetimeTab />
				</TabsContent>

				{/* Overtime Tab */}
				<TabsContent value="overtime" className="space-y-4">
					<OvertimeTab />
				</TabsContent>

				{/* Leave Balance Tab */}
				<TabsContent value="leave" className="space-y-4">
					<LeaveBalanceTab />
				</TabsContent>
			</Tabs>
		</div>
	);
}
