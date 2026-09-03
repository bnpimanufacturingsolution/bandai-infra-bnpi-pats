import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { SummaryCard } from "~/components/atoms/SummaryCard";
import { ArrowLeft, Banknote, CircleDollarSign, Wallet } from "lucide-react";
import { useStatementOfAccount } from "~/lib/hooks/useStatementOfAccounts";
import { useSoaLineItemsBySoaId } from "~/lib/hooks/useSoaLineItems";
import { useSoaRemittancesBySoaId } from "~/lib/hooks/useSoaRemittances";
import type { SOALineItem } from "~/zod/soalineitem.zod";
import type { SOARemittance } from "~/zod/soaremittance.zod";

type SOADisplayStatus = "PENDING" | "APPROVED" | "REMITTED" | "RECONCILED" | "DISPUTED" | "CLOSED";

const toDisplayStatus = (status: string): SOADisplayStatus => {
	switch (status) {
		case "DRAFT":
		case "PENDING_REVIEW":
		case "PARTIALLY_REMITTED":
			return "PENDING";
		case "APPROVED":
			return "APPROVED";
		case "REMITTED":
			return "REMITTED";
		case "RECONCILED":
			return "RECONCILED";
		case "DISPUTED":
			return "DISPUTED";
		case "CLOSED":
			return "CLOSED";
		default:
			return "PENDING";
	}
};

const statusStyles: Record<SOADisplayStatus, string> = {
	PENDING: "bg-yellow-100 text-yellow-800 border border-yellow-200",
	APPROVED: "bg-blue-100 text-blue-800 border border-blue-200",
	REMITTED: "bg-green-100 text-green-800 border border-green-200",
	RECONCILED: "bg-emerald-100 text-emerald-800 border border-emerald-200",
	DISPUTED: "bg-red-100 text-red-800 border border-red-200",
	CLOSED: "bg-slate-100 text-slate-700 border border-slate-200",
};

const remittanceStatusStyles: Record<string, string> = {
	PENDING: "bg-yellow-100 text-yellow-800 border border-yellow-200",
	PROCESSING: "bg-blue-100 text-blue-800 border border-blue-200",
	REMITTED: "bg-green-100 text-green-800 border border-green-200",
	CONFIRMED: "bg-emerald-100 text-emerald-800 border border-emerald-200",
	FAILED: "bg-red-100 text-red-800 border border-red-200",
	REVERSED: "bg-slate-100 text-slate-700 border border-slate-200",
};

const formatCurrency = (value?: number) =>
	new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value || 0);

const formatDate = (value?: Date | string) =>
	value
		? new Date(value).toLocaleDateString("en-PH", {
				month: "short",
				day: "numeric",
				year: "numeric",
			})
		: "-";

const formatDateTime = (value?: Date | string) =>
	value
		? new Date(value).toLocaleString("en-PH", {
				month: "short",
				day: "numeric",
				year: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			})
		: "-";

const renderCompactJson = (value: unknown) => {
	if (value === null || value === undefined) return "-";
	try {
		const serialized = JSON.stringify(value);
		if (serialized.length <= 64) return serialized;
		return `${serialized.slice(0, 64)}...`;
	} catch {
		return String(value);
	}
};

