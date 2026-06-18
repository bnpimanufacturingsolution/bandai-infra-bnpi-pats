import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { Badge } from "~/components/atoms/Badge";
import { Loader2, X, Plus } from "lucide-react";
import { useState } from "react";
import { usePositions } from "~/lib/hooks/usePositions";
import { useLevels } from "~/lib/hooks/useLevels";

interface JobFormModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	jobData: {
		positionId: string;
		sectionId?: string | null;
		levelId?: string | null;
		tags: string[];
		type: string | null | undefined;
		location: string | null | undefined;
		description: string | null | undefined;
		isDeleted: boolean;
	};
	errors: Record<string, string>;
	isSaving: boolean;
	isEditing: boolean;
	onJobChange: (field: string, value: any) => void;
	onAddTag: (tag: string) => void;
	onRemoveTag: (index: number) => void;
	onSave: () => void;
	onCancel: () => void;
}

const JOB_TYPE_OPTIONS: SelectOption[] = [
	{ value: "FULL_TIME", label: "Full Time" },
	{ value: "PART_TIME", label: "Part Time" },
	{ value: "CONTRACT", label: "Contract" },
	{ value: "INTERNSHIP", label: "Internship" },
	{ value: "TEMPORARY", label: "Temporary" },
	{ value: "REMOTE", label: "Remote" },
];

export function JobFormModal({
	open,
	onOpenChange,
	jobData,
	errors,
	isSaving,
	isEditing,
	onJobChange,
	onAddTag,
	onRemoveTag,
	onSave,
	onCancel,
}: JobFormModalProps) {
	const [newTag, setNewTag] = useState("");

	// Fetch positions and levels for dropdowns
	const { data: positionsData, isLoading: isLoadingPositions } = usePositions();
	const { data: levelsData, isLoading: isLoadingLevels } = useLevels();

	const positions = positionsData?.positions || [];
	const levels = (levelsData as any)?.levels || (levelsData as any)?.data?.levels || [];
	const selectedPosition = positions.find((pos: any) => pos.id === jobData.positionId);
	const selectedPositionLevelIds = new Set(
		Array.isArray(selectedPosition?.levels)
			? selectedPosition.levels
					.map((entry: any) =>
						String(entry?.level?.id || entry?.levelId || entry?.id || ""),
					)
					.filter(Boolean)
			: [],
	);
	const availableLevels = selectedPositionLevelIds.size
		? levels.filter((level: any) => selectedPositionLevelIds.has(String(level.id)))
		: [];

	const positionOptions: SelectOption[] = positions.map((pos: any) => ({
		value: pos.id,
		label: pos.title,
	}));

	const levelOptions: SelectOption[] = availableLevels.map((level: any) => ({
		value: level.id,
		label: level.name,
	}));

	const handleAddTag = () => {
		if (newTag.trim()) {
			onAddTag(newTag);
			setNewTag("");
		}
	};

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title={isEditing ? "Edit Job" : "Create New Job"}
			description={
				isEditing
					? "Update job posting information"
					: "Create a new job posting for the selected position"
			}>
			<div className="space-y-6">
				{/* Position Selection */}
				<div>
					<label className="block text-sm font-medium text-gray-700 mb-1">
						Position <span className="text-red-500">*</span>
					</label>
					<Select
						options={positionOptions}
						value={jobData.positionId}
						onChange={(value) => {
							const nextPosition = positions.find((pos: any) => pos.id === value);
							onJobChange("positionId", value);
							onJobChange(
								"sectionId",
								nextPosition?.section?.id || nextPosition?.sectionId || null,
							);
							onJobChange("levelId", null);
						}}
						placeholder="Select position"
						disabled={isLoadingPositions}
					/>
					{errors.positionId && (
						<p className="mt-1 text-sm text-red-600">{errors.positionId}</p>
					)}
				</div>

				{availableLevels.length ? (
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Level
						</label>
						<Select
							options={levelOptions}
							value={jobData.levelId || ""}
							onChange={(value) => onJobChange("levelId", value || null)}
							placeholder={jobData.positionId ? "Select level" : "Select position first"}
							disabled={isLoadingLevels || !jobData.positionId}
						/>
						{errors.levelId && (
							<p className="mt-1 text-sm text-red-600">{errors.levelId}</p>
						)}
					</div>
				) : null}

				{/* Type Selection */}
				<div>
					<label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
					<Select
						options={JOB_TYPE_OPTIONS}
						value={jobData.type || ""}
						onChange={(value) => onJobChange("type", value || null)}
						placeholder="Select job type"
					/>
				</div>

				{/* Location */}
				<div>
					<label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
					<Input
						type="text"
						value={jobData.location || ""}
						onChange={(e) => onJobChange("location", e.target.value || null)}
						placeholder="e.g., New York, Remote, Hybrid"
					/>
				</div>

				{/* Description */}
				<div>
					<label className="block text-sm font-medium text-gray-700 mb-1">
						Description
					</label>
					<textarea
						value={jobData.description || ""}
						onChange={(e) => onJobChange("description", e.target.value || null)}
						placeholder="Enter job description..."
						rows={4}
						className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
					/>
				</div>

				{/* Tags Section */}
				<div>
					<label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>

					{/* Existing Tags */}
					{jobData.tags.length > 0 && (
						<div className="flex flex-wrap gap-2 mb-3">
							{jobData.tags.map((tag, index) => (
								<Badge
									key={index}
									variant="default"
									className="flex items-center gap-1">
									{tag}
								</Badge>
							))}
						</div>
					)}

					{/* Add New Tag */}
					<div className="flex gap-2">
						<Input
							type="text"
							value={newTag}
							onChange={(e) => setNewTag(e.target.value)}
							placeholder="Enter tag and press Add"
							className="flex-1"
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									handleAddTag();
								}
							}}
						/>
						<Button
							type="button"
							onClick={handleAddTag}
							variant="outline"
							size="sm"
							disabled={!newTag.trim()}>
							<Plus className="h-4 w-4 mr-1" />
							Add
						</Button>
					</div>
				</div>

				{/* Actions */}
				<div className="flex justify-end gap-3 pt-4 border-t">
					<Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
						Cancel
					</Button>
					<Button type="button" onClick={onSave} disabled={isSaving}>
						{isSaving ? (
							<>
								<Loader2 className="h-4 w-4 mr-2 animate-spin" />
								Saving...
							</>
						) : (
							<>{isEditing ? "Update Job" : "Create Job"}</>
						)}
					</Button>
				</div>
			</div>
		</Modal>
	);
}
