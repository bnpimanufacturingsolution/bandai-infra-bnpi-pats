import { useState } from "react";
import { useSearchParams } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { PerfectAttendanceTab } from "./tabs/PerfectAttendanceTab";
import { TardinessUndetimeTab } from "./tabs/TardinessUndetimeTab";
import { OvertimeTab } from "./tabs/OvertimeTab";
import { LeaveBalanceTab } from "./tabs/LeaveBalanceTab";

/**
 * Attendance & Time Tracking Reports Page
 * Contains tabs for:
 * - Perfect Attendance
 * - Tardiness & Undertime
 * - Overtime
 * - Leave Balance
 */
export default function AttendanceReportsPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const currentTab = searchParams.get("tab") || "perfect";

	const handleTabChange = (tab: string) => {
		const nextSearchParams = new URLSearchParams(searchParams);
		nextSearchParams.set("tab", tab);
		setSearchParams(nextSearchParams);
	};

	return (
		<div className="flex flex-col gap-6 p-6">
			<Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
				<TabsList className="grid w-full grid-cols-4 mb-6">
					<TabsTrigger value="perfect">Perfect Attendance</TabsTrigger>
					<TabsTrigger value="tardiness">Tardiness & Undertime</TabsTrigger>
					<TabsTrigger value="overtime">Overtime</TabsTrigger>
					<TabsTrigger value="leave">Leave Balance</TabsTrigger>
				</TabsList>

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
