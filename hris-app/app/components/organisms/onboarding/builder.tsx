import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import AddSection from "./add-section";
import BuilderPreview from "./builder-preview";
import SectionCard from "./section-card";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import {
	useOnboardingTemplate,
	useOnboardingTemplates,
	useSaveOnboardingTemplateTree,
} from "~/lib/hooks/useOnboarding";
import type {
	OnboardingTemplateTree,
	TemplateTreeItemPayload,
	TemplateTreeSectionPayload,
} from "~/zod/onboarding";

export interface ChecklistItem {
	id: string;
	serverId?: string | null;
	name: string;
	personInChargeId: string;
	personInChargeName: string;
	children: ChecklistItem[];
}

export interface ChecklistSection {
	id: string;
	serverId?: string | null;
	name: string;
	items: ChecklistItem[];
}

export const MAX_ITEM_DEPTH = 3;

export function addChildToItems(
	items: ChecklistItem[],
	parentId: string,
	newItem: ChecklistItem,
): ChecklistItem[] {
	return items.map((item) => {
		if (item.id === parentId) {
			return {
				...item,
				children: [...item.children, newItem],
			};
		}

		return {
			...item,
			children: addChildToItems(item.children, parentId, newItem),
		};
	});
}

export interface ItemPatch {
	name?: string;
	personInChargeId?: string;
	personInChargeName?: string;
}

export function updateItemInItems(
	items: ChecklistItem[],
	itemId: string,
	patch: ItemPatch,
): ChecklistItem[] {
	return items.map((item) => {
		if (item.id === itemId) {
			return { ...item, ...patch };
		}
		if (item.children.length > 0) {
			return { ...item, children: updateItemInItems(item.children, itemId, patch) };
		}
		return item;
	});
}

export function removeItemFromItems(items: ChecklistItem[], itemId: string): ChecklistItem[] {
	return items
		.filter((item) => item.id !== itemId)
		.map((item) =>
			item.children.length > 0
				? { ...item, children: removeItemFromItems(item.children, itemId) }
				: item,
		);
}

export function updateSectionName(
	sections: ChecklistSection[],
	sectionId: string,
	name: string,
): ChecklistSection[] {
	return sections.map((section) => (section.id === sectionId ? { ...section, name } : section));
}

export function removeSectionById(
	sections: ChecklistSection[],
	sectionId: string,
): ChecklistSection[] {
	return sections.filter((section) => section.id !== sectionId);
}

export function mapTemplateToSections(template: OnboardingTemplateTree): ChecklistSection[] {
	const mapItem = (item: OnboardingTemplateTree["sections"][number]["items"][number]): ChecklistItem => ({
		id: item.id,
		serverId: item.id,
		name: item.title,
		personInChargeId: item.responsibleDepartmentId ?? "",
		personInChargeName: item.responsibleDepartmentName ?? "",
		children: (item.children ?? []).map(mapItem),
	});
	return template.sections.map((section) => ({
		id: section.id,
		serverId: section.id,
		name: section.title,
		items: section.items.map(mapItem),
	}));
}

export function sectionsToTreePayload(sections: ChecklistSection[]): TemplateTreeSectionPayload[] {
	return sections.map((section, sectionIndex) => {
		const items: TemplateTreeItemPayload[] = [];
		const walk = (
			list: ChecklistItem[],
			parentTempId: string | null,
			prefix: string,
		) => {
			list.forEach((item, index) => {
				const number = prefix ? `${prefix}.${index + 1}` : String(index + 1);
				items.push({
					...(item.serverId ? { id: item.serverId } : {}),
					tempId: item.id,
					parentTempId,
					number,
					title: item.name,
					responsibleDepartmentId: item.personInChargeId || null,
					responsibleDepartmentName: item.personInChargeName || null,
					order: index + 1,
				});
				walk(item.children, item.id, number);
			});
		};
		walk(section.items, null, "");
		return {
			...(section.serverId ? { id: section.serverId } : {}),
			tempId: section.id,
			title: section.name,
			order: sectionIndex + 1,
			items,
		};
	});
}

