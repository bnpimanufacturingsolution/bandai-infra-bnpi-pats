import { DataTable } from "~/components/atoms/DataTable";
import { Badge } from "~/components/atoms/Badge";
import type { BoardingTemplate } from "~/zod/boarding-template";

interface BoardingTemplateTableProps {
	templates: BoardingTemplate[];
	isLoading: boolean;
	onAdd: () => void;
	onView: (template: BoardingTemplate) => void;
	onEdit: (template: BoardingTemplate) => void;
	onDelete: (template: BoardingTemplate) => void;
}

export function BoardingTemplateTable({
	templates,
	isLoading,
	onAdd,
	onView,
	onEdit,
	onDelete,
}: BoardingTemplateTableProps) {
	const columns = [
		{
			key: "name",
			label: "Template Name",
			sortable: true,
			searchable: true,
			render: (value: string, item: BoardingTemplate) => (
				<div className="flex flex-col">
					<span className="font-medium text-gray-900">{value}</span>
				</div>
			),
		},
		{
			key: "type",
			label: "Type",
			sortable: true,
			render: (value: string) => <span className="text-xs">{value}</span>,
		},
		{
			key: "role",
			label: "Target Role",
			sortable: true,
			render: (value: string, item: BoardingTemplate) => {
				const roleMap: Record<string, string> = {
					"hris-employee": "Employee",
					"hris-employee-manager": "Employee Manager",
					"hris-hr-user": "HR User",
					"hris-hr-manager": "HR Manager",
				};
				return (
					<Badge variant="outline" className="capitalize">
						{roleMap[value] || value || "Not Applicable"}
					</Badge>
				);
			},
		},
		{
			key: "isDefault",
			label: "Default",
			sortable: true,
			render: (value: boolean) =>
				value ? (
					<Badge variant="secondary">Default</Badge>
				) : (
					<span className="text-gray-400">-</span>
				),
		},
		{
			key: "isActive",
			label: "Status",
			sortable: true,
			render: (value: boolean) => (
				<Badge variant={value ? "success" : "destructive"}>
					{value ? "Active" : "Inactive"}
				</Badge>
			),
		},
		{
			key: "createdAt",
			label: "Created",
			sortable: true,
			render: (value: Date) => (
				<span className="text-gray-700">{new Date(value).toLocaleDateString()}</span>
			),
		},
	];

	const filterOptions = [
		{
			key: "type",
			label: "Type",
			options: [
				{ value: "ONBOARDING", label: "Onboarding" },
				{ value: "OFFBOARDING", label: "Offboarding" },
			],
		},
		{
			key: "isActive",
			label: "Status",
			options: [
				{ value: "true", label: "Active" },
				{ value: "false", label: "Inactive" },
			],
		},
	];

	return (
		<DataTable
			title="Boarding Templates"
			description="Create and manage templates for employee onboarding and offboarding processes"
			data={templates}
			columns={columns}
			searchFields={["name", "description"]}
			filters={filterOptions}
			onAdd={onAdd}
			onView={onView}
			onEdit={onEdit}
			onDelete={onDelete}
			isLoading={isLoading}
			emptyMessage="No boarding templates found"
			emptyDescription="Get started by creating your first boarding template"
			itemsPerPage={10}
			showSearch={true}
			showFilters={true}
			showPagination={true}
			showExport={false}
			addButtonLabel="Create Template"
			noCard={true}
		/>
	);
}
