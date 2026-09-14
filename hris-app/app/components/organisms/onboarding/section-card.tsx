import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { useState } from "react";
import AddItem from "./add-item";
import type { ChecklistSection, ItemPatch } from "./builder";
import ItemNode from "./item-node";
import DeleteConfirm from "./delete-confirm";

interface SectionCardProps {
	section: ChecklistSection;
	onAddItem: (
		sectionId: string,
		name: string,
		personInChargeId: string,
		personInChargeName: string,
	) => void;
	onAddChildItem: (
		sectionId: string,
		parentId: string,
		name: string,
		personInChargeId: string,
		personInChargeName: string,
	) => void;
	onRenameSection: (sectionId: string, name: string) => void;
	onDeleteSection: (sectionId: string) => void;
	onEditItem: (sectionId: string, itemId: string, patch: ItemPatch) => void;
	onDeleteItem: (sectionId: string, itemId: string) => void;
}

export default function SectionCard({
	section,
	onAddItem,
	onAddChildItem,
	onRenameSection,
	onDeleteSection,
	onEditItem,
	onDeleteItem,
}: SectionCardProps) {
	const [editing, setEditing] = useState(false);
	const [draftName, setDraftName] = useState(section.name);

	const commitRename = () => {
		const trimmed = draftName.trim();
		if (trimmed && trimmed !== section.name) {
			onRenameSection(section.id, trimmed);
		}
		setEditing(false);
	};

	return (
		<Card>
			<CardHeader className="flex items-center justify-between gap-3">
				{editing ? (
					<div className="flex flex-1 items-center gap-2">
						<input
							aria-label="Section name"
							className="h-8 flex-1 rounded-md border border-input bg-white px-2 text-sm font-semibold"
							value={draftName}
							onChange={(event) => setDraftName(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") commitRename();
								if (event.key === "Escape") setEditing(false);
							}}
							onBlur={commitRename}
						/>
					</div>
				) : (
					<CardTitle>{section.name}</CardTitle>
				)}

				<div className="flex shrink-0 items-center gap-2">
					{!editing && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								setDraftName(section.name);
								setEditing(true);
							}}>
							Edit
						</Button>
					)}

					<DeleteConfirm
						label="section"
						name={section.name}
						onConfirm={() => onDeleteSection(section.id)}
					/>
				</div>
			</CardHeader>

			<CardContent className="space-y-3">
				{section.items.length === 0 ? (
					<p className="py-4 text-center text-sm text-muted-foreground">No items yet.</p>
				) : (
					section.items.map((item) => (
						<ItemNode
							key={item.id}
							item={item}
							level={1}
							sectionName={section.name}
							onAddChild={(parentId, name, personInChargeId, personInChargeName) =>
								onAddChildItem(
									section.id,
									parentId,
									name,
									personInChargeId,
									personInChargeName,
								)
							}
							onEdit={(itemId, patch) => onEditItem(section.id, itemId, patch)}
							onDelete={(itemId) => onDeleteItem(section.id, itemId)}
						/>
					))
				)}
			</CardContent>

			<CardFooter>
				<AddItem
					level={1}
					sectionName={section.name}
					onCreate={(name, personInChargeId, personInChargeName) =>
						onAddItem(section.id, name, personInChargeId, personInChargeName)
					}
				/>
			</CardFooter>
		</Card>
	);
}
