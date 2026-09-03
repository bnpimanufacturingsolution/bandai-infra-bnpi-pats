import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { BoardingTemplateTable } from "~/components/organisms/boarding-template/BoardingTemplateTable";
import { BoardingTemplateFormModal } from "~/components/organisms/boarding-template/BoardingTemplateFormModal";
import { BoardingTemplateViewModal } from "~/components/organisms/boarding-template/BoardingTemplateViewModal";
import { employeeTourConfig } from "~/config/employee-tour.config";
import { hrManagerTourConfig } from "~/config/hr-manager-tour.config";
import {
	useBoardingTemplates,
	useBoardingTemplate,
	useDeleteBoardingTemplate,
} from "~/lib/hooks/useBoardingTemplates";
import { useBoardingTemplateForm } from "~/lib/hooks/useBoardingTemplateForm";
import { useAuth } from "~/lib/hooks/useAuth";
import type { BoardingTemplate } from "~/zod/boarding-template";

export function BoardingTemplatesSection() {
	const [searchParams, setSearchParams] = useSearchParams();
	const [showFormModal, setShowFormModal] = useState(false);
	const [showViewModal, setShowViewModal] = useState(false);
	const [viewingTemplateId, setViewingTemplateId] = useState<string | null>(null);
	const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

	const { user } = useAuth();
	const organizationId = user?.organizationId || "";

	const { data: templatesData, isLoading } = useBoardingTemplates();

	const { data: viewTemplateData, isLoading: isLoadingView } = useBoardingTemplate(
		viewingTemplateId || undefined,
		{
			enabled: !!viewingTemplateId && showViewModal,
			fields: [
				"organizationId",
				"name",
				"description",
				"type",
				"role",
				"isDefault",
				"isActive",
				"items",
			],
		},
	);

	// Fetch template with items for editing
	const { data: editTemplateData, isLoading: isLoadingEdit } = useBoardingTemplate(
		editingTemplateId || undefined,
		{
			enabled: !!editingTemplateId,
			fields: [
				"organizationId",
				"name",
				"description",
				"type",
				"role",
				"isDefault",
				"isActive",
				"items",
			],
		},
	);

	const deleteMutation = useDeleteBoardingTemplate();

	const boardingTemplateForm = useBoardingTemplateForm({
		organizationId,
		onSuccess: () => {
			closeFormModal();
		},
	});

	const { resetForm, loadTemplate } = boardingTemplateForm;

	const templates = useMemo(() => templatesData?.boardingTemplates || [], [templatesData]);

	useEffect(() => {
		if (editTemplateData?.boardingTemplate && editingTemplateId) {
			const template = editTemplateData.boardingTemplate;
			const items = (template as any).items || [];
			loadTemplate(template, items);
			setEditingTemplateId(null);
		}
	}, [editTemplateData, editingTemplateId, loadTemplate]);

	useEffect(() => {
		const action = searchParams.get("action");
		const id = searchParams.get("id");

		if (action === "create" && !showFormModal) {
			setEditingTemplateId(null);
			setShowFormModal(true);
			resetForm();
		} else if (action === "edit" && id && !showFormModal) {
			const template = templates.find((t) => t.id === id);
			if (template) {
				setEditingTemplateId(template.id);
				setShowFormModal(true);
			}
		} else if (action === "view" && id && !showViewModal) {
			setViewingTemplateId(id);
			setShowViewModal(true);
		} else if (!action && (showFormModal || showViewModal)) {
			setShowFormModal(false);
			setShowViewModal(false);
			setViewingTemplateId(null);
		}
	}, [
		searchParams,
		showFormModal,
		showViewModal,
		templates,
		resetForm,
		setEditingTemplateId,
		setShowFormModal,
		setViewingTemplateId,
		setShowViewModal,
	]);

	const updateURL = (action: string | null, id?: string) => {
		const params = new URLSearchParams(searchParams);
		params.set("tab", "templates");

		if (action) {
			params.set("action", action);
			if (id) {
				params.set("id", id);
			} else {
				params.delete("id");
			}
		} else {
			params.delete("action");
			params.delete("id");
		}

		setSearchParams(params, { replace: true });
	};

	const closeFormModal = () => {
		setShowFormModal(false);
		setEditingTemplateId(null);
		updateURL(null);
		boardingTemplateForm.resetForm();
	};

	const closeViewModal = () => {
		setShowViewModal(false);
		setViewingTemplateId(null);
		updateURL(null);
	};

	const handleCreateNew = () => {
		setEditingTemplateId(null);
		boardingTemplateForm.resetForm();
		setShowFormModal(true);
		updateURL("create");
	};

	const handleView = (template: BoardingTemplate) => {
		setViewingTemplateId(template.id);
		setShowViewModal(true);
		updateURL("view", template.id);
	};

	const handleEdit = (template: BoardingTemplate) => {
		setEditingTemplateId(template.id);
		setShowFormModal(true);
		updateURL("edit", template.id);
	};

	const handleEditFromView = async () => {
		if (viewTemplateData?.boardingTemplate) {
			closeViewModal();

			const template = viewTemplateData.boardingTemplate;
			const items = (template as any).items || [];

			await boardingTemplateForm.loadTemplate(template, items);
			setShowFormModal(true);
			updateURL("edit", template.id);
		}
	};

	const handleDelete = async (template: BoardingTemplate) => {
		if (!confirm(`Are you sure you want to delete "${template.name}"?`)) {
			return;
		}

		try {
			await deleteMutation.mutateAsync(template.id);
			toast.success("Template deleted successfully");
		} catch (error) {
			console.error("Error deleting template:", error);
			toast.error("Failed to delete template");
		}
	};

	const handleSyncWithTour = async (configType: "employee" | "hr-manager") => {
		const config = configType === "employee" ? employeeTourConfig : hrManagerTourConfig;
		const configName = configType === "employee" ? "Employee" : "HR Manager";
		const targetRole = configType === "employee" ? "hris-employee" : "hris-hr-manager";

		const items = (config as any[]).map((step, index) => ({
			title: step.popover.title,
			description: step.popover.description,
			category: "ORIENTATION" as const,
			dueOffset: 0,
			priority: "MEDIUM" as const,
			order: index + 1,
			uiElement: step.element,
		}));

		const templateData = {
			name: `Standard ${configName} Tour Onboarding`,
			description: `Automatically generated template based on the ${configName} interactive tour configuration.`,
			type: "ONBOARDING" as const,
			role: targetRole as any,
			isDefault: false,
			isActive: true,
			organizationId,
		};

		try {
			// Reset form and load the mapped data
			setEditingTemplateId(null);
			boardingTemplateForm.resetForm();
			boardingTemplateForm.handleTemplateChange(templateData);

			// Map to TemplateItem type (with temp ids)
			const formItems = items.map((item) => ({
				id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
				organizationId,
				templateId: "",
				...item,
				metadata: null,
				isDeleted: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			}));

			boardingTemplateForm.handleReorderItems(formItems);
			setShowFormModal(true);
			updateURL("create");
			toast.success(`${configName} tour configuration synced! Review and save.`);
		} catch (error) {
			console.error("Error syncing tour:", error);
			toast.error(`Failed to sync ${configName} tour configuration`);
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold mb-2">Boarding Templates</h2>
			</div>
			<BoardingTemplateTable
				templates={templates}
				isLoading={isLoading}
				onAdd={handleCreateNew}
				onView={handleView}
				onEdit={handleEdit}
				onDelete={handleDelete}
			/>{" "}
			<BoardingTemplateFormModal
				key={editingTemplateId ? "edit" : "create"}
				open={showFormModal}
				onOpenChange={(open) => {
					if (!open) closeFormModal();
				}}
				templateData={boardingTemplateForm.templateData}
				templateItems={boardingTemplateForm.templateItems}
				errors={boardingTemplateForm.errors}
				isSaving={boardingTemplateForm.isSaving}
				isEditing={!!boardingTemplateForm.editingTemplate}
				onTemplateChange={boardingTemplateForm.handleTemplateChange}
				onItemSubmit={boardingTemplateForm.handleItemSubmit}
				onDeleteItem={boardingTemplateForm.handleDeleteItem}
				onReorderItems={boardingTemplateForm.handleReorderItems}
				onSave={boardingTemplateForm.handleSave}
				onCancel={closeFormModal}
				onSyncFromTour={handleSyncWithTour}
			/>
			<BoardingTemplateViewModal
				open={showViewModal}
				onOpenChange={(open) => {
					if (!open) closeViewModal();
				}}
				template={viewTemplateData?.boardingTemplate || null}
				isLoading={isLoadingView}
				onEdit={handleEditFromView}
			/>
		</div>
	);
}
