import { AlertTriangle, CalendarCheck } from "lucide-react";
import { useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { useAuth } from "~/lib/hooks/use-auth";
import { getEmployeeActionBlock } from "~/lib/employee-action-block";
import type { QuickActionItem } from "../role-dashboard.types";

interface QuickActionsCardProps {
	actions: QuickActionItem[];
}

export function QuickActionsCard({ actions }: QuickActionsCardProps) {
	const navigate = useNavigate();
	const { user } = useAuth();
	const employeeId = user?.metadata?.employee?.id || "";
	const actionBlock = getEmployeeActionBlock(user?.metadata?.employee);

	const resolvePath = (path: string) => {
		if (!path.includes(":id")) return path;
		if (employeeId) return path.replace(":id", employeeId);
		return "/dashboard";
	};

	return (
		<Card id="dashboard-quick-actions" className="h-full min-h-0 flex-1 gap-3 overflow-hidden py-4">
			<CardHeader className="pb-0">
				<CardTitle className="flex items-center gap-2 text-base font-semibold">
					<CalendarCheck className="h-4 w-4 text-gray-400" />
					Quick Actions
				</CardTitle>
			</CardHeader>
			<CardContent className="flex min-h-0 flex-1 flex-col pt-0">
				{actionBlock.blocked ? (
					<div className="flex w-full flex-1 flex-col justify-center rounded-2xl bg-amber-50 px-4 py-5 text-sm text-amber-900 shadow-sm">
						<div className="mb-2 flex items-center gap-2 font-semibold">
							<AlertTriangle className="h-4 w-4" />
							Self-service actions blocked
						</div>
						<p className="text-xs leading-5 text-amber-800">{actionBlock.message}</p>
					</div>
				) : (
					<div className="flex min-h-0 flex-1 flex-col gap-2">
						{actions.map((action) => (
							<button
								key={action.id}
								onClick={() => navigate(resolvePath(action.path))}
								className="group flex w-full shrink-0 items-center gap-3 rounded-2xl bg-neutral-100 px-3.5 py-2.5 text-left shadow-sm transition-all duration-200 hover:bg-white hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 active:scale-[0.99]">
								<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm transition-shadow duration-200 group-hover:shadow">
									<action.icon className="h-4 w-4 text-neutral-700" />
								</div>
								<span className="truncate text-sm font-semibold tracking-tight text-neutral-900">
									{action.label}
								</span>
							</button>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