export function AdminOnboardingBuilder() {
	const [sections, setSections] = useState<ChecklistSection[]>([]);
	const [previewOpen, setPreviewOpen] = useState(false);
	const [templateId, setTemplateId] = useState<string | null>(null);
	const [templateName, setTemplateName] = useState("Standard Onboarding Checklist");

	const templatesQuery = useOnboardingTemplates();
	const templateQuery = useOnboardingTemplate(templateId);
	const saveTemplateMutation = useSaveOnboardingTemplateTree();

	// Auto-open the FIRST created template (single-template product; no create-another affordance).
	useEffect(() => {
		if (templateId) return;
		const list = templatesQuery.data?.templates ?? [];
		if (list.length > 0) {
			setTemplateId(list[0].id);
		}
	}, [templatesQuery.data, templateId]);

	useEffect(() => {
		if (templateQuery.data?.template) {
			setSections(mapTemplateToSections(templateQuery.data.template));
			setTemplateName(templateQuery.data.template.name);
		}
	}, [templateQuery.data]);

	const handleSave = () => {
		saveTemplateMutation.mutate(
			{
				templateId,
				payload: {
					name: templateName,
					sections: sectionsToTreePayload(sections),
				},
			},
			{
				onSuccess: (result) => {
					const savedId = result?.template?.id;
					if (savedId) setTemplateId(savedId);
				},
			},
		);
	};

	// ---------------------------------------------
	// Sections
	// ---------------------------------------------

	const addSection = (name: string) => {
		const section: ChecklistSection = {
			id: crypto.randomUUID(),
			name,
			items: [],
		};

		setSections((current) => [...current, section]);
	};

	// ---------------------------------------------
	// Items
	// ---------------------------------------------

	const addItemToSection = (
		sectionId: string,
		name: string,
		personInChargeId: string,
		personInChargeName: string,
	) => {
		const newItem: ChecklistItem = {
			id: crypto.randomUUID(),
			name,
			personInChargeId,
			personInChargeName,
			children: [],
		};

		setSections((current) =>
			current.map((section) =>
				section.id === sectionId
					? {
							...section,
							items: [...section.items, newItem],
						}
					: section,
			),
		);
	};

	const addChildItem = (
		sectionId: string,
		parentId: string,
		name: string,
		personInChargeId: string,
		personInChargeName: string,
	) => {
		const newItem: ChecklistItem = {
			id: crypto.randomUUID(),
			name,
			personInChargeId,
			personInChargeName,
			children: [],
		};

		setSections((current) =>
			current.map((section) => {
				if (section.id !== sectionId) {
					return section;
				}

				return {
					...section,
					items: addChildToItems(section.items, parentId, newItem),
				};
			}),
		);
	};

	// ---------------------------------------------
	// Section / item edit + delete
	// ---------------------------------------------

	const renameSection = (sectionId: string, name: string) => {
		setSections((current) => updateSectionName(current, sectionId, name));
	};

	const deleteSection = (sectionId: string) => {
		setSections((current) => removeSectionById(current, sectionId));
	};

	const editItem = (sectionId: string, itemId: string, patch: ItemPatch) => {
		setSections((current) =>
			current.map((section) =>
				section.id === sectionId
					? { ...section, items: updateItemInItems(section.items, itemId, patch) }
					: section,
			),
		);
	};

	const deleteItem = (sectionId: string, itemId: string) => {
		setSections((current) =>
			current.map((section) =>
				section.id === sectionId
					? { ...section, items: removeItemFromItems(section.items, itemId) }
					: section,
			),
		);
	};

	return (
		<Card className="space-y-3">
			{/* Header */}

			<CardHeader className="flex flex-col gap-3">
				<div className="flex items-center justify-between gap-5">
					<h2>Onboarding Checklist Builder</h2>

					<div className="flex items-center gap-2">
						<Button variant="outline" onClick={() => setPreviewOpen(true)}>
							Preview
						</Button>

						<Button
							onClick={handleSave}
							disabled={saveTemplateMutation.isPending || !templateName.trim()}>
							{saveTemplateMutation.isPending ? "Saving..." : "Save"}
						</Button>

						<Button asChild>
							<Link to="/admin/configuration/onboarding/checklist">Go to Checklist</Link>
						</Button>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<label className="text-sm font-medium text-gray-600" htmlFor="template-name">
						Checklist name
					</label>
					<Input
						id="template-name"
						aria-label="Template name"
						className="max-w-xs"
						value={templateName}
						onChange={(event) => setTemplateName(event.target.value)}
						placeholder="Checklist name"
					/>
				</div>
			</CardHeader>

			{/* Sections */}
			<CardContent className="max-h-[75vh] space-y-5 overflow-auto pb-10">
				{templatesQuery.isLoading || templateQuery.isLoading ? (
					<p className="text-sm text-muted-foreground">Loading your checklist…</p>
				) : (
					sections.map((section) => (
						<SectionCard
							key={section.id}
							section={section}
							onAddItem={addItemToSection}
							onAddChildItem={addChildItem}
							onRenameSection={renameSection}
							onDeleteSection={deleteSection}
							onEditItem={editItem}
							onDeleteItem={deleteItem}
						/>
					))
				)}

				{/* Add Section */}

				<section>
					<AddSection onCreate={addSection} />
				</section>
			</CardContent>

			<BuilderPreview open={previewOpen} onOpenChange={setPreviewOpen} sections={sections} />
		</Card>
	);
}
