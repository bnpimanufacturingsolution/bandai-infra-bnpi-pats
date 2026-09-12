import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import AddItem from "./add-item";
import type { ChecklistSection } from "./builder";
import ItemNode from "./item-node";

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
}

export default function SectionCard({ section, onAddItem, onAddChildItem }: SectionCardProps) {
	return (
		<Card>
			<CardHeader className="flex items-center justify-between gap-3">
				<CardTitle>{section.name}</CardTitle>

				<AddItem
					level={1}
					sectionName={section.name}
					onCreate={(name, personInChargeId, personInChargeName) =>
						onAddItem(section.id, name, personInChargeId, personInChargeName)
					}
				/>
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
						/>
					))
				)}
			</CardContent>
		</Card>
	);
}
