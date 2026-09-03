import type { Page as GuidePage } from "~/zod/guide.zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { FileText } from "lucide-react";
import type { GuideConfigActions } from "~/hooks/use-guide-config";
import { AdminBlockEditor } from "./admin-block-editor";

interface AdminContentEditorProps {
	sectionId: string;
	page: GuidePage;
	actions: GuideConfigActions;
}

export function AdminContentEditor({ sectionId, page, actions }: AdminContentEditorProps) {
	const handleTitleChange = (title: string) => {
		const slug = title
			.toLowerCase()
			.replace(/\s+/g, "-")
			.replace(/[^a-z0-9-]/g, "");
		actions.updatePage(sectionId, page.id, { title, slug });
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3 pb-4 border-b border-border">
				<div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
					<FileText className="h-5 w-5 text-primary" />
				</div>
				<div className="flex-1">
					<h2 className="text-lg font-semibold text-foreground">{page.title}</h2>
					<p className="text-sm text-muted-foreground">/{page.slug}</p>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-4">
				<div className="space-y-2">
					<Label htmlFor="page-title" className="text-xs font-medium">
						Page Title
					</Label>
					<Input
						id="page-title"
						value={page.title}
						onChange={(e) => handleTitleChange(e.target.value)}
						placeholder="Page title..."
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="page-slug" className="text-xs font-medium">
						URL Slug
					</Label>
					<Input
						id="page-slug"
						value={page.slug}
						onChange={(e) =>
							actions.updatePage(sectionId, page.id, { slug: e.target.value })
						}
						placeholder="page-slug"
					/>
				</div>
			</div>

			<AdminBlockEditor sectionId={sectionId} page={page} actions={actions} />
		</div>
	);
}
