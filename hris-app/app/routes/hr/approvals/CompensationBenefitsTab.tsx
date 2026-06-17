import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { DollarSign, TrendingUp, Users, Award } from "lucide-react";

interface CompensationRequest {
	id: string;
	type: "salary_adjustment" | "bonus" | "benefit_change" | "promotion";
	employeeName: string;
	department: string;
	amount?: number;
	percentage?: number;
	status: "pending" | "approved" | "rejected";
	requestDate: string;
	effectiveDate: string;
	reason: string;
}

const mockCompensationRequests: CompensationRequest[] = [
	{
		id: "COMP001",
		type: "salary_adjustment",
		employeeName: "Maria Santos",
		department: "Product Design",
		percentage: 15,
		status: "pending",
		requestDate: "2024-01-15",
		effectiveDate: "2024-02-01",
		reason: "Performance-based salary increase due to excellent project delivery",
	},
	{
		id: "COMP002",
		type: "bonus",
		employeeName: "Jose Garcia",
		department: "Engineering",
		amount: 5000,
		status: "approved",
		requestDate: "2024-01-10",
		effectiveDate: "2024-01-31",
		reason: "Year-end performance bonus for exceeding targets",
	},
	{
		id: "COMP003",
		type: "benefit_change",
		employeeName: "Ana Cruz",
		department: "Human Resource",
		status: "pending",
		requestDate: "2024-01-12",
		effectiveDate: "2024-03-01",
		reason: "Request to upgrade health insurance plan",
	},
];

export default function CompensationBenefitsTab() {
	const getTypeLabel = (type: string) => {
		switch (type) {
			case "salary_adjustment":
				return "Salary Adjustment";
			case "bonus":
				return "Bonus";
			case "benefit_change":
				return "Benefit Change";
			case "promotion":
				return "Promotion";
			default:
				return type;
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

	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
		}).format(amount);
	};

	// Calculate summary statistics
	const totalRequests = mockCompensationRequests.length;
	const pendingRequests = mockCompensationRequests.filter(
		(req) => req.status === "pending",
	).length;
	const totalAmount = mockCompensationRequests
		.filter((req) => req.amount)
		.reduce((sum, req) => sum + (req.amount || 0), 0);

	return (
		<div className="space-y-6">
			{/* Summary Cards */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				<Card>
					<CardContent className="p-6">
						<div className="flex items-center gap-4">
							<div className="p-2 bg-blue-100 rounded-lg">
								<Users className="w-6 h-6 text-blue-600" />
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
								<TrendingUp className="w-6 h-6 text-orange-600" />
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
								<DollarSign className="w-6 h-6 text-green-600" />
							</div>
							<div>
								<p className="text-sm text-gray-600">Total Amount</p>
								<p className="text-2xl font-bold">{formatCurrency(totalAmount)}</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Compensation Requests */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Award className="w-5 h-5" />
						Compensation & Benefits Requests
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						{mockCompensationRequests.map((request) => (
							<div
								key={request.id}
								className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
								<div className="flex items-start justify-between">
									<div className="flex-1">
										<div className="flex items-center gap-3 mb-2">
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
											{request.reason}
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
											{request.amount && (
												<span className="font-semibold text-green-600">
													{formatCurrency(request.amount)}
												</span>
											)}
											{request.percentage && (
												<span className="font-semibold text-blue-600">
													{request.percentage}%
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
