import { Separator } from "@/components/ui/separator";
import { NextPageCard } from "~/components/molecules/guide/next-page-card";

interface GuideNavigationProps {
	showNext?: boolean;
	nextPage?: {
		title: string;
		href: string;
	};
	onNavigate?: (href: string) => void;
}

export const GuideNavigation = ({
	showNext = true,
	nextPage,
	onNavigate,
}: GuideNavigationProps) => {
	if (!showNext || !nextPage) {
		return null;
	}

	return (
		<div className="space-y-6">
			<Separator />
			<NextPageCard title={nextPage.title} href={nextPage.href} onNavigate={onNavigate} />
		</div>
	);
};
