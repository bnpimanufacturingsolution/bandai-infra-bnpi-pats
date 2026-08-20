import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Calendar as CalendarIcon, Clock, Loader2 } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { Select } from "~/components/atoms/Select";
import { CalendarDatePicker } from "~/components/ui/calendar-date-picker";
import { useCreateEmployeeSchedule, useCreateScheduleOverride } from "~/lib/hooks";
import { cn } from "~/lib/utils";
import {
	buildDateHoursShiftSnapshot,
	buildDefaultWeeklyHoursDays,
	buildWeeklyHoursPatternPayload,
	daysFromEmbeddedPattern,
	hoursDraftForDate,
	toDateInputValue,
	validateDateHours,
	validateWeeklyHoursDays,
	type WeeklyHoursDayDraft,
} from "~/lib/utils/weekly-hours-schedule";
import type { Employee } from "~/services/employees.service";
import { toast } from "sonner";

const WEEK_OPTIONS = [
	{ value: "7", label: "1 week" },
	{ value: "14", label: "2 weeks" },
];

const STATUS_OPTIONS = [
	{ value: "work", label: "Work" },
	{ value: "off", label: "Off" },
];

type ScheduleMode = "days" | "dates";

interface ChangeWeeklyScheduleModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	employee: Employee;
	employeeName?: string;
}

const resizeDays = (days: WeeklyHoursDayDraft[], cycleDays: number) => {
	const next = buildDefaultWeeklyHoursDays(cycleDays);
	return next.map((day, index) => {
		const source = days[index] || days[index % 7];
		if (!source) return day;
		return {
			...day,
			isOff: source.isOff,
			startTime: source.startTime,
			endTime: source.endTime,
		};
	});
};

