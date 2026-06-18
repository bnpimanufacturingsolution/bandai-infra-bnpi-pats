import type React from "react";
import { FormInput } from "~/components/atoms/form/form-input";
import { FormSelect } from "~/components/atoms/form/form-select";

const calendarTypes = ["Company", "Department", "Regional"];

interface CalendarDetailsFormProps {
	formData: {
		name: string;
		year: number;
		type: "COMPANY" | "DEPARTMENT" | "REGIONAL";
	};
	onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
	onTypeSelect: (type: string) => void;
}

export function CalendarDetailsForm({
	formData,
	onInputChange,
	onTypeSelect,
}: CalendarDetailsFormProps) {
	const yearOptions = [2025, 2026, 2027, 2028].map((year) => ({
		value: year,
		label: year.toString(),
	}));

	const typeOptions = calendarTypes.map((type) => ({
		value: type.toUpperCase(),
		label: type,
	}));

	return (
		<div className="space-y-6">
			<FormInput
				label="Calendar Name"
				name="name"
				value={formData.name}
				onChange={onInputChange}
				placeholder="e.g., Company Calendar 2025"
			/>

			<div className="grid grid-cols-2 gap-4">
				<FormSelect
					label="Year"
					name="year"
					value={formData.year}
					onChange={(value) => {
						const event = {
							target: { name: "year", value },
						} as React.ChangeEvent<HTMLSelectElement>;
						onInputChange(event);
					}}
					options={yearOptions}
				/>

				<FormSelect
					label="Calendar Type"
					name="type"
					value={formData.type}
					onChange={onTypeSelect}
					options={typeOptions}
				/>
			</div>
		</div>
	);
}
