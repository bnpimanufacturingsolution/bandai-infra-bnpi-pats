import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { formatDistanceToNow } from "date-fns";
import { JobCard, type JobCardProps } from "./job-card";
import { JobDetailsModal } from "./job-details-modal";
import { type JobFilters } from "./filters-sidebar";
import { useActiveJobs } from "~/lib/hooks/use-job";
import type { Job } from "~/zod/job.zod";

interface JobWithMetadata extends JobCardProps {
	postedDate: Date;
	salaryMin: number;
	salaryMax: number;
	rawJobType?: string | null;
	rawLocation?: string | null;
	searchText?: string;
}

interface JobListProps {
	searchQuery?: string;
	locationQuery?: string;
	filters?: JobFilters;
	sortBy?: string;
	onJobCountChange?: (count: number) => void;
}

const isApplicantCountedForJobCapacity = (applicant: any) => {
	if (applicant?.isDeleted) return false;
	if (applicant?.convertedToEmployeeId || applicant?.convertedToEmployee?.id) return true;
	return String(applicant?.currentWorkflowStateKey || "").toUpperCase() === "HIRED";
};

export const isPublicJobStillOpen = (job: any) => {
	if (!job || job.isDeleted) return false;
	const headcountRequested = Math.max(1, Number(job.headcountRequested || 1));
	const applicants = Array.isArray(job.applicants) ? job.applicants : [];
	const activeApplicantCount = applicants.filter(isApplicantCountedForJobCapacity).length;
	return activeApplicantCount < headcountRequested;
};

export const formatJobLabel = (value?: string | null) =>
	String(value || "")
		.trim()
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/[_-]/g, " ")
		.replace(/\s+/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());

const filterValue = (value: string) => value.replace(/[;,]/g, " ").trim();

const jobTypeFilterValues: Record<string, string[]> = {
	fullTime: ["FULL_TIME", "fullTime", "Full-time"],
	partTime: ["PART_TIME", "partTime", "Part-time"],
	contractual: ["CONTRACTUAL", "contractual"],
	freelance: ["FREELANCE", "freelance"],
	internship: ["INTERNSHIP", "internship"],
	volunteer: ["VOLUNTEER", "volunteer"],
};

const locationFilterValues: Record<string, string[]> = {
	remote: ["REMOTE", "remote"],
	onsite: ["ONSITE", "ON_SITE", "onsite", "on-site"],
	hybrid: ["HYBRID", "hybrid"],
};

