import { Button } from "~/components/atoms/Button";

interface ScheduleFormActionsProps {
	onCancel: () => void;
	submitLabel: string;
	submitting?: boolean;
}

export function ScheduleFormActions({
	onCancel,
	submitLabel,
	submitting = false,
}: ScheduleFormActionsProps) {
	return (
		<div className="flex justify-end gap-3 pt-4 bg-gray-50 -mx-6 -mb-6 p-6 border-t mt-6">
			<Button type="button" variant="outline" onClick={onCancel}>
				Cancel
			</Button>
			<Button type="submit" disabled={submitting}>
				{submitting ? "Saving..." : submitLabel}
			</Button>
		</div>
	);
}
