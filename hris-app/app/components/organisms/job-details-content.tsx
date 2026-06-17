import type { Job } from "~/zod/job.zod";
import { FieldGroup } from "../molecules/job-management/field-group";
import { FieldLabel } from "../atoms/jobs";
import { JobTagsList } from "../molecules/job-management/job-tag-list";
import { formatDateTime } from "~/lib/utils/text-utils";
import { Button } from "../atoms";
import { Edit } from "lucide-react";

interface JobDetailsContentProps {
	job: Job;
	positionTitle: string;
	levelName: string;
	onClose: () => void;
	onEdit: (job: Job) => void;
}

export const JobDetailsContent = ({
	job,
	positionTitle,
	levelName,
	onClose,
	onEdit,
}: JobDetailsContentProps) => {
	const emptyValue = <span className="text-gray-400 italic">Not specified</span>;

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-2 gap-4">
				<FieldGroup
					label="Position"
					value={positionTitle}
					valueClassName="text-base text-gray-900 font-medium"
				/>
				<FieldGroup
					label="Level"
					value={levelName}
					valueClassName="text-base text-gray-900 font-medium"
				/>
			</div>

			<div className="grid grid-cols-2 gap-4">
				<FieldGroup label="Type" value={job.type || emptyValue} />
				<FieldGroup label="Location" value={job.location || emptyValue} />
			</div>

			{job.description && (
				<div>
					<FieldLabel>Description</FieldLabel>
					<p className="text-base text-gray-700 mt-1 whitespace-pre-wrap">
						{job.description}
					</p>
				</div>
			)}

			{job.tags && job.tags.length > 0 && (
				<div>
					<label className="text-sm font-medium text-gray-500 mb-2 block">Tags</label>
					<JobTagsList tags={job.tags} maxVisible={100} />
				</div>
			)}

			<div className="grid grid-cols-2 gap-4 pt-4 border-t">
				<FieldGroup
					label="Created"
					value={formatDateTime(job.createdAt)}
					valueClassName="text-sm text-gray-700"
				/>
				<FieldGroup
					label="Updated"
					value={formatDateTime(job.updatedAt)}
					valueClassName="text-sm text-gray-700"
				/>
			</div>

			<div className="flex justify-end gap-2 pt-4">
				<Button variant="outline" onClick={onClose}>
					Close
				</Button>
				<Button
					onClick={() => {
						onClose();
						onEdit(job);
					}}>
					<Edit className="w-4 h-4 mr-2" />
					Edit
				</Button>
			</div>
		</div>
	);
};
