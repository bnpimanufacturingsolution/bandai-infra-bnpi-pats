
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 6.5.0
 * Query Engine version: 173f8d54f8d52e692c7e27e72a88314ec7aeff60
 */
Prisma.prismaVersion = {
  client: "6.5.0",
  engine: "173f8d54f8d52e692c7e27e72a88314ec7aeff60"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.ActivityLoggingScalarFieldEnum = {
  id: 'id',
  employeeId: 'employeeId',
  headers: 'headers',
  ip: 'ip',
  path: 'path',
  method: 'method',
  page: 'page',
  action: 'action',
  description: 'description',
  payload: 'payload',
  organizationId: 'organizationId',
  entityType: 'entityType',
  archive: 'archive',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AgencyScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  name: 'name',
  code: 'code',
  status: 'status',
  contactName: 'contactName',
  contactEmail: 'contactEmail',
  contactPhone: 'contactPhone',
  metadata: 'metadata',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ApplicantScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  applicantId: 'applicantId',
  personId: 'personId',
  portfolioUrl: 'portfolioUrl',
  jobId: 'jobId',
  positionId: 'positionId',
  departmentId: 'departmentId',
  appliedDate: 'appliedDate',
  applicationSource: 'applicationSource',
  workflowInstanceId: 'workflowInstanceId',
  currentWorkflowStateKey: 'currentWorkflowStateKey',
  currentStepExecutionId: 'currentStepExecutionId',
  lastCompletedStepExecutionId: 'lastCompletedStepExecutionId',
  expectedSalary: 'expectedSalary',
  currency: 'currency',
  availabilityDate: 'availabilityDate',
  noticePeriod: 'noticePeriod',
  metadata: 'metadata',
  referredBy: 'referredBy',
  referralBonus: 'referralBonus',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  convertedToEmployeeId: 'convertedToEmployeeId'
};

exports.Prisma.RecruitmentActivityScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  applicantId: 'applicantId',
  workflowInstanceId: 'workflowInstanceId',
  stepExecutionId: 'stepExecutionId',
  stateKey: 'stateKey',
  type: 'type',
  title: 'title',
  details: 'details',
  actorEmployeeId: 'actorEmployeeId',
  occurredAt: 'occurredAt',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ApplicantAttachmentScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  applicantId: 'applicantId',
  type: 'type',
  name: 'name',
  url: 'url',
  mimeType: 'mimeType',
  size: 'size',
  uploadedByEmployeeId: 'uploadedByEmployeeId',
  uploadedAt: 'uploadedAt',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AttendanceScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  employeeId: 'employeeId',
  date: 'date',
  timeIn: 'timeIn',
  timeBreak: 'timeBreak',
  timeOut: 'timeOut',
  status: 'status',
  behaviorFlags: 'behaviorFlags',
  scheduleSnapshot: 'scheduleSnapshot',
  timeInLocation: 'timeInLocation',
  timeOutLocation: 'timeOutLocation',
  deviceInfo: 'deviceInfo',
  isManualEntry: 'isManualEntry',
  approvedBy: 'approvedBy',
  ledgerType: 'ledgerType',
  sourceRequestId: 'sourceRequestId',
  supersedesAttendanceId: 'supersedesAttendanceId',
  appliedAt: 'appliedAt',
  appliedBy: 'appliedBy',
  isEffective: 'isEffective',
  totalMinutesWorked: 'totalMinutesWorked',
  regularMinutes: 'regularMinutes',
  overtimeMinutes: 'overtimeMinutes',
  undertimeMinutes: 'undertimeMinutes',
  lateMinutes: 'lateMinutes',
  earlyOutMinutes: 'earlyOutMinutes',
  breakMinutes: 'breakMinutes',
  employeeCodeSnapshot: 'employeeCodeSnapshot',
  employeeNameSnapshot: 'employeeNameSnapshot',
  departmentIdSnapshot: 'departmentIdSnapshot',
  departmentNameSnapshot: 'departmentNameSnapshot',
  reportToIdSnapshot: 'reportToIdSnapshot',
  workforceSourceSnapshot: 'workforceSourceSnapshot',
  agencyIdSnapshot: 'agencyIdSnapshot',
  hoursWorked: 'hoursWorked',
  regularHours: 'regularHours',
  overtimeHours: 'overtimeHours',
  undertimeHours: 'undertimeHours',
  lateHours: 'lateHours',
  earlyOutHours: 'earlyOutHours',
  timesheetId: 'timesheetId',
  notes: 'notes',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AttendanceObligationScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  employeeId: 'employeeId',
  payrollPeriodId: 'payrollPeriodId',
  date: 'date',
  businessDate: 'businessDate',
  timezone: 'timezone',
  status: 'status',
  phase: 'phase',
  attendanceId: 'attendanceId',
  timesheetId: 'timesheetId',
  timesheetlineId: 'timesheetlineId',
  expectedStartAt: 'expectedStartAt',
  expectedEndAt: 'expectedEndAt',
  timeIn: 'timeIn',
  timeBreak: 'timeBreak',
  timeOut: 'timeOut',
  hoursWorked: 'hoursWorked',
  regularHours: 'regularHours',
  overtimeHours: 'overtimeHours',
  undertimeHours: 'undertimeHours',
  lateHours: 'lateHours',
  earlyOutHours: 'earlyOutHours',
  breakMinutes: 'breakMinutes',
  behaviorFlags: 'behaviorFlags',
  scheduleSnapshot: 'scheduleSnapshot',
  scheduleFingerprint: 'scheduleFingerprint',
  source: 'source',
  sourceRequestId: 'sourceRequestId',
  metadata: 'metadata',
  employeeCodeSnapshot: 'employeeCodeSnapshot',
  employeeNameSnapshot: 'employeeNameSnapshot',
  departmentIdSnapshot: 'departmentIdSnapshot',
  departmentNameSnapshot: 'departmentNameSnapshot',
  reportToIdSnapshot: 'reportToIdSnapshot',
  workforceSourceSnapshot: 'workforceSourceSnapshot',
  agencyIdSnapshot: 'agencyIdSnapshot',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AuditLoggingScalarFieldEnum = {
  id: 'id',
  employeeId: 'employeeId',
  type: 'type',
  severity: 'severity',
  entity: 'entity',
  changes: 'changes',
  metadata: 'metadata',
  description: 'description',
  payload: 'payload',
  archiveStatus: 'archiveStatus',
  archiveDate: 'archiveDate',
  isDeleted: 'isDeleted',
  timestamp: 'timestamp',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BenefitTypeScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  name: 'name',
  description: 'description',
  category: 'category',
  provider: 'provider',
  coverage: 'coverage',
  minAmount: 'minAmount',
  maxAmount: 'maxAmount',
  fixedAmount: 'fixedAmount',
  percentage: 'percentage',
  minServiceMonths: 'minServiceMonths',
  isTaxable: 'isTaxable',
  defaultInstallments: 'defaultInstallments',
  payrollCycleDays: 'payrollCycleDays',
  requireTermsAgreement: 'requireTermsAgreement',
  isActive: 'isActive',
  isDeleted: 'isDeleted',
  isDefault: 'isDefault',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BoardingProcessScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  employeeId: 'employeeId',
  departmentId: 'departmentId',
  type: 'type',
  status: 'status',
  startDate: 'startDate',
  targetDate: 'targetDate',
  actualCompleteDate: 'actualCompleteDate',
  exitReason: 'exitReason',
  assignedToId: 'assignedToId',
  assignedToName: 'assignedToName',
  metadata: 'metadata',
  lastViewedAt: 'lastViewedAt',
  reminderFrequency: 'reminderFrequency',
  completionPercentage: 'completionPercentage',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BoardingTemplateScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  role: 'role',
  name: 'name',
  description: 'description',
  type: 'type',
  isDefault: 'isDefault',
  isActive: 'isActive',
  metadata: 'metadata',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CalculatorScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  code: 'code',
  name: 'name',
  description: 'description',
  type: 'type',
  taxRates: 'taxRates',
  sssRates: 'sssRates',
  philHealthRates: 'philHealthRates',
  pagibigRates: 'pagibigRates',
  rateMultipliers: 'rateMultipliers',
  isActive: 'isActive',
  isDefault: 'isDefault',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CalendarItemScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  year: 'year',
  title: 'title',
  description: 'description',
  type: 'type',
  startDate: 'startDate',
  endDate: 'endDate',
  isAllDay: 'isAllDay',
  timezone: 'timezone',
  recurrence: 'recurrence',
  metadata: 'metadata',
  reminders: 'reminders',
  tags: 'tags',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  assignedEmployeeId: 'assignedEmployeeId'
};

exports.Prisma.ChecklistItemScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  processId: 'processId',
  title: 'title',
  description: 'description',
  category: 'category',
  status: 'status',
  priority: 'priority',
  dueDate: 'dueDate',
  completedDate: 'completedDate',
  completedBy: 'completedBy',
  completedByName: 'completedByName',
  order: 'order',
  uiElement: 'uiElement',
  comments: 'comments',
  metadata: 'metadata',
  isOptional: 'isOptional',
  estimatedTime: 'estimatedTime',
  dependencies: 'dependencies',
  viewedAt: 'viewedAt',
  startedAt: 'startedAt',
  reminderSent: 'reminderSent',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DepartmentScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  name: 'name',
  code: 'code',
  description: 'description',
  managerId: 'managerId',
  parentId: 'parentId',
  isHr: 'isHr',
  isActive: 'isActive',
  isDefault: 'isDefault',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DepartmentScheduleTemplateScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  departmentId: 'departmentId',
  scheduleTemplateId: 'scheduleTemplateId',
  source: 'source',
  createdByEmployeeId: 'createdByEmployeeId',
  isActive: 'isActive',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DeviceScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  name: 'name',
  address: 'address',
  port: 'port',
  protocol: 'protocol',
  config: 'config',
  access: 'access',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  isDeleted: 'isDeleted'
};

