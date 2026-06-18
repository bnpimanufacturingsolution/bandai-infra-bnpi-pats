import { Typography } from "@/components/atoms/typography";
import { Badge, Icon } from "~/components/atoms";
import { Button } from "~/components/ui/button";

interface PageMetaProps {
	version?: string;
	lastUpdated?: string;
	onCopyLink?: () => void;
}

export const PageMeta = ({ version, lastUpdated, onCopyLink }: PageMetaProps) => {
	return (
		<div className="flex items-center gap-4 flex-wrap">
			{version && (
				<Badge variant="outline" className="font-mono text-xs">
					v{version}
				</Badge>
			)}
			{lastUpdated && (
				<Typography variant="muted" className="text-xs">
					Updated {lastUpdated}
				</Typography>
			)}
			{onCopyLink && (
				<Button
					variant="ghost"
					size="sm"
					onClick={onCopyLink}
					className="gap-2 h-auto py-1 px-2">
					<Icon name="Link" size={14} />
					<span className="text-xs">Copy link</span>
				</Button>
			)}
		</div>
	);
};
