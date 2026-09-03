import type React from "react";

import type { Applicant, ApplicantStatus, KanbanColumn } from "~/types/application";
import { ApplicantCard } from "./applicant-card";
import { Badge } from "~/components/atoms";

interface KanbanColumnProps {
	column: KanbanColumn;
	applicants: Applicant[];
	onDragStart: (e: React.DragEvent, applicant: Applicant) => void;
	onDragOver: (e: React.DragEvent) => void;
	onDrop: (e: React.DragEvent, status: ApplicantStatus) => void;
	onApplicantClick: (applicant: Applicant) => void;
}

export function KanbanColumnComponent({
	column,
	applicants,
	onDragStart,
	onDragOver,
	onDrop,
	onApplicantClick,
}: KanbanColumnProps) {
	return (
		<div className="flex flex-col min-w-[320px] max-h-[calc(100vh-250px)] bg-muted/30 rounded-lg border border-border">
			<div className="p-4 border-b border-border bg-card/50 shrink-0">
				<div className="flex items-center justify-between mb-1">
					<h3 className="font-semibold text-sm text-foreground">{column.title}</h3>
					<Badge variant="secondary" className="text-xs">
						{applicants.length}
					</Badge>
				</div>
				<p className="text-xs text-muted-foreground">{column.description}</p>
			</div>
			<div
				className="flex-1 p-3 space-y-3 overflow-y-auto"
				onDragOver={onDragOver}
				onDrop={(e) => onDrop(e, column.id)}>
				{applicants.map((applicant) => (
					<ApplicantCard
						key={applicant.id}
						applicant={applicant}
						onDragStart={onDragStart}
						onClick={() => onApplicantClick(applicant)}
					/>
				))}
				{applicants.length === 0 && (
					<div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
						No applicants
					</div>
				)}
			</div>
		</div>
	);
}
