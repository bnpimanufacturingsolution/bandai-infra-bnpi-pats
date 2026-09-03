import { SummaryCard } from "~/components/atoms/SummaryCard";
import { DataTable } from "~/components/atoms/DataTable";
import { useState, useEffect } from "react";
import {
	Briefcase,
	Clock,
	Users,
	MoreVertical,
	Eye,
	Edit,
	Trash2,
	Archive,
	Download,
} from "lucide-react";

export default function JobOpeningTab() {
	const [openDropdowns, setOpenDropdowns] = useState<{ [key: number]: boolean }>({});

	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			const target = event.target as Element;
			if (!target.closest("[data-dropdown]")) {
				setOpenDropdowns({});
			}
		}
		document.addEventListener("click", handleClickOutside);
		return () => {
			document.removeEventListener("click", handleClickOutside);
		};
	}, []);

	const jobOpenings = [
		{
			id: 1,
			title: "Senior Frontend Developer",
			department: "Engineering",
			location: "Remote",
			type: "Full-time",
			experience: "5-7 years",
			salary: 120000,
			postedDate: "2025-01-15",
			applicants: 47,
			status: "Active",
			description: "Lead frontend development for our next-generation web applications",
			requirements: "React, TypeScript, Node.js",
			hiringManager: "Sarah Cruz",
			priority: "High",
		},
		{
			id: 2,
			title: "Product Manager",
			department: "Product",
			location: "Makati",
			type: "Full-time",
			experience: "6-8 years",
			salary: 140000,
			postedDate: "2025-01-20",
			applicants: 32,
			status: "Active",
			description: "Drive product strategy and roadmap for our core platform",
			requirements: "Product Management, Agile, Analytics",
			hiringManager: "Miguel Tan",
			priority: "Critical",
		},
		{
			id: 3,
			title: "UX Designer",
			department: "Design",
			location: "BGC",
			type: "Full-time",
			experience: "3-5 years",
			salary: 85000,
			postedDate: "2025-01-18",
			applicants: 68,
			status: "Active",
			description: "Create intuitive and engaging user experiences",
			requirements: "Figma, Sketch, Prototyping",
			hiringManager: "Lisa Rodriguez",
			priority: "High",
		},
		{
			id: 4,
			title: "Sales Representative",
			department: "Sales",
			location: "Ortigas",
			type: "Full-time",
			experience: "2-4 years",
			salary: 65000,
			postedDate: "2025-01-22",
			applicants: 89,
			status: "Active",
			description: "Drive revenue growth through strategic client relationships",
			requirements: "Sales, CRM, Communication",
			hiringManager: "David Kim",
			priority: "Medium",
		},
		{
			id: 5,
			title: "DevOps Engineer",
			department: "Engineering",
			location: "Mandaluyong",
			type: "Full-time",
			experience: "4-6 years",
			salary: 110000,
			postedDate: "2025-01-16",
			applicants: 25,
			status: "Paused",
			description: "Build and maintain scalable infrastructure",
			requirements: "AWS, Docker, Kubernetes",
			hiringManager: "Amanda Wilson",
			priority: "High",
		},
		{
			id: 6,
			title: "Marketing Specialist",
			department: "Marketing",
			location: "Remote",
			type: "Full-time",
			experience: "3-5 years",
			salary: 70000,
			postedDate: "2025-01-25",
			applicants: 54,
			status: "Active",
			description: "Develop and execute digital marketing campaigns",
			requirements: "SEO, Google Ads, Analytics",
			hiringManager: "Roberto Brown",
			priority: "Medium",
		},
		{
			id: 7,
			title: "Data Scientist",
			department: "Analytics",
			location: "Alabang",
			type: "Full-time",
			experience: "5-7 years",
			salary: 130000,
			postedDate: "2025-01-12",
			applicants: 41,
			status: "Active",
			description: "Extract insights from complex datasets to drive business decisions",
			requirements: "Python, R, Machine Learning",
			hiringManager: "Jennifer Davis",
			priority: "Critical",
		},
		{
			id: 8,
			title: "HR Business Partner",
			department: "HR",
			location: "Quezon City",
			type: "Full-time",
			experience: "6-8 years",
			salary: 95000,
			postedDate: "2025-01-28",
			applicants: 38,
			status: "Active",
			description: "Support organizational development and employee relations",
			requirements: "HR Management, Employee Relations",
			hiringManager: "Christopher Lee",
			priority: "High",
		},
		{
			id: 9,
			title: "Customer Success Manager",
			department: "Customer Success",
			location: "Cebu City",
			type: "Full-time",
			experience: "4-6 years",
			salary: 80000,
			postedDate: "2025-01-14",
			applicants: 62,
			status: "Active",
			description: "Ensure customer satisfaction and drive retention",
			requirements: "Customer Service, Account Management",
			hiringManager: "Michelle Garcia",
			priority: "Medium",
		},
		{
			id: 10,
			title: "Financial Analyst",
			department: "Finance",
			location: "Davao City",
			type: "Full-time",
			experience: "3-5 years",
			salary: 75000,
			postedDate: "2025-01-19",
			applicants: 33,
			status: "Active",
			description: "Analyze financial data and support strategic planning",
			requirements: "Excel, Financial Modeling, Analysis",
			hiringManager: "Kevin Anderson",
			priority: "Medium",
		},
		{
			id: 11,
			title: "Content Writer",
			department: "Marketing",
			location: "Remote",
			type: "Part-time",
			experience: "2-4 years",
			salary: 45000,
			postedDate: "2025-01-26",
			applicants: 76,
			status: "Active",
			description: "Create compelling content for our marketing channels",
			requirements: "Writing, SEO, Content Strategy",
			hiringManager: "Rachel Thompson",
			priority: "Low",
		},
		{
			id: 12,
			title: "Security Engineer",
			department: "Engineering",
			location: "Remote",
			type: "Full-time",
			experience: "5-7 years",
			salary: 125000,
			postedDate: "2025-01-17",
			applicants: 19,
			status: "Active",
			description: "Protect our systems and data from security threats",
			requirements: "Cybersecurity, Network Security, Compliance",
			hiringManager: "Daniel White",
			priority: "Critical",
		},
		{
			id: 13,
			title: "Business Analyst",
			department: "Analytics",
			location: "Iloilo City",
			type: "Full-time",
			experience: "3-5 years",
			salary: 78000,
			postedDate: "2025-01-21",
			applicants: 45,
			status: "Active",
			description: "Bridge the gap between business needs and technical solutions",
			requirements: "Business Analysis, Requirements Gathering",
			hiringManager: "Nicole Taylor",
			priority: "Medium",
		},
		{
			id: 14,
			title: "Legal Counsel",
			department: "Legal",
			location: "Makati",
			type: "Full-time",
			experience: "7-10 years",
			salary: 150000,
			postedDate: "2025-01-13",
			applicants: 28,
			status: "Active",
			description: "Provide legal guidance and support for business operations",
			requirements: "Law Degree, Corporate Law, Contract Law",
			hiringManager: "James Miller",
			priority: "High",
		},
		{
			id: 15,
			title: "Operations Manager",
			department: "Operations",
			location: "Baguio City",
			type: "Full-time",
			experience: "6-8 years",
			salary: 90000,
			postedDate: "2025-01-24",
			applicants: 37,
			status: "Active",
			description: "Optimize business processes and operational efficiency",
			requirements: "Operations Management, Process Improvement",
			hiringManager: "Stephanie Clark",
			priority: "High",
		},
		{
			id: 16,
			title: "Mobile Developer",
			department: "Engineering",
			location: "Remote",
			type: "Full-time",
			experience: "4-6 years",
			salary: 105000,
			postedDate: "2025-01-23",
			applicants: 52,
			status: "Active",
			description: "Develop native mobile applications for iOS and Android",
			requirements: "React Native, Swift, Kotlin",
			hiringManager: "Matthew Lewis",
			priority: "High",
		},
		{
			id: 17,
			title: "Sales Manager",
			department: "Sales",
			location: "Cebu City",
			type: "Full-time",
			experience: "7-10 years",
			salary: 115000,
			postedDate: "2025-01-11",
			applicants: 31,
			status: "Active",
			description: "Lead and manage the sales team to achieve targets",
			requirements: "Sales Management, Team Leadership",
			hiringManager: "Ashley Walker",
			priority: "Critical",
		},
		{
			id: 18,
			title: "Quality Assurance Engineer",
			department: "Engineering",
			location: "Remote",
			type: "Full-time",
			experience: "3-5 years",
			salary: 85000,
			postedDate: "2025-01-27",
			applicants: 43,
			status: "Active",
			description: "Ensure product quality through comprehensive testing",
			requirements: "Testing, Automation, Quality Assurance",
			hiringManager: "Ryan Hall",
			priority: "Medium",
		},
		{
			id: 19,
			title: "Recruiter",
			department: "HR",
			location: "Remote",
			type: "Full-time",
			experience: "3-5 years",
			salary: 70000,
			postedDate: "2025-01-29",
			applicants: 29,
			status: "Active",
			description: "Source and attract top talent for our growing team",
			requirements: "Recruitment, Sourcing, Interviewing",
			hiringManager: "Jessica Young",
			priority: "High",
		},
		{
			id: 20,
			title: "Technical Writer",
			department: "Engineering",
			location: "Remote",
			type: "Contract",
			experience: "2-4 years",
			salary: 60000,
			postedDate: "2025-01-30",
			applicants: 24,
			status: "Active",
			description: "Create clear and comprehensive technical documentation",
			requirements: "Technical Writing, Documentation",
			hiringManager: "Brandon Allen",
			priority: "Low",
		},
	];

	const departments = ["all", ...Array.from(new Set(jobOpenings.map((job) => job.department)))];
	const locations = ["all", ...Array.from(new Set(jobOpenings.map((job) => job.location)))];
	const statuses = ["all", ...Array.from(new Set(jobOpenings.map((job) => job.status)))];

	const handleView = (item: any) => {
		console.log("View job opening:", item);
	};
	const handleEdit = (item: any) => {
		console.log("Edit job opening:", item);
	};
	const handleDelete = (item: any) => {
		console.log("Delete job opening:", item);
	};
	const handleArchive = (item: any) => {
		console.log("Archive job opening:", item);
	};
	const handleDownload = (item: any) => {
		console.log("Download job opening:", item);
	};
	const handleAdd = () => {
		console.log("Add new job opening");
	};

	const jobColumns = [
		{ key: "title", label: "Job Title", width: "300px" },
		{ key: "department", label: "Department", width: "150px" },
		{ key: "location", label: "Location", width: "150px" },
		{ key: "salary", label: "Salary", width: "120px" },
		{ key: "applicants", label: "Applicants", width: "120px" },
		{ key: "status", label: "Status", width: "120px" },
		{ key: "postedDate", label: "Posted", width: "150px" },
	];

	const filterOptions = [
		{
			key: "department",
			label: "Department",
			options: departments
				.filter((dept) => dept !== "all")
				.map((dept) => ({ value: dept, label: dept })),
		},
		{
			key: "location",
			label: "Location",
			options: locations
				.filter((loc) => loc !== "all")
				.map((loc) => ({ value: loc, label: loc })),
		},
		{
			key: "status",
			label: "Status",
			options: statuses
				.filter((status) => status !== "all")
				.map((status) => ({ value: status, label: status })),
		},
	];

	return (
		<div className="space-y-6">
			{/* Summary Cards */}
			<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
				<SummaryCard
					title="Total Openings"
					value={jobOpenings.length.toString()}
					icon={Briefcase}
					variant="blue"
				/>
				<SummaryCard
					title="Active Jobs"
					value={jobOpenings.filter((job) => job.status === "Active").length.toString()}
					icon={Eye}
					variant="green"
				/>
				<SummaryCard
					title="Total Applicants"
					value={jobOpenings.reduce((sum, job) => sum + job.applicants, 0).toString()}
					icon={Users}
					variant="purple"
				/>
				<SummaryCard
					title="Critical Roles"
					value={jobOpenings
						.filter((job) => job.priority === "Critical")
						.length.toString()}
					icon={Clock}
					variant="orange"
				/>
			</div>

			{/* DataTable */}
			<DataTable
				data={jobOpenings}
				columns={jobColumns}
				title="Job Openings"
				description="Manage and track all job openings and applications"
				searchFields={[
					"title",
					"department",
					"location",
					"status",
					"type",
					"experience",
					"hiringManager",
				]}
				filters={filterOptions}
				onView={handleView}
				onEdit={handleEdit}
				onDelete={handleDelete}
				onAdd={handleAdd}
				onExportPDF={() => console.log("Export PDF")}
				onExportExcel={() => console.log("Export Excel")}
				itemsPerPage={8}
				renderActions={(item) => (
					<div className="relative" data-dropdown>
						<button
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								setOpenDropdowns((prev) => ({
									...prev,
									[item.id]: !prev[item.id],
								}));
							}}
							className="p-1 hover:bg-gray-100 rounded">
							<MoreVertical className="w-4 h-4 text-gray-400" />
						</button>
						{openDropdowns[item.id] && (
							<div
								className="absolute right-0 top-full mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-[9999]"
								style={{ zIndex: 9999 }}>
								<button
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										handleView(item);
										setOpenDropdowns({});
									}}
									className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
									<Eye className="w-4 h-4 mr-2" />
									View
								</button>
								<button
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										handleEdit(item);
										setOpenDropdowns({});
									}}
									className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
									<Edit className="w-4 h-4 mr-2" />
									Edit
								</button>
								<button
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										handleArchive(item);
										setOpenDropdowns({});
									}}
									className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
									<Archive className="w-4 h-4 mr-2" />
									Archive
								</button>
								<button
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										handleDownload(item);
										setOpenDropdowns({});
									}}
									className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
									<Download className="w-4 h-4 mr-2" />
									Download
								</button>
								<button
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										handleDelete(item);
										setOpenDropdowns({});
									}}
									className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50">
									<Trash2 className="w-4 h-4 mr-2" />
									Delete
								</button>
							</div>
						)}
					</div>
				)}
			/>
		</div>
	);
}
