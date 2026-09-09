import { useEffect, useMemo, useState } from "react";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { DatePicker } from "~/components/atoms/DatePicker";
import { Modal } from "~/components/atoms/Modal";
import { TimePicker } from "~/components/molecules/TimePicker";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import {
	ATTENDANCE_ADJUSTMENT_REASON_CATEGORIES,
	type AttendanceAdjustmentKind,
	type AttendanceAdjustmentReasonCategory,
	type AttendanceRequestKind,
	formatPickerTime12Hour,
	isoToManilaPickerTime,
} from "~/lib/utils/attendance-adjustment-request";

const REASON_LABELS: Record<AttendanceAdjustmentReasonCategory, string> = {
	MISSED_PUNCH: "Missed punch",
	WRONG_STATUS: "Wrong status",
	MANUAL_REVIEW: "Manual review",
	DEVICE_SYNC: "Device sync issue",
};

export type AttendanceTimeRequestFormValues =
	| {
			requestKind: "ATTENDANCE_ADJUSTMENT";
			adjustmentKind: AttendanceAdjustmentKind;
			date: string;
			timeIn: string;
			timeOut: string;
			reasonCategory: AttendanceAdjustmentReasonCategory;
			notes: string;
			/** Member the adjustment is for when a line leader files on behalf (undefined = self). */
			memberEmployeeId?: string;
			memberLabel?: string;
	  }
	| {
			requestKind: "OVERTIME";
			date: string;
			overtimeHourPart: number;
			overtimeMinutePart: number;
			notes: string;
			/** Member the OT is for when a line leader files on behalf (undefined = self). */
			memberEmployeeId?: string;
			memberLabel?: string;
	  };

type AttendanceAdjustmentRequestModalProps = {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (values: AttendanceTimeRequestFormValues) => Promise<void> | void;
	isPending?: boolean;
	initialDate?: string | null;
	initialTimeIn?: string | null;
	initialTimeOut?: string | null;
	initialRequestKind?: AttendanceRequestKind | null;
	initialAdjustmentKind?: AttendanceAdjustmentKind | null;
	/**
	 * Line-leader on-behalf filing: when provided, the form shows a
	 * "For whom" picker defaulting to the leader themself so they can file
	 * overtime AND timesheet adjustments for a section member. Each option
	 * carries the employee id + label.
	 */
	onBehalfOptions?: Array<{ id: string; label: string; isSelf: boolean }>;
};

const parseRequestKind = (value?: string | null): AttendanceRequestKind =>
	String(value || "").toUpperCase() === "OVERTIME" ? "OVERTIME" : "ATTENDANCE_ADJUSTMENT";

const parseAdjustmentKind = (value?: string | null): AttendanceAdjustmentKind => {
	const normalized = String(value || "").toUpperCase().replace(/-/g, "_");
	if (normalized === "CLOCK_IN") return "CLOCK_IN";
	if (normalized === "CLOCK_OUT") return "CLOCK_OUT";
	return "CLOCK_IN_OUT";
};

