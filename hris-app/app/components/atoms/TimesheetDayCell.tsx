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

	modified?: boolean;
	selected?: boolean;
	badges?: TimesheetDayCellBadge[];
}

const toneClassMap: Record<TimesheetDayCellBadgeTone, string> = {
	ot: "text-green-700",
	late: "text-amber-700",
	eo: "text-orange-700",
	meta: "text-slate-600",
	night: "text-indigo-700",
};

const baseCellClass =
	"relative border-r border-gray-200/70 bg-white p-2 h-[80px] flex flex-col items-center justify-center gap-1 transition-colors hover:bg-gray-50/60 overflow-hidden";

// Minimal fills: neutral surfaces + subtle left accent for semantic kinds only
const kindToAccentClass: Record<TimesheetDayCellKind, string> = {
	hours: "",
	absent: "border-l-2 border-red-500",
	rest: "border-l-2 border-gray-300",
	leave: "border-l-2 border-purple-400",
	marker: "",
	pending: "",
	scheduleError: "border-l-2 border-amber-500",
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
	const accentClass = kindToAccentClass[kind] || "";
	const isEmptyHours = !hoursLabel || hoursLabel === "0:00";

	return (
		<div
			ref={ref}
			onClick={onClick}
			role={interactive ? "button" : props.role}
			tabIndex={interactive ? 0 : props.tabIndex}
			className={`${baseCellClass} ${accentClass} ${
				interactive
					? "cursor-pointer"
					: "cursor-help"
			} ${selected ? "ring-1 ring-inset ring-orange-400/70" : ""} ${className}`}
			{...props}>
			{modified && (
				<span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
			)}
			<span className="text-sm font-medium text-gray-500 tabular-nums">{dayNumber}</span>

			{kind === "absent" && (
				<span className="text-xs font-semibold text-red-600 tracking-tight">ABS</span>
			)}

			{kind === "rest" && <span className="text-xs font-medium text-gray-400">OFF</span>}

			{kind === "scheduleError" && (
				<span className="text-[8px] font-semibold text-amber-700 text-center leading-tight">
					NO SCH
				</span>
			)}

			{kind === "leave" && (
				<span className="text-[9px] font-semibold text-purple-700 text-center leading-tight">
					{leaveLabel || "LVE"}
				</span>
			)}

			{kind === "marker" && (
				<span
					className={`text-[10px] font-bold ${
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

			{kind === "hours" && (
				<span
					className={`text-base font-semibold tabular-nums leading-none ${
						!isEmptyHours ? "text-gray-900" : "text-gray-300"
					}`}>
					{hoursLabel || "0:00"}
				</span>
			)}

			{badges.length > 0 && (
				<div className="flex flex-wrap gap-px justify-center mt-0.5">
					{badges.map((badge, index) => (
						<span
							key={`${badge.tone}-${index}`}
							className={`text-[8px] px-1 font-medium tabular-nums ${toneClassMap[badge.tone]}`}>
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
