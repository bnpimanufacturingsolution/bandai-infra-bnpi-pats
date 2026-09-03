import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface FilterCheckboxProps {
	id: string;
	label: string;
	checked?: boolean;
	onCheckedChange?: (checked: boolean) => void;
}

export function FilterCheckbox({ id, label, checked, onCheckedChange }: FilterCheckboxProps) {
	return (
		<div className="flex items-center gap-2">
			<Checkbox id={id} checked={checked} onCheckedChange={onCheckedChange} />
			<Label htmlFor={id} className="cursor-pointer text-sm font-normal">
				{label}
			</Label>
		</div>
	);
}
