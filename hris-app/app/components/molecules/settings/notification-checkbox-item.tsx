import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";

interface NotificationCheckboxItemProps {
	id: string;
	label: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
}

export function NotificationCheckboxItem({
	id,
	label,
	checked,
	onCheckedChange,
}: NotificationCheckboxItemProps) {
	return (
		<div className="flex items-center space-x-3 py-1">
			<Checkbox id={id} checked={checked} onCheckedChange={onCheckedChange} />
			<Label
				htmlFor={id}
				className="text-[15px] font-normal text-foreground cursor-pointer select-none leading-none">
				{label}
			</Label>
		</div>
	);
}
