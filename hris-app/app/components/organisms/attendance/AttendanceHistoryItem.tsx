import { Badge } from "~/components/atoms/Badge";
import { cn } from "~/lib/utils";
import { type AttendanceRecord, parseTimeRange } from "~/lib/attendance-utils";

interface AttendanceHistoryItemProps {
	record: AttendanceRecord;
}

export function AttendanceHistoryItem({ record }: AttendanceHistoryItemProps) {
	// Safely parse time range
	const [startTime, endTime] = parseTimeRange(record.timeRange);

	const isAbsent = record.status === "Absent";

	return (
		<div className="bg-white rounded-xl border border-neutral-100 p-4 shadow-sm hover:border-primary/20 transition-colors">
			<div className="flex justify-between items-center mb-3">
				<div className="space-y-1">
					<p className="text-sm font-bold text-gray-900">{record.fullDate}</p>

					{isAbsent ? (
						<div className="flex">
							<Badge
								variant="destructive-soft"
								className="text-[10px] px-2 py-0.5 h-5">
								Absent
							</Badge>
						</div>
					) : (
						<p className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
							{startTime}
							{endTime && (
								<>
									<span className="text-gray-300">→</span>
									{endTime}
								</>
							)}
						</p>
					)}
				</div>
				<div className="flex flex-col items-end">
					<div className="flex items-baseline gap-1">
						<span className="text-lg font-bold text-gray-900 tracking-tight font-heading">
							{record.totalHours}
						</span>
						<span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
							Hrs
						</span>
					</div>
				</div>
			</div>

			{/* Footer status line */}
			{(record.rejectedBy || record.approvedBy) && (
				<div className="pt-3 border-t border-neutral-50 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<div
							className={cn(
								"w-1.5 h-1.5 rounded-full",
								record.rejectedBy ? "bg-red-500" : "bg-green-500",
							)}
						/>
						<span
							className={cn(
								"text-xs font-medium",
								record.rejectedBy ? "text-red-500" : "text-green-600",
							)}>
							{record.rejectedBy ? "Rejected by" : "Approved by"}
						</span>
					</div>
					<div className="flex items-center gap-1.5 text-xs text-gray-600 font-medium">
						<div className="w-5 h-5 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center font-bold text-[10px]">
							{(record.rejectedBy || record.approvedBy)?.charAt(0)}
						</div>
						{record.rejectedBy || record.approvedBy}
					</div>
				</div>
			)}
			{!record.rejectedBy && !record.approvedBy && !isAbsent && (
				<div className="pt-2 flex justify-end">
					{record.status === "Late" ? (
						<Badge variant="warning-soft" className="text-[10px] px-2 py-0.5 h-5">
							Late
						</Badge>
					) : null}
				</div>
			)}
		</div>
	);
}
