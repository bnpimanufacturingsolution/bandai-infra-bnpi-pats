import { useEffect, useState } from "react";
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
	  }
	| {
			requestKind: "OVERTIME";
			date: string;
			overtimeHourPart: number;
			overtimeMinutePart: number;
			notes: string;
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
	}, [
		initialAdjustmentKind,
		initialDate,
		initialRequestKind,
		initialTimeIn,
		initialTimeOut,
		isOpen,
	]);

	const needsTimeIn = adjustmentKind !== "CLOCK_OUT";
	const needsTimeOut = adjustmentKind !== "CLOCK_IN";

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
				await onSubmit({
					requestKind: "OVERTIME",
					date,
					overtimeHourPart: hourPart,
					overtimeMinutePart: minutePart,
					notes: notes.trim(),
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
			await onSubmit({
				requestKind: "ATTENDANCE_ADJUSTMENT",
				adjustmentKind,
				date,
				timeIn,
				timeOut,
				reasonCategory,
				notes: notes.trim(),
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
			description="Overtime goes to HR. If they approve, that duration counts as payable OT.">
			<div className="space-y-4">
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
							Example: 2 hours 50 minutes. HR approval writes this as payable OT.
						</p>
					</div>
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
