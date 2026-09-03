import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { Calendar, Clock, User } from "lucide-react";

export interface LeaveRequest {
	id: string;
	type: "vacation" | "sick" | "personal" | "emergency";
	startDate: string;
	endDate: string;
	days: number;
	status: "pending" | "approved" | "rejected";
	reason: string;
	employeeName: string;
	submittedAt: string;
}

interface LeaveRequestCardProps {
	request: LeaveRequest;
	onApprove?: (id: string) => void;
	onReject?: (id: string) => void;
	onEdit?: (id: string) => void;
	showActions?: boolean;
}

export function LeaveRequestCard({
	request,
	onApprove,
	onReject,
	onEdit,
	showActions = false,
}: LeaveRequestCardProps) {
	const getStatusVariant = (status: string) => {
		switch (status) {
			case "approved":
				return "success";
			case "rejected":
				return "destructive";
			case "pending":
				return "warning";
			default:
				return "default";
		}
	};

	const getTypeColor = (type: string) => {
		switch (type) {
			case "vacation":
				return "text-blue-600";
			case "sick":
				return "text-red-600";
			case "personal":
				return "text-purple-600";
			case "emergency":
				return "text-orange-600";
			default:
				return "text-gray-600";
		}
	};

	return (
		<Card className="hover:shadow-md transition-shadow">
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between">
					<CardTitle className="text-lg capitalize">{request.type} Leave</CardTitle>
					<Badge variant={getStatusVariant(request.status)}>{request.status}</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-2">
					<div className="flex items-center gap-2 text-sm text-gray-600">
						<Calendar className="h-4 w-4" />
						<span>
							{new Date(request.startDate).toLocaleDateString()} -{" "}
							{new Date(request.endDate).toLocaleDateString()}
						</span>
					</div>
					<div className="flex items-center gap-2 text-sm text-gray-600">
						<Clock className="h-4 w-4" />
						<span>
							{request.days} day{request.days > 1 ? "s" : ""}
						</span>
					</div>
					{showActions && (
						<div className="flex items-center gap-2 text-sm text-gray-600">
							<User className="h-4 w-4" />
							<span>{request.employeeName}</span>
						</div>
					)}
				</div>

				<div className="space-y-2">
					<p className="text-sm font-medium text-gray-700">Reason:</p>
					<p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">{request.reason}</p>
				</div>

				{showActions && request.status === "pending" && (
					<div className="flex gap-2 pt-2">
						<Button
							size="sm"
							onClick={() => onApprove?.(request.id)}
							className="flex-1">
							Approve
						</Button>
						<Button
							size="sm"
							variant="destructive"
							onClick={() => onReject?.(request.id)}
							className="flex-1">
							Reject
						</Button>
					</div>
				)}

				{!showActions && request.status === "pending" && (
					<div className="pt-2">
						<Button
							size="sm"
							variant="outline"
							onClick={() => onEdit?.(request.id)}
							className="w-full">
							Edit Request
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
