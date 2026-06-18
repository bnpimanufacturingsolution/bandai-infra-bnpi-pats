import { useState, useCallback } from "react";
import { toast } from "sonner";
import type { CreateBoardingTemplate, BoardingTemplate } from "~/zod/boarding-template";
import type { TemplateItem, CreateTemplateItem } from "~/zod/template-item";
import boardingTemplateService from "~/services/boarding-template.service";
import {
	useCreateBoardingTemplate,
	useUpdateBoardingTemplate,
} from "~/lib/hooks/useBoardingTemplates";

export interface UseBoardingTemplateFormProps {
	organizationId: string;
	onSuccess?: () => void;
}

export function useBoardingTemplateForm({
	organizationId,
	onSuccess,
}: UseBoardingTemplateFormProps) {
	const [templateData, setTemplateData] = useState<Partial<CreateBoardingTemplate>>({
		name: "",
		description: "",
		type: "ONBOARDING",
		isDefault: false,
		isActive: true,
		organizationId: organizationId,
		role: "hris-employee",
	});

	const [templateItems, setTemplateItems] = useState<TemplateItem[]>([]);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [isSaving, setIsSaving] = useState(false);
	const [editingTemplate, setEditingTemplate] = useState<BoardingTemplate | null>(null);

	const createMutation = useCreateBoardingTemplate();
	const updateMutation = useUpdateBoardingTemplate();

	// Handle template form changes
	const handleTemplateChange = useCallback((data: Partial<CreateBoardingTemplate>) => {
		setTemplateData((prev) => ({ ...prev, ...data }));
		// Clear errors for changed fields
		const changedKeys = Object.keys(data);
		if (changedKeys.length > 0) {
			setErrors((prev) => {
				const newErrors = { ...prev };
				changedKeys.forEach((key) => delete newErrors[key]);
				return newErrors;
			});
		}
	}, []);

	// Handle adding/updating item
	const handleItemSubmit = useCallback(
		(itemData: Partial<CreateTemplateItem>, editingItem?: TemplateItem | null) => {
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
					templateId: "",
					title: itemData.title!,
					description: itemData.description || null,
					category: itemData.category!,
					dueOffset: itemData.dueOffset!,
					priority: itemData.priority || "MEDIUM",
					order: itemData.order || templateItems.length + 1,
					uiElement: itemData.uiElement || null,
					metadata: null,
					isDeleted: false,
					createdAt: new Date(),
					updatedAt: new Date(),
				};
				setTemplateItems((prev) => [...prev, newItem]);
				toast.success("Item added successfully");
			}
		},
		[templateData.organizationId, templateItems.length],
	);

	// Handle deleting item
	const handleDeleteItem = useCallback((id: string) => {
		setTemplateItems((prev) => prev.filter((item) => item.id !== id));
		toast.success("Item removed successfully");
	}, []);

	// Handle reordering items
	const handleReorderItems = useCallback((items: TemplateItem[]) => {
		setTemplateItems(items);
	}, []);

	// Validate form
	const validateForm = useCallback((): boolean => {
		const newErrors: Record<string, string> = {};

		if (!templateData.name?.trim()) {
			newErrors.name = "Template name is required";
		}

		if (!templateData.type) {
			newErrors.type = "Boarding type is required";
		}

		if (templateData.type === "ONBOARDING" && !templateData.role) {
			newErrors.role = "Role is required for onboarding templates";
		}

		if (templateItems.length === 0) {
			toast.error("Please add at least one checklist item");
			return false;
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	}, [templateData, templateItems.length]);

	// Load template for editing
	const loadTemplate = useCallback(async (template: BoardingTemplate, items: TemplateItem[]) => {
		setEditingTemplate(template);
		setTemplateData({
			name: template.name,
			description: template.description,
			type: template.type,
			role: template.role as any,
			isDefault: template.isDefault,
			isActive: template.isActive,
			organizationId: template.organizationId,
		});
		setTemplateItems(items);
	}, []);

	// Reset form
	const resetForm = useCallback(() => {
		setTemplateData({
			name: "",
			description: "",
			type: "ONBOARDING",
			role: "hris-employee",
			isDefault: false,
			isActive: true,
			organizationId: organizationId,
		});
		setTemplateItems([]);
		setErrors({});
		setEditingTemplate(null);
	}, [organizationId]);

	// Save template
	const handleSave = useCallback(async () => {
		if (!validateForm()) {
			toast.error("Please fix the errors before saving");
			return;
		}

		setIsSaving(true);

		try {
			if (editingTemplate) {
				// Update existing template
				await updateMutation.mutateAsync({
					id: editingTemplate.id,
					data: templateData as CreateBoardingTemplate,
				});

				// Prepare template items
				const itemsToCreate = templateItems.map((item) => ({
					title: item.title,
					description: item.description || undefined,
					category: item.category,
					dueOffset: item.dueOffset,
					priority: item.priority,
					order: item.order,
					uiElement: item.uiElement || undefined,
					metadata: item.metadata || undefined,
				}));

				// Update template items
				await boardingTemplateService.createTemplateItemsForTemplate(
					editingTemplate.id,
					organizationId,
					itemsToCreate,
				);

				toast.success("Template updated successfully!");
			} else {
				// Create new template
				const response = await createMutation.mutateAsync(
					templateData as CreateBoardingTemplate,
				);

				const createdTemplate = response.boardingTemplate;

				// Prepare template items
				const itemsToCreate = templateItems.map((item) => ({
					title: item.title,
					description: item.description || undefined,
					category: item.category,
					dueOffset: item.dueOffset,
					priority: item.priority,
					order: item.order,
					metadata: item.metadata || undefined,
				}));

				// Create template items
				await boardingTemplateService.createTemplateItemsForTemplate(
					createdTemplate.id,
					organizationId,
					itemsToCreate,
				);

				toast.success(
					`Template saved successfully with ${templateItems.length} checklist items!`,
				);
			}

			resetForm();
			onSuccess?.();
		} catch (error) {
			console.error("Error saving template:", error);
			toast.error("Failed to save template. Please try again.");
		} finally {
			setIsSaving(false);
		}
	}, [
		validateForm,
		editingTemplate,
		templateData,
		templateItems,
		organizationId,
		updateMutation,
		createMutation,
		resetForm,
		onSuccess,
	]);

	return {
		templateData,
		templateItems,
		errors,
		isSaving,
		editingTemplate,
		handleTemplateChange,
		handleItemSubmit,
		handleDeleteItem,
		handleReorderItems,
		handleSave,
		loadTemplate,
		resetForm,
	};
}
