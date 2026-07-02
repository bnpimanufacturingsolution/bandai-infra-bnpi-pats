import { formatDuration } from "~/lib/utils";

export interface TimesheetHoursData {
	totalHoursWorked?: string;
	totalRegularHours?: string;
	totalOvertimeHours?: string;
	totalLateHours?: string;
	totalEarlyOutHours?: string;
	totalNightShiftHours?: string;
	totalHolidayHours?: string;
}

interface TimesheetHoursOverviewProps {
	hours: TimesheetHoursData;
	className?: string;
}

const parseDurationToMinutes = (value?: string) => {
	if (!value) return 0;
	const [rawHours = "0", rawMinutes = "0"] = value.split(":");
	const h = Number.parseInt(rawHours, 10);
	const m = Number.parseInt(rawMinutes, 10);
	if (Number.isNaN(h) || Number.isNaN(m)) return 0;
	return h * 60 + m;
};

const formatMinutesAsDuration = (minutes: number) => {
	const safe = Math.max(0, minutes);
	const h = Math.floor(safe / 60);
	const m = safe % 60;
	return `${h}:${m.toString().padStart(2, "0")}`;
};

export function TimesheetHoursOverview({ hours, className = "" }: TimesheetHoursOverviewProps) {
	const nightShiftTotal = formatDuration(hours.totalNightShiftHours || "0:00");
	const holidayTotal = formatDuration(hours.totalHolidayHours || "0:00");
	const totalShortfallHours = formatMinutesAsDuration(
		parseDurationToMinutes(hours.totalLateHours) +
			parseDurationToMinutes(hours.totalEarlyOutHours),
	);

	return (
		<div className={`bg-white rounded-lg px-4 py-3 border border-gray-200 ${className}`}>
			<div className="flex items-center gap-2 w-full">
				{/* Total Hours Group */}
				<div className="flex items-center gap-2 pr-3 border-r border-gray-200 shrink-0">
					<div className="min-w-[86px]">
						<p className="text-xs text-gray-500 uppercase tracking-wide leading-none mb-1 whitespace-nowrap">
							Total Hours
						</p>
						<p className="text-2xl font-semibold leading-none whitespace-nowrap text-gray-900">
							{formatDuration(hours.totalHoursWorked)}
						</p>
					</div>
				</div>

				{/* Breakdown Group */}
				<div className="flex items-center px-3 grow min-w-0">
					<div className="grid grid-cols-2 gap-x-4 gap-y-1.5 w-full">
						<div className="flex items-center justify-between gap-3">
							<span className="text-xs text-gray-500 uppercase tracking-wide whitespace-nowrap">
								Regular
							</span>
							<span className="text-sm font-semibold text-gray-800">
								{formatDuration(hours.totalRegularHours)}
							</span>
						</div>
						<div className="flex items-center justify-between gap-3">
							<span className="text-xs text-gray-500 uppercase tracking-wide whitespace-nowrap">
								Overtime
							</span>
							<span className="text-sm font-semibold text-green-600">
								{formatDuration(hours.totalOvertimeHours)}
							</span>
						</div>
						<div className="flex items-center justify-between gap-3">
							<span className="text-xs text-gray-500 uppercase tracking-wide whitespace-nowrap">
								Night Shift
							</span>
							<span className="text-sm font-semibold text-indigo-600">
								{nightShiftTotal}
							</span>
						</div>
						<div className="flex items-center justify-between gap-3">
							<span className="text-xs text-gray-500 uppercase tracking-wide whitespace-nowrap">
								Holiday
							</span>
							<span className="text-sm font-semibold text-fuchsia-600">
								{holidayTotal}
							</span>
						</div>
					</div>
				</div>

				{/* Shortfall Group */}
				<div className="flex items-center gap-2 pl-3 border-l border-gray-200 shrink-0">
					<div className="min-w-[70px]">
						<p className="text-xs text-gray-500 uppercase tracking-wide leading-none mb-1 whitespace-nowrap">
							Shortfall
						</p>
						<p className="text-2xl font-semibold text-red-600 leading-none whitespace-nowrap">
							{formatDuration(totalShortfallHours)}
						</p>
					</div>
					<div className="flex flex-col justify-center gap-1 border-l pl-3 py-0.5">
						<div className="flex items-center justify-between gap-2 min-w-[80px]">
							<span className="text-xs text-gray-500 uppercase tracking-wide whitespace-nowrap">
								Late
							</span>
							<span className="text-sm font-semibold text-red-600">
								{formatDuration(hours.totalLateHours)}
							</span>
						</div>
						<div className="flex items-center justify-between gap-2 min-w-[80px]">
							<span className="text-xs text-gray-500 uppercase tracking-wide whitespace-nowrap">
								Early Out
							</span>
							<span className="text-sm font-semibold text-amber-700">
								{formatDuration(hours.totalEarlyOutHours)}
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
