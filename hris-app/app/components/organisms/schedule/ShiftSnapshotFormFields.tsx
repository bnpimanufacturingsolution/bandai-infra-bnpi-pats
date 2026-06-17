import { useEffect } from "react";
import { useFieldArray } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Select } from "~/components/atoms/Select";
import { ConstraintTokenRow } from "~/components/molecules/ConstraintTokens";
import { TimePicker } from "~/components/molecules/TimePicker";

type Props = {
	control: any;
	register: any;
	setValue: (...args: any[]) => void;
	watch: (name: string) => any;
	basePath?: string;
	includeIsActive?: boolean;
	defaultTimeSlots?: Array<{
		type: string;
		label?: string;
		startTime: string;
		endTime: string;
	}>;
};

const DEFAULT_TIME_SLOTS = [
	{ type: "work", label: "Morning Work", startTime: "08:00", endTime: "12:00" },
	{ type: "break", label: "Lunch Break", startTime: "12:00", endTime: "13:00" },
	{ type: "work", label: "Afternoon Work", startTime: "13:00", endTime: "17:00" },
];

const parseTimeToMinutes = (value?: string | null) => {
	const text = String(value || "")
		.trim()
		.toUpperCase()
		.replace(/\s+/g, "");
	if (!text) return null;
	const match = text.match(/^(\d{1,2}):(\d{2})(AM|PM)?$/);
	if (!match) return null;
	let hours = Number(match[1]);
	const minutes = Number(match[2]);
	const meridiem = match[3];
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
	if (minutes < 0 || minutes > 59) return null;
	if (meridiem) {
		if (hours < 1 || hours > 12) return null;
		if (meridiem === "AM") hours = hours === 12 ? 0 : hours;
		if (meridiem === "PM") hours = hours === 12 ? 12 : hours + 12;
	} else if (hours < 0 || hours > 23) {
		return null;
	}
	return hours * 60 + minutes;
};

const normalizeTimeForPicker = (value?: string | null) => {
	const minutes = parseTimeToMinutes(value);
	return minutes === null ? "" : formatMinutes(minutes);
};

const calculateShiftHour = (
	timeSlots: Array<{ type?: string | null; startTime?: string | null; endTime?: string | null }>,
) => {
	let previousEnd: number | null = null;
	const intervals = timeSlots
		.map((slot) => {
			const start = parseTimeToMinutes(slot.startTime);
			const end = parseTimeToMinutes(slot.endTime);
			if (start === null || end === null) return null;
			let absoluteStart = start;
			let absoluteEnd = end <= start ? end + 24 * 60 : end;
			if (previousEnd !== null) {
				const isNestedSameDaySlot = absoluteEnd <= previousEnd;
				const isLikelyPostMidnightSlot =
					previousEnd > 24 * 60 && absoluteStart < previousEnd % (24 * 60);
				if (isNestedSameDaySlot && isLikelyPostMidnightSlot) {
					absoluteStart += 24 * 60;
					absoluteEnd += 24 * 60;
				} else {
					while (absoluteStart < previousEnd && !isNestedSameDaySlot) {
						absoluteStart += 24 * 60;
						absoluteEnd += 24 * 60;
					}
				}
			}
			previousEnd = previousEnd === null ? absoluteEnd : Math.max(previousEnd, absoluteEnd);
			return {
				type: String(slot?.type || "").toLowerCase(),
				start: absoluteStart,
				end: absoluteEnd,
			};
		})
		.filter((interval): interval is { type: string; start: number; end: number } =>
			Boolean(interval),
		);
	const workIntervals = intervals.filter((interval) => interval.type === "work");
	const breakIntervals = intervals.filter((interval) => interval.type === "break");
	const workMinutes = workIntervals.reduce(
		(total, interval) => total + Math.max(0, interval.end - interval.start),
		0,
	);
	const breakOverlapMinutes = breakIntervals.reduce(
		(total, breakInterval) =>
			total +
			workIntervals.reduce((overlapTotal, workInterval) => {
				const overlapStart = Math.max(breakInterval.start, workInterval.start);
				const overlapEnd = Math.min(breakInterval.end, workInterval.end);
				return overlapTotal + Math.max(0, overlapEnd - overlapStart);
			}, 0),
		0,
	);
	return Number((Math.max(0, workMinutes - breakOverlapMinutes) / 60).toFixed(2));
};

const formatHour = (value: number) => `${value.toLocaleString()} hr${value === 1 ? "" : "s"}`;

