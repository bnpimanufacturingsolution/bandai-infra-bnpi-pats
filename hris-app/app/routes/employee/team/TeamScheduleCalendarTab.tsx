import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { addDays, format, startOfWeek } from "date-fns";
import type { DateRange } from "react-day-picker";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Select } from "~/components/atoms/Select";
import { ScheduleEntryModal } from "~/components/organisms/employee/schedule-entry-modal";
import { CalendarDatePicker } from "~/components/ui/calendar-date-picker";
import { DatePickerWithRange } from "~/components/ui/date-picker-range";
import { ScrollArea } from "~/components/ui/scroll-area";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useAuth } from "~/lib/hooks/use-auth";
import { useCreateScheduleOverride, useShiftTypes } from "~/lib/hooks/useSchedules";
import { useTeamScheduleCalendarGrid } from "~/lib/hooks/useEmployees";
import { cn } from "~/lib/utils";

const toDateInput = (date: Date) => format(date, "yyyy-MM-dd");
const parseDateOnly = (value: string) => {
	const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (!match) return new Date(value);
	return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

const weekdayLabel = (date: string) => {
	const parsed = parseDateOnly(date);
	if (Number.isNaN(parsed.getTime())) return "-";
	const labels = ["SU", "M", "T", "W", "T", "F", "S"];
	return labels[parsed.getDay()] || "-";
};

const dayOfMonth = (date: string) => {
	const parsed = parseDateOnly(date);
	if (Number.isNaN(parsed.getTime())) return "-";
	return String(parsed.getDate());
};

const dateKey = (value?: string | null) => {
	const text = String(value || "").trim();
	if (!text) return "";
	if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
	const fallback = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (fallback) return `${fallback[1]}-${fallback[2]}-${fallback[3]}`;
	const parsed = new Date(text);
	if (!Number.isNaN(parsed.getTime())) return toDateInput(parsed);
	return text.slice(0, 10);
};

const shortCode = (value?: string | null) => {
	const text = String(value || "").trim();
	if (!text) return "-";
	if (text.toUpperCase() === "OFF") return "OFF";
	const clean = text.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
	return clean.length <= 3 ? clean : clean.slice(0, 3);
};

const shortName = (value?: string | null) => {
	const full = String(value || "").trim();
	if (!full) return "Unknown";
	const parts = full.split(/\s+/);
	if (parts.length === 1) return parts[0];
	const first = parts[0];
	const last = parts[parts.length - 1];
	return `${last}, ${first[0]}.`;
};

const formatSlotTime12h = (value?: string | null) => {
	const text = String(value || "").trim();
	if (!text) return "";
	const [hourStr, minuteStr] = text.split(":");
	const hour = Number(hourStr);
	const minute = Number(minuteStr || "0");
	if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
		return text.length >= 5 ? text.slice(0, 5) : text;
	}
	const period = hour >= 12 ? "PM" : "AM";
	const normalizedHour = hour % 12 === 0 ? 12 : hour % 12;
	return `${normalizedHour}:${String(minute).padStart(2, "0")} ${period}`;
};

const resolveCellShiftMeta = (cell: any) => {
	const sourceSlots =
		(Array.isArray(cell?.timeSlots) && cell.timeSlots.length > 0
			? cell.timeSlots
			: Array.isArray(cell?.shift?.timeSlots)
				? cell.shift.timeSlots
				: []) || [];

	const firstWorkSlot =
		sourceSlots.find((slot: any) => String(slot?.type || "").toUpperCase() === "WORK") ||
		sourceSlots[0];
	if (!firstWorkSlot?.startTime || !firstWorkSlot?.endTime) {
		return { timeRange: "-", startHour: null as number | null };
	}

	const [startHourText] = String(firstWorkSlot.startTime).split(":");
	const startHour = Number(startHourText);
	const safeStartHour = Number.isFinite(startHour) ? startHour : null;

	const start = formatSlotTime12h(firstWorkSlot.startTime);
	const end = formatSlotTime12h(firstWorkSlot.endTime);
	if (!start || !end) return { timeRange: "-", startHour: safeStartHour };
	return { timeRange: `${start}-${end}`, startHour: safeStartHour };
};

