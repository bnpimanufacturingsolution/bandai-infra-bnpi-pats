import { useState } from "react";
import { TemplateItemCard } from "./TemplateItemCard";
import { Button } from "@/components/atoms/Button";
import { Plus, ListOrdered } from "lucide-react";
import type { TemplateItem } from "~/zod/template-item";

interface TemplateItemsListProps {
	items: TemplateItem[];
	onAddItem: () => void;
	onEditItem: (item: TemplateItem) => void;
	onDeleteItem: (id: string) => void;
	onReorderItems: (items: TemplateItem[]) => void;
}

export function TemplateItemsList({
	items,
	onAddItem,
	onEditItem,
	onDeleteItem,
	onReorderItems,
}: TemplateItemsListProps) {
	const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

	const handleDragStart = (index: number) => {
		setDraggedIndex(index);
	};

	const handleDragOver = (e: React.DragEvent, index: number) => {
		e.preventDefault();
		if (draggedIndex === null || draggedIndex === index) return;

		const newItems = [...items];
		const draggedItem = newItems[draggedIndex];
		newItems.splice(draggedIndex, 1);
		newItems.splice(index, 0, draggedItem);

		// Update order property
		const reorderedItems = newItems.map((item, idx) => ({
			...item,
			order: idx + 1,
		}));

		onReorderItems(reorderedItems);
		setDraggedIndex(index);
	};

	const handleDragEnd = () => {
		setDraggedIndex(null);
	};

	const sortedItems = [...items].sort((a, b) => a.order - b.order);

	return (
		<div className="space-y-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<ListOrdered className="h-5 w-5 text-gray-600" />
					<h3 className="text-lg font-semibold text-gray-900">Checklist Items</h3>
					<span className="text-sm text-gray-500">({items.length})</span>
				</div>
				<Button onClick={onAddItem} size="sm">
					<Plus className="h-4 w-4 mr-2" />
					Add Item
				</Button>
			</div>

			{/* Items List */}
			{sortedItems.length === 0 ? (
				<div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
					<ListOrdered className="h-12 w-12 text-gray-400 mx-auto mb-3" />
					<p className="text-gray-600 font-medium mb-2">No checklist items yet</p>
					<p className="text-sm text-gray-500 mb-4">
						Add items to define the boarding process steps
					</p>
					<Button onClick={onAddItem} variant="outline">
						<Plus className="h-4 w-4 mr-2" />
						Add First Item
					</Button>
				</div>
			) : (
				<div className="space-y-3">
					{sortedItems.map((item, index) => (
						<div
							key={item.id}
							draggable
							onDragStart={() => handleDragStart(index)}
							onDragOver={(e) => handleDragOver(e, index)}
							onDragEnd={handleDragEnd}>
							<TemplateItemCard
								item={item}
								onEdit={onEditItem}
								onDelete={onDeleteItem}
								isDragging={draggedIndex === index}
							/>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
