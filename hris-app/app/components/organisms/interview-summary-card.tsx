import { Text } from "@/components/atoms/Text";

import type { InterviewDetails } from "@/types/interview";
import { User, Briefcase, Video, Clock, Users, Hash } from "lucide-react";
import { InfoRow } from "../molecules/info-row";
import {
	getInterviewModeBadgeVariant,
	getInterviewTypeBadgeVariant,
	StatusBadge,
} from "../atoms/status-badge";

interface InterviewSummaryCardProps {
	details: InterviewDetails;
}

export const InterviewSummaryCard = ({ details }: InterviewSummaryCardProps) => {
	const formatDuration = (minutes: number): string => {
		if (minutes < 60) return `${minutes} minutes`;
		const hours = Math.floor(minutes / 60);
		const remainingMinutes = minutes % 60;
		return remainingMinutes > 0
			? `${hours}h ${remainingMinutes}m`
			: `${hours} hour${hours > 1 ? "s" : ""}`;
	};

	return (
		<section
			aria-labelledby="interview-summary-heading"
			className="card-elevated p-6 animate-fade-in">
			<div className="flex items-center gap-3 mb-6">
				<div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
					<Briefcase className="h-5 w-5 text-primary" />
				</div>
				<div>
					<Text as="h2" id="interview-summary-heading">
						Interview Details
					</Text>
					<Text variant="caption">Review your upcoming interview information</Text>
				</div>
			</div>

			<div className="divide-y divide-border">
				<InfoRow
					label="Candidate Name"
					value={
						<div className="flex items-center gap-2">
							<User className="h-4 w-4 text-muted-foreground" />
							{details.candidateName}
						</div>
					}
				/>

				<InfoRow
					label="Position"
					value={
						<div className="flex items-center gap-2">
							<Briefcase className="h-4 w-4 text-muted-foreground" />
							{details.positionTitle}
						</div>
					}
				/>

				<InfoRow
					label="Interview Type"
					value={
						<StatusBadge variant={getInterviewTypeBadgeVariant(details.interviewType)}>
							{details.interviewType} Interview
						</StatusBadge>
					}
				/>

				<InfoRow
					label="Interview Mode"
					value={
						<div className="flex items-center gap-2">
							<StatusBadge
								variant={getInterviewModeBadgeVariant(details.interviewMode)}>
								<Video className="h-3 w-3 mr-1" />
								{details.interviewMode}
							</StatusBadge>
						</div>
					}
				/>

				<InfoRow
					label="Duration"
					value={
						<div className="flex items-center gap-2">
							<Clock className="h-4 w-4 text-muted-foreground" />
							{formatDuration(details.estimatedDuration)}
						</div>
					}
				/>

				{details.interviewers && details.interviewers.length > 0 && (
					<InfoRow
						label="Interviewer(s)"
						value={
							<div className="flex flex-col gap-1">
								{details.interviewers.map((interviewer) => (
									<div key={interviewer.id} className="flex items-center gap-2">
										<Users className="h-4 w-4 text-muted-foreground" />
										<span>{interviewer.name}</span>
										<span className="text-muted-foreground text-sm">
											({interviewer.role})
										</span>
									</div>
								))}
							</div>
						}
					/>
				)}

				<InfoRow
					label="Reference ID"
					value={
						<div className="flex items-center gap-2">
							<Hash className="h-4 w-4 text-muted-foreground" />
							<code className="text-sm bg-muted px-2 py-0.5 rounded">
								{details.applicationRefId}
							</code>
						</div>
					}
				/>
			</div>
		</section>
	);
};