export default function HRBillingDetailsPage() {
	const navigate = useNavigate();
	const { id } = useParams();

	const soaId = id || "";
	const { data: soa, isLoading: isLoadingSoa } = useStatementOfAccount(soaId);
	const { data: lineItemsData, isLoading: isLoadingLineItems } = useSoaLineItemsBySoaId(soaId);
	const { data: remittancesData, isLoading: isLoadingRemittances } =
		useSoaRemittancesBySoaId(soaId);

	const lineItems = useMemo(() => lineItemsData?.soalineitems || [], [lineItemsData]);
	const remittances = useMemo(() => remittancesData?.soaremittances || [], [remittancesData]);

	const lineItemColumns: Column<SOALineItem>[] = [
		{
			key: "id",
			label: "id",
			render: (value) => <span className="font-mono text-xs">{value}</span>,
		},
		{ key: "category", label: "category", render: (value) => value || "-" },
		{ key: "description", label: "description", render: (value) => value || "-" },
		{
			key: "taxableAmount",
			label: "Taxable Amount",
			render: (value) => <span className="text-sm">{formatCurrency(value as number)}</span>,
		},
		{
			key: "taxAmount",
			label: "Tax Amount",
			render: (value) => <span className="text-sm">{formatCurrency(value as number)}</span>,
		},
		{
			key: "employeeShare",
			label: "Employee Share",
			render: (value) => <span className="text-sm">{formatCurrency(value as number)}</span>,
		},
		{
			key: "employerShare",
			label: "Employer Share",
			render: (value) => <span className="text-sm">{formatCurrency(value as number)}</span>,
		},
		{
			key: "totalAmount",
			label: "Net Payable",
			render: (value) => (
				<span className="font-medium text-red-700">{formatCurrency(value as number)}</span>
			),
		},
		{
			key: "metadata",
			label: "metadata",
			render: (value) => (
				<span className="text-xs text-gray-600">{renderCompactJson(value)}</span>
			),
		},
		{
			key: "createdAt",
			label: "createdAt",
			render: (value) => (
				<span className="text-xs">{formatDateTime(value as Date | string)}</span>
			),
		},
		{
			key: "updatedAt",
			label: "updatedAt",
			render: (value) => (
				<span className="text-xs">{formatDateTime(value as Date | string)}</span>
			),
		},
	];

	const remittanceColumns: Column<SOARemittance>[] = [
		{
			key: "id",
			label: "id",
			render: (value) => <span className="font-mono text-xs">{value}</span>,
		},
		{
			key: "amount",
			label: "amount",
			render: (value) => (
				<span className="font-medium text-green-700">
					{formatCurrency(value as number)}
				</span>
			),
		},
		{ key: "paymentMethod", label: "paymentMethod", render: (value) => value || "-" },
		{ key: "referenceNumber", label: "referenceNumber", render: (value) => value || "-" },
		{
			key: "paymentDate",
			label: "paymentDate",
			render: (value) => (
				<span className="text-sm">{formatDate(value as Date | string)}</span>
			),
		},
		{ key: "category", label: "category", render: (value) => value || "-" },
		{
			key: "status",
			label: "status",
			render: (value: string) => (
				<Badge className={remittanceStatusStyles[value] || remittanceStatusStyles.PENDING}>
					{value}
				</Badge>
			),
		},
		{ key: "notes", label: "notes", render: (value) => value || "-" },
		{
			key: "metadata",
			label: "metadata",
			render: (value) => (
				<span className="text-xs text-gray-600">{renderCompactJson(value)}</span>
			),
		},
		{
			key: "createdAt",
			label: "createdAt",
			render: (value) => (
				<span className="text-xs">{formatDateTime(value as Date | string)}</span>
			),
		},
		{
			key: "updatedAt",
			label: "updatedAt",
			render: (value) => (
				<span className="text-xs">{formatDateTime(value as Date | string)}</span>
			),
		},
	];

	if (!id) {
		return (
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle>Billing Not Found</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<p className="text-sm text-gray-600">
							The billing ID is missing from the URL.
						</p>
						<Button onClick={() => navigate("/hr/billings")} variant="outline">
							<ArrowLeft className="h-4 w-4 mr-2" />
							Back to Billings
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (isLoadingSoa) {
		return (
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle>Loading Billing Details...</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-600">
							Fetching statement of account details from backend.
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (!soa) {
		return (
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle>Billing Not Found</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<p className="text-sm text-gray-600">
							The requested billing record does not exist or is no longer available.
						</p>
						<Button onClick={() => navigate("/hr/billings")} variant="outline">
							<ArrowLeft className="h-4 w-4 mr-2" />
							Back to Billings
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	const soaDisplayStatus = toDisplayStatus(soa.status);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="space-y-1">
					<h1 className="text-xl font-semibold text-gray-900">{soa.name}</h1>
					<div className="flex items-center gap-2">
						<span className="font-mono text-sm text-gray-600">{soa.soaNumber}</span>
						<Badge className={statusStyles[soaDisplayStatus]}>{soaDisplayStatus}</Badge>
						<Badge variant={soa.eppReconciled ? "success-soft" : "secondary"}>
							{soa.eppReconciled ? "Reconciled" : "Not Reconciled"}
						</Badge>
					</div>
				</div>
				<Button onClick={() => navigate("/hr/billings")} variant="outline">
					<ArrowLeft className="h-4 w-4 mr-2" />
					Back
				</Button>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
				<SummaryCard
					title="Due Date"
					value={formatDate(soa.dueDate)}
					description="Billing due date"
					icon={CircleDollarSign}
					color="orange"
				/>
				<SummaryCard
					title="Total Amount"
					value={formatCurrency(soa.totalAmount)}
					description="Gross billing amount"
					icon={Wallet}
					color="blue"
				/>
				<SummaryCard
					title="Total Remitted"
					value={formatCurrency(soa.totalRemitted)}
					description="Already remitted"
					icon={Banknote}
					color="green"
				/>
				<SummaryCard
					title="Outstanding"
					value={formatCurrency(soa.totalOutstanding)}
					description="Remaining payable"
					icon={Wallet}
					color="red"
				/>
			</div>

			<DataTable<SOALineItem>
				title="SOA Line Items"
				description="Remittance-ready SOA line items and net payable amounts."
				data={lineItems}
				columns={lineItemColumns}
				isLoading={isLoadingLineItems}
				searchFields={["id", "category", "description"]}
				emptyMessage="No SOA line items found"
				emptyDescription="This billing record currently has no line item entries."
			/>

			<DataTable<SOARemittance>
				title="SOA Remittance History"
				description="Recorded remittances linked to this statement of account."
				data={remittances}
				columns={remittanceColumns}
				isLoading={isLoadingRemittances}
				searchFields={["id", "referenceNumber", "paymentMethod", "category", "status"]}
				emptyMessage="No SOA remittances found"
				emptyDescription="No remittance entries have been recorded for this SOA yet."
			/>
		</div>
	);
}
