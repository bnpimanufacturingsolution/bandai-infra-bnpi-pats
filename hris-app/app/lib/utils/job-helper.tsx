import { JobLocationIcon, JobTypeIcon } from "~/components/atoms/jobs";
import type { Column } from "~/components/molecules";
import { JobPositionCell } from "~/components/molecules/job-management/job-position-cell";
import { JobTagsList } from "~/components/molecules/job-management/job-tag-list";
import type { Job } from "~/zod/job.zod";
import { formatDateTime } from "./text-utils";

export const createJobTableColumns = (
	getPositionTitle: (id: string) => string,
	getLevelName: (id: string) => string,
): Column<Job>[] => [
	{
		key: "position",
		label: "Position",
		render: (value, job) => {
			if (!job) return <span className="text-gray-400">-</span>;
			// Use nested object if available, otherwise fallback to ID lookup
			const positionTitle = job.position?.title || getPositionTitle(job.positionId || "");
			const levelName = job.level?.name || getLevelName(job.levelId || "");
			return <JobPositionCell positionTitle={positionTitle} levelName={levelName} />;
		},
	},
	{
		key: "type",
		label: "Type",
		render: (value, job) => {
			if (!job) return <span className="text-gray-400">-</span>;
			return <JobTypeIcon type={job.type} />;
		},
	},
	{
		key: "location",
		label: "Location",
		render: (value, job) => {
			if (!job) return <span className="text-gray-400">-</span>;
			return <JobLocationIcon location={job.location} />;
		},
	},
	{
		key: "tags",
		label: "Tags",
		render: (value, job) => {
			if (!job) return <span className="text-gray-400">-</span>;
			return <JobTagsList tags={job.tags || []} />;
		},
	},
	{
		key: "createdAt",
		label: "Created",
		render: (value, job) => {
			if (!job || !job.createdAt) return <span className="text-gray-400">-</span>;
			return <span className="text-sm text-gray-600">{formatDateTime(job.createdAt)}</span>;
		},
	},
];

export const getPositionTitleById = (positions: any[], positionId: string): string => {
	const position = positions.find((p) => p.id === positionId);
	return position ? position.title : "Unknown Position";
};

export const getLevelNameById = (levels: any[], levelId: string): string => {
	const level = levels.find((l: any) => l.id === levelId);
	return level ? level.name : "Unknown Level";
};
