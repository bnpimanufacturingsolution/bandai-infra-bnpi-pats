import { Suspense, lazy } from "react";
import { guideData } from "~/types/guide-data";

// Lazy load the layout for better performance
const GuideLayout = lazy(() =>
	import("@/components/templates/guide-layout").then((mod) => ({
		default: mod.GuideLayout,
	})),
);

const PageHeader = lazy(() =>
	import("@/components/organisms/guide/page-header").then((mod) => ({
		default: mod.PageHeader,
	})),
);

const GuideContent = lazy(() =>
	import("@/components/organisms/guide/guide-content").then((mod) => ({
		default: mod.GuideContent,
	})),
);

const GuideNavigation = lazy(() =>
	import("@/components/organisms/guide/guide-navigation").then((mod) => ({
		default: mod.GuideNavigation,
	})),
);

export default function GuidePage() {
	const pageConfig = guideData.pages.introduction;

	const handleCopyLink = () => {
		if (typeof window !== "undefined") {
			navigator.clipboard.writeText(window.location.href);
			console.log("[v0] Link copied to clipboard");
		}
	};

	const handleNavigate = (href: string) => {
		console.log("[v0] Navigation requested to:", href);
	};

	return (
		<Suspense
			fallback={<div className="flex items-center justify-center h-screen">Loading...</div>}>
			<GuideLayout
				version={guideData.version}
				navigation={guideData.navigation}
				activeId="introduction">
				<div className="space-y-12">
					<Suspense fallback={<div>Loading header...</div>}>
						<PageHeader
							title={pageConfig.title}
							description={pageConfig.description}
							version={pageConfig.version}
							lastUpdated={pageConfig.lastUpdated}
							showMeta={pageConfig.showMeta}
							showBreadcrumb={pageConfig.showBreadcrumb}
							breadcrumbItems={[
								{ label: "Home", href: "/" },
								{ label: "Getting Started", href: "/getting-started" },
								{ label: "Introduction" },
							]}
							onCopyLink={handleCopyLink}
							onNavigate={handleNavigate}
						/>
					</Suspense>

					<Suspense fallback={<div>Loading content...</div>}>
						<GuideContent sections={pageConfig.content} />
					</Suspense>

					<Suspense fallback={null}>
						<GuideNavigation
							showNext={pageConfig.showNext}
							nextPage={pageConfig.nextPage}
							onNavigate={handleNavigate}
						/>
					</Suspense>
				</div>
			</GuideLayout>
		</Suspense>
	);
}
