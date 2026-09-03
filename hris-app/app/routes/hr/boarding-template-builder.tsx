import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/atoms/Button";
import { BoardingTemplateForm } from "@/components/organisms/boarding-template/BoardingTemplateForm";
import { TemplateItemsList } from "@/components/molecules/boarding-template/TemplateItemsList";
import { TemplateItemDialog } from "@/components/organisms/boarding-template/TemplateItemDialog";
import { ArrowLeft, Save, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { CreateBoardingTemplate } from "~/zod/boarding-template";
import type { TemplateItem, CreateTemplateItem } from "~/zod/template-item";

const BoardingTemplateBuilder = () => {
	const navigate = useNavigate();
	const [isSaving, setIsSaving] = useState(false);

	// Template form state
	const [templateData, setTemplateData] = useState<Partial<CreateBoardingTemplate>>({
		name: "",
		description: "",
		type: "ONBOARDING",
		isDefault: false,
		isActive: true,
		organizationId: "", // This should come from auth context
	});

	// Template items state
	const [templateItems, setTemplateItems] = useState<TemplateItem[]>([]);
	const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
	const [editingItem, setEditingItem] = useState<TemplateItem | null>(null);

	// Form errors
	const [errors, setErrors] = useState<Record<string, string>>({});

	// Handle template form changes
	const handleTemplateChange = (data: Partial<CreateBoardingTemplate>) => {
		setTemplateData(data);
		// Clear errors for changed fields
		const changedKeys = Object.keys(data);
		if (changedKeys.length > 0) {
			setErrors((prev) => {
				const newErrors = { ...prev };
				changedKeys.forEach((key) => delete newErrors[key]);
				return newErrors;
			});
		}
	};

	// Handle adding new item
	const handleAddItem = () => {
		setEditingItem(null);
		setIsItemDialogOpen(true);
	};

	// Handle editing item
	const handleEditItem = (item: TemplateItem) => {
		setEditingItem(item);
		setIsItemDialogOpen(true);
	};

	// Handle deleting item
	const handleDeleteItem = (id: string) => {
		setTemplateItems((prev) => prev.filter((item) => item.id !== id));
		toast.success("Item removed successfully");
	};

	// Handle reordering items
	const handleReorderItems = (items: TemplateItem[]) => {
		setTemplateItems(items);
	};

	// Handle item submission from dialog
	const handleItemSubmit = (itemData: Partial<CreateTemplateItem>) => {
		if (editingItem) {
			// Update existing item
			setTemplateItems((prev) =>
				prev.map((item) =>
					item.id === editingItem.id
						? {
								...item,
								...itemData,
								updatedAt: new Date(),
							}
						: item,
				),
			);
			toast.success("Item updated successfully");
		} else {
			// Add new item
			const newItem: TemplateItem = {
				id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
				organizationId: templateData.organizationId || "",
				templateId: "", // Will be set when template is created
				title: itemData.title!,
				description: itemData.description || null,
				category: itemData.category!,
				dueOffset: itemData.dueOffset!,
				priority: itemData.priority || "MEDIUM",
				order: itemData.order || templateItems.length + 1,
				metadata: null,
				isDeleted: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			};
			setTemplateItems((prev) => [...prev, newItem]);
			toast.success("Item added successfully");
		}
	};

	// Validate form
	const validateForm = (): boolean => {
		const newErrors: Record<string, string> = {};

		if (!templateData.name?.trim()) {
			newErrors.name = "Template name is required";
		}

		if (!templateData.type) {
			newErrors.type = "Boarding type is required";
		}

		if (templateItems.length === 0) {
			toast.error("Please add at least one checklist item");
			return false;
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	// Handle save template
	const handleSave = async () => {
		if (!validateForm()) {
			toast.error("Please fix the errors before saving");
			return;
		}

		setIsSaving(true);

		try {
			// TODO: API call to save template and items
			// const response = await createBoardingTemplate({
			//   template: templateData,
			//   items: templateItems,
			// });

			// Simulate API call
			await new Promise((resolve) => setTimeout(resolve, 1500));

			toast.success("Template saved successfully!");
			navigate("/employee/boarding-templates");
		} catch (error) {
			console.error("Error saving template:", error);
			toast.error("Failed to save template. Please try again.");
		} finally {
			setIsSaving(false);
		}
	};

	// Handle preview
	const handlePreview = () => {
		if (!templateData.name?.trim()) {
			toast.error("Please enter a template name first");
			return;
		}
		toast.info("Preview feature coming soon!");
	};

	const nextOrder =
		templateItems.length > 0 ? Math.max(...templateItems.map((item) => item.order)) + 1 : 1;

	return (
		<div className="min-h-screen bg-gray-50">
			{/* Header */}
			<div className="bg-white border-b sticky top-0 z-10">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
					<div className="flex items-center justify-between h-16">
						<div className="flex items-center gap-4">
							<Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
								<ArrowLeft className="h-4 w-4 mr-2" />
								Back
							</Button>
							<div>
								<h1 className="text-xl font-bold text-gray-900">
									Create Boarding Template
								</h1>
								<p className="text-sm text-gray-500">
									Design a reusable boarding process template
								</p>
							</div>
						</div>

						<div className="flex items-center gap-3">
							<Button variant="outline" onClick={handlePreview} disabled={isSaving}>
								<Eye className="h-4 w-4 mr-2" />
								Preview
							</Button>
							<Button onClick={handleSave} disabled={isSaving}>
								{isSaving ? (
									<>
										<Loader2 className="h-4 w-4 mr-2 animate-spin" />
										Saving...
									</>
								) : (
									<>
										<Save className="h-4 w-4 mr-2" />
										Save Template
									</>
								)}
							</Button>
						</div>
					</div>
				</div>
			</div>

			{/* Main Content */}
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
				<div className="space-y-8">
					{/* Template Information Form */}
					<BoardingTemplateForm
						formData={templateData}
						onChange={handleTemplateChange}
						errors={errors}
					/>

					{/* Template Items List */}
					<TemplateItemsList
						items={templateItems}
						onAddItem={handleAddItem}
						onEditItem={handleEditItem}
						onDeleteItem={handleDeleteItem}
						onReorderItems={handleReorderItems}
					/>
				</div>
			</div>

			{/* Template Item Dialog */}
			<TemplateItemDialog
				open={isItemDialogOpen}
				onOpenChange={setIsItemDialogOpen}
				onSubmit={handleItemSubmit}
				editItem={editingItem}
				nextOrder={nextOrder}
			/>
		</div>
	);
};

export default BoardingTemplateBuilder;