const getShiftToneByTime = (code: string, startHour: number | null) => {
	if (code === "OFF") return "bg-slate-50 text-slate-500 border-slate-200";
	if (startHour === null) return "bg-white text-slate-700 border-slate-200";
	if (startHour >= 5 && startHour < 12) {
		return "bg-amber-50 text-amber-700 border-amber-200";
	}
	if (startHour >= 12 && startHour < 18) {
		return "bg-sky-50 text-sky-700 border-sky-200";
	}
	return "bg-violet-50 text-violet-700 border-violet-200";
};

const shiftDateRange = (from: string, to: string, dayOffset: number) => {
	const fromDate = parseDateOnly(from);
	const toDate = parseDateOnly(to);
	fromDate.setDate(fromDate.getDate() + dayOffset);
	toDate.setDate(toDate.getDate() + dayOffset);
	return {
		from: toDateInput(fromDate),
		to: toDateInput(toDate),
	};
};

const buildDateRange = (from: string, to: string) => {
	const start = parseDateOnly(from);
	const end = parseDateOnly(to);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
	const list: string[] = [];
	const cursor = new Date(start);
	while (cursor <= end) {
		list.push(toDateInput(cursor));
		cursor.setDate(cursor.getDate() + 1);
		if (list.length > 62) break;
	}
	return list;
};

const dayDiff = (fromDate: string, toDate: string) => {
	const start = parseDateOnly(fromDate);
	const end = parseDateOnly(toDate);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
	return Math.round((start.getTime() - end.getTime()) / (1000 * 60 * 60 * 24));
};

const isWeekendDate = (date: string) => {
	const parsed = parseDateOnly(date);
	if (Number.isNaN(parsed.getTime())) return false;
	return parsed.getDay() === 0 || parsed.getDay() === 6;
};

const isWeekBoundaryDate = (date: string, index: number) => {
	if (index === 0) return false;
	const parsed = parseDateOnly(date);
	if (Number.isNaN(parsed.getTime())) return false;
	return parsed.getDay() === 1;
};

const EMPLOYEE_COLUMN_WIDTH = 220;
const TWO_WEEK_DAYS = 14;

const getTwoWeekWindowFromDate = (date: Date) => {
	const weekStart = startOfWeek(date, { weekStartsOn: 1 });
	const from = parseDateOnly(toDateInput(weekStart));
	const to = parseDateOnly(toDateInput(addDays(weekStart, TWO_WEEK_DAYS - 1)));
	return { from, to };
};

