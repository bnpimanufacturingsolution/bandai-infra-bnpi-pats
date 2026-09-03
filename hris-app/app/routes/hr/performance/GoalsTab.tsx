import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { SummaryCard } from "~/components/atoms/SummaryCard";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { Badge } from "~/components/atoms/Badge";
import { MoreVertical, Eye, Edit, Trash2, Target, TrendingUp, Users } from "lucide-react";
import { useState, useEffect } from "react";

interface Goal {
	id: string;
	title: string;
	progress: number;
	owner: string;
	department: string;
	status: "On Track" | "At Risk" | "Behind" | "Completed";
	dueDate: string;
	priority: "High" | "Medium" | "Low";
}

interface TeamBenchmark {
	id: string;
	team: string;
	benchmark: number;
	current: number;
	status: "Above" | "At" | "Below";
}

export default function GoalsTab() {
	const [openDropdowns, setOpenDropdowns] = useState<{ [key: string]: boolean }>({});

	const goals: Goal[] = [
		{
			id: "1",
			title: "Improve NPS to 60",
			progress: 72,
			owner: "Emily Taylor",
			department: "Support",
			status: "On Track",
			dueDate: "2024-03-31",
			priority: "High",
		},
		{
			id: "2",
			title: "Reduce ticket backlog by 30%",
			progress: 58,
			owner: "Justin Martinez",
			department: "Engineering",
			status: "At Risk",
			dueDate: "2024-02-28",
			priority: "High",
		},
		{
			id: "3",
			title: "Deliver Q3 feature set",
			progress: 83,
			owner: "Paula Martinez",
			department: "Engineering",
			status: "On Track",
			dueDate: "2024-03-15",
			priority: "Medium",
		},
		{
			id: "4",
			title: "Increase customer satisfaction",
			progress: 91,
			owner: "Sarah Johnson",
			department: "Support",
			status: "Completed",
			dueDate: "2024-01-31",
			priority: "High",
		},
		{
			id: "5",
			title: "Launch new marketing campaign",
			progress: 45,
			owner: "Michael Chen",
			department: "Marketing",
			status: "Behind",
			dueDate: "2024-04-30",
			priority: "Medium",
		},
	];

	const teamBenchmarks: TeamBenchmark[] = [
		{ id: "1", team: "Sales", benchmark: 80, current: 76, status: "Below" },
		{ id: "2", team: "Support", benchmark: 85, current: 88, status: "Above" },
		{ id: "3", team: "Engineering", benchmark: 75, current: 73, status: "Below" },
		{ id: "4", team: "Marketing", benchmark: 70, current: 72, status: "Above" },
	];

	const goalFilterOptions: FilterOption[] = [
		{
			key: "status",
			label: "Status",
			options: [
				{ value: "On Track", label: "On Track" },
				{ value: "At Risk", label: "At Risk" },
				{ value: "Behind", label: "Behind" },
				{ value: "Completed", label: "Completed" },
			],
		},
		{
			key: "priority",
			label: "Priority",
			options: [
				{ value: "High", label: "High" },
				{ value: "Medium", label: "Medium" },
				{ value: "Low", label: "Low" },
			],
		},
		{
			key: "department",
			label: "Department",
			options: [
				{ value: "Engineering", label: "Engineering" },
				{ value: "Support", label: "Support" },
				{ value: "Marketing", label: "Marketing" },
			],
		},
	];

	const goalColumns: Column<Goal>[] = [
		{
			key: "title",
			label: "Goal",
			render: (value: string, item: Goal) => (
				<div>
					<p className="font-medium text-neutral-900">{value}</p>
					<p className="text-sm text-neutral-500">Owner: {item.owner}</p>
				</div>
			),
		},
		{
			key: "progress",
			label: "Progress",
			render: (value: number) => (
				<div className="flex items-center gap-2">
					<Progress value={value} />
					<span className="text-sm text-neutral-600 w-10">{value}%</span>
				</div>
			),
		},
		{
			key: "status",
			label: "Status",
			render: (value: string) => {
				const colorMap = {
					"On Track": "bg-emerald-100 text-emerald-800",
					"At Risk": "bg-yellow-100 text-yellow-800",
					Behind: "bg-red-100 text-red-800",
					Completed: "bg-blue-100 text-blue-800",
				};
				return (
					<Badge
						className={
							colorMap[value as keyof typeof colorMap] || "bg-gray-100 text-gray-800"
						}>
						{value}
					</Badge>
				);
			},
		},
		{
			key: "priority",
			label: "Priority",
			render: (value: string) => {
				const colorMap = {
					High: "bg-red-100 text-red-800",
					Medium: "bg-yellow-100 text-yellow-800",
					Low: "bg-green-100 text-green-800",
				};
				return (
					<Badge
						className={
							colorMap[value as keyof typeof colorMap] || "bg-gray-100 text-gray-800"
						}>
						{value}
					</Badge>
				);
			},
		},
		{
			key: "dueDate",
			label: "Due Date",
			render: (value: string) => (
				<span className="text-sm text-neutral-900">
					{new Date(value).toLocaleDateString()}
				</span>
			),
		},
	];

	const benchmarkColumns: Column<TeamBenchmark>[] = [
		{
			key: "team",
			label: "Team",
			render: (value: string) => (
				<span className="font-medium text-neutral-900">{value}</span>
			),
		},
		{
			key: "benchmark",
			label: "Benchmark",
			render: (value: number) => <span className="text-neutral-600">{value}%</span>,
		},
		{
			key: "current",
			label: "Current",
			render: (value: number) => (
				<span className="font-medium text-neutral-900">{value}%</span>
			),
		},
		{
			key: "status",
			label: "Status",
			render: (value: string) => {
				const colorMap = {
					Above: "bg-emerald-100 text-emerald-800",
					At: "bg-blue-100 text-blue-800",
					Below: "bg-red-100 text-red-800",
				};
				return (
					<Badge
						className={
							colorMap[value as keyof typeof colorMap] || "bg-gray-100 text-gray-800"
						}>
						{value}
					</Badge>
				);
			},
		},
	];

	const handleView = (item: Goal | TeamBenchmark) => {
		console.log("View item:", item);
	};

	const handleEdit = (item: Goal | TeamBenchmark) => {
		console.log("Edit item:", item);
	};

	const handleDelete = (item: Goal | TeamBenchmark) => {
		console.log("Delete item:", item);
	};

	const toggleDropdown = (id: string) => {
		setOpenDropdowns((prev) => ({
			...prev,
			[id]: !prev[id],
		}));
	};

	const closeDropdown = (id: string) => {
		setOpenDropdowns((prev) => ({
			...prev,
			[id]: false,
		}));
	};

	const closeAllDropdowns = () => {
		setOpenDropdowns({});
	};

	useEffect(() => {
		const handleClickOutside = () => {
			closeAllDropdowns();
		};

		document.addEventListener("click", handleClickOutside);
		return () => document.removeEventListener("click", handleClickOutside);
	}, []);

	const renderActions = (item: Goal | TeamBenchmark) => (
		<div className="relative">
			<button
				onClick={(e) => {
					e.stopPropagation();
					toggleDropdown(item.id);
				}}
				className="p-1 hover:bg-neutral-100 rounded">
				<MoreVertical className="w-4 h-4" />
			</button>
			{openDropdowns[item.id] && (
				<div className="absolute right-0 top-8 bg-white border border-neutral-200 rounded-md shadow-lg z-10 min-w-[120px]">
					<button
						onClick={() => {
							handleView(item);
							closeDropdown(item.id);
						}}
						className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 flex items-center gap-2">
						<Eye className="w-4 h-4" />
						View
					</button>
					<button
						onClick={() => {
							handleEdit(item);
							closeDropdown(item.id);
						}}
						className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 flex items-center gap-2">
						<Edit className="w-4 h-4" />
						Edit
					</button>
					<button
						onClick={() => {
							handleDelete(item);
							closeDropdown(item.id);
						}}
						className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 flex items-center gap-2 text-red-600">
						<Trash2 className="w-4 h-4" />
						Delete
					</button>
				</div>
			)}
		</div>
	);

	return (
		<div className="space-y-6">
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				<SummaryCard
					title="Goals On Track"
					value="3"
					description="out of 5 total goals"
					icon={Target}
					trend={{
						direction: "up",
						value: "+1",
					}}
					color="green"
				/>
				<SummaryCard
					title="Average Progress"
					value="70%"
					description="across all goals"
					icon={TrendingUp}
					trend={{
						direction: "up",
						value: "+5%",
					}}
					color="blue"
				/>
				<SummaryCard
					title="Teams Above Benchmark"
					value="2"
					description="out of 4 teams"
					icon={Users}
					trend={{
						direction: "neutral",
						value: "0",
					}}
					color="orange"
				/>
			</div>

			<DataTable<Goal>
				title="Goals & KPIs"
				data={goals}
				columns={goalColumns}
				filters={goalFilterOptions}
				searchFields={["title", "owner", "department"]}
				renderActions={renderActions}
				onExportPDF={() => {
					console.log("Exporting goals to PDF");
				}}
				onExportExcel={() => {
					console.log("Exporting goals to Excel");
				}}
			/>

			<DataTable<TeamBenchmark>
				title="Team Benchmarks"
				data={teamBenchmarks}
				columns={benchmarkColumns}
				filters={[]}
				searchFields={["team"]}
				renderActions={renderActions}
				onExportPDF={() => {
					console.log("Exporting team benchmarks to PDF");
				}}
				onExportExcel={() => {
					console.log("Exporting team benchmarks to Excel");
				}}
			/>
		</div>
	);
}

function Progress({ value }: { value: number }) {
	return (
		<div className="h-2 w-full rounded bg-neutral-200 overflow-hidden">
			<div
				className="h-full bg-emerald-600"
				style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
			/>
		</div>
	);
}
