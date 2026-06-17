import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { SummaryCard } from "~/components/atoms/SummaryCard";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { Badge } from "~/components/atoms/Badge";
import {
	MoreVertical,
	Eye,
	Edit,
	Trash2,
	GraduationCap,
	BookOpen,
	Award,
	Users,
} from "lucide-react";
import { useState, useEffect } from "react";

interface Training {
	id: string;
	course: string;
	status: number;
	mandatory: boolean;
	department: string;
	completionDate?: string;
	instructor: string;
}

interface Skill {
	id: string;
	label: string;
	value: number;
	category: "Technical" | "Soft Skills" | "Leadership";
	lastAssessed: string;
}

export default function DevelopmentTab() {
	const [openDropdowns, setOpenDropdowns] = useState<{ [key: string]: boolean }>({});

	const trainings: Training[] = [
		{
			id: "1",
			course: "Security Awareness",
			status: 100,
			mandatory: true,
			department: "All",
			completionDate: "2024-01-15",
			instructor: "IT Security Team",
		},
		{
			id: "2",
			course: "Advanced Excel",
			status: 60,
			mandatory: false,
			department: "Finance",
			instructor: "Sarah Johnson",
		},
		{
			id: "3",
			course: "Leadership 101",
			status: 35,
			mandatory: false,
			department: "Management",
			instructor: "Michael Chen",
		},
		{
			id: "4",
			course: "Project Management",
			status: 85,
			mandatory: false,
			department: "Engineering",
			completionDate: "2024-02-10",
			instructor: "Emily Taylor",
		},
		{
			id: "5",
			course: "Customer Service Excellence",
			status: 100,
			mandatory: true,
			department: "Support",
			completionDate: "2024-01-20",
			instructor: "Paula Martinez",
		},
	];

	const skills: Skill[] = [
		{
			id: "1",
			label: "Communication",
			value: 78,
			category: "Soft Skills",
			lastAssessed: "2024-01-15",
		},
		{
			id: "2",
			label: "Problem Solving",
			value: 84,
			category: "Soft Skills",
			lastAssessed: "2024-01-20",
		},
		{
			id: "3",
			label: "Domain Expertise",
			value: 69,
			category: "Technical",
			lastAssessed: "2024-01-10",
		},
		{
			id: "4",
			label: "Team Leadership",
			value: 72,
			category: "Leadership",
			lastAssessed: "2024-01-25",
		},
		{
			id: "5",
			label: "Technical Writing",
			value: 65,
			category: "Technical",
			lastAssessed: "2024-01-18",
		},
	];

	const trainingFilterOptions: FilterOption[] = [
		{
			key: "mandatory",
			label: "Type",
			options: [
				{ value: "true", label: "Mandatory" },
				{ value: "false", label: "Elective" },
			],
		},
		{
			key: "department",
			label: "Department",
			options: [
				{ value: "All", label: "All" },
				{ value: "Finance", label: "Finance" },
				{ value: "Management", label: "Management" },
				{ value: "Engineering", label: "Engineering" },
				{ value: "Support", label: "Support" },
			],
		},
	];

	const skillFilterOptions: FilterOption[] = [
		{
			key: "category",
			label: "Category",
			options: [
				{ value: "Technical", label: "Technical" },
				{ value: "Soft Skills", label: "Soft Skills" },
				{ value: "Leadership", label: "Leadership" },
			],
		},
	];

	const trainingColumns: Column<Training>[] = [
		{
			key: "course",
			label: "Course",
			render: (value: string, item: Training) => (
				<div>
					<p className="font-medium text-neutral-900">{value}</p>
					<p className="text-sm text-neutral-500">Instructor: {item.instructor}</p>
				</div>
			),
		},
		{
			key: "status",
			label: "Progress",
			render: (value: number) => (
				<div className="flex items-center gap-2">
					<Progress value={value} />
					<span className="text-sm text-neutral-600 w-10">{value}%</span>
				</div>
			),
		},
		{
			key: "mandatory",
			label: "Type",
			render: (value: boolean) => (
				<Badge className={value ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"}>
					{value ? "Mandatory" : "Elective"}
				</Badge>
			),
		},
		{
			key: "department",
			label: "Department",
			render: (value: string) => <span className="text-sm text-neutral-900">{value}</span>,
		},
		{
			key: "completionDate",
			label: "Completed",
			render: (value?: string) => (
				<span className="text-sm text-neutral-900">
					{value ? new Date(value).toLocaleDateString() : "In Progress"}
				</span>
			),
		},
	];

	const skillColumns: Column<Skill>[] = [
		{
			key: "label",
			label: "Skill",
			render: (value: string) => (
				<span className="font-medium text-neutral-900">{value}</span>
			),
		},
		{
			key: "value",
			label: "Score",
			render: (value: number) => (
				<div className="flex items-center gap-2">
					<Progress value={value} />
					<span className="text-sm text-neutral-600 w-10">{value}%</span>
				</div>
			),
		},
		{
			key: "category",
			label: "Category",
			render: (value: string) => {
				const colorMap = {
					Technical: "bg-blue-100 text-blue-800",
					"Soft Skills": "bg-green-100 text-green-800",
					Leadership: "bg-purple-100 text-purple-800",
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
			key: "lastAssessed",
			label: "Last Assessed",
			render: (value: string) => (
				<span className="text-sm text-neutral-900">
					{new Date(value).toLocaleDateString()}
				</span>
			),
		},
	];

	const handleView = (item: Training | Skill) => {
		console.log("View item:", item);
	};

	const handleEdit = (item: Training | Skill) => {
		console.log("Edit item:", item);
	};

	const handleDelete = (item: Training | Skill) => {
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

	const renderActions = (item: Training | Skill) => (
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
					title="Training Completion"
					value="65%"
					description="average across all courses"
					icon={GraduationCap}
					trend={{
						direction: "up",
						value: "+8%",
					}}
					color="blue"
				/>
				<SummaryCard
					title="Skills Assessment"
					value="73%"
					description="average skill score"
					icon={BookOpen}
					trend={{
						direction: "up",
						value: "+5%",
					}}
					color="green"
				/>
				<SummaryCard
					title="Certifications"
					value="12"
					description="completed this year"
					icon={Award}
					trend={{
						direction: "up",
						value: "+3",
					}}
					color="orange"
				/>
			</div>

			<DataTable<Training>
				title="Training Courses"
				data={trainings}
				columns={trainingColumns}
				filters={trainingFilterOptions}
				searchFields={["course", "instructor", "department"]}
				renderActions={renderActions}
				onExportPDF={() => {
					console.log("Exporting training data to PDF");
				}}
				onExportExcel={() => {
					console.log("Exporting training data to Excel");
				}}
			/>

			<DataTable<Skill>
				title="Skills Assessment"
				data={skills}
				columns={skillColumns}
				filters={skillFilterOptions}
				searchFields={["label", "category"]}
				renderActions={renderActions}
				onExportPDF={() => {
					console.log("Exporting skills data to PDF");
				}}
				onExportExcel={() => {
					console.log("Exporting skills data to Excel");
				}}
			/>
		</div>
	);
}

function Progress({ value }: { value: number }) {
	return (
		<div className="h-2 w-full rounded bg-neutral-200 overflow-hidden">
			<div
				className="h-full bg-sky-600"
				style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
			/>
		</div>
	);
}
