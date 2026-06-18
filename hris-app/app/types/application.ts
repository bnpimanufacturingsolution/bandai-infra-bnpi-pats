export type ApplicationStatus =
	| "DISCOVERED"
	| "APPLICATION_SUBMITTED"
	| "INITIAL_SCREENING"
	| "PHONE_INTERVIEW"
	| "TECHNICAL_ASSESSMENT"
	| "ONSITE_INTERVIEW"
	| "FINAL_REVIEW"
	| "OFFER_EXTENDED"
	| "OFFER_ACCEPTED"
	| "OFFER_DECLINED"
	| "HIRED"
	| "REJECTED"
	| "WITHDRAWN";

export interface Application {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
	phone: string;
	position: string;
	resume: string;
	coverLetter: string;
	status: ApplicationStatus;
	createdAt: string;
	updatedAt: string;
	notes: string;
}

export const STATUS_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
	DISCOVERED: ["APPLICATION_SUBMITTED"],
	APPLICATION_SUBMITTED: ["INITIAL_SCREENING", "WITHDRAWN"],
	INITIAL_SCREENING: ["PHONE_INTERVIEW", "REJECTED"],
	PHONE_INTERVIEW: ["TECHNICAL_ASSESSMENT", "REJECTED"],
	TECHNICAL_ASSESSMENT: ["ONSITE_INTERVIEW", "REJECTED"],
	ONSITE_INTERVIEW: ["FINAL_REVIEW", "REJECTED"],
	FINAL_REVIEW: ["OFFER_EXTENDED", "REJECTED"],
	OFFER_EXTENDED: ["OFFER_ACCEPTED", "OFFER_DECLINED", "REJECTED"],
	OFFER_ACCEPTED: ["HIRED"],
	OFFER_DECLINED: [],
	HIRED: [],
	REJECTED: [],
	WITHDRAWN: [],
};

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
	DISCOVERED: "Discovered",
	APPLICATION_SUBMITTED: "Application Submitted",
	INITIAL_SCREENING: "Initial Screening",
	PHONE_INTERVIEW: "Phone Interview",
	TECHNICAL_ASSESSMENT: "Technical Assessment",
	ONSITE_INTERVIEW: "On-Site Interview",
	FINAL_REVIEW: "Final Review",
	OFFER_EXTENDED: "Offer Extended",
	OFFER_ACCEPTED: "Offer Accepted",
	OFFER_DECLINED: "Offer Declined",
	HIRED: "Hired",
	REJECTED: "Rejected",
	WITHDRAWN: "Withdrawn",
};

export const STATUS_COLORS: Record<ApplicationStatus, string> = {
	DISCOVERED: "bg-slate-100 text-slate-800 border-slate-300",
	APPLICATION_SUBMITTED: "bg-blue-100 text-blue-800 border-blue-300",
	INITIAL_SCREENING: "bg-cyan-100 text-cyan-800 border-cyan-300",
	PHONE_INTERVIEW: "bg-sky-100 text-sky-800 border-sky-300",
	TECHNICAL_ASSESSMENT: "bg-indigo-100 text-indigo-800 border-indigo-300",
	ONSITE_INTERVIEW: "bg-blue-100 text-blue-900 border-blue-300",
	FINAL_REVIEW: "bg-amber-100 text-amber-800 border-amber-300",
	OFFER_EXTENDED: "bg-orange-100 text-orange-800 border-orange-300",
	OFFER_ACCEPTED: "bg-lime-100 text-lime-800 border-lime-300",
	OFFER_DECLINED: "bg-gray-100 text-gray-800 border-gray-300",
	HIRED: "bg-emerald-100 text-emerald-800 border-emerald-300",
	REJECTED: "bg-red-100 text-red-800 border-red-300",
	WITHDRAWN: "bg-stone-100 text-stone-800 border-stone-300",
};

export type ApplicantStatus =
	| "new"
	| "reviewing"
	| "for_interview"
	| "interview"
	| "rejected"
	| "accepted"
	| "completed"
	| "hired";

// UI Applicant interface for Kanban Board
export interface Applicant {
	id: string;
	applicantNumber?: string;
	firstName: string;
	middleName?: string;
	lastName: string;
	name: string; // Combined full name for backward compatibility
	email: string;
	position: string | { id?: string; title: string; [key: string]: any };
	status: ApplicantStatus;
	recruiter: string;
	appliedDate: Date;
	lastUpdated: Date;
	rejectionReason?: string;
	rejectionFeedback?: string;
	skillCheckResult?: "passed" | "failed" | "pending";
	interviewRounds?: number;
	offerStatus?: "pending" | "accepted" | "declined" | "negotiating";
	documents?: Array<{
		type: string;
		name: string;
		url: string;
		uploadedAt?: Date;
		size?: number;
	}>;
	interviews?: Array<{
		scheduledDate?: Date;
		scheduledTime?: string;
		location?: string;
		interviewType?: string;
		status?: string;
		notes?: string;
	}>;
	assignedHrId?: string;
	hr?: {
		id: string;
		person?: {
			personalInfo: {
				firstName: string;
				lastName: string;
			};
			contactInfo?: {
				email?: string;
			};
		};
	};
	assignedHr?: {
		id: string;
		person?: {
			personalInfo: {
				firstName: string;
				lastName: string;
			};
			contactInfo?: {
				email?: string;
			};
		};
	};
	notes?: Array<{
		note: string;
		createdAt: Date;
		isInternal: boolean;
	}>;
}

export interface KanbanColumn {
	id: ApplicantStatus;
	title: string;
	description: string;
}

export const KANBAN_COLUMNS: KanbanColumn[] = [
	{
		id: "new",
		title: "New",
		description: "New applications awaiting review",
	},
	{
		id: "reviewing",
		title: "Reviewing",
		description: "Evaluating HR assignment and basic qualifications",
	},
	{
		id: "for_interview",
		title: "For Interview",
		description: "Ready for interview scheduling",
	},
	{
		id: "interview",
		title: "Interview Stage",
		description: "Actively undergoing the interview process",
	},
	{
		id: "rejected",
		title: "Rejected",
		description: "Unsuccessful applications",
	},
	{
		id: "accepted",
		title: "Accepted Stage",
		description: "Offer accepted, pending onboarding and contract",
	},
	{
		id: "hired",
		title: "Hired",
		description: "Successfully hired and onboarded",
	},
];
