export interface PersonalInfo {
	prefix: string | null;
	firstName: string;
	middleName: string;
	lastName: string;
	dateOfBirth: string;
	placeOfBirth: string;
	age: number | null;
	nationality: string;
	primaryLanguage: string | null;
	gender: string;
	currency: string | null;
	vipCode: string | null;
}

export interface Person {
	personalInfo: PersonalInfo;
}

export interface DepartmentInfo {
	name: string;
}

export interface PositionInfo {
	title: string;
}

export interface EmployeeInfo {
	id: string;
	person: Person;
	basicSalary: number;
	employeeId?: string;
	department?: DepartmentInfo;
	position?: PositionInfo;
	user?: {
		avatar?: string | null;
	} | null;
}

export interface PayrollPeriodInfo {
	id: string;
	organizationId: string;
	name: string;
	startDate: string;
	endDate: string;
	payDate: string;
	calculatorId: string | null;
	status: "DRAFT" | "OPEN" | "PROCESSING" | "COMPLETED" | "CLOSED";
	cutoffDay: number | null;
	notes: string | null;
	processedBy: string | null;
	processedAt: string | null;
	isDeleted: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface TimesheetSnapshot {
	totalHoursWorked: string;
	totalRegularHours: string;
	totalOvertimeHours: string;
	totalUndertimeHours: string;
	totalLateHours: string;
	totalEarlyOutHours: string;
	totalDays: number;
	metadata: {
		totalMinutesWorked: number;
		totalRegularMinutes: number;
		totalOvertimeMinutes: number;
		totalUndertimeMinutes: number;
		totalLateMinutes: number;
		totalEarlyOutMinutes: number;
	};
	daysPresent: number;
	daysAbsent: number;
	daysRestDay: number;
	breakdown?: TimesheetBreakdownItem[];
}

export interface TimesheetBreakdownItem {
	approvalStatus: string;
	date: string;
	timeIn: string | null;
	timeOut: string | null;
	hoursWorked: string;
	regularHours: string;
	overtimeHours: string;
	undertimeHours: string;
	lateHours: string;
	earlyOutHours: string;
	status: string;
	dayTypeDisplay?: string | null;
	scheduleSnapshot?: any;
	employeeNotes: string | null;
	approverNotes: string | null;
	metadata: {
		totalMinutes: number;
		regularMinutes: number;
		overtimeMinutes: number;
		undertimeMinutes: number;
		lateMinutes: number;
		earlyOutMinutes: number;
		rawLateMinutes?: number;
		rawEarlyOutMinutes?: number;
		gracePeriodMinutes?: number;
		graceEarlyOutMinutes?: number;
		withinGrace?: boolean;
	};
}

export interface Timesheet {
	id: string;
	breakdown: TimesheetBreakdownItem[];
}

export interface EmployeePayrollComputationRow {
	label: string;
	field: string;
	operation: "ADD" | "SUBTRACT";
	amount: number;
	payrollRole:
		| "INCLUDED_IN_GROSSPAY"
		| "DEDUCTED_INSIDE_GROSSPAY"
		| "DEDUCTED_AFTER_GROSSPAY"
		| "ADDED_AFTER_NETPAY";
	explanation: string;
}

export interface EmployeePayrollComputationView {
	rateSummary: {
		method: string;
		monthlySalary: number;
		dailySalary: number;
		numberOfDays: number;
		regularOtHours: number;
		bnpiDailyRate: number;
		bnpiHourlyRate: number;
		rateNote: string;
	};
	grossPayRows: EmployeePayrollComputationRow[];
	grossPayFormula: {
		rowsTotal: number;
		targetGrossPay: number;
		gap: number;
	};
	deductionRows: EmployeePayrollComputationRow[];
	deductionFormula: {
		rowsTotal: number;
		targetTotalDeductions: number;
		gap: number;
	};
	netPayFormula: {
		grossPay: number;
		totalDeductions: number;
		netPay: number;
		gap: number;
	};
	postNetRows: EmployeePayrollComputationRow[];
	totalReceivableFormula: {
		netPay: number;
		postNetTotal: number;
		totalReceivable: number;
		gap: number;
	};
	supportingFields: {
		leavePay: number;
		allowances: number;
		loanDeductions: number;
		otherDeductions: number;
	};
}

export interface EmployeePayroll {
	id: string;
	employee: EmployeeInfo;
	payrollPeriod: PayrollPeriodInfo;
	schedule?: {
		scheduleName: string;
		scheduleCode: string;
		startDate: string;
		endDate?: string | null;
		gracePeriodMinutes?: number;
		shifts: Array<{
			label: string;
			isRestDay?: boolean;
			timeSlots?: Array<{
				type: string;
				label?: string;
				startTime: string;
				endTime: string;
			}>;
		}>;
	} | null;
	basicPay: number;
	overtimePay?: number;
	nightDiffPay?: number;
	holidayPay?: number;
	allowances?: number;
	bonuses?: number;
	taxAmount: number;
	sssContribution: number;
	philHealthContribution: number;
	pagibigContribution: number;
	absentDeduction?: number;
	lateDeduction?: number;
	earlyOutDeduction?: number;
	loanDeductions?: number;
	otherDeductions?: number;
	grossPay: number;
	totalDeductions: number;
	netPay: number;
	monthlySalary?: number;
	dailySalary?: number;
	numberOfDays?: number;
	lateUndertimeAmount?: number;
	regularOtHours?: number;
	restDayHours?: number;
	restDayHoursPay?: number;
	restDayOtHours?: number;
	restDayOtPay?: number;
	specialHolidayOtHours?: number;
	specialHolidayOtPay?: number;
	sunSpecialHolidayOtExcessHours?: number;
	sunSpecialHolidayOtExcessPay?: number;
	specialHolidayRestDayOtHours?: number;
	specialHolidayRestDayOtPay?: number;
	specialRestDayExcessHours?: number;
	specialRestDayExcessOtPay?: number;
	legalHolidayOtHours?: number;
	legalHolidayOtPay?: number;
	legalHolidayExcessPay?: number;
	legalHolidayRestDayPay?: number;
	legalHolidayExcess1Pay?: number;
	legalHolidayRestDayExcessPay?: number;
	leavePay?: number;
	christmasGift?: number;
	specialBonus?: number;
	mandatoryContributionAdjustment?: number;
	guaranteedBonus?: number;
	hysMealAllowance?: number;
	obAllowance?: number;
	otherAdjustment?: number;
	overtimeMealAllowance?: number;
	sportsfestOt?: number;
	fringeBenefit?: number;
	annualIncentive?: number;
	technicalSkillsAllowance?: number;
	aclVlConversionTaxable?: number;
	adjustmentOverusedLeave?: number;
	thirteenthMonthAdjustment?: number;
	productionIncentives?: number;
	otherCompensation?: number;
	adjustmentBasic?: number;
	adjustmentOtNd?: number;
	adjustmentNonTax?: number;
	excessDeduction?: number;
	deMinimisAllowance?: number;
	christmasGiftKid?: number;
	birthdayGiftKid?: number;
	birthdayGiftEmployee?: number;
	fringeBenefitTax?: number;
	sssEmergencyLoan?: number;
	philHealthContributionAdjustment?: number;
	excessInternetUsage?: number;
	taxPayable?: number;
	adjustmentBasicDeduction?: number;
	excessMlBenefits?: number;
	uniformDeduction?: number;
	sssLoanRestructuringProgram?: number;
	phicOnePercentDifferential?: number;
	modifiedHdmf2?: number;
	communityTaxCertificate?: number;
	hdmfContributionAdjustment?: number;
	personalCallsUsage?: number;
	healthInsurance?: number;
	shuttleService?: number;
	negativeAdjustment?: number;
	bnpiEmergencyLoan?: number;
	bnpiSalaryLoan?: number;
	rcbcLoan?: number;
	hdmfCalamityLoan?: number;
	hdmfSalaryLoan?: number;
	sssCalamityLoan?: number;
	sssSalaryLoan?: number;
	adjustmentHolidayPay?: number;
	communityTaxCert?: number;
	oneKChristmasGift?: number;
	taxRefund?: number;
	thirteenthMonthPay?: number;
	aclVlConversion?: number;
	otMealAllowance?: number;
	perfectAttendance?: number;
	mealAllowance?: number;
	lineLeaderAllowance?: number;
	totalReceivable?: number;
	employeePayrollComputationView?: EmployeePayrollComputationView | null;
	payrollRegisterColumns?: Array<{
		column: string;
		label: string;
		field: string;
		value: number;
		source?: string;
	}> | null;
	timesheet?: Timesheet;
	timesheetSnapshot?: TimesheetSnapshot;
	isPaid?: boolean;
	paidAt?: string | null;
	notes?: string | null;
	metadata?: {
		payslip?: {
			documentId?: string | null;
			documentNumber?: string | null;
			fileUrl?: string | null;
			generatedAt?: string | null;
		};
		/** Explicit retro lines from next-period PayrollCorrection apply */
		payrollCorrections?: Array<{
			correctionId?: string;
			requestId?: string | null;
			sourcePayrollPeriodId?: string;
			sourcePayrollPeriodName?: string | null;
			sourceTimesheetId?: string;
			label?: string;
			amount?: number;
			status?: string;
			appliedAt?: string;
			dayDeltas?: Array<{
				date: string;
				hoursType?: string;
				beforeMinutes?: number;
				afterMinutes?: number;
				deltaMinutes?: number;
				timeIn?: string;
				timeOut?: string;
				notes?: string | null;
			}>;
		}>;
		payrollCorrectionsAppliedAmount?: number;
		[key: string]: any;
	};
}

export interface Pagination {
	total: number;
	page: number;
	limit: number;
	totalPages: number;
	hasNext: boolean;
	hasPrev: boolean;
}

export interface EmployeePayrollsResponse {
	status: string;
	message: string;
	data: {
		employeePayrolls: EmployeePayroll[];
		pagination: Pagination;
	};
	code: number;
	timestamp: string;
}
