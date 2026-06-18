import { useState } from "react";
import { type Page as GuidePage } from "~/zod/guide.zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronUp, ChevronDown, Trash2, Plus, FileText, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GuideConfigActions } from "~/hooks/use-guide-config";

interface AdminPageListProps {
	sectionId: string;
	pages: GuidePage[];
	actions: GuideConfigActions;
	selectedPageId: string | null;
	onSelectPage: (sectionId: string, pageId: string) => void;
}

export function AdminPageList({
	sectionId,
	pages,
	actions,
	selectedPageId,
	onSelectPage,
}: AdminPageListProps) {
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editValue, setEditValue] = useState("");
	const [newPageName, setNewPageName] = useState("");
	const [showNewInput, setShowNewInput] = useState(false);

	const handleStartEdit = (page: GuidePage) => {
		setEditingId(page.id);
		setEditValue(page.title);
	};

	const handleSaveEdit = () => {
		if (editingId && editValue.trim()) {
			const slug = editValue
				.toLowerCase()
				.replace(/\s+/g, "-")
				.replace(/[^a-z0-9-]/g, "");
			actions.updatePage(sectionId, editingId, { title: editValue.trim(), slug });
		}
		setEditingId(null);
		setEditValue("");
	};

	const handleCancelEdit = () => {
		setEditingId(null);
		setEditValue("");
	};

	const handleAddPage = () => {
		if (newPageName.trim()) {
			actions.addPage(sectionId, newPageName.trim());
			setNewPageName("");
			setShowNewInput(false);
		}
	};

	return (
		<div className="ml-6 space-y-1">
			{pages.map((page, index) => (
				<div
					key={page.id}
					className={cn(
						"flex items-center gap-1 group rounded-md",
						selectedPageId === page.id && "bg-accent",
					)}>
					<div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
						<Button
							variant="ghost"
							size="sm"
							className="h-3 w-3 p-0"
							disabled={index === 0}
							onClick={() => actions.reorderPages(sectionId, index, index - 1)}>
							<ChevronUp className="h-2.5 w-2.5" />
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="h-3 w-3 p-0"
							disabled={index === pages.length - 1}
							onClick={() => actions.reorderPages(sectionId, index, index + 1)}>
							<ChevronDown className="h-2.5 w-2.5" />
						</Button>
					</div>

					{editingId === page.id ? (
						<div className="flex items-center gap-1 flex-1 py-1 px-1">
							<Input
								value={editValue}
								onChange={(e) => setEditValue(e.target.value)}
								className="h-6 text-xs"
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
								className="h-6 w-6 p-0">
								<Check className="h-3 w-3 text-primary" />
							</Button>
							<Button
								size="sm"
								variant="ghost"
								onClick={handleCancelEdit}
								className="h-6 w-6 p-0">
								<X className="h-3 w-3" />
							</Button>
						</div>
					) : (
						<button
							onClick={() => onSelectPage(sectionId, page.id)}
							className="flex items-center gap-2 flex-1 py-1.5 px-2 text-left hover:bg-muted rounded">
							<FileText className="h-3.5 w-3.5 text-muted-foreground" />
							<span className="text-sm truncate">{page.title}</span>
							<span className="text-xs text-muted-foreground ml-auto">
								{page.blocks.length} blocks
							</span>
						</button>
					)}

					{editingId !== page.id && (
						<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
							<Button
								variant="ghost"
								size="sm"
								className="h-6 w-6 p-0"
								onClick={() => handleStartEdit(page)}>
								<Pencil className="h-3 w-3" />
							</Button>
							<Button
								variant="ghost"
								size="sm"
								className="h-6 w-6 p-0 text-destructive hover:text-destructive"
								onClick={() => actions.deletePage(sectionId, page.id)}>
								<Trash2 className="h-3 w-3" />
							</Button>
						</div>
					)}
				</div>
			))}

			{showNewInput ? (
				<div className="flex items-center gap-1 p-1 bg-muted rounded-md">
					<Input
						value={newPageName}
						onChange={(e) => setNewPageName(e.target.value)}
						placeholder="Page name..."
						className="h-6 text-xs"
						onKeyDown={(e) => e.key === "Enter" && handleAddPage()}
						autoFocus
					/>
					<Button
						size="sm"
						variant="ghost"
						onClick={handleAddPage}
						className="h-6 w-6 p-0">
						<Check className="h-3 w-3 text-primary" />
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={() => {
							setShowNewInput(false);
							setNewPageName("");
						}}
						className="h-6 w-6 p-0">
						<X className="h-3 w-3" />
					</Button>
				</div>
			) : (
				<Button
					variant="ghost"
					size="sm"
					onClick={() => setShowNewInput(true)}
					className="h-7 w-full justify-start text-muted-foreground hover:text-foreground">
					<Plus className="h-3 w-3 mr-1" />
					<span className="text-xs">Add page</span>
				</Button>
			)}
		</div>
	);
}
