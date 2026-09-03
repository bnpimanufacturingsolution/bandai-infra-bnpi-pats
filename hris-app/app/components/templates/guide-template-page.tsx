import { Suspense, lazy } from "react";
import { guideData } from "~/types/guide-data";

// Lazy load the layout for better performance
const GuideLayout = lazy(() =>
	import("@/components/templates/guide-layout").then((mod) => ({
		default: mod.GuideLayout,
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
				<div className="space-y-8">
					<header className="space-y-2">
						<h1 className="text-3xl font-semibold text-gray-900">{pageConfig.title}</h1>
						<p className="text-sm text-gray-600">{pageConfig.description}</p>
						<button
							type="button"
							onClick={handleCopyLink}
							className="text-sm font-medium text-orange-600 hover:text-orange-700">
							Copy link
						</button>
					</header>

					<div className="space-y-6">
						{pageConfig.content.map((section) => (
							<section key={section.id} id={section.id} className="space-y-2">
								<h2 className="text-xl font-semibold text-gray-900">
									{section.heading}
								</h2>
								<p className="text-sm text-gray-700">{section.body}</p>
							</section>
						))}
					</div>
				</div>
			</GuideLayout>
		</Suspense>
	);
}
