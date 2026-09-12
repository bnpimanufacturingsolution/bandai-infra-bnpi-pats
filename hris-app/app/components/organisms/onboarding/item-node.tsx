import { Badge } from "~/components/atoms";
import AddItem from "./add-item";
import { MAX_ITEM_DEPTH, type ChecklistItem } from "./builder";

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
}

export default function ItemNode({ item, level, sectionName, onAddChild }: ItemNodeProps) {
	const canAddChild = level < MAX_ITEM_DEPTH;

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

				<Badge>Responsible</Badge>
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

			{item.children.length > 0 && (
				<div className="space-y-2">
					{item.children.map((child) => (
						<ItemNode
							key={child.id}
							item={child}
							level={(level + 1) as 1 | 2 | 3}
							sectionName={sectionName}
							onAddChild={onAddChild}
						/>
					))}
				</div>
			)}
		</div>
	);
}
