import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { SummaryCard } from "~/components/atoms/SummaryCard";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { Badge } from "~/components/atoms/Badge";
import {
	MoreVertical,
	Eye,
	Edit,
	Trash2,
	MessageSquareMore,
	Star,
	Users,
	TrendingUp,
} from "lucide-react";
import { useState, useEffect } from "react";

interface Review {
	id: string;
	name: string;
	summary: string;
	score: number;
	reviewer: string;
	date: string;
	type: "360° Feedback" | "Manager Review" | "Peer Review" | "Self Assessment";
	status: "Completed" | "In Progress" | "Pending";
}

export default function FeedbackTab() {
	const [openDropdowns, setOpenDropdowns] = useState<{ [key: string]: boolean }>({});

	const metrics = [
		{ label: "360° Feedback", value: 4.3, suffix: "/5" },
		{ label: "Manager Reviews", value: 4.1, suffix: "/5" },
		{ label: "Peer Reviews", value: 4.2, suffix: "/5" },
		{ label: "Engagement", value: 76, suffix: "%" },
	];

	const reviews: Review[] = [
		{
			id: "1",
			name: "Emily Taylor",
			summary: "Strong collaboration and delivery this quarter.",
			score: 4.6,
			reviewer: "Sarah Johnson",
			date: "2024-01-15",
			type: "360° Feedback",
			status: "Completed",
		},
		{
			id: "2",
			name: "Justin Martinez",
			summary: "Improved ownership on complex tickets.",
			score: 4.3,
			reviewer: "Michael Chen",
			date: "2024-01-20",
			type: "Manager Review",
			status: "Completed",
		},
		{
			id: "3",
			name: "Paula Martinez",
			summary: "Consistent mentor feedback; room for goal alignment.",
			score: 4.1,
			reviewer: "Emily Taylor",
			date: "2024-01-18",
			type: "Peer Review",
			status: "Completed",
		},
		{
			id: "4",
			name: "Sarah Johnson",
			summary: "Excellent technical skills and team leadership.",
			score: 4.8,
			reviewer: "Justin Martinez",
			date: "2024-01-25",
			type: "360° Feedback",
			status: "Completed",
		},
		{
			id: "5",
			name: "Michael Chen",
			summary: "Strong analytical thinking and problem-solving.",
			score: 4.4,
			reviewer: "Paula Martinez",
			date: "2024-01-22",
			type: "Manager Review",
			status: "In Progress",
		},
	];

	const filterOptions: FilterOption[] = [
		{
			key: "type",
			label: "Type",
			options: [
				{ value: "360° Feedback", label: "360° Feedback" },
				{ value: "Manager Review", label: "Manager Review" },
				{ value: "Peer Review", label: "Peer Review" },
				{ value: "Self Assessment", label: "Self Assessment" },
			],
		},
		{
			key: "status",
			label: "Status",
			options: [
				{ value: "Completed", label: "Completed" },
				{ value: "In Progress", label: "In Progress" },
				{ value: "Pending", label: "Pending" },
			],
		},
	];

	const columns: Column<Review>[] = [
		{
			key: "name",
			label: "Employee",
			render: (value: string, item: Review) => (
				<div>
					<p className="font-medium text-neutral-900">{value}</p>
					<p className="text-sm text-neutral-500">Reviewed by: {item.reviewer}</p>
				</div>
			),
		},
		{
			key: "summary",
			label: "Summary",
			render: (value: string) => (
				<p className="text-sm text-neutral-700 max-w-xs truncate">{value}</p>
			),
		},
		{
			key: "score",
			label: "Score",
			render: (value: number) => (
				<div className="flex items-center gap-1">
					<Star className="w-4 h-4 text-yellow-500 fill-current" />
					<span className="font-medium text-neutral-900">{value}/5</span>
				</div>
			),
		},
		{
			key: "type",
			label: "Type",
			render: (value: string) => {
				const colorMap = {
					"360° Feedback": "bg-purple-100 text-purple-800",
					"Manager Review": "bg-blue-100 text-blue-800",
					"Peer Review": "bg-green-100 text-green-800",
					"Self Assessment": "bg-yellow-100 text-yellow-800",
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
			key: "status",
			label: "Status",
			render: (value: string) => {
				const colorMap = {
					Completed: "bg-emerald-100 text-emerald-800",
					"In Progress": "bg-yellow-100 text-yellow-800",
					Pending: "bg-gray-100 text-gray-800",
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
			key: "date",
			label: "Date",
			render: (value: string) => (
				<span className="text-sm text-neutral-900">
					{new Date(value).toLocaleDateString()}
				</span>
			),
		},
	];

	const handleView = (item: Review) => {
		console.log("View review:", item);
	};

	const handleEdit = (item: Review) => {
		console.log("Edit review:", item);
	};

	const handleDelete = (item: Review) => {
		console.log("Delete review:", item);
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

	const renderActions = (item: Review) => (
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
			<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
				{metrics.map((m) => (
					<SummaryCard
						key={m.label}
						title={m.label}
						value={`${m.value}${m.suffix}`}
						description="average rating"
						icon={MessageSquareMore}
						trend={{
							direction: "up",
							value: "+0.2",
						}}
						color="orange"
					/>
				))}
			</div>

			<DataTable<Review>
				title="Performance Reviews"
				data={reviews}
				columns={columns}
				filters={filterOptions}
				searchFields={["name", "reviewer", "summary"]}
				renderActions={renderActions}
				onExportPDF={() => {
					console.log("Exporting feedback data to PDF");
				}}
				onExportExcel={() => {
					console.log("Exporting feedback data to Excel");
				}}
			/>
		</div>
	);
}