export default function TeamScheduleCalendarTab() {
	const { user } = useAuth();
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const isAllowed = !!user?.metadata?.employee?.isDepartmentManager;
	const cardReasonMap: Record<string, string> = {
		MANUAL_CELL: "Auto-generated from Team Schedule Calendar: Cell-based override request.",
	};

	const todayDate = useMemo(() => parseDateOnly(toDateInput(new Date())), []);
	const [dateRange, setDateRange] = useState<DateRange | undefined>(() =>
		getTwoWeekWindowFromDate(new Date()),
	);
	const createOverrideMutation = useCreateScheduleOverride();
	const { data: shiftTypesData } = useShiftTypes(
		{ page: 1, limit: 1000, document: true, count: true },
		{ enabled: isAllowed },
	);
	const from = useMemo(
		() => toDateInput(dateRange?.from || todayDate),
		[dateRange?.from, todayDate],
	);
	const to = useMemo(
		() =>
			toDateInput(
				dateRange?.to ||
					(dateRange?.from
						? addDays(dateRange.from, TWO_WEEK_DAYS - 1)
						: addDays(todayDate, TWO_WEEK_DAYS - 1)),
			),
		[dateRange?.from, dateRange?.to],
	);

	const { data, isLoading } = useTeamScheduleCalendarGrid(
		{
			from: `${from}T00:00:00.000Z`,
			to: `${to}T23:59:59.999Z`,
		},
		{ enabled: isAllowed },
	);

	const rows = useMemo(() => data?.rows || [], [data?.rows]);
	const assignmentModalEmployee = useMemo(() => {
		if (searchParams.get("action") !== "assign-schedule") return null;
		const employeeId = String(searchParams.get("employeeId") || "").trim();
		if (!employeeId) return null;
		const employeeNameFromQuery = String(searchParams.get("employeeName") || "").trim();
		const matchedRow = rows.find((row) => String(row?.employeeId) === employeeId);
		return {
			employeeId,
			employeeName: employeeNameFromQuery || String(matchedRow?.employeeName || "Employee"),
			scheduleTemplateId:
				String(searchParams.get("scheduleTemplateId") || "").trim() || undefined,
		};
	}, [rows, searchParams]);
	const overrideModalState = useMemo(() => {
		if (searchParams.get("action") !== "create-override") return null;
		const employeeId = String(searchParams.get("employeeId") || "").trim();
		const date = String(searchParams.get("date") || "").trim();
		if (!employeeId || !date) return null;
		const matchedRow = rows.find((row) => String(row?.employeeId) === employeeId);
		return {
			employeeId,
			employeeName: String(
				searchParams.get("employeeName") || matchedRow?.employeeName || "Employee",
			).trim(),
			date,
			reason: String(searchParams.get("reason") || "").trim(),
			shiftTypeCode: String(searchParams.get("shiftTypeCode") || "")
				.trim()
				.toUpperCase(),
		};
	}, [rows, searchParams]);
	const displayDates = useMemo(() => buildDateRange(from, to), [from, to]);
	const periodLabel = useMemo(() => {
		const start = parseDateOnly(from);
		const end = parseDateOnly(to);
		if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
			return "Invalid date range";
		return `${format(start, "MMM d, yyyy")} - ${format(end, "MMM d, yyyy")}`;
	}, [from, to]);
	const shiftTypeOptions = useMemo(
		() =>
			(shiftTypesData?.shiftTypes || []).map((shiftType) => ({
				value: shiftType.id,
				label: `${shiftType.name} (${shiftType.code})`,
			})),
		[shiftTypesData?.shiftTypes],
	);
	const shiftTypeIdByCode = useMemo(
		() =>
			new Map(
				(shiftTypesData?.shiftTypes || []).map((shiftType) => [
					String(shiftType.code || "")
						.trim()
						.toUpperCase(),
					shiftType.id,
				]),
			),
		[shiftTypesData?.shiftTypes],
	);
	const skeletonRows = 8;

	const setDateRangeSafely = (range: DateRange | undefined) => {
		if (!range?.from) {
			setDateRange(getTwoWeekWindowFromDate(new Date()));
			return;
		}

		const normalized = getTwoWeekWindowFromDate(range.from);
		setDateRange({
			from: normalized.from,
			to: normalized.to,
		});
	};

	const openOverrideModal = (
		cellDate: string,
		employeeId: string,
		employeeName?: string,
		shiftCode?: string | null,
	) => {
		const fallbackDate = toDateInput(new Date());
		const selectedDate = dateKey(cellDate) || fallbackDate;
		const sourceCard = "MANUAL_CELL";
		const params = new URLSearchParams(searchParams);
		params.delete("scheduleTemplateId");
		params.set("action", "create-override");
		params.set("sourceCard", sourceCard);
		params.set("date", selectedDate);
		params.set("employeeId", String(employeeId || "").trim());
		params.set("reason", cardReasonMap[sourceCard] || cardReasonMap.MANUAL_CELL);
		if (employeeName) {
			params.set("employeeName", employeeName);
		} else {
			params.delete("employeeName");
		}
		const normalizedShiftCode = String(shiftCode || "").trim();
		if (normalizedShiftCode && normalizedShiftCode !== "-") {
			params.set("shiftTypeCode", normalizedShiftCode);
		} else {
			params.delete("shiftTypeCode");
		}
		setSearchParams(params, { replace: true });
	};

	const closeOverrideModal = () => {
		const nextParams = new URLSearchParams(searchParams);
		nextParams.delete("action");
		nextParams.delete("sourceCard");
		nextParams.delete("date");
		nextParams.delete("employeeId");
		nextParams.delete("employeeName");
		nextParams.delete("shiftTypeCode");
		nextParams.delete("reason");
		setSearchParams(nextParams, { replace: true });
	};

	const submitOverride = async () => {
		if (!overrideModalState) return;
		const mappedShiftTypeId = shiftTypeIdByCode.get(overrideModalState.shiftTypeCode) || "";
		const selectedShiftTypeId =
			String(searchParams.get("shiftTypeId") || "").trim() || mappedShiftTypeId;
		const reason = String(searchParams.get("reason") || "").trim();
		if (!selectedShiftTypeId) return;
		await createOverrideMutation.mutateAsync({
			employeeId: overrideModalState.employeeId,
			date: overrideModalState.date,
			shiftTypeId: selectedShiftTypeId,
			reason: reason || null,
				createdByEmployeeId: user?.metadata?.employee?.id || null,
		});
		closeOverrideModal();
	};

	const overrideShiftTypeId =
		String(searchParams.get("shiftTypeId") || "").trim() ||
		(overrideModalState ? shiftTypeIdByCode.get(overrideModalState.shiftTypeCode) || "" : "");

	const setOverrideSearchParam = (key: string, value?: string | null) => {
		const nextParams = new URLSearchParams(searchParams);
		const normalized = value === undefined || value === null ? "" : String(value);
		if (normalized.length > 0) {
			nextParams.set(key, normalized);
		} else {
			nextParams.delete(key);
		}
		setSearchParams(nextParams, { replace: true });
	};

	const viewEmployeeProfile = (employeeId: string) => {
		navigate(`/employee/${employeeId}?tab=schedule&from=employee-team-schedule-calendar`);
	};

	const openAssignmentModal = (
		employeeId: string,
		employeeName?: string,
		scheduleTemplateId?: string,
	) => {
		const nextParams = new URLSearchParams(searchParams);
		nextParams.set("action", "assign-schedule");
		nextParams.delete("date");
		nextParams.delete("shiftTypeId");
		nextParams.delete("shiftTypeCode");
		nextParams.delete("reason");
		nextParams.delete("sourceCard");
		nextParams.set("employeeId", employeeId);
		if (employeeName) {
			nextParams.set("employeeName", employeeName);
		} else {
			nextParams.delete("employeeName");
		}
		if (scheduleTemplateId) {
			nextParams.set("scheduleTemplateId", scheduleTemplateId);
		} else {
			nextParams.delete("scheduleTemplateId");
		}
		setSearchParams(nextParams, { replace: true });
	};

	const closeAssignmentModal = () => {
		const nextParams = new URLSearchParams(searchParams);
		nextParams.delete("action");
		nextParams.delete("employeeId");
		nextParams.delete("employeeName");
		nextParams.delete("scheduleTemplateId");
		setSearchParams(nextParams, { replace: true });
	};

	if (!isAllowed) {
		return (
			<div className="border border-red-200 bg-red-50 p-6 rounded-none">
				<h1 className="text-lg font-semibold text-red-800">Access restricted</h1>
				<p className="mt-1 text-sm text-red-700">
					You are not allowed to access Department Shift Ledger.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-4 px-4 pb-5 md:px-5 xl:px-6">
			<section className="pb-1">
				<div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
					<div className="min-w-0 space-y-0.5">
						<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-600">
							Team Schedule Calendar
						</p>
						<h1 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] text-gray-900">
							{periodLabel}
						</h1>
					</div>
					<div className="flex w-full flex-col gap-2 xl:w-auto xl:min-w-[700px] xl:flex-row xl:items-center xl:justify-end">
						<div className="flex flex-wrap items-center gap-2 xl:justify-end">
							<Button
								type="button"
								variant="outline"
								className="h-10 rounded-lg border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 shadow-none hover:border-orange-300 hover:text-orange-700"
								onClick={() => {
									const next = shiftDateRange(from, to, -TWO_WEEK_DAYS);
									setDateRangeSafely({
										from: parseDateOnly(next.from),
										to: parseDateOnly(next.to),
									});
								}}>
								<ChevronLeft className="mr-1 h-4 w-4" />
								Prev
							</Button>
							<Button
								type="button"
								variant="outline"
								className="h-10 rounded-lg border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 shadow-none hover:border-orange-300 hover:text-orange-700"
								onClick={() => {
									const next = shiftDateRange(from, to, TWO_WEEK_DAYS);
									setDateRangeSafely({
										from: parseDateOnly(next.from),
										to: parseDateOnly(next.to),
									});
								}}>
								Next
								<ChevronRight className="ml-1 h-4 w-4" />
							</Button>
						</div>
						<div className="w-full xl:w-[320px]">
							<DatePickerWithRange
								value={dateRange}
								onChange={setDateRangeSafely}
								placeholder="Select date range"
								className="w-full [&_button]:h-10 [&_button]:rounded-lg [&_button]:border-gray-200 [&_button]:bg-white [&_button]:px-4 [&_button]:text-sm [&_button]:font-medium [&_button]:text-gray-700 [&_button]:shadow-none"
							/>
						</div>
					</div>
				</div>
			</section>

			<div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
				<ScrollArea className="w-full">
					<div className="w-full">
						<div
							className="grid border-b border-slate-200 bg-slate-50/80"
							style={{
								gridTemplateColumns: `${EMPLOYEE_COLUMN_WIDTH}px repeat(${displayDates.length || 1}, minmax(0, 1fr))`,
							}}>
							<div className="px-5 py-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
								Employee
							</div>
							{displayDates.map((date, index) => (
								<div
									key={date}
									className={cn(
										"flex h-[56px] flex-col items-center justify-center border-l border-slate-100 px-0.5 text-center",
										isWeekendDate(date) && "bg-slate-50/70",
										isWeekBoundaryDate(date, index) && "border-l-slate-300",
									)}>
									<p className="text-[10px] font-semibold uppercase text-slate-500">
										{weekdayLabel(date)}
									</p>
									<p className="mt-1 text-xs font-medium text-slate-400">
										{dayOfMonth(date)}
									</p>
								</div>
							))}
						</div>

						{isLoading ? (
							Array.from({ length: skeletonRows }).map((_, rowIndex) => (
								<div
									key={`skeleton-row-${rowIndex}`}
									className="grid border-b border-slate-100"
									style={{
										gridTemplateColumns: `${EMPLOYEE_COLUMN_WIDTH}px repeat(${displayDates.length || 1}, minmax(0, 1fr))`,
									}}>
									<div className="flex min-h-[72px] items-center border-r border-slate-100 px-5 py-2">
										<div className="h-[42px] w-full animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
									</div>
									{displayDates.map((date, index) => (
										<div
											key={`skeleton-cell-${rowIndex}-${date}`}
											className={cn(
												"border-l border-slate-100 p-0.5",
												isWeekendDate(date) && "bg-slate-50/40",
												isWeekBoundaryDate(date, index) &&
													"border-l-slate-300",
											)}>
											<div className="min-h-[56px] animate-pulse rounded-none border border-slate-200 bg-slate-100" />
										</div>
									))}
								</div>
							))
						) : rows.length === 0 ? (
							<div className="p-3 text-xs text-slate-500">
								No roster entries found.
							</div>
						) : (
							rows.map((row) => {
								return (
									<div
										key={row.employeeId}
										className="grid border-b border-slate-100"
										style={{
											gridTemplateColumns: `${EMPLOYEE_COLUMN_WIDTH}px repeat(${displayDates.length || 1}, minmax(0, 1fr))`,
										}}>
										<div className="flex min-h-[72px] items-center border-r border-slate-100 px-5 py-2">
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<button
														type="button"
														className="truncate text-left text-base font-semibold tracking-[-0.01em] text-slate-700 underline-offset-2 hover:text-orange-600 hover:underline"
														title={`Open actions for ${row.employeeName || "employee"}`}>
														{shortName(row.employeeName)}
													</button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="start" className="w-40">
													<DropdownMenuItem
														onClick={() =>
															viewEmployeeProfile(
																String(row.employeeId),
															)
														}>
														View Profile
													</DropdownMenuItem>
													<DropdownMenuItem
														onClick={() =>
															openAssignmentModal(
																String(row.employeeId),
																String(
																	row.employeeName || "Employee",
																),
															)
														}>
														Assign Schedule
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</div>
										{displayDates.map((displayDate, displayIndex) => {
											const rowCells = Array.isArray(row?.cells)
												? row.cells
												: [];
											const cellByDate = new Map(
												rowCells.map((item) => [dateKey(item?.date), item]),
											);
											const firstCellDate = dateKey(rowCells[0]?.date);
											const firstDisplayDate = displayDates[0] || "";
											const offset =
												firstCellDate && firstDisplayDate
													? dayDiff(firstDisplayDate, firstCellDate)
													: 0;
											const fallbackIndex = displayIndex + offset;
											const fallbackCell =
												fallbackIndex >= 0 &&
												fallbackIndex < rowCells.length
													? rowCells[fallbackIndex]
													: null;
											const cell =
												cellByDate.get(displayDate) || fallbackCell;
											const rawCode =
												cell?.scheduleCode ||
												(cell?.isRestDay ? "OFF" : "-");
											const code = shortCode(rawCode);
											const { timeRange, startHour } =
												resolveCellShiftMeta(cell);
											const tone = getShiftToneByTime(code, startHour);

											return (
												<div
													key={`${row.employeeId}:${displayDate}`}
													className={cn(
														"border-l border-slate-100 p-0.5",
														isWeekendDate(displayDate) &&
															"bg-slate-50/55",
														isWeekBoundaryDate(
															displayDate,
															displayIndex,
														) && "border-l-slate-300",
													)}>
													<button
														type="button"
														title={`${String(rawCode)}${timeRange !== "-" ? ` • ${timeRange}` : ""}`}
														onClick={() =>
															openOverrideModal(
																cell?.date || displayDate,
																String(row.employeeId),
																String(
																	row.employeeName || "Employee",
																),
																rawCode,
															)
														}
														className={`flex min-h-[52px] w-full cursor-pointer flex-col items-center justify-center rounded-none border px-1 py-1 text-center transition-all hover:shadow-sm ${tone}`}>
														<p className="truncate text-[11px] font-semibold leading-none tracking-[0.04em]">
															{code}
														</p>
														<p className="mt-0.5 min-h-[10px] whitespace-normal text-[9px] leading-[1.1] text-slate-500">
															{timeRange !== "-" ? timeRange : ""}
														</p>
													</button>
												</div>
											);
										})}
									</div>
								);
							})
						)}
					</div>
				</ScrollArea>
			</div>
			<ScheduleEntryModal
				open={!!assignmentModalEmployee}
				onOpenChange={(open) => {
					if (!open) closeAssignmentModal();
				}}
				employeeId={assignmentModalEmployee?.employeeId || ""}
				employeeName={assignmentModalEmployee?.employeeName}
				initialScheduleSelector={assignmentModalEmployee?.scheduleTemplateId}
			/>
			<Modal
				open={!!overrideModalState}
				onOpenChange={(open) => {
					if (!open) closeOverrideModal();
				}}
				title="Create Schedule Override"
				description={
					overrideModalState
						? `Apply a one-day schedule override for ${overrideModalState.employeeName}.`
						: "Apply a one-day schedule override."
				}
				className="sm:max-w-[640px] border border-gray-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
				<div className="space-y-5">
					<div className="border-b border-gray-100 pb-4">
						<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
							Employee
						</p>
						<p className="mt-1 text-base font-semibold tracking-[-0.01em] text-slate-900">
							{overrideModalState?.employeeName || "Employee"}
						</p>
					</div>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div>
							<label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
								Date
							</label>
							<CalendarDatePicker
								value={overrideModalState?.date || ""}
								onChange={(value) => setOverrideSearchParam("date", value)}
								className="h-11 border-gray-200 bg-white"
							/>
						</div>
						<div>
							<label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
								Shift Type
							</label>
							<Select
								options={shiftTypeOptions}
								value={overrideShiftTypeId}
								onChange={(value) => setOverrideSearchParam("shiftTypeId", value)}
								placeholder="Select shift type"
								className="h-11"
							/>
						</div>
					</div>
					<div>
						<label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
							Reason
						</label>
						<Input
							value={String(searchParams.get("reason") || "")}
							onChange={(event) =>
								setOverrideSearchParam("reason", event.target.value)
							}
							placeholder="Optional reason"
							className="h-11 border-gray-200 bg-white"
						/>
					</div>
				</div>
				<div className="mt-6 flex justify-end gap-3 border-t border-gray-100 pt-4">
					<Button variant="outline" onClick={closeOverrideModal}>
						Cancel
					</Button>
					<Button
						disabled={createOverrideMutation.isPending || !overrideShiftTypeId}
						onClick={submitOverride}>
						{createOverrideMutation.isPending ? "Saving..." : "Create Override"}
					</Button>
				</div>
			</Modal>
		</div>
	);
}
