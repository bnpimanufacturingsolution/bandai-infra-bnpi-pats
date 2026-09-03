import { Clock, MapPin } from "lucide-react";
import { Badge } from "./Badge";

interface JobTypeIconProps {
	type: string | null | undefined;
}

export const JobTypeIcon = ({ type }: JobTypeIconProps) => {
	if (!type) return <span className="text-gray-400">-</span>;

	return (
		<Badge variant="outline" className="flex items-center gap-1 w-fit">
			<Clock className="w-3 h-3" />
			{type}
		</Badge>
	);
};

interface JobLocationIconProps {
	location: string | null | undefined;
}

export const JobLocationIcon = ({ location }: JobLocationIconProps) => {
	if (!location) return <span className="text-gray-400">-</span>;

	return (
		<div className="flex items-center gap-1 text-sm text-gray-700">
			<MapPin className="w-3 h-3 text-gray-400" />
			{location}
		</div>
	);
};

interface FieldLabelProps {
	children: React.ReactNode;
}

export const FieldLabel = ({ children }: FieldLabelProps) => (
	<label className="text-sm font-medium text-gray-500">{children}</label>
);

interface FieldValueProps {
	children: React.ReactNode;
	className?: string;
}

export const FieldValue = ({
	children,
	className = "text-base text-gray-900",
}: FieldValueProps) => <p className={className}>{children}</p>;
