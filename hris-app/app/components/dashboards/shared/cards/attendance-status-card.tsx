import { CheckCircle, Users } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { useEmployeeStatusSummary } from "~/lib/hooks/useMetrics";
import { useEmployees } from "~/lib/hooks/useEmployees";

interface AttendanceStatusCardProps {
	employeeId?: string;
}

export function AttendanceStatusCard({ employeeId }: AttendanceStatusCardProps) {
	const navigate = useNavigate();
	const todayStr = new Date().toISOString().slice(0, 10);
	const { data, isLoading } = useEmployeeStatusSummary(employeeId, todayStr, todayStr);
	const employeeAttendance = data?.metrics?.employeeStatusSummary || [];
	const { data: directReportsData } = useEmployees({
		page: 1,
		limit: 500,
		filter: employeeId ? `reportToId:${employeeId}` : undefined,
		fields: "id,employeeId",
		document: "true",
		pagination: "false",
		count: "false",
	});
	const directReports = useMemo(
		() =>
			directReportsData?.employees ||
			(Array.isArray(directReportsData?.data)
				? directReportsData.data
				: directReportsData?.data?.employees || []),
		[directReportsData],
	);
	const employeeIdMap = useMemo(() => {
		const map = new Map<string, string>();
		for (const item of directReports as any[]) {
			if (item?.employeeId && item?.id) {
				map.set(String(item.employeeId), String(item.id));
			}
		}
		return map;
	}, [directReports]);

	const handleEmployeeRowClick = (employeeCode?: string) => {
		const resolvedId = employeeCode ? employeeIdMap.get(String(employeeCode)) : undefined;
		if (resolvedId) {
			navigate(`/employee/${resolvedId}`);
			return;
		}
		navigate("/employee/team");
	};

	return (
		<Card id="dashboard-team-attendance" className="gap-4 py-4">
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between">
					<CardTitle className="flex items-center gap-2 text-base font-semibold">
						<Users className="h-4 w-4 text-gray-400" />
						Team Attendance
					</CardTitle>
					<button
						onClick={() => navigate("/employee/team")}
						className="text-xs text-gray-400 hover:text-gray-600">
						View all →
					</button>
				</div>
			</CardHeader>
			<CardContent className="pt-0">
				{isLoading ? (
					<div className="flex h-16 items-center justify-center text-sm text-gray-500">Loading...</div>
				) : employeeAttendance.length === 0 ? (
					<div className="flex h-16 items-center justify-center text-sm text-gray-500">
						No direct reports
					</div>
				) : (
					<div className="max-h-[210px] divide-y divide-gray-100 overflow-y-auto pr-1">
						{employeeAttendance.map((employee: any) => (
							<div
								key={employee.employeeId}
								role="button"
								tabIndex={0}
								onClick={() => handleEmployeeRowClick(employee.employeeId)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										handleEmployeeRowClick(employee.employeeId);
									}
								}}
								className="flex cursor-pointer items-center gap-2 py-1.5 hover:bg-gray-50 -mx-1 px-1 rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-gray-300">
								<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-gray-100 text-gray-500">
									<Users className="h-3.5 w-3.5" />
								</div>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium text-gray-800">
										{employee.employeeName}
									</p>
								</div>
								<span
									className={`inline-flex shrink-0 items-center rounded px-1.5 py-px text-[10px] font-medium ${
										employee.status === "PRESENT"
											? "bg-green-100 text-green-700"
											: employee.status === "LEAVE"
												? "bg-yellow-100 text-yellow-700"
												: "bg-red-100 text-red-700"
									}`}>
									{employee.status}
								</span>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
