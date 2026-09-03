import { Plus } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { AttendanceHistoryItem } from "./AttendanceHistoryItem";
import { type AttendanceRecord } from "~/lib/attendance-utils";

interface AttendanceHistoryProps {
	records: AttendanceRecord[];
	currentPeriod: string;
	onAddManual?: () => void;
}

export function AttendanceHistory({ records, currentPeriod, onAddManual }: AttendanceHistoryProps) {
	return (
		<div className="space-y-4">
			{/* Header */}
			<div className="space-y-2 mb-6">
				<div className="flex items-center justify-between">
					<h3 className="text-lg font-bold text-gray-900">{currentPeriod}</h3>
					<Button
						variant="ghost"
						size="sm"
						onClick={onAddManual}
						className="text-primary hover:bg-primary/5 hover:text-primary font-bold text-xs gap-1 h-8">
						<Plus className="w-3.5 h-3.5" />
						Add Time
					</Button>
				</div>
			</div>

			{/* List */}
			<div className="space-y-3">
				{records.map((record) => (
					<AttendanceHistoryItem key={record.id} record={record} />
				))}
			</div>
		</div>
	);
}
