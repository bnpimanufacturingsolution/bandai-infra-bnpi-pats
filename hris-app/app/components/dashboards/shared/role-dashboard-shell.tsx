import { roleDashboardConfigs } from "./role-dashboard.config";
import type { RoleDashboardShellProps } from "./role-dashboard.types";
import { useAuth } from "~/lib/hooks/use-auth";
import { TimeOffCard } from "./cards/time-off-card";
import { QuickActionsCard } from "./cards/quick-actions-card";
import { RequestListCard } from "./cards/request-list-card";
import { AttendanceStatusCard } from "./cards/attendance-status-card";
import { HrQueueCard } from "./cards/hr-queue-card";
import { ActionNeededCard } from "./cards/action-needed-card";
import { EmployeeCalendarCard } from "./cards/employee-calendar-card";
import type { DashboardCardKey } from "./role-dashboard.types";
import { RegularizationCelebrationModal } from "./regularization-celebration-modal";

export function RoleDashboardShell({ dashboardRole }: RoleDashboardShellProps) {
	const { user } = useAuth();
	const employeeId = user?.metadata?.employee?.id || "";
	const config = roleDashboardConfigs[dashboardRole];

	const renderCard = (cardKey: DashboardCardKey) => {
		if (cardKey === "time_off") {
			return <TimeOffCard key={cardKey} role={dashboardRole} employeeId={employeeId} />;
		}
		if (cardKey === "quick_actions") {
			return <QuickActionsCard key={cardKey} actions={config.quickActions} />;
		}
		if (cardKey === "my_requests") {
			return <RequestListCard key={cardKey} type="my-requests" employeeId={employeeId} />;
		}
		if (cardKey === "action_needed") {
			return <ActionNeededCard key={cardKey} role={dashboardRole} />;
		}
		if (cardKey === "pending_approvals") {
			return (
				<RequestListCard key={cardKey} type="pending-approvals" employeeId={employeeId} />
			);
		}
		if (cardKey === "team_attendance") {
			return <AttendanceStatusCard key={cardKey} employeeId={employeeId} />;
		}
		if (cardKey === "hr_approvals_queue") {
			return <RequestListCard key={cardKey} type="hr-approvals" employeeId={employeeId} />;
		}
		if (cardKey === "hr_operational_queue") {
			return (
				<HrQueueCard
					key={cardKey}
					role={dashboardRole === "hr-manager" ? "hr-manager" : "hr-user"}
				/>
			);
		}
		if (cardKey === "employee_calendar") {
			return <EmployeeCalendarCard key={cardKey} employeeId={employeeId} />;
		}

		return <ActionNeededCard key={`fallback-${cardKey}`} role={dashboardRole} />;
	};

	const topRow = config.layout?.top || ["time_off", "action_needed", "quick_actions"];
	const bottomLeft = config.layout?.bottomLeft || "my_requests";
	const bottomRight = config.layout?.bottomRight || "action_needed";

	const firstName =
		user?.metadata?.employee?.personalInfo?.firstName ||
		user?.userName?.split(" ")[0] ||
		"";
	const greetingName = firstName || "there";
	const now = new Date();
	const dateLabel = now.toLocaleDateString(undefined, {
		weekday: "long",
		month: "long",
		day: "numeric",
	});
	const hour = now.getHours();
	const timeGreeting =
		hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

	return (
		<div className="flex min-h-[calc(100vh-8rem)] min-w-0 flex-col gap-4">
			<RegularizationCelebrationModal
				employeeId={employeeId}
				enabled={
					(dashboardRole === "employee" || dashboardRole === "employee-manager") &&
					Boolean(employeeId)
				}
			/>

			{/* Minimal greeting header */}
			<div className="flex items-end justify-between gap-3">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight text-gray-900">
						Good {timeGreeting}, {greetingName}.
					</h1>
					<p className="mt-0.5 text-sm text-gray-500">Here's what's happening.</p>
				</div>
				<div className="hidden text-right text-sm text-gray-500 md:block">{dateLabel}</div>
			</div>

			<div className="grid min-w-0 grid-cols-1 items-stretch gap-3 md:grid-cols-2 xl:grid-cols-3">
				{topRow.map((cardKey) => (
					<div key={`top-${cardKey}`} className="h-full min-h-[240px] min-w-0">
						{renderCard(cardKey)}
					</div>
				))}
			</div>

			<div className="grid min-w-0 flex-1 grid-cols-1 items-stretch gap-3 md:grid-cols-2">
				<div className="min-h-[210px] min-w-0">{renderCard(bottomLeft)}</div>
				<div className="min-h-[210px] min-w-0">
					{renderCard(bottomRight)}
				</div>
			</div>
		</div>
	);
}
