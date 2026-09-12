import { Badge } from "~/components/atoms";
import AddItem from "./add-item";
import DeleteConfirm from "./delete-confirm";
import { MAX_ITEM_DEPTH, type ChecklistItem, type ItemPatch } from "./builder";

interface ItemNodeProps {
	item: ChecklistItem;
	level: 1 | 2 | 3;
	sectionName: string;
	onAddChild: (
		parentId: string,
		name: string,
		personInChargeId: string,
		personInChargeName: string,
	) => void;
	onEdit: (itemId: string, patch: ItemPatch) => void;
	onDelete: (itemId: string) => void;
}

export default function ItemNode({
	item,
	level,
	sectionName,
	onAddChild,
	onEdit,
	onDelete,
}: ItemNodeProps) {
	const canAddChild = level < MAX_ITEM_DEPTH;
	const hasChildren = item.children.length > 0;

	return (
		<div className={level === 1 ? "space-y-2" : "ml-5 space-y-2 border-l pl-4"}>
			<div className="flex items-center justify-between gap-5 rounded-sm border p-3">
				<div className="min-w-0">
					<p className="font-medium">{item.name}</p>

					{(item.personInChargeName || item.personInChargeId) && (
						<p className="text-xs text-muted-foreground">
							Person in charge: {item.personInChargeName || item.personInChargeId}
						</p>
					)}
				</div>

				<div className="flex shrink-0 items-center gap-1">
					<Badge>Responsible</Badge>

					<AddItem
						level={level}
						mode="edit"
						sectionName={sectionName}
						initialName={item.name}
						initialPersonInChargeId={item.personInChargeId}
						initialPersonInChargeName={item.personInChargeName}
						onCreate={(name, personInChargeId, personInChargeName) =>
							onEdit(item.id, { name, personInChargeId, personInChargeName })
						}
					/>

					<DeleteConfirm
						label="item"
						name={item.name}
						warning={
							hasChildren
								? "Its sub-items will be removed too."
								: "This item will be removed when you save."
						}
						onConfirm={() => onDelete(item.id)}
					/>
				</div>
			</div>

			{canAddChild && (
				<div className="flex justify-start">
					<AddItem
						level={(level + 1) as 1 | 2 | 3}
						sectionName={sectionName}
						parentItemName={item.name}
						onCreate={(name, personInChargeId, personInChargeName) =>
							onAddChild(item.id, name, personInChargeId, personInChargeName)
						}
					/>
				</div>
			)}

			{hasChildren && (
				<div className="space-y-2">
					{item.children.map((child) => (
						<ItemNode
							key={child.id}
							item={child}
							level={(level + 1) as 1 | 2 | 3}
							sectionName={sectionName}
							onAddChild={onAddChild}
							onEdit={onEdit}
							onDelete={onDelete}
						/>
					))}
				</div>
			)}
		</div>
	);
}
