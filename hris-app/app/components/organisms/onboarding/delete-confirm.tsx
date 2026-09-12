import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog";

interface DeleteConfirmProps {
	label: string;
	name: string;
	warning?: string;
	onConfirm: () => void;
}

export default function DeleteConfirm({ label, name, warning, onConfirm }: DeleteConfirmProps) {
	const [open, setOpen] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<Button
				variant="ghost"
				size="sm"
				onClick={() => setOpen(true)}
				aria-label={`Delete ${label} ${name}`}>
				Delete
			</Button>
			<DialogContent className="max-w-md">
				<DialogTitle>Delete {label}</DialogTitle>
				<p className="text-sm text-gray-600">
					Delete &ldquo;{name}&rdquo;? {warning || `This ${label} will be removed when you save.`}
				</p>
				<div className="flex justify-end gap-2">
					<Button variant="secondary" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button
						onClick={() => {
							onConfirm();
							setOpen(false);
						}}>
						Delete {label}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
