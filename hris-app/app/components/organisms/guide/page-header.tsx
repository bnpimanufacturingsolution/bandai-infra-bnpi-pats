import { Typography } from "@/components/atoms/typography";

import { Separator } from "@/components/ui/separator";
import { Breadcrumb } from "~/components/molecules/guide/breadcrumb";
import { PageMeta } from "~/components/molecules/guide/page-meta";

interface PageHeaderProps {
	title: string;
	description?: string;
	version?: string;
	lastUpdated?: string;
	showMeta?: boolean;
	showBreadcrumb?: boolean;
	breadcrumbItems?: { label: string; href?: string }[];
	onCopyLink?: () => void;
	onNavigate?: (href: string) => void;
}

export const PageHeader = ({
	title,
	description,
	version,
	lastUpdated,
	showMeta = true,
	showBreadcrumb = true,
	breadcrumbItems = [],
	onCopyLink,
	onNavigate,
}: PageHeaderProps) => {
	return (
		<div className="space-y-6">
			{showBreadcrumb && breadcrumbItems.length > 0 && (
				<Breadcrumb items={breadcrumbItems} onNavigate={onNavigate} />
			)}

			<div className="space-y-4">
				<Typography variant="h1" className="text-balance">
					{title}
				</Typography>

				{description && (
					<Typography
						variant="body"
						className="text-muted-foreground text-pretty max-w-3xl">
						{description}
					</Typography>
				)}

				{showMeta && (version || lastUpdated || onCopyLink) && (
					<PageMeta version={version} lastUpdated={lastUpdated} onCopyLink={onCopyLink} />
				)}
			</div>

			<Separator />
		</div>
	);
};
