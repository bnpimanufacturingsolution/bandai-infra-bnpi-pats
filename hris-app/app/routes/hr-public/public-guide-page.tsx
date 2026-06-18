import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { GuideLayout } from "~/components/templates/guide-template";
import { useGuides, useGuideWithSections } from "~/hooks/use-guide";
import type { Page } from "~/zod/guide.zod";

export function PublicGuidePage() {
	const [searchParams, setSearchParams] = useSearchParams();

	// First fetch all guides to find the main one (or we could hardcode an ID if known)
	const { data: guidesData, isLoading: isLoadingGuides } = useGuides({ limit: 1 });
	const guides = guidesData?.data?.guides || guidesData?.guides || [];
	const mainGuideId = guides[0]?.id;

	// Then fetch the full guide with all sections
	const { data: guideConfig, isLoading: isLoadingGuide } = useGuideWithSections(
		mainGuideId || "",
	);

	const allPages = useMemo(() => {
		if (!guideConfig?.sections) return [];
		return guideConfig.sections.flatMap((section) => section.pages);
	}, [guideConfig]);

	const currentPageId = searchParams.get("page") || allPages[0]?.id || "";
	const currentPage = useMemo(() => {
		return allPages.find((p) => p.id === currentPageId) || allPages[0];
	}, [allPages, currentPageId]);

	const handlePageChange = (page: Page) => {
		setSearchParams({ page: page.id });
		window.scrollTo({ top: 0, behavior: "smooth" });
	};

	useEffect(() => {
		if (currentPage && guideConfig) {
			document.title = `${currentPage.title} | ${guideConfig.title}`;
		}
	}, [currentPage, guideConfig]);

	if (isLoadingGuides || (mainGuideId && isLoadingGuide)) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-background">
				<div className="flex flex-col items-center gap-4">
					<div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
					<p className="text-muted-foreground animate-pulse">Loading guide...</p>
				</div>
			</div>
		);
	}

	if (!guideConfig || !currentPage) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-background">
				<div className="text-center">
					<h1 className="text-2xl font-semibold text-foreground mb-2">
						{!mainGuideId ? "No Guide Found" : "Page Not Found"}
					</h1>
					<p className="text-muted-foreground">
						{!mainGuideId
							? "There are no guides available at the moment."
							: "The requested documentation page could not be found."}
					</p>
				</div>
			</div>
		);
	}

	return (
		<GuideLayout
			title={guideConfig.title}
			sections={guideConfig.sections}
			currentPage={currentPage}
			onPageChange={handlePageChange}
		/>
	);
}

export default PublicGuidePage;
