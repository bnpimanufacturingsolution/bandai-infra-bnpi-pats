import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Download, Gift } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { Skeleton } from "~/components/ui/skeleton";
import {
	specialPayrollService,
	type SpecialPayrollPayslip,
} from "~/services/special-payroll.service";
import { SPECIAL_PAYROLL_RUN_TYPE_LABEL } from "~/constants/special-payroll";

function money(value: number) {
	return new Intl.NumberFormat("en-PH", {
		style: "currency",
		currency: "PHP",
	}).format(Number(value || 0));
}

function dateLabel(value?: string | Date | null) {
	if (!value) return "—";
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return String(value);
	return d.toISOString().slice(0, 10);
}

export default function SpecialPayslipDetailPage() {
	const { id: employeeId, payslipId } = useParams();
	const [payslip, setPayslip] = useState<SpecialPayrollPayslip | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!payslipId) return;
		let cancelled = false;
		setLoading(true);
		specialPayrollService
			.getPayslip(payslipId)
			.then((result) => {
				if (!cancelled) setPayslip(result.payslip);
			})
			.catch((err: any) => {
				if (!cancelled) setError(err?.message || "Failed to load special payslip");
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [payslipId]);

	const handleDownload = async () => {
		if (!payslipId) return;
		const blob = await specialPayrollService.downloadPayslipPdf(payslipId);
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${payslip?.payslipNumber || "special-payslip"}.pdf`;
		a.click();
		URL.revokeObjectURL(url);
	};

	const lines = Array.isArray(payslip?.lineSnapshot)
		? (payslip!.lineSnapshot as any[])
		: [];

	return (
		<div className="container mx-auto py-6 px-4 lg:px-6 max-w-3xl">
			<div className="mb-4">
				<Link
					to={employeeId ? `/employee/${employeeId}/payroll` : "/employee/payroll"}
					className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
					<ArrowLeft className="h-4 w-4" />
					Back to payroll history
				</Link>
			</div>

			{loading && (
				<div className="space-y-4 bg-white border rounded-xl p-6">
					<Skeleton className="h-8 w-64" />
					<Skeleton className="h-4 w-40" />
					<Skeleton className="h-24 w-full" />
				</div>
			)}

			{error && (
				<div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
					{error}
				</div>
			)}

			{!loading && payslip && (
				<div className="bg-white border border-orange-200 rounded-xl p-6 space-y-6 shadow-sm">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div>
							<div className="flex items-center gap-2 mb-2">
								<Gift className="h-5 w-5 text-orange-600" />
								<Badge className="bg-orange-500 text-white">
									{SPECIAL_PAYROLL_RUN_TYPE_LABEL}
								</Badge>
							</div>
							<h1 className="text-2xl font-bold text-gray-900">
								{payslip.run?.label || "Special Payroll"}
							</h1>
							<p className="text-sm text-gray-500 mt-1">
								{payslip.payslipNumber} · {payslip.run?.runCode}
							</p>
						</div>
						<Button type="button" variant="outline" onClick={handleDownload}>
							<Download className="h-4 w-4 mr-2" />
							Download PDF
						</Button>
					</div>

					<div className="grid sm:grid-cols-2 gap-4 text-sm">
						<div>
							<p className="text-gray-500">Employee</p>
							<p className="font-medium text-gray-900">{payslip.employeeName}</p>
							<p className="font-mono text-xs text-gray-500">{payslip.employeeNumber}</p>
						</div>
						<div>
							<p className="text-gray-500">Period context</p>
							<p className="font-medium text-gray-900">
								{payslip.run?.contextPeriodName || "—"}
							</p>
							<p className="text-xs text-gray-500">
								{dateLabel(payslip.run?.contextStartDate)} –{" "}
								{dateLabel(payslip.run?.contextEndDate)} · pay{" "}
								{dateLabel(payslip.run?.contextPayDate)}
							</p>
						</div>
					</div>

					<div className="border rounded-lg overflow-hidden">
						<table className="w-full text-sm">
							<thead className="bg-orange-50 text-left">
								<tr>
									<th className="px-4 py-2">Code</th>
									<th className="px-4 py-2">Compensation</th>
									<th className="px-4 py-2 text-right">Amount</th>
								</tr>
							</thead>
							<tbody>
								{lines.map((line, index) => (
									<tr key={index} className="border-t">
										<td className="px-4 py-2 font-mono text-xs">
											{line.compensationCode}
										</td>
										<td className="px-4 py-2">{line.compensationName}</td>
										<td className="px-4 py-2 text-right font-medium">
											{money(line.amount)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					<div className="flex justify-end gap-8 border-t pt-4">
						<div className="text-right">
							<p className="text-xs text-gray-500 uppercase">Gross</p>
							<p className="text-lg font-semibold">{money(payslip.grossPay)}</p>
						</div>
						<div className="text-right">
							<p className="text-xs text-gray-500 uppercase">Net</p>
							<p className="text-2xl font-bold text-orange-700">
								{money(payslip.netPay)}
							</p>
						</div>
					</div>

					<p className="text-xs text-gray-500">
						One-time Special Payroll payout. Gross equals net. Not included in regular
						payroll calculations or YTD regular totals.
					</p>
				</div>
			)}
		</div>
	);
}