exports.Prisma.DocumentScalarFieldEnum = {
  id: 'id',
  name: 'name',
  type: 'type',
  number: 'number',
  issueDate: 'issueDate',
  expiryDate: 'expiryDate',
  fileUrl: 'fileUrl',
  ext: 'ext',
  documentTypeId: 'documentTypeId',
  fieldValues: 'fieldValues',
  reviewStatus: 'reviewStatus',
  reviewSubmittedAt: 'reviewSubmittedAt',
  reviewSubmittedById: 'reviewSubmittedById',
  reviewApprovedAt: 'reviewApprovedAt',
  reviewApprovedById: 'reviewApprovedById',
  reviewRejectedAt: 'reviewRejectedAt',
  reviewRejectedById: 'reviewRejectedById',
  reviewRejectionReason: 'reviewRejectionReason',
  reviewSource: 'reviewSource',
  metadata: 'metadata',
  employeeId: 'employeeId',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DocumentReviewEventScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  documentId: 'documentId',
  employeeId: 'employeeId',
  actorEmployeeId: 'actorEmployeeId',
  eventType: 'eventType',
  fromStatus: 'fromStatus',
  toStatus: 'toStatus',
  reason: 'reason',
  comments: 'comments',
  source: 'source',
  fileUrl: 'fileUrl',
  fieldChanges: 'fieldChanges',
  occurredAt: 'occurredAt',
  createdAt: 'createdAt'
};

exports.Prisma.DocumentFolderScalarFieldEnum = {
  id: 'id',
  name: 'name',
  employeeId: 'employeeId',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DocumentTypeScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  code: 'code',
  name: 'name',
  category: 'category',
  uploadBy: 'uploadBy',
  isRequired: 'isRequired',
  isEmployeeVisible: 'isEmployeeVisible',
  isActive: 'isActive',
  displayOrder: 'displayOrder',
  fields: 'fields',
  metadata: 'metadata',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.EmployeeScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  employeeId: 'employeeId',
  userId: 'userId',
  role: 'role',
  employmentHireDate: 'employmentHireDate',
  employmentStartDate: 'employmentStartDate',
  employmentTerminationDate: 'employmentTerminationDate',
  employmentStatus: 'employmentStatus',
  employmentType: 'employmentType',
  workforceSource: 'workforceSource',
  agencyId: 'agencyId',
  employer: 'employer',
  probationEndDate: 'probationEndDate',
  departmentId: 'departmentId',
  positionId: 'positionId',
  levelId: 'levelId',
  reportToId: 'reportToId',
  workLocation: 'workLocation',
  leaveBalances: 'leaveBalances',
  leaveBalancesLastUpdated: 'leaveBalancesLastUpdated',
  basicSalary: 'basicSalary',
  currency: 'currency',
  payFrequency: 'payFrequency',
  deviceEmpId: 'deviceEmpId',
  isTour: 'isTour',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  isManager: 'isManager',
  isHrManager: 'isHrManager',
  embeddedSchedule: 'embeddedSchedule',
  metadata: 'metadata',
  personId: 'personId',
  deviceId: 'deviceId',
  employmentHistory: 'employmentHistory'
};

