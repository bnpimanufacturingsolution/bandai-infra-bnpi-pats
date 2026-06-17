import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";

interface SettingsSelectItemProps {
	id: string;
	title: string;
	description: string;
	value: string;
	options: { value: string; label: string }[];
	onValueChange: (value: string) => void;
}

export function SettingsSelectItem({
	id,
	title,
	description,
	value,
	options,
	onValueChange,
}: SettingsSelectItemProps) {
	return (
		<div className="flex items-start justify-between py-5 gap-8">
			<div className="flex-1 space-y-1.5">
				<Label
					htmlFor={id}
					className="text-[15px] font-medium text-foreground leading-tight">
					{title}
				</Label>
				<p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
			</div>
			<div className="pt-0.5">
				<Select value={value} onValueChange={onValueChange}>
					<SelectTrigger id={id} className="w-[180px] h-9">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{options.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}
