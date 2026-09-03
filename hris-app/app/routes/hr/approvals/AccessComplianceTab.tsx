import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { Shield, Key, Lock, AlertTriangle, CheckCircle, XCircle } from "lucide-react";

interface AccessRequest {
	id: string;
	type: "system_access" | "permission_change" | "security_clearance" | "compliance_training";
	employeeName: string;
	department: string;
	system: string;
	status: "pending" | "approved" | "rejected";
	requestDate: string;
	requiredBy: string;
	description: string;
	priority: "low" | "medium" | "high";
}

const mockAccessRequests: AccessRequest[] = [
	{
		id: "ACCESS001",
		type: "system_access",
		employeeName: "Maria Santos",
		department: "Product Design",
		system: "CRM System",
		status: "pending",
		requestDate: "2024-01-15",
		requiredBy: "2024-01-20",
		description: "Request for CRM access for client management tasks",
		priority: "medium",
	},
	{
		id: "ACCESS002",
		type: "permission_change",
		employeeName: "Jose Garcia",
		department: "Engineering",
		system: "GitHub Repository",
		status: "approved",
		requestDate: "2024-01-10",
		requiredBy: "2024-01-15",
		description: "Request for admin permissions to manage repository settings",
		priority: "high",
	},
	{
		id: "ACCESS003",
		type: "security_clearance",
		employeeName: "Ana Cruz",
		department: "Human Resource",
		system: "Payroll System",
		status: "pending",
		requestDate: "2024-01-12",
		requiredBy: "2024-01-25",
		description: "Security clearance required for payroll data access",
		priority: "high",
	},
	{
		id: "ACCESS004",
		type: "compliance_training",
		employeeName: "Carlos Reyes",
		department: "Engineering",
		system: "Data Protection Training",
		status: "pending",
		requestDate: "2024-01-08",
		requiredBy: "2024-01-30",
		description: "Required GDPR compliance training completion",
		priority: "low",
	},
];

export default function AccessComplianceTab() {
	const getTypeLabel = (type: string) => {
		switch (type) {
			case "system_access":
				return "System Access";
			case "permission_change":
				return "Permission Change";
			case "security_clearance":
				return "Security Clearance";
			case "compliance_training":
				return "Compliance Training";
			default:
				return type;
		}
	};

	const getTypeIcon = (type: string) => {
		switch (type) {
			case "system_access":
				return <Key className="w-4 h-4" />;
			case "permission_change":
				return <Lock className="w-4 h-4" />;
			case "security_clearance":
				return <Shield className="w-4 h-4" />;
			case "compliance_training":
				return <AlertTriangle className="w-4 h-4" />;
			default:
				return <Shield className="w-4 h-4" />;
		}
	};

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

	// Calculate summary statistics
	const totalRequests = mockAccessRequests.length;
	const pendingRequests = mockAccessRequests.filter((req) => req.status === "pending").length;
	const highPriorityRequests = mockAccessRequests.filter((req) => req.priority === "high").length;
	const overdueRequests = mockAccessRequests.filter(
		(req) => req.status === "pending" && new Date(req.requiredBy) < new Date(),
	).length;

	return (
		<div className="space-y-6">
			{/* Summary Cards */}
			<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
				<Card>
					<CardContent className="p-6">
						<div className="flex items-center gap-4">
							<div className="p-2 bg-blue-100 rounded-lg">
								<Shield className="w-6 h-6 text-blue-600" />
							</div>
							<div>
								<p className="text-sm text-gray-600">Total Requests</p>
								<p className="text-2xl font-bold">{totalRequests}</p>
							</div>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-6">
						<div className="flex items-center gap-4">
							<div className="p-2 bg-orange-100 rounded-lg">
								<AlertTriangle className="w-6 h-6 text-orange-600" />
							</div>
							<div>
								<p className="text-sm text-gray-600">Pending</p>
								<p className="text-2xl font-bold">{pendingRequests}</p>
							</div>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-6">
						<div className="flex items-center gap-4">
							<div className="p-2 bg-red-100 rounded-lg">
								<XCircle className="w-6 h-6 text-red-600" />
							</div>
							<div>
								<p className="text-sm text-gray-600">High Priority</p>
								<p className="text-2xl font-bold">{highPriorityRequests}</p>
							</div>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-6">
						<div className="flex items-center gap-4">
							<div className="p-2 bg-red-100 rounded-lg">
								<AlertTriangle className="w-6 h-6 text-red-600" />
							</div>
							<div>
								<p className="text-sm text-gray-600">Overdue</p>
								<p className="text-2xl font-bold">{overdueRequests}</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Access & Compliance Requests */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Shield className="w-5 h-5" />
						Access & Compliance Requests
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						{mockAccessRequests.map((request) => (
							<div
								key={request.id}
								className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
								<div className="flex items-start justify-between">
									<div className="flex-1">
										<div className="flex items-center gap-3 mb-2">
											{getTypeIcon(request.type)}
											<h3 className="font-medium text-gray-900">
												{request.employeeName}
											</h3>
											<Badge variant={getStatusVariant(request.status)}>
												{request.status}
											</Badge>
											<Badge variant="outline">
												{getTypeLabel(request.type)}
											</Badge>
											<Badge variant={getPriorityVariant(request.priority)}>
												{request.priority} priority
											</Badge>
										</div>
										<p className="text-sm text-gray-600 mb-2">
											{request.description}
										</p>
										<div className="flex items-center gap-4 text-sm text-gray-600">
											<span>Department: {request.department}</span>
											<span>System: {request.system}</span>
											<span>
												Request Date:{" "}
												{new Date(request.requestDate).toLocaleDateString()}
											</span>
											<span className="font-semibold">
												Required By:{" "}
												{new Date(request.requiredBy).toLocaleDateString()}
											</span>
										</div>
									</div>
									<div className="flex gap-2">
										<Button size="sm" variant="outline">
											View Details
										</Button>
										{request.status === "pending" && (
											<>
												<Button size="sm">
													<CheckCircle className="w-4 h-4 mr-1" />
													Approve
												</Button>
												<Button size="sm" variant="destructive">
													<XCircle className="w-4 h-4 mr-1" />
													Reject
												</Button>
											</>
										)}
									</div>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
