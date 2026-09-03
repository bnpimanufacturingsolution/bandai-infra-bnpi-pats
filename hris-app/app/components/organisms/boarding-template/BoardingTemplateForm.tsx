import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormInput } from "@/components/atoms/form/form-input";
import { FormTextarea } from "@/components/atoms/form/form-textarea";
import { FormSelect } from "@/components/atoms/form/form-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FileText, Info, ShieldCheck } from "lucide-react";
import type { CreateBoardingTemplate } from "~/zod/boarding-template";
import type { BoardingType } from "~/zod/boarding-process";

interface BoardingTemplateFormProps {
	formData: Partial<CreateBoardingTemplate>;
	onChange: (data: Partial<CreateBoardingTemplate>) => void;
	errors?: Record<string, string>;
}

const BOARDING_TYPE_OPTIONS: { value: BoardingType; label: string }[] = [
	{ value: "ONBOARDING", label: "Onboarding" },
	{ value: "OFFBOARDING", label: "Offboarding" },
];

const ROLE_OPTIONS = [
	{ value: "hris-employee", label: "Employee" },
	{ value: "hris-employee-manager", label: "Employee Manager" },
	{ value: "hris-hr-user", label: "HR User" },
	{ value: "hris-hr-manager", label: "HR Manager" },
];

export function BoardingTemplateForm({
	formData,
	onChange,
	errors = {},
}: BoardingTemplateFormProps) {
	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
		const { name, value } = e.target;
		onChange({ [name]: value });
	};

	const handleSelectChange = (name: string, value: string) => {
		onChange({ [name]: value });
	};

	const handleCheckboxChange = (name: string, checked: boolean) => {
		onChange({ [name]: checked });
	};

	const isOffboarding = formData.type === "OFFBOARDING";

	return (
		<Card className="border-none shadow-none bg-transparent">
			<CardHeader className="px-0 pt-0">
				<div className="flex items-center gap-2">
					<div className="p-2 bg-primary/10 rounded-lg">
						<FileText className="h-5 w-5 text-primary" />
					</div>
					<div>
						<CardTitle className="text-lg">Template Information</CardTitle>
						<p className="text-sm text-muted-foreground">
							Configure the basic details and target audience for this template
						</p>
					</div>
				</div>
			</CardHeader>
			<CardContent className="px-0 space-y-6">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					{/* Template Name */}
					<div className="md:col-span-2">
						<FormInput
							label="Template Name"
							name="name"
							value={formData.name || ""}
							onChange={handleInputChange}
							placeholder="e.g., Standard Employee Onboarding"
							error={errors.name}
						/>
					</div>

					{/* Description */}
					<div className="md:col-span-2">
						<FormTextarea
							label="Description"
							name="description"
							value={formData.description || ""}
							onChange={handleInputChange}
							placeholder="Describe the purpose and use case for this template..."
							rows={3}
						/>
					</div>

					{/* Boarding Type */}
					<FormSelect
						label="Boarding Type"
						name="type"
						value={formData.type || "ONBOARDING"}
						onChange={(value) => handleSelectChange("type", value)}
						options={BOARDING_TYPE_OPTIONS}
						error={errors.type}
					/>

					{/* Role Selection */}
					<div className="space-y-2">
						<FormSelect
							label="Target Role"
							name="role"
							value={formData.role || ""}
							onChange={(value) => handleSelectChange("role", value)}
							options={ROLE_OPTIONS}
							error={errors.role}
							helpText="The role this boarding template applies to"
						/>
					</div>
				</div>

				<div className="space-y-4 pt-6 border-t">
					<div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
						<ShieldCheck className="h-4 w-4" />
						Settings & Visibility
					</div>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						{/* Is Default */}
						<div className="flex items-start gap-3 p-3 rounded-lg border bg-gray-50/50">
							<Checkbox
								id="isDefault"
								checked={formData.isDefault || false}
								onCheckedChange={(checked) =>
									handleCheckboxChange("isDefault", checked as boolean)
								}
								className="mt-1"
							/>
							<div className="space-y-1">
								<Label htmlFor="isDefault" className="font-medium cursor-pointer">
									Mark as Default
								</Label>
								<p className="text-xs text-gray-500 leading-relaxed">
									Primary template for the selected role and type
								</p>
							</div>
						</div>

						{/* Is Active */}
						<div className="flex items-start gap-3 p-3 rounded-lg border bg-gray-50/50">
							<Checkbox
								id="isActive"
								checked={formData.isActive !== undefined ? formData.isActive : true}
								onCheckedChange={(checked) =>
									handleCheckboxChange("isActive", checked as boolean)
								}
								className="mt-1"
							/>
							<div className="space-y-1">
								<Label htmlFor="isActive" className="font-medium cursor-pointer">
									Template Active
								</Label>
								<p className="text-xs text-gray-500 leading-relaxed">
									Make this template available for new processes
								</p>
							</div>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
