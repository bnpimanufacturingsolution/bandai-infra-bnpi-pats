import { Text } from "~/components/atoms";
import { Heading } from "~/components/atoms/heading";
import { ContentBlock } from "~/components/molecules/guide/content-block";
import type { Page } from "~/zod/guide.zod";

interface GuideContentProps {
	page: Page;
}

export function GuideContent({ page }: GuideContentProps) {
	return (
		<article className="animate-fade-in" aria-labelledby="guide-title">
			{/* Page title */}
			<header className="mb-8 pb-6 border-b border-border">
				<Heading level={1} id="guide-title" className="mb-0 mt-0">
					{page.title}
				</Heading>
			</header>

			<div className="guide-prose">
				{page.blocks.map((block) => (
					<ContentBlock key={block.id} block={block} />
				))}
			</div>

			{/* Footer navigation hint */}
			<footer className="mt-12 pt-6 border-t border-border">
				<Text>Was this page helpful? Let us know how we can improve.</Text>
			</footer>
		</article>
	);
}
