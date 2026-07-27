import { CalendarClock, Loader2 } from "lucide-react";
import { Modal } from "~/components/atoms/Modal";
import { Button } from "~/components/atoms/Button";
import { themeColors } from "~/lib/config/theme";

export interface TimesheetOvertimeRequestModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	dateLabel: string;
	pendingOvertimeHours: string;
	description?: string;
	notes: string;
	onNotesChange: (value: string) => void;
	onSubmit: () => void;
	isSubmitting?: boolean;
}

const formatDayLabel = (dayKey: string) => {
	if (!dayKey || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return dayKey;
	const parsed = new Date(`${dayKey}T12:00:00`);
	if (Number.isNaN(parsed.getTime())) return dayKey;
	return parsed.toLocaleDateString("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
		year: "numeric",
	});
};

export function TimesheetOvertimeRequestModal({
	open,
	onOpenChange,
	dateLabel,
	pendingOvertimeHours,
	description = "Submit overtime for manager approval before timesheet submission.",
	notes,
	onNotesChange,
	onSubmit,
	isSubmitting = false,
}: TimesheetOvertimeRequestModalProps) {
	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			showCloseButton
			className="max-w-md gap-0 overflow-hidden rounded-2xl border-gray-200/80 p-0 shadow-xl">
			<div className="border-b border-gray-100 px-6 pb-5 pt-6">
				<div className="flex items-start gap-3.5 pr-8">
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50">
						<CalendarClock className="h-5 w-5" style={{ color: themeColors.orange }} />
					</div>
					<div className="min-w-0 space-y-1">
						<h2 className="text-base font-semibold tracking-tight text-gray-900">
							File overtime request
						</h2>
						<p className="text-sm leading-relaxed text-gray-500">{description}</p>
					</div>
				</div>
			</div>

			<div className="space-y-5 px-6 py-5">
				<div className="grid grid-cols-2 gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
					<div className="space-y-1">
						<p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
							Date
						</p>
						<p className="text-sm font-medium text-gray-900">{formatDayLabel(dateLabel)}</p>
					</div>
					<div className="space-y-1 text-right">
						<p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
							Detected OT
						</p>
						<p className="text-lg font-semibold tabular-nums tracking-tight text-gray-900">
							<span style={{ color: themeColors.orange }}>{pendingOvertimeHours}</span>
						</p>
					</div>
				</div>

				<div className="space-y-2">
					<label
						htmlFor="overtime-request-notes"
						className="text-sm font-medium text-gray-700">
						Notes
						<span className="ml-1 font-normal text-gray-400">(optional)</span>
					</label>
					<textarea
						id="overtime-request-notes"
						className="min-h-[96px] w-full resize-none rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900/5"
						placeholder="Brief reason, e.g. month-end reporting"
						value={notes}
						onChange={(event) => onNotesChange(event.target.value)}
					/>
				</div>
			</div>

			<div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/40 px-6 py-4">
				<Button
					variant="ghost"
					className="text-gray-600 hover:text-gray-900"
					onClick={() => onOpenChange(false)}
					disabled={isSubmitting}>
					Cancel
				</Button>
				<Button
					onClick={onSubmit}
					disabled={isSubmitting}
					className="min-w-[120px] rounded-lg shadow-sm">
					{isSubmitting ? (
						<>
							<Loader2 className="h-4 w-4 animate-spin" />
							Submitting
						</>
					) : (
						"Submit request"
					)}
				</Button>
			</div>
		</Modal>
	);
}