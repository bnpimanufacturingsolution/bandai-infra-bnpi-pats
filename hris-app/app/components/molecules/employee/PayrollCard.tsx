import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { Download, Eye, DollarSign, Calendar } from "lucide-react";

export interface PayrollItem {
	id: string;
	period: string;
	grossPay: number;
	netPay: number;
	status: "pending" | "processed" | "paid";
	payDate: string;
	deductions: number;
	bonuses: number;
}

interface PayrollCardProps {
	payroll: PayrollItem;
	onView?: (id: string) => void;
	onDownload?: (id: string) => void;
}

export function PayrollCard({ payroll, onView, onDownload }: PayrollCardProps) {
	const getStatusVariant = (status: string) => {
		switch (status) {
			case "paid":
				return "success";
			case "processed":
				return "info";
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

	return (
		<Card className="hover:shadow-md transition-shadow">
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between">
					<CardTitle className="text-lg">Pay Period: {payroll.period}</CardTitle>
					<Badge variant={getStatusVariant(payroll.status)}>{payroll.status}</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-2 gap-4">
					<div className="space-y-1">
						<p className="text-sm text-gray-600">Gross Pay</p>
						<p className="text-lg font-semibold text-green-600">
							{formatCurrency(payroll.grossPay)}
						</p>
					</div>
					<div className="space-y-1">
						<p className="text-sm text-gray-600">Net Pay</p>
						<p className="text-lg font-semibold text-blue-600">
							{formatCurrency(payroll.netPay)}
						</p>
					</div>
				</div>

				<div className="grid grid-cols-2 gap-4 text-sm">
					<div className="flex items-center gap-2">
						<Calendar className="h-4 w-4 text-gray-500" />
						<span className="text-gray-600">Pay Date:</span>
						<span>{new Date(payroll.payDate).toLocaleDateString()}</span>
					</div>
					<div className="flex items-center gap-2">
						<DollarSign className="h-4 w-4 text-gray-500" />
						<span className="text-gray-600">Deductions:</span>
						<span className="text-red-600">{formatCurrency(payroll.deductions)}</span>
					</div>
				</div>

				{payroll.bonuses > 0 && (
					<div className="bg-green-50 p-3 rounded-lg">
						<div className="flex items-center gap-2">
							<DollarSign className="h-4 w-4 text-green-600" />
							<span className="text-sm font-medium text-green-800">Bonus:</span>
							<span className="text-sm font-semibold text-green-700">
								{formatCurrency(payroll.bonuses)}
							</span>
						</div>
					</div>
				)}

				<div className="flex gap-2 pt-2">
					<Button
						size="sm"
						variant="outline"
						onClick={() => onView?.(payroll.id)}
						className="flex-1">
						<Eye className="h-4 w-4 mr-1" />
						View Details
					</Button>
					<Button size="sm" onClick={() => onDownload?.(payroll.id)} className="flex-1">
						<Download className="h-4 w-4 mr-1" />
						Download
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
