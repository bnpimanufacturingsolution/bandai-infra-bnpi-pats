import { cn } from "@/lib/utils";
export interface TocItem {
	id: string;
	text: string;
	level: number;
}

interface TableOfContentsProps {
	items: TocItem[];
	activeId?: string;
}

export function TableOfContents({ items, activeId }: TableOfContentsProps) {
	if (items.length === 0) return null;

	return (
		<aside
			className="hidden xl:block sticky top-20 h-fit w-[220px] shrink-0"
			role="navigation"
			aria-label="Table of contents">
			<div className="pb-4">
				<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
					On this page
				</h3>
				<nav>
					<ul className="space-y-2">
						{items.map((item) => (
							<li key={item.id}>
								<a
									href={`#${item.id}`}
									className={cn(
										"block text-sm transition-colors duration-200",
										"hover:text-foreground",
										item.level === 3 && "pl-3",
										item.level === 4 && "pl-6",
										activeId === item.id
											? "text-primary font-medium"
											: "text-muted-foreground",
									)}>
									{item.text}
								</a>
							</li>
						))}
					</ul>
				</nav>
			</div>
		</aside>
	);
}
