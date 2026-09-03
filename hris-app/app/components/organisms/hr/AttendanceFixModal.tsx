import { useEffect, useState } from "react";
import { Loader2, AlertCircle, Lock } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { TimePicker } from "~/components/molecules/TimePicker";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import {
	useCreateAttendanceBackfill,
	useCreateAttendanceCorrection,
} from "~/lib/hooks/useAttendances";
import { statusUsesWorkedWindow, validateCorrectionForm } from "~/routes/hr/time-corrections";
import {
	ATTENDANCE_CORRECTION_REASON_CATEGORY_OPTIONS,
	type AttendanceCorrectionReasonCategory,
} from "~/services/attendance.service";

const CORRECTION_REASON_LABELS: Record<AttendanceCorrectionReasonCategory, string> = {
	MISSED_PUNCH: "Missed Punch",
	WRONG_STATUS: "Wrong Status",
	MANUAL_REVIEW: "Manual Review",
	DEVICE_SYNC: "Device Sync Issue",
};

const toPickerTimeValue = (value: string | null | undefined) => {
	if (!value) return "";
	const trimmed = value.trim();
	if (!trimmed) return "";

	if (trimmed.includes("T")) {
		const isoDate = new Date(trimmed);
		if (!Number.isNaN(isoDate.getTime())) {
			const parts = new Intl.DateTimeFormat("en-US", {
				hour: "2-digit",
				minute: "2-digit",
				hour12: false,
				timeZone: "Asia/Manila",
			}).formatToParts(isoDate);
			const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
			const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
			const normalizedHour = hour === "24" ? "00" : hour.padStart(2, "0");
			return `${normalizedHour}:${minute}`;
		}
		return "";
	}

	const amPmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
	if (amPmMatch) {
		const [, hourText, minute, meridiem] = amPmMatch;
		let hours = Number(hourText);
		if (Number.isNaN(hours) || hours < 1 || hours > 12) return "";
		const normalizedMeridiem = meridiem.toUpperCase();
		if (normalizedMeridiem === "PM" && hours !== 12) hours += 12;
		if (normalizedMeridiem === "AM" && hours === 12) hours = 0;
		return `${hours.toString().padStart(2, "0")}:${minute}`;
	}

	const militaryMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
	if (militaryMatch) {
		const [, hourText, minute] = militaryMatch;
		const hours = Number(hourText);
		if (Number.isNaN(hours) || hours < 0 || hours > 23) return "";
		return `${hours.toString().padStart(2, "0")}:${minute}`;
	}

	return "";
};

const formatTimeForDisplay = (value: string | null | undefined) => {
	if (!value) return "-";
	const isoCandidate = new Date(value);
	if (!Number.isNaN(isoCandidate.getTime()) && value.includes("T")) {
		return isoCandidate.toLocaleTimeString("en-US", {
			hour: "2-digit",
			minute: "2-digit",
			hour12: true,
			timeZone: "Asia/Manila",
		});
	}

	const pickerValue = toPickerTimeValue(value);
	if (!pickerValue) return value || "-";

	const [hourText, minute] = pickerValue.split(":");
	let hours = Number(hourText);
	const meridiem = hours >= 12 ? "PM" : "AM";
	hours = hours % 12 || 12;
	return `${hours.toString().padStart(2, "0")}:${minute} ${meridiem}`;
};

export interface AttendanceFixModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	
	employeeId: string; // The user profile ID
	employeeName: string;
	employeeCode: string;
	date: string; // YYYY-MM-DD
	
	attendanceId?: string | null;
	originalStatus?: string | null;
	originalTimeIn?: string | null;
	originalTimeOut?: string | null;
	
	isLocked?: boolean;
}

type CorrectionFormState = {
	status: string;
	timeIn: string;
	timeOut: string;
	reasonCategory: AttendanceCorrectionReasonCategory;
	notes: string;
};

type CorrectionFormErrors = Partial<
	Record<keyof CorrectionFormState | "form" | "employeeId" | "correctionDate", string>
>;

const DEFAULT_FORM: CorrectionFormState = {
	status: "PRESENT",
	timeIn: "",
	timeOut: "",
	reasonCategory: ATTENDANCE_CORRECTION_REASON_CATEGORY_OPTIONS[0],
	notes: "",
};

