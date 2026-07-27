import { Badge } from "~/components/atoms";

interface JobTagsListProps {
	tags: string[];
	maxVisible?: number;
}

export const JobTagsList = ({ tags, maxVisible = 3 }: JobTagsListProps) => {
	if (!tags || tags.length === 0) {
		return <span className="text-gray-400">-</span>;
	}

	return (
		<div className="flex flex-wrap gap-1">
			{tags.slice(0, maxVisible).map((tag, index) => (
				<Badge key={index} variant="secondary" className="text-xs">
					{tag}
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