export function AttendanceAdjustmentRequestModal({
	isOpen,
	onClose,
	onSubmit,
	isPending = false,
	initialDate,
	initialTimeIn,
	initialTimeOut,
	initialRequestKind,
	initialAdjustmentKind,
	onBehalfOptions,
}: AttendanceAdjustmentRequestModalProps) {
	const [requestKind, setRequestKind] = useState<AttendanceRequestKind>("ATTENDANCE_ADJUSTMENT");
	const [adjustmentKind, setAdjustmentKind] = useState<AttendanceAdjustmentKind>("CLOCK_IN_OUT");
	const [date, setDate] = useState("");
	const [timeIn, setTimeIn] = useState("");
	const [timeOut, setTimeOut] = useState("");
	const [overtimeHourPart, setOvertimeHourPart] = useState("2");
	const [overtimeMinutePart, setOvertimeMinutePart] = useState("50");
	const [reasonCategory, setReasonCategory] =
		useState<AttendanceAdjustmentReasonCategory>("MISSED_PUNCH");
	const [notes, setNotes] = useState("");
	const [error, setError] = useState("");
	const [forWhomId, setForWhomId] = useState("");

	const canFileOnBehalf = Boolean(onBehalfOptions && onBehalfOptions.length > 1);

	const selfOption = useMemo(
		() => onBehalfOptions?.find((option) => option.isSelf) || null,
		[onBehalfOptions],
	);

	const selectedForWhom = useMemo(() => {
		if (!onBehalfOptions?.length) return null;
		return onBehalfOptions.find((option) => option.id === forWhomId) || selfOption;
	}, [forWhomId, onBehalfOptions, selfOption]);

	useEffect(() => {
		if (!isOpen) return;
		setRequestKind(parseRequestKind(initialRequestKind));
		setAdjustmentKind(parseAdjustmentKind(initialAdjustmentKind));
		setDate(initialDate || "");
		setTimeIn(isoToManilaPickerTime(initialTimeIn) || initialTimeIn || "");
		setTimeOut(isoToManilaPickerTime(initialTimeOut) || initialTimeOut || "");
		setOvertimeHourPart("2");
		setOvertimeMinutePart("50");
		setReasonCategory("MISSED_PUNCH");
		setNotes("");
		setError("");
		setForWhomId(selfOption?.id || "");
	}, [
		initialAdjustmentKind,
		initialDate,
		initialRequestKind,
		initialTimeIn,
		initialTimeOut,
		isOpen,
		selfOption?.id,
	]);

	const needsTimeIn = adjustmentKind !== "CLOCK_OUT";
	const needsTimeOut = adjustmentKind !== "CLOCK_IN";
	// On-behalf is active when the picker is offered and a member is selected.
	const isOnBehalfActive = Boolean(canFileOnBehalf && selectedForWhom && !selectedForWhom.isSelf);

	// Approval-flow tasks laid out BEFORE the request executes (operator
	// 2026-09-09: "make sure to have proper task being laid before executing
	// also make sure the task can be seen on the right panel side"). Chains
	// mirror the backend workflow templates exactly.
	const approvalFlowSteps: Array<{ title: string; detail: string }> =
		requestKind === "OVERTIME"
			? isOnBehalfActive
				? [
						{
							title: "1. Leader submission",
							detail: `You file this overtime for ${selectedForWhom?.label || "the member"}.`,
						},
						{
							title: "2. Member's manager approval (final)",
							detail: "Their section manager approves or rejects — no HR step.",
						},
						{
							title: "3. Applied to their timesheet",
							detail: "On approval the OT is written as payable hours on the member's timesheet.",
						},
					]
				: [
						{ title: "1. Your submission", detail: "You file this request." },
						{ title: "2. HR approval", detail: "HR reviews and approves or rejects." },
						{
							title: "3. Applied to your timesheet",
							detail: "On approval the OT is written as payable hours on your timesheet.",
						},
					]
			: isOnBehalfActive
				? [
						{
							title: "1. Leader submission",
							detail: `You file this adjustment for ${selectedForWhom?.label || "the member"}.`,
						},
						{
							title: "2. Member's manager approval (final)",
							detail: "Their section manager approves or rejects — no HR step.",
						},
						{
							title: "3. Applied to their attendance",
							detail: "On approval the correction is applied to the member's attendance.",
						},
					]
				: [
						{ title: "1. Your submission", detail: "You file this request." },
						{ title: "2. Manager approval", detail: "Your supervisor approves or rejects." },
						{ title: "3. HR review", detail: "HR confirms the correction." },
						{
							title: "4. Applied to your attendance",
							detail: "The correction is applied to your attendance.",
						},
					];

	const handleSubmit = async () => {
		setError("");
		if (!date) {
			setError("Date is required.");
			return;
		}
		if (!notes.trim()) {
			setError("Explain why this request is needed.");
			return;
		}
		try {
			if (requestKind === "OVERTIME") {
				const hourPart = Number(overtimeHourPart);
				const minutePart = Number(overtimeMinutePart);
				if (!Number.isFinite(hourPart) || hourPart < 0 || hourPart > 23) {
					setError("Hours must be between 0 and 23.");
					return;
				}
				if (!Number.isFinite(minutePart) || minutePart < 0 || minutePart > 59) {
					setError("Minutes must be between 0 and 59.");
					return;
				}
				if (hourPart * 60 + minutePart <= 0) {
					setError("Overtime duration must be greater than 0.");
					return;
				}
				const isOnBehalf = canFileOnBehalf && selectedForWhom && !selectedForWhom.isSelf;
				await onSubmit({
					requestKind: "OVERTIME",
					date,
					overtimeHourPart: hourPart,
					overtimeMinutePart: minutePart,
					notes: notes.trim(),
					...(isOnBehalf && selectedForWhom
						? {
								memberEmployeeId: selectedForWhom.id,
								memberLabel: selectedForWhom.label,
							}
						: {}),
				});
				return;
			}
			if (needsTimeIn && !timeIn) {
				setError("Time in is required.");
				return;
			}
			if (needsTimeOut && !timeOut) {
				setError("Time out is required.");
				return;
			}
			const isOnBehalf = canFileOnBehalf && selectedForWhom && !selectedForWhom.isSelf;
			await onSubmit({
				requestKind: "ATTENDANCE_ADJUSTMENT",
				adjustmentKind,
				date,
				timeIn,
				timeOut,
				reasonCategory,
				notes: notes.trim(),
				...(isOnBehalf && selectedForWhom
					? {
							memberEmployeeId: selectedForWhom.id,
							memberLabel: selectedForWhom.label,
						}
					: {}),
			});
		} catch (submitError) {
			setError(
				submitError instanceof Error
					? submitError.message
					: "Failed to submit attendance request.",
			);
		}
	};

	return (
		<Modal
			open={isOpen}
			onOpenChange={(open) => {
				if (!open && !isPending) onClose();
			}}
			title="Attendance request"
			description="Approval flow is shown on the right before you submit."
			className="sm:max-w-[860px]">
			<div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,300px)]">
				<div className="min-w-0 space-y-4">
					<div>
						<label className="mb-1 block text-sm font-medium text-gray-700">
							Request type
						</label>
						<Select
							value={requestKind}
							onValueChange={(value) => setRequestKind(value as AttendanceRequestKind)}
							disabled={isPending}>
							<SelectTrigger>
								<SelectValue placeholder="Select type" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="ATTENDANCE_ADJUSTMENT">
									Attendance adjustment
								</SelectItem>
								<SelectItem value="OVERTIME">Overtime</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div>
						<label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
						<DatePicker
							value={date}
							onChange={setDate}
							placeholder="Select overtime date"
							disabled={isPending}
						/>
					</div>

					{canFileOnBehalf ? (
						<div>
							<label className="mb-1 block text-sm font-medium text-gray-700">
								For whom
							</label>
							<Select
								value={selectedForWhom?.id || ""}
								onValueChange={(value) => setForWhomId(value)}
								disabled={isPending}>
								<SelectTrigger>
									<SelectValue placeholder="Select employee" />
								</SelectTrigger>
								<SelectContent>
									{onBehalfOptions?.map((option) => (
										<SelectItem key={option.id} value={option.id}>
											{option.isSelf ? `${option.label} (you)` : option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="mt-1 text-xs text-gray-500">
								File for a section member — their manager approves; the correction
								or OT lands on their record, not yours.
							</p>
						</div>
					) : null}

					{requestKind === "ATTENDANCE_ADJUSTMENT" ? (
					<>
						<div>
							<label className="mb-1 block text-sm font-medium text-gray-700">
								What do you need to correct?
							</label>
							<Select
								value={adjustmentKind}
								onValueChange={(value) =>
									setAdjustmentKind(value as AttendanceAdjustmentKind)
								}
								disabled={isPending}>
								<SelectTrigger>
									<SelectValue placeholder="Select adjustment" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="CLOCK_IN">Clock in</SelectItem>
									<SelectItem value="CLOCK_OUT">Clock out</SelectItem>
									<SelectItem value="CLOCK_IN_OUT">Clock in and clock out</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="grid gap-4 sm:grid-cols-2">
							{needsTimeIn ? (
								<div>
									<label className="mb-1 block text-sm font-medium text-gray-700">
										Time in
									</label>
									<TimePicker value={timeIn} onChange={setTimeIn} disabled={isPending} />
								</div>
							) : timeIn ? (
								<div>
									<label className="mb-1 block text-sm font-medium text-gray-700">
										Existing time in
									</label>
									<p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
										{formatPickerTime12Hour(timeIn)}
									</p>
									<p className="mt-1 text-xs text-gray-500">
										Clock out must be after this punch.
									</p>
								</div>
							) : null}
							{needsTimeOut ? (
								<div>
									<label className="mb-1 block text-sm font-medium text-gray-700">
										Time out
									</label>
									<TimePicker
										value={timeOut}
										onChange={setTimeOut}
										disabled={isPending}
									/>
								</div>
							) : timeOut ? (
								<div>
									<label className="mb-1 block text-sm font-medium text-gray-700">
										Existing time out
									</label>
									<p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
										{formatPickerTime12Hour(timeOut)}
									</p>
								</div>
							) : null}
						</div>
						<div>
							<label className="mb-1 block text-sm font-medium text-gray-700">
								Reason
							</label>
							<Select
								value={reasonCategory}
								onValueChange={(value) =>
									setReasonCategory(value as AttendanceAdjustmentReasonCategory)
								}
								disabled={isPending}>
								<SelectTrigger>
									<SelectValue placeholder="Select reason" />
								</SelectTrigger>
								<SelectContent>
									{ATTENDANCE_ADJUSTMENT_REASON_CATEGORIES.map((value) => (
										<SelectItem key={value} value={value}>
											{REASON_LABELS[value]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</>
				) : (
					<>
						<div>
							<label className="mb-1 block text-sm font-medium text-gray-700">
								Overtime duration
							</label>
							<div className="grid grid-cols-2 gap-3">
								<div>
									<p className="mb-1 text-xs text-gray-500">Hours</p>
									<Input
										type="number"
										min="0"
										max="23"
										step="1"
										value={overtimeHourPart}
										onChange={(event) => setOvertimeHourPart(event.target.value)}
										disabled={isPending}
									/>
								</div>
								<div>
									<p className="mb-1 text-xs text-gray-500">Minutes</p>
									<Input
										type="number"
										min="0"
										max="59"
										step="1"
										value={overtimeMinutePart}
										onChange={(event) => setOvertimeMinutePart(event.target.value)}
										disabled={isPending}
									/>
								</div>
							</div>
							<p className="mt-1 text-xs text-gray-500">
								{isOnBehalfActive
									? "Example: 2 hours 50 minutes. Manager approval writes this as payable OT on the member's timesheet."
									: "Example: 2 hours 50 minutes. HR approval writes this as payable OT."}
							</p>
						</div>
					</>
				)}

				<div>
					<label className="mb-1 block text-sm font-medium text-gray-700">Explanation</label>
					<Textarea
						value={notes}
						onChange={(event) => setNotes(event.target.value)}
						placeholder={
							requestKind === "OVERTIME"
								? "Example: Stayed to finish a shipment."
								: "Example: Forgot to clock in or clock out."
						}
						disabled={isPending}
						rows={3}
					/>
				</div>
				{error ? <p className="text-sm text-red-600">{error}</p> : null}
				</div>

				{/* Right panel: the approval-chain tasks laid out before executing. */}
				<aside
					data-testid="approval-flow-panel"
					className="h-fit rounded-lg border border-gray-200 bg-gray-50/70 p-4">
					<p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
						Approval flow
					</p>
					<ol className="mt-3 space-y-3">
						{approvalFlowSteps.map((step) => (
							<li key={step.title} className="flex gap-2">
								<span
									aria-hidden="true"
									className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400"
								/>
								<div className="min-w-0">
									<p className="text-sm font-medium text-gray-900">{step.title}</p>
									<p className="mt-0.5 text-xs leading-5 text-gray-500">
										{step.detail}
									</p>
								</div>
							</li>
						))}
					</ol>
					<p className="mt-3 border-t border-gray-200 pt-3 text-xs leading-5 text-gray-500">
						Nothing is applied until every approval step above is done.
					</p>
				</aside>
			</div>
			<div className="mt-5 flex justify-end gap-3 border-t border-gray-100 pt-4">
				<Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
					Cancel
				</Button>
				<Button type="button" onClick={handleSubmit} disabled={isPending}>
					{isPending ? "Submitting..." : "Submit request"}
				</Button>
			</div>
		</Modal>
	);
}
