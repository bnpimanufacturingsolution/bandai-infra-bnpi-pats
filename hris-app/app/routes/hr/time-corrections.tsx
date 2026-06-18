import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "~/components/atoms/Button";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { Modal } from "~/components/atoms/Modal";
import { DepartmentSectionPicker } from "~/components/molecules/DepartmentSectionPicker";
import { TimePicker } from "~/components/molecules/TimePicker";
import { EmployeeTableCell } from "~/components/molecules/EmployeeTableCell";
import { CalendarDatePicker } from "~/components/ui/calendar-date-picker";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { useAuth } from "~/lib/hooks/use-auth";
import {
	useAttendance,
	useAttendances,
	useCreateAttendanceCorrection,
} from "~/lib/hooks/useAttendances";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useEmployees } from "~/lib/hooks/useEmployees";
import {
	getAttendanceDisplayStatus,
	getAttendanceStatusBadgeClass,
} from "~/lib/utils/attendance-status";
import { formatDate } from "~/lib/utils/text-utils";
import type { Attendance } from "~/services/attendance.service";

type EmployeeOption = {
	id: string;
	employeeId: string;
	fullName: string;
	departmentId?: string;
	departmentName?: string;
	positionTitle?: string;
};

type CorrectionFormState = {
	employeeId: string;
	correctionDate: string;
	status: string;
	timeIn: string;
	timeOut: string;
	reasonCategory: string;
	notes: string;
};

type CorrectionFormErrors = Partial<Record<keyof CorrectionFormState | "form", string>>;

const DEFAULT_FORM: CorrectionFormState = {
	employeeId: "",
	correctionDate: "",
	status: "PRESENT",
	timeIn: "",
	timeOut: "",
	reasonCategory: "MISSED_PUNCH",
	notes: "",
};

const NON_WORK_CORRECTION_STATUSES = new Set(["ABSENT", "LEAVE", "REST_DAY"]);

const getAttendanceEmployeeName = (attendance?: Attendance | null) => {
	const firstName = attendance?.employee?.person?.personalInfo?.firstName || "";
	const lastName = attendance?.employee?.person?.personalInfo?.lastName || "";
	return `${firstName} ${lastName}`.trim() || attendance?.employee?.employeeId || "-";
};

const getAttendanceEmployeeCode = (attendance?: Attendance | null) =>
	attendance?.employee?.employeeId || "-";

const getAppliedByName = (attendance?: Attendance | null) =>
	attendance?.appliedByEmployee?.name || attendance?.appliedByEmployee?.employeeId || "HR";

const getParamValue = (params: URLSearchParams, key: string) => params.get(key) || "";

const toInputDate = (value: string) => value.slice(0, 10);