exports.Prisma.EmployeeBenefitScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  employeeId: 'employeeId',
  benefitTypeId: 'benefitTypeId',
  name: 'name',
  description: 'description',
  totalAmount: 'totalAmount',
  currency: 'currency',
  totalInstallments: 'totalInstallments',
  installmentAmount: 'installmentAmount',
  remainingBalance: 'remainingBalance',
  amount: 'amount',
  startDate: 'startDate',
  endDate: 'endDate',
  startPayrollCutOff: 'startPayrollCutOff',
  endPayrollCutOff: 'endPayrollCutOff',
  agreedToTerms: 'agreedToTerms',
  agreedAt: 'agreedAt',
  agreedByIp: 'agreedByIp',
  status: 'status',
  isActive: 'isActive',
  approvedById: 'approvedById',
  approvedAt: 'approvedAt',
  notes: 'notes',
  remarks: 'remarks',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.EmployeeBenefitInstallmentScalarFieldEnum = {
  id: 'id',
  employeeBenefitId: 'employeeBenefitId',
  installmentNumber: 'installmentNumber',
  amount: 'amount',
  scheduledDate: 'scheduledDate',
  processedDate: 'processedDate',
  payrollCutOffId: 'payrollCutOffId',
  payrollRunId: 'payrollRunId',
  status: 'status',
  failureReason: 'failureReason',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.EmployeeLoanScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  employeeId: 'employeeId',
  loanTypeId: 'loanTypeId',
  principalAmount: 'principalAmount',
  interestRate: 'interestRate',
  totalAmount: 'totalAmount',
  termMonths: 'termMonths',
  monthlyPayment: 'monthlyPayment',
  startDate: 'startDate',
  endDate: 'endDate',
  amountPaid: 'amountPaid',
  balance: 'balance',
  status: 'status',
  approvedBy: 'approvedBy',
  approvedAt: 'approvedAt',
  notes: 'notes',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.EmployeePayrollScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  employeeId: 'employeeId',
  payrollPeriodId: 'payrollPeriodId',
  timesheetId: 'timesheetId',
  basicPay: 'basicPay',
  overtimePay: 'overtimePay',
  nightDiffPay: 'nightDiffPay',
  holidayPay: 'holidayPay',
  allowances: 'allowances',
  bonuses: 'bonuses',
  taxAmount: 'taxAmount',
  sssContribution: 'sssContribution',
  philHealthContribution: 'philHealthContribution',
  pagibigContribution: 'pagibigContribution',
  loanDeductions: 'loanDeductions',
  absentDeduction: 'absentDeduction',
  lateDeduction: 'lateDeduction',
  earlyOutDeduction: 'earlyOutDeduction',
  otherDeductions: 'otherDeductions',
  grossPay: 'grossPay',
  taxableIncome: 'taxableIncome',
  totalDeductions: 'totalDeductions',
  netPay: 'netPay',
  timesheetSnapshot: 'timesheetSnapshot',
  metadata: 'metadata',
  rateBreakdown: 'rateBreakdown',
  dailyBreakdown: 'dailyBreakdown',
  isPaid: 'isPaid',
  paidAt: 'paidAt',
  paymentMethod: 'paymentMethod',
  referenceNumber: 'referenceNumber',
  notes: 'notes',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.EmployeeScheduleHistoryScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  employeeId: 'employeeId',
  action: 'action',
  effectiveAt: 'effectiveAt',
  actorEmployeeId: 'actorEmployeeId',
  reason: 'reason',
  beforeSchedule: 'beforeSchedule',
  afterSchedule: 'afterSchedule',
  metadata: 'metadata',
  createdAt: 'createdAt'
};

exports.Prisma.GuideScalarFieldEnum = {
  id: 'id',
  title: 'title',
  description: 'description',
  sections: 'sections',
  published: 'published',
  author: 'author',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  isDeleted: 'isDeleted'
};

exports.Prisma.JobScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  departmentId: 'departmentId',
  sourceRequestId: 'sourceRequestId',
  headcountRequested: 'headcountRequested',
  positionId: 'positionId',
  levelId: 'levelId',
  tags: 'tags',
  type: 'type',
  location: 'location',
  description: 'description',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LeavePolicyConfigScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  leaveType: 'leaveType',
  enabled: 'enabled',
  isPaid: 'isPaid',
  requiresApproval: 'requiresApproval',
  minAdvanceNoticeDays: 'minAdvanceNoticeDays',
  maxDaysPerRequest: 'maxDaysPerRequest',
  allowHalfDay: 'allowHalfDay',
  requireAttachment: 'requireAttachment',
  allowedEmploymentTypes: 'allowedEmploymentTypes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LevelScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  name: 'name',
  rank: 'rank',
  description: 'description',
  isManager: 'isManager',
  isActive: 'isActive',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LoanTypeScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  name: 'name',
  description: 'description',
  category: 'category',
  maxAmount: 'maxAmount',
  minAmount: 'minAmount',
  interestRate: 'interestRate',
  maxTermMonths: 'maxTermMonths',
  minServiceMonths: 'minServiceMonths',
  isActive: 'isActive',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.NoteScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  processId: 'processId',
  content: 'content',
  authorId: 'authorId',
  authorName: 'authorName',
  metadata: 'metadata',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.NotificationScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  sourceEmployeeId: 'sourceEmployeeId',
  category: 'category',
  title: 'title',
  description: 'description',
  type: 'type',
  eventKey: 'eventKey',
  recipients: 'recipients',
  metadata: 'metadata',
  archive: 'archive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.OrganizationScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  code: 'code',
  branding: 'branding',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  isDeleted: 'isDeleted'
};

exports.Prisma.PayrollCycleConfigScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  defaultPayFrequency: 'defaultPayFrequency',
  payDateOffsetDays: 'payDateOffsetDays',
  businessDayRule: 'businessDayRule',
  includeHolidaysInBusinessDayCheck: 'includeHolidaysInBusinessDayCheck',
  cycleRules: 'cycleRules',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PayrollPeriodScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  name: 'name',
  code: 'code',
  payFrequency: 'payFrequency',
  periodNumber: 'periodNumber',
  startDate: 'startDate',
  endDate: 'endDate',
  payDate: 'payDate',
  calculatorId: 'calculatorId',
  status: 'status',
  cutoffDay: 'cutoffDay',
  notes: 'notes',
  generationMetadata: 'generationMetadata',
  processedBy: 'processedBy',
  processedAt: 'processedAt',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PersonScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  userId: 'userId',
  employeeId: 'employeeId',
  personalInfo: 'personalInfo',
  contactInfo: 'contactInfo',
  identification: 'identification',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  isDeleted: 'isDeleted'
};

