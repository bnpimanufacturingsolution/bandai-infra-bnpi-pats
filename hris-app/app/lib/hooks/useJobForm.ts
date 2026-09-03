import { useState, useCallback } from "react";
import { toast } from "sonner";
import type { CreateJob, Job } from "~/zod/job.zod";
import { useCreateJob, useUpdateJob } from "~/lib/hooks/use-job";

interface UseJobFormProps {
	onSuccess?: () => void;
}

interface JobFormData {
	headcountRequested: number;
	departmentId?: string | null;
	sectionId?: string | null;
	positionId: string;
	levelId?: string | null;
	tags: string[];
	type: string | null | undefined;
	location: string | null | undefined;
	description: string | null | undefined;
	isDeleted: boolean;
}

export function useJobForm({ onSuccess }: UseJobFormProps) {
	const [jobData, setJobData] = useState<JobFormData>({
		headcountRequested: 1,
		departmentId: null,
		sectionId: null,
		positionId: "",
		levelId: null,
		tags: [],
		type: null,
		location: null,
		description: null,
		isDeleted: false,
	});

	const [editingJob, setEditingJob] = useState<Job | null>(null);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [isSaving, setIsSaving] = useState(false);

	const createMutation = useCreateJob();
	const updateMutation = useUpdateJob();

	// Reset form
	const resetForm = useCallback(() => {
		setJobData({
			headcountRequested: 1,
			departmentId: null,
			sectionId: null,
			positionId: "",
			levelId: null,
			tags: [],
			type: null,
			location: null,
			description: null,
			isDeleted: false,
		});
		setEditingJob(null);
		setErrors({});
		setIsSaving(false);
	}, []);

	// Load job for editing
	const loadJob = useCallback((job: Job) => {
		setEditingJob(job);
		setJobData({
			headcountRequested: job.headcountRequested || 1,
			departmentId: job.departmentId || job.position?.section?.departmentId || null,
			sectionId: job.sectionId || job.section?.id || job.position?.sectionId || null,
			positionId: job.positionId || job.position?.id || "",
			levelId: job.levelId || job.level?.id || null,
			tags: job.tags || [],
			type: job.type,
			location: job.location,
			description: job.description,
			isDeleted: job.isDeleted || false,
		});
		setErrors({});
	}, []);

	// Handle job data change
	const handleJobChange = useCallback(
		(field: string, value: any) => {
			setJobData((prev) => ({
				...prev,
				[field]: value,
			}));

			// Clear error for this field
			if (errors[field]) {
				setErrors((prev) => {
					const newErrors = { ...prev };
					delete newErrors[field];
					return newErrors;
				});
			}
		},
		[errors],
	);

	// Add tag
	const handleAddTag = useCallback((tag: string) => {
		setJobData((prev) => ({
			...prev,
			tags: [...prev.tags, tag],
		}));
	}, []);

	// Remove tag
	const handleRemoveTag = useCallback((index: number) => {
		setJobData((prev) => ({
			...prev,
			tags: prev.tags.filter((_, i) => i !== index),
		}));
	}, []);

	// Validate form
	const validateForm = useCallback((): boolean => {
		const newErrors: Record<string, string> = {};

		if (!jobData.positionId?.trim()) {
			newErrors.positionId = "Position is required";
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	}, [jobData]);

	// Save job (create or update)
	const handleSave = useCallback(async () => {
		if (!validateForm()) {
			toast.error("Please fill in all required fields");
			return;
		}

		setIsSaving(true);

		try {
			const payload: CreateJob = {
				headcountRequested: jobData.headcountRequested || 1,
				departmentId: jobData.departmentId || null,
				sectionId: jobData.sectionId || null,
				positionId: jobData.positionId,
				levelId: jobData.levelId || null,
				tags: jobData.tags,
				type: jobData.type,
				location: jobData.location,
				description: jobData.description,
				isDeleted: jobData.isDeleted,
			};

			if (editingJob) {
				await updateMutation.mutateAsync({
					id: editingJob.id,
					data: payload,
				});
				toast.success("Job updated successfully");
			} else {
				await createMutation.mutateAsync(payload);
				toast.success("Job created successfully");
			}

			resetForm();
			onSuccess?.();
		} catch (error: any) {
			console.error("Error saving job:", error);
			toast.error(error?.message || "Failed to save job");
		} finally {
			setIsSaving(false);
		}
	}, [jobData, editingJob, validateForm, createMutation, updateMutation, resetForm, onSuccess]);

	return {
		jobData,
		editingJob,
		errors,
		isSaving,
		resetForm,
		loadJob,
		handleJobChange,
		handleAddTag,
		handleRemoveTag,
		handleSave,
	};
}
