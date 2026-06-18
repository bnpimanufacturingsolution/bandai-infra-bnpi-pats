import { Input } from "~/components/atoms/Input";
import { CalendarDatePicker } from "~/components/ui/calendar-date-picker";
import type { ScheduleEditorValue } from "./ScheduleEditorForm";

interface ScheduleBasicFieldsProps {
	value: ScheduleEditorValue;
	onFieldChange: (patch: Partial<ScheduleEditorValue>) => void;
	lockCode?: boolean;
	showActiveToggle?: boolean;
	departmentField?: React.ReactNode;
}

export function ScheduleBasicFields({
	value,
	onFieldChange,
	lockCode = false,
	showActiveToggle = false,
	departmentField,
}: ScheduleBasicFieldsProps) {
	const startDateObj = value.startDate ? new Date(value.startDate) : undefined;

	return (
		<div className="space-y-4">
			{departmentField}

			<div>
				<label className="block text-sm font-medium text-foreground mb-1">
					Schedule Name *
				</label>
				<Input
					value={value.name}
					onChange={(event) => onFieldChange({ name: event.target.value })}
					placeholder="e.g., Morning Shift, Weekend Schedule"
				/>
			</div>

			<div>
				<label className="block text-sm font-medium text-foreground mb-1">
					Schedule Code *
				</label>
				<Input
					value={value.code}
					onChange={(event) => onFieldChange({ code: event.target.value })}
					placeholder="e.g., MORNING_SHIFT"
					disabled={lockCode}
				/>
			</div>

			<div>
				<label className="block text-sm font-medium text-foreground mb-1">
					Description
				</label>
				<Input
					value={value.description || ""}
					onChange={(event) => onFieldChange({ description: event.target.value })}
					placeholder="Optional description"
				/>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div>
					<label className="block text-sm font-medium text-foreground mb-1">
						Start Date *
					</label>
					<CalendarDatePicker
						value={value.startDate}
						onChange={(nextValue) => onFieldChange({ startDate: nextValue })}
						placeholder="Select start date"
					/>
				</div>
				<div>
					<label className="block text-sm font-medium text-foreground mb-1">
						End Date *
					</label>
					<CalendarDatePicker
						value={value.endDate}
						onChange={(nextValue) => onFieldChange({ endDate: nextValue })}
						minDate={startDateObj}
						placeholder="Select end date"
					/>
				</div>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div>
					<label className="block text-sm font-medium text-foreground mb-1">
						Total Hours per Week
					</label>
					<Input
						type="number"
						step="0.5"
						min="0"
						value={String(value.totalHours ?? 0)}
						onChange={(event) =>
							onFieldChange({
								totalHours: Math.max(0, Number(event.target.value || 0)),
							})
						}
					/>
				</div>
				<div>
					<label className="block text-sm font-medium text-foreground mb-1">
						Grace Period (minutes)
					</label>
					<Input
						type="number"
						min="0"
						step="1"
						value={String(value.gracePeriodMinutes ?? 0)}
						onChange={(event) =>
							onFieldChange({
								gracePeriodMinutes: Math.max(0, Number(event.target.value || 0)),
							})
						}
					/>
				</div>
			</div>

			{showActiveToggle && (
				<div className="flex items-center gap-2">
					<input
						id="schedule-editor-isActive"
						type="checkbox"
						className="rounded border-gray-300"
						checked={!!value.isActive}
						onChange={(event) => onFieldChange({ isActive: event.target.checked })}
					/>
					<label
						htmlFor="schedule-editor-isActive"
						className="text-sm font-medium text-gray-700">
						Active
					</label>
				</div>
			)}
		</div>
	);
}
