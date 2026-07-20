import { useNavigate } from "react-router-dom";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import type { BirthdayCelebrantItem } from "~/types/celebrations";

type RosterEntry = {
	employeeCode: string;
	avatar: string | null;
};

interface CelebrantDetailsModalProps {
	item: BirthdayCelebrantItem | null;
	year: number;
	rosterByProfileId: Map<string, RosterEntry>;
	onClose: () => void;
}

const toBirthdayLabel = (year: number, month: number, day: number): string =>
	new Date(year, month - 1, day).toLocaleDateString("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
	});

const isBirthdayToday = (month: number, day: number): boolean => {
	const today = new Date();
	return today.getMonth() + 1 === month && today.getDate() === day;
};

const getInitials = (name: string): string => {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 1) {
		return parts[0].slice(0, 2).toUpperCase();
	}
	if (parts.length > 1) {
		return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
	}
	return "?";
};

function DetailRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-start justify-between gap-4 py-2.5 text-sm">
			<span className="shrink-0 text-gray-500">{label}</span>
			<span className="text-right font-medium text-gray-900">{value}</span>
		</div>
	);
}

export function CelebrantDetailsModal({
	item,
	year,
	rosterByProfileId,
	onClose,
}: CelebrantDetailsModalProps) {
	const navigate = useNavigate();

	if (!item) {
		return null;
	}

	const isEmployee = item.type === "EMPLOYEE_BIRTHDAY";
	const profileId = String(item.employeeId || "").trim();
	const rosterEntry = profileId ? rosterByProfileId.get(profileId) : undefined;
	const employeeCode = rosterEntry?.employeeCode || "-";
	const avatar = isEmployee ? (rosterEntry?.avatar ?? null) : null;
	const isToday = isBirthdayToday(item.month, item.day);

	const subtitle = isEmployee
		? employeeCode
		: `Child of ${item.parentDisplayName || "Unknown"}`;

	const handleViewProfile = () => {
		if (!profileId) return;
		onClose();
		navigate(`/employee/${profileId}`);
	};

	return (
		<Dialog open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Celebrant Details</DialogTitle>
				</DialogHeader>

				<div className="flex items-center gap-4">
					<Avatar className="h-14 w-14 shrink-0">
						{avatar ? <AvatarImage src={avatar} alt={item.displayName} /> : null}
						<AvatarFallback className="bg-gray-100 text-sm font-medium text-gray-600">
							{getInitials(item.displayName)}
						</AvatarFallback>
					</Avatar>
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-2">
							<p className="truncate text-base font-semibold text-gray-900">
								{item.displayName}
							</p>
							{isToday && (
								<Badge variant="success-soft" className="px-2 py-0.5 text-[10px]">
									Today
								</Badge>
							)}
						</div>
						<p className="truncate text-sm text-gray-500">{subtitle}</p>
					</div>
				</div>

				<div className="divide-y divide-gray-100 border-t border-gray-100">
					<DetailRow label="Type" value={isEmployee ? "Employee" : "Kid"} />
					<DetailRow
						label="Birthday"
						value={toBirthdayLabel(year, item.month, item.day)}
					/>
					<DetailRow
						label="Department"
						value={item.department || "No department"}
					/>
				</div>

				<DialogFooter className="gap-2 sm:justify-end">
					<Button variant="outline" onClick={onClose}>
						Close
					</Button>
					{profileId && (
						<Button variant="outline" onClick={handleViewProfile}>
							{isEmployee ? "View profile" : "View parent profile"}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}