exports.Prisma.ChildScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  parentId: 'parentId',
  firstName: 'firstName',
  middleName: 'middleName',
  lastName: 'lastName',
  dateOfBirth: 'dateOfBirth',
  gender: 'gender',
  notes: 'notes',
  isDependent: 'isDependent',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  isDeleted: 'isDeleted'
};

exports.Prisma.PositionScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  title: 'title',
  code: 'code',
  description: 'description',
  departmentId: 'departmentId',
  minSalary: 'minSalary',
  maxSalary: 'maxSalary',
  isActive: 'isActive',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  isOffer: 'isOffer'
};

exports.Prisma.PositionLevelScalarFieldEnum = {
  id: 'id',
  positionId: 'positionId',
  levelId: 'levelId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RequestScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  code: 'code',
  type: 'type',
  currentWorkflowStateKey: 'currentWorkflowStateKey',
  startDate: 'startDate',
  endDate: 'endDate',
  description: 'description',
  attachments: 'attachments',
  requesterId: 'requesterId',
  targetEmployeeId: 'targetEmployeeId',
  workflowInstanceId: 'workflowInstanceId',
  currentStepExecutionId: 'currentStepExecutionId',
  lastCompletedStepExecutionId: 'lastCompletedStepExecutionId',
  notes: 'notes',
  metadata: 'metadata',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RequestTransactionScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  requestId: 'requestId',
  workflowInstanceId: 'workflowInstanceId',
  stepExecutionId: 'stepExecutionId',
  actorEmployeeId: 'actorEmployeeId',
  sequenceNumber: 'sequenceNumber',
  eventCategory: 'eventCategory',
  eventKey: 'eventKey',
  eventSource: 'eventSource',
  actorType: 'actorType',
  actorRole: 'actorRole',
  actorDisplayName: 'actorDisplayName',
  title: 'title',
  description: 'description',
  comments: 'comments',
  fromStateKey: 'fromStateKey',
  toStateKey: 'toStateKey',
  fieldChanges: 'fieldChanges',
  metadata: 'metadata',
  visibility: 'visibility',
  isSystemGenerated: 'isSystemGenerated',
  occurredAt: 'occurredAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RuleScalarFieldEnum = {
  id: 'id',
  title: 'title',
  code: 'code',
  category: 'category',
  severity: 'severity',
  description: 'description',
  consequences: 'consequences',
  isActive: 'isActive',
  effectiveDate: 'effectiveDate',
  expiryDate: 'expiryDate',
  organizationId: 'organizationId',
  createdById: 'createdById',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ScheduleOverrideScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  employeeId: 'employeeId',
  date: 'date',
  shiftTypeId: 'shiftTypeId',
  reason: 'reason',
  createdByEmployeeId: 'createdByEmployeeId',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ScheduleTemplateScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  name: 'name',
  code: 'code',
  description: 'description',
  cycleDays: 'cycleDays',
  graceLateMinutes: 'graceLateMinutes',
  graceEarlyOutMinutes: 'graceEarlyOutMinutes',
  pattern: 'pattern',
  isActive: 'isActive',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ShiftTypeScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  name: 'name',
  code: 'code',
  isOvernight: 'isOvernight',
  isOff: 'isOff',
  timeSlots: 'timeSlots',
  isActive: 'isActive',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SOALineItemScalarFieldEnum = {
  id: 'id',
  statementOfAccountId: 'statementOfAccountId',
  category: 'category',
  description: 'description',
  employeeId: 'employeeId',
  employeePayrollId: 'employeePayrollId',
  employeeLoanId: 'employeeLoanId',
  employeeBenefitId: 'employeeBenefitId',
  taxableAmount: 'taxableAmount',
  taxAmount: 'taxAmount',
  employeeShare: 'employeeShare',
  employerShare: 'employerShare',
  totalAmount: 'totalAmount',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SOARemittanceScalarFieldEnum = {
  id: 'id',
  statementOfAccountId: 'statementOfAccountId',
  amount: 'amount',
  paymentMethod: 'paymentMethod',
  referenceNumber: 'referenceNumber',
  paymentDate: 'paymentDate',
  category: 'category',
  status: 'status',
  notes: 'notes',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StatementOfAccountScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  soaNumber: 'soaNumber',
  name: 'name',
  startDate: 'startDate',
  endDate: 'endDate',
  dueDate: 'dueDate',
  payrollPeriodIds: 'payrollPeriodIds',
  totalEmployeeShare: 'totalEmployeeShare',
  totalEmployerShare: 'totalEmployerShare',
  totalTax: 'totalTax',
  totalAmount: 'totalAmount',
  totalRemitted: 'totalRemitted',
  totalOutstanding: 'totalOutstanding',
  eppReferenceId: 'eppReferenceId',
  eppBillingId: 'eppBillingId',
  eppReconciled: 'eppReconciled',
  eppReconciledAt: 'eppReconciledAt',
  eppReconciledById: 'eppReconciledById',
  remitteeName: 'remitteeName',
  remitteeAccount: 'remitteeAccount',
  remitteeDetails: 'remitteeDetails',
  status: 'status',
  notes: 'notes',
  description: 'description',
  metadata: 'metadata',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StatusIncidentScalarFieldEnum = {
  id: 'id',
  incidentKey: 'incidentKey',
  moduleSlug: 'moduleSlug',
  moduleName: 'moduleName',
  status: 'status',
  message: 'message',
  startedAt: 'startedAt',
  resolvedAt: 'resolvedAt',
  isResolved: 'isResolved',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StatusStateScalarFieldEnum = {
  id: 'id',
  stateKey: 'stateKey',
  snapshots: 'snapshots',
  incidents: 'incidents',
  runtimeData: 'runtimeData',
  httpEvents: 'httpEvents',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TemplateScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  type: 'type',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TemplateItemScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  templateId: 'templateId',
  title: 'title',
  description: 'description',
  category: 'category',
  dueOffset: 'dueOffset',
  priority: 'priority',
  order: 'order',
  uiElement: 'uiElement',
  metadata: 'metadata',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TerminationScalarFieldEnum = {
  id: 'id',
  terminationNumber: 'terminationNumber',
  organizationId: 'organizationId',
  employeeId: 'employeeId',
  initiatedById: 'initiatedById',
  terminationType: 'terminationType',
  status: 'status',
  terminationDate: 'terminationDate',
  lastWorkingDay: 'lastWorkingDay',
  reason: 'reason',
  severancePackage: 'severancePackage',
  supportingDocuments: 'supportingDocuments',
  hrDirectorApprovedAt: 'hrDirectorApprovedAt',
  hrDirectorId: 'hrDirectorId',
  hrDirectorComments: 'hrDirectorComments',
  legalApprovalRequired: 'legalApprovalRequired',
  legalApprovedAt: 'legalApprovedAt',
  legalApproverId: 'legalApproverId',
  legalComments: 'legalComments',
  processingStartedAt: 'processingStartedAt',
  processingCompletedAt: 'processingCompletedAt',
  finalPayCalculated: 'finalPayCalculated',
  clearanceCompleted: 'clearanceCompleted',
  terminationLetterPath: 'terminationLetterPath',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TerminationAuditLogScalarFieldEnum = {
  id: 'id',
  terminationId: 'terminationId',
  action: 'action',
  performedBy: 'performedBy',
  performedByName: 'performedByName',
  fromStatus: 'fromStatus',
  toStatus: 'toStatus',
  comments: 'comments',
  metadata: 'metadata',
  timestamp: 'timestamp'
};

exports.Prisma.TimesheetConfigScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  enableAutoApprove: 'enableAutoApprove',
  enableEditBeforeSubmission: 'enableEditBeforeSubmission',
  rejectBehavior: 'rejectBehavior',
  overtimeFlagThresholdMinutes: 'overtimeFlagThresholdMinutes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TimesheetScalarFieldEnum = {
  id: 'id',
  code: 'code',
  organizationId: 'organizationId',
  employeeId: 'employeeId',
  payrollPeriodId: 'payrollPeriodId',
  totalDays: 'totalDays',
  totalHoursWorked: 'totalHoursWorked',
  totalRegularHours: 'totalRegularHours',
  totalOvertimeHours: 'totalOvertimeHours',
  totalUndertimeHours: 'totalUndertimeHours',
  totalLateHours: 'totalLateHours',
  totalEarlyOutHours: 'totalEarlyOutHours',
  metadata: 'metadata',
  status: 'status',
  submittedAt: 'submittedAt',
  submittedBy: 'submittedBy',
  approvedBy: 'approvedBy',
  approvalDate: 'approvalDate',
  rejectionReason: 'rejectionReason',
  notes: 'notes',
  editPermissionStatus: 'editPermissionStatus',
  editPermissionRequestId: 'editPermissionRequestId',
  editPermissionRequestedAt: 'editPermissionRequestedAt',
  editPermissionGrantedAt: 'editPermissionGrantedAt',
  editPermissionGrantedBy: 'editPermissionGrantedBy',
  editPermissionRejectedAt: 'editPermissionRejectedAt',
  editPermissionRejectedBy: 'editPermissionRejectedBy',
  editPermissionRejectionReason: 'editPermissionRejectionReason',
  editPermissionConsumedAt: 'editPermissionConsumedAt',
  editPermissionExpiresAt: 'editPermissionExpiresAt',
  editPermissionReason: 'editPermissionReason',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TimesheetlineScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  employeeId: 'employeeId',
  timesheetId: 'timesheetId',
  payrollPeriodId: 'payrollPeriodId',
  attendanceId: 'attendanceId',
  date: 'date',
  timeIn: 'timeIn',
  timeBreak: 'timeBreak',
  timeOut: 'timeOut',
  status: 'status',
  behaviorFlags: 'behaviorFlags',
  scheduleSnapshot: 'scheduleSnapshot',
  hoursWorked: 'hoursWorked',
  regularHours: 'regularHours',
  overtimeHours: 'overtimeHours',
  undertimeHours: 'undertimeHours',
  lateHours: 'lateHours',
  earlyOutHours: 'earlyOutHours',
  breakMinutes: 'breakMinutes',
  employeeNotes: 'employeeNotes',
  approverNotes: 'approverNotes',
  notes: 'notes',
  metadata: 'metadata',
  primaryMarker: 'primaryMarker',
  isManualEntry: 'isManualEntry',
  isVirtual: 'isVirtual',
  revisionNo: 'revisionNo',
  isEffective: 'isEffective',
  ledgerType: 'ledgerType',
  supersedesLineId: 'supersedesLineId',
  supersededById: 'supersededById',
  supersededAt: 'supersededAt',
  editedAt: 'editedAt',
  editedBy: 'editedBy',
  editReason: 'editReason',
  employeeCodeSnapshot: 'employeeCodeSnapshot',
  employeeNameSnapshot: 'employeeNameSnapshot',
  departmentIdSnapshot: 'departmentIdSnapshot',
  departmentNameSnapshot: 'departmentNameSnapshot',
  reportToIdSnapshot: 'reportToIdSnapshot',
  workforceSourceSnapshot: 'workforceSourceSnapshot',
  agencyIdSnapshot: 'agencyIdSnapshot',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  userName: 'userName',
  email: 'email',
  password: 'password',
  role: 'role',
  status: 'status',
  isDeleted: 'isDeleted',
  lastLogin: 'lastLogin',
  loginMethod: 'loginMethod',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  organizationId: 'organizationId',
  metadata: 'metadata'
};

exports.Prisma.WorkflowInstanceScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  domain: 'domain',
  domainRecordId: 'domainRecordId',
  requestType: 'requestType',
  code: 'code',
  name: 'name',
  description: 'description',
  steps: 'steps',
  states: 'states',
  currentStateKey: 'currentStateKey',
  stateHistory: 'stateHistory',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.WorkflowStepExecutionScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  workflowInstanceId: 'workflowInstanceId',
  requestId: 'requestId',
  applicantId: 'applicantId',
  stepNumber: 'stepNumber',
  stepName: 'stepName',
  stepType: 'stepType',
  assigneeType: 'assigneeType',
  assigneeRole: 'assigneeRole',
  assigneeId: 'assigneeId',
  status: 'status',
  completedAt: 'completedAt',
  comments: 'comments',
  metadata: 'metadata',
  isRequired: 'isRequired',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.WorkforceRecruitmentSettingScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  isEnabled: 'isEnabled',
  enforceDepartmentManagerScope: 'enforceDepartmentManagerScope',
  defaultWorkflowCode: 'defaultWorkflowCode',
  requestSubtype: 'requestSubtype',
  autoCreateJobOnApproval: 'autoCreateJobOnApproval',
  seededAt: 'seededAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.WorkforceRecruitmentPolicyScalarFieldEnum = {
  id: 'id',
  settingId: 'settingId',
  organizationId: 'organizationId',
  departmentId: 'departmentId',
  positionId: 'positionId',
  levelId: 'levelId',
  targetHeadcount: 'targetHeadcount',
  limitBehavior: 'limitBehavior',
  defaultWorkflowCode: 'defaultWorkflowCode',
  autoCreateJobOnApproval: 'autoCreateJobOnApproval',
  jobType: 'jobType',
  jobLocation: 'jobLocation',
  jobTags: 'jobTags',
  jobDescriptionTemplate: 'jobDescriptionTemplate',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};
exports.AgencyStatus = exports.$Enums.AgencyStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE'
};

exports.ApplicationSource = exports.$Enums.ApplicationSource = {
  WEBSITE: 'WEBSITE',
  REFERRAL: 'REFERRAL',
  JOB_BOARD: 'JOB_BOARD',
  SOCIAL_MEDIA: 'SOCIAL_MEDIA',
  RECRUITER: 'RECRUITER',
  INTERNAL: 'INTERNAL',
  WALK_IN: 'WALK_IN',
  OTHER: 'OTHER'
};

exports.RecruitmentActivityType = exports.$Enums.RecruitmentActivityType = {
  NOTE: 'NOTE',
  INTERVIEW: 'INTERVIEW',
  REJECTION: 'REJECTION',
  OFFER: 'OFFER',
  ASSIGNMENT: 'ASSIGNMENT',
  EMAIL_EVENT: 'EMAIL_EVENT',
  SYSTEM_EVENT: 'SYSTEM_EVENT'
};

exports.ApplicantAttachmentType = exports.$Enums.ApplicantAttachmentType = {
  RESUME: 'RESUME',
  CONTRACT: 'CONTRACT',
  PORTFOLIO: 'PORTFOLIO',
  CERTIFICATE: 'CERTIFICATE',
  OTHER: 'OTHER'
};

exports.AttendanceStatus = exports.$Enums.AttendanceStatus = {
  PRESENT: 'PRESENT',
  LEAVE: 'LEAVE',
  INCOMPLETE: 'INCOMPLETE',
  ABSENT: 'ABSENT',
  REST_DAY: 'REST_DAY'
};

exports.AttendanceLedgerType = exports.$Enums.AttendanceLedgerType = {
  RAW: 'RAW',
  CORRECTION: 'CORRECTION'
};

exports.WorkforceSource = exports.$Enums.WorkforceSource = {
  DIRECT: 'DIRECT',
  AGENCY: 'AGENCY'
};

exports.BenefitCategory = exports.$Enums.BenefitCategory = {
  INSURANCE: 'INSURANCE',
  ALLOWANCE: 'ALLOWANCE',
  BONUS: 'BONUS',
  RETIREMENT: 'RETIREMENT',
  HEALTH: 'HEALTH',
  EDUCATION: 'EDUCATION',
  TRANSPORTATION: 'TRANSPORTATION',
  OTHER: 'OTHER'
};

exports.BoardingType = exports.$Enums.BoardingType = {
  ONBOARDING: 'ONBOARDING',
  OFFBOARDING: 'OFFBOARDING'
};

exports.BoardingStatus = exports.$Enums.BoardingStatus = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
};

exports.CalculatorType = exports.$Enums.CalculatorType = {
  BASIC: 'BASIC',
  GROSS_TO_NET: 'GROSS_TO_NET',
  NET_TO_GROSS: 'NET_TO_GROSS',
  THIRTEENTH_MONTH: 'THIRTEENTH_MONTH',
  CUSTOM: 'CUSTOM'
};

exports.CalendarItemType = exports.$Enums.CalendarItemType = {
  HOLIDAY: 'HOLIDAY',
  EVENT: 'EVENT',
  COMPANY_EVENT: 'COMPANY_EVENT',
  MEETING: 'MEETING',
  DEADLINE: 'DEADLINE',
  REMINDER: 'REMINDER',
  BIRTHDAY: 'BIRTHDAY'
};

exports.ItemStatus = exports.$Enums.ItemStatus = {
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
  DRAFT: 'DRAFT'
};

exports.ChecklistCategory = exports.$Enums.ChecklistCategory = {
  HR_DOCUMENTATION: 'HR_DOCUMENTATION',
  IT_SETUP: 'IT_SETUP',
  WORKSPACE_SETUP: 'WORKSPACE_SETUP',
  TRAINING: 'TRAINING',
  COMPLIANCE: 'COMPLIANCE',
  ACCESS_MANAGEMENT: 'ACCESS_MANAGEMENT',
  EQUIPMENT: 'EQUIPMENT',
  BENEFITS: 'BENEFITS',
  KNOWLEDGE_TRANSFER: 'KNOWLEDGE_TRANSFER',
  EXIT_INTERVIEW: 'EXIT_INTERVIEW',
  ORIENTATION: 'ORIENTATION',
  SECURITY: 'SECURITY',
  PAYROLL: 'PAYROLL',
  OTHER: 'OTHER'
};

exports.ChecklistStatus = exports.$Enums.ChecklistStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  FOR_REVIEW: 'FOR_REVIEW',
  COMPLETED: 'COMPLETED',
  SKIPPED: 'SKIPPED',
  BLOCKED: 'BLOCKED'
};

exports.Priority = exports.$Enums.Priority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

exports.DepartmentScheduleTemplateSource = exports.$Enums.DepartmentScheduleTemplateSource = {
  department_default: 'department_default',
  department_head_created: 'department_head_created',
  department_head_linked: 'department_head_linked'
};

exports.Protocol = exports.$Enums.Protocol = {
  http: 'http',
  https: 'https',
  tcp: 'tcp',
  udp: 'udp'
};

exports.DocumentReviewStatus = exports.$Enums.DocumentReviewStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED'
};