export function ChangeWeeklyScheduleModal({
	open,
	onOpenChange,
	employee,
	employeeName,
}: ChangeWeeklyScheduleModalProps) {
	const createSchedule = useCreateEmployeeSchedule();
	const createOverride = useCreateScheduleOverride();
	const [mode, setMode] = useState<ScheduleMode>("days");
	const [days, setDays] = useState<WeeklyHoursDayDraft[]>(() =>
		daysFromEmbeddedPattern(employee.embeddedSchedule?.pattern, employee.embeddedSchedule?.cycleDays),
	);
	const [selectedDate, setSelectedDate] = useState(toDateInputValue());
	const [dateIsOff, setDateIsOff] = useState(false);
	const [dateStartTime, setDateStartTime] = useState("08:00");
	const [dateEndTime, setDateEndTime] = useState("17:00");

	const applyDatePrefill = (nextDate: string, sourceDays = days) => {
		const draft = hoursDraftForDate(sourceDays, nextDate);
		setSelectedDate(nextDate);
		setDateIsOff(draft.isOff);
		setDateStartTime(draft.startTime);
		setDateEndTime(draft.endTime);
	};

	useEffect(() => {
		if (!open) return;
		const nextDays = daysFromEmbeddedPattern(
			employee.embeddedSchedule?.pattern,
			employee.embeddedSchedule?.cycleDays,
		);
		setMode("days");
		setDays(nextDays);
		applyDatePrefill(toDateInputValue(), nextDays);
	}, [open, employee.embeddedSchedule]);

	const cycleDays = days.length;
	const weekCount = Math.max(1, Math.ceil(cycleDays / 7));
	const daysValidationError = useMemo(() => validateWeeklyHoursDays(days), [days]);
	const datesValidationError = useMemo(
		() =>
			validateDateHours({
				date: selectedDate,
				isOff: dateIsOff,
				startTime: dateStartTime,
				endTime: dateEndTime,
			}),
		[dateEndTime, dateIsOff, dateStartTime, selectedDate],
	);
	const isPending = createSchedule.isPending || createOverride.isPending;
	const validationError = mode === "days" ? daysValidationError : datesValidationError;

	const updateDay = (index: number, patch: Partial<WeeklyHoursDayDraft>) => {
		setDays((current) =>
			current.map((day, dayIndex) => (dayIndex === index ? { ...day, ...patch } : day)),
		);
	};

	const handleClose = () => {
		if (isPending) return;
		onOpenChange(false);
	};

	const handleSaveDays = async () => {
		if (daysValidationError) {
			toast.error(daysValidationError);
			return;
		}
		try {
			await createSchedule.mutateAsync({
				employeeId: employee.id,
				pattern: buildWeeklyHoursPatternPayload(days),
				reason: "weekly_hours_assignment",
			});
			onOpenChange(false);
		} catch {
			// toast handled in hook
		}
	};

	const handleSaveDate = async () => {
		if (datesValidationError) {
			toast.error(datesValidationError);
			return;
		}
		try {
			await createOverride.mutateAsync({
				employeeId: employee.id,
				organizationId: employee.organizationId,
				date: selectedDate,
				shiftSnapshot: buildDateHoursShiftSnapshot({
					isOff: dateIsOff,
					startTime: dateStartTime,
					endTime: dateEndTime,
				}),
				reason: "date_hours_override",
			});
			onOpenChange(false);
		} catch {
			// toast handled in hook
		}
	};

	const handleSave = () => {
		if (mode === "dates") return handleSaveDate();
		return handleSaveDays();
	};

	return (
		<Modal
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) handleClose();
			}}
			title="Change schedule"
			description={
				employeeName
					? `Set hours for ${employeeName} by weekday or by one calendar date.`
					: "Set hours by weekday or by one calendar date."
			}
			className="max-w-2xl border border-gray-200 bg-white p-5 sm:p-6">
			<div className="space-y-4">
				<div
					className="flex w-fit space-x-1 rounded-lg bg-gray-100 p-1"
					role="tablist"
					aria-label="Schedule change mode">
					<button
						type="button"
						role="tab"
						aria-selected={mode === "days"}
						data-testid="schedule-mode-days"
						onClick={() => setMode("days")}
						className={cn(
							"inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium",
							mode === "days" ? "bg-white text-orange-600 shadow-sm" : "text-gray-600",
						)}>
						<CalendarDays className="h-4 w-4" />
						Days
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={mode === "dates"}
						data-testid="schedule-mode-dates"
						onClick={() => setMode("dates")}
						className={cn(
							"inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium",
							mode === "dates" ? "bg-white text-orange-600 shadow-sm" : "text-gray-600",
						)}>
						<CalendarIcon className="h-4 w-4" />
						Dates
					</button>
				</div>

				{mode === "days" ? (
					<>
						<div className="flex flex-wrap items-end justify-between gap-3">
							<div className="min-w-[140px]">
								<label className="mb-1.5 block text-xs font-medium text-muted-foreground">
									Cycle
								</label>
								<Select
									options={WEEK_OPTIONS}
									value={String(cycleDays)}
									onChange={(value) =>
										setDays((current) => resizeDays(current, Number(value || 7)))
									}
								/>
							</div>
							<p className="text-xs text-muted-foreground">
								Takes effect next Monday. Attendance late/undertime uses these hours.
							</p>
						</div>

						<div className="space-y-3">
							{Array.from({ length: weekCount }).map((_, weekIndex) => {
								const weekDays = days.slice(weekIndex * 7, weekIndex * 7 + 7);
								return (
									<div key={`week-${weekIndex}`}>
										{weekCount > 1 ? (
											<p className="mb-2 text-xs font-medium text-muted-foreground">
												Week {weekIndex + 1}
											</p>
										) : null}
										<div className="overflow-hidden rounded-lg border border-border">
											<div className="grid grid-cols-[56px_minmax(88px,1fr)_1fr_1fr] gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-medium text-muted-foreground">
												<span>Day</span>
												<span>Status</span>
												<span>Start</span>
												<span>End</span>
											</div>
											{weekDays.map((day, localIndex) => {
												const index = weekIndex * 7 + localIndex;
												return (
													<div
														key={day.day}
														className="grid grid-cols-[56px_minmax(88px,1fr)_1fr_1fr] items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
														<span className="text-sm font-medium text-foreground">
															{day.label}
														</span>
														<Select
															options={STATUS_OPTIONS}
															value={day.isOff ? "off" : "work"}
															onChange={(value) =>
																updateDay(index, { isOff: value === "off" })
															}
														/>
														<input
															type="time"
															aria-label={`${day.label} start`}
															disabled={day.isOff}
															value={day.startTime}
															onChange={(event) =>
																updateDay(index, { startTime: event.target.value })
															}
															className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
														/>
														<input
															type="time"
															aria-label={`${day.label} end`}
															disabled={day.isOff}
															value={day.endTime}
															onChange={(event) =>
																updateDay(index, { endTime: event.target.value })
															}
															className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
														/>
													</div>
												);
											})}
										</div>
									</div>
								);
							})}
						</div>
					</>
				) : (
					<div className="space-y-4">
						<p className="text-xs text-muted-foreground">
							Pick a real calendar date. Hours apply on that date only, not next Monday.
						</p>
						<div>
							<label className="mb-1.5 block text-xs font-medium text-muted-foreground">
								Date
							</label>
							<CalendarDatePicker
								value={selectedDate}
								onChange={(value) => applyDatePrefill(value)}
								placeholder="Pick a date"
							/>
						</div>
						<div className="overflow-hidden rounded-lg border border-border">
							<div className="grid grid-cols-[minmax(88px,1fr)_1fr_1fr] gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-medium text-muted-foreground">
								<span>Status</span>
								<span>Start</span>
								<span>End</span>
							</div>
							<div className="grid grid-cols-[minmax(88px,1fr)_1fr_1fr] items-center gap-2 px-3 py-2">
								<Select
									options={STATUS_OPTIONS}
									value={dateIsOff ? "off" : "work"}
									onChange={(value) => setDateIsOff(value === "off")}
								/>
								<input
									type="time"
									aria-label="Date start"
									disabled={dateIsOff}
									value={dateStartTime}
									onChange={(event) => setDateStartTime(event.target.value)}
									className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
								/>
								<input
									type="time"
									aria-label="Date end"
									disabled={dateIsOff}
									value={dateEndTime}
									onChange={(event) => setDateEndTime(event.target.value)}
									className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
								/>
							</div>
						</div>
					</div>
				)}

				{validationError ? (
					<p className="text-sm text-red-700">{validationError}</p>
				) : null}

				<div className="flex items-center justify-end gap-2">
					<Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={handleSave}
						disabled={isPending || Boolean(validationError)}>
						{isPending ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Clock className="h-4 w-4" />
						)}
						Save hours
					</Button>
				</div>
			</div>
		</Modal>
	);
}
