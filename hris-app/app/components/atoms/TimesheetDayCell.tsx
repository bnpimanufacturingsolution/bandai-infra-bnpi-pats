import { Moon } from "lucide-react";
import { forwardRef, type HTMLAttributes } from "react";

type TimesheetDayCellKind =
	| "hours"
	| "absent"
	| "rest"
	| "leave"
	| "marker"
	| "pending"
	| "scheduleError";

type TimesheetDayCellBadgeTone =
	| "ot"
	| "ot-filed"
	| "ot-approved"
	| "ot-rejected"
	| "late"
	| "eo"
	| "meta"
	| "night"
	| "correction-requested"
	| "correction-ready"
	| "correction-applied";

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
	isPastDay?: boolean;
	modified?: boolean;
	/** Payroll correction marker (requested / approved / applied) */
	hasPayrollCorrection?: boolean;
	payrollCorrectionTone?: "correction-requested" | "correction-ready" | "correction-applied";
	selected?: boolean;
	badges?: TimesheetDayCellBadge[];
}

const toneClassMap: Record<TimesheetDayCellBadgeTone, string> = {
	ot: "text-green-700",
	"ot-filed": "text-indigo-600",
	"ot-approved": "text-emerald-700",
	"ot-rejected": "text-rose-600",
	late: "text-amber-700",
	eo: "text-orange-700",
	meta: "text-slate-600",
	night: "text-indigo-700",
	"correction-requested": "text-amber-800",
	"correction-ready": "text-neutral-800",
	"correction-applied": "text-neutral-600",
};

const correctionDotClassMap: Record<
	NonNullable<TimesheetDayCellProps["payrollCorrectionTone"]>,
	string
> = {
	"correction-requested": "bg-amber-500",
	"correction-ready": "bg-neutral-700",
	"correction-applied": "bg-neutral-400",
};

const baseCellClass =
	"relative border-r border-gray-200/70 p-2 h-[80px] flex flex-col items-center justify-center gap-1 transition-colors overflow-hidden";

const kindToSurfaceClass: Record<TimesheetDayCellKind, string> = {
	hours: "bg-white hover:bg-gray-50/60",
	absent: "bg-rose-50/50 hover:bg-rose-50/70",
	rest: "bg-gray-200 hover:bg-gray-200/90",
	leave: "bg-purple-50/40 hover:bg-purple-50/60",
	marker: "bg-white hover:bg-gray-50/60",
	pending: "bg-white hover:bg-gray-50/60",
	scheduleError: "bg-amber-50/50 hover:bg-amber-50/70",
};

const resolveSurfaceClass = (kind: TimesheetDayCellKind, isPastDay: boolean): string => {
	if (kind === "rest") {
		return kindToSurfaceClass.rest;
	}

	if (isPastDay) {
		return "bg-gray-100 hover:bg-gray-100/90";
	}

	return kindToSurfaceClass[kind] || kindToSurfaceClass.hours;
};

export const TimesheetDayCell = forwardRef<HTMLDivElement, TimesheetDayCellProps>(
	(
		{
			dayNumber,
			kind,
			hoursLabel,
			leaveLabel,
			markerLabel = "M",
			isPastDay = false,
			modified = false,
			hasPayrollCorrection = false,
			payrollCorrectionTone = "correction-ready",
			selected = false,
			badges = [],
			onClick,
			className = "",
			...props
		},
		ref,
	) => {
	const interactive = Boolean(onClick);
	const surfaceClass = resolveSurfaceClass(kind, isPastDay);
	const isEmptyHours = !hoursLabel || hoursLabel === "0:00";
	const isNightShift = badges.some((badge) => badge.tone === "night");
	const visibleBadges = badges.filter((badge) => badge.tone !== "night");

	return (
		<div
			ref={ref}
			onClick={onClick}
			role={interactive ? "button" : props.role}
			tabIndex={interactive ? 0 : props.tabIndex}
			className={`${baseCellClass} ${surfaceClass} ${
				interactive
					? "cursor-pointer"
					: "cursor-help"
			} ${selected ? "ring-1 ring-inset ring-orange-400/70" : ""} ${
				hasPayrollCorrection ? "ring-1 ring-inset ring-neutral-300/80" : ""
			} ${className}`}
			{...props}>
			{isNightShift && (
				<Moon
					className="absolute top-1 right-1 h-3 w-3 text-indigo-600"
					aria-label="Night shift"
				/>
			)}
			{modified && (
				<span
					className={`absolute top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500 ${
						isNightShift ? "left-0.5" : "right-0.5"
					}`}
					aria-hidden
				/>
			)}
			{hasPayrollCorrection && (
				<span
					className={`absolute bottom-0.5 left-0.5 h-1.5 w-1.5 rounded-full ${correctionDotClassMap[payrollCorrectionTone]}`}
					title="Payroll correction"
					aria-label="Payroll correction on this day"
				/>
			)}
			<span className="text-sm font-medium text-gray-500 tabular-nums">{dayNumber}</span>

			{kind === "absent" && (
				<span className="text-xs font-medium text-rose-600 tracking-tight">ABS</span>
			)}

			{kind === "rest" && (
				<span className="text-xs font-medium text-gray-500">OFF</span>
			)}

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

			{kind === "hours" && (
				<span
					className={`text-base font-semibold tabular-nums leading-none ${
						!isEmptyHours ? "text-gray-900" : "text-gray-300"
					}`}>
					{hoursLabel || "0:00"}
				</span>
			)}

			{visibleBadges.length > 0 && (
				<div className="flex flex-wrap gap-px justify-center mt-0.5">
					{visibleBadges.map((badge, index) => (
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
