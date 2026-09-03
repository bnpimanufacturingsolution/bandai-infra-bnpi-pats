import { Badge } from "../atoms";

interface JobTagsProps {
	tags: Array<
		| string
		| {
				label: string;
				variant?:
					| "default"
					| "secondary"
					| "outline"
					| "accent"
					| "destructive"
					| "success"
					| "warning"
					| "info";
		  }
	>;
}

const formatTagLabel = (tag: JobTagsProps["tags"][number]) => {
	const value = typeof tag === "string" ? tag : tag.label;
	return String(value || "")
		.trim()
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/[_-]/g, " ")
		.replace(/\s+/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
};

export function JobTags({ tags }: JobTagsProps) {
	return (
		<div className="flex flex-wrap gap-2">
			{tags.map((tag, index) => {
				const label = formatTagLabel(tag);
				if (!label) return null;

				return (
					<Badge
						key={`${label}-${index}`}
						variant={
							typeof tag === "string" ? "outline" : (tag.variant as any) || "outline"
						}
						className="rounded-full border-[var(--theme-red)] bg-[var(--theme-red)] px-2.5 py-1 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#a60009]">
						{label}
					</Badge>
				);
			})}
		</div>
	);
}