exports.DocumentReviewSource = exports.$Enums.DocumentReviewSource = {
  EMPLOYEE_UPLOAD: 'EMPLOYEE_UPLOAD',
  HR_UPLOAD: 'HR_UPLOAD',
  MIGRATION: 'MIGRATION',
  SYSTEM: 'SYSTEM'
};

exports.DocumentReviewEventType = exports.$Enums.DocumentReviewEventType = {
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  RESUBMITTED: 'RESUBMITTED',
  SUPERSEDED: 'SUPERSEDED',
  SYSTEM_SYNCED: 'SYSTEM_SYNCED'
};

exports.EmploymentStatus = exports.$Enums.EmploymentStatus = {
  ACTIVE: 'ACTIVE',
  RESIGNATION_REQUESTED: 'RESIGNATION_REQUESTED',
  SERVING_NOTICE: 'SERVING_NOTICE',
  OFFBOARDING: 'OFFBOARDING',
  ONBOARDING: 'ONBOARDING',
  INACTIVE: 'INACTIVE',
  TERMINATED: 'TERMINATED',
  RESIGNED: 'RESIGNED',
  FORMER_EMPLOYEE: 'FORMER_EMPLOYEE',
  RETIRED: 'RETIRED',
  ON_LEAVE: 'ON_LEAVE'
};

