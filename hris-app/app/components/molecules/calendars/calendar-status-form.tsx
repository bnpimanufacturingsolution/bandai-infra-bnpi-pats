import { StatusButton } from "~/components/atoms/form/status-button";

interface CalendarStatusFormProps {
	isActive: boolean;
	onStatusChange: (isActive: boolean) => void;
}

export function CalendarStatusForm({ isActive, onStatusChange }: CalendarStatusFormProps) {
	return (
		<div className="space-y-6">
			<div>
				<label className="block text-sm font-medium text-foreground mb-3">Status</label>
				<div className="grid grid-cols-2 gap-3">
					<StatusButton
						label="Active"
						isSelected={isActive}
						onClick={() => onStatusChange(true)}
					/>
					<StatusButton
						label="Inactive"
						isSelected={!isActive}
						onClick={() => onStatusChange(false)}
					/>
				</div>
			</div>
		</div>
	);
}