const toPickerTimeValue = (value: string) => {
	const trimmed = value.trim();
	if (!trimmed) return "";

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

const formatTimeForDisplay = (value: string) => {
	const isoCandidate = new Date(value);
	if (value && !Number.isNaN(isoCandidate.getTime()) && value.includes("T")) {
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

const formatCorrectionWindow = (status?: string, timeIn?: string, timeOut?: string) => {
	const normalizedStatus = String(status || "-").toUpperCase();
	if (normalizedStatus === "LEAVE") return "Leave day";
	if (normalizedStatus === "ABSENT") return "Marked absent";
	if (normalizedStatus === "REST_DAY") return "Rest day";
	if (!timeIn && !timeOut) return normalizedStatus;
	return `${formatTimeForDisplay(timeIn || "")} to ${formatTimeForDisplay(timeOut || "")}`;
};

const statusUsesWorkedWindow = (status?: string) =>
	!NON_WORK_CORRECTION_STATUSES.has(String(status || "").toUpperCase());

const parseWorkedWindowMinutes = (value?: string) => {
	const normalized = String(value || "").trim();
	const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
	if (!match) return null;

	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (
		Number.isNaN(hours) ||
		Number.isNaN(minutes) ||
		hours < 0 ||
		hours > 23 ||
		minutes < 0 ||
		minutes > 59
	) {
		return null;
	}

	return hours * 60 + minutes;
};

const validateCorrectionForm = (form: CorrectionFormState): CorrectionFormErrors => {
	const errors: CorrectionFormErrors = {};

	if (!form.employeeId) errors.employeeId = "Employee is required.";
	if (!form.correctionDate) errors.correctionDate = "Correction date is required.";
	if (!form.reasonCategory) errors.reasonCategory = "Reason is required.";

	if (!statusUsesWorkedWindow(form.status)) {
		return errors;
	}

	if (!form.timeIn.trim()) {
		errors.timeIn = "Time In is required for worked-day corrections.";
	}

	if (!form.timeOut.trim()) {
		errors.timeOut = "Time Out is required for worked-day corrections.";
	}

	const timeInMinutes = parseWorkedWindowMinutes(form.timeIn);
	const timeOutMinutes = parseWorkedWindowMinutes(form.timeOut);

	if (form.timeIn.trim() && timeInMinutes === null) {
		errors.timeIn = "Time In must use a valid 24-hour time format.";
	}

	if (form.timeOut.trim() && timeOutMinutes === null) {
		errors.timeOut = "Time Out must use a valid 24-hour time format.";
	}

	if (timeInMinutes !== null && timeOutMinutes !== null && timeOutMinutes <= timeInMinutes) {
		errors.timeOut = "Time Out must be later than Time In.";
	}

	return errors;
};

const extractCorrectionErrors = (error: any): CorrectionFormErrors => {
	const nextErrors: CorrectionFormErrors = {};
	const fieldErrors = Array.isArray(error?.errors) ? error.errors : [];

	fieldErrors.forEach((fieldError: any) => {
		const field = String(fieldError?.field || "").trim();
		const message = String(fieldError?.message || "Invalid value");
		if (!field) {
			nextErrors.form = message;
			return;
		}

		if (
			field === "employeeId" ||
			field === "correctionDate" ||
			field === "timeIn" ||
			field === "timeOut" ||
			field === "reasonCategory" ||
			field === "notes" ||
			field === "status"
		) {
			nextErrors[field] = message;
			return;
		}

		nextErrors.form = nextErrors.form || message;
	});

	if (!nextErrors.form && error?.message) {
		nextErrors.form = String(error.message);
	}

	return nextErrors;
};

export default function HRTimeCorrectionsPage() {
	const navigate = useNavigate();
	const { user } = useAuth();
	const [searchParams, setSearchParams] = useSearchParams();
	const [form, setForm] = useState<CorrectionFormState>(DEFAULT_FORM);
	const [formErrors, setFormErrors] = useState<CorrectionFormErrors>({});

	const selectedStatus = searchParams.get("status") || "all";
	const selectedDepartment = searchParams.get("department") || "all";
	const action = searchParams.get("action");
	const activeId = searchParams.get("id") || "";
	const source = searchParams.get("source") || "";
	const isCreateOpen = action === "create";

	const { data: departmentsData } = useDepartments({ page: 1, limit: 1000 });
	const departments = (departmentsData as any)?.departments || [];

	const { data: employeesData } = useEmployees({
		page: 1,
		limit: 1000,
		sort: "employeeId",
		order: "asc",
	});
	const employees = useMemo<EmployeeOption[]>(() => {
		const rawEmployees = Array.isArray((employeesData as any)?.data)
			? (employeesData as any).data
			: (employeesData as any)?.data?.employees || (employeesData as any)?.employees || [];

		return rawEmployees.map((employee: any) => {
			const firstName = employee.person?.personalInfo?.firstName || "";
			const lastName = employee.person?.personalInfo?.lastName || "";
			return {
				id: employee.id,
				employeeId: employee.employeeId || "",
				fullName:
					`${firstName} ${lastName}`.trim() || employee.employeeId || "Unknown Employee",
				departmentId: employee.department?.id,
				departmentName: employee.department?.name,
				positionTitle: employee.position?.title,
			};
		});
	}, [employeesData]);

	const createCorrectionMutation = useCreateAttendanceCorrection();

	const { data: attendancesData, isLoading } = useAttendances({
		page: 1,
		limit: 100,
		sort: "appliedAt",
		order: "desc",
		filter: { ledgerType: "CORRECTION" },
	});

	const correctionRows = useMemo(() => {
		const raw = ((attendancesData as any)?.attendances || []) as Attendance[];
		return raw.filter((attendance) => {
			if (String(attendance.ledgerType || "").toUpperCase() !== "CORRECTION") return false;
			if (selectedDepartment !== "all") {
				const departmentName = attendance.employee?.department?.name;
				const departmentId = employees.find(
					(employee) => employee.id === attendance.employeeId,
				)?.departmentId;
				if (departmentId !== selectedDepartment && departmentName !== selectedDepartment)
					return false;
			}
			if (
				selectedStatus !== "all" &&
				String(attendance.status || "").toUpperCase() !== selectedStatus
			) {
				return false;
			}
			return true;
		});
	}, [attendancesData, employees, selectedDepartment, selectedStatus]);

	const activeCorrectionQuery = useAttendance(activeId);
	const activeCorrection =
		(activeCorrectionQuery.data as Attendance | undefined) ||
		correctionRows.find((attendance) => attendance.id === activeId);

	const selectedEmployee = useMemo(() => {
		if (!form.employeeId) return null;
		return (
			employees.find((employee) => employee.id === form.employeeId) ||
			employees.find((employee) => employee.employeeId === form.employeeId) ||
			null
		);
	}, [employees, form.employeeId]);

	const correctionUsesWorkedWindow = useMemo(
		() => statusUsesWorkedWindow(form.status),
		[form.status],
	);

	const correctionPreview = useMemo(() => {
		const attendanceStatus = getParamValue(searchParams, "status") || "-";
		const attendanceTimeIn = getParamValue(searchParams, "timeIn") || "-";
		const attendanceTimeOut = getParamValue(searchParams, "timeOut") || "-";
		const attendanceNotes = getParamValue(searchParams, "notes") || "-";

		return {
			status: attendanceStatus,
			timeIn: attendanceTimeIn,
			timeOut: attendanceTimeOut,
			notes: attendanceNotes,
		};
	}, [searchParams]);

	useEffect(() => {
		if (!isCreateOpen) return;

		const employeeId = getParamValue(searchParams, "employeeId");
		const employeeCode = getParamValue(searchParams, "employeeCode");
		const matchedEmployee =
			employees.find((employee) => employee.id === employeeId) ||
			employees.find((employee) => employee.employeeId === employeeCode) ||
			null;

		setForm({
			employeeId: matchedEmployee?.id || employeeId || "",
			correctionDate: toInputDate(getParamValue(searchParams, "attendanceDate")),
			status: getParamValue(searchParams, "status") || "PRESENT",
			timeIn: toPickerTimeValue(getParamValue(searchParams, "timeIn")),
			timeOut: toPickerTimeValue(getParamValue(searchParams, "timeOut")),
			reasonCategory: "MISSED_PUNCH",
			notes: getParamValue(searchParams, "notes"),
		});
		setFormErrors({});
	}, [employees, isCreateOpen, searchParams]);

	const clearModalParams = (preserveFilters = true) => {
		setSearchParams((prev) => {
			const next = preserveFilters ? new URLSearchParams(prev) : new URLSearchParams();
			[
				"action",
				"id",
				"source",
				"employeeId",
				"employeeCode",
				"employeeName",
				"attendanceDate",
				"attendanceId",
				"timesheetId",
				"status",
				"timeIn",
				"timeOut",
				"notes",
			].forEach((key) => next.delete(key));
			return next;
		});
	};

	const updateParam = (key: string, value: string) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			if (value === "all") next.delete(key);
			else next.set(key, value);
			return next;
		});
	};

	const handleCorrectionStatusChange = (value: string) => {
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

	const handleCreateCorrection = async () => {
		if (!selectedEmployee) {
			setFormErrors((prev) => ({
				...prev,
				employeeId: "Employee is required.",
				form: undefined,
			}));
			return;
		}

		const validationErrors = validateCorrectionForm(form);
		if (Object.keys(validationErrors).length > 0) {
			setFormErrors(validationErrors);
			return;
		}

		setFormErrors({});

		try {
			await createCorrectionMutation.mutateAsync({
				attendanceId: getParamValue(searchParams, "attendanceId"),
				employeeId: selectedEmployee.id,
				correctionDate: form.correctionDate,
				status: form.status as "PRESENT" | "LEAVE" | "INCOMPLETE" | "ABSENT" | "REST_DAY",
				timeIn: form.timeIn || undefined,
				timeOut: form.timeOut || undefined,
				reasonCategory: form.reasonCategory,
				notes: form.notes,
			});

			setForm(DEFAULT_FORM);
			setFormErrors({});
			clearModalParams();
		} catch (error) {
			setFormErrors(extractCorrectionErrors(error));
		}
	};

	const columns: Column<Attendance>[] = [
		{
			key: "employee",
			label: "Employee",
			width: "250px",
			render: (_, item) => {
				return (
					<EmployeeTableCell
						profileId={item.employee?.id}
						fullName={getAttendanceEmployeeName(item)}
						employeeId={getAttendanceEmployeeCode(item)}
					/>
				);
			},
		},
		{
			key: "correctionDate",
			label: "Correction Date",
			width: "140px",
			render: (_, item) => formatDate(item.date, "short"),
		},
		{
			key: "correctedSummary",
			label: "Ledger Change",
			width: "300px",
			render: (_, item) => {
				const original =
					item.rawAttendance ||
					item.attendanceHistory?.find((row) => row.ledgerType === "RAW");
				const corrected = item.effectiveAttendance || item;
				return (
					<div className="space-y-2 text-xs">
						<div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
							<div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
								Original
							</div>
							<div className="mt-1 text-sm text-gray-700">
								{formatCorrectionWindow(
									original?.status || "-",
									original?.timeIn || "",
									original?.timeOut || "",
								)}
							</div>
						</div>
						<div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
							<div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
								Effective
							</div>
							<div className="mt-1 text-sm font-medium text-emerald-900">
								{formatCorrectionWindow(
									corrected?.status || "-",
									corrected?.timeIn || "",
									corrected?.timeOut || "",
								)}
							</div>
						</div>
					</div>
				);
			},
		},
		{
			key: "appliedByEmployee",
			label: "Corrected By",
			width: "170px",
			render: (_, item) => (
				<div className="flex flex-col">
					<span className="text-sm font-medium text-gray-900">
						{getAppliedByName(item)}
					</span>
					<span className="text-xs text-gray-500">HR correction</span>
				</div>
			),
		},
		{
			key: "status",
			label: "Effective Status",
			width: "140px",
			render: (value) => {
				const displayStatus = getAttendanceDisplayStatus({
					status: String(value || "PRESENT"),
				});
				return (
					<span
						className={`inline-flex max-w-full items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-4 ${getAttendanceStatusBadgeClass(displayStatus)}`}>
						{displayStatus}
					</span>
				);
			},
		},
		{
			key: "appliedAt",
			label: "Applied",
			width: "140px",
			render: (value, item) => (
				<div className="flex flex-col">
					<span className="text-sm text-gray-900">
						{formatDate(value || item.updatedAt, "short")}
					</span>
					<span className="text-xs text-gray-500">
						{item.isEffective === false ? "Superseded" : "Current row"}
					</span>
				</div>
			),
		},
	];

	return (
		<div className="space-y-5">
			<Modal
				open={isCreateOpen}
				onOpenChange={(open) => {
					if (!open) {
						setForm(DEFAULT_FORM);
						setFormErrors({});
						clearModalParams();
					}
				}}
				title={source === "attendance" ? "Create Time Correction" : "New Time Correction"}
				description={
					source === "attendance"
						? "Review the selected attendance day and apply a correction that creates a new effective same-day attendance entry immediately."
						: "Apply an attendance correction that preserves the original row and writes a new effective ledger entry right away."
				}
				className="max-w-2xl">
				<div className="space-y-4">
					{!getParamValue(searchParams, "attendanceId") ? (
						<div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
							<div className="font-semibold">Choose a day from Attendance first</div>
							<div className="mt-1 text-xs leading-5 text-amber-800">
								Direct HR corrections apply to an existing attendance day. Open this
								modal from `/hr/attendance` so the selected day is linked to the
								correction ledger.
							</div>
						</div>
					) : null}

					<div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
						<div className="font-semibold">Attendance ledger behavior</div>
						<div className="mt-1 text-xs leading-5 text-orange-800">
							Applying a correction does not overwrite the original attendance row. It
							creates a new same-day correction entry that becomes the effective
							source for attendance, timesheets, and payroll.
						</div>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<Label>Employee</Label>
							<Select
								value={form.employeeId || undefined}
								onValueChange={(value) => {
									setForm((prev) => ({ ...prev, employeeId: value }));
									setFormErrors((prev) => ({
										...prev,
										employeeId: undefined,
										form: undefined,
									}));
								}}>
								<SelectTrigger className="h-10 rounded-xl border-neutral-200 bg-white shadow-sm">
									<SelectValue placeholder="Select employee" />
								</SelectTrigger>
								<SelectContent>
									{employees.map((employee) => (
										<SelectItem key={employee.id} value={employee.id}>
											{employee.fullName} ({employee.employeeId})
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{formErrors.employeeId ? (
								<p className="text-sm text-red-600">{formErrors.employeeId}</p>
							) : null}
						</div>
						<div className="space-y-2">
							<Label>Correction Date</Label>
							<CalendarDatePicker
								value={form.correctionDate}
								onChange={(value) => {
									setForm((prev) => ({ ...prev, correctionDate: value }));
									setFormErrors((prev) => ({
										...prev,
										correctionDate: undefined,
										form: undefined,
									}));
								}}
								placeholder="Select correction date"
								className="h-10 rounded-xl border-neutral-200 bg-white shadow-sm"
							/>
							{formErrors.correctionDate ? (
								<p className="text-sm text-red-600">{formErrors.correctionDate}</p>
							) : null}
						</div>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						<div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
							<Label className="text-xs uppercase tracking-wide text-gray-500">
								Original Day
							</Label>
							<div className="mt-2 space-y-1 text-sm text-gray-700">
								<div>Status: {correctionPreview.status || "-"}</div>
								<div>Time In: {formatTimeForDisplay(correctionPreview.timeIn)}</div>
								<div>
									Time Out: {formatTimeForDisplay(correctionPreview.timeOut)}
								</div>
							</div>
						</div>
						<div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
							<Label className="text-xs uppercase tracking-wide text-orange-700">
								Effective Ledger Result
							</Label>
							<div className="mt-2 space-y-2 text-sm text-orange-900">
								<div className="font-medium">
									{formatCorrectionWindow(form.status, form.timeIn, form.timeOut)}
								</div>
								<div className="rounded-lg border border-orange-200/80 bg-white/70 px-3 py-2 text-xs font-medium text-orange-800">
									Status: {form.status || "-"}
									{correctionUsesWorkedWindow ? (
										<>
											{" "}
											| Window:{" "}
											{form.timeIn || form.timeOut
												? `${formatTimeForDisplay(form.timeIn)} - ${formatTimeForDisplay(form.timeOut)}`
												: "No corrected time set yet"}
										</>
									) : (
										" | No clock-in / clock-out values required"
									)}
								</div>
								<div className="text-xs text-orange-700">
									The original attendance stays preserved. The applied correction
									becomes the effective row used by timesheets and payroll for
									this date.
								</div>
							</div>
						</div>
					</div>

					<div className="rounded-xl border border-neutral-200 bg-white p-4">
						<Label className="text-xs uppercase tracking-wide text-gray-500">
							Correction
						</Label>
						<div className="mt-3 grid gap-4 md:grid-cols-2">
							<div className="space-y-2">
								<Label>Status</Label>
								<Select
									value={form.status}
									onValueChange={handleCorrectionStatusChange}>
									<SelectTrigger className="h-10 rounded-xl border-neutral-200 bg-white shadow-sm">
										<SelectValue placeholder="Select corrected status" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="PRESENT">Present</SelectItem>
										<SelectItem value="ABSENT">Absent</SelectItem>
										<SelectItem value="LEAVE">Leave</SelectItem>
										<SelectItem value="REST_DAY">Rest Day</SelectItem>
										<SelectItem value="INCOMPLETE">Incomplete</SelectItem>
									</SelectContent>
								</Select>
								{formErrors.status ? (
									<p className="text-sm text-red-600">{formErrors.status}</p>
								) : null}
							</div>
							<div className="space-y-2">
								<Label>Reason</Label>
								<Select
									value={form.reasonCategory}
									onValueChange={(value) => {
										setForm((prev) => ({ ...prev, reasonCategory: value }));
										setFormErrors((prev) => ({
											...prev,
											reasonCategory: undefined,
											form: undefined,
										}));
									}}>
									<SelectTrigger className="h-10 rounded-xl border-neutral-200 bg-white shadow-sm">
										<SelectValue placeholder="Select reason" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="MISSED_PUNCH">Missed Punch</SelectItem>
										<SelectItem value="WRONG_STATUS">Wrong Status</SelectItem>
										<SelectItem value="MANUAL_REVIEW">Manual Review</SelectItem>
										<SelectItem value="DEVICE_SYNC">
											Device Sync Issue
										</SelectItem>
									</SelectContent>
								</Select>
								{formErrors.reasonCategory ? (
									<p className="text-sm text-red-600">
										{formErrors.reasonCategory}
									</p>
								) : null}
							</div>
							<div className="space-y-2">
								<Label>Corrected Time In</Label>
								<TimePicker
									value={form.timeIn}
									onChange={(value) => {
										setForm((prev) => ({ ...prev, timeIn: value }));
										setFormErrors((prev) => ({
											...prev,
											timeIn: undefined,
											timeOut: undefined,
											form: undefined,
										}));
									}}
									disabled={!correctionUsesWorkedWindow}
									className="h-10 rounded-xl border-neutral-200 bg-white shadow-sm"
								/>
								{formErrors.timeIn ? (
									<p className="text-sm text-red-600">{formErrors.timeIn}</p>
								) : null}
							</div>
							<div className="space-y-2">
								<Label>Corrected Time Out</Label>
								<TimePicker
									value={form.timeOut}
									onChange={(value) => {
										setForm((prev) => ({ ...prev, timeOut: value }));
										setFormErrors((prev) => ({
											...prev,
											timeOut: undefined,
											form: undefined,
										}));
									}}
									disabled={!correctionUsesWorkedWindow}
									className="h-10 rounded-xl border-neutral-200 bg-white shadow-sm"
								/>
								{formErrors.timeOut ? (
									<p className="text-sm text-red-600">{formErrors.timeOut}</p>
								) : null}
							</div>
							<div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-3 py-2 text-xs leading-5 text-gray-600 md:col-span-2">
								{correctionUsesWorkedWindow
									? "Use corrected clock-in and clock-out values for workday statuses like Present or Incomplete. These values become the effective attendance window immediately."
									: "Absent, Leave, and Rest Day do not use a worked time window. Corrected Time In and Time Out are cleared automatically and will be saved as no value."}
							</div>
							<div className="space-y-2 md:col-span-2">
								<Label>Explanation</Label>
								<Textarea
									value={form.notes}
									onChange={(event) => {
										setForm((prev) => ({ ...prev, notes: event.target.value }));
										setFormErrors((prev) => ({
											...prev,
											notes: undefined,
											form: undefined,
										}));
									}}
									rows={4}
									placeholder="Add a short explanation for the correction request"
									className="rounded-xl border-neutral-200 bg-white shadow-sm"
								/>
								{formErrors.notes ? (
									<p className="text-sm text-red-600">{formErrors.notes}</p>
								) : null}
							</div>
						</div>
					</div>

					{formErrors.form ? (
						<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
							{formErrors.form}
						</div>
					) : null}

					<div className="flex justify-end gap-2 pt-2">
						<Button
							variant="outline"
							onClick={() => {
								setForm(DEFAULT_FORM);
								setFormErrors({});
								clearModalParams();
							}}>
							Cancel
						</Button>
						<Button
							onClick={handleCreateCorrection}
							disabled={
								createCorrectionMutation.isPending ||
								!getParamValue(searchParams, "attendanceId") ||
								!form.employeeId ||
								!form.correctionDate ||
								!form.reasonCategory
							}>
							{createCorrectionMutation.isPending ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Applying...
								</>
							) : (
								"Apply Correction"
							)}
						</Button>
					</div>
				</div>
			</Modal>

			<Modal
				open={action === "view" && !!activeId}
				onOpenChange={(open) => {
					if (!open) clearModalParams();
				}}
				title="Attendance Correction Details"
				description="Review the original day, the effective corrected day, and who applied the ledger change."
				className="max-w-2xl">
				{activeCorrection ? (
					<div className="space-y-4">
						<div className="grid gap-4 md:grid-cols-2">
							<div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
								<Label className="text-xs uppercase tracking-wide text-gray-500">
									Original Day
								</Label>
								<div className="mt-2 space-y-1 text-sm text-gray-700">
									<div>
										Status: {activeCorrection.rawAttendance?.status || "-"}
									</div>
									<div>
										Time In:{" "}
										{formatTimeForDisplay(
											activeCorrection.rawAttendance?.timeIn || "",
										)}
									</div>
									<div>
										Time Out:{" "}
										{formatTimeForDisplay(
											activeCorrection.rawAttendance?.timeOut || "",
										)}
									</div>
								</div>
							</div>
							<div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
								<Label className="text-xs uppercase tracking-wide text-orange-700">
									Effective Day Now
								</Label>
								<div className="mt-2 space-y-1 text-sm text-orange-900">
									<div>
										Status:{" "}
										{activeCorrection.effectiveAttendance?.status ||
											activeCorrection.status ||
											"-"}
									</div>
									<div>
										Time In:{" "}
										{formatTimeForDisplay(
											activeCorrection.effectiveAttendance?.timeIn ||
												activeCorrection.timeIn ||
												"",
										)}
									</div>
									<div>
										Time Out:{" "}
										{formatTimeForDisplay(
											activeCorrection.effectiveAttendance?.timeOut ||
												activeCorrection.timeOut ||
												"",
										)}
									</div>
								</div>
							</div>
						</div>

						<div className="grid gap-4 md:grid-cols-2">
							<div className="rounded-xl border border-neutral-200 bg-white p-4">
								<Label className="text-xs uppercase tracking-wide text-gray-500">
									Correction Audit
								</Label>
								<div className="mt-2 space-y-1 text-sm text-gray-700">
									<div>Corrected By: {getAppliedByName(activeCorrection)}</div>
									<div>
										Applied:{" "}
										{formatDate(
											activeCorrection.appliedAt ||
												activeCorrection.updatedAt,
											"short",
										)}
									</div>
									<div>
										Ledger Type: {activeCorrection.ledgerType || "CORRECTION"}
									</div>
								</div>
							</div>
							<div className="rounded-xl border border-neutral-200 bg-white p-4">
								<Label className="text-xs uppercase tracking-wide text-gray-500">
									Ledger Impact
								</Label>
								<div className="mt-2 space-y-1 text-sm text-gray-700">
									<div>
										Applied correction becomes the effective attendance row for
										this date
									</div>
									<div>
										Timesheets and payroll now read this effective day by
										default.
									</div>
								</div>
							</div>
						</div>

						<div className="rounded-xl border border-neutral-200 bg-white p-4">
							<Label className="text-xs uppercase tracking-wide text-gray-500">
								Reason
							</Label>
							<div className="mt-2 text-sm text-gray-700">
								<p>{activeCorrection.notes || "-"}</p>
							</div>
						</div>
					</div>
				) : (
					<div className="py-6 text-sm text-gray-500">Loading correction details...</div>
				)}
			</Modal>

			<DataTable
				title="Attendance Corrections"
				description={`Applied same-day attendance ledger corrections for ${user?.organization?.name || "your organization"}.`}
				data={correctionRows}
				columns={columns}
				isLoading={isLoading}
				searchPlaceholder="Search employees..."
				customFilters={
					<>
						<Select
							value={selectedStatus}
							onValueChange={(value) => updateParam("status", value)}>
							<SelectTrigger className="h-10 w-[180px] rounded-lg border-neutral-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm">
								<SelectValue placeholder="Status" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Statuses</SelectItem>
								<SelectItem value="PRESENT">Present</SelectItem>
								<SelectItem value="ABSENT">Absent</SelectItem>
								<SelectItem value="LEAVE">Leave</SelectItem>
								<SelectItem value="REST_DAY">Rest Day</SelectItem>
								<SelectItem value="INCOMPLETE">Incomplete</SelectItem>
							</SelectContent>
						</Select>

						<DepartmentSectionPicker
							variant="datatable"
							departments={departments}
							sections={[]}
							departmentId={selectedDepartment}
							onDepartmentChange={(value) => updateParam("department", value)}
							onSectionChange={(value) => updateParam("department", value)}
						/>
					</>
				}
				renderActions={(item) => (
					<Button
						variant="outline"
						size="sm"
						onClick={() =>
							setSearchParams((prev) => {
								const next = new URLSearchParams(prev);
								next.set("action", "view");
								next.set("id", item.id);
								return next;
							})
						}>
						View
					</Button>
				)}
				emptyMessage="No attendance corrections found"
				emptyDescription="Create a correction from the attendance page to write a new effective attendance ledger row."
			/>
		</div>
	);
}
