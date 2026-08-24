import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { SummaryCard } from "~/components/atoms/SummaryCard";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { Badge } from "~/components/atoms/Badge";
import {
	MoreVertical,
	Eye,
	Edit,
	Trash2,
	ShieldCheck,
	AlertTriangle,
	Award,
	FileText,
} from "lucide-react";
import { useState, useEffect } from "react";

interface ComplianceItem {
	id: string;
	type: "Recognition" | "Policy" | "Disciplinary" | "Training" | "Audit";
	detail: string;
	employee?: string;
	date: string;
	status: "Active" | "Resolved" | "Pending" | "Completed";
	severity?: "Low" | "Medium" | "High" | "Critical";
}

export default function ComplianceTab() {
	const [openDropdowns, setOpenDropdowns] = useState<{ [key: string]: boolean }>({});

	const complianceItems: ComplianceItem[] = [
		{
			id: "1",
			type: "Recognition",
			detail: "Quarterly MVP Award",
			employee: "Emily Taylor",
			date: "2024-01-15",
			status: "Completed",
		},
		{
			id: "2",
			type: "Policy",
			detail: "Security policy refresher completed",
			employee: "All Employees",
			date: "2024-01-20",
			status: "Completed",
		},
		{
			id: "3",
			type: "Disciplinary",
			detail: "Warning issued for repeated lateness",
			employee: "John Smith",
			date: "2024-01-18",
			status: "Active",
			severity: "Medium",
		},
		{
			id: "4",
			type: "Training",
			detail: "Compliance training completion",
			employee: "Sarah Johnson",
			date: "2024-01-22",
			status: "Completed",
		},
		{
			id: "5",
			type: "Audit",
			detail: "Quarterly compliance audit",
			employee: "Audit Team",
			date: "2024-01-25",
			status: "Pending",
		},
		{
			id: "6",
			type: "Recognition",
			detail: "Employee of the Month",
			employee: "Michael Chen",
			date: "2024-01-28",
			status: "Completed",
		},
		{
			id: "7",
			type: "Policy",
			detail: "Code of conduct violation",
			employee: "Anonymous",
			date: "2024-01-30",
			status: "Pending",
			severity: "High",
		},
	];

	const filterOptions: FilterOption[] = [
		{
			key: "type",
			label: "Type",
			options: [
				{ value: "Recognition", label: "Recognition" },
				{ value: "Policy", label: "Policy" },
				{ value: "Disciplinary", label: "Disciplinary" },
				{ value: "Training", label: "Training" },
				{ value: "Audit", label: "Audit" },
			],
		},
		{
			key: "status",
			label: "Status",
			options: [
				{ value: "Active", label: "Active" },
				{ value: "Resolved", label: "Resolved" },
				{ value: "Pending", label: "Pending" },
				{ value: "Completed", label: "Completed" },
			],
		},
		{
			key: "severity",
			label: "Severity",
			options: [
				{ value: "Low", label: "Low" },
				{ value: "Medium", label: "Medium" },
				{ value: "High", label: "High" },
				{ value: "Critical", label: "Critical" },
			],
		},
	];

	const columns: Column<ComplianceItem>[] = [
		{
			key: "type",
			label: "Type",
			render: (value: string, item: ComplianceItem) => {
				const colorMap = {
					Recognition: "bg-green-100 text-green-800",
					Policy: "bg-blue-100 text-blue-800",
					Disciplinary: "bg-red-100 text-red-800",
					Training: "bg-purple-100 text-purple-800",
					Audit: "bg-yellow-100 text-yellow-800",
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
			key: "detail",
			label: "Detail",
			render: (value: string) => <p className="text-sm text-neutral-700 max-w-xs">{value}</p>,
		},
		{
			key: "employee",
			label: "Employee",
			render: (value?: string) => (
				<span className="text-sm text-neutral-900">{value || "N/A"}</span>
			),
		},
		{
			key: "status",
			label: "Status",
			render: (value: string) => {
				const colorMap = {
					Active: "bg-yellow-100 text-yellow-800",
					Resolved: "bg-green-100 text-green-800",
					Pending: "bg-blue-100 text-blue-800",
					Completed: "bg-emerald-100 text-emerald-800",
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
			key: "severity",
			label: "Severity",
			render: (value?: string) => {
				if (!value) return <span className="text-sm text-neutral-500">—</span>;
				const colorMap = {
					Low: "bg-green-100 text-green-800",
					Medium: "bg-yellow-100 text-yellow-800",
					High: "bg-orange-100 text-orange-800",
					Critical: "bg-red-100 text-red-800",
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

	const handleView = (item: ComplianceItem) => {
		console.log("View compliance item:", item);
	};

	const handleEdit = (item: ComplianceItem) => {
		console.log("Edit compliance item:", item);
	};

	const handleDelete = (item: ComplianceItem) => {
		console.log("Delete compliance item:", item);
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

	const renderActions = (item: ComplianceItem) => (
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
					title="Policy Adherence"
					value="96%"
					description="No violations this quarter"
					icon={ShieldCheck}
					trend={{
						direction: "up",
						value: "+2%",
					}}
					color="green"
				/>
				<SummaryCard
					title="Disciplinary Actions"
					value="2"
					description="Warnings issued YTD"
					icon={AlertTriangle}
					trend={{
						direction: "down",
						value: "-1",
					}}
					color="red"
				/>
				<SummaryCard
					title="Recognitions"
					value="14"
					description="Awards granted YTD"
					icon={Award}
					trend={{
						direction: "up",
						value: "+3",
					}}
					color="orange"
				/>
			</div>

			<DataTable<ComplianceItem>
				title="Compliance & Behavior"
				data={complianceItems}
				columns={columns}
				filters={filterOptions}
				searchFields={["detail", "employee", "type"]}
				renderActions={renderActions}
				onExportPDF={() => {
					console.log("Exporting compliance data to PDF");
				}}
				onExportExcel={() => {
					console.log("Exporting compliance data to Excel");
				}}
			/>
		</div>
	);
}
