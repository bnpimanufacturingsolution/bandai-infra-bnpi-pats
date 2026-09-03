import { useState } from "react";
import { type Section as GuideSection } from "~/zod/guide.zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { ChevronUp, ChevronDown, Trash2, Plus, FolderOpen, Pencil, Check, X } from "lucide-react";
import type { GuideConfigActions } from "~/hooks/use-guide-config";
import { AdminPageList } from "./admin-page-list";

interface AdminSectionListProps {
	sections: GuideSection[];
	actions: GuideConfigActions;
	selectedPageId: string | null;
	onSelectPage: (sectionId: string, pageId: string) => void;
}

export function AdminSectionList({
	sections,
	actions,
	selectedPageId,
	onSelectPage,
}: AdminSectionListProps) {
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editValue, setEditValue] = useState("");
	const [newSectionName, setNewSectionName] = useState("");
	const [showNewInput, setShowNewInput] = useState(false);

	const handleStartEdit = (section: GuideSection) => {
		setEditingId(section.id);
		setEditValue(section.title);
	};

	const handleSaveEdit = () => {
		if (editingId && editValue.trim()) {
			actions.updateSection(editingId, editValue.trim());
		}
		setEditingId(null);
		setEditValue("");
	};

	const handleCancelEdit = () => {
		setEditingId(null);
		setEditValue("");
	};

	const handleAddSection = () => {
		if (newSectionName.trim()) {
			actions.addSection(newSectionName.trim());
			setNewSectionName("");
			setShowNewInput(false);
		}
	};

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between mb-4">
				<h3 className="text-sm font-semibold text-foreground">Sections</h3>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => setShowNewInput(true)}
					className="h-7 px-2">
					<Plus className="h-4 w-4" />
				</Button>
			</div>

			{showNewInput && (
				<div className="flex items-center gap-2 p-2 bg-muted rounded-md mb-2">
					<Input
						value={newSectionName}
						onChange={(e) => setNewSectionName(e.target.value)}
						placeholder="Section name..."
						className="h-8 text-sm"
						onKeyDown={(e) => e.key === "Enter" && handleAddSection()}
						autoFocus
					/>
					<Button
						size="sm"
						variant="ghost"
						onClick={handleAddSection}
						className="h-8 w-8 p-0">
						<Check className="h-4 w-4 text-primary" />
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={() => {
							setShowNewInput(false);
							setNewSectionName("");
						}}
						className="h-8 w-8 p-0">
						<X className="h-4 w-4" />
					</Button>
				</div>
			)}

			<Accordion type="multiple" defaultValue={sections.map((s) => s.id)}>
				{sections.map((section, index) => (
					<AccordionItem key={section.id} value={section.id} className="border-b-0">
						<div className="flex items-center gap-1 group">
							<div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
								<Button
									variant="ghost"
									size="sm"
									className="h-4 w-4 p-0"
									disabled={index === 0}
									onClick={() => actions.reorderSections(index, index - 1)}>
									<ChevronUp className="h-3 w-3" />
								</Button>
								<Button
									variant="ghost"
									size="sm"
									className="h-4 w-4 p-0"
									disabled={index === sections.length - 1}
									onClick={() => actions.reorderSections(index, index + 1)}>
									<ChevronDown className="h-3 w-3" />
								</Button>
							</div>

							{editingId === section.id ? (
								<div className="flex items-center gap-1 flex-1 py-2">
									<Input
										value={editValue}
										onChange={(e) => setEditValue(e.target.value)}
										className="h-7 text-sm"
										onKeyDown={(e) => {
											if (e.key === "Enter") handleSaveEdit();
											if (e.key === "Escape") handleCancelEdit();
										}}
										autoFocus
									/>
									<Button
										size="sm"
										variant="ghost"
										onClick={handleSaveEdit}
										className="h-7 w-7 p-0">
										<Check className="h-4 w-4 text-primary" />
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onClick={handleCancelEdit}
										className="h-7 w-7 p-0">
										<X className="h-4 w-4" />
									</Button>
								</div>
							) : (
								<AccordionTrigger className="flex-1 py-2 hover:no-underline">
									<div className="flex items-center gap-2">
										<FolderOpen className="h-4 w-4 text-muted-foreground" />
										<span className="text-sm font-medium">{section.title}</span>
										<span className="text-xs text-muted-foreground">
											({section.pages.length})
										</span>
									</div>
								</AccordionTrigger>
							)}

							{editingId !== section.id && (
								<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
									<Button
										variant="ghost"
										size="sm"
										className="h-7 w-7 p-0"
										onClick={() => handleStartEdit(section)}>
										<Pencil className="h-3 w-3" />
									</Button>
									<Button
										variant="ghost"
										size="sm"
										className="h-7 w-7 p-0 text-destructive hover:text-destructive"
										onClick={() => actions.deleteSection(section.id)}>
										<Trash2 className="h-3 w-3" />
									</Button>
								</div>
							)}
						</div>

						<AccordionContent className="pt-0 pb-2">
							<AdminPageList
								sectionId={section.id}
								pages={section.pages}
								actions={actions}
								selectedPageId={selectedPageId}
								onSelectPage={onSelectPage}
							/>
						</AccordionContent>
					</AccordionItem>
				))}
			</Accordion>
		</div>
	);
}