const formatMinutes = (value: number) => {
	const normalized = ((value % (24 * 60)) + 24 * 60) % (24 * 60);
	const hours = Math.floor(normalized / 60);
	const minutes = normalized % 60;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const addMinutesToTime = (value?: string | null, minutesToAdd = 60) => {
	const minutes = parseTimeToMinutes(value);
	if (minutes === null) return "00:00";
	return formatMinutes(minutes + minutesToAdd);
};

const getShiftWindow = (
	timeSlots: Array<{ type?: string | null; startTime?: string | null; endTime?: string | null }>,
) => {
	const workSlots = timeSlots.filter((slot) => String(slot?.type || "").toLowerCase() === "work");
	const sourceSlots = workSlots.length > 0 ? workSlots : timeSlots;
	const firstSlot = sourceSlots.find((slot) => slot?.startTime);
	const lastSlot = [...sourceSlots].reverse().find((slot) => slot?.endTime);
	return {
		startTime: normalizeTimeForPicker(firstSlot?.startTime) || "",
		endTime: normalizeTimeForPicker(lastSlot?.endTime) || "",
	};
};

export function ShiftSnapshotFormFields({
	control,
	register,
	setValue,
	watch,
	basePath,
	includeIsActive = false,
	defaultTimeSlots = DEFAULT_TIME_SLOTS,
}: Props) {
	const path = (field: string) => (basePath ? `${basePath}.${field}` : field);
	const timeSlotsPath = path("timeSlots");
	const { fields, append, remove, replace } = useFieldArray({
		control,
		name: timeSlotsPath as any,
	});
	const isOff = Boolean(watch(path("isOff")));
	const watchedName = watch(path("name")) || "";
	const watchedCode = watch(path("code")) || "";
	const watchedTimeSlots = watch(timeSlotsPath) || [];
	const shiftHour = isOff
		? 0
		: calculateShiftHour(Array.isArray(watchedTimeSlots) ? watchedTimeSlots : []);
	const shiftWindow = getShiftWindow(Array.isArray(watchedTimeSlots) ? watchedTimeSlots : []);

	const appendSlot = (type: "work" | "break") => {
		const lastSlot = Array.isArray(watchedTimeSlots)
			? watchedTimeSlots[watchedTimeSlots.length - 1]
			: null;
		const startTime = addMinutesToTime(lastSlot?.endTime, 0);
		append({
			type,
			label: type === "break" ? "Break" : "Work Slot",
			startTime,
			endTime: addMinutesToTime(startTime, type === "break" ? 60 : 240),
		});
	};

	useEffect(() => {
		setValue(path("shiftHour"), shiftHour, { shouldDirty: false, shouldValidate: false });
	}, [setValue, shiftHour]);

	return (
		<div className="space-y-3">
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_112px_112px_132px]">
				<div>
					<label className="mb-0.5 block text-xs font-medium text-muted-foreground/70">
						Name
					</label>
					<Input {...register(path("name"))} placeholder="Morning Shift" />
					<ConstraintTokenRow
						tokens={[
							{ label: "1+", tone: watchedName.trim() ? "default" : "invalid" },
							{ label: "A-Z", tone: "subtle" },
						]}
					/>
				</div>
				<div>
					<label className="mb-0.5 block text-xs font-medium text-muted-foreground/70">
						Code
					</label>
					<Input {...register(path("code"))} placeholder="MORNING" />
					<ConstraintTokenRow
						tokens={[
							{ label: "1+", tone: watchedCode.trim() ? "default" : "invalid" },
							{ label: "Aa1", tone: "subtle" },
						]}
					/>
				</div>
				<div>
					<label className="mb-0.5 block text-xs font-medium text-muted-foreground/70">
						Start
					</label>
					<Input
						value={isOff ? "--:--" : shiftWindow.startTime || "--:--"}
						disabled
						readOnly
						className="bg-muted/35 font-mono"
					/>
					<ConstraintTokenRow tokens={[{ label: "from slots", tone: "subtle" }]} />
				</div>
				<div>
					<label className="mb-0.5 block text-xs font-medium text-muted-foreground/70">
						End
					</label>
					<Input
						value={isOff ? "--:--" : shiftWindow.endTime || "--:--"}
						disabled
						readOnly
						className="bg-muted/35 font-mono"
					/>
					<ConstraintTokenRow tokens={[{ label: "from slots", tone: "subtle" }]} />
				</div>
				<div>
					<label className="mb-0.5 block text-xs font-medium text-muted-foreground/70">
						Shift Hour
					</label>
					<Input
						value={formatHour(shiftHour)}
						disabled
						readOnly
						className="bg-muted/35"
					/>
					<ConstraintTokenRow tokens={[{ label: "computed", tone: "subtle" }]} />
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-0.5">
				<label className="flex items-center gap-1.5 text-xs text-gray-700">
					<input
						type="checkbox"
						className="accent-primary h-3.5 w-3.5 rounded"
						checked={Boolean(watch(path("isOvernight")))}
						onChange={(event) => setValue(path("isOvernight"), event.target.checked)}
					/>
					Overnight
				</label>
				<label className="flex items-center gap-1.5 text-xs text-gray-700">
					<input
						type="checkbox"
						className="accent-primary h-3.5 w-3.5 rounded"
						checked={Boolean(watch(path("isOff")))}
						onChange={(event) => setValue(path("isOff"), event.target.checked)}
					/>
					Off-day
				</label>
				{includeIsActive ? (
					<label className="flex items-center gap-1.5 text-xs text-gray-700">
						<input
							type="checkbox"
							className="accent-primary h-3.5 w-3.5 rounded"
							checked={Boolean(watch(path("isActive")))}
							onChange={(event) => setValue(path("isActive"), event.target.checked)}
						/>
						Active
					</label>
				) : null}
			</div>

			<div className="rounded-lg border border-border overflow-hidden">
				<div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
					<p className="text-xs font-medium text-foreground">Time Slots</p>
					<div className="flex items-center gap-1.5">
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-7 gap-1 px-2 text-xs"
							onClick={() => appendSlot("work")}>
							<Plus className="h-3 w-3" />
							Work Slot
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-7 gap-1 px-2 text-xs"
							onClick={() => appendSlot("break")}>
							<Plus className="h-3 w-3" />
							Break Slot
						</Button>
					</div>
				</div>
				<div className="p-2.5">
					{isOff ? (
						<div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
							Off-day shift types do not need time slots.
						</div>
					) : (
						<div className="space-y-2">
							{fields.map((field, index) => (
								<div
									key={field.id}
									className="space-y-2 rounded-md border border-border bg-muted/20 p-2">
									<div className="grid gap-2 lg:grid-cols-[112px_minmax(0,1fr)_104px_104px_32px] lg:items-start">
										<div>
											<label className="mb-1 block text-[11px] font-medium text-muted-foreground">
												Type
											</label>
											<Select
												options={[
													{ value: "work", label: "WORK" },
													{ value: "break", label: "BREAK" },
												]}
												value={
													watch(`${timeSlotsPath}.${index}.type`) ||
													"work"
												}
												onChange={(value) =>
													setValue(
														`${timeSlotsPath}.${index}.type`,
														value || "work",
														{
															shouldDirty: true,
															shouldValidate: true,
														},
													)
												}
											/>
										</div>
										<div>
											<label className="mb-1 block text-[11px] font-medium text-muted-foreground">
												Label
											</label>
											<Input
												{...register(`${timeSlotsPath}.${index}.label`)}
												placeholder="Label"
											/>
										</div>
										<div>
											<label className="mb-1 block text-[11px] font-medium text-muted-foreground">
												Start
											</label>
											<TimePicker
												className="w-full whitespace-nowrap"
												value={normalizeTimeForPicker(
													watch(`${timeSlotsPath}.${index}.startTime`),
												)}
												onChange={(value) =>
													setValue(
														`${timeSlotsPath}.${index}.startTime`,
														value,
														{
															shouldDirty: true,
															shouldValidate: true,
														},
													)
												}
											/>
										</div>
										<div>
											<label className="mb-1 block text-[11px] font-medium text-muted-foreground">
												End
											</label>
											<TimePicker
												className="w-full whitespace-nowrap"
												value={normalizeTimeForPicker(
													watch(`${timeSlotsPath}.${index}.endTime`),
												)}
												onChange={(value) =>
													setValue(
														`${timeSlotsPath}.${index}.endTime`,
														value,
														{
															shouldDirty: true,
															shouldValidate: true,
														},
													)
												}
											/>
										</div>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="mt-5 h-8 w-8 justify-self-end p-0 text-muted-foreground hover:text-destructive lg:justify-self-auto"
											onClick={() =>
												fields.length > 1
													? remove(index)
													: replace(defaultTimeSlots)
											}>
											<Trash2 className="h-3.5 w-3.5" />
										</Button>
									</div>
									<ConstraintTokenRow
										className="mt-0"
										tokens={[
											{ label: "HH:MM", tone: "subtle" },
											{ label: "Start-End", tone: "subtle" },
										]}
									/>
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
