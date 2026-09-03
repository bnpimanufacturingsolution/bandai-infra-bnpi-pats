import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { SummaryCard } from "~/components/atoms/SummaryCard";
import { useNavigate } from "react-router";
import { useDashboardOverview } from "~/lib/hooks/useDashboard";
import { adminQuickActionSections, type AdminNavItem } from "~/lib/admin-navigation";
import { Users, Building2, Settings, Briefcase, UserPlus, ChevronRight } from "lucide-react";

// Meta function removed temporarily - React Router will generate +types automatically

export default function AdminDashboard() {
	const navigate = useNavigate();
	const { data: dashboardData, isLoading } = useDashboardOverview();

	const overview = dashboardData?.overview;
	const topQuickActionIds = [
		"users",
		"positions",
		"schedule-templates",
		"departments",
		"manage",
		"audit-logs",
	];
	const allQuickActions = adminQuickActionSections.flatMap((section) => section.items);
	const topQuickActions = topQuickActionIds
		.map((id) => allQuickActions.find((item) => item.id === id))
		.filter((item): item is AdminNavItem => Boolean(item));

	// HR Management Statistics for IT Admin
	const stats = [
		{
			title: "Total Employees",
			value: overview?.totalEmployees?.toLocaleString() || "0",
			icon: Users,
			description: "All employees in the system",
			color: "blue" as const,
		},
		{
			title: "Departments",
			value: overview?.totalDepartments?.toString() || "0",
			icon: Building2,
			description: "Total departments",
			color: "orange" as const,
		},
		{
			title: "Positions",
			value: overview?.totalPositions?.toString() || "0",
			icon: Briefcase,
			description: "Active job positions",
			color: "green" as const,
		},
		{
			title: "New Hires",
			value: overview?.newHiresThisMonth?.toString() || "0",
			icon: UserPlus,
			description: "Employees hired this month",
			color: "purple" as const,
		},
	];

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-end justify-between">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight text-gray-900">Admin</h1>
					<p className="text-sm text-gray-500">System overview</p>
				</div>
				<div className="flex items-center gap-2 text-xs">
					<Badge variant="outline">Admin</Badge>
				</div>
			</div>

			{/* HR Statistics Cards */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
				{stats.map((stat, index) => (
					<SummaryCard
						key={index}
						title={stat.title}
						value={stat.value}
						description={stat.description}
						icon={stat.icon}
						color={stat.color}
						loading={isLoading}
					/>
				))}
			</div>

			{/* Quick Actions */}
			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="flex items-center gap-2 text-base font-semibold">
						<Settings className="h-4 w-4 text-gray-400" />
						Quick Actions
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4 pt-1">
					<div className="flex flex-wrap gap-2">
						{topQuickActions.map((action) => {
							const ActionIcon = action.icon;
							return (
								<Button
									key={action.id}
									variant="outline"
									size="sm"
									className="rounded-lg border-gray-200"
									onClick={() => navigate(action.path)}>
									<ActionIcon className="h-3.5 w-3.5" />
									<span>{action.label}</span>
								</Button>
							);
						})}
					</div>

					<div className="border-t border-gray-100 pt-3">
						<div className="mb-2 text-xs font-medium text-gray-500">More</div>
						<div className="grid gap-2 lg:grid-cols-3">
							{adminQuickActionSections.map((section) => {
								const SectionIcon = section.icon;
								return (
									<div
										key={section.id}
										className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
										<div className="mb-1.5 flex items-center gap-2 text-gray-700">
											<div className="rounded bg-white p-1">
												<SectionIcon className="h-3 w-3" />
											</div>
											<span className="text-sm font-medium">{section.label}</span>
											<span className="ml-auto text-[10px] text-gray-400">{section.items.length}</span>
										</div>
										<div className="flex flex-wrap gap-1">
											{section.items.map((action) => {
												const ActionIcon = action.icon;
												return (
													<button
														key={action.id}
														onClick={() => navigate(action.path)}
														className="flex items-center gap-1.5 rounded-md border bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50">
														<ActionIcon className="h-3 w-3 text-gray-400" />
														{action.label}
													</button>
												);
											})}
										</div>
									</div>
								);
							})}
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
