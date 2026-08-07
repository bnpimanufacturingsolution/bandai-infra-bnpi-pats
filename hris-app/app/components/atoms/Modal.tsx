import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "./Button";

export interface ModalProps {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	trigger?: React.ReactNode;
	children: React.ReactNode;
	title?: React.ReactNode;
	description?: string;
	className?: string;
	showCloseButton?: boolean;
	closeOnBackdropClick?: boolean;
}

const Modal = React.forwardRef<HTMLDivElement, ModalProps>(
	(
		{
			open,
			onOpenChange,
			trigger,
			children,
			title,
			description,
			className,
			showCloseButton = true,
			closeOnBackdropClick = true,
			...props
		},
		ref,
	) => {
		const [mounted, setMounted] = React.useState(false);

		React.useEffect(() => {
			setMounted(true);
		}, []);

		React.useEffect(() => {
			if (open) {
				document.body.style.overflow = "hidden";
			} else {
				document.body.style.overflow = "unset";
			}

			return () => {
				document.body.style.overflow = "unset";
			};
		}, [open]);

		React.useEffect(() => {
			if (!open) return;
			const handleKeyDown = (event: KeyboardEvent) => {
				if (event.key === "Escape") {
					onOpenChange?.(false);
				}
			};
			window.addEventListener("keydown", handleKeyDown);
			return () => window.removeEventListener("keydown", handleKeyDown);
		}, [onOpenChange, open]);

		// Hooks must run unconditionally (nested Sync Center → Merge device users
		// previously crashed with React #310 when useId ran only while open).
		const titleId = React.useId();
		const descriptionId = React.useId();
		// Allow nested modals to stack above a parent (e.g. payroll correction over timesheet).
		// Default z-[100] so portaled dialogs sit above app chrome (sidebar z-50, drawers).
		const hasExplicitZ =
			typeof className === "string" && /\bz-\[?\d/.test(className);
		const shellZ = hasExplicitZ ? undefined : "z-[100]";

		if (!open) {
			return trigger ? <>{trigger}</> : null;
		}

		const dialog = (
			<div
				className={cn(
					"fixed inset-0 flex items-center justify-center",
					shellZ,
					hasExplicitZ ? className?.match(/z-\S+/)?.[0] : undefined,
				)}>
				{/* Backdrop — under dialog panel in this stacking context */}
				<div
					className="absolute inset-0 bg-black/50"
					onClick={() => {
						if (closeOnBackdropClick) onOpenChange?.(false);
					}}
					aria-hidden
				/>
				{/* Modal Content */}
				<div
					ref={ref}
					role="dialog"
					aria-modal="true"
					aria-labelledby={title ? titleId : undefined}
					aria-describedby={description ? descriptionId : undefined}
					className={cn(
						"relative z-10 flex flex-col w-full max-w-3xl gap-4 border bg-white p-6 shadow-lg duration-200 rounded-lg mx-4 max-h-[90vh] overflow-y-auto modern-scroll",
						className,
					)}
					{...props}
					onClick={(e) => e.stopPropagation()}>
					{(title || description) && (
						<div className="space-y-1.5">
							{title && (
								<h2
									id={titleId}
									className="text-lg font-semibold leading-none tracking-tight">
									{title}
								</h2>
							)}
							{description && (
								<p id={descriptionId} className="text-sm text-muted-foreground">
									{description}
								</p>
							)}
						</div>
					)}
					{children}
					{showCloseButton && (
						<Button
							variant="ghost"
							size="icon"
							className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
							onClick={() => onOpenChange?.(false)}>
							<X className="h-4 w-4" />
							<span className="sr-only">Close</span>
						</Button>
					)}
				</div>
			</div>
		);

		// Portal to document.body so overflow/transform on layout ancestors cannot
		// clip or trap the dialog (Benefits enroll picker, nested drawers, etc.).
		return (
			<>
				{trigger}
				{mounted && typeof document !== "undefined"
					? createPortal(dialog, document.body)
					: dialog}
			</>
		);
	},
);
Modal.displayName = "Modal";

export { Modal };
