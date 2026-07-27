import { useState } from "react";
import { Filter as FilterIcon } from "lucide-react";

import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { Label } from "~/components/ui/label";

export interface AttendanceScopeFilterControl {
	key: string;
	label: string;
	value: string;
	options: Array<{ value: string; label: string }>;
	onChange: (value: string) => void;
}

interface AttendanceScopeFilterPopoverProps {
	controls: AttendanceScopeFilterControl[];
	presentGt10Days?: boolean;
	onPresentGt10DaysChange?: (value: boolean) => void;
	onClearAll: () => void;
	heading?: string;
}

export function AttendanceScopeFilterPopover({
	controls,
	presentGt10Days = false,
	onPresentGt10DaysChange,
	onClearAll,
	heading = "Additional Filters",
}: AttendanceScopeFilterPopoverProps) {
	const [open, setOpen] = useState(false);
	const showPresentGt10Days = typeof onPresentGt10DaysChange === "function";
	const activeControls = controls.filter((control) => control.value !== "all");
	const activeFiltersCount =
		activeControls.length + (showPresentGt10Days && presentGt10Days ? 1 : 0);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					data-testid="attendance-scope-filter-trigger"
					className="h-9 gap-2 rounded-md border-gray-200 px-3 text-sm font-medium shadow-sm">
					<FilterIcon className="h-4 w-4 text-gray-500" />
					Filter
					{activeFiltersCount > 0 && (
						<Badge variant="secondary" className="h-5 min-w-5 justify-center px-1.5" data-testid="active-filter-badge">
							{activeFiltersCount}
						</Badge>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-72" align="start">
				<div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
					{heading}
				</div>
				{showPresentGt10Days ? (
					<div className="mb-6 flex items-center justify-between space-x-2">
						<Label htmlFor="present-gt-10-days" className="text-sm font-medium text-neutral-700">
							Present &gt; 10 days
						</Label>
						<Switch
							id="present-gt-10-days"
							checked={presentGt10Days}
							onCheckedChange={onPresentGt10DaysChange}
						/>
					</div>
				) : null}

				<div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
					Organization Scope
				</div>
				<div className="flex flex-col gap-3">
					{controls.map((control) => (
						<div key={control.key} className="min-w-0">
							<div className="mb-1 text-xs font-medium text-neutral-700">
								{control.label}
							</div>
							<Select value={control.value} onValueChange={control.onChange}>
								<SelectTrigger
									aria-label={`${control.label} filter`}
									className="h-9 w-full rounded-md border-gray-200 shadow-sm">
									<SelectValue placeholder={control.label} />
								</SelectTrigger>
								<SelectContent>
									{control.options.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					))}
				</div>

				{activeFiltersCount > 0 && (
					<div className="mt-4 pt-4 border-t border-neutral-100 flex justify-end">
						<Button
							type="button"
							variant="ghost"
							className="h-8 px-2 text-xs font-medium text-neutral-500 hover:text-neutral-900"
							onClick={onClearAll}>
							Clear all filters
						</Button>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
