import { ChartCard, SummaryCard } from "~/components/atoms";
import { Users, Building2, Calendar, Heart } from "lucide-react";
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	PieChart,
	Pie,
	Cell,
	LineChart,
	Line,
} from "recharts";

export default function AnalyticsPage() {
	// Chart data
	const employeeGrowthData = [
		{ month: "Jan", employees: 1200 },
		{ month: "Feb", employees: 1250 },
		{ month: "Mar", employees: 1180 },
		{ month: "Apr", employees: 1300 },
		{ month: "May", employees: 1280 },
		{ month: "Jun", employees: 1234 },
	];

	const departmentData = [
		{ name: "Engineering", value: 450, color: "#3B82F6" },
		{ name: "Marketing", value: 200, color: "#10B981" },
		{ name: "Sales", value: 180, color: "#F59E0B" },
		{ name: "HR", value: 120, color: "#EF4444" },
		{ name: "Finance", value: 100, color: "#8B5CF6" },
		{ name: "Operations", value: 184, color: "#06B6D4" },
	];

	const leaveTrendData = [
		{ month: "Jan", requests: 45, approved: 40 },
		{ month: "Feb", requests: 52, approved: 48 },
		{ month: "Mar", requests: 38, approved: 35 },
		{ month: "Apr", requests: 60, approved: 55 },
		{ month: "May", requests: 42, approved: 38 },
		{ month: "Jun", requests: 35, approved: 32 },
	];

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
					<p className="text-gray-600">System analytics and performance metrics</p>
				</div>
			</div>

			{/* Analytics Cards */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
				<SummaryCard
					title="Total Employees"
					value="1,234"
					icon={Users}
					color="blue"
					change={{ value: "+12%", type: "positive", period: "last month" }}
				/>

				<SummaryCard
					title="Departments"
					value="12"
					icon={Building2}
					color="green"
					change={{ value: "+2", type: "positive", period: "this quarter" }}
				/>

				<SummaryCard
					title="Active Leave Requests"
					value="45"
					icon={Calendar}
					color="orange"
					change={{ value: "-8%", type: "negative", period: "last week" }}
				/>

				<SummaryCard
					title="Benefit Plans"
					value="8"
					icon={Heart}
					color="purple"
					description="All active"
				/>
			</div>

			{/* Charts */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<ChartCard title="Employee Growth" description="Monthly employee count trends">
					<ResponsiveContainer width="100%" height="100%">
						<BarChart data={employeeGrowthData}>
							<CartesianGrid strokeDasharray="3 3" />
							<XAxis dataKey="month" />
							<YAxis />
							<Tooltip />
							<Bar dataKey="employees" fill="#3B82F6" />
						</BarChart>
					</ResponsiveContainer>
				</ChartCard>

				<ChartCard
					title="Department Distribution"
					description="Employee distribution across departments">
					<ResponsiveContainer width="100%" height="100%">
						<PieChart>
							<Pie
								data={departmentData}
								cx="50%"
								cy="50%"
								labelLine={false}
								label={({ name, percent }) =>
									`${name} ${((percent as number) * 100).toFixed(0)}%`
								}
								outerRadius={80}
								fill="#8884d8"
								dataKey="value">
								{departmentData.map((entry, index) => (
									<Cell key={`cell-${index}`} fill={entry.color} />
								))}
							</Pie>
							<Tooltip />
						</PieChart>
					</ResponsiveContainer>
				</ChartCard>
			</div>

			{/* Additional Charts */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<ChartCard
					title="Leave Request Trends"
					description="Monthly leave requests vs approved trends">
					<ResponsiveContainer width="100%" height="100%">
						<LineChart data={leaveTrendData}>
							<CartesianGrid strokeDasharray="3 3" />
							<XAxis dataKey="month" />
							<YAxis />
							<Tooltip />
							<Line
								type="monotone"
								dataKey="requests"
								stroke="#EF4444"
								strokeWidth={2}
							/>
							<Line
								type="monotone"
								dataKey="approved"
								stroke="#10B981"
								strokeWidth={2}
							/>
						</LineChart>
					</ResponsiveContainer>
				</ChartCard>

				<ChartCard
					title="Monthly Performance"
					description="Employee performance metrics over time">
					<ResponsiveContainer width="100%" height="100%">
						<BarChart data={employeeGrowthData}>
							<CartesianGrid strokeDasharray="3 3" />
							<XAxis dataKey="month" />
							<YAxis />
							<Tooltip />
							<Bar dataKey="employees" fill="#10B981" />
						</BarChart>
					</ResponsiveContainer>
				</ChartCard>
			</div>
		</div>
	);
}
