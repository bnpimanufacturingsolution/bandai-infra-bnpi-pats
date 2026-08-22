import { useEffect, useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import type {
	ReportExportDialogState,
	ReportExportFormat,
} from "~/lib/utils/report-export";

export type ReportExportOption = {
	format: ReportExportFormat;
	label: string;
	helperText?: string;
	disabled?: boolean;
	reportMode?: string;
};

interface ReportExportGroupingChoice {
	id: string;
	label: string;
}

interface ReportExportDialogProps {
	title: string;
	description: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	options: ReportExportOption[];
	onExport(format: ReportExportFormat, state: ReportExportDialogState): void | Promise<void>;
	isExporting?: boolean;
	defaultState?: Partial<ReportExportDialogState>;
	groupingOptions?: ReportExportGroupingChoice[];
	groupingLabel?: string;
	groupingHelperText?: string;
	showIncludeFiltersToggle?: boolean;
}

const optionIcons = {
	pdf: FileText,
	csv: FileSpreadsheet,
	xlsx: FileSpreadsheet,
};

export function ReportExportDialog({
	title,
	description,
	open,
	onOpenChange,
	options,
	onExport,
	isExporting = false,
	defaultState,
	groupingOptions,
	groupingLabel = "Group Rows",
	groupingHelperText = "Organize exported rows using a shared grouping rule.",
	showIncludeFiltersToggle = false,
}: ReportExportDialogProps) {
	const [state, setState] = useState<ReportExportDialogState>({
		includeFiltersSummary: defaultState?.includeFiltersSummary ?? true,
		groupBy: defaultState?.groupBy,
	});

	useEffect(() => {
		if (!open) {
			setState({
				includeFiltersSummary: defaultState?.includeFiltersSummary ?? true,
				groupBy: defaultState?.groupBy,
			});
		}
	}, [defaultState?.groupBy, defaultState?.includeFiltersSummary, open]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>

				<div className="space-y-3">
					{showIncludeFiltersToggle ? (
						<div className="rounded-lg border px-4 py-3">
							<div className="flex items-center justify-between gap-3">
								<div className="space-y-1">
									<Label htmlFor="report-export-include-filters">
										Include Filters Summary
									</Label>
									<p className="text-xs text-muted-foreground">
										Add the active filter details to the export header.
									</p>
								</div>
								<Checkbox
									id="report-export-include-filters"
									checked={state.includeFiltersSummary}
									onCheckedChange={(checked) =>
										setState((current) => ({
											...current,
											includeFiltersSummary: checked === true,
										}))
									}
									disabled={isExporting}
								/>
							</div>
						</div>
					) : null}

					{groupingOptions?.length ? (
						<div className="rounded-lg border px-4 py-3 space-y-2">
							<div className="space-y-1">
								<Label htmlFor="report-export-grouping">{groupingLabel}</Label>
								<p className="text-xs text-muted-foreground">
									{groupingHelperText}
								</p>
							</div>
							<Select
								value={state.groupBy || "none"}
								onValueChange={(value) =>
									setState((current) => ({
										...current,
										groupBy: value === "none" ? undefined : value,
									}))
								}
								disabled={isExporting}>
								<SelectTrigger id="report-export-grouping">
									<SelectValue placeholder="No grouping" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">No grouping</SelectItem>
									{groupingOptions.map((option) => (
										<SelectItem key={option.id} value={option.id}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					) : null}

					{options.map((option) => {
						const Icon = optionIcons[option.format];
						const optionKey = `${option.format}-${option.reportMode || option.label}`;
						return (
							<button
								key={optionKey}
								type="button"
								onClick={() =>
									void onExport(option.format, {
										...state,
										reportMode: option.reportMode,
									})
								}
								disabled={option.disabled || isExporting}
								className="flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60">
								<div className="mt-0.5 rounded-md bg-muted p-2 text-muted-foreground">
									<Icon className="h-4 w-4" />
								</div>
								<div className="space-y-1">
									<p className="text-sm font-medium text-foreground">
										{option.label}
									</p>
									{option.helperText ? (
										<p className="text-xs text-muted-foreground">
											{option.helperText}
										</p>
									) : null}
								</div>
							</button>
						);
					})}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => onOpenChange(false)}
						disabled={isExporting}>
						Cancel
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
