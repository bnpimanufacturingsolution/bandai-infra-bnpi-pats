import { useState, useEffect, useMemo } from "react";
import type { Section, Page, Block } from "~/zod/guide.zod";
import { type TocItem } from "../organisms/guide/table-of-contents";
import { GuideHeader } from "../organisms/guide/guide-header";
import { GuideSidebar } from "../organisms/guide/guide-sidebar";
import { GuideContent } from "../organisms/guide/guide-content";
import { TableOfContents } from "../organisms/guide/table-of-contents";

interface GuideLayoutProps {
	title: string;
	sections: Section[];
	currentPage: Page;
	onPageChange: (page: Page) => void;
}

export function GuideLayout({ title, sections, currentPage, onPageChange }: GuideLayoutProps) {
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [activeHeading, setActiveHeading] = useState<string>("");

	const tocItems = useMemo<TocItem[]>(() => {
		return currentPage.blocks
			.filter((block): block is Block & { id: string } => block.type === "heading" && !!block.id)
			.map((block) => ({
				id: block.id,
				text: block.content,
				level: (block.metadata?.level as number) || 2,
			}));
	}, [currentPage]);

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						setActiveHeading(entry.target.id);
					}
				});
			},
			{ rootMargin: "-100px 0px -80% 0px" },
		);

		tocItems.forEach((item) => {
			const element = document.getElementById(item.id);
			if (element) observer.observe(element);
		});

		return () => observer.disconnect();
	}, [tocItems]);

	useEffect(() => {
		setSidebarOpen(false);
	}, [currentPage.id]);

	return (
		<div className="min-h-screen bg-background">
			<GuideHeader
				title={title}
				onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
				isSidebarOpen={sidebarOpen}
			/>

			<div className="flex">
				<GuideSidebar
					sections={sections}
					activePageId={currentPage.id}
					onPageSelect={onPageChange}
					isOpen={sidebarOpen}
					onClose={() => setSidebarOpen(false)}
				/>

				<main className="flex-1 min-w-0">
					<div className="flex justify-center px-4 md:px-8 py-8">
						<div className="w-full max-w-[720px]">
							<GuideContent page={currentPage} />
						</div>

						<div className="hidden xl:block ml-8">
							<TableOfContents items={tocItems} activeId={activeHeading} />
						</div>
					</div>
				</main>
			</div>
		</div>
	);
}
