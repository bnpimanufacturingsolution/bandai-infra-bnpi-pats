import { useState } from "react";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { Loader2 } from "lucide-react";
import { BoardingTemplateForm } from "~/components/organisms/boarding-template/BoardingTemplateForm";
import { FormSelect } from "@/components/atoms/form/form-select";
import { TemplateItemsList } from "~/components/molecules/boarding-template/TemplateItemsList";
import { TemplateItemDialog } from "~/components/organisms/boarding-template/TemplateItemDialog";
import type { CreateBoardingTemplate } from "~/zod/boarding-template";
import type { TemplateItem, CreateTemplateItem } from "~/zod/template-item";
import type { Department } from "~/services/departments.service";

interface BoardingTemplateFormModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	templateData: Partial<CreateBoardingTemplate>;
	templateItems: TemplateItem[];
	errors: Record<string, string>;
	isSaving: boolean;
	isEditing: boolean;
	onTemplateChange: (data: Partial<CreateBoardingTemplate>) => void;
	onItemSubmit: (
		itemData: Partial<CreateTemplateItem>,
		editingItem?: TemplateItem | null,
	) => void;
	onDeleteItem: (id: string) => void;
	onReorderItems: (items: TemplateItem[]) => void;
	onSave: () => void;
	onCancel: () => void;
	onSyncFromTour?: (configType: "employee" | "hr-manager") => void;
}

export function BoardingTemplateFormModal({
	open,
	onOpenChange,
	templateData,
	templateItems,
	errors,
	isSaving,
	isEditing,
	onTemplateChange,
	onItemSubmit,
	onDeleteItem,
	onReorderItems,
	onSave,
	onCancel,
	onSyncFromTour,
}: BoardingTemplateFormModalProps) {
	const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
	const [editingItem, setEditingItem] = useState<TemplateItem | null>(null);

	const handleAddItem = () => {
		setEditingItem(null);
		setIsItemDialogOpen(true);
	};

	const handleEditItem = (item: TemplateItem) => {
		setEditingItem(item);
		setIsItemDialogOpen(true);
	};

	const handleItemDialogSubmit = (itemData: Partial<CreateTemplateItem>) => {
		onItemSubmit(itemData, editingItem);
		setIsItemDialogOpen(false);
		setEditingItem(null);
	};

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title={isEditing ? "Edit Template" : "Create New Template"}>
			<div className="space-y-6">
				{/* Tour Sync Helpers */}
				{!isEditing && templateItems.length === 0 && onSyncFromTour && (
					<div className="p-4 bg-orange-50/50 rounded-lg border border-orange-100/50">
						<FormSelect
							name="tourConfig"
							label="Quick Sync"
							placeholder="Choose Configuration"
							value=""
							disabled={templateData.type === "OFFBOARDING"}
							onChange={(value) => {
								if (value !== "default") {
									onSyncFromTour(value as "employee" | "hr-manager");
								}
							}}
							options={[
								{ value: "employee", label: "Employee Tour" },
								{ value: "hr-manager", label: "HR Manager Tour" },
							]}
							helpText={
								templateData.type === "OFFBOARDING"
									? "Quick start is not available for offboarding templates"
									: "Optional: Start quickly by syncing with a tour configuration"
							}
						/>
					</div>
				)}

				{/* Template Form */}
				<BoardingTemplateForm
					formData={templateData}
					onChange={onTemplateChange}
					errors={errors}
				/>

				{/* Checklist Items */}
				<div className="space-y-4">
					<TemplateItemsList
						items={templateItems}
						onAddItem={handleAddItem}
						onEditItem={handleEditItem}
						onDeleteItem={onDeleteItem}
						onReorderItems={onReorderItems}
					/>
				</div>

				{/* Template Item Dialog */}
				<TemplateItemDialog
					open={isItemDialogOpen}
					onOpenChange={setIsItemDialogOpen}
					onSubmit={handleItemDialogSubmit}
					editItem={editingItem}
					nextOrder={templateItems.length + 1}
				/>

				{/* Actions */}
				<div className="flex items-center justify-end gap-3 pt-6 border-t">
					<Button variant="outline" onClick={onCancel} disabled={isSaving}>
						Cancel
					</Button>
					<Button onClick={onSave} disabled={isSaving || templateItems.length === 0}>
						{isSaving ? (
							<>
								<Loader2 className="h-4 w-4 mr-2 animate-spin" />
								Saving...
							</>
						) : (
							<>Save Template</>
						)}
					</Button>
				</div>
			</div>
		</Modal>
	);
}
