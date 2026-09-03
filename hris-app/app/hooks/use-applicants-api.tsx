import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Applicant as ApiApplicant } from "~/zod/applicant";
import type { Applicant, ApplicantStatus } from "~/types/application";
import { useGetApplicants } from "./use-applicant";
import applicantService from "~/services/applicant.service";

type ApplicantsResponse = {
	data?: ApiApplicant[];
	applicants?: ApiApplicant[];
	total?: number;
	page?: number;
	limit?: number;
};

const mapWorkflowStateToKanbanStatus = (workflowState?: string | null): ApplicantStatus => {
	switch (String(workflowState || "").toUpperCase()) {
		case "SCREENING":
			return "reviewing";
		case "INTERVIEW_SCHEDULING":
			return "for_interview";
		case "INTERVIEW":
			return "interview";
		case "OFFER_APPROVAL":
		case "OFFER_SENT":
			return "accepted";
		case "ONBOARDING_READY":
			return "completed";
		case "HIRED":
			return "hired";
		case "REJECTED":
			return "rejected";
		case "APPLIED":
		default:
			return "new";
	}
};

const mapKanbanStatusToWorkflowState = (status: ApplicantStatus): string => {
	switch (status) {
		case "reviewing":
			return "SCREENING";
		case "for_interview":
			return "INTERVIEW_SCHEDULING";
		case "interview":
			return "INTERVIEW";
		case "accepted":
			return "OFFER_SENT";
		case "completed":
			return "ONBOARDING_READY";
		case "hired":
			return "HIRED";
		case "rejected":
			return "REJECTED";
		case "new":
		default:
			return "APPLIED";
	}
};

const transformApiApplicant = (apiApplicant: any): Applicant => {
	const personalInfo = apiApplicant.person?.personalInfo;
	const contactInfo = apiApplicant.person?.contactInfo;
	const firstName = personalInfo?.firstName || "Unknown";
	const middleName = personalInfo?.middleName || "";
	const lastName = personalInfo?.lastName || "";
	const name = [firstName, middleName, lastName].filter(Boolean).join(" ").trim() || "Unknown";
	const email = contactInfo?.email || "No email";
	const position =
		apiApplicant.job?.position?.title ||
		apiApplicant.position?.title ||
		apiApplicant.position?.name ||
		"Position not specified";
	const attachments = Array.isArray(apiApplicant.attachments) ? apiApplicant.attachments : [];
	const activities = Array.isArray(apiApplicant.activities) ? apiApplicant.activities : [];
	const rejectionActivity = activities.find(
		(activity: any) => String(activity?.type || "").toUpperCase() === "REJECTION",
	);

	return {
		id: apiApplicant.id,
		applicantNumber: apiApplicant.applicantId || undefined,
		firstName,
		middleName: middleName || undefined,
		lastName,
		name,
		email,
		position,
		status: mapWorkflowStateToKanbanStatus(apiApplicant.currentWorkflowStateKey),
		recruiter: "Workflow Driven",
		appliedDate: new Date(apiApplicant.appliedDate),
		lastUpdated: new Date(apiApplicant.updatedAt),
		rejectionReason:
			typeof rejectionActivity?.details?.reason === "string"
				? rejectionActivity.details.reason
				: undefined,
		documents: attachments.map((attachment: any) => ({
			type: attachment.type,
			name: attachment.name,
			url: attachment.url,
			uploadedAt: attachment.uploadedAt ? new Date(attachment.uploadedAt) : undefined,
			size: attachment.size || undefined,
		})),
	};
};

const runWorkflowTransition = async (
	applicantId: string,
	status: ApplicantStatus,
	extra?: Record<string, unknown>,
) => {
	const targetStateKey = mapKanbanStatusToWorkflowState(status);
	const action =
		status === "accepted" ? "SEND_OFFER" : status === "hired" ? "MARK_HIRED" : "ADVANCE";

	return applicantService.runAction(applicantId, {
		action,
		targetStateKey,
		metadata: extra,
	});
};

export const useApplicants = () => {
	const {
		data: applicantsData,
		isLoading,
		error,
	} = useGetApplicants({
		limit: 1000,
		filter: { isDeleted: false },
		fields: "organizationId,applicantId,person.personalInfo,person.contactInfo,job.position.title,position.title,appliedDate,currentWorkflowStateKey,updatedAt,attachments.type,attachments.name,attachments.url,attachments.uploadedAt,attachments.size,activities.type,activities.details",
	});

	const queryClient = useQueryClient();
	const actionMutation = useMutation({
		mutationFn: async ({
			applicantId,
			status,
			extra,
		}: {
			applicantId: string;
			status: ApplicantStatus;
			extra?: Record<string, unknown>;
		}) => runWorkflowTransition(applicantId, status, extra),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["applicants"] });
			queryClient.invalidateQueries({ queryKey: ["applicant-by-id", variables.applicantId] });
		},
	});

	const applicants = useMemo<Applicant[]>(() => {
		if (!applicantsData) return [];

		const response = applicantsData as unknown as ApplicantsResponse;
		if (response.data && Array.isArray(response.data)) {
			return response.data.map(transformApiApplicant);
		}
		if (response.applicants && Array.isArray(response.applicants)) {
			return response.applicants.map(transformApiApplicant);
		}
		if (Array.isArray(applicantsData)) {
			return (applicantsData as unknown as ApiApplicant[]).map(transformApiApplicant);
		}
		return [];
	}, [applicantsData]);

	const getApplicantsByStatus = (status: ApplicantStatus): Applicant[] =>
		applicants.filter((applicant) => applicant.status === status);

	const moveApplicant = (applicantId: string, newStatus: ApplicantStatus) => {
		actionMutation.mutate({ applicantId, status: newStatus });
	};

	const rejectApplicant = (applicantId: string, reason: string, feedback: string) => {
		actionMutation.mutate({
			applicantId,
			status: "rejected",
			extra: { reason, feedback },
		});
	};

	const assignHR = (applicantId: string, assignedHrId: string) => {
		applicantService
			.runAction(applicantId, {
				action: "ASSIGN_RECRUITER",
				metadata: { assignedEmployeeId: assignedHrId },
			})
			.finally(() => {
				queryClient.invalidateQueries({ queryKey: ["applicants"] });
				queryClient.invalidateQueries({ queryKey: ["applicant-by-id", applicantId] });
			});
	};

	const scheduleInterview = (applicantId: string, interviewDetails: any) => {
		applicantService
			.runAction(applicantId, {
				action: "SCHEDULE_INTERVIEW",
				metadata: interviewDetails,
			})
			.finally(() => {
				queryClient.invalidateQueries({ queryKey: ["applicants"] });
				queryClient.invalidateQueries({ queryKey: ["applicant-by-id", applicantId] });
			});
	};

	const uploadContract = (applicantId: string) => {
		applicantService
			.runAction(applicantId, {
				action: "MARK_ONBOARDING_READY",
			})
			.finally(() => {
				queryClient.invalidateQueries({ queryKey: ["applicants"] });
				queryClient.invalidateQueries({ queryKey: ["applicant-by-id", applicantId] });
			});
	};

	return {
		applicants,
		isLoading,
		error,
		getApplicantsByStatus,
		moveApplicant,
		rejectApplicant,
		assignHR,
		scheduleInterview,
		uploadContract,
	};
};
