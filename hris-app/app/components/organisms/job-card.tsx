import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { JobTags } from "../molecules/job-tags";
import { JobMeta } from "../molecules/job-meta";
import { Badge } from "../atoms";
import { useNavigate } from "react-router";
import { ArrowRight, BriefcaseBusiness, MapPin } from "lucide-react";

export interface JobCardProps {
	id: string;
	positionId: string;
	title: string;
	company: string;
	time: string;
	salary: string;
	tags: Array<
		| string
		| {
				label: string;
				variant?:
					| "default"
					| "secondary"
					| "outline"
					| "accent"
					| "destructive"
					| "success"
					| "warning"
					| "info";
		  }
	>;
	description?: string;
	featured?: boolean;
	jobType?: string;
	location?: string;
	level?: string;
	onCardClick?: (id: string) => void;
}

const formatBadgeValue = (value?: string | null) =>
	String(value || "")
		.trim()
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/[_-]/g, " ")
		.replace(/\s+/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());

export function JobCard({
	id,
	title,
	company,
	time,
	salary,
	tags,
	description,
	featured = false,
	jobType,
	location,
	onCardClick,
}: JobCardProps) {
	const navigate = useNavigate();
	const jobTypeLabel = formatBadgeValue(jobType);
	const locationLabel = formatBadgeValue(location);

	const handleApplyClick = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		navigate(`/jobs/${id}/apply`);
	};

	const handleCardClick = () => {
		onCardClick?.(id);
	};

	return (
		<Card
			onClick={handleCardClick}
			className={`group relative cursor-pointer space-y-4 rounded-lg border bg-white p-5 transition-all duration-200 hover:border-[var(--theme-red)]/35 hover:shadow-md ${
				featured ? "border-[var(--theme-red)]/30 shadow-sm" : "border-[#e8dede]"
			}`}>
			{featured && (
				<div className="absolute -top-3 left-6">
					<Badge className="bg-[var(--theme-red)] px-3 py-1 text-white shadow-sm">
						Featured
					</Badge>
				</div>
			)}
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0 flex-1 space-y-3">
					<div>
						<h3 className="mb-1 text-xl font-bold tracking-tight text-neutral-900 transition-colors group-hover:text-[var(--theme-red)]">
							{title}
						</h3>
						<JobMeta company={company} time={time} salary={salary} />
					</div>
					<div className="flex flex-wrap gap-2">
						{jobTypeLabel && (
							<Badge className="gap-1 rounded-full bg-[var(--theme-red)] px-3 py-1 text-xs font-bold text-white shadow-sm ring-1 ring-[var(--theme-red)]">
								<BriefcaseBusiness className="h-3 w-3" />
								{jobTypeLabel}
							</Badge>
						)}
						{locationLabel && (
							<Badge className="gap-1 rounded-full bg-neutral-800 px-3 py-1 text-xs font-bold text-white shadow-sm ring-1 ring-neutral-800">
								<MapPin className="h-3 w-3" />
								{locationLabel}
							</Badge>
						)}
					</div>
				</div>
			</div>

			{description && (
				<p className="line-clamp-2 text-sm leading-relaxed text-neutral-600">
					{description}
				</p>
			)}

			<div className="flex flex-col gap-3 border-t border-[#e8dede] pt-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex min-w-0 flex-1 items-center gap-2">
					{tags && tags.length > 0 && <JobTags tags={tags} />}
				</div>
				<Button
					size="lg"
					className="shrink-0 rounded-md bg-[var(--theme-red)] font-semibold text-white transition-all hover:bg-[#a60009]"
					onClick={handleApplyClick}>
					Apply now
					<ArrowRight className="ml-2 h-4 w-4" />
				</Button>
			</div>
		</Card>
	);
}
