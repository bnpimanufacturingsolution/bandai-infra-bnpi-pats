import { useState } from "react";
import type { Block as ContentBlock, Page as GuidePage } from "~/zod/guide.zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	ChevronUp,
	ChevronDown,
	Trash2,
	Plus,
	Type,
	Code,
	AlertCircle,
	Heading,
	GripVertical,
	Image,
	List,
	MessageSquare,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { GuideConfigActions } from "~/hooks/use-guide-config";

interface AdminBlockEditorProps {
	sectionId: string;
	page: GuidePage;
	actions: GuideConfigActions;
}

const blockTypeIcons: Record<ContentBlock["type"], React.ReactNode> = {
	text: <Type className="h-4 w-4" />,
	code: <Code className="h-4 w-4" />,
	callout: <AlertCircle className="h-4 w-4" />,
	heading: <Heading className="h-4 w-4" />,
	image: <Image className="h-4 w-4" />,
	list: <List className="h-4 w-4" />,
	quote: <MessageSquare className="h-4 w-4" />,
};

const blockTypeLabels: Record<ContentBlock["type"], string> = {
	text: "Text",
	code: "Code",
	callout: "Callout",
	heading: "Heading",
	image: "Image",
	list: "List",
	quote: "Quote",
};

export function AdminBlockEditor({ sectionId, page, actions }: AdminBlockEditorProps) {
	const [expandedBlock, setExpandedBlock] = useState<number | null>(null);

	const handleAddBlock = (type: ContentBlock["type"]) => {
		let block: ContentBlock;

		switch (type) {
			case "text":
				block = { type: "text", content: "" };
				break;
			case "code":
				block = { type: "code", language: "typescript", content: "" };
				break;
			case "callout":
				block = { type: "callout", variant: "info", content: "" };
				break;
			case "heading":
				block = { type: "heading", level: 2, content: "", id: `heading-${Date.now()}` };
				break;
			case "image":
				block = { type: "image", content: "" };
				break;
			case "list":
				block = { type: "list", content: "" };
				break;
			case "quote":
				block = { type: "quote", content: "" };
				break;
			default:
				block = { type: "text", content: "" };
		}

		actions.addBlock(sectionId, page.id, block);
		setExpandedBlock(page.blocks.length);
	};

	const handleUpdateBlock = (index: number, updates: Partial<ContentBlock>) => {
		const currentBlock = page.blocks[index];
		const updatedBlock = { ...currentBlock, ...updates } as ContentBlock;

		// Auto-generate ID for headings based on content
		if (updatedBlock.type === "heading" && "content" in updates) {
			updatedBlock.id =
				updates.content
					?.toLowerCase()
					.replace(/\s+/g, "-")
					.replace(/[^a-z0-9-]/g, "") || `heading-${Date.now()}`;
		}

		actions.updateBlock(sectionId, page.id, index, updatedBlock);
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold text-foreground">Content Blocks</h3>
				<div className="flex items-center gap-1">
					<Button
						variant="outline"
						size="sm"
						onClick={() => handleAddBlock("heading")}
						className="h-7 text-xs">
						<Heading className="h-3 w-3 mr-1" />
						Heading
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => handleAddBlock("text")}
						className="h-7 text-xs">
						<Type className="h-3 w-3 mr-1" />
						Text
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => handleAddBlock("code")}
						className="h-7 text-xs">
						<Code className="h-3 w-3 mr-1" />
						Code
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => handleAddBlock("callout")}
						className="h-7 text-xs">
						<AlertCircle className="h-3 w-3 mr-1" />
						Callout
					</Button>
				</div>
			</div>

			{page.blocks.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-12 px-4 border-2 border-dashed border-border rounded-lg">
					<Plus className="h-8 w-8 text-muted-foreground mb-2" />
					<p className="text-sm text-muted-foreground text-center">
						No content blocks yet. Add your first block using the buttons above.
					</p>
				</div>
			) : (
				<div className="space-y-2">
					{page.blocks.map((block, index) => (
						<div
							key={index}
							className={cn(
								"border border-border rounded-lg overflow-hidden transition-all",
								expandedBlock === index ? "bg-card" : "bg-background",
							)}>
							<div
								className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted/50"
								onClick={() =>
									setExpandedBlock(expandedBlock === index ? null : index)
								}>
								<GripVertical className="h-4 w-4 text-muted-foreground" />
								<div className="flex items-center gap-2 flex-1">
									{blockTypeIcons[block.type]}
									<span className="text-sm font-medium">
										{blockTypeLabels[block.type]}
									</span>
									<span className="text-xs text-muted-foreground truncate max-w-[200px]">
										{block.content.substring(0, 50)}
										{block.content.length > 50 && "..."}
									</span>
								</div>
								<div className="flex items-center gap-1">
									<Button
										variant="ghost"
										size="sm"
										className="h-6 w-6 p-0"
										disabled={index === 0}
										onClick={(e) => {
											e.stopPropagation();
											actions.reorderBlocks(
												sectionId,
												page.id,
												index,
												index - 1,
											);
											if (expandedBlock === index)
												setExpandedBlock(index - 1);
										}}>
										<ChevronUp className="h-3 w-3" />
									</Button>
									<Button
										variant="ghost"
										size="sm"
										className="h-6 w-6 p-0"
										disabled={index === page.blocks.length - 1}
										onClick={(e) => {
											e.stopPropagation();
											actions.reorderBlocks(
												sectionId,
												page.id,
												index,
												index + 1,
											);
											if (expandedBlock === index)
												setExpandedBlock(index + 1);
										}}>
										<ChevronDown className="h-3 w-3" />
									</Button>
									<Button
										variant="ghost"
										size="sm"
										className="h-6 w-6 p-0 text-destructive hover:text-destructive"
										onClick={(e) => {
											e.stopPropagation();
											actions.deleteBlock(sectionId, page.id, index);
											if (expandedBlock === index) setExpandedBlock(null);
										}}>
										<Trash2 className="h-3 w-3" />
									</Button>
								</div>
							</div>

							{expandedBlock === index && (
								<div className="p-3 pt-0 border-t border-border space-y-3">
									<BlockEditor
										block={block}
										onUpdate={(updates) => handleUpdateBlock(index, updates)}
									/>
								</div>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}

interface BlockEditorProps {
	block: ContentBlock;
	onUpdate: (updates: Partial<ContentBlock>) => void;
}

function BlockEditor({ block, onUpdate }: BlockEditorProps) {
	switch (block.type) {
		case "text":
			return (
				<Textarea
					value={block.content}
					onChange={(e) => onUpdate({ content: e.target.value })}
					placeholder="Enter text content... (supports markdown-like syntax: `code`, [links](url))"
					className="min-h-[100px] text-sm"
				/>
			);

		case "heading":
			return (
				<div className="space-y-3">
					<div className="flex items-center gap-2">
						<label className="text-xs font-medium text-muted-foreground w-16">
							Level
						</label>
						<Select
							value={String(block.level)}
							onValueChange={(value) =>
								onUpdate({ level: Number(value) as 2 | 3 | 4 })
							}>
							<SelectTrigger className="h-8 w-24">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="2">H2</SelectItem>
								<SelectItem value="3">H3</SelectItem>
								<SelectItem value="4">H4</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<Input
						value={block.content}
						onChange={(e) => onUpdate({ content: e.target.value })}
						placeholder="Heading text..."
						className="text-sm"
					/>
				</div>
			);

		case "code":
			return (
				<div className="space-y-3">
					<div className="flex items-center gap-4">
						<div className="flex items-center gap-2">
							<label className="text-xs font-medium text-muted-foreground">
								Language
							</label>
							<Select
								value={block.language}
								onValueChange={(value) => onUpdate({ language: value })}>
								<SelectTrigger className="h-8 w-32">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="typescript">TypeScript</SelectItem>
									<SelectItem value="javascript">JavaScript</SelectItem>
									<SelectItem value="bash">Bash</SelectItem>
									<SelectItem value="json">JSON</SelectItem>
									<SelectItem value="html">HTML</SelectItem>
									<SelectItem value="css">CSS</SelectItem>
									<SelectItem value="text">Plain Text</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="flex items-center gap-2 flex-1">
							<label className="text-xs font-medium text-muted-foreground">
								Filename
							</label>
							<Input
								value={block.filename || ""}
								onChange={(e) =>
									onUpdate({ filename: e.target.value || undefined })
								}
								placeholder="optional..."
								className="h-8 text-sm"
							/>
						</div>
					</div>
					<Textarea
						value={block.content}
						onChange={(e) => onUpdate({ content: e.target.value })}
						placeholder="Paste your code here..."
						className="min-h-[150px] font-mono text-sm"
					/>
				</div>
			);

		case "callout":
			return (
				<div className="space-y-3">
					<div className="flex items-center gap-4">
						<div className="flex items-center gap-2">
							<label className="text-xs font-medium text-muted-foreground">
								Variant
							</label>
							<Select
								value={block.variant}
								onValueChange={(value: "info" | "warning" | "success") =>
									onUpdate({ variant: value })
								}>
								<SelectTrigger className="h-8 w-28">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="info">Info</SelectItem>
									<SelectItem value="warning">Warning</SelectItem>
									<SelectItem value="success">Success</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="flex items-center gap-2 flex-1">
							<label className="text-xs font-medium text-muted-foreground">
								Title
							</label>
							<Input
								value={block.title || ""}
								onChange={(e) => onUpdate({ title: e.target.value || undefined })}
								placeholder="optional..."
								className="h-8 text-sm"
							/>
						</div>
					</div>
					<Textarea
						value={block.content}
						onChange={(e) => onUpdate({ content: e.target.value })}
						placeholder="Callout content..."
						className="min-h-[80px] text-sm"
					/>
				</div>
			);

		default:
			return null;
	}
}
