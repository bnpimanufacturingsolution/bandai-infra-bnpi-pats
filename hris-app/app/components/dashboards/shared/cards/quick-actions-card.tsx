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
		<Card id="dashboard-quick-actions" className="h-full gap-4 py-4 overflow-hidden">
			<CardHeader className="pb-2">
				<CardTitle className="flex items-center gap-2 text-base font-semibold">
					<CalendarCheck className="h-4 w-4 text-gray-400" />
					Quick Actions
				</CardTitle>
			</CardHeader>
			<CardContent className="flex min-h-0 flex-1 flex-col pt-0">
				{actionBlock.blocked ? (
					<div className="flex w-full flex-1 flex-col justify-center rounded-lg border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-900">
						<div className="mb-2 flex items-center gap-2 font-semibold">
							<AlertTriangle className="h-4 w-4" />
							Self-service actions blocked
						</div>
						<p className="text-xs leading-5 text-amber-800">{actionBlock.message}</p>
					</div>
				) : (
					<div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-2">
						{actions.map((action) => (
							<button
								key={action.id}
								onClick={() => navigate(resolvePath(action.path))}
								className="flex h-full min-h-0 items-center gap-2.5 rounded-lg border border-neutral-300 bg-gray-50 px-3 py-2.5 text-left shadow-sm transition-all hover:border-neutral-400 hover:bg-white hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200 active:scale-[0.99]">
								<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white shadow-sm">
									<action.icon className="h-4 w-4 text-gray-700" />
								</div>
								<span className="line-clamp-2 min-w-0 text-sm font-semibold leading-5 text-gray-900">
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
