import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { DatePicker } from "~/components/atoms/DatePicker";
import { Textarea } from "~/components/ui/textarea";
import { Checkbox } from "~/components/ui/checkbox";
import { Skeleton } from "~/components/ui/skeleton";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import sectionsService from "~/services/sections.service";
import { useAuth } from "~/lib/hooks/use-auth";
import {
	buildOvertimeRequestPayload,
	type OvertimeRequestKind,
} from "~/lib/utils/attendance-adjustment-request";
import { useCreateRequest } from "~/lib/hooks/useRequests";

/**
 * Line-leader "assign overtime" screen (checkbox model).
 * The leader ticks the members who worked OT, sets the date/duration/reason
 * once, and submits one request per ticked member. Each request uses the
 * leader-filed on-behalf payload: requester stays the leader, the OT lands on
 * the member (targetEmployeeId + metadata.employeeId), and the approval chain
 * is the member's manager -> HR (WF-OVERTIME-LEADER-FILED).
 */

type OvertimeAssignment = {
	id: string;
	hourPart: string;
	minutePart: string;
};

const parseDuration = (hourPart: string, minutePart: string): number => {
	const hours = Number(hourPart);
	const minutes = Number(minutePart);
	const safeHours = Number.isFinite(hours) ? Math.max(0, Math.floor(hours)) : 0;
	const safeMinutes = Number.isFinite(minutes) ? Math.max(0, Math.min(59, Math.floor(minutes))) : 0;
	return safeHours * 60 + safeMinutes;
};

/** Today in HRIS business time (Asia/Manila), YYYY-MM-DD. */
const manilaToday = (): string =>
	new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());

