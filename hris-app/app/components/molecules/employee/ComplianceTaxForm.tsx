import { useMemo } from "react";
import type { UseFormReturn } from "react-hook-form";
import { EmployeeDocumentConfigurator } from "~/components/molecules/employee/EmployeeDocumentConfigurator";
import { useDocumentTypes } from "~/lib/hooks/useDocumentTypes";
import type { FormData } from "~/types/employee-form.types";

interface ComplianceTaxFormProps {
	form: UseFormReturn<FormData>;
	documentFiles?: { [key: string]: File | null };
	onFileChange?: (docType: string, file: File | null) => void;
	enabledDocuments: { [key: string]: boolean };
	onToggleDocument: (docType: string) => void;
}

export function ComplianceTaxForm({
	form,
	documentFiles = {},
	onFileChange,
	enabledDocuments,
	onToggleDocument,
}: ComplianceTaxFormProps) {
	const organizationId = form.watch("employee.organizationId");
	const { data, isLoading } = useDocumentTypes(
		{
			page: 1,
			limit: 100,
			sort: "displayOrder",
			order: "asc",
			filter: "isActive:true",
		},
		{ enabled: !!organizationId },
	);

	const documentTypes = useMemo(
		() => (data?.documentTypes || []).filter((item) => item.isActive && item.isEmployeeVisible),
		[data],
	);

	return (
		<EmployeeDocumentConfigurator
			form={form as any}
			documentTypes={documentTypes}
			documentFiles={documentFiles}
			onFileChange={onFileChange}
			enabledDocuments={enabledDocuments}
			onToggleDocument={onToggleDocument}
			isLoading={isLoading}
			title="Compliance Documents"
			showSkippedHint
			skippedHintText="This document can be completed later during employee onboarding."
			emptyState={
				<div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
					No document types are configured yet.
				</div>
			}
		/>
	);
}
