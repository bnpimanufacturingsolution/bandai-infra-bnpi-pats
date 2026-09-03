import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "../atoms";
import { JobTags } from "../molecules/job-tags";
import { type JobCardProps } from "./job-card";
import { useNavigate } from "react-router";
import { ArrowRight, BriefcaseBusiness, Clock, MapPin } from "lucide-react";

interface JobDetailsModalProps {
	job: JobCardProps & {
		postedDate?: Date;
		salaryMin?: number;
		salaryMax?: number;
	};
	isOpen: boolean;
	onClose: () => void;
}

const formatLabel = (value?: string | null) =>
	String(value || "")
		.trim()
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/[_-]/g, " ")
		.replace(/\s+/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());

export function JobDetailsModal({ job, isOpen, onClose }: JobDetailsModalProps) {
	const navigate = useNavigate();
	const jobType = formatLabel(job.jobType);
	const location = formatLabel(job.location);
	const description =
		String(job.description || "").trim() ||
		[
			`${job.title} role at ${job.company}.`,
			location ? `Location: ${location}.` : null,
			jobType ? `Employment type: ${jobType}.` : null,
			"Apply now to continue with the recruitment process.",
		]
			.filter(Boolean)
			.join("\n");

	const handleApply = () => {
		onClose();
		navigate(`/jobs/${job.id}/apply`);
	};

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}>
			<DialogContent className="w-[95vw] overflow-hidden rounded-lg border-[#e8dede] bg-white p-0 sm:max-w-4xl">
				<div className="grid max-h-[90vh] grid-cols-1 lg:grid-cols-[0.9fr_1.1fr]">
					<div className="flex max-h-[90vh] flex-col gap-6 overflow-y-auto bg-[#fbf8f5] p-6">
						<DialogHeader className="space-y-4 text-left">
							<div>
								<p className="mb-2 text-xs font-semibold uppercase text-neutral-500">
									Open role
								</p>
								<DialogTitle className="text-2xl font-bold tracking-tight text-neutral-900">
									{job.title}
								</DialogTitle>
								<div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-neutral-600">
									<span className="font-semibold text-neutral-900">
										{job.company}
									</span>
									<span aria-hidden className="text-neutral-300">
										•
									</span>
									<span>{job.time}</span>
								</div>
							</div>
						</DialogHeader>

						<div className="flex flex-wrap gap-2">
							{jobType && (
								<span
									className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold"
									style={{
										backgroundColor: "var(--theme-red)",
										borderColor: "var(--theme-red)",
										color: "#fff",
									}}>
									<BriefcaseBusiness className="h-3 w-3" />
									{jobType}
								</span>
							)}
							{location && (
								<Badge className="gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-neutral-700 ring-1 ring-[#e8dede]">
									<MapPin className="h-3 w-3" />
									{location}
								</Badge>
							)}
							{job.postedDate && (
								<Badge className="gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-neutral-700 ring-1 ring-[#e8dede]">
									<Clock className="h-3 w-3" />
									Posted {job.time}
								</Badge>
							)}
						</div>

						{job.tags && job.tags.length > 0 ? (
							<div>
								<h3 className="mb-3 text-sm font-semibold text-neutral-800">
									Focus areas
								</h3>
								<JobTags tags={job.tags} />
							</div>
						) : null}

						<Button
							size="lg"
							className="mt-auto rounded-md bg-[var(--theme-red)] font-semibold text-white hover:bg-[#a60009]"
							onClick={handleApply}>
							Apply now
							<ArrowRight className="ml-2 h-4 w-4" />
						</Button>
					</div>

					<div className="max-h-[90vh] overflow-y-auto p-6">
						<h3 className="mb-4 text-lg font-bold text-neutral-900">Role overview</h3>
						<DialogDescription className="whitespace-pre-line text-base leading-7 text-neutral-700">
							{description}
						</DialogDescription>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
