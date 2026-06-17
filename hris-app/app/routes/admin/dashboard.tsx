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
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
					<p className="text-gray-600">Welcome to the administrative control panel</p>
				</div>
				<div className="flex items-center gap-2">
					<Badge variant="outline">System Admin</Badge>
					<Badge variant="success">Online</Badge>
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
				<CardHeader className="gap-2">
					<CardTitle className="flex items-center gap-2 text-lg">
						<Settings className="h-5 w-5" />
						Quick Actions
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-5">
					<div className="flex flex-wrap gap-2.5">
						{topQuickActions.map((action) => {
							const ActionIcon = action.icon;
							return (
								<Button
									key={action.id}
									variant="outline"
									className="h-11 rounded-xl border-gray-200 bg-white px-3.5 text-sm text-gray-700 shadow-sm hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
									onClick={() => navigate(action.path)}>
									<ActionIcon className="h-4 w-4" />
									<span>{action.label}</span>
								</Button>
							);
						})}
					</div>

					<div className="border-t border-gray-100 pt-4">
						<div className="mb-3 flex items-center justify-between gap-3">
							<div>
								<h3 className="text-sm font-semibold text-gray-900">
									More Shortcuts
								</h3>
							</div>
						</div>

						<div className="grid gap-3 lg:grid-cols-3">
							{adminQuickActionSections.map((section) => {
								const SectionIcon = section.icon;
								return (
									<div
										key={section.id}
										className="rounded-xl border border-gray-200 bg-gray-50/70 p-3.5">
										<div className="mb-2.5 flex items-start justify-between gap-3">
											<div className="min-w-0">
												<div className="flex items-center gap-2 text-gray-900">
													<div className="rounded-lg bg-orange-100 p-1.5 text-orange-600">
														<SectionIcon className="h-3.5 w-3.5" />
													</div>
													<h3 className="text-sm font-semibold">
														{section.label}
													</h3>
												</div>
											</div>
											<Badge
												variant="outline"
												className="shrink-0 border-orange-200 bg-white px-2 py-0.5 text-[11px] text-orange-700">
												{section.items.length}
											</Badge>
										</div>

										<div className="space-y-1.5">
											{section.items.map((action) => {
												const ActionIcon = action.icon;
												return (
													<Button
														key={action.id}
														variant="ghost"
														className="h-auto w-full justify-between rounded-lg border border-transparent bg-white px-2.5 py-2 text-left text-gray-700 shadow-sm hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
														onClick={() => navigate(action.path)}>
														<span className="flex min-w-0 items-center gap-3">
															<span className="rounded-md bg-gray-100 p-1.5 text-gray-600">
																<ActionIcon className="h-3 w-3" />
															</span>
															<span className="truncate text-[13px] font-medium">
																{action.label}
															</span>
														</span>
														<ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
													</Button>
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
