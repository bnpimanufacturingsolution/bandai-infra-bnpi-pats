import { Modal } from "~/components/atoms/Modal";
import { Button } from "~/components/ui/button";
import { Loader2 } from "lucide-react";

interface DeleteConfirmationModalProps {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: () => Promise<void>;
	isPending: boolean;
	title: string;
	description: string;
}

export function DeleteConfirmationModal({
	isOpen,
	onClose,
	onConfirm,
	isPending,
	title,
	description,
}: DeleteConfirmationModalProps) {
	return (
		<Modal
			open={isOpen}
			onOpenChange={onClose}
			title={title}
			description={description}
			className="max-w-sm">
			<div className="flex justify-end gap-2 pt-4">
				<Button variant="ghost" onClick={onClose} disabled={isPending}>
					Cancel
				</Button>
				<Button variant="destructive" onClick={onConfirm} disabled={isPending}>
					{isPending ? (
						<>
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							Deleting...
						</>
					) : (
						"Delete"
					)}
				</Button>
			</div>
		</Modal>
	);
}
