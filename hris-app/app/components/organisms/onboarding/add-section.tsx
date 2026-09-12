import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";

interface AddSectionProps {
	onCreate: (name: string) => void;
}

export default function AddSection({ onCreate }: AddSectionProps) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");

	const handleCreate = () => {
		const trimmedName = name.trim();

		if (!trimmedName) return;

		onCreate(trimmedName);

		setName("");
		setOpen(false);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="secondary" className="w-full">
					Add Section
				</Button>
			</DialogTrigger>

			<DialogContent>
				<DialogTitle>Add Section</DialogTitle>

				<section className="space-y-3">
					<Input
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="Enter Section Name"
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								handleCreate();
							}
						}}
					/>

					<div className="flex justify-end">
						<Button onClick={handleCreate} disabled={!name.trim()}>
							Create
						</Button>
					</div>
				</section>
			</DialogContent>
		</Dialog>
	);
}
