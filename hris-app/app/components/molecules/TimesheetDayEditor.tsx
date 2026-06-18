import { useState, useEffect } from "react";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import type { TimesheetBreakdownDay } from "./TimesheetCalendar";
import { themeColors } from "~/lib/config/theme";
import { TimePicker } from "./TimePicker";
import { RotateCcw } from "lucide-react";

type ShiftPreset = "scheduled" | "day" | "night";
type TimeOutDayOffset = "0" | "1";

interface TimesheetDayEditorProps {
	day: TimesheetBreakdownDay | null;
	isOpen: boolean;
	onClose: () => void;
	onSave: (updatedDay: TimesheetBreakdownDay) => Promise<void> | void;
	scheduleDefaultsLoading?: boolean;
	defaultTimes?: {
		timeIn?: string;
		timeOut?: string;
		breakMinutes?: number;
		breakDisplay?: string;
		scheduleStartTime?: string;
		scheduleEndTime?: string;
		scheduledWorkMinutes?: number;
		isOvernight?: boolean;
		shiftName?: string;
		shiftCode?: string;
		scheduleWindowDisplay?: string;
		timeOutDayOffset?: 0 | 1;
	};
}

const SHIFT_PRESETS: Record<
	ShiftPreset,
	{ label: string; timeIn: string; timeOut: string; isOvernight: boolean; shiftName: string }
> = {
	scheduled: {
		label: "Scheduled shift",
		timeIn: "",
		timeOut: "",
		isOvernight: false,
		shiftName: "Scheduled",
	},
	day: {
		label: "Day shift",
		timeIn: "08:00",
		timeOut: "17:00",
		isOvernight: false,
		shiftName: "Day Shift",
	},
	night: {
		label: "Night shift",
		timeIn: "20:00",
		timeOut: "05:00",
		isOvernight: true,
		shiftName: "Night Shift",
	},
};

const formatClock = (value?: string | null) => {
	if (!value) return "--:--";
	const [hoursRaw, minutesRaw] = value.split(":").map(Number);
	if (!Number.isFinite(hoursRaw) || !Number.isFinite(minutesRaw)) return value;
	const suffix = hoursRaw >= 12 ? "PM" : "AM";
	const hours = hoursRaw % 12 || 12;
	return `${String(hours).padStart(2, "0")}:${String(minutesRaw).padStart(2, "0")} ${suffix}`;
};

const extractClockValue = (isoString?: string | null) => {
	if (!isoString) return "";
	try {
		const date = new Date(isoString);
		return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
	} catch {
		return "";
	}
};

