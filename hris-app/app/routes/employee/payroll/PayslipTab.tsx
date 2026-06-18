import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import {
	Receipt,
	TrendingUp,
	TrendingDown,
	Banknote,
	Eye,
	Download,
	FileText,
	ArrowLeft,
} from "lucide-react";
import { DataTable } from "~/components/atoms/DataTable";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { MoreVertical, Edit, Trash2 } from "lucide-react";
import { useState } from "react";
import { themeColors } from "~/lib/config/theme";

export type PayslipItem = {
	period: string;
	grossPay: number;
	netPay: number;
	status: string;
};

interface PayslipTabProps {
	payslipHistory: PayslipItem[];
}

export function PayslipTab({ payslipHistory }: PayslipTabProps) {
	const [selectedPayslip, setSelectedPayslip] = useState<PayslipItem | null>(null);

	if (selectedPayslip) {
		return (
			<div className="space-y-6">
				<Button
					variant="ghost"
					onClick={() => setSelectedPayslip(null)}
					className="flex items-center gap-2">
					<ArrowLeft className="w-4 h-4" />
					Back to Payslip List
				</Button>
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					{/* Payslip Summary */}
					<Card className="lg:col-span-2">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Receipt className="w-5 h-5" />
								Payslip - {selectedPayslip.period}
							</CardTitle>
							<CardDescription>Salary breakdown</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6">
							{/* Summary Cards */}
							<div className="grid grid-cols-3 gap-4">
								<div className="bg-orange-50 p-4 rounded-lg">
									<div className="flex items-center gap-2 mb-2">
										<TrendingUp className="w-4 h-4 text-orange-600" />
										<span className="text-sm font-medium text-orange-800">
											Gross Pay
										</span>
									</div>
									<div className="text-2xl font-bold text-orange-900 font-mono">
										₱{selectedPayslip.grossPay.toFixed(2)}
									</div>
								</div>
								<div className="bg-orange-50 p-4 rounded-lg">
									<div className="flex items-center gap-2 mb-2">
										<TrendingDown className="w-4 h-4 text-orange-600" />
										<span className="text-sm font-medium text-orange-800">
											Deductions
										</span>
									</div>
									<div className="text-2xl font-bold text-orange-900 font-mono">
										₱
										{(
											selectedPayslip.grossPay - selectedPayslip.netPay
										).toFixed(2)}
									</div>
								</div>
								<div
									className="p-4 rounded-lg"
									style={{ backgroundColor: "rgba(247, 190, 51, 0.1)" }}>
									<div className="flex items-center gap-2 mb-2">
										<Banknote
											className="w-4 h-4"
											style={{ color: themeColors.yellow }}
										/>
										<span
											className="text-sm font-medium"
											style={{ color: "rgba(247, 190, 51, 0.8)" }}>
											Net Pay
										</span>
									</div>
									<div
										className="text-2xl font-bold font-mono"
										style={{ color: themeColors.yellow }}>
										₱{selectedPayslip.netPay.toFixed(2)}
									</div>
								</div>
							</div>

							{/* Detailed Breakdown */}
							<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
								<div>
									<h3 className="text-lg font-semibold text-gray-900 mb-3">
										Earnings
									</h3>
									<div className="space-y-2">
										<div className="flex justify-between items-center">
											<span className="text-gray-600">Basic Salary</span>
											<span className="font-medium font-mono text-right min-w-[100px]">
												₱{(selectedPayslip.grossPay * 0.9).toFixed(2)}
											</span>
										</div>
										<div className="flex justify-between items-center">
											<span className="text-gray-600">Overtime</span>
											<span className="font-medium tabular-nums text-right min-w-[100px]">
												₱{(selectedPayslip.grossPay * 0.1).toFixed(2)}
											</span>
										</div>
										<div className="flex justify-between items-center">
											<span className="text-gray-600">Bonus</span>
											<span className="font-medium tabular-nums text-right min-w-[100px]">
												₱0.00
											</span>
										</div>
										<div className="flex justify-between items-center opacity-0 pointer-events-none">
											<span className="text-gray-600">Spacer</span>
											<span className="font-medium tabular-nums text-right min-w-[100px]">
												₱0.00
											</span>
										</div>
										<div className="h-[1px] bg-gray-200 my-2"></div>
										<div className="flex justify-between items-center font-semibold">
											<span>Total Earnings</span>
											<span className="font-mono text-right min-w-[100px]">
												₱{selectedPayslip.grossPay.toFixed(2)}
											</span>
										</div>
									</div>
								</div>
								<div>
									<h3 className="text-lg font-semibold text-gray-900 mb-3">
										Deductions
									</h3>
									<div className="space-y-2">
										<div className="flex justify-between items-center">
											<span className="text-gray-600">Tax</span>
											<span className="font-medium font-mono text-right min-w-[100px]">
												₱
												{(
													(selectedPayslip.grossPay -
														selectedPayslip.netPay) *
													0.6667
												).toFixed(2)}
											</span>
										</div>
										<div className="flex justify-between items-center">
											<span className="text-gray-600">SSS</span>
											<span className="font-medium font-mono text-right min-w-[100px]">
												₱
												{(
													(selectedPayslip.grossPay -
														selectedPayslip.netPay) *
													0.1667
												).toFixed(2)}
											</span>
										</div>
										<div className="flex justify-between items-center">
											<span className="text-gray-600">PhilHealth</span>
											<span className="font-medium font-mono text-right min-w-[100px]">
												₱
												{(
													(selectedPayslip.grossPay -
														selectedPayslip.netPay) *
													0.0833
												).toFixed(2)}
											</span>
										</div>
										<div className="flex justify-between items-center">
											<span className="text-gray-600">Pag-IBIG</span>
											<span className="font-medium font-mono text-right min-w-[100px]">
												₱
												{(
													(selectedPayslip.grossPay -
														selectedPayslip.netPay) *
													0.0833
												).toFixed(2)}
											</span>
										</div>
										<div className="h-[1px] bg-gray-200 my-2"></div>
										<div className="flex justify-between items-center font-semibold">
											<span>Total Deductions</span>
											<span className="font-mono text-right min-w-[100px]">
												₱
												{(
													selectedPayslip.grossPay -
													selectedPayslip.netPay
												).toFixed(2)}
											</span>
										</div>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Actions */}
					<Card>
						<CardHeader>
							<CardTitle>Actions</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							<Button className="w-full flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white">
								<Eye className="w-4 h-4" />
								View Full Payslip
							</Button>
							<Button variant="outline" className="w-full flex items-center gap-2">
								<Download className="w-4 h-4" />
								Download PDF
							</Button>
							<Button variant="outline" className="w-full flex items-center gap-2">
								<FileText className="w-4 h-4" />
								Print Payslip
							</Button>
							<Button variant="outline" className="w-full flex items-center gap-2">
								<Download className="w-4 h-4" />
								Export Data
							</Button>
						</CardContent>
					</Card>
				</div>
			</div>
		);
	}

	return (
		<DataTable
			title="Payslip"
			description=""
			data={payslipHistory.map((p, index) => ({ ...p, id: index.toString() }))}
			columns={[
				{
					key: "period",
					label: "Pay Period",
					sortable: true,
				},
				{
					key: "grossPay",
					label: "Gross Pay",
					sortable: true,
					render: (value: number) => (
						<div className="flex items-center justify-center">
							<div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center mr-3">
								<span className="text-orange-600 text-sm font-semibold">
									₱{value.toFixed(0)}
								</span>
							</div>
							<span className="text-sm text-gray-600">₱{value.toFixed(2)}</span>
						</div>
					),
					className: "text-center",
				},
				{
					key: "netPay",
					label: "Net Pay",
					sortable: true,
					render: (value: number) => (
						<div className="flex items-center justify-center">
							<div
								className="w-8 h-8 rounded-full flex items-center justify-center mr-3"
								style={{ backgroundColor: "rgba(247, 190, 51, 0.2)" }}>
								<span
									className="text-sm font-semibold"
									style={{ color: themeColors.yellow }}>
									₱{value.toFixed(0)}
								</span>
							</div>
							<span className="text-sm text-gray-600">₱{value.toFixed(2)}</span>
						</div>
					),
					className: "text-center",
				},
				{
					key: "status",
					label: "Status",
					sortable: true,
					render: (value: string) => (
						<span
							className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
							style={{
								backgroundColor: "rgba(228, 118, 47, 0.1)",
								color: "rgba(228, 118, 47, 0.8)",
							}}>
							{value}
						</span>
					),
					className: "text-center",
				},
			]}
			searchFields={["period", "status"]}
			renderActions={(item: PayslipItem & { id: string }) => {
				const handleView = () => {
					setSelectedPayslip(item);
				};

				const handleUpdate = () => {
					console.log("Update payslip:", item);
					// Add your update logic here
				};

				const handleDelete = () => {
					console.log("Delete payslip:", item);
					// Add your delete logic here
				};

				return (
					<div className="flex items-center justify-center">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" size="sm" className="h-8 w-8 p-0">
									<MoreVertical className="h-4 w-4" />
									<span className="sr-only">Open menu</span>
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem onClick={handleView}>
									<Eye className="mr-2 h-4 w-4" />
									View
								</DropdownMenuItem>
								<DropdownMenuItem onClick={handleUpdate}>
									<Edit className="mr-2 h-4 w-4" />
									Update
								</DropdownMenuItem>
								<DropdownMenuItem onClick={handleDelete} className="text-red-600">
									<Trash2 className="mr-2 h-4 w-4" />
									Delete
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				);
			}}
		/>
	);
}