exports.EmploymentType = exports.$Enums.EmploymentType = {
  REGULAR: 'REGULAR',
  PROBATIONARY: 'PROBATIONARY',
  CONTRACTUAL: 'CONTRACTUAL',
  PART_TIME: 'PART_TIME',
  CONSULTANT: 'CONSULTANT',
  INTERN: 'INTERN'
};

exports.WorkLocation = exports.$Enums.WorkLocation = {
  ONSITE: 'ONSITE',
  REMOTE: 'REMOTE',
  HYBRID: 'HYBRID'
};

exports.PayFrequency = exports.$Enums.PayFrequency = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  BIWEEKLY: 'BIWEEKLY',
  SEMI_MONTHLY: 'SEMI_MONTHLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  ANNUALLY: 'ANNUALLY'
};

exports.BenefitProgramStatus = exports.$Enums.BenefitProgramStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  DEFAULTED: 'DEFAULTED'
};

exports.BenefitDeductionStatus = exports.$Enums.BenefitDeductionStatus = {
  SCHEDULED: 'SCHEDULED',
  DEDUCTED: 'DEDUCTED',
  FAILED: 'FAILED',
  WAIVED: 'WAIVED'
};

exports.LoanStatus = exports.$Enums.LoanStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  ACTIVE: 'ACTIVE',
  PAID: 'PAID',
  DEFAULTED: 'DEFAULTED',
  CANCELLED: 'CANCELLED'
};

