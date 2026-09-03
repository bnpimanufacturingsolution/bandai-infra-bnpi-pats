import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { Avatar } from "~/components/atoms/Avatar";
import { Clock, CheckCircle, XCircle, User, Calendar } from "lucide-react";

export interface ApprovalItem {
	id: string;
	type: "leave" | "overtime" | "expense" | "promotion";
	title: string;
	description: string;
	employee: {
		id: string;
		name: string;
		avatar?: string;
		department: string;
	};
	submittedAt: string;
	status: "pending" | "approved" | "rejected";
	priority: "low" | "medium" | "high";
	amount?: number;
	days?: number;
}

interface ApprovalCardProps {
	item: ApprovalItem;
	onApprove?: (id: string) => void;
	onReject?: (id: string) => void;
	onView?: (id: string) => void;
}

export function ApprovalCard({ item, onApprove, onReject, onView }: ApprovalCardProps) {
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

	const getPriorityVariant = (priority: string) => {
		switch (priority) {
			case "high":
				return "destructive";
			case "medium":
				return "warning";
			case "low":
				return "info";
			default:
				return "default";
		}
	};

	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
		}).format(amount);
	};

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString();
	};

	return (
		<Card className="hover:shadow-md transition-shadow">
			<CardHeader className="pb-3">
				<div className="flex items-start justify-between">
					<div className="flex items-center gap-3">
						<Avatar src={item.employee.avatar} name={item.employee.name} size="md" />
						<div>
							<CardTitle className="text-lg">{item.title}</CardTitle>
							<p className="text-sm text-gray-600">{item.employee.name}</p>
							<p className="text-xs text-gray-500">{item.employee.department}</p>
						</div>
					</div>
					<div className="flex flex-col gap-2 items-end">
						<Badge variant={getStatusVariant(item.status)}>{item.status}</Badge>
						<Badge variant={getPriorityVariant(item.priority)}>
							{item.priority} priority
						</Badge>
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-2">
					<p className="text-sm font-medium text-gray-700">Description:</p>
					<p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
						{item.description}
					</p>
				</div>

				<div className="grid grid-cols-2 gap-4 text-sm">
					<div className="flex items-center gap-2">
						<Calendar className="h-4 w-4 text-gray-500" />
						<span className="text-gray-600">Submitted:</span>
						<span>{formatDate(item.submittedAt)}</span>
					</div>
					{item.amount && (
						<div className="flex items-center gap-2">
							<span className="text-gray-600">Amount:</span>
							<span className="font-semibold text-green-600">
								{formatCurrency(item.amount)}
							</span>
						</div>
					)}
					{item.days && (
						<div className="flex items-center gap-2">
							<span className="text-gray-600">Days:</span>
							<span className="font-semibold">{item.days}</span>
						</div>
					)}
				</div>

				{item.status === "pending" && (
					<div className="flex gap-2 pt-2">
						<Button size="sm" onClick={() => onApprove?.(item.id)} className="flex-1">
							<CheckCircle className="h-4 w-4 mr-1" />
							Approve
						</Button>
						<Button
							size="sm"
							variant="destructive"
							onClick={() => onReject?.(item.id)}
							className="flex-1">
							<XCircle className="h-4 w-4 mr-1" />
							Reject
						</Button>
					</div>
				)}

				{item.status !== "pending" && (
					<div className="pt-2">
						<Button
							size="sm"
							variant="outline"
							onClick={() => onView?.(item.id)}
							className="w-full">
							View Details
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
