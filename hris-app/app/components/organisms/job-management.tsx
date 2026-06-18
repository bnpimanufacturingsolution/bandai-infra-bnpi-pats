import { useState } from "react";
import { DataTable } from "~/components/atoms/DataTable";
import { Modal } from "~/components/atoms/Modal";
import { useJobManagementData, useJobManagementActions } from "~/lib/hooks/use-job";
import JobFormDialog from "./job-form-dialog";
import type { CreateJobRequest } from "~/services/job.service";
import type { Job } from "~/zod/job.zod";
import {
	createJobTableColumns,
	getLevelNameById,
	getPositionTitleById,
} from "~/lib/utils/job-helper";
import { JobActionsMenu } from "../molecules/job-management/job-actions-menu";
import { JobDetailsContent } from "./job-details-content";

const JobManagementPage = () => {
	const [isFormOpen, setIsFormOpen] = useState(false);
	const [isViewOpen, setIsViewOpen] = useState(false);
	const [editingJob, setEditingJob] = useState<Job | null>(null);
	const [viewingJob, setViewingJob] = useState<Job | null>(null);

	const { jobs, positions, levels, isLoadingJobs } = useJobManagementData();
	const {
		handleSubmit: submitJob,
		handleDelete: deleteJob,
		isLoading: isSaving,
	} = useJobManagementActions();

	const getPositionTitle = (positionId: string) => getPositionTitleById(positions, positionId);
	const getLevelName = (levelId: string) => getLevelNameById(levels, levelId);

	const handleFormSubmit = (data: CreateJobRequest) => {
		submitJob(data, editingJob, () => {
			setIsFormOpen(false);
			setEditingJob(null);
		});
	};

	const handleEdit = (job: Job) => {
		setEditingJob(job);
		setIsFormOpen(true);
	};

	const handleDelete = (id: string) => {
		deleteJob(id);
	};

	const handleView = (job: Job) => {
		setViewingJob(job);
		setIsViewOpen(true);
	};

	const handleCloseView = () => {
		setIsViewOpen(false);
	};

	const handleOpenForm = () => {
		setEditingJob(null);
		setIsFormOpen(true);
	};

	const handleCloseForm = (open: boolean) => {
		setIsFormOpen(open);
		if (!open) {
			setEditingJob(null);
		}
	};

	const columns = createJobTableColumns(getPositionTitle, getLevelName);

	const renderActions = (job: Job) => (
		<JobActionsMenu job={job} onView={handleView} onEdit={handleEdit} onDelete={handleDelete} />
	);

	const activeJobs = jobs.filter((j) => !j.isDeleted);

	const formInitialData = editingJob
		? {
				id: editingJob.id,
				headcountRequested: editingJob.headcountRequested || 1,
				departmentId: editingJob.departmentId || editingJob.position?.section?.departmentId || null,
				sectionId: editingJob.sectionId || editingJob.section?.id || editingJob.position?.sectionId || null,
				positionId: editingJob.position?.id || editingJob.positionId || "",
				levelId: editingJob.level?.id || editingJob.levelId || null,
				type: editingJob.type || null,
				location: editingJob.location || null,
				description: editingJob.description || null,
				tags: editingJob.tags || [],
			}
		: undefined;

	return (
		<div className="space-y-6">
			<DataTable
				title="Job Openings"
				description="Manage job openings and recruitment positions"
				data={activeJobs}
				columns={columns}
				searchFields={["positionId", "type", "location"]}
				renderActions={renderActions}
				isLoading={isLoadingJobs}
				emptyMessage="No job openings created yet"
				emptyDescription="Get started by creating your first job opening."
				itemsPerPage={10}
				className="w-full"
				onAdd={handleOpenForm}
				addButtonLabel="Create Job Opening"
			/>

			<JobFormDialog
				open={isFormOpen}
				onOpenChange={handleCloseForm}
				onSubmit={handleFormSubmit}
				positions={positions}
				levels={levels}
				initialData={formInitialData}
				isLoading={isSaving}
			/>

			<Modal
				open={isViewOpen}
				onOpenChange={setIsViewOpen}
				title="Job Opening Details"
				description="View detailed information about this job opening">
				{viewingJob && (
					<JobDetailsContent
						job={viewingJob}
						positionTitle={
							viewingJob.position?.title ||
							getPositionTitle(viewingJob.positionId || "")
						}
						levelName={viewingJob.level?.name || getLevelName(viewingJob.levelId || "")}
						onClose={handleCloseView}
						onEdit={handleEdit}
					/>
				)}
			</Modal>
		</div>
	);
};

export default JobManagementPage;
