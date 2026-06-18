import { Badge } from "~/components/atoms";

interface JobTagsListProps {
	tags: Array<{ label: string; variant: string }>;
	maxVisible?: number;
}

export const JobTagsList = ({ tags, maxVisible = 3 }: JobTagsListProps) => {
	if (!tags || tags.length === 0) {
		return <span className="text-gray-400">-</span>;
	}

	const getVariant = (variant: string) => {
		switch (variant) {
			case "blue":
				return "default";
			case "green":
				return "secondary";
			default:
				return "outline";
		}
	};

	return (
		<div className="flex flex-wrap gap-1">
			{tags.slice(0, maxVisible).map((tag, index) => (
				<Badge key={index} variant={getVariant(tag.variant)} className="text-xs">
					{tag.label}
				</Badge>
			))}
			{tags.length > maxVisible && (
				<Badge variant="outline" className="text-xs">
					+{tags.length - maxVisible}
				</Badge>
			)}
		</div>
	);
};
