import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { SearchableSelect } from "~/components/ui/searchable-select";
import { useDepartments } from "~/lib/hooks/useDepartments";

interface AddItemProps {
	level: 1 | 2 | 3;
	sectionName?: string;
	parentItemName?: string;
	onCreate: (name: string, personInChargeId: string, personInChargeName: string) => void;
}

export default function AddItem({ level, sectionName, parentItemName, onCreate }: AddItemProps) {
	const { data, isLoading } = useDepartments({ limit: 50 });

	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [personInChargeId, setPersonInChargeId] = useState("");

	const departments = data?.departments ?? [];

	const departmentOptions = departments.map((dept) => ({
		value: String(dept.id),
		label: dept.name,
	}));

	const isParent = level === 1;

	const title = isParent ? "Add Item" : level === 2 ? "Add Subitem" : "Add Subitem";

	const triggerLabel = isParent ? "Add Item" : "Add Subitem";

	const handleCreate = () => {
		const trimmedName = name.trim();

		if (!trimmedName) return;

		const selectedOption = departmentOptions.find(
			(option) => option.value === personInChargeId,
		);

		onCreate(trimmedName, personInChargeId, selectedOption?.label ?? "");

		setName("");
		setPersonInChargeId("");
		setOpen(false);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="secondary">{triggerLabel}</Button>
			</DialogTrigger>

			<DialogContent className="max-h-[90vh] overflow-y-auto">
				<DialogTitle>{title}</DialogTitle>

				<section className="space-y-1">
					{sectionName && (
						<p className="text-muted-foreground">
							Section: <span className="text-foreground">{sectionName}</span>
						</p>
					)}

					{parentItemName && (
						<p className="text-muted-foreground">
							Parent Item: <span className="text-foreground">{parentItemName}</span>
						</p>
					)}
				</section>

				<section className="space-y-4">
					<Input
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="Enter Item Name"
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								handleCreate();
							}
						}}
					/>

					<div className="space-y-2">
						<p className="text-sm text-muted-foreground">Person in Charge</p>

						<SearchableSelect
							options={departmentOptions}
							value={personInChargeId}
							onValueChange={setPersonInChargeId}
							placeholder={isLoading ? "Loading departments..." : "Select department"}
							searchPlaceholder="Search department..."
							emptyText="No departments found."
							disabled={isLoading}
						/>
					</div>

					<div className="flex justify-end">
						<Button onClick={handleCreate} disabled={!name.trim() || isLoading}>
							Create
						</Button>
					</div>
				</section>
			</DialogContent>
		</Dialog>
	);
}