exports.LeaveType = exports.$Enums.LeaveType = {
  VACATION: 'VACATION',
  SICK: 'SICK',
  PERSONAL: 'PERSONAL',
  MATERNITY: 'MATERNITY',
  PATERNITY: 'PATERNITY',
  BEREAVEMENT: 'BEREAVEMENT',
  UNPAID: 'UNPAID',
  COMPENSATORY: 'COMPENSATORY'
};

exports.LoanCategory = exports.$Enums.LoanCategory = {
  SALARY_LOAN: 'SALARY_LOAN',
  EMERGENCY_LOAN: 'EMERGENCY_LOAN',
  HOUSING_LOAN: 'HOUSING_LOAN',
  CALAMITY_LOAN: 'CALAMITY_LOAN',
  SSS_LOAN: 'SSS_LOAN',
  PAGIBIG_LOAN: 'PAGIBIG_LOAN',
  OTHER: 'OTHER'
};

exports.NotificationType = exports.$Enums.NotificationType = {
  INFO: 'INFO',
  SUCCESS: 'SUCCESS',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  ALERT: 'ALERT',
  REMINDER: 'REMINDER'
};

exports.BusinessDayRule = exports.$Enums.BusinessDayRule = {
  NONE: 'NONE',
  NEXT_BUSINESS_DAY: 'NEXT_BUSINESS_DAY'
};

exports.PeriodStatus = exports.$Enums.PeriodStatus = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  CLOSED: 'CLOSED'
};

exports.GenderType = exports.$Enums.GenderType = {
  male: 'male',
  female: 'female',
  other: 'other',
  prefer_not_to_say: 'prefer_not_to_say',
  unknown: 'unknown',
  not_applicable: 'not_applicable'
};

exports.RequestType = exports.$Enums.RequestType = {
  LEAVE: 'LEAVE',
  TIMESHEET: 'TIMESHEET',
  ATTENDANCE_CORRECTION: 'ATTENDANCE_CORRECTION',
  EXPENSE_REIMBURSEMENT: 'EXPENSE_REIMBURSEMENT',
  DOCUMENT_REQUEST: 'DOCUMENT_REQUEST',
  RESIGNATION: 'RESIGNATION',
  TERMINATION: 'TERMINATION',
  REGULARIZATION: 'REGULARIZATION',
  PROMOTION: 'PROMOTION',
  SALARY_CHANGE: 'SALARY_CHANGE',
  TRANSFER: 'TRANSFER',
  SCHEDULE_CHANGE: 'SCHEDULE_CHANGE',
  OTHER: 'OTHER'
};

exports.RequestTransactionEventCategory = exports.$Enums.RequestTransactionEventCategory = {
  LIFECYCLE: 'LIFECYCLE',
  WORKFLOW: 'WORKFLOW',
  ASSIGNMENT: 'ASSIGNMENT',
  BUSINESS_CHANGE: 'BUSINESS_CHANGE',
  ARTIFACT: 'ARTIFACT',
  SYSTEM: 'SYSTEM'
};

exports.RequestTransactionEventKey = exports.$Enums.RequestTransactionEventKey = {
  REQUEST_CREATED: 'REQUEST_CREATED',
  REQUEST_UPDATED: 'REQUEST_UPDATED',
  REQUEST_CANCELLED: 'REQUEST_CANCELLED',
  WORKFLOW_STATE_CHANGED: 'WORKFLOW_STATE_CHANGED',
  STEP_ASSIGNED: 'STEP_ASSIGNED',
  STEP_APPROVED: 'STEP_APPROVED',
  STEP_REJECTED: 'STEP_REJECTED',
  STEP_COMPLETED: 'STEP_COMPLETED',
  STEP_SKIPPED: 'STEP_SKIPPED',
  STEP_DELEGATED: 'STEP_DELEGATED',
  DOCUMENT_GENERATED: 'DOCUMENT_GENERATED'
};

exports.RequestTransactionActorType = exports.$Enums.RequestTransactionActorType = {
  EMPLOYEE: 'EMPLOYEE',
  MANAGER: 'MANAGER',
  HR: 'HR',
  SYSTEM: 'SYSTEM',
  UNKNOWN: 'UNKNOWN'
};

exports.RequestTransactionVisibility = exports.$Enums.RequestTransactionVisibility = {
  SHARED: 'SHARED',
  INTERNAL: 'INTERNAL'
};

