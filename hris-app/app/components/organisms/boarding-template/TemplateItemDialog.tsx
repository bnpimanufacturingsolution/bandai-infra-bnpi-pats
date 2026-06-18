import { useState, useEffect } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/atoms/Button";
import { FormInput } from "@/components/atoms/form/form-input";
import { FormTextarea } from "@/components/atoms/form/form-textarea";
import { FormSelect } from "@/components/atoms/form/form-select";
import { FormNumberInput } from "@/components/atoms/form/form-number-input";
import type { TemplateItem, CreateTemplateItem } from "~/zod/template-item";
import type { ChecklistCategory, Priority } from "~/zod/checklist-item";

interface TemplateItemDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (item: Partial<CreateTemplateItem>) => void;
	editItem?: TemplateItem | null;
	nextOrder: number;
}

const CATEGORY_OPTIONS: { value: ChecklistCategory; label: string }[] = [
	{ value: "HR_DOCUMENTATION", label: "HR Documentation" },
	{ value: "IT_SETUP", label: "IT Setup" },
	{ value: "WORKSPACE_SETUP", label: "Workspace Setup" },
	{ value: "TRAINING", label: "Training" },
	{ value: "COMPLIANCE", label: "Compliance" },
	{ value: "ACCESS_MANAGEMENT", label: "Access Management" },
	{ value: "EQUIPMENT", label: "Equipment" },
	{ value: "BENEFITS", label: "Benefits" },
	{ value: "KNOWLEDGE_TRANSFER", label: "Knowledge Transfer" },
	{ value: "EXIT_INTERVIEW", label: "Exit Interview" },
	{ value: "ORIENTATION", label: "Orientation" },
	{ value: "SECURITY", label: "Security" },
	{ value: "PAYROLL", label: "Payroll" },
	{ value: "OTHER", label: "Other" },
];

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
	{ value: "LOW", label: "Low" },
	{ value: "MEDIUM", label: "Medium" },
	{ value: "HIGH", label: "High" },
	{ value: "CRITICAL", label: "Critical" },
];

export function TemplateItemDialog({
	open,
	onOpenChange,
	onSubmit,
	editItem,
	nextOrder,
}: TemplateItemDialogProps) {
	const [formData, setFormData] = useState<Partial<CreateTemplateItem>>({
		title: "",
		description: "",
		category: "HR_DOCUMENTATION",
		dueOffset: 0,
		priority: "MEDIUM",
		order: nextOrder,
	});

	const [errors, setErrors] = useState<Record<string, string>>({});

	useEffect(() => {
		if (editItem) {
			setFormData({
				title: editItem.title,
				description: editItem.description || "",
				category: editItem.category,
				dueOffset: editItem.dueOffset,
				priority: editItem.priority,
				order: editItem.order,
			});
		} else {
			setFormData({
				title: "",
				description: "",
				category: "HR_DOCUMENTATION",
				dueOffset: 0,
				priority: "MEDIUM",
				order: nextOrder,
			});
		}
		setErrors({});
	}, [editItem, nextOrder, open]);

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
		if (errors[name]) {
			setErrors((prev) => {
				const newErrors = { ...prev };
				delete newErrors[name];
				return newErrors;
			});
		}
	};

	const handleSelectChange = (name: string, value: string) => {
		setFormData((prev) => ({ ...prev, [name]: value }));
		if (errors[name]) {
			setErrors((prev) => {
				const newErrors = { ...prev };
				delete newErrors[name];
				return newErrors;
			});
		}
	};

	const handleNumberChange = (name: string, value: number) => {
		setFormData((prev) => ({ ...prev, [name]: value }));
		if (errors[name]) {
			setErrors((prev) => {
				const newErrors = { ...prev };
				delete newErrors[name];
				return newErrors;
			});
		}
	};

	const validate = (): boolean => {
		const newErrors: Record<string, string> = {};

		if (!formData.title?.trim()) {
			newErrors.title = "Title is required";
		}

		if (!formData.category) {
			newErrors.category = "Category is required";
		}

		if (formData.dueOffset === undefined) {
			newErrors.dueOffset = "Due offset is required";
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleSubmit = () => {
		if (validate()) {
			onSubmit(formData);
			onOpenChange(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>
						{editItem ? "Edit Checklist Item" : "Add Checklist Item"}
					</DialogTitle>
					<DialogDescription>
						{editItem
							? "Update the checklist item details"
							: "Create a new checklist item for this boarding template"}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					{/* Title */}
					<FormInput
						label="Title"
						name="title"
						value={formData.title || ""}
						onChange={handleInputChange}
						placeholder="e.g., Complete I-9 form"
						error={errors.title}
					/>

					{/* Description */}
					<FormTextarea
						label="Description"
						name="description"
						value={formData.description || ""}
						onChange={handleInputChange}
						placeholder="Provide details about this task..."
						rows={3}
						helpText="Optional: Add more context about what needs to be done"
					/>

					<div className="grid grid-cols-2 gap-4">
						{/* Category */}
						<FormSelect
							label="Category"
							name="category"
							value={formData.category || "HR_DOCUMENTATION"}
							onChange={(value) => handleSelectChange("category", value)}
							options={CATEGORY_OPTIONS}
							error={errors.category}
						/>

						{/* Priority */}
						<FormSelect
							label="Priority"
							name="priority"
							value={formData.priority || "MEDIUM"}
							onChange={(value) => handleSelectChange("priority", value)}
							options={PRIORITY_OPTIONS}
						/>
					</div>

					<div className="grid grid-cols-2 gap-4">
						{/* Due Offset */}
						<FormNumberInput
							label="Due Offset (Days)"
							name="dueOffset"
							value={formData.dueOffset || 0}
							onChange={(value) => handleNumberChange("dueOffset", value)}
							helpText="Days from start date (negative for before)"
							error={errors.dueOffset}
						/>

						{/* Order */}
						<FormNumberInput
							label="Display Order"
							name="order"
							value={formData.order || nextOrder}
							onChange={(value) => handleNumberChange("order", value)}
							min={1}
							helpText="Position in the checklist"
						/>
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleSubmit}>{editItem ? "Update Item" : "Add Item"}</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
