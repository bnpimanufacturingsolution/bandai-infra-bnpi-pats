import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { UserPlus, UserMinus, UserCheck, UserX, Calendar, Building } from "lucide-react";

interface LifecycleRequest {
	id: string;
	type: "onboarding" | "offboarding" | "transfer" | "role_change";
	employeeName: string;
	department: string;
	status: "pending" | "approved" | "rejected";
	requestDate: string;
	effectiveDate: string;
	description: string;
	newRole?: string;
	newDepartment?: string;
}

const mockLifecycleRequests: LifecycleRequest[] = [
	{
		id: "LIFE001",
		type: "onboarding",
		employeeName: "John Smith",
		department: "Marketing",
		status: "pending",
		requestDate: "2024-01-15",
		effectiveDate: "2024-01-22",
		description: "New employee onboarding for Marketing Coordinator position",
	},
	{
		id: "LIFE002",
		type: "transfer",
		employeeName: "Sarah Johnson",
		department: "Engineering",
		status: "approved",
		requestDate: "2024-01-10",
		effectiveDate: "2024-02-01",
		description: "Department transfer from Engineering to Product Management",
		newDepartment: "Product Management",
		newRole: "Product Manager",
	},
	{
		id: "LIFE003",
		type: "offboarding",
		employeeName: "Mike Davis",
		department: "Sales",
		status: "pending",
		requestDate: "2024-01-12",
		effectiveDate: "2024-01-31",
		description: "Employee resignation - last day January 31, 2024",
	},
	{
		id: "LIFE004",
		type: "role_change",
		employeeName: "Lisa Wilson",
		department: "HR",
		status: "pending",
		requestDate: "2024-01-08",
		effectiveDate: "2024-02-15",
		description: "Promotion from HR Assistant to HR Specialist",
		newRole: "HR Specialist",
	},
];

export default function EmployeeLifecycleTab() {
	const getTypeLabel = (type: string) => {
		switch (type) {
			case "onboarding":
				return "Onboarding";
			case "offboarding":
				return "Offboarding";
			case "transfer":
				return "Department Transfer";
			case "role_change":
				return "Role Change";
			default:
				return type;
		}
	};

	const getTypeIcon = (type: string) => {
		switch (type) {
			case "onboarding":
				return <UserPlus className="w-4 h-4" />;
			case "offboarding":
				return <UserMinus className="w-4 h-4" />;
			case "transfer":
				return <Building className="w-4 h-4" />;
			case "role_change":
				return <UserCheck className="w-4 h-4" />;
			default:
				return <UserX className="w-4 h-4" />;
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

	// Calculate summary statistics
	const totalRequests = mockLifecycleRequests.length;
	const pendingRequests = mockLifecycleRequests.filter((req) => req.status === "pending").length;
	const onboardingRequests = mockLifecycleRequests.filter(
		(req) => req.type === "onboarding",
	).length;
	const offboardingRequests = mockLifecycleRequests.filter(
		(req) => req.type === "offboarding",
	).length;

	return (
		<div className="space-y-6">
			{/* Summary Cards */}
			<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
				<Card>
					<CardContent className="p-6">
						<div className="flex items-center gap-4">
							<div className="p-2 bg-blue-100 rounded-lg">
								<UserCheck className="w-6 h-6 text-blue-600" />
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
								<Calendar className="w-6 h-6 text-orange-600" />
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
							<div className="p-2 bg-green-100 rounded-lg">
								<UserPlus className="w-6 h-6 text-green-600" />
							</div>
							<div>
								<p className="text-sm text-gray-600">Onboarding</p>
								<p className="text-2xl font-bold">{onboardingRequests}</p>
							</div>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-6">
						<div className="flex items-center gap-4">
							<div className="p-2 bg-red-100 rounded-lg">
								<UserMinus className="w-6 h-6 text-red-600" />
							</div>
							<div>
								<p className="text-sm text-gray-600">Offboarding</p>
								<p className="text-2xl font-bold">{offboardingRequests}</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Lifecycle Requests */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<UserCheck className="w-5 h-5" />
						Employee Lifecycle Requests
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						{mockLifecycleRequests.map((request) => (
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
										</div>
										<p className="text-sm text-gray-600 mb-2">
											{request.description}
										</p>
										<div className="flex items-center gap-4 text-sm text-gray-600">
											<span>Department: {request.department}</span>
											<span>
												Request Date:{" "}
												{new Date(request.requestDate).toLocaleDateString()}
											</span>
											<span>
												Effective Date:{" "}
												{new Date(
													request.effectiveDate,
												).toLocaleDateString()}
											</span>
											{request.newDepartment && (
												<span className="font-semibold text-blue-600">
													New Department: {request.newDepartment}
												</span>
											)}
											{request.newRole && (
												<span className="font-semibold text-green-600">
													New Role: {request.newRole}
												</span>
											)}
										</div>
									</div>
									<div className="flex gap-2">
										<Button size="sm" variant="outline">
											View Details
										</Button>
										{request.status === "pending" && (
											<>
												<Button size="sm">Approve</Button>
												<Button size="sm" variant="destructive">
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
