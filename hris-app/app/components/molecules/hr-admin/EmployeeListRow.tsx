import { Avatar } from "~/components/atoms/Avatar";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { MoreHorizontal, Edit, Trash2, Eye } from "lucide-react";
import type { Employee } from "../employee/EmployeeCard";

interface EmployeeListRowProps {
	employee: Employee;
	onView?: (id: string) => void;
	onEdit?: (id: string) => void;
	onDelete?: (id: string) => void;
	showActions?: boolean;
}

export function EmployeeListRow({
	employee,
	onView,
	onEdit,
	onDelete,
	showActions = true,
}: EmployeeListRowProps) {
	const getStatusVariant = (status: string) => {
		switch (status) {
			case "active":
				return "success";
			case "inactive":
				return "destructive";
			case "on_leave":
				return "warning";
			default:
				return "default";
		}
	};

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString();
	};

	return (
		<tr className="border-b hover:bg-gray-50 transition-colors">
			<td className="px-6 py-4">
				<div className="flex items-center gap-3">
					<Avatar src={employee.avatar} name={employee.name} size="sm" />
					<div>
						<p className="font-medium text-gray-900">{employee.name}</p>
						<p className="text-sm text-gray-500">{employee.email}</p>
					</div>
				</div>
			</td>
			<td className="px-6 py-4">
				<div>
					<p className="text-sm font-medium text-gray-900">{employee.position}</p>
					<p className="text-sm text-gray-500">{employee.department}</p>
				</div>
			</td>
			<td className="px-6 py-4">
				<Badge variant={getStatusVariant(employee.status)}>
					{employee.status.replace("_", " ")}
				</Badge>
			</td>
			<td className="px-6 py-4 text-sm text-gray-900">
				{formatDate(employee.employmentHireDate)}
			</td>
			<td className="px-6 py-4 text-sm text-gray-500">{employee.location || "N/A"}</td>
			{showActions && (
				<td className="px-6 py-4">
					<div className="flex items-center gap-2">
						<Button size="sm" variant="ghost" onClick={() => onView?.(employee.id)}>
							<Eye className="h-4 w-4" />
						</Button>
						<Button size="sm" variant="ghost" onClick={() => onEdit?.(employee.id)}>
							<Edit className="h-4 w-4" />
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onClick={() => onDelete?.(employee.id)}
							className="text-red-600 hover:text-red-700">
							<Trash2 className="h-4 w-4" />
						</Button>
					</div>
				</td>
			)}
		</tr>
	);
}
