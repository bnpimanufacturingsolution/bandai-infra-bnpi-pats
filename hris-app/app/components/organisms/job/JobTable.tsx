import { DataTable } from "~/components/atoms/DataTable";
import { Badge } from "~/components/atoms/Badge";
import type { Job } from "~/zod/job.zod";

interface JobTableProps {
	jobs: Job[];
	isLoading: boolean;
	onAdd: () => void;
	onView: (job: Job) => void;
	onEdit: (job: Job) => void;
	onDelete: (job: Job) => void;
}

export function JobTable({ jobs, isLoading, onAdd, onView, onEdit, onDelete }: JobTableProps) {
	const columns = [
		{
			key: "position",
			label: "Position",
			sortable: true,
			searchable: true,
			render: (value: any, item: Job) => (
				<div className="flex flex-col">
					<span className="font-medium text-gray-900">
						{item.position?.title || "N/A"}
					</span>
					{item.position?.description && (
						<span className="text-xs text-gray-500 truncate max-w-xs">
							{item.position.description}
						</span>
					)}
				</div>
			),
		},
		{
			key: "level",
			label: "Level",
			sortable: true,
			render: (value: any, item: Job) => (
				<Badge variant="outline">{item.level?.name || "N/A"}</Badge>
			),
		},
		{
			key: "type",
			label: "Type",
			sortable: true,
			render: (value: string | null) => (
				<span className="text-gray-700">{value || "N/A"}</span>
			),
		},
		{
			key: "location",
			label: "Location",
			sortable: true,
			render: (value: string | null) => (
				<span className="text-gray-700">{value || "N/A"}</span>
			),
		},
		{
			key: "tags",
			label: "Tags",
			sortable: false,
			render: (value: any[]) => (
				<div className="flex flex-wrap gap-1">
					{value && value.length > 0 ? (
						value.map((tag, index) => (
							<Badge
								key={index}
								variant={tag.variant || "default"}
								className="text-xs">
								{tag.label}
							</Badge>
						))
					) : (
						<span className="text-gray-500 text-sm">No tags</span>
					)}
				</div>
			),
		},
		{
			key: "createdAt",
			label: "Created",
			sortable: true,
			render: (value: Date | string) => (
				<span className="text-gray-700">{new Date(value).toLocaleDateString()}</span>
			),
		},
	];

	const filterOptions = [
		{
			key: "type",
			label: "Type",
			options: [
				{ value: "FULL_TIME", label: "Full Time" },
				{ value: "PART_TIME", label: "Part Time" },
				{ value: "CONTRACT", label: "Contract" },
				{ value: "INTERNSHIP", label: "Internship" },
			],
		},
		{
			key: "isDeleted",
			label: "Status",
			options: [
				{ value: "false", label: "Active" },
				{ value: "true", label: "Deleted" },
			],
		},
	];

	return (
		<DataTable
			title="Jobs"
			description="Create and manage job postings with positions and levels"
			data={jobs}
			columns={columns}
			searchFields={["position", "location", "type"]}
			filters={filterOptions}
			onAdd={onAdd}
			onView={onView}
			onEdit={onEdit}
			onDelete={onDelete}
			isLoading={isLoading}
			emptyMessage="No jobs found"
			emptyDescription="Get started by creating your first job posting"
			itemsPerPage={10}
			showSearch={true}
			showFilters={true}
			showPagination={true}
			showExport={false}
			addButtonLabel="Create Job"
			noCard={true}
		/>
	);
}
