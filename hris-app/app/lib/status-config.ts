import { Circle } from "lucide-react";
import type { ApplicantStatus } from "~/types/application";
import type { priority } from "~/types/priority";

export const getStatusConfig = (status: ApplicantStatus) => {
	const labels: Record<ApplicantStatus, string> = {
		new: "New",
		reviewing: "Reviewing",
		for_interview: "For Interview",
		interview: "Interview Stage",
		rejected: "Rejected",
		accepted: "Accepted Stage",
		completed: "Completed",
		hired: "Hired",
	};

	const classNames: Record<ApplicantStatus, string> = {
		new: "bg-blue-50 text-blue-700 border-blue-200",
		reviewing: "bg-cyan-50 text-cyan-700 border-cyan-200",
		for_interview: "bg-indigo-50 text-indigo-700 border-indigo-200",
		interview: "bg-purple-50 text-purple-700 border-purple-200",
		rejected: "bg-red-50 text-red-700 border-red-200",
		accepted: "bg-orange-50 text-orange-700 border-orange-200",
		completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
		hired: "bg-green-50 text-green-700 border-green-200",
	};

	return {
		label: labels[status] || "Unknown",
		status,
		icon: Circle,
		className: classNames[status] || "bg-gray-50 text-gray-700 border-gray-200",
	};
};

export const getPriorityStyle = (p: typeof priority) => {
	return p.toLowerCase();
};
