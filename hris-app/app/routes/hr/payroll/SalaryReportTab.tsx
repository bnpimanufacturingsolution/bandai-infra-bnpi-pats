import { SummaryCard } from "~/components/atoms/SummaryCard";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { CreditCard, Shield, Heart, Home } from "lucide-react";
import { useMemo } from "react";
import { themeColors } from "~/lib/config/theme";

interface SalaryReportTabProps {
	ytdSummary?: {
		grossIncome: number;
		totalDeductions: number;
		netPay: number;
		taxPaid: number;
		contributions: number;
	};
	governmentContributions: Array<{
		month: string;
		sss: number;
		philhealth: number;
		pagibig: number;
		total: number;
	}>;
}

export function SalaryReportTab({ governmentContributions }: SalaryReportTabProps) {
	// Calculate totals ONLY from table data
	const calculatedTotals = useMemo(() => {
		// Calculate totals directly from table
		const totalContributions = governmentContributions.reduce(
			(sum, contribution) => sum + contribution.total,
			0,
		);
		const totalSSS = governmentContributions.reduce(
			(sum, contribution) => sum + contribution.sss,
			0,
		);
		const totalPhilHealth = governmentContributions.reduce(
			(sum, contribution) => sum + contribution.philhealth,
			0,
		);
		const totalPagIbig = governmentContributions.reduce(
			(sum, contribution) => sum + contribution.pagibig,
			0,
		);

		return {
			totalContributions,
			totalSSS,
			totalPhilHealth,
			totalPagIbig,
		};
	}, [governmentContributions]);

	// Define columns for DataTable
	const columns: Column<(typeof governmentContributions)[0]>[] = [
		{
			key: "month",
			label: "Month",
			sortable: true,
			className: "text-left",
		},
		{
			key: "sss",
			label: "SSS",
			sortable: true,
			render: (value: number) => (
				<span
					className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-white"
					style={{
						backgroundColor: themeColors.red,
					}}>
					₱{value.toFixed(2)}
				</span>
			),
			className: "text-center",
		},
		{
			key: "philhealth",
			label: "PhilHealth",
			sortable: true,
			render: (value: number) => (
				<span
					className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
					style={{
						backgroundColor: themeColors.yellow,
						color: "#7a230d",
					}}>
					₱{value.toFixed(2)}
				</span>
			),
			className: "text-center",
		},
		{
			key: "pagibig",
			label: "Pag-IBIG",
			sortable: true,
			render: (value: number) => (
				<span
					className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-white"
					style={{
						backgroundColor: themeColors.orange,
					}}>
					₱{value.toFixed(2)}
				</span>
			),
			className: "text-center",
		},
		{
			key: "total",
			label: "Total",
			sortable: true,
			render: (value: number) => (
				<div className="flex items-center justify-center">
					<div
						className="w-8 h-8 rounded-full flex items-center justify-center mr-3"
						style={{
							backgroundColor: themeColors.orangeLight,
						}}>
						<span
							className="text-sm font-semibold"
							style={{
								color: themeColors.orange,
							}}>
							₱{value.toFixed(0)}
						</span>
					</div>
					<span className="text-sm text-gray-600">{value.toFixed(2)}</span>
				</div>
			),
			className: "text-center",
		},
	];

	return (
		<div className="space-y-6">
			{/* Summary Cards - All data from table only */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				<SummaryCard
					title="Total Contributions"
					value={`₱${calculatedTotals.totalContributions.toLocaleString()}`}
					description={`From table (${governmentContributions.length} months)`}
					icon={CreditCard}
					variant="orange"
				/>

				<SummaryCard
					title="Total SSS"
					value={`₱${calculatedTotals.totalSSS.toLocaleString()}`}
					description={`From table (${governmentContributions.length} months)`}
					icon={Shield}
					variant="red"
				/>

				<SummaryCard
					title="Total PhilHealth"
					value={`₱${calculatedTotals.totalPhilHealth.toLocaleString()}`}
					description={`From table (${governmentContributions.length} months)`}
					icon={Heart}
					variant="yellow"
				/>

				<SummaryCard
					title="Total Pag-IBIG"
					value={`₱${calculatedTotals.totalPagIbig.toLocaleString()}`}
					description={`From table (${governmentContributions.length} months)`}
					icon={Home}
					variant="orange"
				/>
			</div>

			{/* Government Contributions Table */}
			<DataTable
				title="Government Contributions"
				description="Monthly SSS, PhilHealth, and Pag-IBIG contributions"
				data={governmentContributions}
				columns={columns}
				searchFields={["month"]}
				showFilters={false}
				itemsPerPage={10}
			/>
		</div>
	);
}
