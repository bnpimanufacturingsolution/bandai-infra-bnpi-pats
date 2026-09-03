import { useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { Modal } from "~/components/atoms/Modal";
import { Button } from "~/components/atoms/Button";
import { InputField, TextAreaField, SelectField } from "~/components/molecules/FormField";
import { TagInput } from "~/components/molecules/TagInput";
import type { CreateJobRequest } from "~/services/job.service";
import { useTagManager } from "../../hooks/useTagManager";
import { useLevelsByPosition } from "../../hooks/useLevelsByPosition";
import { JOB_TYPES, DEFAULT_JOB_TYPE } from "../../lib/job-form-dialog/constants";
import type { JobFormDialogProps, JobFormData } from "../../lib/job-form-dialog/types";
import {
	transformPositionsToOptions,
	transformLevelsToOptions,
	shouldDisableLevelSelect,
} from "../../lib/job-form-dialog/utils";

export default function JobFormDialog({
	open,
	onOpenChange,
	onSubmit,
	positions,
	levels,
	initialData,
	isLoading,
}: JobFormDialogProps) {
	const { register, handleSubmit, reset, watch, setValue } = useForm<JobFormData>({
		defaultValues: {
			headcountRequested: initialData?.headcountRequested || 1,
			positionId: initialData?.positionId || "",
			levelId: initialData?.levelId || null,
			type: initialData?.type || DEFAULT_JOB_TYPE,
			location: initialData?.location || "",
			description: initialData?.description || "",
		},
	});

	const positionId = watch("positionId");
	const levelId = watch("levelId");
	const jobType = watch("type");

	const { selectedPosition, availableLevels } = useLevelsByPosition(positionId, positions);

	const {
		tags,
		newTagLabel,
		newTagVariant,
		setNewTagLabel,
		setNewTagVariant,
		addTag,
		removeTag,
		resetTags,
	} = useTagManager(initialData?.tags);

	// Reset level selection if current level is not available for selected position
	useEffect(() => {
		if (levelId && !availableLevels.find((l) => l.id === levelId)) {
			setValue("levelId", null);
		}
	}, [levelId, availableLevels, setValue]);

	// Reset form when dialog opens/closes
	// FIX: Use separate useEffect for form reset and tag reset
	useEffect(() => {
		if (open) {
			if (initialData) {
				reset({
					headcountRequested: initialData.headcountRequested || 1,
					positionId: initialData.positionId,
					levelId: initialData.levelId || null,
					type: initialData.type || DEFAULT_JOB_TYPE,
					location: initialData.location || "",
					description: initialData.description || "",
				});
			} else {
				reset({
					headcountRequested: 1,
					positionId: "",
					levelId: null,
					type: DEFAULT_JOB_TYPE,
					location: "",
					description: "",
				});
			}
		}
	}, [open, initialData, reset]);

	// Separate useEffect for tags that only runs when dialog opens
	useEffect(() => {
		if (open) {
			resetTags(initialData?.tags || []);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, initialData?.tags]);

	const handleFormSubmit = (data: JobFormData) => {
		const jobData: CreateJobRequest = {
			headcountRequested: data.headcountRequested || 1,
			positionId: data.positionId,
			levelId: availableLevels.length ? data.levelId || null : null,
			type: data.type || null,
			location: data.location || null,
			description: data.description || null,
			tags: tags,
		};

		onSubmit(jobData);
	};

	const positionOptions = transformPositionsToOptions(positions);
	const levelOptions = transformLevelsToOptions(availableLevels);
	const isLevelSelectDisabled = shouldDisableLevelSelect(positionId, availableLevels);

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title={initialData?.id ? "Edit Job Opening" : "Create Job Opening"}
			description={
				initialData?.id
					? "Update the job opening details"
					: "Create a new job opening for recruitment"
			}>
			<form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
				{/* Position Selection */}
				<SelectField
					label="Position"
					required
					options={positionOptions}
					value={positionId}
					onChange={(value) => {
						setValue("positionId", value);
						setValue("levelId", null);
					}}
					placeholder="Select a position"
					helpText={selectedPosition?.description}
				/>

				{availableLevels.length ? (
					<SelectField
						label="Level"
						options={levelOptions}
						value={levelId || ""}
						onChange={(value) => setValue("levelId", value || null)}
						placeholder="Select a level"
						disabled={isLevelSelectDisabled}
					/>
				) : null}

				{/* Job Type */}
				<SelectField
					label="Job Type"
					options={JOB_TYPES}
					value={jobType ?? ""}
					onChange={(value) => setValue("type", value)}
					placeholder="Select job type"
				/>

				{/* Location */}
				<InputField
					label="Location"
					name="location"
					register={register}
					placeholder="e.g., San Francisco, CA or Remote"
				/>

				{/* Description */}
				<TextAreaField
					label="Description"
					name="description"
					register={register}
					placeholder="Enter job description or additional details"
				/>

				{/* Tags */}
				<div>
					<label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
					<TagInput
						tags={tags}
						newTagLabel={newTagLabel}
						newTagVariant={newTagVariant}
						onNewTagLabelChange={setNewTagLabel}
						onNewTagVariantChange={setNewTagVariant}
						onAddTag={addTag}
						onRemoveTag={removeTag}
					/>
				</div>

				{/* Form Actions */}
				<div className="flex justify-end gap-3 pt-4 border-t">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isLoading}>
						Cancel
					</Button>
					<Button type="submit" disabled={isLoading}>
						{isLoading ? "Saving..." : initialData?.id ? "Update Job" : "Create Job"}
					</Button>
				</div>
			</form>
		</Modal>
	);
}