export default function TeamOvertimeTab() {
	const { user } = useAuth();
	const queryClient = useQueryClient();
	const employeeId = user?.metadata?.employee?.id || "";
	const organizationId =
		user?.organizationId ||
		user?.organization?.id ||
		(user?.metadata as { employee?: { organizationId?: string } } | undefined)?.employee
			?.organizationId ||
		"";
	const userRole = String(user?.role || user?.metadata?.employee?.role || "")
		.trim()
		.toLowerCase();

	const [date, setDate] = useState(manilaToday);
	const [notes, setNotes] = useState("");
	const [overtimeKind, setOvertimeKind] = useState<OvertimeRequestKind>("REGULAR");
	const [error, setError] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [assignments, setAssignments] = useState<Record<string, OvertimeAssignment>>({});

	const { data: ledMembersData, isLoading: isLoadingMembers } = useQuery({
		queryKey: ["section-led-members", employeeId],
		queryFn: () => sectionsService.getLedMembers(),
		enabled: Boolean(employeeId),
		staleTime: 60_000,
	});

	const members = ledMembersData?.members || [];
	const sectionNames = (ledMembersData?.sections || [])
		.map((section) => section.name)
		.filter(Boolean)
		.join(", ");

	const checkedIds = useMemo(
		() => Object.entries(assignments).filter(([, value]) => value !== null).map(([id]) => id),
		[assignments],
	);

	const toggleMember = (memberId: string, checked: boolean) => {
		setAssignments((prev) => {
			const next = { ...prev };
			if (checked) {
				next[memberId] = { id: memberId, hourPart: "2", minutePart: "0" };
			} else {
				delete next[memberId];
			}
			return next;
		});
	};

	const setMemberDuration = (memberId: string, patch: Partial<OvertimeAssignment>) => {
		setAssignments((prev) => {
			const current = prev[memberId];
			if (!current) return prev;
			return {
				...prev,
				[memberId]: { ...current, ...patch },
			};
		});
	};

	const createRequest = useCreateRequest({ showSuccessToast: false, showErrorToast: false });

	const handleSubmit = async () => {
		setError("");
		if (!date) {
			setError("Pick the overtime date.");
			return;
		}
		if (checkedIds.length === 0) {
			setError("Tick at least one member to assign overtime.");
			return;
		}
		if (!notes.trim()) {
			setError("Explain why the overtime was needed.");
			return;
		}

		setSubmitting(true);
		const results: Array<{ label: string; ok: boolean; detail?: string }> = [];
		try {
			for (const memberId of checkedIds) {
				const member = members.find((candidate) => candidate.id === memberId);
				const info = member?.person?.personalInfo || {};
				const name = [info.firstName, info.lastName].filter(Boolean).join(" ").trim();
				const label = name || member?.employeeId || memberId;
				const assignment = assignments[memberId];
				const minutes = parseDuration(assignment.hourPart, assignment.minutePart);
				if (minutes <= 0) {
					results.push({ label, ok: false, detail: "Duration must be greater than 0." });
					continue;
				}
				try {
					const payload = buildOvertimeRequestPayload({
						// The OT is FOR the member; on-behalf keeps the leader as requester.
						employeeId: memberId,
						organizationId,
						date,
						overtimeHourPart: Number(assignment.hourPart),
						overtimeMinutePart: Number(assignment.minutePart),
						overtimeKind,
						notes: notes.trim(),
						onBehalf:
							memberId !== employeeId
								? { requesterEmployeeId: employeeId, filedByRole: userRole || "hris-line-leader" }
								: undefined,
					});
					await createRequest.mutateAsync(payload as never);
					results.push({ label, ok: true });
				} catch (submitError) {
					results.push({
						label,
						ok: false,
						detail: submitError instanceof Error ? submitError.message : "Failed to submit.",
					});
				}
			}

			const okCount = results.filter((result) => result.ok).length;
			const failed = results.filter((result) => !result.ok);
			if (okCount > 0) {
				toast.success(`Overtime filed for ${okCount} member${okCount === 1 ? "" : "s"}`, {
					description: "Each request goes to the member's manager, then HR for approval.",
				});
				setAssignments({});
				setNotes("");
				setDate("");
				queryClient.invalidateQueries({ queryKey: ["section-led-members", employeeId] });
			}
			if (failed.length > 0) {
				setError(
					`Filed ${okCount}, failed ${failed.length}. First failure: ${failed[0].label} — ${failed[0].detail ?? "unknown error"}`,
				);
			}
		} finally {
			setSubmitting(false);
		}
	};

	if (!employeeId) {
		return (
			<div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
				Employee context is missing. Please refresh and try again.
			</div>
		);
	}

	if (isLoadingMembers) {
		return (
			<div className="space-y-3">
				<Skeleton className="h-12 w-full" />
				<Skeleton className="h-12 w-full" />
				<Skeleton className="h-12 w-full" />
			</div>
		);
	}

	if (members.length === 0) {
		return (
			<div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
				You are not currently assigned as a line leader of any section, or your sections
				have no active members. Ask HR/Admin to assign you under
				<span className="font-medium"> Admin &gt; Configuration &gt; Sections &gt; Line Leaders</span>.
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{sectionNames ? (
				<p className="text-sm text-gray-500">
					Your sections: <span className="font-medium text-gray-700">{sectionNames}</span>
				</p>
			) : null}

			<div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
				<div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-600">
					<span className="w-6" />
					<span>Member</span>
					<span className="text-center">Hours</span>
					<span className="text-center">Minutes</span>
				</div>
				<div className="max-h-[420px] divide-y divide-gray-100 overflow-y-auto">
					{members.map((member) => {
						const info = member.person?.personalInfo || {};
						const name = [info.firstName, info.lastName].filter(Boolean).join(" ").trim();
						const label = name || member.employeeId;
						const checked = Boolean(assignments[member.id]);
						return (
							<div
								key={member.id}
								className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-2.5">
								<Checkbox
									checked={checked}
									onCheckedChange={(value) => toggleMember(member.id, value === true)}
									disabled={submitting}
									aria-label={`Assign overtime to ${label}`}
								/>
								<div className="min-w-0">
									<div className="truncate text-sm font-medium text-gray-900">{label}</div>
									<div className="truncate text-xs text-gray-500">
										{member.employeeId}
										{member.position?.title ? ` · ${member.position.title}` : ""}
									</div>
								</div>
								<Input
									type="number"
									min="0"
									max="23"
									step="1"
									value={assignments[member.id]?.hourPart ?? ""}
									onChange={(event) =>
										setMemberDuration(member.id, { hourPart: event.target.value })
									}
									disabled={!checked || submitting}
									className="h-9 w-20 text-center"
									aria-label={`Overtime hours for ${label}`}
								/>
								<Input
									type="number"
									min="0"
									max="59"
									step="1"
									value={assignments[member.id]?.minutePart ?? ""}
									onChange={(event) =>
										setMemberDuration(member.id, { minutePart: event.target.value })
									}
									disabled={!checked || submitting}
									className="h-9 w-20 text-center"
									aria-label={`Overtime minutes for ${label}`}
								/>
							</div>
						);
					})}
				</div>
			</div>

			<div className="grid gap-4 sm:grid-cols-[240px_240px_1fr]">
				<div>
					<label htmlFor="ot-date" className="mb-1 block text-sm font-medium text-gray-700">Overtime date</label>
					<DatePicker value={date} onChange={setDate} disabled={submitting} placeholder="Pick date" id="ot-date" />
				</div>
				<div>
					<label htmlFor="ot-kind" className="mb-1 block text-sm font-medium text-gray-700">Overtime type</label>
					<Select
						value={overtimeKind}
						onValueChange={(value) => setOvertimeKind(value as OvertimeRequestKind)}
						disabled={submitting}>
						<SelectTrigger id="ot-kind">
							<SelectValue placeholder="Select type" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="REGULAR">Regular OT (after shift)</SelectItem>
							<SelectItem value="EARLY">Early OT (before shift)</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div>
					<label htmlFor="ot-reason" className="mb-1 block text-sm font-medium text-gray-700">Reason (applies to all)</label>
					<Textarea
						id="ot-reason"
						value={notes}
						onChange={(event) => setNotes(event.target.value)}
						placeholder={
							overtimeKind === "EARLY"
								? "Example: Line started early to set up for a shipment."
								: "Example: Line stayed late to finish a shipment."
						}
						disabled={submitting}
						rows={2}
					/>
				</div>
			</div>

			{error ? <p className="text-sm text-red-600">{error}</p> : null}

			<div className="flex items-center justify-between border-t border-gray-100 pt-4">
				<p className="text-xs text-gray-500">
					{checkedIds.length > 0
						? `${checkedIds.length} member${checkedIds.length === 1 ? "" : "s"} ticked — ${overtimeKind === "EARLY" ? "early OT (before shift)" : "regular OT (after shift)"}, each gets their own overtime request (manager → HR approval).`
						: "Tick the members who worked overtime."}
				</p>
				<Button type="button" onClick={handleSubmit} disabled={submitting || checkedIds.length === 0}>
					{submitting
						? "Submitting..."
						: `Assign ${overtimeKind === "EARLY" ? "Early OT" : "OT"}${checkedIds.length > 0 ? ` (${checkedIds.length})` : ""}`}
				</Button>
			</div>
		</div>
	);
}
