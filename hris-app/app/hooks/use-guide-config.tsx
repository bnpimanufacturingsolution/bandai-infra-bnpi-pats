import { useState, useCallback, useEffect } from "react";
import type {
	Guide as GuideConfig,
	Section as GuideSection,
	Page as GuidePage,
	Block as ContentBlock,
} from "~/zod/guide.zod";

// Default initial state for a new guide
const emptyGuide: GuideConfig = {
	title: "",
	description: "",
	sections: [],
	published: false,
	isDeleted: false,
};

// Hook to manage guide configuration state
export function useGuideConfig(initialGuide?: GuideConfig) {
	const [config, setConfig] = useState<GuideConfig>(initialGuide || emptyGuide);

	// Sync state if initialGuide arrives after mount (e.g. from API)
	useEffect(() => {
		if (initialGuide) {
			console.log("Syncing guide config with initialGuide:", initialGuide.id);
			setConfig(initialGuide);
		}
	}, [initialGuide]);

	// Section operations
	const addSection = useCallback((title: string) => {
		const newSection: GuideSection = {
			id: `section-${Date.now()}`,
			title,
			pages: [],
		};
		setConfig((prev) => ({
			...prev,
			sections: [...prev.sections, newSection],
		}));
	}, []);

	const updateSection = useCallback((sectionId: string, title: string) => {
		setConfig((prev) => ({
			...prev,
			sections: prev.sections.map((s) => (s.id === sectionId ? { ...s, title } : s)),
		}));
	}, []);

	const deleteSection = useCallback((sectionId: string) => {
		setConfig((prev) => ({
			...prev,
			sections: prev.sections.filter((s) => s.id !== sectionId),
		}));
	}, []);

	const reorderSections = useCallback((fromIndex: number, toIndex: number) => {
		setConfig((prev) => {
			const sections = [...prev.sections];
			const [moved] = sections.splice(fromIndex, 1);
			sections.splice(toIndex, 0, moved);
			return { ...prev, sections };
		});
	}, []);

	// Page operations
	const addPage = useCallback((sectionId: string, title: string) => {
		const slug = title
			.toLowerCase()
			.replace(/\s+/g, "-")
			.replace(/[^a-z0-9-]/g, "");
		const newPage: GuidePage = {
			id: `page-${Date.now()}`,
			title,
			slug,
			blocks: [],
		};
		setConfig((prev) => ({
			...prev,
			sections: prev.sections.map((s) =>
				s.id === sectionId ? { ...s, pages: [...s.pages, newPage] } : s,
			),
		}));
	}, []);

	const updatePage = useCallback(
		(
			sectionId: string,
			pageId: string,
			updates: Partial<Pick<GuidePage, "title" | "slug">>,
		) => {
			setConfig((prev) => ({
				...prev,
				sections: prev.sections.map((s) =>
					s.id === sectionId
						? {
								...s,
								pages: s.pages.map((p) =>
									p.id === pageId ? { ...p, ...updates } : p,
								),
							}
						: s,
				),
			}));
		},
		[],
	);

	const deletePage = useCallback((sectionId: string, pageId: string) => {
		setConfig((prev) => ({
			...prev,
			sections: prev.sections.map((s) =>
				s.id === sectionId ? { ...s, pages: s.pages.filter((p) => p.id !== pageId) } : s,
			),
		}));
	}, []);

	const reorderPages = useCallback((sectionId: string, fromIndex: number, toIndex: number) => {
		setConfig((prev) => ({
			...prev,
			sections: prev.sections.map((s) => {
				if (s.id !== sectionId) return s;
				const pages = [...s.pages];
				const [moved] = pages.splice(fromIndex, 1);
				pages.splice(toIndex, 0, moved);
				return { ...s, pages };
			}),
		}));
	}, []);

	// Block operations
	const addBlock = useCallback((sectionId: string, pageId: string, block: ContentBlock) => {
		setConfig((prev) => ({
			...prev,
			sections: prev.sections.map((s) =>
				s.id === sectionId
					? {
							...s,
							pages: s.pages.map((p) =>
								p.id === pageId ? { ...p, blocks: [...p.blocks, block] } : p,
							),
						}
					: s,
			),
		}));
	}, []);

	const updateBlock = useCallback(
		(sectionId: string, pageId: string, blockIndex: number, block: ContentBlock) => {
			setConfig((prev) => ({
				...prev,
				sections: prev.sections.map((s) =>
					s.id === sectionId
						? {
								...s,
								pages: s.pages.map((p) =>
									p.id === pageId
										? {
												...p,
												blocks: p.blocks.map((b, i) =>
													i === blockIndex ? block : b,
												),
											}
										: p,
								),
							}
						: s,
				),
			}));
		},
		[],
	);

	const deleteBlock = useCallback((sectionId: string, pageId: string, blockIndex: number) => {
		setConfig((prev) => ({
			...prev,
			sections: prev.sections.map((s) =>
				s.id === sectionId
					? {
							...s,
							pages: s.pages.map((p) =>
								p.id === pageId
									? { ...p, blocks: p.blocks.filter((_, i) => i !== blockIndex) }
									: p,
							),
						}
					: s,
			),
		}));
	}, []);

	const reorderBlocks = useCallback(
		(sectionId: string, pageId: string, fromIndex: number, toIndex: number) => {
			setConfig((prev) => ({
				...prev,
				sections: prev.sections.map((s) => {
					if (s.id !== sectionId) return s;
					return {
						...s,
						pages: s.pages.map((p) => {
							if (p.id !== pageId) return p;
							const blocks = [...p.blocks];
							const [moved] = blocks.splice(fromIndex, 1);
							blocks.splice(toIndex, 0, moved);
							return { ...p, blocks };
						}),
					};
				}),
			}));
		},
		[],
	);

	// Update guide metadata
	const updateGuideInfo = useCallback(
		(updates: Partial<Pick<GuideConfig, "title" | "description">>) => {
			setConfig((prev) => ({ ...prev, ...updates }));
		},
		[],
	);

	return {
		config,
		setConfig,
		addSection,
		updateSection,
		deleteSection,
		reorderSections,
		addPage,
		updatePage,
		deletePage,
		reorderPages,
		addBlock,
		updateBlock,
		deleteBlock,
		reorderBlocks,
		updateGuideInfo,
	};
}

export type GuideConfigActions = ReturnType<typeof useGuideConfig>;
