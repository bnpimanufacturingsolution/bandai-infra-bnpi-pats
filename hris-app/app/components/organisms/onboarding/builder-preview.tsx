import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import ChecklistPreviewTable from "./checklist-preview-table";
import type { ChecklistSection } from "./builder";

interface BuilderPreviewProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	sections: ChecklistSection[];
}

export default function BuilderPreview({ open, onOpenChange, sections }: BuilderPreviewProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Onboarding Checklist Preview</DialogTitle>
					<DialogDescription>
						Read-only preview of the checklist you are building.
					</DialogDescription>
				</DialogHeader>

				<div className="max-h-[60vh] overflow-y-auto">
					<ChecklistPreviewTable sections={sections} />
				</div>
			</DialogContent>
		</Dialog>
	);
}
