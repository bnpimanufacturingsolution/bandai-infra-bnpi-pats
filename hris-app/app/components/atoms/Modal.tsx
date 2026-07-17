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
	/** When false, Escape still closes (admin modals must always dismiss). Default true. */
	closeOnEscape?: boolean;
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
			closeOnEscape = true,
			...props
		},
		ref,
	) => {
		const titleId = React.useId();
		const descriptionId = React.useId();
		const requestClose = React.useCallback(() => {
			// Always allow close; never block on child loading/network.
			onOpenChange?.(false);
			// Defensive: nested/stuck modals can leave body scroll locked.
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
					event.preventDefault();
					event.stopPropagation();
					requestClose();
				}
			};
			// Capture phase so child handlers / busy UI cannot swallow Escape.
			window.addEventListener("keydown", handleKeyDown, true);
			return () => window.removeEventListener("keydown", handleKeyDown, true);
		}, [closeOnEscape, open, requestClose]);

		if (!open) {
			return trigger ? <>{trigger}</> : null;
		}

		return (
			<>
				{trigger}
				<div className="fixed inset-0 z-[100] flex items-center justify-center">
					{/* Backdrop */}
					<button
						type="button"
						className="fixed inset-0 z-[100] bg-black/50"
						aria-label="Close modal backdrop"
						onClick={() => {
							if (closeOnBackdropClick) requestClose();
						}}
					/>
					{/* Modal Content */}
					<div
						ref={ref}
						role="dialog"
						aria-modal="true"
						aria-labelledby={title ? titleId : undefined}
						aria-describedby={description ? descriptionId : undefined}
						className={cn(
							"relative z-[110] flex flex-col w-full max-w-3xl gap-4 border bg-white p-6 shadow-lg duration-200 rounded-lg mx-4 max-h-[90vh] overflow-y-auto modern-scroll",
							className,
						)}
						{...props}>
						{(title || description) && (
							<div className="sticky top-0 z-[120] -mx-1 space-y-1.5 bg-white/95 px-1 pb-1 pr-12 backdrop-blur-sm">
								{title && (
									<h2
										id={titleId}
										className="text-lg font-semibold leading-none tracking-tight">
										{title}
									</h2>
								)}
								{description && (
									<p id={descriptionId} className="text-sm text-muted-foreground">{description}</p>
								)}
							</div>
						)}
						{children}
						{showCloseButton && (
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="absolute right-3 top-3 z-[130] pointer-events-auto rounded-sm bg-white/90 opacity-90 shadow-sm ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
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
				</div>
			</>
		);
	},
);
Modal.displayName = "Modal";

export { Modal };
