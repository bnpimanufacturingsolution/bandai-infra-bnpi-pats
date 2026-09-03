/**
 * Interview Scheduling Types
 * Defines all TypeScript interfaces for the Interview Scheduling page
 */

export type InterviewType = "HR" | "Technical" | "Panel" | "Final";
export type InterviewMode = "Online" | "Onsite" | "Hybrid";
export type ScheduleStatus = "pending" | "confirmed" | "rescheduled" | "cancelled";

export interface Interviewer {
	id: string;
	name: string;
	role: string;
	avatarUrl?: string;
}

export interface InterviewDetails {
	candidateName: string;
	positionTitle: string;
	interviewType: InterviewType;
	interviewMode: InterviewMode;
	estimatedDuration: number; // in minutes
	interviewers?: Interviewer[];
	applicationRefId: string;
	location?: string;
	meetingLink?: string;
}

export interface TimeSlot {
	id: string;
	startTime: string; // ISO 8601 format
	endTime: string;
	isAvailable: boolean;
}

export interface AvailableDate {
	date: string; // YYYY-MM-DD format
	slots: TimeSlot[];
}

export interface ScheduleSelection {
	selectedDate: string | null;
	selectedSlot: TimeSlot | null;
	notes?: string;
	accessibilityRequests?: string;
}

export interface RescheduleRequest {
	reason: string;
	additionalNotes?: string;
}

export type RescheduleReason =
	| "conflict_with_other_commitment"
	| "medical_emergency"
	| "travel_issues"
	| "technical_issues"
	| "personal_emergency"
	| "other";

export const RESCHEDULE_REASON_LABELS: Record<RescheduleReason, string> = {
	conflict_with_other_commitment: "Conflict with other commitment",
	medical_emergency: "Medical emergency",
	travel_issues: "Travel/Transportation issues",
	technical_issues: "Technical issues",
	personal_emergency: "Personal emergency",
	other: "Other reason",
};

export interface ConfirmationResult {
	success: boolean;
	confirmationId?: string;
	scheduledDateTime?: string;
	errorMessage?: string;
}
