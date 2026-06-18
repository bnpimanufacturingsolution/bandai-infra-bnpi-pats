import type React from "react";

import { Card } from "@/components/ui/card";

import { Clock, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import type { Applicant } from "~/types/application";

interface ApplicantCardProps {
	applicant: Applicant;
	onDragStart: (e: React.DragEvent, applicant: Applicant) => void;
	onClick: () => void;
}

export function ApplicantCard({ applicant, onDragStart, onClick }: ApplicantCardProps) {
	const getInitials = (name: string) => {
		return name
			.split(" ")
			.map((n) => n[0])
			.join("")
			.toUpperCase();
	};

	return (
		<Card
			draggable
			onDragStart={(e) => onDragStart(e, applicant)}
			onClick={onClick}
			className="p-4 cursor-pointer hover:shadow-md transition-shadow bg-card border-border">
			<div className="flex items-start gap-3">
				<Avatar className="h-10 w-10 border-2 border-border">
					<AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
						{getInitials(applicant.name)}
					</AvatarFallback>
				</Avatar>
				<div className="flex-1 min-w-0">
					<h4 className="font-semibold text-sm text-foreground truncate">
						{applicant.name}
					</h4>
					<p className="text-xs text-muted-foreground truncate mt-0.5">
						{applicant.position}
					</p>
					<div className="flex items-center gap-2 mt-3">
						<div className="flex items-center gap-1 text-xs text-muted-foreground">
							<User className="h-3 w-3" />
							<span className="truncate">{applicant.recruiter}</span>
						</div>
					</div>
					<div className="flex items-center gap-1 text-xs text-muted-foreground mt-1.5">
						<Clock className="h-3 w-3" />
						<span>
							{formatDistanceToNow(applicant.lastUpdated, { addSuffix: true })}
						</span>
					</div>
				</div>
			</div>
		</Card>
	);
}
