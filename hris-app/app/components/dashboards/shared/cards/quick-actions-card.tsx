import { AlertTriangle, ArrowRight, CalendarCheck } from "lucide-react";
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
		<Card id="dashboard-quick-actions" className="h-full overflow-hidden">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<CalendarCheck className="w-5 h-5 text-orange-500" />
					Quick Actions
				</CardTitle>
			</CardHeader>
			<CardContent className="flex min-h-0 flex-1">
				{actionBlock.blocked ? (
					<div className="flex w-full flex-col justify-center rounded-lg border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-900">
						<div className="mb-2 flex items-center gap-2 font-semibold">
							<AlertTriangle className="h-4 w-4" />
							Self-service actions blocked
						</div>
						<p className="text-xs leading-5 text-amber-800">{actionBlock.message}</p>
					</div>
				) : (
				<div className="grid h-full min-h-0 w-full auto-rows-fr grid-cols-1 gap-3 content-stretch min-[520px]:grid-cols-2">
					{actions.map((action) => (
						<button
							key={action.id}
							onClick={() => navigate(resolvePath(action.path))}
							className="flex h-full min-h-[7.75rem] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-gray-200 px-3 py-3 text-center transition-colors hover:bg-gray-50 cursor-pointer sm:px-3.5">
							<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-orange-100 bg-orange-50 sm:h-10 sm:w-10">
								<action.icon className="h-4 w-4 text-orange-500" />
							</div>
							<span className="line-clamp-2 break-words text-xs font-medium leading-snug text-gray-900 sm:text-sm">
								{action.label}
							</span>
							<ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
						</button>
					))}
				</div>
				)}
			</CardContent>
		</Card>
	);
}
