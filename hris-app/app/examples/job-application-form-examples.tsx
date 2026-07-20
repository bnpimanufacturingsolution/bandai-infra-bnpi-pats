// @ts-nocheck
/**
 * Real-World Usage Examples for Job Application Form Builder
 *
 * This file demonstrates various real-world scenarios and implementations
 */

import { JobApplicationFormBuilder } from "~/components/templates/job-application-form-builder";
import { createJobApplicationConfig } from "~/config/job-application-form.config";
import type { JobApplicationFormConfig, FormFieldValue } from "~/types/job-application-form.types";

// ==================== Example 1: Basic Job Application ====================

export function BasicJobApplication() {
	const config = createJobApplicationConfig({
		title: "Software Engineer - Apply Now",
		description: "Join our engineering team and build amazing products",
	});

	const handleSubmit = async (values: Record<string, FormFieldValue>) => {
		const response = await fetch("/api/applications", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(values),
		});

		if (!response.ok) throw new Error("Submission failed");
	};

	return (
		<JobApplicationFormBuilder
			config={config}
			onSubmit={handleSubmit}
			organizationName="Tech Company Inc."
		/>
	);
}

// ==================== Example 2: Remote Position Application ====================

export function RemoteJobApplication() {
	const config: JobApplicationFormConfig = {
		id: "remote-position",
		title: "Remote Developer Position",
		description: "Work from anywhere in the world",
		submitButtonText: "Submit Remote Application",
		sections: [
			{
				id: "resume",
				title: "📄 Resume Upload",
				fields: [
					{
						id: "resume",
						name: "resume",
						label: "Resume/CV",
						type: "file",
						required: true,
						accept: ".pdf",
						maxSize: 5,
						allowedExtensions: ["pdf"],
					},
				],
			},
			{
				id: "contact",
				title: "📧 Contact Information",
				fields: [
					{
						id: "fullName",
						name: "fullName",
						label: "Full Name",
						type: "text",
						required: true,
					},
					{
						id: "email",
						name: "email",
						label: "Email Address",
						type: "email",
						required: true,
					},
					{
						id: "timezone",
						name: "timezone",
						label: "Timezone",
						type: "select",
						required: true,
						options: [
							{ value: "UTC-8", label: "Pacific Time (UTC-8)" },
							{ value: "UTC-5", label: "Eastern Time (UTC-5)" },
							{ value: "UTC+0", label: "UTC/GMT" },
							{ value: "UTC+1", label: "Central European (UTC+1)" },
							{ value: "UTC+8", label: "Singapore/Manila (UTC+8)" },
						],
					},
				],
			},
			{
				id: "remote-experience",
				title: "🌍 Remote Work Experience",
				fields: [
					{
						id: "remoteExperience",
						name: "remoteExperience",
						label: "Do you have remote work experience?",
						type: "radio",
						required: true,
						options: [
							{
								value: "yes",
								label: "Yes, I have worked remotely before",
								description: "I'm comfortable with remote collaboration",
							},
							{
								value: "no",
								label: "No, but I'm eager to learn",
								description: "This would be my first remote position",
							},
						],
					},
					{
						id: "homeOfficeSetup",
						name: "homeOfficeSetup",
						label: "Describe your home office setup",
						type: "textarea",
						required: true,
						rows: 4,
						placeholder:
							"e.g., Dedicated workspace, high-speed internet, noise-cancelling headphones...",
					},
				],
			},
		],
	};

	return <JobApplicationFormBuilder config={config} onSubmit={async (values) => {}} />;
}

// ==================== Example 3: Internship Application ====================

