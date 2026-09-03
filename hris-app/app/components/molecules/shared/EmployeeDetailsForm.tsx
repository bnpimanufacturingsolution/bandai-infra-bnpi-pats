import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Card, CardContent } from "~/components/atoms/Card";
import { CalendarDatePicker } from "~/components/ui/calendar-date-picker";

import React, { useState, useCallback, useMemo } from "react";
import {
	Plus,
	X,
	Briefcase,
	DollarSign,
	FileText,
	Calendar,
	MapPin,
	CalendarDays,
} from "lucide-react";
import { useDepartment, useDepartments } from "~/lib/hooks/useDepartments";
import { usePositions } from "~/lib/hooks/usePositions";
import { useWorkSchedules } from "~/lib/hooks/useWorkSchedules";
import { useEmployees } from "~/lib/hooks/useEmployees";
import type { Department, Position } from "~/services/departments.service";
import { positionsService } from "~/services/departments.service";
import { RefreshCw, UserCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { SectionStatus } from "~/components/templates/add-employee-template";
import { getTodayDateInput } from "~/lib/utils/date-validation";

interface EmployeeDetailsFormProps {
	form: any;
	onComplete: () => void;
	status: SectionStatus;
}

// These will be populated from API data

const employmentStatuses = [
	{ value: "ACTIVE", label: "Active" },
	{ value: "INACTIVE", label: "Inactive" },
	{ value: "TERMINATED", label: "Terminated" },
	{ value: "RESIGNED", label: "Resigned" },
	{ value: "RETIRED", label: "Retired" },
	{ value: "ON_LEAVE", label: "On Leave" },
];

const employmentTypes = [
	{ value: "REGULAR", label: "Regular" },
	{ value: "PROBATIONARY", label: "Probationary" },
	{ value: "CONTRACTUAL", label: "Contractual" },
	{ value: "PART_TIME", label: "Part Time" },
	{ value: "CONSULTANT", label: "Consultant" },
	{ value: "INTERN", label: "Intern" },
];

const currencies = [
	{ value: "PHP", label: "PHP - Philippine Peso" },
	{ value: "USD", label: "USD - US Dollar" },
	{ value: "EUR", label: "EUR - Euro" },
	{ value: "GBP", label: "GBP - British Pound" },
];

const payFrequencies = [
	{ value: "DAILY", label: "Daily" },
	{ value: "WEEKLY", label: "Weekly" },
	{ value: "BIWEEKLY", label: "Bi-weekly" },
	{ value: "SEMI_MONTHLY", label: "Semi-Monthly" },
	{ value: "MONTHLY", label: "Monthly" },
	{ value: "QUARTERLY", label: "Quarterly" },
	{ value: "ANNUALLY", label: "Annually" },
];

const workLocations = [
	{ value: "ONSITE", label: "Onsite" },
	{ value: "REMOTE", label: "Remote" },
	{ value: "HYBRID", label: "Hybrid" },
];

const documentTypes = [
	{ value: "SSS", label: "SSS ID" },
	{ value: "TIN", label: "TIN ID" },
	{ value: "PHILHEALTH", label: "PhilHealth ID" },
	{ value: "PAGIBIG", label: "Pag-IBIG ID" },
	{ value: "PASSPORT", label: "Passport" },
	{ value: "DRIVERS_LICENSE", label: "Driver's License" },
	{ value: "NATIONAL_ID", label: "National ID" },
	{ value: "BIRTH_CERTIFICATE", label: "Birth Certificate" },
	{ value: "MARRIAGE_CERTIFICATE", label: "Marriage Certificate" },
	{ value: "DIPLOMA", label: "Diploma" },
	{ value: "TRANSCRIPT", label: "Transcript of Records" },
	{ value: "CERTIFICATE", label: "Certificate" },
	{ value: "OTHER", label: "Other" },
];

const leaveTypes = [
	{ value: "VACATION", label: "Vacation" },
	{ value: "SICK", label: "Sick" },
	{ value: "PERSONAL", label: "Personal" },
	{ value: "MATERNITY", label: "Maternity" },
	{ value: "PATERNITY", label: "Paternity" },
	{ value: "BEREAVEMENT", label: "Bereavement" },
	{ value: "UNPAID", label: "Unpaid" },
	{ value: "COMPENSATORY", label: "Compensatory" },
];

export function EmployeeDetailsForm({ form, onComplete, status }: EmployeeDetailsFormProps) {
	const {
		register,
		formState: { errors },
		trigger,
		watch,
		setValue,
	} = form;

	// Get query client for cache invalidation
	const queryClient = useQueryClient();

	// Watch selected departmentId to filter positions
	const selectedDepartmentId = watch("employee.departmentId");
	const currentPositionId = watch("employee.positionId");
	const selectedScheduleId = watch("employee.defaultScheduleId");
	const { data: selectedDepartmentData } = useDepartment(selectedDepartmentId || "");

	// Fetch departments, positions, and work schedules from API
	const {
		data: departmentsData,
		isLoading: departmentsLoading,
		error: departmentsError,
	} = useDepartments({
		page: 1,
		limit: 1000,
	});
	const {
		data: positionsData,
		isLoading: positionsLoading,
		error: positionsError,
	} = usePositions({
		page: 1,
		limit: 1000,
	});
	const {
		data: workSchedulesData,
		isLoading: workSchedulesLoading,
		error: workSchedulesError,
		refetch: refetchWorkSchedules,
	} = useWorkSchedules(true);

	// Fetch employees for reportTo dropdown
	const {
		data: employeesData,
		isLoading: employeesLoading,
		error: employeesError,
	} = useEmployees({
		page: 1,
		limit: 1000, // Get a large number to show all employees
	});

	// Fetch positions filtered by selected department
	const [filteredPositionsData, setFilteredPositionsData] = React.useState<any>(null);
	const [filteredPositionsLoading, setFilteredPositionsLoading] = React.useState(false);

	// Effect to fetch positions by department when department is selected
	React.useEffect(() => {
		const fetchPositionsByDepartment = async () => {
			if (selectedDepartmentId) {
				setFilteredPositionsLoading(true);
				try {
					const data =
						await positionsService.getPositionsByDepartment(selectedDepartmentId);
					setFilteredPositionsData(data);
				} catch (error) {
					console.error("Error fetching positions by department:", error);
					setFilteredPositionsData(null);
				} finally {
					setFilteredPositionsLoading(false);
				}
			} else {
				setFilteredPositionsData(null);
			}
		};

		fetchPositionsByDepartment();
	}, [selectedDepartmentId]);

	// Effect to clear positionId when department changes
	// Only clear if positions are loaded and the position doesn't belong to the department
	React.useEffect(() => {
		const currentPositionId = watch("employee.positionId");

		// Don't clear if we're still loading positions
		if (filteredPositionsLoading || positionsLoading) {
			return;
		}

		if (selectedDepartmentId) {
			// Get positions array from filtered data (handle both nested and flat structures)
			const positionsArray =
				filteredPositionsData?.data?.positions || filteredPositionsData?.positions || [];

			// Also check all positions data in case filtered data is empty but position exists in full list
			const allPositionsArray = (positionsData as any)?.positions || [];

			// Check if current position belongs to selected department
			// Only clear if we have loaded positions AND the position doesn't exist
			if ((positionsArray.length > 0 || allPositionsArray.length > 0) && currentPositionId) {
				const positionExistsInFiltered = positionsArray.some(
					(pos: Position) => pos.id === currentPositionId,
				);
				const positionExistsInAll = allPositionsArray.some(
					(pos: Position) =>
						pos.id === currentPositionId &&
						pos.section?.departmentId === selectedDepartmentId,
				);

				// Only clear if position definitely doesn't belong to the selected department
				if (
					!positionExistsInFiltered &&
					!positionExistsInAll &&
					positionsArray.length > 0
				) {
					// Clear position if it doesn't belong to the selected department
					setValue("employee.positionId", "");
				}
			}
		} else {
			// Only clear position if no department is selected AND we're not in edit mode
			// (In edit mode, we might have departmentId set but not yet loaded)
			if (currentPositionId && !filteredPositionsLoading && !positionsLoading) {
				setValue("employee.positionId", "");
			}
		}
	}, [
		selectedDepartmentId,
		filteredPositionsData,
		filteredPositionsLoading,
		positionsData,
		positionsLoading,
		setValue,
		watch,
	]);

	// Effect to clear reportToId when department changes
	React.useEffect(() => {
		const currentReportToId = watch("employee.reportToId");

		if (selectedDepartmentId) {
			// Get employees array from response
			let employeesArray: any[] = [];
			if (
				(employeesData as any)?.employees &&
				Array.isArray((employeesData as any).employees)
			) {
				employeesArray = (employeesData as any).employees;
			} else if (
				(employeesData as any)?.data?.employees &&
				Array.isArray((employeesData as any).data.employees)
			) {
				employeesArray = (employeesData as any).data.employees;
			} else if (Array.isArray(employeesData)) {
				employeesArray = employeesData;
			}

			// Filter employees by selected department
			const departmentEmployees = employeesArray.filter(
				(emp: any) =>
					emp.departmentId === selectedDepartmentId && emp.employmentStatus === "ACTIVE",
			);

			// Check if current reportTo employee belongs to selected department
			if (departmentEmployees.length > 0) {
				const employeeExists = departmentEmployees.some(
					(emp: any) => emp.id === currentReportToId,
				);
				if (!employeeExists && currentReportToId) {
					// Clear reportTo if it doesn't belong to the selected department
					setValue("employee.reportToId", null);
				}
			} else if (currentReportToId) {
				// Clear if no employees in department
				setValue("employee.reportToId", null);
			}
		} else {
			// Clear reportTo if no department is selected
			if (currentReportToId) {
				setValue("employee.reportToId", null);
			}
		}
	}, [selectedDepartmentId, employeesData, setValue, watch]);

	React.useEffect(() => {
		const selectedDepartment = selectedDepartmentData as any;
		if (!selectedDepartmentId || !selectedDepartment?.scheduleId) return;
		if (selectedScheduleId) return;

		setValue("employee.defaultScheduleId", selectedDepartment.scheduleId, {
			shouldDirty: true,
		});
	}, [selectedDepartmentData, selectedDepartmentId, selectedScheduleId, setValue]);

	// Debug work schedules data
	React.useEffect(() => {
		console.log("=== WORK SCHEDULES HOOK DEBUG ===");
		console.log("workSchedulesLoading:", workSchedulesLoading);
		console.log("workSchedulesError:", workSchedulesError);
		console.log("workSchedulesData:", workSchedulesData);
	}, [workSchedulesLoading, workSchedulesError, workSchedulesData]);

	// Force cache invalidation on mount to ensure fresh data
	React.useEffect(() => {
		console.log("=== CACHE INVALIDATION ===");
		queryClient.invalidateQueries({ queryKey: ["workSchedules"] });
	}, [queryClient]);

	// Transform API data to select options
	// The API returns data directly at the root level: {departments: Array}
	const departments = React.useMemo(() => {
		console.log("=== DEPARTMENTS DEBUG ===");
		console.log("Full departmentsData:", departmentsData);

		if (!departmentsData) {
			console.log("No departmentsData found");
			return [];
		}

		// Check if data has departments property at root level
		if (
			(departmentsData as any).departments &&
			Array.isArray((departmentsData as any).departments)
		) {
			console.log(
				"Processing departments from root property, length:",
				(departmentsData as any).departments.length,
			);
			console.log("First department:", (departmentsData as any).departments[0]);
			const result = (departmentsData as any).departments.map((dept: Department) => ({
				value: dept.id,
				label: dept.name,
			}));
			console.log("Processed departments result:", result);
			return result;
		}

		// Fallback: check if data is directly an array
		if (Array.isArray(departmentsData)) {
			console.log("Processing departments as direct array");
			const result = departmentsData.map((dept: Department) => ({
				value: dept.id,
				label: dept.name,
			}));
			console.log("Processed departments result:", result);
			return result;
		}

		console.log("No valid departments data found");
		console.log("Available properties:", Object.keys(departmentsData || {}));
		return [];
	}, [departmentsData]);

	const positions = React.useMemo(() => {
		console.log("=== POSITIONS DEBUG ===");
		// Use filtered positions if department is selected, otherwise use all positions
		const dataToUse =
			selectedDepartmentId && filteredPositionsData ? filteredPositionsData : positionsData;

		console.log("Full positionsData:", dataToUse);
		console.log("Selected Department ID:", selectedDepartmentId);
		console.log("Using filtered positions:", !!filteredPositionsData);

		if (!dataToUse) {
			console.log("No positionsData found");
			return [];
		}

		let positionsArray: Position[] = [];

		// Handle API response structure: { status, message, data: { positions: [], pagination: {} } }
		// Check if data has nested data.positions structure (from API response)
		if (
			(dataToUse as any).data &&
			(dataToUse as any).data.positions &&
			Array.isArray((dataToUse as any).data.positions)
		) {
			console.log(
				"Processing positions from data.positions property, length:",
				(dataToUse as any).data.positions.length,
			);
			positionsArray = (dataToUse as any).data.positions;
		}
		// Check if data has positions property at root level
		else if ((dataToUse as any).positions && Array.isArray((dataToUse as any).positions)) {
			console.log(
				"Processing positions from root property, length:",
				(dataToUse as any).positions.length,
			);
			positionsArray = (dataToUse as any).positions;
		}
		// Fallback: check if data is directly an array
		else if (Array.isArray(dataToUse)) {
			console.log("Processing positions as direct array");
			positionsArray = dataToUse;
		}

		// Filter positions by departmentId if a department is selected
		// This ensures we only show positions that belong to the selected department
		// BUT: Also include the currently selected position even if it's not in the filtered list
		// (This helps in edit mode when the position might not be loaded yet or filtered differently)
		if (selectedDepartmentId && positionsArray.length > 0) {
			const filtered = positionsArray.filter(
				(pos: Position) => pos.section?.departmentId === selectedDepartmentId,
			);

			// If we have a current positionId that's not in filtered list, include it anyway
			// This ensures edit mode shows the selected position even if filtering is strict
			if (
				currentPositionId &&
				!filtered.some((pos: Position) => pos.id === currentPositionId)
			) {
				const currentPosition = positionsArray.find(
					(pos: Position) => pos.id === currentPositionId,
				);
				if (currentPosition) {
					filtered.push(currentPosition);
					console.log("Including current position in filtered list:", currentPosition);
				}
			}

			console.log(
				`Filtering positions: ${positionsArray.length} total, ${filtered.length} for department ${selectedDepartmentId}`,
			);
			console.log("Filtered positions:", filtered);
			const result = filtered.map((pos: Position) => ({
				value: pos.id,
				label: pos.title,
			}));
			console.log("Processed filtered positions result:", result);
			return result;
		}

		// If no department selected or no positions array, return empty
		if (positionsArray.length === 0) {
			console.log("No valid positions data found");
			console.log("Available properties:", Object.keys(dataToUse || {}));
			return [];
		}

		// Return all positions if no department is selected
		const result = positionsArray.map((pos: Position) => ({
			value: pos.id,
			label: pos.title,
		}));
		console.log("Processed positions result:", result);
		return result;
	}, [positionsData, filteredPositionsData, selectedDepartmentId, currentPositionId]);

	const workSchedules = React.useMemo(() => {
		console.log("=== WORK SCHEDULES DEBUG ===");
		console.log("Full workSchedulesData:", workSchedulesData);

		if (!workSchedulesData) {
			console.log("No workSchedulesData found");
			return [];
		}

		// Check if data has schedules property directly (based on console output)
		if (
			(workSchedulesData as any).schedules &&
			Array.isArray((workSchedulesData as any).schedules)
		) {
			console.log(
				"Processing work schedules from schedules property, length:",
				(workSchedulesData as any).schedules.length,
			);
			console.log("First work schedule:", (workSchedulesData as any).schedules[0]);
			const result = (workSchedulesData as any).schedules.map((schedule: any) => ({
				value: schedule.id,
				label: schedule.name,
			}));
			console.log("Processed work schedules result:", result);
			return result;
		}

		// Fallback: Check if data has schedules property at root level (like departments)
		if (
			(workSchedulesData as any).data &&
			(workSchedulesData as any).data.schedules &&
			Array.isArray((workSchedulesData as any).data.schedules)
		) {
			console.log(
				"Processing work schedules from data.schedules property, length:",
				(workSchedulesData as any).data.schedules.length,
			);
			console.log("First work schedule:", (workSchedulesData as any).data.schedules[0]);
			const result = (workSchedulesData as any).data.schedules.map((schedule: any) => ({
				value: schedule.id,
				label: schedule.name,
			}));
			console.log("Processed work schedules result:", result);
			return result;
		}

		// Fallback: check if data is directly an array
		if (Array.isArray(workSchedulesData)) {
			console.log("Processing work schedules as direct array");
			const result = workSchedulesData.map((schedule: any) => ({
				value: schedule.id,
				label: schedule.name,
			}));
			console.log("Processed work schedules result:", result);
			return result;
		}

		console.log("No valid work schedules data found");
		console.log("Available properties:", Object.keys(workSchedulesData || {}));
		return [];
	}, [workSchedulesData]);

	// Process employees for reportTo dropdown - filter by selected department
	const reportToEmployees = React.useMemo(() => {
		if (!employeesData) {
			return [];
		}

		// Get employees array from response
		let employeesArray: any[] = [];

		if ((employeesData as any).employees && Array.isArray((employeesData as any).employees)) {
			employeesArray = (employeesData as any).employees;
		} else if (
			(employeesData as any).data?.employees &&
			Array.isArray((employeesData as any).data.employees)
		) {
			employeesArray = (employeesData as any).data.employees;
		} else if (Array.isArray(employeesData)) {
			employeesArray = employeesData;
		}

		// Filter by department if selected, then filter out inactive/terminated employees
		let filteredEmployees = employeesArray;

		if (selectedDepartmentId) {
			// Filter employees by the selected department
			filteredEmployees = employeesArray.filter(
				(emp: any) => emp.departmentId === selectedDepartmentId,
			);
		}

		// Filter out inactive/terminated employees and format for dropdown
		return filteredEmployees
			.filter(
				(emp: any) => emp.employmentStatus === "ACTIVE" && emp.person?.personalInfo, // Ensure person data exists
			)
			.map((emp: any) => {
				const person = emp.person?.personalInfo || {};
				const firstName = person.firstName || "";
				const lastName = person.lastName || "";
				const middleName = person.middleName || "";
				const name =
					[firstName, middleName, lastName].filter(Boolean).join(" ") ||
					emp.employeeId ||
					"Unknown";
				return {
					value: emp.id,
					label: `${name} (${emp.employeeId})`,
				};
			})
			.sort((a, b) => a.label.localeCompare(b.label));
	}, [employeesData, selectedDepartmentId]);

	const isCompleted = status === "completed";
	// Note: isCompleted is only used for UI indicators, not for disabling fields
	// Fields remain editable even after completion so users can go back and edit

	// Debug final arrays
	console.log("Final departments array:", departments);
	console.log("Final positions array:", positions);
	console.log("Final work schedules array:", workSchedules);
	console.log("Departments length:", departments.length);
	console.log("Positions length:", positions.length);
	console.log("Work schedules length:", workSchedules.length);

	// Debug form values
	const formValues = watch();
	console.log("Current form values:", formValues);
	console.log("Selected departmentId:", formValues.employee?.departmentId);
	console.log("Selected positionId:", formValues.employee?.positionId);
	console.log("Selected scheduleId:", formValues.employee?.scheduleId);

	// Watch the documents array to manage dynamic document fields
	const documents = watch("employee.documents") || [];

	// Watch the leaveBalances array to manage dynamic leave balance fields
	const leaveBalances = useMemo(() => watch("employee.leaveBalances") || [], [watch]);

	// Debug: Log leave balances when they change
	React.useEffect(() => {
		console.log("EmployeeDetailsForm - Leave Balances:", leaveBalances);
		console.log("EmployeeDetailsForm - Leave Balances length:", leaveBalances.length);
	}, [leaveBalances]);

	// Initialize documents with TIN, SSS, PHILHEALTH, PAGIBIG if empty
	React.useEffect(() => {
		if (documents.length === 0) {
			const todayIssueDate = getTodayDateInput();
			const defaultDocuments = [
				{ type: "TIN", number: "", issueDate: todayIssueDate, expiryDate: "" },
				{ type: "SSS", number: "", issueDate: todayIssueDate, expiryDate: "" },
				{ type: "PHILHEALTH", number: "", issueDate: todayIssueDate, expiryDate: "" },
				{ type: "PAGIBIG", number: "", issueDate: todayIssueDate, expiryDate: "" },
			];
			setValue("employee.documents", defaultDocuments);
		}
	}, [documents.length, setValue]); // Run only once on mount

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const isValid = await trigger("employee");
		if (isValid) {
			onComplete();
		}
	};

	const addDocument = () => {
		const newDocuments = [
			...documents,
			{ type: "SSS", number: "", issueDate: getTodayDateInput(), expiryDate: "" },
		];
		setValue("employee.documents", newDocuments);
	};

	const removeDocument = (index: number) => {
		const newDocuments = documents.filter((_: any, i: number) => i !== index);
		setValue("employee.documents", newDocuments);
	};

	const addLeaveBalance = () => {
		const currentYear = new Date().getFullYear();
		const newLeaveBalances = [
			...leaveBalances,
			{
				leaveType: "VACATION",
				totalEntitled: 0,
				periodStart: `${currentYear}-01-01`,
				periodEnd: `${currentYear}-12-31`,
			},
		];
		setValue("employee.leaveBalances", newLeaveBalances);
	};

	const removeLeaveBalance = (index: number) => {
		const newLeaveBalances = leaveBalances.filter((_: any, i: number) => i !== index);
		setValue("employee.leaveBalances", newLeaveBalances);
	};

	// Watch employment type to show/hide probation end date
	const employmentType = watch("employee.employmentType");

	return (
		<Card className="border border-gray-200 bg-white">
			<CardContent className="p-6">
				<div className="space-y-8">
					<div>
						<h2 className="text-xl font-semibold text-gray-900">Employment Details</h2>
						<p className="text-sm text-gray-600 mt-1">
							Enter job information, compensation, and required documents
						</p>
					</div>

					<form onSubmit={handleSubmit} className="space-y-8">
						{/* Basic Employment Information */}
						<div className="space-y-4">
							<div className="flex items-center gap-2 pb-2 border-b border-gray-200">
								<Briefcase className="h-5 w-5 text-orange-600" />
								<h3 className="text-lg font-medium text-gray-900">
									Employment Information
								</h3>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div>
									<label
										htmlFor="employee.employeeId"
										className="block text-sm font-medium text-gray-700 mb-1">
										Employee ID *
									</label>
									<Input
										id="employee.employeeId"
										type="text"
										placeholder="EMP001"
										className={
											errors.employee?.employeeId
												? "border-red-300 focus:border-red-500"
												: ""
										}
										{...register("employee.employeeId", {
											required: "Employee ID is required",
											pattern: {
												value: /^EMP\d{3}$/,
												message: "Employee ID should be in format EMP001",
											},
										})}
									/>
									<p className="mt-1 text-sm text-gray-500">
										Format: EMP followed by 3 digits (e.g., EMP001)
									</p>
									{errors.employee?.employeeId && (
										<p className="mt-1 text-sm text-red-600">
											{errors.employee.employeeId.message}
										</p>
									)}
								</div>

								<div>
									<label
										htmlFor="employee.employmentStatus"
										className="block text-sm font-medium text-gray-700 mb-1">
										Employment Status *
									</label>
									<select
										id="employee.employmentStatus"
										className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
											errors.employee?.employmentStatus
												? "border-red-300 focus:border-red-500"
												: "border-gray-300"
										}`}
										{...register("employee.employmentStatus", {
											required: "Employment status is required",
										})}>
										<option value="">Select Status</option>
										{employmentStatuses.map((status) => (
											<option key={status.value} value={status.value}>
												{status.label}
											</option>
										))}
									</select>
									{errors.employee?.employmentStatus && (
										<p className="mt-1 text-sm text-red-600">
											{errors.employee.employmentStatus.message}
										</p>
									)}
								</div>

								<div>
									<label
										htmlFor="employee.employmentType"
										className="block text-sm font-medium text-gray-700 mb-1">
										Employment Type *
									</label>
									<select
										id="employee.employmentType"
										className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
											errors.employee?.employmentType
												? "border-red-300 focus:border-red-500"
												: "border-gray-300"
										}`}
										{...register("employee.employmentType", {
											required: "Employment type is required",
										})}>
										<option value="">Select Type</option>
										{employmentTypes.map((type) => (
											<option key={type.value} value={type.value}>
												{type.label}
											</option>
										))}
									</select>
									{errors.employee?.employmentType && (
										<p className="mt-1 text-sm text-red-600">
											{errors.employee.employmentType.message}
										</p>
									)}
								</div>

								<div>
									<label
										htmlFor="employee.workLocation"
										className="block text-sm font-medium text-gray-700 mb-1">
										Work Location *
									</label>
									<select
										id="employee.workLocation"
										className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
											errors.employee?.workLocation
												? "border-red-300 focus:border-red-500"
												: "border-gray-300"
										}`}
										{...register("employee.workLocation", {
											required: "Work location is required",
										})}>
										<option value="">Select Location</option>
										{workLocations.map((location) => (
											<option key={location.value} value={location.value}>
												{location.label}
											</option>
										))}
									</select>
									{errors.employee?.workLocation && (
										<p className="mt-1 text-sm text-red-600">
											{errors.employee.workLocation.message}
										</p>
									)}
								</div>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div>
									<label
										htmlFor="employee.departmentId"
										className="block text-sm font-medium text-gray-700 mb-1">
										Department *
									</label>
									<select
										id="employee.departmentId"
										className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
											errors.employee?.departmentId
												? "border-red-300 focus:border-red-500"
												: "border-gray-300"
										}`}
										disabled={departmentsLoading}
										{...register("employee.departmentId", {
											required: "Department is required",
										})}>
										<option value="">
											{departmentsLoading
												? "Loading departments..."
												: "Select Department"}
										</option>
										{departments.map(
											(dept: { value: string; label: string }) => (
												<option key={dept.value} value={dept.value}>
													{dept.label}
												</option>
											),
										)}
									</select>
									{departmentsError && (
										<p className="mt-1 text-sm text-red-600">
											Failed to load departments. Please refresh the page.
										</p>
									)}
									{errors.employee?.departmentId && (
										<p className="mt-1 text-sm text-red-600">
											{errors.employee.departmentId.message}
										</p>
									)}
								</div>

								<div>
									<label
										htmlFor="employee.positionId"
										className="block text-sm font-medium text-gray-700 mb-1">
										Position *
									</label>
									<select
										id="employee.positionId"
										className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
											errors.employee?.positionId
												? "border-red-300 focus:border-red-500"
												: "border-gray-300"
										}`}
										disabled={
											positionsLoading ||
											filteredPositionsLoading ||
											!selectedDepartmentId
										}
										{...register("employee.positionId", {
											required: "Position is required",
										})}>
										<option value="">
											{!selectedDepartmentId
												? "Select Department first"
												: filteredPositionsLoading || positionsLoading
													? "Loading positions..."
													: "Select Position"}
										</option>
										{positions.map((pos: { value: string; label: string }) => (
											<option key={pos.value} value={pos.value}>
												{pos.label}
											</option>
										))}
									</select>
									{!selectedDepartmentId && (
										<p className="mt-1 text-xs text-gray-500">
											Please select a department first to view available
											positions
										</p>
									)}
									{positionsError && (
										<p className="mt-1 text-sm text-red-600">
											Failed to load positions. Please refresh the page.
										</p>
									)}
									{errors.employee?.positionId && (
										<p className="mt-1 text-sm text-red-600">
											{errors.employee.positionId.message}
										</p>
									)}
								</div>

								<div>
									<div className="flex items-center justify-between mb-1">
										<label
											htmlFor="employee.scheduleId"
											className="block text-sm font-medium text-gray-700">
											Work Schedule *
										</label>
										{workSchedulesError && (
											<button
												type="button"
												onClick={() => refetchWorkSchedules()}
												className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 transition-colors"
												disabled={workSchedulesLoading}>
												<RefreshCw
													className={`h-3 w-3 ${workSchedulesLoading ? "animate-spin" : ""}`}
												/>
												Retry
											</button>
										)}
									</div>
									<select
										id="employee.defaultScheduleId"
										className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
											errors.employee?.defaultScheduleId
												? "border-red-300 focus:border-red-500"
												: "border-gray-300"
										}`}
										disabled={workSchedulesLoading}
										{...register("employee.defaultScheduleId", {
											required: "Work schedule is required",
										})}>
										<option value="">
											{workSchedulesLoading
												? "Loading work schedules..."
												: "Select Work Schedule"}
										</option>
										{workSchedules.map(
											(schedule: { value: string; label: string }) => (
												<option key={schedule.value} value={schedule.value}>
													{schedule.label}
												</option>
											),
										)}
									</select>
									{workSchedulesError && (
										<p className="mt-1 text-sm text-red-600">
											Failed to load work schedules:{" "}
											{workSchedulesError.message || "Unknown error"}. Please
											refresh the page.
										</p>
									)}
									<p className="mt-1 text-xs text-gray-500">
										The department default schedule is suggested automatically,
										but you can still choose another schedule.
									</p>
									{errors.employee?.scheduleId && (
										<p className="mt-1 text-sm text-red-600">
											{errors.employee.scheduleId.message}
										</p>
									)}
								</div>
							</div>

							{/* Reporting Structure */}
							<div className="space-y-4 pt-4 border-t border-gray-200">
								<div className="flex items-center gap-2 pb-2">
									<UserCheck className="h-5 w-5 text-orange-600" />
									<h3 className="text-lg font-medium text-gray-900">
										Reporting Structure
									</h3>
								</div>

								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div>
										<label
											htmlFor="employee.reportToId"
											className="block text-sm font-medium text-gray-700 mb-1">
											Reports To
										</label>
										<select
											id="employee.reportToId"
											className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
												errors.employee?.reportToId
													? "border-red-300 focus:border-red-500"
													: "border-gray-300"
											}`}
											disabled={employeesLoading || !selectedDepartmentId}
											{...register("employee.reportToId")}>
											<option value="">
												{!selectedDepartmentId
													? "Select Department first"
													: employeesLoading
														? "Loading employees..."
														: "Select Manager (Optional)"}
											</option>
											{reportToEmployees.map(
												(emp: { value: string; label: string }) => (
													<option key={emp.value} value={emp.value}>
														{emp.label}
													</option>
												),
											)}
										</select>
										{!selectedDepartmentId && (
											<p className="mt-1 text-xs text-gray-500">
												Please select a department first to view available
												managers
											</p>
										)}
										{employeesError && (
											<p className="mt-1 text-sm text-red-600">
												Failed to load employees. Please refresh the page.
											</p>
										)}
										{errors.employee?.reportToId && (
											<p className="mt-1 text-sm text-red-600">
												{errors.employee.reportToId.message}
											</p>
										)}
										{selectedDepartmentId &&
											reportToEmployees.length === 0 &&
											!employeesLoading && (
												<p className="mt-1 text-xs text-gray-500">
													No active managers found in this department
												</p>
											)}
									</div>
								</div>
							</div>
						</div>

						{/* Dates Section */}
						<div className="space-y-4">
							<div className="flex items-center gap-2 pb-2 border-b border-gray-200">
								<Calendar className="h-5 w-5 text-orange-600" />
								<h3 className="text-lg font-medium text-gray-900">
									Important Dates
								</h3>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
								<div>
									<label
										htmlFor="employee.employmentHireDate"
										className="block text-sm font-medium text-gray-700 mb-1">
										Hire Date *
									</label>
									<CalendarDatePicker
										value={watch("employee.employmentHireDate") || ""}
										onChange={(next) =>
											setValue("employee.employmentHireDate", next, {
												shouldValidate: true,
												shouldDirty: true,
											})
										}
										className={
											errors.employee?.employmentHireDate
												? "border-red-300 focus:border-red-500"
												: ""
										}
									/>
									{errors.employee?.employmentHireDate && (
										<p className="mt-1 text-sm text-red-600">
											{errors.employee.employmentHireDate.message}
										</p>
									)}
								</div>

								<div>
									<label
										htmlFor="employee.employmentStartDate"
										className="block text-sm font-medium text-gray-700 mb-1">
										Start Date *
									</label>
									<CalendarDatePicker
										value={watch("employee.employmentStartDate") || ""}
										onChange={(next) =>
											setValue("employee.employmentStartDate", next, {
												shouldValidate: true,
												shouldDirty: true,
											})
										}
										className={
											errors.employee?.employmentStartDate
												? "border-red-300 focus:border-red-500"
												: ""
										}
									/>
									{errors.employee?.employmentStartDate && (
										<p className="mt-1 text-sm text-red-600">
											{errors.employee.employmentStartDate.message}
										</p>
									)}
								</div>

								<div>
									<label
										htmlFor="employee.probationEndDate"
										className="block text-sm font-medium text-gray-700 mb-1">
										Probation End Date{" "}
										{employmentType === "PROBATIONARY" && "*"}
									</label>
									<CalendarDatePicker
										value={watch("employee.probationEndDate") || ""}
										onChange={(next) =>
											setValue("employee.probationEndDate", next, {
												shouldValidate: true,
												shouldDirty: true,
											})
										}
										className={
											errors.employee?.probationEndDate
												? "border-red-300 focus:border-red-500"
												: ""
										}
									/>
									{errors.employee?.probationEndDate && (
										<p className="mt-1 text-sm text-red-600">
											{errors.employee.probationEndDate.message}
										</p>
									)}
								</div>
							</div>
						</div>

						{/* Compensation Section */}
						<div className="space-y-4">
							<div className="flex items-center gap-2 pb-2 border-b border-gray-200">
								<DollarSign className="h-5 w-5 text-orange-600" />
								<h3 className="text-lg font-medium text-gray-900">Compensation</h3>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
								<div>
									<label
										htmlFor="employee.basicSalary"
										className="block text-sm font-medium text-gray-700 mb-1">
										Basic Salary *
									</label>
									<Input
										id="employee.basicSalary"
										type="number"
										placeholder="50000.00"
										step="0.01"
										min="0"
										className={
											errors.employee?.basicSalary
												? "border-red-300 focus:border-red-500"
												: ""
										}
										{...register("employee.basicSalary", {
											required: "Basic salary is required",
											valueAsNumber: true,
											min: { value: 0, message: "Salary must be positive" },
										})}
									/>
									{errors.employee?.basicSalary && (
										<p className="mt-1 text-sm text-red-600">
											{errors.employee.basicSalary.message}
										</p>
									)}
								</div>

								<div>
									<label
										htmlFor="employee.currency"
										className="block text-sm font-medium text-gray-700 mb-1">
										Currency *
									</label>
									<select
										id="employee.currency"
										className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
											errors.employee?.currency
												? "border-red-300 focus:border-red-500"
												: "border-gray-300"
										}`}
										{...register("employee.currency", {
											required: "Currency is required",
										})}>
										<option value="">Select Currency</option>
										{currencies.map((currency) => (
											<option key={currency.value} value={currency.value}>
												{currency.label}
											</option>
										))}
									</select>
									{errors.employee?.currency && (
										<p className="mt-1 text-sm text-red-600">
											{errors.employee.currency.message}
										</p>
									)}
								</div>

								<div>
									<label
										htmlFor="employee.payFrequency"
										className="block text-sm font-medium text-gray-700 mb-1">
										Pay Frequency *
									</label>
									<select
										id="employee.payFrequency"
										className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
											errors.employee?.payFrequency
												? "border-red-300 focus:border-red-500"
												: "border-gray-300"
										}`}
										{...register("employee.payFrequency", {
											required: "Pay frequency is required",
										})}>
										<option value="">Select Frequency</option>
										{payFrequencies.map((frequency) => (
											<option key={frequency.value} value={frequency.value}>
												{frequency.label}
											</option>
										))}
									</select>
									{errors.employee?.payFrequency && (
										<p className="mt-1 text-sm text-red-600">
											{errors.employee.payFrequency.message}
										</p>
									)}
								</div>
							</div>
						</div>

						{/* Documents Section */}
						<div className="space-y-4">
							<div className="flex items-center justify-between pb-2 border-b border-gray-200">
								<div className="flex items-center gap-2">
									<FileText className="h-5 w-5 text-orange-600" />
									<h3 className="text-lg font-medium text-gray-900">
										Required Documents
									</h3>
								</div>
								{!isCompleted && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={addDocument}
										className="text-xs">
										<Plus className="h-3 w-3 mr-1" />
										Add Document
									</Button>
								)}
							</div>

							{documents.map((document: any, index: number) => (
								<div
									key={index}
									className="border border-gray-200 rounded-lg p-4 space-y-4">
									<div className="flex items-center justify-between">
										<h4 className="text-sm font-medium text-gray-900">
											Document {index + 1}
										</h4>
										{!isCompleted && (
											<Button
												type="button"
												variant="outline"
												size="sm"
												onClick={() => removeDocument(index)}
												className="text-red-600 hover:bg-red-50">
												<X className="h-3 w-3" />
											</Button>
										)}
									</div>

									<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
										<div>
											<label className="block text-sm font-medium text-gray-700 mb-1">
												Document Type *
											</label>
											<select
												className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
													errors.employee?.documents?.[index]?.type
														? "border-red-300 focus:border-red-500"
														: "border-gray-300"
												}`}
												{...register(`employee.documents.${index}.type`, {
													required: "Document type is required",
												})}>
												<option value="">Select Document Type</option>
												{documentTypes.map((type) => (
													<option key={type.value} value={type.value}>
														{type.label}
													</option>
												))}
											</select>
											{errors.employee?.documents?.[index]?.type && (
												<p className="mt-1 text-sm text-red-600">
													{errors.employee.documents[index].type.message}
												</p>
											)}
										</div>

										<div>
											<label className="block text-sm font-medium text-gray-700 mb-1">
												Document Number *
											</label>
											<Input
												type="text"
												placeholder="1234567890"
												className={
													errors.employee?.documents?.[index]?.number
														? "border-red-300 focus:border-red-500"
														: ""
												}
												{...register(`employee.documents.${index}.number`, {
													required: "Document number is required",
												})}
											/>
											{errors.employee?.documents?.[index]?.number && (
												<p className="mt-1 text-sm text-red-600">
													{
														errors.employee.documents[index].number
															.message
													}
												</p>
											)}
										</div>

										<div>
											<label className="block text-sm font-medium text-gray-700 mb-1">
												Issue Date *
											</label>
											<CalendarDatePicker
												value={
													watch(`employee.documents.${index}.issueDate`) ||
													""
												}
												onChange={(next) =>
													setValue(
														`employee.documents.${index}.issueDate`,
														next,
														{
															shouldValidate: true,
															shouldDirty: true,
														},
													)
												}
												className={
													errors.employee?.documents?.[index]?.issueDate
														? "border-red-300 focus:border-red-500"
														: ""
												}
											/>
											{errors.employee?.documents?.[index]?.issueDate && (
												<p className="mt-1 text-sm text-red-600">
													{
														errors.employee.documents[index].issueDate
															.message
													}
												</p>
											)}
										</div>

										<div>
											<label className="block text-sm font-medium text-gray-700 mb-1">
												Expiry Date
											</label>
											<CalendarDatePicker
												value={
													watch(
														`employee.documents.${index}.expiryDate`,
													) || ""
												}
												onChange={(next) =>
													setValue(
														`employee.documents.${index}.expiryDate`,
														next,
														{
															shouldValidate: true,
															shouldDirty: true,
														},
													)
												}
												className={
													errors.employee?.documents?.[index]?.expiryDate
														? "border-red-300 focus:border-red-500"
														: ""
												}
											/>
											{errors.employee?.documents?.[index]?.expiryDate && (
												<p className="mt-1 text-sm text-red-600">
													{
														errors.employee.documents[index].expiryDate
															.message
													}
												</p>
											)}
										</div>
									</div>
								</div>
							))}

							{documents.length === 0 && (
								<div className="text-center py-8 text-gray-500">
									<FileText className="h-12 w-12 mx-auto mb-2 text-gray-300" />
									<p className="text-sm">No documents added yet</p>
									<p className="text-xs">
										Click &quot;Add Document&quot; to add required documents
									</p>
								</div>
							)}
						</div>

						{/* Leave Balances Section */}
						<div className="space-y-4">
							<div className="flex items-center justify-between pb-2 border-b border-gray-200">
								<div className="flex items-center gap-2">
									<CalendarDays className="h-5 w-5 text-orange-600" />
									<h3 className="text-lg font-medium text-gray-900">
										Leave Balances
									</h3>
								</div>
								{!isCompleted && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={addLeaveBalance}
										className="text-xs">
										<Plus className="h-3 w-3 mr-1" />
										Add Leave Balance
									</Button>
								)}
							</div>

							{leaveBalances.map((leaveBalance: any, index: number) => (
								<div
									key={index}
									className="border border-gray-200 rounded-lg p-4 space-y-4">
									<div className="flex items-center justify-between">
										<h4 className="text-sm font-medium text-gray-900">
											Leave Balance {index + 1}
										</h4>
										{!isCompleted && (
											<Button
												type="button"
												variant="outline"
												size="sm"
												onClick={() => removeLeaveBalance(index)}
												className="text-red-600 hover:bg-red-50">
												<X className="h-3 w-3" />
											</Button>
										)}
									</div>

									<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
										<div>
											<label className="block text-sm font-medium text-gray-700 mb-1">
												Leave Type *
											</label>
											<select
												className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
													errors.employee?.leaveBalances?.[index]
														?.leaveType
														? "border-red-300 focus:border-red-500"
														: "border-gray-300"
												}`}
												{...register(
													`employee.leaveBalances.${index}.leaveType`,
													{
														required: "Leave type is required",
													},
												)}>
												<option value="">Select Leave Type</option>
												{leaveTypes.map((type) => (
													<option key={type.value} value={type.value}>
														{type.label}
													</option>
												))}
											</select>
											{errors.employee?.leaveBalances?.[index]?.leaveType && (
												<p className="mt-1 text-sm text-red-600">
													{
														errors.employee.leaveBalances[index]
															.leaveType.message
													}
												</p>
											)}
										</div>

										<div>
											<label className="block text-sm font-medium text-gray-700 mb-1">
												Total Entitled *
											</label>
											<Input
												type="number"
												placeholder="0"
												min="0"
												step="0.5"
												className={
													errors.employee?.leaveBalances?.[index]
														?.totalEntitled
														? "border-red-300 focus:border-red-500"
														: ""
												}
												{...register(
													`employee.leaveBalances.${index}.totalEntitled`,
													{
														required: "Total entitled is required",
														valueAsNumber: true,
														min: {
															value: 0,
															message: "Must be non-negative",
														},
													},
												)}
											/>
											{errors.employee?.leaveBalances?.[index]
												?.totalEntitled && (
												<p className="mt-1 text-sm text-red-600">
													{
														errors.employee.leaveBalances[index]
															.totalEntitled.message
													}
												</p>
											)}
										</div>

										<div>
											<label className="block text-sm font-medium text-gray-700 mb-1">
												Period Start *
											</label>
											<CalendarDatePicker
												value={
													watch(
														`employee.leaveBalances.${index}.periodStart`,
													) || ""
												}
												onChange={(next) =>
													setValue(
														`employee.leaveBalances.${index}.periodStart`,
														next,
														{
															shouldValidate: true,
															shouldDirty: true,
														},
													)
												}
												className={
													errors.employee?.leaveBalances?.[index]
														?.periodStart
														? "border-red-300 focus:border-red-500"
														: ""
												}
											/>
											{errors.employee?.leaveBalances?.[index]
												?.periodStart && (
												<p className="mt-1 text-sm text-red-600">
													{
														errors.employee.leaveBalances[index]
															.periodStart.message
													}
												</p>
											)}
										</div>

										<div>
											<label className="block text-sm font-medium text-gray-700 mb-1">
												Period End *
											</label>
											<CalendarDatePicker
												value={
													watch(
														`employee.leaveBalances.${index}.periodEnd`,
													) || ""
												}
												onChange={(next) =>
													setValue(
														`employee.leaveBalances.${index}.periodEnd`,
														next,
														{
															shouldValidate: true,
															shouldDirty: true,
														},
													)
												}
												className={
													errors.employee?.leaveBalances?.[index]
														?.periodEnd
														? "border-red-300 focus:border-red-500"
														: ""
												}
											/>
											{errors.employee?.leaveBalances?.[index]?.periodEnd && (
												<p className="mt-1 text-sm text-red-600">
													{
														errors.employee.leaveBalances[index]
															.periodEnd.message
													}
												</p>
											)}
										</div>
									</div>
								</div>
							))}

							{leaveBalances.length === 0 && (
								<div className="text-center py-8 text-gray-500">
									<CalendarDays className="h-12 w-12 mx-auto mb-2 text-gray-300" />
									<p className="text-sm">No leave balances added yet</p>
									<p className="text-xs">
										Click &quot;Add Leave Balance&quot; to add leave balance
										information
									</p>
								</div>
							)}
						</div>

						{!isCompleted && (
							<div className="pt-6 border-t border-gray-200">
								<Button
									type="submit"
									className="bg-orange-600 hover:bg-orange-700 text-white">
									Save & Continue
								</Button>
							</div>
						)}

						{isCompleted && (
							<div className="pt-4">
								<div className="flex items-center gap-2 text-green-600">
									<svg
										className="h-4 w-4"
										fill="currentColor"
										viewBox="0 0 20 20">
										<path
											fillRule="evenodd"
											d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
											clipRule="evenodd"
										/>
									</svg>
									<span className="text-sm font-medium">
										Employment details saved successfully
									</span>
								</div>
							</div>
						)}
					</form>
				</div>
			</CardContent>
		</Card>
	);
}
