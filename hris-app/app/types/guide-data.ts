export interface NavItem {
	id: string;
	title: string;
	href?: string;
	icon?: string;
	isExpanded?: boolean;
	children?: NavItem[];
}

interface GuidePageData {
	title: string;
	description: string;
	version?: string;
	lastUpdated?: string;
	showMeta?: boolean;
	showBreadcrumb?: boolean;
	showNext?: boolean;
	nextPage?: { title: string; href: string };
	content: Array<{
		id: string;
		heading: string;
		body: string;
	}>;
}

export const guideData: {
	version: string;
	navigation: NavItem[];
	pages: Record<string, GuidePageData>;
} = {
	version: "1.0.0",
	navigation: [
		{
			id: "introduction",
			title: "Introduction",
			href: "/guide/introduction",
			icon: "bookmark",
		},
	],
	pages: {
		introduction: {
			title: "Introduction",
			description: "Guide content placeholder for the in-app documentation surface.",
			version: "1.0.0",
			lastUpdated: "2026-06-16",
			showMeta: true,
			showBreadcrumb: true,
			showNext: false,
			content: [
				{
					id: "overview",
					heading: "Overview",
					body: "This page is a lightweight compatibility layer for the legacy guide route.",
				},
			],
		},
	},
};
