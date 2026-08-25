import { useMemo } from "react";
import { Badge } from "~/components/atoms/Badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "~/components/atoms/Card";
import { Baby, ShieldAlert } from "lucide-react";
import { useMetrics } from "~/lib/hooks/useMetrics";
import {
	reportTableBodyClassName,
	reportTableClassName,
	reportTableHeadClassName,
	reportTableRowClassName,
	reportTableScrollClassName,
	reportTableShellClassName,
} from "../components/reportTableStyles";

/**
 * M3.3 special lists — pregnant employees (HR/admin-only visibility).
 * Sourced from the `pregnantEmployees` employee metric (Employee.pregnant flag
 * + optional expectedDueDate set from the admin employee edit surface).
 */
export default function PregnantEmployeesTab() {
	const { data, isLoading, error } = useMetrics("Employee", ["pregnantEmployees"]);

	const rows = useMemo(() => {
		const metrics = (data as any)?.data?.metrics?.pregnantEmployees || (data as any)?.metrics?.pregnantEmployees;
		return Array.isArray(metrics?.rows) ? metrics.rows : [];
	}, [data]);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Baby className="h-5 w-5" />
					Pregnant Employees
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
					<ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
					<span>
						Restricted list: only HR and admin roles may view this surface.
						Set the Pregnant flag (and optional expected due date) from each
						employee's profile to include them here for no-work coverage planning.
					</span>
				</div>

				{isLoading ? (
					<p className="py-6 text-center text-sm text-muted-foreground">
						Loading pregnant employees list…
					</p>
				) : error ? (
					<p className="py-6 text-center text-sm text-red-600">
						Failed to load the pregnant employees list.
					</p>
				) : rows.length === 0 ? (
					<p className="py-6 text-center text-sm text-muted-foreground">
						No employees are currently flagged. The list is empty by default.
					</p>
				) : (
					<div className={reportTableShellClassName}>
						<div className={reportTableScrollClassName}>
							<table className={`${reportTableClassName} min-w-[640px]`}>
								<thead className={reportTableHeadClassName}>
									<tr>
										<th className="text-left p-2">Employee</th>
										<th className="text-left p-2">Department</th>
										<th className="text-left p-2">Position</th>
										<th className="text-left p-2">Expected Due Date</th>
									</tr>
								</thead>
								<tbody className={reportTableBodyClassName}>
									{rows.map((row: any) => (
										<tr key={row.employeeId} className={reportTableRowClassName}>
											<td className="p-2 font-medium">
												{row.name}{" "}
												<Badge variant="outline" className="ml-1 text-[10px]">
													{row.empCode}
												</Badge>
											</td>
											<td className="p-2">{row.department}</td>
											<td className="p-2">{row.position || "—"}</td>
											<td className="p-2">{row.expectedDueDate || "Not set"}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
