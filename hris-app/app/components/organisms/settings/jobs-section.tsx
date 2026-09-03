import { useState, useEffect } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { JobTable } from "~/components/organisms/job/JobTable";
import { JobFormModal } from "~/components/organisms/job/JobFormModal";
import { JobViewModal } from "~/components/organisms/job/JobViewModal";
import { useJobs, useJob, useDeleteJob } from "~/lib/hooks/use-job";
import { useJobForm } from "~/lib/hooks/useJobForm";
import { useAuth } from "~/lib/hooks/useAuth";
import type { Job } from "~/zod/job.zod";

export function JobsSection() {
	const [searchParams, setSearchParams] = useSearchParams();
	const [showFormModal, setShowFormModal] = useState(false);
	const [showViewModal, setShowViewModal] = useState(false);
	const [viewingJobId, setViewingJobId] = useState<string | null>(null);
	const [editingJobId, setEditingJobId] = useState<string | null>(null);

	// Hooks
	const { user } = useAuth();

	const { data: jobsData, isLoading } = useJobs();
	const { data: viewJobData, isLoading: isLoadingView } = useJob(
		viewingJobId || "",
		!!viewingJobId && showViewModal,
	);

	// Fetch job with full details for editing
	const { data: editJobData, isLoading: isLoadingEdit } = useJob(
		editingJobId || "",
		!!editingJobId,
	);

	const deleteMutation = useDeleteJob();

	const jobForm = useJobForm({
		onSuccess: () => {
			closeFormModal();
		},
	});

	const jobs = (jobsData as any)?.jobs || [];

	// Load job data when editJobData is available
	useEffect(() => {
		if (editJobData && editingJobId) {
			jobForm.loadJob(editJobData);
			setEditingJobId(null); // Clear after loading
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [editJobData]);

	// Handle URL parameters for deep linking
	useEffect(() => {
		const action = searchParams.get("action");
		const id = searchParams.get("id");

		if (action === "create" && !showFormModal) {
			setShowFormModal(true);
			jobForm.resetForm();
		} else if (action === "edit" && id && !showFormModal) {
			const job = jobs.find((j: any) => j.id === id);
			if (job) {
				setEditingJobId(job.id);
				setShowFormModal(true);
			}
		} else if (action === "view" && id && !showViewModal) {
			setViewingJobId(id);
			setShowViewModal(true);
		} else if (!action && (showFormModal || showViewModal)) {
			setShowFormModal(false);
			setShowViewModal(false);
			setViewingJobId(null);
			setEditingJobId(null);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [searchParams, jobs]);

	// Update URL function
	const updateURL = (action: string, id?: string) => {
		const params = new URLSearchParams(searchParams);
		params.set("action", action);
		if (id) {
			params.set("id", id);
		} else {
			params.delete("id");
		}
		setSearchParams(params);
	};

	// Close modals and clear URL
	const closeFormModal = () => {
		setShowFormModal(false);
		setEditingJobId(null);
		const params = new URLSearchParams(searchParams);
		params.delete("action");
		params.delete("id");
		setSearchParams(params);
	};

	const closeViewModal = () => {
		setShowViewModal(false);
		setViewingJobId(null);
		const params = new URLSearchParams(searchParams);
		params.delete("action");
		params.delete("id");
		setSearchParams(params);
	};

	// Handle create new job
	const handleCreateNew = () => {
		jobForm.resetForm();
		setShowFormModal(true);
		updateURL("create");
	};

	// Handle view job
	const handleView = (job: Job) => {
		setViewingJobId(job.id);
		setShowViewModal(true);
		updateURL("view", job.id);
	};

	// Handle edit job
	const handleEdit = (job: Job) => {
		setEditingJobId(job.id);
		setShowFormModal(true);
		updateURL("edit", job.id);
	};

	// Handle edit from view modal
	const handleEditFromView = async () => {
		if (viewJobData) {
			closeViewModal();

			jobForm.loadJob(viewJobData);
			setShowFormModal(true);
			updateURL("edit", viewJobData.id);
		}
	};

	// Handle delete job
	const handleDelete = async (job: Job) => {
		if (!confirm(`Are you sure you want to delete this job posting?`)) {
			return;
		}

		try {
			await deleteMutation.mutateAsync(job.id);
			toast.success("Job deleted successfully");
		} catch (error) {
			console.error("Error deleting job:", error);
			toast.error("Failed to delete job");
		}
	};

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-lg font-semibold mb-2">Jobs</h2>
			</div>

			{/* Jobs Table */}
			<JobTable
				jobs={jobs}
				isLoading={isLoading}
				onAdd={handleCreateNew}
				onView={handleView}
				onEdit={handleEdit}
				onDelete={handleDelete}
			/>

			{/* Form Modal */}
			<JobFormModal
				open={showFormModal}
				onOpenChange={(open) => {
					if (!open) closeFormModal();
				}}
				jobData={jobForm.jobData}
				errors={jobForm.errors}
				isSaving={jobForm.isSaving}
				isEditing={!!jobForm.editingJob}
				onJobChange={jobForm.handleJobChange}
				onAddTag={jobForm.handleAddTag}
				onRemoveTag={jobForm.handleRemoveTag}
				onSave={jobForm.handleSave}
				onCancel={closeFormModal}
			/>

			{/* View Modal */}
			<JobViewModal
				open={showViewModal}
				onOpenChange={(open) => {
					if (!open) closeViewModal();
				}}
				job={viewJobData || null}
				isLoading={isLoadingView}
				onEdit={handleEditFromView}
			/>
		</div>
	);
}
