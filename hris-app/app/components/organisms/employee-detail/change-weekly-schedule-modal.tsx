import { useEffect, useMemo, useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { Select } from "~/components/atoms/Select";
import { useCreateEmployeeSchedule } from "~/lib/hooks";
import {
	buildDefaultWeeklyHoursDays,
	buildWeeklyHoursPatternPayload,
	daysFromEmbeddedPattern,
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
	const [days, setDays] = useState<WeeklyHoursDayDraft[]>(() =>
		daysFromEmbeddedPattern(employee.embeddedSchedule?.pattern, employee.embeddedSchedule?.cycleDays),
	);

	useEffect(() => {
		if (!open) return;
		setDays(
			daysFromEmbeddedPattern(
				employee.embeddedSchedule?.pattern,
				employee.embeddedSchedule?.cycleDays,
			),
		);
	}, [open, employee.embeddedSchedule]);

	const cycleDays = days.length;
	const weekCount = Math.max(1, Math.ceil(cycleDays / 7));
	const validationError = useMemo(() => validateWeeklyHoursDays(days), [days]);

	const updateDay = (index: number, patch: Partial<WeeklyHoursDayDraft>) => {
		setDays((current) =>
			current.map((day, dayIndex) => (dayIndex === index ? { ...day, ...patch } : day)),
		);
	};

	const handleClose = () => {
		if (createSchedule.isPending) return;
		onOpenChange(false);
	};

	const handleSave = async () => {
		if (validationError) {
			toast.error(validationError);
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

	return (
		<Modal
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) handleClose();
			}}
			title="Change weekly hours"
			description={
				employeeName
					? `Set different start and end times for each weekday for ${employeeName}.`
					: "Set different start and end times for each weekday."
			}
			className="max-w-2xl border border-gray-200 bg-white p-5 sm:p-6">
			<div className="space-y-4">
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div className="min-w-[140px]">
						<label className="mb-1.5 block text-xs font-medium text-muted-foreground">
							Cycle
						</label>
						<Select
							options={WEEK_OPTIONS}
							value={String(cycleDays)}
							onChange={(value) => setDays((current) => resizeDays(current, Number(value || 7)))}
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

				{validationError ? (
					<p className="text-sm text-red-700">{validationError}</p>
				) : null}

				<div className="flex items-center justify-end gap-2">
					<Button type="button" variant="outline" onClick={handleClose} disabled={createSchedule.isPending}>
						Cancel
					</Button>
					<Button type="button" onClick={handleSave} disabled={createSchedule.isPending || Boolean(validationError)}>
						{createSchedule.isPending ? (
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
