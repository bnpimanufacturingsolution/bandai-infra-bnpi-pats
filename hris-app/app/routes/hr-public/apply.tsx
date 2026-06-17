import { AlertCircle, ArrowLeft } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { ApplicationForm } from "~/components/organisms/hr-public/application-form";
import { isPublicJobStillOpen } from "~/components/organisms/job-lists";
import { useJob } from "~/lib/hooks/use-job";
import type { Job } from "~/zod/job.zod";
import bandaiLogo from "~/assets/bandai_logo.png";

const formatJobType = (value?: string | null) => {
	if (!value) return null;

	return value
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/[_-]/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatPostedDate = (value?: string | Date) => {
	if (!value) return null;

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;

	return new Intl.DateTimeFormat("en-PH", {
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(date);
};

export default function ApplyPage() {
	const navigate = useNavigate();
	const { jobId = "" } = useParams();
	const { data, isLoading, error } = useJob(jobId, Boolean(jobId), {
		fields: "position,level,location,type,description,tags,createdAt,updatedAt,headcountRequested,applicants.id,applicants.currentWorkflowStateKey,applicants.convertedToEmployeeId,applicants.isDeleted",
		document: true,
		pagination: false,
	});

	const job = data as Job | undefined;
	const isJobAvailable = Boolean(job && isPublicJobStillOpen(job as any));
	const jobTitle = job?.position?.title || "Open Position";
	const postedDate = formatPostedDate(job?.createdAt);
	const jobType = formatJobType(job?.type);

	const handleBack = () => {
		if (window.history.length > 1) {
			navigate(-1);
			return;
		}

		navigate("/jobs");
	};

	return (
		<div className="min-h-screen bg-[#fbf8f5]">
			<div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
				<div className="mb-6 flex items-start justify-between gap-4 sm:items-center">
					<Button
						type="button"
						variant="ghost"
						onClick={handleBack}
						className="h-9 gap-2 rounded-full px-3 text-sm font-medium text-neutral-600 hover:bg-black/[0.04] hover:text-[var(--theme-red)]">
						<ArrowLeft className="h-4 w-4" />
						Back to jobs
					</Button>
					<div className="flex shrink-0 items-center rounded-xl bg-white/90 px-3 py-2 shadow-sm ring-1 ring-[#e8dede]/90">
						<img
							src={bandaiLogo}
							alt="Bandai Namco"
							className="h-10 w-auto max-w-[min(220px,45vw)] object-contain object-right sm:h-11"
						/>
					</div>
				</div>

				<div className="overflow-hidden rounded-2xl bg-white/95 shadow-[0_8px_40px_-12px_rgba(60,40,40,0.12)] ring-1 ring-[#e8dede]/80">
					<div className="px-5 pb-2 pt-6 sm:px-8 sm:pt-8">
						<h1 className="font-heading text-xl font-semibold tracking-tight text-neutral-900 sm:text-2xl">
							{jobTitle}
						</h1>
						<div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-[#5f5f63]">
							{job?.level?.name && (
								<span className="rounded-full bg-[#faf6f3] px-2.5 py-0.5 text-xs font-medium text-neutral-700 ring-1 ring-[#e8dede]/70">
									{job.level.name}
								</span>
							)}
							{jobType && <span>{jobType}</span>}
							{job?.location && (
								<>
									<span className="text-neutral-300" aria-hidden>
										·
									</span>
									<span>{job.location}</span>
								</>
							)}
							{postedDate && (
								<>
									<span className="text-neutral-300" aria-hidden>
										·
									</span>
									<span>Posted {postedDate}</span>
								</>
							)}
						</div>
					</div>

					<div className="px-5 pb-8 pt-4 sm:px-8 sm:pb-10">
						{isLoading ? (
							<div className="flex min-h-[200px] items-center justify-center">
								<div className="flex flex-col items-center gap-3 text-center">
									<div className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--theme-red)]/15 border-t-[var(--theme-red)]" />
									<p className="text-sm text-[#5f5f63]">Loading job details…</p>
								</div>
							</div>
						) : error || !job || !isJobAvailable ? (
							<div className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-xl bg-red-50/90 px-6 py-10 text-center ring-1 ring-red-100/90">
								<AlertCircle className="h-8 w-8 text-[var(--theme-red)]" />
								<div className="space-y-1">
									<h2 className="text-lg font-semibold text-neutral-900">
										This job is no longer available
									</h2>
									<p className="text-sm text-[#5f5f63]">
										Please go back to the jobs page and choose another opening.
									</p>
								</div>
								<Button
									type="button"
									onClick={() => navigate("/jobs")}
									className="rounded-full bg-[var(--theme-red)] px-6 text-white hover:bg-[#bf0012]">
									View open jobs
								</Button>
							</div>
						) : (
							<ApplicationForm jobId={jobId} jobTitle={jobTitle} />
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
