import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import type { ChecklistItem, ChecklistSection } from "./builder";

interface BuilderPreviewProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	sections: ChecklistSection[];
}

interface PreviewRow {
	id: string;
	number: string;
	title: string;
	responsible: string;
	isParent: boolean;
	depth: number;
}

function flattenItems(items: ChecklistItem[], prefix: string): PreviewRow[] {
	const rows: PreviewRow[] = [];

	items.forEach((item, index) => {
		const number = `${prefix}${index + 1}`;

		rows.push({
			id: item.id,
			number,
			title: item.name,
			responsible: item.personInChargeName || item.personInChargeId || "",
			isParent: item.children.length > 0,
			depth: number.split(".").length - 1,
		});

		rows.push(...flattenItems(item.children, `${number}.`));
	});

	return rows;
}

export default function BuilderPreview({ open, onOpenChange, sections }: BuilderPreviewProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Onboarding Checklist Preview</DialogTitle>
					<DialogDescription>
						Read-only preview of the checklist you are building.
					</DialogDescription>
				</DialogHeader>

				<div className="max-h-[60vh] space-y-4 overflow-y-auto">
					{sections.length === 0 ? (
						<p className="py-6 text-center text-sm text-muted-foreground">
							No sections yet. Add a section to see it here.
						</p>
					) : (
						sections.map((section) => {
							const rows = flattenItems(section.items, "");

							return (
								<div key={section.id} className="overflow-hidden rounded-lg border">
									<div className="bg-gray-100 px-4 py-3 border-b">
										<h3 className="text-sm font-semibold text-gray-800">{section.name}</h3>
									</div>

									<div className="overflow-x-auto">
										<table className="w-full border-collapse">
											<thead>
												<tr className="bg-gray-50 border-b text-xs">
													<th className="px-4 py-2 text-left font-semibold text-gray-600 w-16">
														#
													</th>
													<th className="px-4 py-2 text-left font-semibold text-gray-600">
														Task
													</th>
													<th className="px-4 py-2 text-left font-semibold text-gray-600 w-28">
														Responsible
													</th>
													<th className="px-4 py-2 text-center font-semibold text-gray-600 w-24">
														Completed
													</th>
													<th className="px-4 py-2 text-left font-semibold text-gray-600 w-32">
														Date Completed
													</th>
													<th className="px-4 py-2 text-left font-semibold text-gray-600 w-40">
														Remarks/Signature
													</th>
												</tr>
											</thead>
											<tbody>
												{rows.length === 0 ? (
													<tr>
														<td
															colSpan={6}
															className="px-4 py-3 text-center text-sm text-muted-foreground">
															No items yet.
														</td>
													</tr>
												) : (
													rows.map((row) => (
														<tr
															key={row.id}
															className={`border-b hover:bg-gray-50 ${row.isParent ? "bg-gray-50/50" : ""}`}>
															<td
																className={`px-4 py-2 text-sm text-gray-900 ${row.depth > 0 ? "pl-8" : ""}`}>
																{row.number}
															</td>
															<td
																className={`px-4 py-2 text-sm text-gray-900 ${row.isParent ? "font-medium" : ""}`}>
																{row.title}
															</td>
															<td className="px-4 py-2 text-sm text-gray-600">
																{row.responsible}
															</td>
															<td className="px-4 py-2 text-center">
																<button
																	aria-label={`Mark ${row.number} completed`}
																	disabled
																	className="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors border-gray-300 cursor-not-allowed"
																/>
															</td>
															<td className="px-4 py-2 text-sm text-gray-600">{""}</td>
															<td className="px-4 py-2 text-sm text-gray-600">{""}</td>
														</tr>
													))
												)}
											</tbody>
										</table>
									</div>
								</div>
							);
						})
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
