import { useState } from "react";
import type * as React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "~/components/atoms/DatePicker";
import { FormField } from "~/components/molecules/hr-public/form-field";
import { PhoneInputField } from "~/components/molecules/hr-public/phone-input-field";
import { FileUploadField } from "~/components/molecules/hr-public/file-upload-field";
import { useCreateApplicant } from "~/hooks/use-applicant";
import { useCreatePerson } from "~/lib/hooks/use-person";
import { ApplicationSuccess } from "../application-success";
import {
	RECRUITMENT_RESUME_ACCEPT,
	RECRUITMENT_RESUME_UPLOAD_COPY,
} from "~/lib/utils/document-file";
import { JobApplicationFormSchema } from "~/zod/job-application.zod";

interface ApplicationFormProps {
	jobId: string;
	jobTitle: string;
}

interface FormData {
	resume: File | null;
	firstName: string;
	lastName: string;
	email: string;
	phone: string;
	location: string;
	linkedinProfile: string;
	currentJobTitle: string;
	whyJoinTeam: string;
	challengingProject: string;
	expectedSalary: string;
	availabilityDate: string;
	requiresVisaSponsorship: boolean;
	additionalInfo: string;
}

type FormErrors = Partial<Record<keyof FormData, string>>;

const INITIAL_FORM: FormData = {
	resume: null,
	firstName: "",
	lastName: "",
	email: "",
	phone: "",
	location: "",
	linkedinProfile: "",
	currentJobTitle: "",
	whyJoinTeam: "",
	challengingProject: "",
	expectedSalary: "",
	availabilityDate: "",
	requiresVisaSponsorship: false,
	additionalInfo: "",
};

const visaCheckboxId = "requiresVisaSponsorship";
const getTodayDate = () => new Date().toISOString().split("T")[0];

const trimToUndefined = (value: string) => {
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
};

const parsePhone = (value: string) => {
	const match = value.trim().match(/^(\+\d+)\s*(.+)$/);
	if (!match) return null;

	const number = match[2].replace(/[^\d]/g, "");
	if (!number) return null;

	return {
		countryCode: match[1],
		number,
	};
};

const buildSubmissionDetails = (formData: FormData) => {
	const details: Record<string, string | boolean> = {};

	const location = trimToUndefined(formData.location);
	if (location) details.location = location;

	const currentJobTitle = trimToUndefined(formData.currentJobTitle);
	if (currentJobTitle) details.currentJobTitle = currentJobTitle;

	const whyJoinTeam = trimToUndefined(formData.whyJoinTeam);
	if (whyJoinTeam) details.whyJoinTeam = whyJoinTeam;

	const challengingProject = trimToUndefined(formData.challengingProject);
	if (challengingProject) details.challengingProject = challengingProject;

	if (formData.requiresVisaSponsorship) {
		details.requiresVisaSponsorship = true;
	}

	const additionalInfo = trimToUndefined(formData.additionalInfo);
	if (additionalInfo) details.additionalInfo = additionalInfo;

	return details;
};

const validateForm = (formData: FormData): FormErrors => {
	const parsed = JobApplicationFormSchema.safeParse(formData);
	if (parsed.success) return {};

	return parsed.error.issues.reduce<FormErrors>((nextErrors, issue) => {
		const field = issue.path[0] as keyof FormData | undefined;
		if (field && !nextErrors[field]) {
			nextErrors[field] = issue.message;
		}
		return nextErrors;
	}, {});
};

const applicantFieldMap: Record<string, keyof FormData> = {
	resume: "resume",
	personId: "firstName",
	jobId: "resume",
	portfolioUrl: "linkedinProfile",
	expectedSalary: "expectedSalary",
	availabilityDate: "availabilityDate",
	applicationSource: "resume",
	submissionDetails: "additionalInfo",
};

const personFieldMap: Record<string, keyof FormData> = {
	"personalInfo.firstName": "firstName",
	"personalInfo.lastName": "lastName",
	"contactInfo.email": "email",
	"contactInfo.phones": "phone",
	"contactInfo.phones[0].number": "phone",
	"contactInfo.phones[0].countryCode": "phone",
};