export function InternshipApplication() {
	const config: JobApplicationFormConfig = {
		id: "internship",
		title: "Summer Internship 2026",
		description: "Gain hands-on experience in a fast-paced environment",
		submitButtonText: "Apply for Internship",
		sections: [
			{
				id: "student-info",
				title: "🎓 Student Information",
				fields: [
					{
						id: "fullName",
						name: "fullName",
						label: "Full Name",
						type: "text",
						required: true,
					},
					{
						id: "email",
						name: "email",
						label: "Email",
						type: "email",
						required: true,
					},
					{
						id: "university",
						name: "university",
						label: "University/College",
						type: "text",
						required: true,
					},
					{
						id: "major",
						name: "major",
						label: "Major/Field of Study",
						type: "text",
						required: true,
					},
					{
						id: "graduationYear",
						name: "graduationYear",
						label: "Expected Graduation Year",
						type: "select",
						required: true,
						options: [
							{ value: "2026", label: "2026" },
							{ value: "2027", label: "2027" },
							{ value: "2028", label: "2028" },
							{ value: "2029", label: "2029" },
						],
					},
					{
						id: "gpa",
						name: "gpa",
						label: "Current GPA",
						type: "number",
						required: false,
						min: 0,
						max: 4,
						step: 0.01,
						placeholder: "3.5",
					},
				],
			},
			{
				id: "availability",
				title: "📅 Availability",
				fields: [
					{
						id: "internshipDuration",
						name: "internshipDuration",
						label: "Preferred Internship Duration",
						type: "radio",
						required: true,
						options: [
							{ value: "8-weeks", label: "8 weeks" },
							{ value: "12-weeks", label: "12 weeks" },
							{ value: "16-weeks", label: "16 weeks" },
							{ value: "flexible", label: "Flexible" },
						],
					},
					{
						id: "startDate",
						name: "startDate",
						label: "Preferred Start Date",
						type: "date",
						required: true,
						minDate: new Date(),
					},
				],
			},
		],
	};

	return <JobApplicationFormBuilder config={config} onSubmit={async (values) => {}} />;
}

// ==================== Example 4: Executive Position Application ====================

export function ExecutiveJobApplication() {
	const config: JobApplicationFormConfig = {
		id: "executive-role",
		title: "Chief Technology Officer",
		description: "Lead our technology vision and engineering organization",
		submitButtonText: "Submit Executive Application",
		sections: [
			{
				id: "documents",
				title: "📑 Required Documents",
				fields: [
					{
						id: "resume",
						name: "resume",
						label: "Executive Resume/CV",
						type: "file",
						required: true,
						accept: ".pdf",
						maxSize: 10,
						allowedExtensions: ["pdf"],
					},
					{
						id: "coverLetter",
						name: "coverLetter",
						label: "Cover Letter",
						type: "file",
						required: true,
						accept: ".pdf",
						maxSize: 5,
						allowedExtensions: ["pdf"],
					},
				],
			},
			{
				id: "contact",
				title: "Contact & Professional Info",
				fields: [
					{
						id: "fullName",
						name: "fullName",
						label: "Full Name",
						type: "text",
						required: true,
					},
					{
						id: "email",
						name: "email",
						label: "Email",
						type: "email",
						required: true,
					},
					{
						id: "phone",
						name: "phone",
						label: "Phone",
						type: "tel",
						required: true,
					},
					{
						id: "linkedIn",
						name: "linkedIn",
						label: "LinkedIn Profile",
						type: "url",
						required: true,
						placeholder: "https://linkedin.com/in/yourprofile",
					},
				],
			},
			{
				id: "leadership",
				title: "Leadership Experience",
				fields: [
					{
						id: "yearsInLeadership",
						name: "yearsInLeadership",
						label: "Years in Executive Leadership",
						type: "select",
						required: true,
						options: [
							{ value: "5-10", label: "5-10 years" },
							{ value: "10-15", label: "10-15 years" },
							{ value: "15-20", label: "15-20 years" },
							{ value: "20+", label: "20+ years" },
						],
					},
					{
						id: "teamSize",
						name: "teamSize",
						label: "Largest Team You've Led",
						type: "select",
						required: true,
						options: [
							{ value: "10-50", label: "10-50 people" },
							{ value: "50-100", label: "50-100 people" },
							{ value: "100-500", label: "100-500 people" },
							{ value: "500+", label: "500+ people" },
						],
					},
					{
						id: "leadershipPhilosophy",
						name: "leadershipPhilosophy",
						label: "Describe your leadership philosophy",
						type: "textarea",
						required: true,
						rows: 6,
						maxLength: 1500,
					},
					{
						id: "technicalVision",
						name: "technicalVision",
						label: "Describe your technical vision for our company",
						type: "textarea",
						required: true,
						rows: 6,
						maxLength: 1500,
					},
				],
			},
			{
				id: "references",
				title: "Professional References",
				collapsible: true,
				fields: [
					{
						id: "referencesAvailable",
						name: "referencesAvailable",
						label: "I can provide executive-level references",
						type: "checkbox",
						required: true,
						description:
							"References will be requested at a later stage of the interview process",
					},
				],
			},
		],
		privacyPolicyUrl: "https://example.com/privacy",
		termsOfServiceUrl: "https://example.com/terms",
	};

	return <JobApplicationFormBuilder config={config} onSubmit={async (values) => {}} />;
}

