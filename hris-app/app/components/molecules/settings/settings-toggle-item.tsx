import { Switch } from "~/components/ui/switch";
import { Label } from "~/components/ui/label";

interface SettingsToggleItemProps {
	id: string;
	title: string;
	description: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
}

export function SettingsToggleItem({
	id,
	title,
	description,
	checked,
	onCheckedChange,
}: SettingsToggleItemProps) {
	return (
		<div className="flex items-start justify-between py-5 gap-8">
			<div className="flex-1 space-y-1.5">
				<Label
					htmlFor={id}
					className="text-[15px] font-medium text-foreground cursor-pointer leading-tight">
					{title}
				</Label>
				<p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
			</div>
			<div className="pt-0.5">
				<Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
			</div>
		</div>
	);
}
