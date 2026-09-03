import { AlertTriangle, Loader2 } from "lucide-react";
import { Modal } from "~/components/atoms/Modal";
import { Button } from "~/components/atoms/Button";
import { themeColors } from "~/lib/config/theme";
import type { UnfiledOvertimeDay } from "~/lib/utils/overtime-candidate";

export interface TimesheetOvertimeSubmitWarningModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	days: UnfiledOvertimeDay[];
	onConfirm: () => void;
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
	});
};

export function TimesheetOvertimeSubmitWarningModal({
	open,
	onOpenChange,
	days,
	onConfirm,
	isSubmitting = false,
}: TimesheetOvertimeSubmitWarningModalProps) {
	const dayCount = days.length;

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			showCloseButton
			className="max-w-md gap-0 overflow-hidden rounded-2xl border-gray-200/80 p-0 shadow-xl">
			<div className="border-b border-gray-100 px-6 pb-5 pt-6">
				<div className="flex items-start gap-3.5 pr-8">
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50">
						<AlertTriangle className="h-5 w-5 text-amber-600" />
					</div>
					<div className="min-w-0 space-y-1">
						<h2 className="text-base font-semibold tracking-tight text-gray-900">
							Unfiled overtime detected
						</h2>
						<p className="text-sm leading-relaxed text-gray-500">
							{dayCount === 1
								? "1 day has overtime that hasn't been filed yet."
								: `${dayCount} days have overtime that hasn't been filed yet.`}{" "}
							Unfiled hours won't be payable unless you file a request and your
							manager approves it.
						</p>
					</div>
				</div>
			</div>

			<div className="max-h-52 overflow-y-auto px-6 py-4">
				<ul className="space-y-2">
					{days.map((day) => (
						<li
							key={day.dateKey}
							className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-3.5 py-2.5 text-sm">
							<span className="font-medium text-gray-900">
								{formatDayLabel(day.dateKey)}
							</span>
							<span
								className="font-semibold tabular-nums"
								style={{ color: themeColors.orange }}>
								{day.pendingOvertimeHours}
							</span>
						</li>
					))}
				</ul>
			</div>

			<div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/40 px-6 py-4">
				<Button
					variant="ghost"
					className="text-gray-600 hover:text-gray-900"
					onClick={() => onOpenChange(false)}
					disabled={isSubmitting}>
					Go back
				</Button>
				<Button
					onClick={onConfirm}
					disabled={isSubmitting}
					className="min-w-[132px] rounded-lg shadow-sm">
					{isSubmitting ? (
						<>
							<Loader2 className="h-4 w-4 animate-spin" />
							Submitting
						</>
					) : (
						"Submit anyway"
					)}
				</Button>
			</div>
		</Modal>
	);
}