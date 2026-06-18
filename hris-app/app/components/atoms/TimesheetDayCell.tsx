import { forwardRef, type HTMLAttributes } from "react";

type TimesheetDayCellKind =
	| "hours"
	| "absent"
	| "rest"
	| "leave"
	| "marker"
	| "pending"
	| "scheduleError";

type TimesheetDayCellBadgeTone = "ot" | "late" | "eo" | "meta" | "night";

interface TimesheetDayCellBadge {
	label: string;
	tone: TimesheetDayCellBadgeTone;
}

interface TimesheetDayCellProps extends HTMLAttributes<HTMLDivElement> {
	dayNumber: number | string;
	kind: TimesheetDayCellKind;
	hoursLabel?: string;
	leaveLabel?: string;
	markerLabel?: string;
	pendingLabel?: string;
	pendingTone?: "today" | "upcoming";
	timeInLabel?: string;
	timeOutLabel?: string;
	modified?: boolean;
	selected?: boolean;
	badges?: TimesheetDayCellBadge[];
}

const toneClassMap: Record<TimesheetDayCellBadgeTone, string> = {
	ot: "bg-green-100 text-green-700",
	late: "bg-amber-100 text-amber-700",
	eo: "bg-orange-100 text-orange-700",
	meta: "bg-slate-100 text-slate-700",
	night: "bg-indigo-100 text-indigo-700",
};

const baseCellClass =
	"relative border-r border-gray-100 p-1 min-h-[52px] flex flex-col items-center justify-center gap-0.5 transition-all hover:brightness-95";

const kindToBgClass: Record<TimesheetDayCellKind, string> = {
	hours: "bg-orange-50/70",
	absent: "bg-red-50",
	rest: "bg-gray-100",
	leave: "bg-purple-50",
	marker: "bg-blue-50",
	pending: "bg-slate-50",
	scheduleError: "bg-amber-50",
};

export const TimesheetDayCell = forwardRef<HTMLDivElement, TimesheetDayCellProps>(
	(
		{
			dayNumber,
			kind,
			hoursLabel,
			leaveLabel,
			markerLabel = "M",
			pendingLabel = "Not Clocked In Yet",
			pendingTone = "upcoming",
			timeInLabel,
			timeOutLabel,
			modified = false,
			selected = false,
			badges = [],
			onClick,
			className = "",
			...props
		},
		ref,
	) => {
	const interactive = Boolean(onClick);
	const cellBgClass =
		kind === "pending"
			? pendingTone === "today"
				? "bg-orange-50/70"
				: kindToBgClass.pending
			: kind === "hours" && (!hoursLabel || hoursLabel === "0:00")
				? "bg-white"
				: kindToBgClass[kind];

	return (
		<div
			ref={ref}
			onClick={onClick}
			role={interactive ? "button" : props.role}
			tabIndex={interactive ? 0 : props.tabIndex}
			className={`${baseCellClass} ${cellBgClass} ${
				interactive
					? "cursor-pointer hover:ring-2 hover:ring-orange-200 z-10"
					: "cursor-help"
			} ${selected ? "ring-1 ring-orange-300" : ""} ${className}`}
			{...props}>
			{modified && (
				<span className="absolute top-0.5 left-0.5 rounded bg-amber-100 px-1 py-[1px] text-[7px] font-bold uppercase text-amber-700">
					M
				</span>
			)}
			<span className="text-[9px] font-medium text-gray-400">{dayNumber}</span>

			{kind === "absent" && (
				<span className="text-[8px] font-bold text-red-600">ABSENT</span>
			)}

			{kind === "rest" && <span className="text-[9px] font-medium text-gray-400">OFF</span>}

			{kind === "scheduleError" && (
				<span className="text-[8px] font-bold text-amber-700 text-center leading-tight">
					NO SCH
				</span>
			)}

			{kind === "leave" && (
				<span className="text-[8px] font-bold text-purple-600 text-center leading-tight">
					{leaveLabel || "LEAVE"}
				</span>
			)}

			{kind === "marker" && (
				<span
					className={`text-[9px] font-bold ${
						markerLabel === "H" ? "text-blue-600" : "text-indigo-600"
					}`}>
					{markerLabel}
				</span>
			)}

			{kind === "pending" && (
				<span
					className={`text-[8px] font-medium text-center leading-tight px-0.5 ${
						pendingTone === "today" ? "text-orange-700" : "text-slate-500"
					}`}>
					{pendingLabel}
				</span>
			)}

			{(kind === "hours" || kind === "pending") && (
				<>
					{kind === "hours" && (
						<span
							className={`text-xs font-bold leading-tight ${
								hoursLabel && hoursLabel !== "0:00"
									? "text-gray-900"
									: "text-gray-300"
							}`}>
							{hoursLabel || "0:00"}
						</span>
					)}
					{kind === "hours" && (timeInLabel || timeOutLabel) && (
						<div className="mt-0.5 grid w-full grid-cols-[auto_1fr] gap-x-1 px-1 text-[8px] leading-tight">
							<span className="font-semibold text-slate-400">In</span>
							<span className="truncate text-slate-600">{timeInLabel || "-"}</span>
							<span className="font-semibold text-slate-400">Out</span>
							<span className="truncate text-slate-600">
								{timeOutLabel || "Not clocked out"}
							</span>
						</div>
					)}
				</>
			)}

			{badges.length > 0 && (
				<div className="flex flex-wrap gap-0.5 justify-center">
					{badges.map((badge, index) => (
						<span
							key={`${badge.tone}-${index}`}
							className={`text-[7px] px-0.5 rounded font-bold ${toneClassMap[badge.tone]}`}>
							{badge.label}
						</span>
					))}
				</div>
			)}
		</div>
	);
	},
);

TimesheetDayCell.displayName = "TimesheetDayCell";