const applyServerValidationErrors = (
	error: any,
	map: Record<string, keyof FormData>,
	setErrors: React.Dispatch<React.SetStateAction<FormErrors>>,
) => {
	const serverErrors = error?.errors || error?.data?.errors;
	if (!Array.isArray(serverErrors)) return false;

	const nextErrors = serverErrors.reduce<FormErrors>((acc, item) => {
		const field = typeof item?.field === "string" ? map[item.field] : undefined;
		const message = typeof item?.message === "string" ? item.message : "";
		if (field && message && !acc[field]) {
			acc[field] = message;
		}
		return acc;
	}, {});

	if (Object.keys(nextErrors).length === 0) return false;
	setErrors((current) => ({ ...current, ...nextErrors }));
	return true;
};

const applyInputClass =
	"h-11 rounded-xl border-0 bg-[#faf6f3] shadow-none ring-1 ring-[#e8dede]/90 placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-[var(--theme-red)]/35";

const applyTextareaClass =
	"min-h-[5.5rem] rounded-xl border-0 bg-[#faf6f3] shadow-none ring-1 ring-[#e8dede]/90 placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-[var(--theme-red)]/35 resize-y";

const sectionLabelClass = "text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a8480]";

export function ApplicationForm({ jobId, jobTitle }: ApplicationFormProps) {
	const navigate = useNavigate();
	const { mutateAsync: createApplicant } = useCreateApplicant();
	const { mutateAsync: createPerson } = useCreatePerson();

	const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
	const [errors, setErrors] = useState<FormErrors>({});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isSuccess, setIsSuccess] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	const handleTextChange = (field: keyof FormData) => (value: string) => {
		setFormData((current) => ({ ...current, [field]: value }));
		setErrors((current) => ({ ...current, [field]: undefined }));
	};

	const handleFileChange = (file: File | null) => {
		setFormData((current) => ({ ...current, resume: file }));
		setErrors((current) => ({ ...current, resume: undefined }));
	};

	const handleCheckboxChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		setFormData((current) => ({
			...current,
			requiresVisaSponsorship: event.target.checked,
		}));
	};

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setSubmitError(null);

		const nextErrors = validateForm(formData);
		setErrors(nextErrors);

		if (Object.keys(nextErrors).length > 0) {
			return;
		}

		const parsedPhone = parsePhone(formData.phone);
		if (!parsedPhone) {
			setErrors((current) => ({ ...current, phone: "Enter a valid phone number." }));
			return;
		}

		setIsSubmitting(true);

		try {
			let personResponse;
			try {
				personResponse = await createPerson({
					personalInfo: {
						firstName: formData.firstName.trim(),
						lastName: formData.lastName.trim(),
						nationality: "Philippines",
						gender: "prefer_not_to_say",
					},
					contactInfo: {
						email: formData.email.trim(),
						phones: [
							{
								type: "mobile",
								countryCode: parsedPhone.countryCode,
								number: parsedPhone.number,
								isPrimary: true,
							},
						],
					},
				});
			} catch (error: any) {
				applyServerValidationErrors(error, personFieldMap, setErrors);
				throw error;
			}

			if (!personResponse?.person?.id) {
				throw new Error("Person record could not be created.");
			}

			const payload = new FormData();
			payload.append("personId", personResponse.person.id);
			payload.append("jobId", jobId);
			payload.append("appliedDate", new Date().toISOString());
			payload.append("applicationSource", "WEBSITE");
			payload.append("expectedSalary", String(Number(formData.expectedSalary)));
			payload.append("currency", "PHP");

			const portfolioUrl = trimToUndefined(formData.linkedinProfile);
			if (portfolioUrl) {
				payload.append("portfolioUrl", portfolioUrl);
			}

			if (formData.availabilityDate) {
				payload.append(
					"availabilityDate",
					new Date(formData.availabilityDate).toISOString(),
				);
			}

			if (formData.resume) {
				payload.append("resume", formData.resume);
			}

			const submissionDetails = buildSubmissionDetails(formData);
			if (Object.keys(submissionDetails).length > 0) {
				payload.append("submissionDetails", JSON.stringify(submissionDetails));
			}

			try {
				await createApplicant(payload);
			} catch (error: any) {
				applyServerValidationErrors(error, applicantFieldMap, setErrors);
				throw error;
			}
			setIsSuccess(true);
			setTimeout(() => {
				navigate("/jobs");
			}, 4000);
		} catch (error: any) {
			setSubmitError(error?.message || "Failed to submit the application. Please try again.");
		} finally {
			setIsSubmitting(false);
		}
	};

	if (isSuccess) {
		return <ApplicationSuccess ms={4} />;
	}

	return (
		<form onSubmit={handleSubmit} noValidate className="mx-auto w-full max-w-xl">
			{submitError && (
				<div className="mb-6 rounded-xl bg-red-50/95 px-4 py-3 text-sm text-red-900 ring-1 ring-red-100/90">
					<strong className="font-semibold">Unable to submit:</strong> {submitError}
				</div>
			)}

			<div className="space-y-9">
				<section className="space-y-3">
					<p className={sectionLabelClass}>Resume</p>
					<div>
						<Label className="mb-1.5 block text-[13px] font-medium text-neutral-700">
							Resume / CV <span className="text-red-500">*</span>
						</Label>
						<FileUploadField
							label=""
							id="resume"
							accept={RECRUITMENT_RESUME_ACCEPT}
							onFileChange={handleFileChange}
							error={errors.resume || null}
							helperText={RECRUITMENT_RESUME_UPLOAD_COPY}
							buttonText="Choose file or drag PDF, Word, or image here"
						/>
					</div>
				</section>

				<section className="space-y-4">
					<p className={sectionLabelClass}>Contact</p>
					<div className="grid gap-4 sm:grid-cols-2">
						<FormField
							label="First Name"
							id="firstName"
							value={formData.firstName}
							onChange={handleTextChange("firstName")}
							error={errors.firstName}
							placeholder="Juan"
							inputClassName={applyInputClass}
						/>
						<FormField
							label="Last Name"
							id="lastName"
							value={formData.lastName}
							onChange={handleTextChange("lastName")}
							error={errors.lastName}
							placeholder="Dela Cruz"
							inputClassName={applyInputClass}
						/>
					</div>

					<div className="grid gap-4 sm:grid-cols-2">
						<FormField
							label="Email Address"
							id="email"
							value={formData.email}
							onChange={handleTextChange("email")}
							error={errors.email}
							placeholder="name@example.com"
							inputClassName={applyInputClass}
						/>
						<PhoneInputField
							label="Phone Number"
							id="phone"
							value={formData.phone}
							onChange={handleTextChange("phone")}
							error={errors.phone || null}
							placeholder="912 345 6789"
						/>
					</div>

					<div className="grid gap-4 sm:grid-cols-2">
						<FormField
							label="Current Location"
							id="location"
							value={formData.location}
							onChange={handleTextChange("location")}
							placeholder="Quezon City, Metro Manila"
							inputClassName={applyInputClass}
						/>
						<FormField
							label="Current Job Title"
							id="currentJobTitle"
							value={formData.currentJobTitle}
							onChange={handleTextChange("currentJobTitle")}
							placeholder="Frontend Developer"
							inputClassName={applyInputClass}
						/>
					</div>

					<FormField
						label="LinkedIn or Portfolio URL"
						id="linkedinProfile"
						value={formData.linkedinProfile}
						onChange={handleTextChange("linkedinProfile")}
						error={errors.linkedinProfile}
						placeholder="https://linkedin.com/in/your-name"
						inputClassName={applyInputClass}
					/>
				</section>

				<section className="space-y-4">
					<p className={sectionLabelClass}>Role & availability</p>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-1.5">
							<Label
								htmlFor="expectedSalary"
								className="text-[13px] font-medium text-neutral-700">
								Expected Salary <span className="text-red-500">*</span>
							</Label>
							<div className="relative">
								<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-neutral-500">
									PHP
								</span>
								<Input
									id="expectedSalary"
									type="text"
									inputMode="decimal"
									value={formData.expectedSalary}
									onChange={(event) =>
										handleTextChange("expectedSalary")(event.target.value)
									}
									className={`pl-14 ${applyInputClass} ${
										errors.expectedSalary ? "ring-red-300" : ""
									}`}
									placeholder="35000"
								/>
							</div>
							{errors.expectedSalary && (
								<p className="text-sm text-red-600">{errors.expectedSalary}</p>
							)}
						</div>

						<div className="space-y-1.5">
							<Label
								htmlFor="availabilityDate"
								className="text-[13px] font-medium text-neutral-700">
								Availability Date
							</Label>
							<DatePicker
								value={formData.availabilityDate}
								onChange={handleTextChange("availabilityDate")}
								placeholder="MM/DD/YYYY"
								className={
									errors.availabilityDate
										? `${applyInputClass} ring-red-300`
										: applyInputClass
								}
								minDate={getTodayDate()}
							/>
							{errors.availabilityDate && (
								<p className="text-sm text-red-600">{errors.availabilityDate}</p>
							)}
						</div>
					</div>
				</section>

				<section className="space-y-4">
					<p className={sectionLabelClass}>About you</p>
					<div className="space-y-4">
						<div className="space-y-1.5">
							<Label
								htmlFor="whyJoinTeam"
								className="text-[13px] font-medium text-neutral-700">
								Why do you want to join {jobTitle}?
							</Label>
							<Textarea
								id="whyJoinTeam"
								value={formData.whyJoinTeam}
								onChange={(event) =>
									handleTextChange("whyJoinTeam")(event.target.value)
								}
								placeholder="Share what draws you to this role…"
								className={applyTextareaClass}
							/>
						</div>

						<div className="space-y-1.5">
							<Label
								htmlFor="challengingProject"
								className="text-[13px] font-medium text-neutral-700">
								Describe a challenging project you handled
							</Label>
							<Textarea
								id="challengingProject"
								value={formData.challengingProject}
								onChange={(event) =>
									handleTextChange("challengingProject")(event.target.value)
								}
								placeholder="Brief context, your role, and the outcome…"
								className={applyTextareaClass}
							/>
						</div>

						<label
							htmlFor={visaCheckboxId}
							className="flex cursor-pointer items-start gap-3 rounded-xl bg-[#faf6f3] px-3.5 py-3 ring-1 ring-[#e8dede]/70 transition-colors hover:bg-[#f5f0eb]">
							<input
								id={visaCheckboxId}
								type="checkbox"
								className="mt-0.5 h-4 w-4 rounded border-0 text-[var(--theme-red)] shadow-none ring-1 ring-[#d4cbc4] focus:ring-[var(--theme-red)]"
								checked={formData.requiresVisaSponsorship}
								onChange={handleCheckboxChange}
							/>
							<span className="text-sm leading-snug text-neutral-700">
								I require visa sponsorship.
							</span>
						</label>

						<div className="space-y-1.5">
							<Label
								htmlFor="additionalInfo"
								className="text-[13px] font-medium text-neutral-700">
								Additional Information
							</Label>
							<Textarea
								id="additionalInfo"
								value={formData.additionalInfo}
								onChange={(event) =>
									handleTextChange("additionalInfo")(event.target.value)
								}
								placeholder="Anything else we should know…"
								className={applyTextareaClass}
							/>
						</div>
					</div>
				</section>

				<div className="flex flex-col gap-3 border-t border-[#ece6e2]/90 pt-6 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-xs text-neutral-500">Fields marked with * are required.</p>
					<Button
						type="submit"
						disabled={isSubmitting}
						className="rounded-full bg-[var(--theme-red)] px-8 text-white shadow-sm hover:bg-[#bf0012] disabled:opacity-70">
						{isSubmitting ? "Submitting application…" : "Submit application"}
					</Button>
				</div>
			</div>
		</form>
	);
}
