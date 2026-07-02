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

	const breakdownItems = [
		{ label: "Regular", value: formatDuration(hours.totalRegularHours) },
		{ label: "Overtime", value: formatDuration(hours.totalOvertimeHours) },
		{ label: "Night Shift", value: nightShiftTotal },
		{ label: "Holiday", value: holidayTotal },
	];

	const shortfallItems = [
		{ label: "Late", value: formatDuration(hours.totalLateHours) },
		{ label: "Early Out", value: formatDuration(hours.totalEarlyOutHours) },
	];

	return (
		<div className={`bg-white rounded-lg px-4 py-3 border border-gray-200 ${className}`}>
			<div className="flex items-center gap-2 w-full">
				{/* Total Hours Group */}
				<div className="flex items-center gap-2 pr-3 border-r border-gray-200 shrink-0">
					<div className="min-w-[86px]">
						<p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider leading-none mb-1.5 whitespace-nowrap">
							Total Hours
						</p>
						<p className="text-2xl font-bold leading-none whitespace-nowrap text-gray-900 tabular-nums">
							{formatDuration(hours.totalHoursWorked)}
						</p>
					</div>
				</div>

				{/* Breakdown Group */}
				<div className="flex items-center px-3 grow min-w-0">
					<div className="grid grid-cols-2 gap-x-4 gap-y-2 w-full">
						{breakdownItems.map((item) => (
							<div key={item.label}>
								<p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider leading-none mb-1 whitespace-nowrap">
									{item.label}
								</p>
								<p className="text-base font-bold leading-none text-gray-900 tabular-nums whitespace-nowrap">
									{item.value}
								</p>
							</div>
						))}
					</div>
				</div>

				{/* Shortfall Group */}
				<div className="flex items-center gap-2 pl-3 border-l border-gray-200 shrink-0">
					<div className="min-w-[70px]">
						<p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider leading-none mb-1.5 whitespace-nowrap">
							Shortfall
						</p>
						<p className="text-2xl font-bold text-gray-900 leading-none whitespace-nowrap tabular-nums">
							{formatDuration(totalShortfallHours)}
						</p>
					</div>
					<div className="flex flex-col justify-center gap-2 border-l pl-3 py-0.5">
						{shortfallItems.map((item) => (
							<div key={item.label} className="min-w-[80px]">
								<p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider leading-none mb-1 whitespace-nowrap">
									{item.label}
								</p>
								<p className="text-base font-bold leading-none text-gray-900 tabular-nums whitespace-nowrap">
									{item.value}
								</p>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
