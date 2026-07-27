import type { ReactNode } from "react";
import { Link } from "react-router";
import {
	buildManpowerEmployeeListPath,
	type ManpowerEmployeeListLinkInput,
} from "~/lib/utils/manpower-distribution-links";
import {
	formatEmploymentTypeLabel,
	type ManpowerDatabankEmploymentTypeRow,
	type ManpowerDatabankPositionRow,
} from "~/lib/utils/manpower-databank";
import { ReportTable } from "../components/ReportTable";

function formatNumber(value?: number | null) {
	return new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 }).format(value || 0);
}

function EmployeeDrillLink({
	children,
	count,
	input,
	disabled = false,
}: {
	children: ReactNode;
	count: number;
	input?: ManpowerEmployeeListLinkInput;
	disabled?: boolean;
}) {
	if (disabled || count <= 0) return <span>{children}</span>;
	return (
		<Link
			to={buildManpowerEmployeeListPath(input)}
			className="font-medium text-neutral-900 underline-offset-4 hover:text-orange-600 hover:underline">
			{children}
		</Link>
	);
}

export function ManpowerDatabankSection({
	positionRows,
	employmentTypeRows,
}: {
	positionRows: ManpowerDatabankPositionRow[];
	employmentTypeRows: ManpowerDatabankEmploymentTypeRow[];
}) {
	return (
		<section className="space-y-6">
			<div className="space-y-3">
				<div className="space-y-1">
					<h3 className="text-sm font-semibold text-neutral-900">Manpower Databank</h3>
					<p className="text-sm text-neutral-500">
						Position-level active manpower review with employee-directory drilldowns.
					</p>
				</div>
				<ReportTable
					columns={[
						{
							key: "position",
							header: "Position",
							render: (row) => (
								<EmployeeDrillLink
									count={row.headcount}
									input={{ positionId: row.positionId }}
									disabled={row.isUnassigned}>
									{row.position}
								</EmployeeDrillLink>
							),
						},
						{
							key: "headcount",
							header: "Headcount",
							align: "right",
							render: (row) => (
								<EmployeeDrillLink
									count={row.headcount}
									input={{ positionId: row.positionId }}
									disabled={row.isUnassigned}>
									{formatNumber(row.headcount)}
								</EmployeeDrillLink>
							),
						},
						{
							key: "direct",
							header: "Direct",
							align: "right",
							render: (row) => (
								<EmployeeDrillLink
									count={row.direct}
									input={{ positionId: row.positionId, workforceSource: "DIRECT" }}
									disabled={row.isUnassigned}>
									{formatNumber(row.direct)}
								</EmployeeDrillLink>
							),
						},
						{
							key: "agency",
							header: "Agency",
							align: "right",
							render: (row) => (
								<EmployeeDrillLink
									count={row.agency}
									input={{ positionId: row.positionId, workforceSource: "AGENCY" }}
									disabled={row.isUnassigned}>
									{formatNumber(row.agency)}
								</EmployeeDrillLink>
							),
						},
						{
							key: "departments",
							header: "Departments",
							accessor: "departments",
							align: "right",
							valueType: "number",
						},
						{
							key: "sections",
							header: "Sections",
							accessor: "sections",
							align: "right",
							valueType: "number",
						},
						{
							key: "employmentTypeMix",
							header: "Employment Type Mix",
							accessor: "employmentTypeMix",
						},
					]}
					rows={positionRows}
					getRowKey={(row) => row.positionId || row.position}
					emptyMessage="No manpower databank rows found"
				/>
			</div>

			<div className="space-y-3">
				<h4 className="text-sm font-semibold text-neutral-900">Employment Type Summary</h4>
				<ReportTable
					columns={[
						{
							key: "employmentType",
							header: "Employment Type",
							render: (row) => (
								<EmployeeDrillLink
									count={row.headcount}
									input={{
										employmentType: row.employmentType as ManpowerEmployeeListLinkInput["employmentType"],
									}}>
									{formatEmploymentTypeLabel(row.employmentType)}
								</EmployeeDrillLink>
							),
						},
						{
							key: "headcount",
							header: "Headcount",
							align: "right",
							render: (row) => (
								<EmployeeDrillLink
									count={row.headcount}
									input={{
										employmentType: row.employmentType as ManpowerEmployeeListLinkInput["employmentType"],
									}}>
									{formatNumber(row.headcount)}
								</EmployeeDrillLink>
							),
						},
						{
							key: "direct",
							header: "Direct",
							align: "right",
							render: (row) => (
								<EmployeeDrillLink
									count={row.direct}
									input={{
										employmentType: row.employmentType as ManpowerEmployeeListLinkInput["employmentType"],
										workforceSource: "DIRECT",
									}}>
									{formatNumber(row.direct)}
								</EmployeeDrillLink>
							),
						},
						{
							key: "agency",
							header: "Agency",
							align: "right",
							render: (row) => (
								<EmployeeDrillLink
									count={row.agency}
									input={{
										employmentType: row.employmentType as ManpowerEmployeeListLinkInput["employmentType"],
										workforceSource: "AGENCY",
									}}>
									{formatNumber(row.agency)}
								</EmployeeDrillLink>
							),
						},
						{
							key: "positions",
							header: "Positions",
							accessor: "positions",
							align: "right",
							valueType: "number",
						},
					]}
					rows={employmentTypeRows}
					getRowKey={(row) => row.employmentType}
					emptyMessage="No employment type summary rows found"
				/>
			</div>
		</section>
	);
}