export function JobList({
	searchQuery = "",
	locationQuery = "",
	filters,
	sortBy = "recent",
	onJobCountChange,
}: JobListProps) {
	const [searchParams, setSearchParams] = useSearchParams();
	const [selectedJob, setSelectedJob] = useState<JobWithMetadata | null>(null);
	const [isModalOpen, setIsModalOpen] = useState(false);

	const apiParams = useMemo(() => {
		const filtersForApi: string[] = [];
		const keyword = searchQuery.trim();
		const locationKeyword = locationQuery.trim();

		if (locationKeyword) {
			filtersForApi.push(`location~${filterValue(locationKeyword)}`);
		}

		if (filters) {
			Object.entries(filters.jobTypes)
				.filter(([_, isActive]) => isActive)
				.flatMap(([type]) => jobTypeFilterValues[type] || [type])
				.forEach((type) => filtersForApi.push(`type:${filterValue(type)}`));

			Object.entries(filters.locationPreferences)
				.filter(([_, isActive]) => isActive)
				.flatMap(([location]) => locationFilterValues[location] || [location])
				.forEach((location) => filtersForApi.push(`location:${filterValue(location)}`));

			if (filters.datePosted !== "anytime") {
				const cutoffTimes = {
					"24hours": 24 * 60 * 60 * 1000,
					week: 7 * 24 * 60 * 60 * 1000,
					month: 30 * 24 * 60 * 60 * 1000,
				};
				const cutoff = cutoffTimes[filters.datePosted as keyof typeof cutoffTimes];
				if (cutoff) {
					filtersForApi.push(`createdAt>=${new Date(Date.now() - cutoff).toISOString()}`);
				}
			}
		}

		const params: any = {
			limit: 100,
			count: true,
			query: keyword,
			searchFields: "position.title,level.name,description",
			filter: filtersForApi.join(","),
			fields: "id,headcountRequested,tags,type,description,position.id,position.title,position.description,position.minSalary,position.maxSalary,level.id,level.name,createdAt,location,applicants.id,applicants.currentWorkflowStateKey,applicants.convertedToEmployeeId,applicants.isDeleted",
		};

		if (sortBy === "recent") {
			params.sort = "createdAt";
			params.order = "desc";
		}

		return params;
	}, [filters, locationQuery, searchQuery, sortBy]);

	const { data: jobsData, isLoading } = useActiveJobs(apiParams);

	const jobs = useMemo((): Job[] => {
		if (!jobsData) return [];
		const data = jobsData as any;
		return (
			Array.isArray(data.jobs) ? data.jobs : Array.isArray(data.data) ? data.data : []
		) as Job[];
	}, [jobsData]);

	const displayedJobs = useMemo((): JobWithMetadata[] => {
		let result: JobWithMetadata[] = jobs.filter(isPublicJobStillOpen).map((job: any) => {
			const position = job?.position;
			const level = job?.level;
			const salaryMin = Number(position?.minSalary || 0);
			const salaryMax = Number(position?.maxSalary || 0);
			const createdAt = new Date(job.createdAt || Date.now());
			const levelName = String(level?.name || "").trim();
			const positionTitle = String(position?.title || "Untitled Position").trim();
			const title = levelName ? `${levelName} - ${positionTitle}` : positionTitle;
			const jobTypeLabel = formatJobLabel(job.type);
			const locationLabel = formatJobLabel(job.location);
			const tags = Array.isArray(job.tags) ? job.tags : [];

			const description =
				String(job.description || "").trim() ||
				String(position?.description || "").trim() ||
				`${title} at Bandai Namco. Apply now to continue with the recruitment process.`;

			return {
				id: job.id,
				positionId: position?.id || "",
				title,
				company: "Bandai Namco",
				time: formatDistanceToNow(createdAt, { addSuffix: true }),
				salary:
					salaryMin || salaryMax
						? `PHP ${salaryMin.toLocaleString()} - PHP ${salaryMax.toLocaleString()}`
						: "",
				description,
				tags,
				jobType: jobTypeLabel,
				location: locationLabel,
				postedDate: createdAt,
				salaryMin,
				salaryMax,
				rawJobType: job.type,
				rawLocation: job.location,
				level: levelName,
				searchText: [
					title,
					positionTitle,
					levelName,
					jobTypeLabel,
					locationLabel,
					description,
					...tags,
				]
					.join(" ")
					.toLowerCase(),
			};
		});

		if (sortBy === "title") {
			result.sort((a, b) => a.title.localeCompare(b.title));
		}

		return result;
	}, [jobs, sortBy]);

	useEffect(() => {
		onJobCountChange?.(displayedJobs.length);
	}, [displayedJobs.length, onJobCountChange]);

	useEffect(() => {
		const jobId = searchParams.get("id");
		if (jobId && displayedJobs.length > 0) {
			const job = displayedJobs.find((record) => record.id === jobId);
			if (job) {
				setSelectedJob(job);
				setIsModalOpen(true);
				return;
			}
		}
		setIsModalOpen(false);
		setSelectedJob(null);
	}, [searchParams, displayedJobs]);

	const handleCloseModal = () => {
		setIsModalOpen(false);
		const nextParams = new URLSearchParams(searchParams);
		nextParams.delete("id");
		setSearchParams(nextParams);
	};

	const handleJobCardClick = (jobId: string) => {
		const nextParams = new URLSearchParams(searchParams);
		nextParams.set("id", jobId);
		setSearchParams(nextParams);
	};

	if (isLoading) {
		return <div className="py-8 text-center text-neutral-500">Loading open roles...</div>;
	}

	if (displayedJobs.length === 0) {
		return (
			<div className="rounded-lg border border-dashed border-[#e8dede] bg-white px-6 py-12 text-center">
				<p className="font-medium text-neutral-800">No open roles match this view.</p>
				<p className="mt-2 text-sm text-neutral-500">
					Try adjusting your filters or search query.
				</p>
			</div>
		);
	}

	return (
		<>
			<div className="space-y-4">
				{displayedJobs.map((job) => (
					<JobCard key={job.id} {...job} onCardClick={handleJobCardClick} />
				))}
			</div>

			{selectedJob && (
				<JobDetailsModal
					job={selectedJob}
					isOpen={isModalOpen}
					onClose={handleCloseModal}
				/>
			)}
		</>
	);
}
