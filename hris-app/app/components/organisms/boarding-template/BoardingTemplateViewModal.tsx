import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { Modal } from "~/components/atoms/Modal";
import { Loader2 } from "lucide-react";
import type { BoardingTemplate } from "~/zod/boarding-template";

const getCategoryStyle = (category: string) => {
	switch (category) {
		case "ONBOARDING":
		case "HR_DOCUMENTATION":
			return "bg-blue-100 text-blue-800";
		case "COMPLIANCE":
			return "bg-purple-100 text-purple-800";
		case "BENEFITS":
		case "PAYROLL":
			return "bg-green-100 text-green-800";
		case "TRAINING":
			return "bg-yellow-100 text-yellow-800";
		case "IT_SETUP":
		case "EQUIPMENT":
			return "bg-indigo-100 text-indigo-800";
		case "WORKSPACE_SETUP":
			return "bg-cyan-100 text-cyan-800";
		case "ACCESS_MANAGEMENT":
			return "bg-orange-100 text-orange-800";
		case "KNOWLEDGE_TRANSFER":
			return "bg-teal-100 text-teal-800";
		case "EXIT_INTERVIEW":
			return "bg-rose-100 text-rose-800";
		case "ORIENTATION":
			return "bg-lime-100 text-lime-800";
		case "SECURITY":
			return "bg-red-100 text-red-800";
		case "OTHER":
		default:
			return "bg-gray-100 text-gray-800";
	}
};

const getPriorityColor = (priority: string) => {
	switch (priority) {
		case "CRITICAL":
			return "text-red-600 font-medium";
		case "HIGH":
			return "text-orange-600 font-medium";
		case "MEDIUM":
			return "text-blue-600";
		case "LOW":
			return "text-gray-500";
		default:
			return "text-gray-500";
	}
};

interface BoardingTemplateViewModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	template: BoardingTemplate | null;
	isLoading: boolean;
	onEdit?: () => void;
}

export function BoardingTemplateViewModal({
	open,
	onOpenChange,
	template,
	isLoading,
	onEdit,
}: BoardingTemplateViewModalProps) {
	if (!template && !isLoading) {
		return (
			<Modal
				open={open}
				onOpenChange={onOpenChange}
				title="Template Details"
				description="View boarding template information and checklist items">
				<div className="py-8 text-center text-gray-500">Template not found</div>
			</Modal>
		);
	}

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title="Template Details"
			description="View boarding template information and checklist items">
			{isLoading ? (
				<div className="flex items-center justify-center py-12">
					<Loader2 className="h-8 w-8 animate-spin text-primary" />
				</div>
			) : template ? (
				<div className="space-y-6">
					{/* Template Information */}
					<div className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="text-sm font-medium text-gray-700">
									Template Name
								</label>
								<p className="mt-1 text-sm text-gray-900">{template.name}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-700">Type</label>
								<div className="mt-1">
									<Badge
										variant={
											template.type === "ONBOARDING" ? "success" : "default"
										}>
										{template.type}
									</Badge>
								</div>
							</div>

							<div>
								<label className="text-sm font-medium text-gray-700">Status</label>
								<div className="mt-1">
									<Badge variant={template.isActive ? "success" : "destructive"}>
										{template.isActive ? "Active" : "Inactive"}
									</Badge>
								</div>
							</div>
							{template.isDefault && (
								<div>
									<label className="text-sm font-medium text-gray-700">
										Default Template
									</label>
									<div className="mt-1">
										<Badge variant="secondary">Default</Badge>
									</div>
								</div>
							)}
						</div>

						{template.description && (
							<div>
								<label className="text-sm font-medium text-gray-700">
									Description
								</label>
								<p className="mt-1 text-sm text-gray-900">{template.description}</p>
							</div>
						)}
					</div>

					{/* Template Items */}
					<div className="space-y-3">
						<h3 className="text-sm font-semibold text-gray-900">Checklist Items</h3>
						{(template as any).items && (template as any).items.length > 0 ? (
							<div className="space-y-2">
								{(template as any).items
									.sort((a: any, b: any) => a.order - b.order)
									.map((item: any, index: number) => (
										<div
											key={item.id}
											className="flex items-start gap-3 p-4 border rounded-lg bg-gray-50">
											<div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium">
												{index + 1}
											</div>
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-2">
													<h4 className="text-sm font-medium text-gray-900">
														{item.title}
													</h4>
													<Badge
														variant="outline"
														className={`text-xs border-0 ${getCategoryStyle(
															item.category,
														)}`}>
														{item.category.replace(/_/g, " ")}
													</Badge>
													{item.priority && (
														<span
															className={`text-xs flex items-center gap-1 ${getPriorityColor(
																item.priority,
															)}`}>
															{item.priority}
														</span>
													)}
												</div>
												{item.description && (
													<p className="mt-1 text-sm text-gray-600">
														{item.description}
													</p>
												)}
												<p className="mt-1 text-xs text-gray-500">
													Due: Day {item.dueOffset}
												</p>
											</div>
										</div>
									))}
							</div>
						) : (
							<p className="text-sm text-gray-500 py-4 text-center">
								No checklist items
							</p>
						)}
					</div>

					{/* Actions */}
					<div className="flex items-center justify-end gap-3 pt-6 border-t">
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Close
						</Button>
						{onEdit && <Button onClick={onEdit}>Edit Template</Button>}
					</div>
				</div>
			) : null}
		</Modal>
	);
}
