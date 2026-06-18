import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { Modal } from "~/components/atoms/Modal";
import { Loader2 } from "lucide-react";
import type { Job } from "~/zod/job.zod";

interface JobViewModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	job: Job | null;
	isLoading: boolean;
	onEdit?: () => void;
}

export function JobViewModal({ open, onOpenChange, job, isLoading, onEdit }: JobViewModalProps) {
	if (!job && !isLoading) {
		return (
			<Modal
				open={open}
				onOpenChange={onOpenChange}
				title="Job Details"
				description="View job posting information">
				<div className="py-8 text-center text-gray-500">Job not found</div>
			</Modal>
		);
	}

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title="Job Details"
			description="View job posting information">
			{isLoading ? (
				<div className="flex items-center justify-center py-12">
					<Loader2 className="h-8 w-8 animate-spin text-primary" />
				</div>
			) : job ? (
				<div className="space-y-6">
					{/* Job Information */}
					<div className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="text-sm font-medium text-gray-700">
									Position
								</label>
								<p className="mt-1 text-sm text-gray-900">
									{job.position?.title || "N/A"}
								</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-700">Level</label>
								<div className="mt-1">
									<Badge variant="outline">{job.level?.name || "N/A"}</Badge>
								</div>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-700">Type</label>
								<p className="mt-1 text-sm text-gray-900">{job.type || "N/A"}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-700">
									Location
								</label>
								<p className="mt-1 text-sm text-gray-900">
									{job.location || "N/A"}
								</p>
							</div>
						</div>

						{job.description && (
							<div>
								<label className="text-sm font-medium text-gray-700">
									Description
								</label>
								<p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
									{job.description}
								</p>
							</div>
						)}

						{job.position?.description && (
							<div>
								<label className="text-sm font-medium text-gray-700">
									Position Description
								</label>
								<p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
									{job.position.description}
								</p>
							</div>
						)}

						{job.position?.maxSalary && (
							<div>
								<label className="text-sm font-medium text-gray-700">
									Max Salary
								</label>
								<p className="mt-1 text-sm text-gray-900">
									${job.position.maxSalary.toLocaleString()}
								</p>
							</div>
						)}

						{/* Tags */}
						{job.tags && job.tags.length > 0 && (
							<div>
								<label className="text-sm font-medium text-gray-700">Tags</label>
								<div className="mt-2 flex flex-wrap gap-2">
									{job.tags.map((tag, index) => (
										<Badge key={index} variant="default">
											{tag}
										</Badge>
									))}
								</div>
							</div>
						)}

						{/* Metadata */}
						<div className="grid grid-cols-2 gap-4 pt-4 border-t">
							<div>
								<label className="text-sm font-medium text-gray-700">
									Created At
								</label>
								<p className="mt-1 text-sm text-gray-900">
									{new Date(job.createdAt).toLocaleString()}
								</p>
							</div>
							{job.updatedAt && (
								<div>
									<label className="text-sm font-medium text-gray-700">
										Updated At
									</label>
									<p className="mt-1 text-sm text-gray-900">
										{new Date(job.updatedAt).toLocaleString()}
									</p>
								</div>
							)}
						</div>
					</div>

					{/* Actions */}
					{onEdit && (
						<div className="flex justify-end gap-3 pt-4 border-t">
							<Button variant="outline" onClick={() => onOpenChange(false)}>
								Close
							</Button>
							<Button onClick={onEdit}>Edit Job</Button>
						</div>
					)}
				</div>
			) : (
				<div className="py-8 text-center text-gray-500">Job not found</div>
			)}
		</Modal>
	);
}