const getDayKey = (value?: string | null) => {
	if (!value) return "";
	if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return "";
	const year = parsed.getFullYear();
	const month = String(parsed.getMonth() + 1).padStart(2, "0");
	const day = String(parsed.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
};

export function TimesheetDayEditor({
	day,
	isOpen,
	onClose,
	onSave,
	scheduleDefaultsLoading = false,
	defaultTimes,
}: TimesheetDayEditorProps) {
	const [timeIn, setTimeIn] = useState("");
	const [timeOut, setTimeOut] = useState("");
	const [shiftPreset, setShiftPreset] = useState<ShiftPreset>("scheduled");
	const [timeOutDayOffset, setTimeOutDayOffset] = useState<TimeOutDayOffset>("0");
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (day && isOpen) {
			const isDefaultOvernight = Boolean(defaultTimes?.isOvernight);
			const selectedTimeIn = extractClockValue(day.timeIn);
			const selectedTimeOut = extractClockValue(day.timeOut);
			const selectedDayKey = getDayKey(day.date);
			const selectedOutDayKey = getDayKey(day.timeOut);
			const selectedOutIsNextDay = Boolean(
				selectedTimeOut &&
					selectedDayKey &&
					selectedOutDayKey &&
					selectedOutDayKey > selectedDayKey,
			);
			setShiftPreset("scheduled");
			setTimeIn(selectedTimeIn || defaultTimes?.timeIn || "");
			setTimeOut(selectedTimeOut || defaultTimes?.timeOut || "");
			setTimeOutDayOffset(
				String(
					selectedOutIsNextDay
						? 1
						: (defaultTimes?.timeOutDayOffset ?? (isDefaultOvernight ? 1 : 0)),
				) as TimeOutDayOffset,
			);
		}
	}, [
		day,
		isOpen,
		defaultTimes?.timeIn,
		defaultTimes?.timeOut,
		defaultTimes?.isOvernight,
		defaultTimes?.timeOutDayOffset,
		day?.timeIn,
		day?.timeOut,
		day?.date,
	]);

	const handleShiftPresetChange = (value: ShiftPreset) => {
		setShiftPreset(value);
		if (value === "scheduled") {
			applyScheduledDefaults();
			return;
		}

		const preset = SHIFT_PRESETS[value];
		setTimeIn(preset.timeIn);
		setTimeOut(preset.timeOut);
		setTimeOutDayOffset(preset.isOvernight ? "1" : "0");
	};

	const applyScheduledDefaults = () => {
		setShiftPreset("scheduled");
		setTimeIn(defaultTimes?.timeIn || "");
		setTimeOut(defaultTimes?.timeOut || "");
		setTimeOutDayOffset(
			String(
				defaultTimes?.timeOutDayOffset ?? (defaultTimes?.isOvernight ? 1 : 0),
			) as TimeOutDayOffset,
		);
	};

	const handleSave = async () => {
		if (!day) return;

		const toMinutes = (value?: string | null) => {
			if (!value) return 0;
			const [h, m] = value.split(":").map(Number);
			if (Number.isNaN(h) || Number.isNaN(m)) return 0;
			return h * 60 + m;
		};

		const toTimeString = (minutes: number) => {
			const safe = Math.max(0, Math.floor(minutes));
			const h = Math.floor(safe / 60);
			const m = safe % 60;
			return `${h}:${String(m).padStart(2, "0")}`;
		};

		// Reconstruct ISO strings
		const constructISO = (timeStr: string, addDay = false) => {
			if (!timeStr) return null;
			const [hours, minutes] = timeStr.split(":").map(Number);
			const date = new Date(day.date);
			date.setHours(hours, minutes, 0, 0);
			if (addDay) {
				date.setDate(date.getDate() + 1);
			}
			return date.toISOString();
		};

		const actualInMinutes = toMinutes(timeIn);
		const actualOutMinutes = toMinutes(timeOut);
		const scheduleStartMinutes = toMinutes(defaultTimes?.scheduleStartTime || null);
		const scheduleEndMinutes = toMinutes(defaultTimes?.scheduleEndTime || null);
		const isOvernightSchedule =
			scheduleStartMinutes > 0 &&
			scheduleEndMinutes > 0 &&
			scheduleEndMinutes <= scheduleStartMinutes;
		const shouldRollTimeOutToNextDay =
			Boolean(timeIn) &&
			Boolean(timeOut) &&
			(timeOutDayOffset === "1" ||
				actualOutMinutes <= actualInMinutes ||
				isOvernightSchedule);

		const updatedDay = {
			...day,
			timeIn: constructISO(timeIn),
			timeOut: constructISO(timeOut, shouldRollTimeOutToNextDay),
		};
		const breakMinutes = Math.max(0, defaultTimes?.breakMinutes || 0);
		const breakDisplay = defaultTimes?.breakDisplay || "No break";
		const baseMetadata = {
			totalMinutes: updatedDay.metadata?.totalMinutes ?? 0,
			regularMinutes: updatedDay.metadata?.regularMinutes ?? 0,
			overtimeMinutes: updatedDay.metadata?.overtimeMinutes ?? 0,
			undertimeMinutes: updatedDay.metadata?.undertimeMinutes ?? 0,
			lateMinutes: updatedDay.metadata?.lateMinutes ?? 0,
			earlyOutMinutes: updatedDay.metadata?.earlyOutMinutes ?? 0,
			breakMinutes,
			breakDisplay,
		};

		// Recompute metrics for immediate UI preview (backend remains source of truth on submit/update).
		if (updatedDay.timeIn && updatedDay.timeOut) {
			const start = new Date(updatedDay.timeIn);
			const end = new Date(updatedDay.timeOut);
			const diffMs = end.getTime() - start.getTime();
			if (diffMs > 0) {
				const totalMinutes = Math.floor(diffMs / 60000);
				const workedMinutes = Math.max(0, totalMinutes - breakMinutes);

				const adjustedActualOutMinutes =
					actualOutMinutes <= actualInMinutes
						? actualOutMinutes + 24 * 60
						: actualOutMinutes;
				const adjustedScheduleEndMinutes = isOvernightSchedule
					? scheduleEndMinutes + 24 * 60
					: scheduleEndMinutes;
				const overtimeMinutes =
					scheduleEndMinutes > 0
						? Math.max(0, adjustedActualOutMinutes - adjustedScheduleEndMinutes)
						: 0;
				const lateMinutes =
					scheduleStartMinutes > 0
						? Math.max(0, actualInMinutes - scheduleStartMinutes)
						: 0;
				const earlyOutMinutes =
					scheduleEndMinutes > 0
						? Math.max(0, adjustedScheduleEndMinutes - adjustedActualOutMinutes)
						: 0;
				const undertimeMinutes = earlyOutMinutes;
				const regularMinutes = Math.max(0, workedMinutes - overtimeMinutes);

				updatedDay.hoursWorked = toTimeString(workedMinutes);
				updatedDay.status = "PRESENT";
				updatedDay.regularHours = toTimeString(regularMinutes);
				updatedDay.overtimeHours = toTimeString(overtimeMinutes);
				updatedDay.lateHours = toTimeString(lateMinutes);
				updatedDay.undertimeHours = toTimeString(undertimeMinutes);
				updatedDay.earlyOutHours = toTimeString(earlyOutMinutes);
				updatedDay.metadata = {
					...baseMetadata,
					totalMinutes: workedMinutes,
					regularMinutes,
					overtimeMinutes,
					undertimeMinutes,
					lateMinutes,
					earlyOutMinutes,
				};
			} else {
				updatedDay.hoursWorked = "0:00";
				updatedDay.status = "ABSENT";
				updatedDay.regularHours = "0:00";
				updatedDay.overtimeHours = "0:00";
				updatedDay.lateHours = "0:00";
				updatedDay.undertimeHours = "0:00";
				updatedDay.earlyOutHours = "0:00";
				updatedDay.metadata = baseMetadata;
			}
		} else {
			updatedDay.hoursWorked = "0:00";
			updatedDay.status = "ABSENT";
			updatedDay.regularHours = "0:00";
			updatedDay.overtimeHours = "0:00";
			updatedDay.lateHours = "0:00";
			updatedDay.undertimeHours = "0:00";
			updatedDay.earlyOutHours = "0:00";
			updatedDay.metadata = baseMetadata;
		}

		setIsSaving(true);
		try {
			await onSave(updatedDay);
		} finally {
			setIsSaving(false);
		}
	};

	if (!day) return null;
	const hasExistingDayTimes = Boolean(day.timeIn || day.timeOut);
	const disableTimeInputs = scheduleDefaultsLoading && !hasExistingDayTimes;
	const disableSave = (scheduleDefaultsLoading && !hasExistingDayTimes) || isSaving;
	const selectedShift =
		shiftPreset === "scheduled"
			? {
					label: defaultTimes?.shiftName || "Scheduled shift",
					isOvernight: Boolean(defaultTimes?.isOvernight || timeOutDayOffset === "1"),
				}
			: {
					...SHIFT_PRESETS[shiftPreset],
					isOvernight: timeOutDayOffset === "1",
				};
	const activeWindowDisplay = `${formatClock(timeIn)} - ${formatClock(timeOut)}${timeOutDayOffset === "1" ? " (+1 day)" : ""}`;

	const dateDisplay = new Date(day.date).toLocaleDateString("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
	});

	return (
		<Modal
			open={isOpen}
			onOpenChange={(open) => !open && onClose()}
			showCloseButton={false}
			className="sm:max-w-[520px] p-0 overflow-hidden">
			<div className="border-b border-gray-100 bg-gray-50 px-5 py-4">
				<div className="flex items-start justify-between gap-3">
					<div>
						<p className="text-sm font-semibold text-gray-900">{dateDisplay}</p>
						<p className="mt-0.5 text-xs text-gray-500">{activeWindowDisplay}</p>
					</div>
					<span
						className={`rounded border px-2 py-1 text-[11px] font-semibold ${
							selectedShift.isOvernight
								? "border-indigo-200 bg-indigo-50 text-indigo-700"
								: "border-gray-200 bg-white text-gray-600"
						}`}>
						{selectedShift.isOvernight ? "Night shift" : "Day shift"}
					</span>
				</div>
			</div>

			<div className="grid gap-4 px-5 py-5 pb-2">
				{scheduleDefaultsLoading && !hasExistingDayTimes && (
					<p className="text-[11px] text-gray-500">Loading schedule defaults...</p>
				)}
				<div className="grid gap-1.5">
					<div className="flex items-center justify-between gap-2">
						<Label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
							Shift basis
						</Label>
						<button
							type="button"
							onClick={applyScheduledDefaults}
							disabled={disableTimeInputs || isSaving || !defaultTimes?.timeIn}
							title="Use scheduled time in and time out"
							aria-label="Use scheduled time in and time out"
							className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40">
							<RotateCcw className="h-3.5 w-3.5" />
						</button>
					</div>
					<Select
						value={shiftPreset}
						onValueChange={(value) => handleShiftPresetChange(value as ShiftPreset)}
						disabled={disableTimeInputs || isSaving}>
						<SelectTrigger className="h-10 rounded-sm border-gray-200 bg-white text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="scheduled">Scheduled shift</SelectItem>
							<SelectItem value="day">Day shift</SelectItem>
							<SelectItem value="night">Night shift</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div className="grid gap-3 sm:grid-cols-2">
					<div className="grid gap-1.5">
						<Label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
							Time in
						</Label>
						<TimePicker
							value={timeIn}
							onChange={setTimeIn}
							disabled={disableTimeInputs || isSaving}
							className="h-10 rounded-sm border-gray-200 text-xs"
						/>
					</div>
					<div className="grid gap-1.5">
						<Label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
							Time out
						</Label>
						<TimePicker
							value={timeOut}
							onChange={setTimeOut}
							disabled={disableTimeInputs || isSaving}
							className="h-10 rounded-sm border-gray-200 text-xs"
						/>
					</div>
				</div>
				<div className="grid gap-3 sm:grid-cols-2">
					<div className="grid gap-1.5">
						<Label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
							Time out day
						</Label>
						<Select
							value={timeOutDayOffset}
							onValueChange={(value) =>
								setTimeOutDayOffset(value as TimeOutDayOffset)
							}
							disabled={disableTimeInputs || isSaving}>
							<SelectTrigger className="h-10 rounded-sm border-gray-200 bg-white text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="0">Same day</SelectItem>
								<SelectItem value="1">Next day (+1)</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="grid gap-1.5">
						<Label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
							Break schedule
						</Label>
						<input
							type="text"
							value={
								scheduleDefaultsLoading && !hasExistingDayTimes
									? "Loading schedule..."
									: defaultTimes?.breakDisplay || "No break"
							}
							disabled
							className="h-10 rounded-sm border border-gray-200 bg-gray-50 px-3 text-xs text-gray-500 cursor-not-allowed"
						/>
					</div>
				</div>
			</div>

			<div className="flex items-center justify-end gap-2 px-5 pb-5 pt-2">
				<Button
					variant="ghost"
					size="sm"
					onClick={onClose}
					disabled={isSaving}
					className="h-8 text-xs hover:bg-gray-100">
					Cancel
				</Button>
				<Button
					size="sm"
					onClick={handleSave}
					disabled={disableSave}
					className="h-8 px-4 text-xs font-medium text-white shadow-sm rounded-sm"
					style={{ backgroundColor: themeColors.orange }}>
					{isSaving ? "Saving..." : disableSave ? "Loading..." : "Save"}
				</Button>
			</div>
		</Modal>
	);
}
