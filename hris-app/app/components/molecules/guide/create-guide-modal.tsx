import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "~/components/atoms/Modal";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface CreateGuideModalProps {
	isOpen: boolean;
	onClose: () => void;
	onCreate: (data: { title: string; description: string }) => Promise<void>;
	isPending: boolean;
}

export function CreateGuideModal({ isOpen, onClose, onCreate, isPending }: CreateGuideModalProps) {
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (title.trim()) {
			await onCreate({ title, description });
			setTitle("");
			setDescription("");
			onClose();
		}
	};

	return (
		<Modal
			open={isOpen}
			onOpenChange={onClose}
			title="Create New Guide"
			description="Fill in the details below to create a new documentation guide."
			className="max-w-md">
			<form onSubmit={handleSubmit} className="space-y-4 pt-4">
				<div className="space-y-2">
					<Label htmlFor="guide-title">Title</Label>
					<Input
						id="guide-title"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="e.g., Employee Handbook"
						required
						autoFocus
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="guide-description">Description</Label>
					<Textarea
						id="guide-description"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						placeholder="A brief overview of what this guide covers..."
						className="min-h-[100px]"
					/>
				</div>
				<div className="flex justify-end gap-2 pt-2">
					<Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
						Cancel
					</Button>
					<Button type="submit" disabled={isPending || !title.trim()}>
						{isPending ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Creating...
							</>
						) : (
							"Create Guide"
						)}
					</Button>
				</div>
			</form>
		</Modal>
	);
}
