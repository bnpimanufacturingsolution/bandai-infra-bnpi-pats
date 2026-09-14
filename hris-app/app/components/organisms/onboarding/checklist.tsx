import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import { useNavigate } from "react-router";
import ChecklistPreviewTable from "./checklist-preview-table";
import { mapTemplateToSections, type ChecklistSection } from "./builder";
import { useOnboardingTemplate, useOnboardingTemplates } from "~/lib/hooks/useOnboarding";

/**
 * The admin/HR onboarding checklist page: displays THE created checklist
 * (the single active template) in the builder's Preview layout as a full page.
 * Deliberately contains nothing employee-related — provisioning and signing
 * live on the employee-facing surfaces (API ready: /api/onboarding).
 */
export function AdminOnboardingChecklist() {
	const navigate = useNavigate();
	const templatesQuery = useOnboardingTemplates();
	const [templateId, setTemplateId] = useState<string | null>(null);
	const templateQuery = useOnboardingTemplate(templateId);

	useEffect(() => {
		if (templateId) return;
		const list = templatesQuery.data?.templates ?? [];
		const active = list.find((template) => template.isActive) ?? list[0];
		if (active) setTemplateId(active.id);
	}, [templatesQuery.data, templateId]);

	const sections: ChecklistSection[] = useMemo(
		() => (templateQuery.data?.template ? mapTemplateToSections(templateQuery.data.template) : []),
		[templateQuery.data],
	);

	const title = templateQuery.data?.template?.name ?? "Onboarding Checklist";
	const noTemplateYet = !templatesQuery.isLoading && !templateId;

	return (
		<Card>
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between">
					<CardTitle>{title}</CardTitle>
					<Button
						variant="secondary"
						onClick={() => navigate("/admin/configuration/onboarding/builder")}>
						Go to Builder
					</Button>
				</div>
			</CardHeader>
			<CardContent className="max-h-[75vh] overflow-auto pb-10">
				{templatesQuery.isError ? (
					<p className="text-sm text-gray-500">
						The onboarding service could not be reached. Please retry or open the Builder.
					</p>
				) : templatesQuery.isLoading || templateQuery.isLoading ? (
					<p className="text-sm text-gray-500">Loading checklist…</p>
				) : noTemplateYet ? (
					<div className="space-y-3 py-6 text-center">
						<p className="text-sm text-gray-500">
							No checklist has been built yet.
						</p>
						<Button
							variant="secondary"
							onClick={() => navigate("/admin/configuration/onboarding/builder")}>
							Build your checklist
						</Button>
					</div>
				) : (
					<ChecklistPreviewTable sections={sections} emptyLabel="This checklist has no sections yet. Add them in the Builder." />
				)}
			</CardContent>
		</Card>
	);
}
