import { ScheduleBasicFields } from "./ScheduleBasicFields";
import { ScheduleFormActions } from "./ScheduleFormActions";
import { WeeklyShiftEditor } from "./WeeklyShiftEditor";

export type ScheduleEditorTimeSlot = {
	type: string;
	label?: string;
	startTime: string;
	endTime: string;
};

export type ScheduleEditorShift = {
	label: string;
	isRestDay?: boolean;
	timeSlots?: ScheduleEditorTimeSlot[];
};

export type ScheduleEditorValue = {
	name: string;
	code: string;
	description?: string;
	startDate: string;
	endDate: string;
	totalHours?: number;
	gracePeriodMinutes?: number;
	isActive?: boolean;
	shifts: ScheduleEditorShift[];
};

interface ScheduleEditorFormProps {
	value: ScheduleEditorValue;
	selectedDay: number;
	onSelectedDayChange: (index: number) => void;
	onFieldChange: (patch: Partial<ScheduleEditorValue>) => void;
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
	onSubmit: () => void;
	onCancel: () => void;
	submitLabel: string;
	submitting?: boolean;
	lockCode?: boolean;
	showActiveToggle?: boolean;
	departmentField?: React.ReactNode;
	topContent?: React.ReactNode;
	bottomContent?: React.ReactNode;
}

export function ScheduleEditorForm({
	value,
	selectedDay,
	onSelectedDayChange,
	onFieldChange,
	onToggleRestDay,
	onAddTimeSlot,
	onUpdateTimeSlot,
	onRemoveTimeSlot,
	onApplySelectedDayToAll,
	onSubmit,
	onCancel,
	submitLabel,
	submitting = false,
	lockCode = false,
	showActiveToggle = false,
	departmentField,
	topContent,
	bottomContent,
}: ScheduleEditorFormProps) {
	const shifts = value.shifts || [];

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit();
			}}
			className="space-y-6">
			{topContent}
			<ScheduleBasicFields
				value={value}
				onFieldChange={onFieldChange}
				lockCode={lockCode}
				showActiveToggle={showActiveToggle}
				departmentField={departmentField}
			/>

			<WeeklyShiftEditor
				shifts={shifts}
				selectedDay={selectedDay}
				onSelectedDayChange={onSelectedDayChange}
				onToggleRestDay={onToggleRestDay}
				onAddTimeSlot={onAddTimeSlot}
				onUpdateTimeSlot={onUpdateTimeSlot}
				onRemoveTimeSlot={onRemoveTimeSlot}
				onApplySelectedDayToAll={onApplySelectedDayToAll}
			/>

			{bottomContent}

			<ScheduleFormActions
				onCancel={onCancel}
				submitLabel={submitLabel}
				submitting={submitting}
			/>
		</form>
	);
}
