import { cn } from "@/lib/utils";
import { Icon } from "../atoms";

interface JobMetaProps {
	company?: string;
	location?: string;
	time?: string;
	salary?: string;
	className?: string;
}

export function JobMeta({ company, location, time, salary, className }: JobMetaProps) {
	return (
		<div
			className={cn(
				"flex flex-wrap items-center gap-3 text-sm text-muted-foreground",
				className,
			)}>
			{company && <span className="font-medium text-foreground">{company}</span>}
			{time && (
				<span className="flex items-center gap-1">
					<Icon name="clock" size={16} />
					{time}
				</span>
			)}
			{/* {salary && (
				<span className="flex items-center gap-1 font-medium text-foreground">
					<Icon name="dollar" size={16} />
					{salary}
				</span>
			)} */}
			{location && (
				<span className="flex items-center gap-1">
					<Icon name="mapPin" size={16} />
					{location}
				</span>
			)}
		</div>
	);
}
