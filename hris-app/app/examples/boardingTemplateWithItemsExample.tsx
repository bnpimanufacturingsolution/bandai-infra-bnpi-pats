// @ts-nocheck
/**
 * Example: How to use the useCreateBoardingTemplateWithItems hook
 *
 * This example demonstrates creating a boarding template along with its template items
 * in a single operation using the combined hook.
 */

import { useCreateBoardingTemplateWithItems } from "~/lib/hooks/useBoardingTemplates";
import type { CreateBoardingTemplate } from "~/services/boarding-template.service";
import type { CreateTemplateItem } from "~/services/template-item.service";

export function CreateBoardingTemplateExample() {
	const createTemplateWithItems = useCreateBoardingTemplateWithItems();

	const handleCreateTemplate = async () => {
		// Define the boarding template
		const template: CreateBoardingTemplate = {
			organizationId: "your-org-id",
			name: "Software Engineer Onboarding",
			description: "Complete onboarding checklist for new software engineers",
			type: "ONBOARDING", // or "OFFBOARDING"
			department: "Engineering",
			isDefault: false,
			isActive: true,
		};

		// Define template items (without organizationId and templateId - they'll be auto-added)
		const items: Omit<CreateTemplateItem, "organizationId" | "templateId">[] = [
			{
				title: "Complete Employee Information Form",
				description: "Fill out personal details, emergency contacts, and tax information",
				category: "HR_DOCUMENTATION",
				dueOffset: -7,
				priority: "HIGH",
				order: 1,
				metadata: {
					estimatedDuration: 30,
					requiresSignature: true,
				},
			},
			{
				title: "Setup Company Email Account",
				description: "Create and configure work email with security settings",
				category: "IT_SETUP",
				dueOffset: -3,
				priority: "CRITICAL",
				order: 2,
				metadata: {
					estimatedDuration: 15,
					assignedDepartment: "IT",
				},
			},
			{
				title: "Request Laptop and Accessories",
				description:
					"Submit hardware requirements including laptop specs, monitor, keyboard, mouse",
				category: "EQUIPMENT",
				dueOffset: -5,
				priority: "HIGH",
				order: 3,
				metadata: {
					estimatedDuration: 10,
					requiresApproval: true,
				},
			},
			{
				title: "Assign Workspace and Desk",
				description: "Reserve and prepare desk location with necessary office supplies",
				category: "WORKSPACE_SETUP",
				dueOffset: -2,
				priority: "MEDIUM",
				order: 4,
				metadata: {
					estimatedDuration: 20,
					location: "Floor 3",
				},
			},
			{
				title: "Grant System Access Permissions",
				description:
					"Provide access to company systems, databases, and project management tools",
				category: "OTHER",
				dueOffset: 0,
				priority: "CRITICAL",
				order: 5,
				metadata: {
					estimatedDuration: 45,
					systems: ["Jira", "GitHub", "Slack", "AWS Console"],
				},
			},
			{
				title: "Attend Company Orientation",
				description:
					"Introduction to company culture, policies, benefits, and team members",
				category: "TRAINING",
				dueOffset: 0,
				priority: "HIGH",
				order: 6,
				metadata: {
					estimatedDuration: 120,
					format: "in-person",
					meetingRoom: "Conference Room A",
				},
			},
			{
				title: "Complete Compliance Training",
				description:
					"Mandatory training on data privacy, security protocols, and code of conduct",
				category: "TRAINING",
				dueOffset: 1,
				priority: "HIGH",
				order: 7,
				metadata: {
					estimatedDuration: 90,
					format: "online",
					requiresCertificate: true,
				},
			},
			{
				title: "Schedule 1-on-1 with Manager",
				description:
					"Initial meeting to discuss role expectations, goals, and team dynamics",
				category: "OTHER",
				dueOffset: 2,
				priority: "MEDIUM",
				order: 8,
				metadata: {
					estimatedDuration: 60,
					format: "in-person",
				},
			},
			{
				title: "Review Benefits Package",
				description:
					"Select health insurance, retirement plans, and other employee benefits",
				category: "HR_DOCUMENTATION",
				dueOffset: 3,
				priority: "MEDIUM",
				order: 9,
				metadata: {
					estimatedDuration: 45,
					deadline: "within 30 days",
				},
			},
			{
				title: "Complete Department-Specific Training",
				description: "Technical training and tooling specific to your department and role",
				category: "TRAINING",
				dueOffset: 5,
				priority: "MEDIUM",
				order: 10,
				metadata: {
					estimatedDuration: 180,
					format: "hybrid",
					mentorAssigned: true,
				},
			},
		];

		try {
			const result = await createTemplateWithItems.mutateAsync({
				template,
				items,
			});

			console.log("Created template:", result.template);
			console.log("Created items:", result.templateItems);

			// You can now use result.template.id and result.templateItems
			return result;
		} catch (error) {
			console.error("Error creating template with items:", error);
			throw error;
		}
	};

	return (
		<div>
			<button onClick={handleCreateTemplate} disabled={createTemplateWithItems.isPending}>
				{createTemplateWithItems.isPending ? "Creating..." : "Create Template with Items"}
			</button>

			{createTemplateWithItems.isError && (
				<div style={{ color: "red" }}>Error: {createTemplateWithItems.error.message}</div>
			)}

			{createTemplateWithItems.isSuccess && (
				<div style={{ color: "green" }}>
					Successfully created template with{" "}
					{createTemplateWithItems.data.templateItems.length} items!
				</div>
			)}
		</div>
	);
}

/**
 * Alternative: Create template and items separately
 */
import { useCreateBoardingTemplate } from "~/lib/hooks/useBoardingTemplates";
import { useBulkCreateTemplateItems } from "~/lib/hooks/useTemplateItems";

export function CreateBoardingTemplateSeparately() {
	const createTemplate = useCreateBoardingTemplate();
	const createItems = useBulkCreateTemplateItems();

	const handleCreateSeparately = async (organizationId: string) => {
		// Step 1: Create the boarding template
		const templateResult = await createTemplate.mutateAsync({
			organizationId,
			name: "Software Engineer Onboarding",
			description: "Complete onboarding checklist for new software engineers",
			type: "ONBOARDING",
			department: "Engineering",
			isDefault: false,
			isActive: true,
		});

		const templateId = templateResult.boardingTemplate.id;

		// Step 2: Create the template items with full payload
		const items: CreateTemplateItem[] = [
			{
				organizationId,
				templateId,
				title: "Complete Employee Information Form",
				description: "Fill out personal details, emergency contacts, and tax information",
				category: "HR_DOCUMENTATION",
				dueOffset: -7,
				priority: "HIGH",
				order: 1,
				metadata: {
					estimatedDuration: 30,
					requiresSignature: true,
				},
			},
			// ... add more items
		];

		const itemsResult = await createItems.mutateAsync(items);

		return {
			template: templateResult.boardingTemplate,
			templateItems: itemsResult.data.templateItems,
		};
	};

	return <button onClick={() => handleCreateSeparately("your-org-id")}>Create Separately</button>;
}
