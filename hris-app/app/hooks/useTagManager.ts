import { useState } from "react";
import type { Tag } from "~/zod/job.zod";
import { DEFAULT_TAG_VARIANT } from "../lib/job-form-dialog/constants";

export function useTagManager(initialTags: Tag[] = []) {
	const [tags, setTags] = useState<Tag[]>(initialTags);
	const [newTagLabel, setNewTagLabel] = useState("");
	const [newTagVariant, setNewTagVariant] = useState(DEFAULT_TAG_VARIANT);

	const addTag = () => {
		const trimmedLabel = newTagLabel.trim();
		if (!trimmedLabel) return;

		setTags((prev) => [...prev, trimmedLabel]);
		setNewTagLabel("");
		setNewTagVariant(DEFAULT_TAG_VARIANT);
	};

	const removeTag = (index: number) => {
		setTags((prev) => prev.filter((_, i) => i !== index));
	};

	const resetTags = (newTags: Tag[] = []) => {
		setTags(newTags);
		setNewTagLabel("");
		setNewTagVariant(DEFAULT_TAG_VARIANT);
	};

	return {
		tags,
		newTagLabel,
		newTagVariant,
		setNewTagLabel,
		setNewTagVariant,
		addTag,
		removeTag,
		resetTags,
	};
}
