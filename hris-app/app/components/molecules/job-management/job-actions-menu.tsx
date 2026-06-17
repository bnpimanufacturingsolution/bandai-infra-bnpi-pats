import { Edit, Eye, MoreVertical, Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import type { Job } from "~/zod/job.zod";

interface JobActionsMenuProps {
	job: Job;
	onView: (job: Job) => void;
	onEdit: (job: Job) => void;
	onDelete: (id: string) => void;
}

export const JobActionsMenu = ({ job, onView, onEdit, onDelete }: JobActionsMenuProps) => (
	<DropdownMenu>
		<DropdownMenuTrigger asChild>
			<Button variant="ghost" size="sm">
				<MoreVertical className="w-4 h-4" />
			</Button>
		</DropdownMenuTrigger>
		<DropdownMenuContent align="end">
			<DropdownMenuItem onClick={() => onView(job)}>
				<Eye className="w-4 h-4 mr-2" />
				View Details
			</DropdownMenuItem>
			<DropdownMenuItem onClick={() => onEdit(job)}>
				<Edit className="w-4 h-4 mr-2" />
				Edit
			</DropdownMenuItem>
			<DropdownMenuSeparator />
			<DropdownMenuItem onClick={() => onDelete(job.id)} className="text-red-600">
				<Trash2 className="w-4 h-4 mr-2" />
				Delete
			</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>
);
