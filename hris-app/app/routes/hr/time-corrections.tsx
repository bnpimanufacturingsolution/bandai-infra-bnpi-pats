import { useMemo } from "react";

import { useSearchParams } from "react-router-dom";
import { Button } from "~/components/atoms/Button";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { Modal } from "~/components/atoms/Modal";
import { DepartmentSectionPicker } from "~/components/molecules/DepartmentSectionPicker";

import { EmployeeTableCell } from "~/components/molecules/EmployeeTableCell";

import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";

import { useAuth } from "~/lib/hooks/use-auth";
import { useAttendance, useAttendances } from "~/lib/hooks/useAttendances";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useEmployees } from "~/lib/hooks/useEmployees";
import {
	getAttendanceDisplayStatus,
	getAttendanceStatusBadgeClass,
} from "~/lib/utils/attendance-status";
import { formatDate } from "~/lib/utils/text-utils";
import {
	ATTENDANCE_CORRECTION_REASON_CATEGORY_OPTIONS,
	type Attendance,
	type AttendanceCorrectionReasonCategory,
} from "~/services/attendance.service";

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
	reasonCategory: AttendanceCorrectionReasonCategory;
	notes: string;
};

type CorrectionFormErrors = Partial<Record<keyof CorrectionFormState | "form", string>>;

const NON_WORK_CORRECTION_STATUSES = new Set(["ABSENT", "LEAVE", "REST_DAY"]);
const WORKDAY_CORRECTION_STATUSES = new Set(["PRESENT", "INCOMPLETE"]);

const CORRECTION_REASON_LABELS: Record<AttendanceCorrectionReasonCategory, string> = {
	MISSED_PUNCH: "Missed Punch",
	WRONG_STATUS: "Wrong Status",
	MANUAL_REVIEW: "Manual Review",
	DEVICE_SYNC: "Device Sync Issue",
};

const getAttendanceEmployeeName = (attendance?: Attendance | null) => {
	const firstName = attendance?.employee?.person?.personalInfo?.firstName || "";
	const lastName = attendance?.employee?.person?.personalInfo?.lastName || "";
	return `${firstName} ${lastName}`.trim() || attendance?.employee?.employeeId || "-";
};

const getAttendanceEmployeeCode = (attendance?: Attendance | null) =>
	attendance?.employee?.employeeId || "-";

const getAppliedByName = (attendance?: Attendance | null) =>
	attendance?.appliedByEmployee?.name || attendance?.appliedByEmployee?.employeeId || "HR";

export const getCorrectionSourceLabel = (attendance?: Attendance | null) => {
	const source = String(attendance?.deviceInfo?.source || "").trim().toUpperCase();
	if (source === "ATTENDANCE_CORRECTION_REQUEST") return "Approved request";
	if (source === "LEAVE_REQUEST_APPROVAL") return "Approved leave request";
	if (source === "HR_DIRECT_CORRECTION") return "Direct HR correction";
	if (source === "HR_DIRECT_BACKFILL") return "Direct HR backfill";
	return "Attendance correction";
};

const getCorrectionReasonLabel = (attendance?: Attendance | null) => {
	const reasonCategory = String(attendance?.deviceInfo?.reasonCategory || "")
		.trim()
		.toUpperCase() as AttendanceCorrectionReasonCategory;
	return CORRECTION_REASON_LABELS[reasonCategory] || "-";
};

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

export const formatCorrectionWindow = (status?: string, timeIn?: string, timeOut?: string) => {
	const normalizedStatus = String(status || "-").toUpperCase();
	if (NON_WORK_CORRECTION_STATUSES.has(normalizedStatus)) {
		if (normalizedStatus === "LEAVE") return "Leave day";
		if (normalizedStatus === "ABSENT") return "Marked absent";
		if (normalizedStatus === "REST_DAY") return "Rest day";
	}
	if (!timeIn && !timeOut) return normalizedStatus;
	if (timeIn && timeOut) {
		return `${formatTimeForDisplay(timeIn)} to ${formatTimeForDisplay(timeOut)}`;
	}
	if (timeIn) return `From ${formatTimeForDisplay(timeIn)}`;
	if (timeOut) return `Until ${formatTimeForDisplay(timeOut)}`;
	return normalizedStatus;
};

export const statusUsesWorkedWindow = (status?: string) =>
	WORKDAY_CORRECTION_STATUSES.has(String(status || "").toUpperCase());

export const parseWorkedWindowMinutes = (value?: string) => {
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

const statusRequiresFullWindow = (status?: string) =>
	String(status || "").toUpperCase() === "PRESENT";

export const validateCorrectionForm = (form: CorrectionFormState): CorrectionFormErrors => {
	const errors: CorrectionFormErrors = {};

	if (!form.employeeId) errors.employeeId = "Employee is required.";
	if (!form.correctionDate) errors.correctionDate = "Correction date is required.";
	if (!form.reasonCategory) errors.reasonCategory = "Reason is required.";
	if (!form.notes.trim()) errors.notes = "Explanation is required for attendance corrections.";

	if (!statusUsesWorkedWindow(form.status)) {
		return errors;
	}

	const hasTimeIn = Boolean(form.timeIn.trim());
	const hasTimeOut = Boolean(form.timeOut.trim());
	const requiresFullWindow = statusRequiresFullWindow(form.status);
	const isIncomplete = String(form.status || "").toUpperCase() === "INCOMPLETE";

	if (requiresFullWindow && !hasTimeIn) {
		errors.timeIn = "Time In is required for worked-day corrections.";
	}

	if (requiresFullWindow && !hasTimeOut) {
		errors.timeOut = "Time Out is required for worked-day corrections.";
	}

	if (isIncomplete && !hasTimeIn) {
		errors.timeIn = "Time In is required for incomplete corrections.";
	}

	const timeInMinutes = hasTimeIn ? parseWorkedWindowMinutes(form.timeIn) : null;
	const timeOutMinutes = hasTimeOut ? parseWorkedWindowMinutes(form.timeOut) : null;

	if (hasTimeIn && timeInMinutes === null) {
		errors.timeIn = "Time In must use a valid 24-hour time format.";
	}

	if (hasTimeOut && timeOutMinutes === null) {
		errors.timeOut = "Time Out must use a valid 24-hour time format.";
	}

	if (timeInMinutes !== null && timeOutMinutes !== null && timeOutMinutes <= timeInMinutes) {
		errors.timeOut = "Time Out must be later than Time In.";
	}

	return errors;
};

export default function HRTimeCorrectionsPage() {
	const { user } = useAuth();
	const [searchParams, setSearchParams] = useSearchParams();

	const selectedStatus = searchParams.get("status") || "all";
	const selectedDepartment = searchParams.get("department") || "all";
	const action = searchParams.get("action");
	const activeId = searchParams.get("id") || "";

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

	const clearModalParams = (preserveFilters = true) => {
		setSearchParams((prev) => {
			const next = preserveFilters ? new URLSearchParams(prev) : new URLSearchParams();
			[
				"action",
				"id",
				"source",
				"mode",
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
					<span className="text-xs text-gray-500">
						{getCorrectionSourceLabel(item)}
					</span>
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
									<div>Source: {getCorrectionSourceLabel(activeCorrection)}</div>
									<div>Reason Category: {getCorrectionReasonLabel(activeCorrection)}</div>
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
