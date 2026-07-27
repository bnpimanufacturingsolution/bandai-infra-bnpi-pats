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

		if (!open) {
			return trigger ? <>{trigger}</> : null;
		}

		// Allow nested modals to stack above a parent (e.g. payroll correction over timesheet).
		const hasExplicitZ =
			typeof className === "string" && /\bz-\[?\d/.test(className);
		const shellZ = hasExplicitZ ? undefined : "z-50";

		return (
			<>
				{trigger}
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
						className={cn(
							"relative z-10 flex flex-col w-full max-w-3xl gap-4 border bg-white p-6 shadow-lg duration-200 rounded-lg mx-4 max-h-[90vh] overflow-y-auto modern-scroll",
							className,
						)}
						{...props}
						onClick={(e) => e.stopPropagation()}>
						{(title || description) && (
							<div className="space-y-1.5">
								{title && (
									<h2 className="text-lg font-semibold leading-none tracking-tight">
										{title}
									</h2>
								)}
								{description && (
									<p className="text-sm text-muted-foreground">{description}</p>
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
			</>
		);
	},
);
Modal.displayName = "Modal";

export { Modal };
