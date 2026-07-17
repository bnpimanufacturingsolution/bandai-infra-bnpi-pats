import * as React from "react";
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
	/** When false, Escape does not close. Default true. */
	closeOnEscape?: boolean;
}

/**
 * Modal shell that keeps dialog interactive (dropdowns/portals/scroll).
 * Important: backdrop must not sit above the dialog, and the shell uses
 * pointer-events-none so only the dialog captures clicks.
 */
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
			closeOnEscape = true,
			...props
		},
		ref,
	) => {
		const titleId = React.useId();
		const descriptionId = React.useId();
		const requestClose = React.useCallback(() => {
			onOpenChange?.(false);
			if (typeof document !== "undefined") {
				document.body.style.overflow = "unset";
			}
		}, [onOpenChange]);

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
			if (!open || !closeOnEscape) return;
			const handleKeyDown = (event: KeyboardEvent) => {
				if (event.key === "Escape") {
					// Do not capture-phase stopPropagation — Select/dropdowns need Escape too.
					requestClose();
				}
			};
			window.addEventListener("keydown", handleKeyDown);
			return () => window.removeEventListener("keydown", handleKeyDown);
		}, [closeOnEscape, open, requestClose]);

		if (!open) {
			return trigger ? <>{trigger}</> : null;
		}

		return (
			<>
				{trigger}
				{/* Shell: no pointer events so portaled menus above work; children re-enable */}
				<div
					className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none"
					data-modal-shell="true">
					{/* Backdrop behind dialog */}
					<div
						className="absolute inset-0 bg-black/50 pointer-events-auto"
						aria-hidden="true"
						onClick={() => {
							if (closeOnBackdropClick) requestClose();
						}}
					/>
					{/* Dialog panel */}
					<div
						ref={ref}
						role="dialog"
						aria-modal="true"
						aria-labelledby={title ? titleId : undefined}
						aria-describedby={description ? descriptionId : undefined}
						className={cn(
							"relative z-[1] flex w-full max-w-3xl max-h-[min(90vh,900px)] flex-col gap-3 border bg-white p-6 shadow-lg rounded-lg pointer-events-auto",
							className,
						)}
						onClick={(event) => {
							// Keep clicks inside dialog from hitting backdrop.
							event.stopPropagation();
						}}
						{...props}>
						{(title || description || showCloseButton) && (
							<div className="relative shrink-0 space-y-1 pr-10">
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
								{showCloseButton && (
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="absolute right-0 top-0 rounded-sm opacity-90 hover:opacity-100"
										onClick={(event) => {
											event.preventDefault();
											event.stopPropagation();
											requestClose();
										}}>
										<X className="h-4 w-4" />
										<span className="sr-only">Close</span>
									</Button>
								)}
							</div>
						)}
						{/* Scrollable body — dropdowns portal outside so they are not clipped */}
						<div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden modern-scroll">
							{children}
						</div>
					</div>
				</div>
			</>
		);
	},
);
Modal.displayName = "Modal";

export { Modal };
