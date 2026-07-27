import { Input } from "~/components/atoms/Input";
import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { X, Plus } from "lucide-react";
import type { Tag } from "~/zod/job.zod";
import { TAG_VARIANTS } from "../../lib/job-form-dialog/constants";

interface TagInputProps {
	tags: Tag[];
	newTagLabel: string;
	newTagVariant: string;
	onNewTagLabelChange: (value: string) => void;
	onNewTagVariantChange: (value: string) => void;
	onAddTag: () => void;
	onRemoveTag: (index: number) => void;
}

export function TagInput({
	tags,
	newTagLabel,
	newTagVariant,
	onNewTagLabelChange,
	onNewTagVariantChange,
	onAddTag,
	onRemoveTag,
}: TagInputProps) {
	const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			onAddTag();
		}
	};

	return (
		<div className="space-y-3">
			{/* Display existing tags */}
			{tags.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{tags.map((tag, index) => (
						<TagBadge key={index} tag={tag} onRemove={() => onRemoveTag(index)} />
					))}
				</div>
			)}

			{/* Add new tag */}
			<div className="flex gap-2">
				<Input
					value={newTagLabel}
					onChange={(e) => onNewTagLabelChange(e.target.value)}
					placeholder="Tag label"
					onKeyPress={handleKeyPress}
				/>
				<Select
					options={TAG_VARIANTS}
					value={newTagVariant}
					onChange={onNewTagVariantChange}
					placeholder="Color"
					className="w-32 flex-1"
				/>
				<Button type="button" onClick={onAddTag} variant="outline" size="sm">
					<Plus className="w-4 h-4" />
				</Button>
			</div>
		</div>
	);
}

interface TagBadgeProps {
	tag: Tag;
	onRemove: () => void;
}

function TagBadge({ tag, onRemove }: TagBadgeProps) {
	return (
		<Badge variant="secondary" className="flex items-center gap-1">
			{tag}
			<button
				type="button"
				onClick={onRemove}
				className="ml-1 hover:bg-black/10 rounded-full p-0.5">
				<X className="w-3 h-3" />
			</button>
		</Badge>
	);
}
