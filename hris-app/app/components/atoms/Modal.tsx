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
	/**
	 * Stacking order for the portaled overlay shell (inline style, not Tailwind).
	 * Use when nesting modals — e.g. detail over a parent list dialog.
	 * Default 100 (above sidebar z-50). Nested dialogs should use 110+.
	 */
	zIndex?: number;
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
			zIndex = 100,
			...props
		},
		ref,
	) => {
		const [mounted, setMounted] = React.useState(false);
		const contentRef = React.useRef<HTMLDivElement | null>(null);
		const setContentRef = React.useCallback(
			(node: HTMLDivElement | null) => {
				contentRef.current = node;
				if (typeof ref === "function") ref(node);
				else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
			},
			[ref],
		);

		React.useEffect(() => {
			setMounted(true);
		}, []);

		React.useEffect(() => {
			if (!open) return;
			document.body.style.overflow = "hidden";
			return () => {
				// Nested modals: only unlock body scroll when no dialog remains.
				requestAnimationFrame(() => {
					const remaining = document.querySelectorAll(
						'[role="dialog"][aria-modal="true"]',
					).length;
					if (remaining === 0) {
						document.body.style.overflow = "unset";
					} else {
						document.body.style.overflow = "hidden";
					}
				});
			};
		}, [open]);

		React.useEffect(() => {
			if (!open) return;
			const handleKeyDown = (event: KeyboardEvent) => {
				if (event.key !== "Escape") return;
				// Only the topmost open dialog handles Escape (nested modals).
				const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
				const top = dialogs[dialogs.length - 1];
				if (contentRef.current && top && top !== contentRef.current) return;
				event.preventDefault();
				event.stopPropagation();
				onOpenChange?.(false);
			};
			// Capture so a parent modal registered earlier does not also close.
			window.addEventListener("keydown", handleKeyDown, true);
			return () => window.removeEventListener("keydown", handleKeyDown, true);
		}, [onOpenChange, open]);

		// Hooks must run unconditionally (nested Sync Center → Merge device users
		// previously crashed with React #310 when useId ran only while open).
		const titleId = React.useId();
		const descriptionId = React.useId();
		// overflow-hidden does NOT win over default overflow-y-auto in tailwind-merge
		// (different groups). Contained layouts (DataTable containedScroll, pinned
		// footers) must suppress the dialog-level vertical scroll so height flexes.
		const containOverflow =
			typeof className === "string" &&
			/(?:^|\s)(?:!)?overflow-(?:hidden|y-hidden|clip)(?:\s|$)/.test(className);
		// Strip Tailwind z-* from panel className — stacking belongs on the shell via zIndex.
		const panelClassName =
			typeof className === "string"
				? className
						.replace(/(?:^|\s)z-\[?\d+\]?(?=\s|$)/g, " ")
						.replace(/\s+/g, " ")
						.trim()
				: className;

		if (!open) {
			return trigger ? <>{trigger}</> : null;
		}

		const dialog = (
			<div
				className="fixed inset-0 flex items-center justify-center"
				style={{ zIndex }}
				data-modal-layer={zIndex}>
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
					ref={setContentRef}
					role="dialog"
					aria-modal="true"
					aria-labelledby={title ? titleId : undefined}
					aria-describedby={description ? descriptionId : undefined}
					className={cn(
						"relative z-10 flex w-full max-w-3xl flex-col gap-4 rounded-lg border bg-white p-6 shadow-lg duration-200 mx-4 max-h-[90vh]",
						containOverflow
							? "min-h-0 overflow-hidden"
							: "overflow-y-auto modern-scroll",
						panelClassName,
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
