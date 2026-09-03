import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Avatar } from "~/components/atoms/Avatar";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { Mail, Phone, MapPin, Calendar, Users } from "lucide-react";

export interface Employee {
	id: string;
	name: string;
	email: string;
	phone?: string;
	position: string;
	department: string;
	location?: string;
	employmentHireDate: string;
	status: "active" | "inactive" | "on_leave";
	avatar?: string;
	manager?: string;
	team?: string;
}

interface EmployeeCardProps {
	employee: Employee;
	onView?: (id: string) => void;
	onEdit?: (id: string) => void;
	onContact?: (id: string) => void;
	showActions?: boolean;
	compact?: boolean;
}

export function EmployeeCard({
	employee,
	onView,
	onEdit,
	onContact,
	showActions = true,
	compact = false,
}: EmployeeCardProps) {
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
		<Card className="hover:shadow-md transition-shadow">
			<CardHeader className="pb-3">
				<div className="flex items-start gap-3">
					<Avatar
						src={employee.avatar}
						name={employee.name}
						size={compact ? "md" : "lg"}
					/>
					<div className="flex-1 min-w-0">
						<CardTitle className="text-lg truncate">{employee.name}</CardTitle>
						<p className="text-sm text-gray-600 truncate">{employee.position}</p>
						<div className="flex items-center gap-2 mt-1">
							<Badge variant={getStatusVariant(employee.status)}>
								{employee.status.replace("_", " ")}
							</Badge>
						</div>
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="space-y-2 text-sm">
					<div className="flex items-center gap-2 text-gray-600">
						<Mail className="h-4 w-4" />
						<span className="truncate">{employee.email}</span>
					</div>
					{employee.phone && (
						<div className="flex items-center gap-2 text-gray-600">
							<Phone className="h-4 w-4" />
							<span>{employee.phone}</span>
						</div>
					)}
					<div className="flex items-center gap-2 text-gray-600">
						<Users className="h-4 w-4" />
						<span>{employee.department}</span>
					</div>
					{employee.location && (
						<div className="flex items-center gap-2 text-gray-600">
							<MapPin className="h-4 w-4" />
							<span>{employee.location}</span>
						</div>
					)}
					<div className="flex items-center gap-2 text-gray-600">
						<Calendar className="h-4 w-4" />
						<span>Hired: {formatDate(employee.employmentHireDate)}</span>
					</div>
				</div>

				{showActions && (
					<div className="flex gap-2 pt-2">
						<Button
							size="sm"
							variant="outline"
							onClick={() => onView?.(employee.id)}
							className="flex-1">
							View
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={() => onEdit?.(employee.id)}
							className="flex-1">
							Edit
						</Button>
						<Button
							size="sm"
							onClick={() => onContact?.(employee.id)}
							className="flex-1">
							Contact
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