exports.RuleCategory = exports.$Enums.RuleCategory = {
  ATTENDANCE: 'ATTENDANCE',
  BEHAVIOR: 'BEHAVIOR',
  PERFORMANCE: 'PERFORMANCE',
  SAFETY: 'SAFETY',
  POLICY_VIOLATION: 'POLICY_VIOLATION',
  MISCONDUCT: 'MISCONDUCT',
  HARASSMENT: 'HARASSMENT',
  DRESS_CODE: 'DRESS_CODE',
  PUNCTUALITY: 'PUNCTUALITY',
  OTHER: 'OTHER'
};

exports.SeverityLevel = exports.$Enums.SeverityLevel = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

exports.RemittanceStatus = exports.$Enums.RemittanceStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  REMITTED: 'REMITTED',
  CONFIRMED: 'CONFIRMED',
  FAILED: 'FAILED',
  REVERSED: 'REVERSED'
};

exports.SOAStatus = exports.$Enums.SOAStatus = {
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  PARTIALLY_REMITTED: 'PARTIALLY_REMITTED',
  REMITTED: 'REMITTED',
  RECONCILED: 'RECONCILED',
  DISPUTED: 'DISPUTED',
  CLOSED: 'CLOSED'
};

exports.TerminationType = exports.$Enums.TerminationType = {
  PERFORMANCE: 'PERFORMANCE',
  MISCONDUCT: 'MISCONDUCT',
  REDUNDANCY: 'REDUNDANCY',
  END_OF_CONTRACT: 'END_OF_CONTRACT',
  FAILED_PROBATION: 'FAILED_PROBATION'
};

exports.TerminationStatus = exports.$Enums.TerminationStatus = {
  DRAFT: 'DRAFT',
  PENDING_HR_DIRECTOR: 'PENDING_HR_DIRECTOR',
  PENDING_LEGAL: 'PENDING_LEGAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED'
};

exports.TimesheetRejectBehavior = exports.$Enums.TimesheetRejectBehavior = {
  REVISE: 'REVISE',
  REJECT: 'REJECT'
};

exports.TimesheetStatus = exports.$Enums.TimesheetStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  REVISED: 'REVISED'
};

exports.TimesheetEditPermissionStatus = exports.$Enums.TimesheetEditPermissionStatus = {
  NONE: 'NONE',
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CONSUMED: 'CONSUMED',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED'
};

exports.UserStatus = exports.$Enums.UserStatus = {
  active: 'active',
  inactive: 'inactive',
  suspended: 'suspended',
  archived: 'archived'
};

exports.WorkflowDomain = exports.$Enums.WorkflowDomain = {
  REQUEST: 'REQUEST',
  RECRUITMENT: 'RECRUITMENT',
  PAYROLL: 'PAYROLL'
};

exports.WorkflowStepType = exports.$Enums.WorkflowStepType = {
  SUBMISSION: 'SUBMISSION',
  APPROVAL: 'APPROVAL',
  TASK: 'TASK'
};

exports.WorkflowAssigneeType = exports.$Enums.WorkflowAssigneeType = {
  REQUESTER: 'REQUESTER',
  SUPERVISOR: 'SUPERVISOR',
  TARGET_DEPARTMENT_MANAGER: 'TARGET_DEPARTMENT_MANAGER',
  HR: 'HR',
  SYSTEM: 'SYSTEM'
};

exports.WorkflowStepStatus = exports.$Enums.WorkflowStepStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  COMPLETED: 'COMPLETED',
  SKIPPED: 'SKIPPED'
};

exports.WorkforceRecruitmentLimitBehavior = exports.$Enums.WorkforceRecruitmentLimitBehavior = {
  WARN: 'WARN',
  BLOCK: 'BLOCK'
};

exports.Prisma.ModelName = {
  ActivityLogging: 'ActivityLogging',
  Agency: 'Agency',
  Applicant: 'Applicant',
  RecruitmentActivity: 'RecruitmentActivity',
  ApplicantAttachment: 'ApplicantAttachment',
  Attendance: 'Attendance',
  AttendanceObligation: 'AttendanceObligation',
  AuditLogging: 'AuditLogging',
  BenefitType: 'BenefitType',
  BoardingProcess: 'BoardingProcess',
  BoardingTemplate: 'BoardingTemplate',
  Calculator: 'Calculator',
  CalendarItem: 'CalendarItem',
  ChecklistItem: 'ChecklistItem',
  Department: 'Department',
  DepartmentScheduleTemplate: 'DepartmentScheduleTemplate',
  Device: 'Device',
  Document: 'Document',
  DocumentReviewEvent: 'DocumentReviewEvent',
  DocumentFolder: 'DocumentFolder',
  DocumentType: 'DocumentType',
  Employee: 'Employee',
  EmployeeBenefit: 'EmployeeBenefit',
  EmployeeBenefitInstallment: 'EmployeeBenefitInstallment',
  EmployeeLoan: 'EmployeeLoan',
  EmployeePayroll: 'EmployeePayroll',
  EmployeeScheduleHistory: 'EmployeeScheduleHistory',
  Guide: 'Guide',
  Job: 'Job',
  LeavePolicyConfig: 'LeavePolicyConfig',
  Level: 'Level',
  LoanType: 'LoanType',
  Note: 'Note',
  Notification: 'Notification',
  Organization: 'Organization',
  PayrollCycleConfig: 'PayrollCycleConfig',
  PayrollPeriod: 'PayrollPeriod',
  Person: 'Person',
  Child: 'Child',
  Position: 'Position',
  PositionLevel: 'PositionLevel',
  Request: 'Request',
  RequestTransaction: 'RequestTransaction',
  Rule: 'Rule',
  ScheduleOverride: 'ScheduleOverride',
  ScheduleTemplate: 'ScheduleTemplate',
  ShiftType: 'ShiftType',
  SOALineItem: 'SOALineItem',
  SOARemittance: 'SOARemittance',
  StatementOfAccount: 'StatementOfAccount',
  StatusIncident: 'StatusIncident',
  StatusState: 'StatusState',
  Template: 'Template',
  TemplateItem: 'TemplateItem',
  Termination: 'Termination',
  TerminationAuditLog: 'TerminationAuditLog',
  TimesheetConfig: 'TimesheetConfig',
  Timesheet: 'Timesheet',
  Timesheetline: 'Timesheetline',
  User: 'User',
  WorkflowInstance: 'WorkflowInstance',
  WorkflowStepExecution: 'WorkflowStepExecution',
  WorkforceRecruitmentSetting: 'WorkforceRecruitmentSetting',
  WorkforceRecruitmentPolicy: 'WorkforceRecruitmentPolicy'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
