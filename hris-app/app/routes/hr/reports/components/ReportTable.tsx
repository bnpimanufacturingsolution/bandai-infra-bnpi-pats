import type { ReactNode } from "react";
import { cn } from "~/lib/utils";
import { formatReportDisplayValue, normalizeReportHeaderLabel } from "~/lib/utils/report-export";
import {
	reportTableBodyClassName,
	reportTableClassName,
	reportTableEmptyStateClassName,
	reportTableHeadClassName,
	reportTableRowClassName,
	reportTableScrollClassName,
	reportTableShellClassName,
} from "./reportTableStyles";

type ReportTableAccessor<T> = keyof T | ((row: T) => unknown);

export interface ReportTableColumn<T> {
	key: string;
	header: string;
	accessor?: ReportTableAccessor<T>;
	render?: (row: T, index: number) => ReactNode;
	align?: "left" | "center" | "right";
	valueType?: "text" | "number";
	className?: string;
	headerClassName?: string;
}

export interface ReportTableProps<T> {
	columns: ReportTableColumn<T>[];
	rows: T[];
	emptyMessage: string;
	getRowKey?: (row: T, index: number) => string;
	tableClassName?: string;
}

function resolveCellValue<T>(row: T, column: ReportTableColumn<T>) {
	if (!column.accessor) {
		return undefined;
	}

	return typeof column.accessor === "function" ? column.accessor(row) : row[column.accessor];
}

function getAlignmentClassName(align: ReportTableColumn<any>["align"]) {
	if (align === "center") return "text-center";
	if (align === "right") return "text-right";
	return "text-left";
}

export function ReportTable<T>({
	columns,
	rows,
	emptyMessage,
	getRowKey,
	tableClassName,
}: ReportTableProps<T>) {
	return (
		<div className={reportTableShellClassName}>
			<div className={reportTableScrollClassName}>
				<table className={cn(reportTableClassName, tableClassName)}>
					<thead className={reportTableHeadClassName}>
						<tr>
							{columns.map((column) => (
								<th
									key={column.key}
									className={cn(
										"min-w-0 px-6 py-3 font-semibold text-neutral-800",
										getAlignmentClassName(column.align),
										column.headerClassName,
									)}>
									{normalizeReportHeaderLabel(column.header)}
								</th>
							))}
						</tr>
					</thead>
					<tbody className={reportTableBodyClassName}>
						{rows.length > 0 ? (
							rows.map((row, index) => (
								<tr
									key={getRowKey ? getRowKey(row, index) : String(index)}
									className={reportTableRowClassName}>
									{columns.map((column) => (
										<td
											key={column.key}
											className={cn(
												"min-w-0 break-words border-r border-neutral-200 px-6 py-3 align-middle last:border-r-0",
												getAlignmentClassName(column.align),
												column.className,
											)}>
											{column.render
												? column.render(row, index)
												: formatReportDisplayValue(
														resolveCellValue(row, column),
														{
															valueType: column.valueType,
														},
													)}
										</td>
									))}
								</tr>
							))
						) : (
							<tr>
								<td
									colSpan={columns.length}
									className={reportTableEmptyStateClassName}>
									{emptyMessage}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}
