import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { SummaryCard } from "~/components/atoms/SummaryCard";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { Badge } from "~/components/atoms/Badge";
import { MoreVertical, Eye, Edit, Trash2, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";

interface ProductivityMetric {
	id: string;
	metric: string;
	lastWeek: number | string;
	thisWeek: number;
	status: "Improved" | "Stable" | "Declined";
	trend: "up" | "down" | "stable";
}

export default function ProductivityTab() {
	const [openDropdowns, setOpenDropdowns] = useState<{ [key: string]: boolean }>({});

	const tasks = [
		{ name: "Tasks Completed", done: 132, total: 160 },
		{ name: "Projects Delivered", done: 9, total: 12 },
		{ name: "Quality Score", done: 91, total: 100 },
	];

	const productivityMetrics: ProductivityMetric[] = [
		{
			id: "1",
			metric: "Tickets Resolved",
			lastWeek: 234,
			thisWeek: 246,
			status: "Improved",
			trend: "up",
		},
		{
			id: "2",
			metric: "Bugs Closed",
			lastWeek: 68,
			thisWeek: 71,
			status: "Improved",
			trend: "up",
		},
		{
			id: "3",
			metric: "PRs Merged",
			lastWeek: 58,
			thisWeek: 54,
			status: "Declined",
			trend: "down",
		},
		{
			id: "4",
			metric: "Code Reviews",
			lastWeek: 89,
			thisWeek: 92,
			status: "Improved",
			trend: "up",
		},
		{
			id: "5",
			metric: "Documentation Updates",
			lastWeek: 12,
			thisWeek: 15,
			status: "Improved",
			trend: "up",
		},
	];

	const filterOptions: FilterOption[] = [
		{
			key: "status",
			label: "Status",
			options: [
				{ value: "Improved", label: "Improved" },
				{ value: "Stable", label: "Stable" },
				{ value: "Declined", label: "Declined" },
			],
		},
	];

	const columns: Column<ProductivityMetric>[] = [
		{
			key: "metric",
			label: "Metric",
			render: (value: string) => (
				<span className="font-medium text-neutral-900">{value}</span>
			),
		},
		{
			key: "lastWeek",
			label: "Last Week",
			render: (value: number | string) => (
				<span className="text-neutral-600">{value === 0 ? "—" : value}</span>
			),
		},
		{
			key: "thisWeek",
			label: "This Week",
			render: (value: number) => (
				<span className="font-medium text-neutral-900">{value}</span>
			),
		},
		{
			key: "status",
			label: "Status",
			render: (value: string, item: ProductivityMetric) => {
				const colorMap = {
					Improved: "bg-emerald-100 text-emerald-800",
					Stable: "bg-blue-100 text-blue-800",
					Declined: "bg-red-100 text-red-800",
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

	const handleView = (item: ProductivityMetric) => {
		console.log("View metric:", item);
	};

	const handleEdit = (item: ProductivityMetric) => {
		console.log("Edit metric:", item);
	};

	const handleDelete = (item: ProductivityMetric) => {
		console.log("Delete metric:", item);
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

	const renderActions = (item: ProductivityMetric) => (
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
				{tasks.map((m) => (
					<SummaryCard
						key={m.name}
						title={m.name}
						value={`${Math.round((m.done / m.total) * 100)}%`}
						description={`${m.done} of ${m.total}`}
						icon={
							m.name === "Tasks Completed"
								? CheckCircle
								: m.name === "Projects Delivered"
									? Clock
									: AlertCircle
						}
						trend={{
							direction: "up",
							value: "+5%",
						}}
						color={
							m.name === "Tasks Completed"
								? "green"
								: m.name === "Projects Delivered"
									? "blue"
									: "orange"
						}
					/>
				))}
			</div>

			<DataTable<ProductivityMetric>
				title="Productivity Metrics"
				data={productivityMetrics}
				columns={columns}
				filters={filterOptions}
				searchFields={["metric"]}
				renderActions={renderActions}
				onExportPDF={() => {
					console.log("Exporting productivity metrics to PDF");
				}}
				onExportExcel={() => {
					console.log("Exporting productivity metrics to Excel");
				}}
			/>
		</div>
	);
}
