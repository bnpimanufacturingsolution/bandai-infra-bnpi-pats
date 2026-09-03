import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { SummaryCard } from "~/components/atoms/SummaryCard";
import { ChartCard } from "~/components/atoms/ChartCard";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { Badge } from "~/components/atoms/Badge";
import {
	BarChart2,
	Target,
	GraduationCap,
	MessageSquareMore,
	Award,
	TrendingUp,
	MoreVertical,
	Eye,
	Edit,
	Trash2,
} from "lucide-react";
import { useState, useEffect } from "react";

interface TopPerformer {
	id: string;
	name: string;
	kpi: number;
	goals: number;
	feedback: number;
	department: string;
	status: "Excellent" | "Good" | "Average" | "Needs Improvement";
}

export default function OverviewTab() {
	const [openDropdowns, setOpenDropdowns] = useState<{ [key: string]: boolean }>({});

	const attendancePct = 92;
	const goalsPct = 68;
	const trainingPct = 54;
	const feedbackScore = 4.2;

	const topPerformers: TopPerformer[] = [
		{
			id: "1",
			name: "Emily Taylor",
			kpi: 92,
			goals: 88,
			feedback: 4.7,
			department: "Engineering",
			status: "Excellent",
		},
		{
			id: "2",
			name: "Justin Martinez",
			kpi: 89,
			goals: 82,
			feedback: 4.5,
			department: "Sales",
			status: "Excellent",
		},
		{
			id: "3",
			name: "Paula Martinez",
			kpi: 87,
			goals: 79,
			feedback: 4.4,
			department: "Support",
			status: "Good",
		},
		{
			id: "4",
			name: "Sarah Johnson",
			kpi: 85,
			goals: 76,
			feedback: 4.2,
			department: "Marketing",
			status: "Good",
		},
		{
			id: "5",
			name: "Michael Chen",
			kpi: 82,
			goals: 74,
			feedback: 4.1,
			department: "Engineering",
			status: "Good",
		},
	];

	const filterOptions: FilterOption[] = [
		{
			key: "status",
			label: "Status",
			options: [
				{ value: "Excellent", label: "Excellent" },
				{ value: "Good", label: "Good" },
				{ value: "Average", label: "Average" },
				{ value: "Needs Improvement", label: "Needs Improvement" },
			],
		},
		{
			key: "department",
			label: "Department",
			options: [
				{ value: "Engineering", label: "Engineering" },
				{ value: "Sales", label: "Sales" },
				{ value: "Support", label: "Support" },
				{ value: "Marketing", label: "Marketing" },
			],
		},
	];

	const columns: Column<TopPerformer>[] = [
		{
			key: "name",
			label: "Employee",
			render: (value: string, item: TopPerformer) => (
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 bg-violet-100 rounded-full flex items-center justify-center">
						<span className="text-sm font-medium text-violet-700">
							{value
								.split(" ")
								.map((n: string) => n[0])
								.join("")}
						</span>
					</div>
					<div>
						<p className="font-medium text-neutral-900">{value}</p>
						<p className="text-sm text-neutral-500">{item.department}</p>
					</div>
				</div>
			),
		},
		{
			key: "kpi",
			label: "KPI Score",
			render: (value: number) => (
				<div className="flex items-center gap-2">
					<ProgressBar value={value} color="bg-violet-600" />
					<span className="text-sm text-neutral-600 w-10">{value}%</span>
				</div>
			),
		},
		{
			key: "goals",
			label: "Goals",
			render: (value: number) => (
				<div className="flex items-center gap-2">
					<ProgressBar value={value} color="bg-emerald-600" />
					<span className="text-sm text-neutral-600 w-10">{value}%</span>
				</div>
			),
		},
		{
			key: "feedback",
			label: "Feedback",
			render: (value: number) => (
				<span className="text-sm text-neutral-900">{value.toFixed(1)}/5</span>
			),
		},
		{
			key: "status",
			label: "Status",
			render: (value: string) => {
				const colorMap = {
					Excellent: "bg-emerald-100 text-emerald-800",
					Good: "bg-blue-100 text-blue-800",
					Average: "bg-yellow-100 text-yellow-800",
					"Needs Improvement": "bg-red-100 text-red-800",
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

	const handleView = (item: TopPerformer) => {
		console.log("View performer:", item);
	};

	const handleEdit = (item: TopPerformer) => {
		console.log("Edit performer:", item);
	};

	const handleDelete = (item: TopPerformer) => {
		console.log("Delete performer:", item);
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

	const renderActions = (item: TopPerformer) => (
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
			<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
				<SummaryCard
					title="Attendance & Leave"
					value={`${attendancePct}%`}
					description="Days present this month"
					icon={BarChart2}
					trend={{
						direction: "up",
						value: "+5%",
					}}
					color="purple"
					className="relative">
					<div className="mt-2 grid grid-cols-3 text-xs text-neutral-600">
						<span>Late: 3</span>
						<span>Early leave: 1</span>
						<span>Overtime: 12h</span>
					</div>
				</SummaryCard>

				<SummaryCard
					title="Goal Achievement"
					value={`${goalsPct}%`}
					description="Avg. OKR/KPI completion"
					icon={Target}
					trend={{
						direction: "up",
						value: "+12%",
					}}
					color="green"
				/>

				<SummaryCard
					title="Training Completion"
					value={`${trainingPct}%`}
					description="Mandatory courses completed"
					icon={GraduationCap}
					trend={{
						direction: "down",
						value: "-3%",
					}}
					color="blue"
				/>

				<SummaryCard
					title="Feedback Trends"
					value={`${feedbackScore.toFixed(1)}/5`}
					description="Avg. review rating (last quarter)"
					icon={MessageSquareMore}
					trend={{
						direction: "up",
						value: "+0.2",
					}}
					color="orange"
				/>
			</div>

			<div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
				<div className="xl:col-span-2">
					<DataTable<TopPerformer>
						title="Top Performers"
						data={topPerformers}
						columns={columns}
						filters={filterOptions}
						searchFields={["name", "department"]}
						renderActions={renderActions}
						onExportPDF={() => {
							console.log("Exporting top performers to PDF");
						}}
						onExportExcel={() => {
							console.log("Exporting top performers to Excel");
						}}
					/>
				</div>

				<ChartCard title="Feedback Trends">
					<div className="space-y-3">
						{[
							{ label: "Engagement", value: 74, color: "bg-amber-600" },
							{ label: "Manager Rating", value: 81, color: "bg-amber-600" },
							{ label: "Peer Rating", value: 79, color: "bg-amber-600" },
						].map((item) => (
							<div key={item.label}>
								<div className="flex items-center justify-between text-sm">
									<span className="text-neutral-700">{item.label}</span>
									<span className="text-neutral-500">{item.value}%</span>
								</div>
								<ProgressBar value={item.value} color={item.color} />
							</div>
						))}
					</div>
				</ChartCard>
			</div>
		</div>
	);
}

function ProgressBar({ value, color }: { value: number; color: string }) {
	return (
		<div className="h-2 w-full rounded bg-neutral-200 overflow-hidden">
			<div
				className={`h-full ${color}`}
				style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
			/>
		</div>
	);
}
