interface JobPositionCellProps {
	positionTitle: string;
	levelName?: string | null;
	sectionName?: string | null;
}

export const JobPositionCell = ({
	positionTitle,
	levelName,
	sectionName,
}: JobPositionCellProps) => (
	<div className="min-w-0">
		<div className="truncate font-medium text-gray-900">{positionTitle}</div>
		{levelName || sectionName ? (
			<div className="truncate text-sm text-gray-500">
				{[sectionName, levelName].filter(Boolean).join(" / ")}
			</div>
		) : null}
	</div>
);
