import { useMemo } from "react";
import { Badge } from "~/components/atoms/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import {
	AlertCircle,
	CheckCircle2,
	FileText,
	FolderOpen,
} from "lucide-react";
import { useEmployee } from "~/lib/hooks/useEmployees";
import {
	buildFiling201Checklist,
	summarizeFiling201,
} from "~/lib/filing-201-documents";

interface Filing201TabProps {
	employeeId: string;
}

const formatDateTime = (value: string | null) => {
	if (!value) return "—";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "—";
	return date.toLocaleDateString("en-PH", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
};

export function Filing201Tab({ employeeId }: Filing201TabProps) {
	const documentFields = [
		"id",
		"employeeId",
		"documents.type",
		"documents.createdAt",
	];
	const { data: employee, isLoading } = useEmployee(employeeId, documentFields, {
		document: true,
	});

	const documents = useMemo(() => {
		const source = (employee as any)?.documents || (employee as any)?.data?.documents || [];
		return Array.isArray(source) ? source : [];
	}, [employee]);

	const rows = useMemo(() => buildFiling201Checklist(documents), [documents]);
	const summary = useMemo(() => summarizeFiling201(rows), [rows]);

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<FolderOpen className="h-5 w-5" />
						201 File Checklist
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<p className="text-sm text-muted-foreground">
						Baseline 201 requirements against the documents already on file.
						Optional items do not block completion. Upload missing items from the
						Documents tab.
					</p>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
						<div className="rounded-lg border p-3">
							<p className="text-xs text-muted-foreground">Required complete</p>
							<p className="text-lg font-semibold text-emerald-700">
								{summary.requiredUploaded}/{summary.requiredTotal}
							</p>
						</div>
						<div className="rounded-lg border p-3">
							<p className="text-xs text-muted-foreground">Missing required</p>
							<p className="text-lg font-semibold text-red-600">
								{summary.requiredMissing}
							</p>
						</div>
						<div className="rounded-lg border p-3">
							<p className="text-xs text-muted-foreground">Documents on file</p>
							<p className="text-lg font-semibold">{documents.length}</p>
						</div>
					</div>

					{isLoading ? (
						<p className="py-6 text-center text-sm text-muted-foreground">
							Loading 201 checklist…
						</p>
					) : (
						<div className="overflow-hidden rounded-lg border">
							<table className="w-full text-sm">
								<thead className="bg-muted/50">
									<tr>
										<th className="p-2 text-left font-medium">Requirement</th>
										<th className="p-2 text-left font-medium">Status</th>
										<th className="p-2 text-left font-medium">Files</th>
										<th className="p-2 text-left font-medium">Last upload</th>
									</tr>
								</thead>
								<tbody>
									{rows.map((row) => (
										<tr key={row.type} className="border-t">
											<td className="p-2">
												<span className="flex items-center gap-2">
													<FileText className="h-4 w-4 text-muted-foreground" />
													{row.label}
													{!row.required ? (
														<Badge
															variant="outline"
															className="text-[10px] uppercase">
															Optional
														</Badge>
													) : null}
												</span>
											</td>
											<td className="p-2">
												{row.status === "UPLOADED" ? (
													<Badge className="gap-1 bg-emerald-600 hover:bg-emerald-500">
														<CheckCircle2 className="h-3 w-3" />
														On file
													</Badge>
												) : (
													<Badge
														className={
															row.required
																? "gap-1 bg-red-600 hover:bg-red-500"
																: "gap-1 border border-input bg-background text-muted-foreground hover:bg-muted"
														}>
														<AlertCircle className="h-3 w-3" />
														{row.required ? "Missing" : "Not submitted"}
													</Badge>
												)}
											</td>
											<td className="p-2">{row.count}</td>
											<td className="p-2">{formatDateTime(row.lastUploadedAt)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
