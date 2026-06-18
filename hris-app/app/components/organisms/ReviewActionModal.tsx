import { type ReactNode } from "react";
import { Modal } from "~/components/atoms/Modal";
import { cn } from "~/lib/utils";

export interface ReviewStatus {
	type: "success" | "warning" | "error" | "info" | "pending";
	title: string;
	description: string;
}

export interface ReviewActionModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: ReactNode;
	description?: string;
	status?: ReviewStatus;
	children?: ReactNode; // Main content (form, grid, etc)
	workflow?: ReactNode; // Workflow steps visualization
	actions?: ReactNode; // Action buttons
	footer?: ReactNode; // Footer buttons (Close, etc)
	className?: string; // Additional classes for the modal content
}

export function ReviewActionModal({
	open,
	onOpenChange,
	title,
	description,
	status,
	children,
	workflow,
	actions,
	footer,
	className,
}: ReviewActionModalProps) {
	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title={title}
			description={description}
			className={cn("max-w-4xl", className)}>
			<div className="">
				{/* Main Content (Info Grid, details, etc) */}
				{children && <div className="space-y-4">{children}</div>}

				{/* Workflow Section */}
				{workflow && <div className="pt-2">{workflow}</div>}

				{/* Actions Section */}
				{actions && (
					<div className="space-y-3 pt-2">
						{/* Optional Header for Actions if needed, but usually self-explanatory */}
						{actions}
					</div>
				)}

				{/* Footer Section */}
				{footer && <div className="flex justify-end pt-2 border-t mt-4">{footer}</div>}
			</div>
		</Modal>
	);
}
