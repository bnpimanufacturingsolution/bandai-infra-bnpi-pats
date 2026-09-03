import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/atoms/Badge";
import { Button } from "@/components/atoms/Button";
import { GripVertical, Edit, Trash2, AlertCircle, Clock, Flag } from "lucide-react";
import type { TemplateItem } from "~/zod/template-item";

interface TemplateItemCardProps {
	item: TemplateItem;
	onEdit: (item: TemplateItem) => void;
	onDelete: (id: string) => void;
	isDragging?: boolean;
}

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

export function TemplateItemCard({
	item,
	onEdit,
	onDelete,
	isDragging = false,
}: TemplateItemCardProps) {
	return (
		<Card
			className={`transition-all ${isDragging ? "opacity-50 shadow-lg" : "hover:shadow-md"}`}>
			<CardContent className="p-4">
				<div className="flex items-start gap-3">
					{/* Drag Handle */}
					<button
						type="button"
						className="cursor-grab active:cursor-grabbing mt-1 text-gray-400 hover:text-gray-600"
						aria-label="Drag to reorder">
						<GripVertical className="h-5 w-5" />
					</button>

					{/* Content */}
					<div className="flex-1 min-w-0">
						<div className="flex items-start justify-between gap-2 mb-2">
							<h4 className="font-semibold text-gray-900">{item.title}</h4>
							<div className="flex gap-1">
								<Button
									variant="ghost"
									size="sm"
									onClick={() => onEdit(item)}
									className="h-8 w-8 p-0">
									<Edit className="h-4 w-4" />
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => onDelete(item.id)}
									className="h-8 w-8 p-0 text-red-500 hover:text-red-700">
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>
						</div>

						{item.description && (
							<p className="text-sm text-gray-600 mb-3">{item.description}</p>
						)}

						<div className="flex flex-wrap items-center gap-2">
							{/* Category Badge */}
							<Badge
								variant="outline"
								className={`border-0 ${getCategoryStyle(item.category)}`}>
								{item.category.replace(/_/g, " ")}
							</Badge>

							{/* Priority Text */}
							<span
								className={`text-xs flex items-center gap-1 ${getPriorityColor(
									item.priority,
								)}`}>
								{item.priority !== "LOW" && <Flag className="h-3 w-3" />}
								{item.priority}
							</span>

							{/* Due Offset */}
							<span className="text-xs text-gray-500 flex items-center gap-1">
								<Clock className="h-3 w-3" />
								Day {item.dueOffset >= 0 ? `+${item.dueOffset}` : item.dueOffset}
							</span>

							{/* Order */}
							<span className="text-xs text-gray-500">Order: {item.order}</span>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