export function AttendanceFixModal({
	open,
	onOpenChange,
	employeeId,
	employeeName,
	employeeCode,
	date,
	attendanceId,
	originalStatus,
	originalTimeIn,
	originalTimeOut,
	isLocked = false,
}: AttendanceFixModalProps) {
	const [form, setForm] = useState<CorrectionFormState>(DEFAULT_FORM);
	const [formErrors, setFormErrors] = useState<CorrectionFormErrors>({});

	const fixMode = attendanceId ? "correction" : "backfill";
	const isBackfill = fixMode === "backfill";

	const createCorrectionMutation = useCreateAttendanceCorrection();
	const createBackfillMutation = useCreateAttendanceBackfill();
	const activeMutation = isBackfill ? createBackfillMutation : createCorrectionMutation;

	useEffect(() => {
		if (open) {
			setForm({
				status: isBackfill ? "ABSENT" : (originalStatus?.toUpperCase() || "PRESENT"),
				timeIn: isBackfill ? "" : toPickerTimeValue(originalTimeIn),
				timeOut: isBackfill ? "" : toPickerTimeValue(originalTimeOut),
				reasonCategory: ATTENDANCE_CORRECTION_REASON_CATEGORY_OPTIONS[0],
				notes: "",
			});
			setFormErrors({});
		}
	}, [open, isBackfill, originalStatus, originalTimeIn, originalTimeOut]);

	const handleStatusChange = (value: string) => {
		setFormErrors((prev) => ({
			...prev,
			status: undefined,
			timeIn: undefined,
			timeOut: undefined,
			form: undefined,
		}));
		setForm((prev) => ({
			...prev,
			status: value,
			timeIn: statusUsesWorkedWindow(value) ? prev.timeIn : "",
			timeOut: statusUsesWorkedWindow(value) ? prev.timeOut : "",
		}));
	};

	const handleSubmit = async () => {
		const validationErrors = validateCorrectionForm({
			employeeId,
			correctionDate: date,
			status: form.status,
			timeIn: form.timeIn,
			timeOut: form.timeOut,
			reasonCategory: form.reasonCategory,
			notes: form.notes,
		});
		if (Object.keys(validationErrors).length > 0) {
			setFormErrors(validationErrors);
			return;
		}

		setFormErrors({});

		try {
			const payload = {
				employeeId,
				correctionDate: date,
				status: form.status as any,
				timeIn: form.timeIn || undefined,
				timeOut: form.timeOut || undefined,
				reasonCategory: form.reasonCategory,
				notes: form.notes,
			};

			if (isBackfill) {
				await createBackfillMutation.mutateAsync(payload);
			} else {
				await createCorrectionMutation.mutateAsync({
					...payload,
					attendanceId: attendanceId!,
				});
			}
			
			onOpenChange(false);
		} catch (error: any) {
			// Try to extract validation errors from response
			const apiMessage = error?.message || "Failed to save correction.";
			setFormErrors({ form: apiMessage });
		}
	};

	const title = isBackfill ? "Fix Attendance — Create Missing Record" : "Fix Attendance — Correct Attendance";
	const description = isBackfill 
		? "Record an attendance entry for a day with no existing data."
		: "Update an existing attendance record. The original entry will be preserved in history.";

	const usesWorkedWindow = statusUsesWorkedWindow(form.status);

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title={title}
			description={description}
			className="max-w-xl"
		>
			<div className="space-y-6 pt-2">
				<div className="rounded-xl border border-neutral-100 bg-neutral-50/50 p-4 shadow-sm">
					<div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
						<div>
							<div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Employee</div>
							<div className="mt-1 font-semibold text-neutral-900">{employeeName}</div>
							<div className="text-xs text-neutral-500">{employeeCode}</div>
						</div>
						<div>
							<div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Date</div>
							<div className="mt-1 font-semibold text-neutral-900">
								{new Date(date).toLocaleDateString("en-US", { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
							</div>
						</div>
						{!isBackfill && (
							<div>
								<div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Original State</div>
								<div className="mt-1 text-sm font-medium text-neutral-700 capitalize">{originalStatus?.toLowerCase() || "-"}</div>
								<div className="text-xs text-neutral-500">
									{originalTimeIn || originalTimeOut 
										? `${formatTimeForDisplay(originalTimeIn)} - ${formatTimeForDisplay(originalTimeOut)}`
										: "No times logged"}
								</div>
							</div>
						)}
					</div>
				</div>

				{isLocked ? (
					<div className="flex flex-col items-center justify-center rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
						<div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 mb-4">
							<Lock className="h-5 w-5 text-neutral-500" />
						</div>
						<h3 className="font-semibold text-neutral-900">Payroll Locked</h3>
						<p className="mt-2 text-sm text-neutral-500 max-w-sm">
							This attendance date is locked for payroll processing. Direct edits are disabled. The employee must submit a Time Adjustment request via self-service for any changes.
						</p>
					</div>
				) : (
					<>
						<div className="space-y-4">
							<div>
								<Label className="text-sm font-semibold">Corrected Status</Label>
								<div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
									{[
										{ value: "PRESENT", label: "Work Day", icon: "🏢" },
										{ value: "INCOMPLETE", label: "Incomplete", icon: "⏱️" },
										{ value: "LEAVE", label: "Leave", icon: "🌴" },
										{ value: "ABSENT", label: "Absent", icon: "❌" },
										{ value: "REST_DAY", label: "Rest Day", icon: "🛋️" },
									].map((opt) => {
										const isSelected = form.status === opt.value;
										return (
											<button
												key={opt.value}
												type="button"
												aria-pressed={isSelected}
												onClick={() => handleStatusChange(opt.value)}
												className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-3 transition-colors ${
													isSelected 
														? "border-[--brand-color-primary] bg-red-50 text-[--brand-color-primary] shadow-sm ring-1 ring-red-500/20" 
														: "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50"
												}`}
											>
												<span className="text-lg">{opt.icon}</span>
												<span className="text-[11px] font-semibold tracking-wide uppercase text-center leading-tight">{opt.label}</span>
											</button>
										);
									})}
								</div>
							</div>

							{usesWorkedWindow && (
								<div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
									<div className="grid gap-4 sm:grid-cols-2">
										<div className="space-y-2">
											<Label>Time In <span className="text-red-500">*</span></Label>
											<TimePicker
												value={form.timeIn}
												onChange={(value) => {
													setForm((prev) => ({ ...prev, timeIn: value }));
													setFormErrors((prev) => ({ ...prev, timeIn: undefined, form: undefined }));
												}}
												className={`h-10 rounded-lg shadow-sm ${formErrors.timeIn ? "border-red-500 ring-1 ring-red-500/20" : "border-neutral-200"}`}
											/>
											{formErrors.timeIn && <p className="text-xs text-red-600 font-medium">{formErrors.timeIn}</p>}
										</div>
										<div className="space-y-2">
											<Label>Time Out {form.status === "PRESENT" && <span className="text-red-500">*</span>}</Label>
											<TimePicker
												value={form.timeOut}
												onChange={(value) => {
													setForm((prev) => ({ ...prev, timeOut: value }));
													setFormErrors((prev) => ({ ...prev, timeOut: undefined, form: undefined }));
												}}
												disabled={form.status === "INCOMPLETE"}
												className={`h-10 rounded-lg shadow-sm ${formErrors.timeOut ? "border-red-500 ring-1 ring-red-500/20" : "border-neutral-200"}`}
											/>
											{formErrors.timeOut && <p className="text-xs text-red-600 font-medium">{formErrors.timeOut}</p>}
										</div>
									</div>
								</div>
							)}
						</div>

						<div className="h-px bg-neutral-100 my-6" />

						<div className="space-y-4">
							<Label className="text-sm font-semibold">Justification <span className="text-red-500">*</span></Label>
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-2 sm:col-span-2">
									<Select
										value={form.reasonCategory}
										onValueChange={(value) => {
											setForm((prev) => ({ ...prev, reasonCategory: value as any }));
											setFormErrors((prev) => ({ ...prev, reasonCategory: undefined, form: undefined }));
										}}
									>
										<SelectTrigger className="h-10 rounded-lg border-neutral-200 bg-white shadow-sm">
											<SelectValue placeholder="Select primary reason" />
										</SelectTrigger>
										<SelectContent>
											{ATTENDANCE_CORRECTION_REASON_CATEGORY_OPTIONS.map((reason) => (
												<SelectItem key={reason} value={reason}>
													{CORRECTION_REASON_LABELS[reason]}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{formErrors.reasonCategory && <p className="text-xs text-red-600 font-medium">{formErrors.reasonCategory}</p>}
								</div>
								
								<div className="space-y-2 sm:col-span-2">
									<Textarea
										value={form.notes}
										onChange={(e) => {
											setForm((prev) => ({ ...prev, notes: e.target.value }));
											setFormErrors((prev) => ({ ...prev, notes: undefined, form: undefined }));
										}}
										placeholder="e.g., Employee forgot to clock out after the client meeting..."
										rows={3}
										className={`rounded-lg shadow-sm resize-none ${formErrors.notes ? "border-red-500 ring-1 ring-red-500/20" : "border-neutral-200"}`}
									/>
									{formErrors.notes && <p className="text-xs text-red-600 font-medium">{formErrors.notes}</p>}
								</div>
							</div>
						</div>

						{formErrors.form && (
							<div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 mt-4">
								<AlertCircle className="h-4 w-4" />
								{formErrors.form}
							</div>
						)}

						<div className="flex justify-end gap-3 pt-6">
							<Button
								variant="outline"
								onClick={() => onOpenChange(false)}
								disabled={activeMutation.isPending}
							>
								Cancel
							</Button>
							<Button
								onClick={handleSubmit}
								disabled={activeMutation.isPending}
							>
								{activeMutation.isPending ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Saving...
									</>
								) : (
									isBackfill ? "Save Missing Record" : "Save Correction"
								)}
							</Button>
						</div>
					</>
				)}
			</div>
		</Modal>
	);
}