// ==================== Example 5: Multi-Language Support ====================

export function MultiLanguageJobApplication({ language = "en" }: { language?: "en" | "es" }) {
	const translations = {
		en: {
			title: "Job Application",
			resume: "Resume/CV",
			firstName: "First Name",
			lastName: "Last Name",
			submit: "Submit Application",
		},
		es: {
			title: "Solicitud de Empleo",
			resume: "Currículum",
			firstName: "Nombre",
			lastName: "Apellido",
			submit: "Enviar Solicitud",
		},
	};

	const t = translations[language];

	const config: JobApplicationFormConfig = {
		id: `job-app-${language}`,
		title: t.title,
		submitButtonText: t.submit,
		sections: [
			{
				id: "resume",
				title: t.resume,
				fields: [
					{
						id: "resume",
						name: "resume",
						label: t.resume,
						type: "file",
						required: true,
					},
				],
			},
			{
				id: "personal",
				title: "Personal Information",
				fields: [
					{
						id: "firstName",
						name: "firstName",
						label: t.firstName,
						type: "text",
						required: true,
					},
					{
						id: "lastName",
						name: "lastName",
						label: t.lastName,
						type: "text",
						required: true,
					},
				],
			},
		],
	};

	return <JobApplicationFormBuilder config={config} onSubmit={async (values) => {}} />;
}

// ==================== Example 6: Integration with Backend API ====================

export function JobApplicationWithAPI({ positionId }: { positionId: string }) {
	const handleSubmit = async (values: Record<string, FormFieldValue>) => {
		try {
			// Step 1: Upload file if exists
			let resumeUrl = null;
			if (values.resume instanceof File) {
				const fileData = new FormData();
				fileData.append("file", values.resume);
				fileData.append("positionId", positionId);

				const uploadResponse = await fetch("/api/upload/resume", {
					method: "POST",
					body: fileData,
				});

				if (!uploadResponse.ok) {
					throw new Error("File upload failed");
				}

				const { url } = await uploadResponse.json();
				resumeUrl = url;
			}

			// Step 2: Submit application data
			const applicationData = {
				...values,
				resume: resumeUrl, // Replace File object with URL
				positionId,
				appliedAt: new Date().toISOString(),
			};

			delete applicationData.resume; // Remove file object

			const response = await fetch("/api/applications", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(applicationData),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.message || "Submission failed");
			}

			const result = await response.json();

			// Step 3: Send confirmation email (backend handles this)
			await fetch("/api/applications/send-confirmation", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					applicationId: result.id,
					email: values.email,
				}),
			});

			return result;
		} catch (error) {
			console.error("Application submission error:", error);
			throw error;
		}
	};

	return (
		<JobApplicationFormBuilder config={createJobApplicationConfig()} onSubmit={handleSubmit} />
	);
}
