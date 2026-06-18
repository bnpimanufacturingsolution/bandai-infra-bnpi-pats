import { Plus, Trash2 } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Select } from "~/components/atoms/Select";
import { TimePicker } from "~/components/molecules/TimePicker";
import type { ScheduleEditorShift, ScheduleEditorTimeSlot } from "./ScheduleEditorForm";

interface WeeklyShiftEditorProps {
	shifts: ScheduleEditorShift[];
	selectedDay: number;
	onSelectedDayChange: (index: number) => void;
	onToggleRestDay: (dayIndex: number) => void;
	onAddTimeSlot: (dayIndex: number) => void;
	onUpdateTimeSlot: (
		dayIndex: number,
		slotIndex: number,
		field: keyof ScheduleEditorTimeSlot,
		value: string,
	) => void;
	onRemoveTimeSlot: (dayIndex: number, slotIndex: number) => void;
	onApplySelectedDayToAll?: () => void;
}

const dayChipLabels = ["M", "T", "W", "Th", "F", "Sa", "Su"];

export function WeeklyShiftEditor({
	shifts,
	selectedDay,
	onSelectedDayChange,
	onToggleRestDay,
	onAddTimeSlot,
	onUpdateTimeSlot,
	onRemoveTimeSlot,
	onApplySelectedDayToAll,
}: WeeklyShiftEditorProps) {
	const currentShift = shifts[selectedDay];

	return (
		<div className="border-t pt-6">
			<div className="mb-4 flex items-center justify-between">
				<h3 className="text-lg font-medium text-gray-900">Weekly Shift Configuration</h3>
				{onApplySelectedDayToAll && (
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={onApplySelectedDayToAll}>
						Apply Day To All
					</Button>
				)}
			</div>

			<div className="grid grid-cols-7 gap-2 mb-4">
				{shifts.map((day, index) => {
					const hasNoSlots =
						!day.isRestDay && (!day.timeSlots || day.timeSlots.length === 0);
					return (
						<button
							key={day.label}
							type="button"
							onClick={() => onSelectedDayChange(index)}
							className={`w-full p-2 rounded-lg text-center transition-all text-xs ${
								selectedDay === index
									? "bg-orange-500 text-white shadow-md"
									: day.isRestDay
										? "bg-gray-200 text-gray-500"
										: hasNoSlots
											? "bg-red-50 text-red-700 border-2 border-red-300 hover:border-red-400"
											: "bg-white text-gray-700 border-2 border-gray-200 hover:border-orange-300"
							}`}>
							<div className="font-semibold">{dayChipLabels[index] || day.label}</div>
							<div className="text-xs mt-0.5">
								{day.isRestDay
									? "Rest"
									: hasNoSlots
										? "No slots"
										: `${day.timeSlots?.length || 0} slots`}
							</div>
						</button>
					);
				})}
			</div>

			<div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
				<div className="flex items-center justify-between mb-4">
					<div>
						<h4 className="text-base font-semibold text-gray-900">
							{currentShift?.label || "Day"} Schedule
						</h4>
						<p className="text-xs text-gray-500 mt-0.5">
							{currentShift?.isRestDay
								? "This day is marked as a rest day"
								: `${currentShift?.timeSlots?.length || 0} time slot(s) configured`}
						</p>
					</div>
					<label className="flex items-center gap-2 cursor-pointer">
						<input
							type="checkbox"
							checked={!!currentShift?.isRestDay}
							onChange={() => onToggleRestDay(selectedDay)}
							className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
						/>
						<span className="text-sm font-medium text-gray-700">Rest Day</span>
					</label>
				</div>

				{currentShift?.isRestDay ? (
					<div className="text-center py-8 text-sm text-gray-500">
						This is a rest day.
					</div>
				) : (
					<div className="space-y-4">
						{(currentShift?.timeSlots || []).map((slot, slotIndex) => (
							<div
								key={`${selectedDay}-${slotIndex}`}
								className="grid grid-cols-1 md:[grid-template-columns:1.1fr_1.5fr_minmax(132px,1fr)_minmax(132px,1fr)_44px] gap-3 items-center p-4 bg-white rounded-lg border">
								<div className="min-w-0">
									<Select
										options={[
											{ value: "work", label: "Work" },
											{ value: "break", label: "Break" },
										]}
										value={slot.type}
										onChange={(value) =>
											onUpdateTimeSlot(selectedDay, slotIndex, "type", value)
										}
										placeholder="Type"
									/>
								</div>
								<div className="min-w-0">
									<Input
										className="w-full h-10 truncate"
										value={slot.label || ""}
										onChange={(event) =>
											onUpdateTimeSlot(
												selectedDay,
												slotIndex,
												"label",
												event.target.value,
											)
										}
										placeholder="Label"
									/>
								</div>
								<div className="min-w-0">
									<TimePicker
										className="w-full whitespace-nowrap"
										value={slot.startTime}
										onChange={(value) =>
											onUpdateTimeSlot(
												selectedDay,
												slotIndex,
												"startTime",
												value,
											)
										}
									/>
								</div>
								<div className="min-w-0">
									<TimePicker
										className="w-full whitespace-nowrap"
										value={slot.endTime}
										onChange={(value) =>
											onUpdateTimeSlot(
												selectedDay,
												slotIndex,
												"endTime",
												value,
											)
										}
									/>
								</div>
								<div className="flex items-center md:justify-end">
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="h-9 w-9 p-0 shrink-0"
										onClick={() => onRemoveTimeSlot(selectedDay, slotIndex)}>
										<Trash2 className="h-3 w-3" />
									</Button>
								</div>
							</div>
						))}

						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => onAddTimeSlot(selectedDay)}>
							<Plus className="mr-1 h-3 w-3" />
							Add Time Slot
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
