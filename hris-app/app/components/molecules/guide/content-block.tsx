import { type Block as BlockType } from "~/zod/guide.zod";
import { Text } from "~/components/atoms";
import { Heading } from "~/components/atoms/heading";
import { CalloutBox } from "./callout-box";
import { CodeBlock } from "./code-block";

interface ContentBlockProps {
	block: BlockType;
}

export function ContentBlock({ block }: ContentBlockProps) {
	switch (block.type) {
		case "heading":
			return (
				<Heading
					level={(block.metadata?.level as any) || 2}
					id={block.id}
					className="scroll-mt-20">
					{block.content}
				</Heading>
			);

		case "text":
			return (
				<div
					className="mb-4 guide-prose text-muted-foreground leading-relaxed"
					dangerouslySetInnerHTML={{ __html: formatText(block.content) }}
				/>
			);

		case "code":
			return (
				<CodeBlock
					language={(block.metadata?.language as string) || "typescript"}
					content={block.content}
					filename={block.metadata?.fileName as string}
				/>
			);

		case "list":
			return (
				<ul className="list-disc list-inside mb-4 space-y-2 text-muted-foreground">
					{block.content.split("\n").map((item, i) => (
						<li key={i}>{item as string}</li>
					))}
				</ul>
			);

		case "quote":
			return (
				<blockquote className="border-l-4 border-primary pl-4 py-2 mb-4 italic bg-muted/30 rounded-r-md">
					<p className="text-foreground">{block.content as string}</p>
					{!!block.metadata?.author && (
						<footer className="text-sm text-muted-foreground mt-2">
							— {block.metadata.author as string}
						</footer>
					)}
				</blockquote>
			);

		case "image":
			return (
				<figure className="mb-6">
					<img
						src={block.content}
						alt={(block.metadata?.alt as string) || ""}
						className="rounded-lg border border-border w-full h-auto"
					/>
					{!!block.metadata?.caption && (
						<figcaption className="text-center text-sm text-muted-foreground mt-2">
							{block.metadata.caption as string}
						</figcaption>
					)}
				</figure>
			);

		default:
			return null;
	}
}

// Simple text formatter for inline code and links
function formatText(text: string): string {
	// Convert inline code
	let formatted = text.replace(
		/`([^`]+)`/g,
		'<code class="px-1.5 py-0.5 rounded text-sm font-mono bg-muted text-foreground">$1</code>',
	);

	// Convert links
	formatted = formatted.replace(
		/\[([^\]]+)\]\(([^)]+)\)/g,
		'<a href="$2" class="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors">$1</a>',
	);

	return formatted;
}
