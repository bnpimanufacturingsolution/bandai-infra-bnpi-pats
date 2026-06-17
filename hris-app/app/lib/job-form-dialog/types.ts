import type { Tag } from "~/zod/job.zod";
import type { Position } from "~/zod/position.zod";
import type { Level } from "~/zod/level.zod";
import type { CreateJobRequest } from "~/services/job.service";

export interface JobFormData {
	headcountRequested: number;
	departmentId?: string | null;
	sectionId?: string | null;
	positionId: string;
	levelId?: string | null;
	type: string | null;
	location: string | null;
	description: string | null;
}

export interface JobFormDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (data: CreateJobRequest) => void;
	positions: Position[];
	levels: Level[];
	initialData?: JobFormInitialData;
	isLoading?: boolean;
}

export interface JobFormInitialData extends JobFormData {
	id?: string;
	tags?: Tag[];
}
