import { cn } from "@/lib/utils";
import { Check, Copy, File } from "lucide-react";
import { useState } from "react";
import { Icon } from "../../atoms/Icon";

interface CodeBlockProps {
	language: string;
	content: string;
	filename?: string;
}

export function CodeBlock({ language, content, filename }: CodeBlockProps) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(content);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="my-6 rounded-lg overflow-hidden border border-border bg-code-bg animate-fade-in">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-2 bg-code-bg border-b border-border/50">
				<div className="flex items-center gap-2 text-code-text/70">
					{filename && (
						<>
							<Icon icon={File} size="sm" />
							<span className="text-xs font-mono">{filename}</span>
							<span className="text-xs">•</span>
						</>
					)}
					<span className="text-xs uppercase tracking-wider">{language}</span>
				</div>
				<button
					onClick={handleCopy}
					className={cn(
						"flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-all duration-200",
						"hover:bg-code-text/10 text-code-text/70 hover:text-code-text",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					)}
					aria-label={copied ? "Copied" : "Copy code"}>
					<Icon icon={copied ? Check : Copy} size="sm" />
					<span>{copied ? "Copied!" : "Copy"}</span>
				</button>
			</div>

			{/* Code content */}
			<div className="overflow-x-auto guide-scrollbar">
				<pre className="p-4 text-sm leading-relaxed">
					<code className="font-mono text-code-text">{content}</code>
				</pre>
			</div>
		</div>
	);
}
