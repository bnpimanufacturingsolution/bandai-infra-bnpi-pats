-- CreateEnum
CREATE TYPE "WorkforceSource" AS ENUM ('DIRECT', 'AGENCY');

-- CreateEnum
CREATE TYPE "AgencyStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ApplicationSource" AS ENUM ('WEBSITE', 'REFERRAL', 'JOB_BOARD', 'SOCIAL_MEDIA', 'RECRUITER', 'INTERNAL', 'WALK_IN', 'OTHER');

-- CreateEnum
CREATE TYPE "RecruitmentActivityType" AS ENUM ('NOTE', 'INTERVIEW', 'REJECTION', 'OFFER', 'ASSIGNMENT', 'EMAIL_EVENT', 'SYSTEM_EVENT');

-- CreateEnum
CREATE TYPE "ApplicantAttachmentType" AS ENUM ('RESUME', 'CONTRACT', 'PORTFOLIO', 'CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LEAVE', 'INCOMPLETE', 'ABSENT', 'REST_DAY');

-- CreateEnum
CREATE TYPE "AttendanceLedgerType" AS ENUM ('RAW', 'CORRECTION');

-- CreateEnum
CREATE TYPE "BenefitCategory" AS ENUM ('INSURANCE', 'ALLOWANCE', 'BONUS', 'RETIREMENT', 'HEALTH', 'EDUCATION', 'TRANSPORTATION', 'OTHER');

-- CreateEnum
CREATE TYPE "BenefitPayrollDirection" AS ENUM ('COMPENSATION', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "BoardingType" AS ENUM ('ONBOARDING', 'OFFBOARDING');

-- CreateEnum
CREATE TYPE "BoardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CalculatorType" AS ENUM ('BASIC', 'GROSS_TO_NET', 'NET_TO_GROSS', 'THIRTEENTH_MONTH', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CalendarItemType" AS ENUM ('HOLIDAY', 'EVENT', 'COMPANY_EVENT', 'MEETING', 'DEADLINE', 'REMINDER', 'BIRTHDAY');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'COMPLETED', 'DRAFT');

-- CreateEnum
CREATE TYPE "ChecklistCategory" AS ENUM ('HR_DOCUMENTATION', 'IT_SETUP', 'WORKSPACE_SETUP', 'TRAINING', 'COMPLIANCE', 'ACCESS_MANAGEMENT', 'EQUIPMENT', 'BENEFITS', 'KNOWLEDGE_TRANSFER', 'EXIT_INTERVIEW', 'ORIENTATION', 'SECURITY', 'PAYROLL', 'OTHER');

-- CreateEnum
CREATE TYPE "ChecklistStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'FOR_REVIEW', 'COMPLETED', 'SKIPPED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "Protocol" AS ENUM ('http', 'https', 'tcp', 'udp');

-- CreateEnum
CREATE TYPE "DocumentReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentReviewSource" AS ENUM ('EMPLOYEE_UPLOAD', 'HR_UPLOAD', 'MIGRATION', 'SYSTEM');

-- CreateEnum
CREATE TYPE "DocumentReviewEventType" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'RESUBMITTED', 'SUPERSEDED', 'SYSTEM_SYNCED');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'RESIGNATION_REQUESTED', 'SERVING_NOTICE', 'OFFBOARDING', 'ONBOARDING', 'INACTIVE', 'TERMINATED', 'RESIGNED', 'FORMER_EMPLOYEE', 'RETIRED', 'ON_LEAVE');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('REGULAR', 'PROBATIONARY', 'CONTRACTUAL', 'PART_TIME', 'CONSULTANT', 'INTERN');

-- CreateEnum
CREATE TYPE "PayFrequency" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'SEMI_MONTHLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY');

-- CreateEnum
CREATE TYPE "WorkLocation" AS ENUM ('ONSITE', 'REMOTE', 'HYBRID');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('VACATION', 'SICK', 'PERSONAL', 'MATERNITY', 'PATERNITY', 'BEREAVEMENT', 'UNPAID', 'COMPENSATORY');

-- CreateEnum
CREATE TYPE "BenefitProgramStatus" AS ENUM ('PENDING', 'APPROVED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'DEFAULTED');

-- CreateEnum
CREATE TYPE "BenefitDeductionStatus" AS ENUM ('SCHEDULED', 'DEDUCTED', 'FAILED', 'WAIVED');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('PENDING', 'APPROVED', 'ACTIVE', 'PAID', 'DEFAULTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LoanCategory" AS ENUM ('SALARY_LOAN', 'EMERGENCY_LOAN', 'HOUSING_LOAN', 'CALAMITY_LOAN', 'SSS_LOAN', 'PAGIBIG_LOAN', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'ERROR', 'ALERT', 'REMINDER');

-- CreateEnum
CREATE TYPE "BusinessDayRule" AS ENUM ('NONE', 'NEXT_BUSINESS_DAY');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('DRAFT', 'OPEN', 'PROCESSING', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "GenderType" AS ENUM ('male', 'female', 'other', 'prefer_not_to_say', 'unknown', 'not_applicable');

-- CreateEnum
CREATE TYPE "PhoneType" AS ENUM ('mobile', 'home', 'work', 'emergency', 'fax', 'pager', 'main', 'other');

-- CreateEnum
CREATE TYPE "IdentificationType" AS ENUM ('passport', 'drivers_license', 'national_id', 'postal_id', 'voters_id', 'senior_citizen_id', 'company_id', 'school_id');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('LEAVE', 'OVERTIME', 'TIMESHEET', 'ATTENDANCE_CORRECTION', 'EXPENSE_REIMBURSEMENT', 'DOCUMENT_REQUEST', 'RESIGNATION', 'TERMINATION', 'REGULARIZATION', 'PROMOTION', 'SALARY_CHANGE', 'TRANSFER', 'SCHEDULE_CHANGE', 'OTHER');

-- CreateEnum
CREATE TYPE "RequestTransactionEventCategory" AS ENUM ('LIFECYCLE', 'WORKFLOW', 'ASSIGNMENT', 'BUSINESS_CHANGE', 'ARTIFACT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "RequestTransactionEventKey" AS ENUM ('REQUEST_CREATED', 'REQUEST_UPDATED', 'REQUEST_CANCELLED', 'WORKFLOW_STATE_CHANGED', 'STEP_ASSIGNED', 'STEP_APPROVED', 'STEP_REJECTED', 'STEP_COMPLETED', 'STEP_SKIPPED', 'STEP_DELEGATED', 'DOCUMENT_GENERATED');

-- CreateEnum
CREATE TYPE "RequestTransactionActorType" AS ENUM ('EMPLOYEE', 'MANAGER', 'HR', 'SYSTEM', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RequestTransactionVisibility" AS ENUM ('SHARED', 'INTERNAL');

-- CreateEnum
CREATE TYPE "RuleCategory" AS ENUM ('ATTENDANCE', 'BEHAVIOR', 'PERFORMANCE', 'SAFETY', 'POLICY_VIOLATION', 'MISCONDUCT', 'HARASSMENT', 'DRESS_CODE', 'PUNCTUALITY', 'OTHER');

-- CreateEnum
CREATE TYPE "SeverityLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DepartmentScheduleTemplateSource" AS ENUM ('department_default', 'department_head_created', 'department_head_linked');

-- CreateEnum
CREATE TYPE "RemittanceStatus" AS ENUM ('PENDING', 'PROCESSING', 'REMITTED', 'CONFIRMED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "SOAStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PARTIALLY_REMITTED', 'REMITTED', 'RECONCILED', 'DISPUTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TerminationType" AS ENUM ('PERFORMANCE', 'MISCONDUCT', 'REDUNDANCY', 'END_OF_CONTRACT', 'FAILED_PROBATION');

-- CreateEnum
CREATE TYPE "TerminationStatus" AS ENUM ('DRAFT', 'PENDING_HR_DIRECTOR', 'PENDING_LEGAL', 'APPROVED', 'REJECTED', 'PROCESSING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TimesheetStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'REVISED');

-- CreateEnum
CREATE TYPE "TimesheetEditPermissionStatus" AS ENUM ('NONE', 'REQUESTED', 'APPROVED', 'REJECTED', 'CONSUMED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "TimesheetRejectBehavior" AS ENUM ('REVISE', 'REJECT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'inactive', 'suspended', 'archived');

-- CreateEnum
CREATE TYPE "WorkflowDomain" AS ENUM ('REQUEST', 'RECRUITMENT', 'PAYROLL');

-- CreateEnum
CREATE TYPE "WorkflowStepType" AS ENUM ('SUBMISSION', 'APPROVAL', 'TASK');

-- CreateEnum
CREATE TYPE "WorkflowAssigneeType" AS ENUM ('REQUESTER', 'SUPERVISOR', 'TARGET_DEPARTMENT_MANAGER', 'HR', 'SYSTEM');

-- CreateEnum
CREATE TYPE "WorkflowStepStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "WorkforceRecruitmentLimitBehavior" AS ENUM ('WARN', 'BLOCK');

-- CreateTable
CREATE TABLE "ActivityLogging" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT,
    "headers" JSONB,
    "ip" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "page" JSONB,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "payload" JSONB,
    "organizationId" TEXT,
    "entityType" TEXT,
    "archive" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityLogging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agencies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "AgencyStatus" NOT NULL DEFAULT 'ACTIVE',
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "metadata" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applicants" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicantId" TEXT,
    "personId" TEXT,
    "portfolioUrl" TEXT,
    "jobId" TEXT,
    "positionId" TEXT,
    "departmentId" TEXT,
    "appliedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicationSource" "ApplicationSource",
    "workflowInstanceId" TEXT,
    "currentWorkflowStateKey" TEXT NOT NULL DEFAULT 'APPLIED',
    "currentStepExecutionId" TEXT,
    "lastCompletedStepExecutionId" TEXT,
    "expectedSalary" DOUBLE PRECISION,
    "currency" TEXT DEFAULT 'PHP',
    "availabilityDate" TIMESTAMP(3),
    "noticePeriod" INTEGER,
    "metadata" JSONB,
    "referredBy" TEXT,
    "referralBonus" DOUBLE PRECISION,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "convertedToEmployeeId" TEXT,

    CONSTRAINT "applicants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruitment_activities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "workflowInstanceId" TEXT,
    "stepExecutionId" TEXT,
    "stateKey" TEXT,
    "type" "RecruitmentActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "details" JSONB,
    "actorEmployeeId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recruitment_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applicant_attachments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "type" "ApplicantAttachmentType" NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "uploadedByEmployeeId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applicant_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "timeIn" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "timeBreak" TIMESTAMP(3),
    "timeOut" TIMESTAMP(3),
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "behaviorFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scheduleSnapshot" JSONB,
    "timeInLocation" JSONB,
    "timeOutLocation" JSONB,
    "deviceInfo" JSONB,
    "isManualEntry" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "ledgerType" "AttendanceLedgerType" NOT NULL DEFAULT 'RAW',
    "sourceRequestId" TEXT,
    "supersedesAttendanceId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "appliedBy" TEXT,
    "isEffective" BOOLEAN NOT NULL DEFAULT true,
    "totalMinutesWorked" INTEGER,
    "regularMinutes" INTEGER,
    "overtimeMinutes" INTEGER,
    "undertimeMinutes" INTEGER,
    "lateMinutes" INTEGER,
    "earlyOutMinutes" INTEGER,
    "breakMinutes" INTEGER,
    "employeeCodeSnapshot" TEXT,
    "employeeNameSnapshot" TEXT,
    "departmentIdSnapshot" TEXT,
    "departmentNameSnapshot" TEXT,
    "reportToIdSnapshot" TEXT,
    "workforceSourceSnapshot" "WorkforceSource",
    "agencyIdSnapshot" TEXT,
    "hoursWorked" TEXT,
    "regularHours" TEXT,
    "overtimeHours" TEXT,
    "undertimeHours" TEXT,
    "lateHours" TEXT,
    "earlyOutHours" TEXT,
    "timesheetId" TEXT,
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_obligations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "businessDate" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Manila',
    "status" TEXT NOT NULL DEFAULT 'EXPECTED',
    "phase" TEXT NOT NULL DEFAULT 'PLANNED',
    "attendanceId" TEXT,
    "timesheetId" TEXT,
    "timesheetlineId" TEXT,
    "expectedStartAt" TIMESTAMP(3),
    "expectedEndAt" TIMESTAMP(3),
    "timeIn" TIMESTAMP(3),
    "timeBreak" TIMESTAMP(3),
    "timeOut" TIMESTAMP(3),
    "hoursWorked" TEXT,
    "regularHours" TEXT,
    "overtimeHours" TEXT,
    "undertimeHours" TEXT,
    "lateHours" TEXT,
    "earlyOutHours" TEXT,
    "breakMinutes" INTEGER,
    "behaviorFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scheduleSnapshot" JSONB,
    "scheduleFingerprint" TEXT,
    "source" TEXT NOT NULL,
    "sourceRequestId" TEXT,
    "metadata" JSONB,
    "employeeCodeSnapshot" TEXT,
    "employeeNameSnapshot" TEXT,
    "departmentIdSnapshot" TEXT,
    "departmentNameSnapshot" TEXT,
    "reportToIdSnapshot" TEXT,
    "workforceSourceSnapshot" "WorkforceSource",
    "agencyIdSnapshot" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLogging" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "entity" JSONB NOT NULL,
    "changes" JSONB,
    "metadata" JSONB,
    "description" TEXT,
    "payload" JSONB,
    "archiveStatus" BOOLEAN NOT NULL DEFAULT false,
    "archiveDate" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditLogging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benefit_types" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "BenefitCategory" NOT NULL DEFAULT 'OTHER',
    "payrollDirection" "BenefitPayrollDirection" NOT NULL DEFAULT 'COMPENSATION',
    "reconciliationAction" TEXT,
    "provider" TEXT,
    "coverage" DOUBLE PRECISION,
    "minAmount" DOUBLE PRECISION,
    "maxAmount" DOUBLE PRECISION,
    "fixedAmount" DOUBLE PRECISION,
    "percentage" DOUBLE PRECISION,
    "minServiceMonths" INTEGER,
    "isTaxable" BOOLEAN NOT NULL DEFAULT false,
    "defaultInstallments" INTEGER NOT NULL DEFAULT 6,
    "payrollCycleDays" INTEGER NOT NULL DEFAULT 15,
    "requireTermsAgreement" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "benefit_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardingProcess" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "departmentId" TEXT,
    "type" "BoardingType" NOT NULL,
    "status" "BoardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "actualCompleteDate" TIMESTAMP(3),
    "exitReason" TEXT,
    "assignedToId" TEXT,
    "assignedToName" TEXT,
    "metadata" JSONB,
    "lastViewedAt" TIMESTAMP(3),
    "reminderFrequency" TEXT,
    "completionPercentage" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardingProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardingTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "BoardingType" NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculators" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "CalculatorType" NOT NULL DEFAULT 'BASIC',
    "taxRates" JSONB,
    "sssRates" JSONB,
    "philHealthRates" JSONB,
    "pagibigRates" JSONB,
    "rateMultipliers" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calculators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "year" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "CalendarItemType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "recurrence" JSONB,
    "metadata" JSONB,
    "reminders" JSONB,
    "tags" TEXT[],
    "status" "ItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "assignedEmployeeId" TEXT,

    CONSTRAINT "calendar_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "ChecklistCategory" NOT NULL,
    "status" "ChecklistStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "completedDate" TIMESTAMP(3),
    "completedBy" TEXT,
    "completedByName" TEXT,
    "order" INTEGER NOT NULL,
    "uiElement" TEXT,
    "comments" TEXT,
    "metadata" JSONB,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "estimatedTime" INTEGER,
    "dependencies" TEXT[],
    "viewedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "reminderSent" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "managerId" TEXT,
    "parentId" TEXT,
    "isHr" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "departmentId" TEXT NOT NULL,
    "headId" TEXT,
    "scheduleId" TEXT,
    "isHr" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department_schedule_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "scheduleTemplateId" TEXT NOT NULL,
    "source" "DepartmentScheduleTemplateSource" NOT NULL DEFAULT 'department_head_linked',
    "createdByEmployeeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "department_schedule_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "protocol" "Protocol" NOT NULL DEFAULT 'http',
    "config" JSONB,
    "access" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "fileUrl" TEXT,
    "ext" TEXT,
    "documentTypeId" TEXT,
    "fieldValues" JSONB,
    "reviewStatus" "DocumentReviewStatus",
    "reviewSubmittedAt" TIMESTAMP(3),
    "reviewSubmittedById" TEXT,
    "reviewApprovedAt" TIMESTAMP(3),
    "reviewApprovedById" TEXT,
    "reviewRejectedAt" TIMESTAMP(3),
    "reviewRejectedById" TEXT,
    "reviewRejectionReason" TEXT,
    "reviewSource" "DocumentReviewSource",
    "metadata" JSONB,
    "employeeId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_review_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "actorEmployeeId" TEXT,
    "eventType" "DocumentReviewEventType" NOT NULL,
    "fromStatus" "DocumentReviewStatus",
    "toStatus" "DocumentReviewStatus",
    "reason" TEXT,
    "comments" TEXT,
    "source" "DocumentReviewSource" NOT NULL,
    "fileUrl" TEXT,
    "fieldChanges" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_review_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentFolders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documentFolders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_types" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "uploadBy" TEXT NOT NULL DEFAULT 'HR',
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isEmployeeVisible" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "fields" JSONB NOT NULL,
    "metadata" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "userId" TEXT,
    "role" TEXT NOT NULL,
    "employmentHireDate" TIMESTAMP(3),
    "employmentStartDate" TIMESTAMP(3),
    "employmentTerminationDate" TIMESTAMP(3),
    "employmentStatus" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'PROBATIONARY',
    "workforceSource" "WorkforceSource" NOT NULL DEFAULT 'DIRECT',
    "agencyId" TEXT,
    "employer" JSONB,
    "probationEndDate" TIMESTAMP(3),
    "departmentId" TEXT NOT NULL,
    "sectionId" TEXT,
    "positionId" TEXT NOT NULL,
    "levelId" TEXT,
    "reportToId" TEXT,
    "workLocation" "WorkLocation" NOT NULL DEFAULT 'ONSITE',
    "leaveBalances" JSONB NOT NULL,
    "leaveBalancesLastUpdated" TIMESTAMP(3),
    "basicSalary" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "payFrequency" "PayFrequency" NOT NULL DEFAULT 'SEMI_MONTHLY',
    "deviceEmpId" TEXT,
    "isTour" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isManager" BOOLEAN NOT NULL DEFAULT false,
    "isHrManager" BOOLEAN NOT NULL DEFAULT false,
    "embeddedSchedule" JSONB,
    "metadata" JSONB,
    "personId" TEXT NOT NULL,
    "deviceId" TEXT,
    "employmentHistory" JSONB NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_benefits" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT,
    "benefitTypeId" TEXT NOT NULL,
    "payrollPeriodId" TEXT,
    "name" TEXT,
    "description" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "totalInstallments" INTEGER NOT NULL DEFAULT 6,
    "installmentAmount" DOUBLE PRECISION NOT NULL,
    "remainingBalance" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION,
    "startDate" DATE,
    "endDate" DATE,
    "startPayrollCutOff" TIMESTAMP(3),
    "endPayrollCutOff" TIMESTAMP(3),
    "agreedToTerms" BOOLEAN NOT NULL DEFAULT false,
    "agreedAt" TIMESTAMP(3),
    "agreedByIp" TEXT,
    "status" "BenefitProgramStatus" NOT NULL DEFAULT 'PENDING',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "remarks" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_benefits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_benefit_installments" (
    "id" TEXT NOT NULL,
    "employeeBenefitId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "processedDate" TIMESTAMP(3),
    "payrollCutOffId" TEXT,
    "payrollRunId" TEXT,
    "status" "BenefitDeductionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_benefit_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_loans" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "loanTypeId" TEXT NOT NULL,
    "principalAmount" DOUBLE PRECISION NOT NULL,
    "interestRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "monthlyPayment" DOUBLE PRECISION NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_leave_balances" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "leaveTypeCodeSnapshot" TEXT NOT NULL,
    "leaveTypeNameSnapshot" TEXT NOT NULL,
    "totalEntitled" DOUBLE PRECISION NOT NULL,
    "used" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pending" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "available" DOUBLE PRECISION NOT NULL,
    "carriedOver" DOUBLE PRECISION,
    "maxCarryOver" DOUBLE PRECISION,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_payrolls" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "timesheetId" TEXT,
    "basicPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimePay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nightDiffPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "holidayPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allowances" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bonuses" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sssContribution" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "philHealthContribution" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pagibigContribution" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "loanDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "absentDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lateDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "earlyOutDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxableIncome" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timesheetSnapshot" JSONB,
    "metadata" JSONB,
    "rateBreakdown" JSONB,
    "dailyBreakdown" JSONB,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "referenceNumber" TEXT,
    "snapshotLockedAt" TIMESTAMP(3),
    "snapshotLockedBy" TEXT,
    "snapshotLockReason" TEXT,
    "generationRunId" TEXT,
    "generationKey" TEXT,
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_payrolls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_schedule_history" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3),
    "actorEmployeeId" TEXT,
    "reason" TEXT,
    "beforeSchedule" JSONB,
    "afterSchedule" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_schedule_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guides" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "author" TEXT,
    "version" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "guides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT,
    "sectionId" TEXT,
    "sourceRequestId" TEXT,
    "headcountRequested" INTEGER NOT NULL DEFAULT 1,
    "positionId" TEXT NOT NULL,
    "levelId" TEXT,
    "tags" TEXT[],
    "type" TEXT,
    "location" TEXT,
    "description" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "minAdvanceNoticeDays" INTEGER NOT NULL DEFAULT 0,
    "maxDaysPerRequest" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "allowHalfDay" BOOLEAN NOT NULL DEFAULT true,
    "requireAttachment" BOOLEAN NOT NULL DEFAULT false,
    "allowedEmploymentTypes" "EmploymentType"[] NOT NULL DEFAULT ARRAY['REGULAR','PROBATIONARY','CONTRACTUAL','PART_TIME','CONSULTANT','INTERN']::"EmploymentType"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "levels" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rank" INTEGER,
    "description" TEXT,
    "isManager" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_types" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "LoanCategory" NOT NULL DEFAULT 'OTHER',
    "maxAmount" DOUBLE PRECISION,
    "minAmount" DOUBLE PRECISION,
    "interestRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxTermMonths" INTEGER NOT NULL DEFAULT 12,
    "minServiceMonths" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "metadata" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceEmployeeId" TEXT,
    "category" TEXT NOT NULL DEFAULT 'SYSTEM',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'INFO',
    "eventKey" TEXT,
    "recipients" JSONB NOT NULL,
    "metadata" JSONB,
    "archive" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT NOT NULL,
    "branding" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_cycle_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "defaultPayFrequency" "PayFrequency" NOT NULL DEFAULT 'SEMI_MONTHLY',
    "payDateOffsetDays" INTEGER NOT NULL DEFAULT 5,
    "businessDayRule" "BusinessDayRule" NOT NULL DEFAULT 'NEXT_BUSINESS_DAY',
    "includeHolidaysInBusinessDayCheck" BOOLEAN NOT NULL DEFAULT true,
    "cycleRules" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_cycle_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "payFrequency" "PayFrequency",
    "periodNumber" INTEGER,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "payDate" DATE NOT NULL,
    "calculatorId" TEXT,
    "status" "PeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "cutoffDay" INTEGER,
    "notes" TEXT,
    "generationMetadata" JSONB,
    "processedBy" TEXT,
    "processedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "userId" TEXT,
    "employeeId" TEXT,
    "personalInfo" JSONB,
    "contactInfo" JSONB NOT NULL,
    "identification" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Child" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "parentId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "lastName" TEXT,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "gender" "GenderType",
    "notes" TEXT,
    "isDependent" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Child_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "sectionId" TEXT,
    "minSalary" DOUBLE PRECISION,
    "maxSalary" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isOffer" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position_levels" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "position_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT,
    "type" "RequestType" NOT NULL,
    "currentWorkflowStateKey" TEXT NOT NULL DEFAULT 'OPEN',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "attachments" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "requesterId" TEXT NOT NULL,
    "targetEmployeeId" TEXT,
    "workflowInstanceId" TEXT,
    "currentStepExecutionId" TEXT,
    "lastCompletedStepExecutionId" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_transactions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "workflowInstanceId" TEXT,
    "stepExecutionId" TEXT,
    "actorEmployeeId" TEXT,
    "sequenceNumber" INTEGER NOT NULL,
    "eventCategory" "RequestTransactionEventCategory" NOT NULL,
    "eventKey" "RequestTransactionEventKey" NOT NULL,
    "eventSource" TEXT,
    "actorType" "RequestTransactionActorType" NOT NULL DEFAULT 'UNKNOWN',
    "actorRole" TEXT,
    "actorDisplayName" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "comments" TEXT,
    "fromStateKey" TEXT,
    "toStateKey" TEXT,
    "fieldChanges" JSONB,
    "metadata" JSONB,
    "visibility" "RequestTransactionVisibility" NOT NULL DEFAULT 'SHARED',
    "isSystemGenerated" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "request_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rules" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "code" TEXT,
    "category" "RuleCategory" NOT NULL,
    "severity" "SeverityLevel" NOT NULL,
    "description" TEXT NOT NULL,
    "consequences" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_overrides" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shiftTypeId" TEXT,
    "shiftSnapshot" JSONB,
    "reason" TEXT,
    "createdByEmployeeId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "cycleDays" INTEGER NOT NULL,
    "graceLateMinutes" INTEGER NOT NULL DEFAULT 0,
    "graceEarlyOutMinutes" INTEGER NOT NULL DEFAULT 0,
    "pattern" JSONB NOT NULL,
    "totalHour" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDay" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_types" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isOvernight" BOOLEAN NOT NULL DEFAULT false,
    "isOff" BOOLEAN NOT NULL DEFAULT false,
    "timeSlots" JSONB NOT NULL,
    "shiftHour" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "soa_line_items" (
    "id" TEXT NOT NULL,
    "statementOfAccountId" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "employeeId" TEXT,
    "employeePayrollId" TEXT,
    "employeeLoanId" TEXT,
    "employeeBenefitId" TEXT,
    "taxableAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "employeeShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "employerShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "soa_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "soa_remittances" (
    "id" TEXT NOT NULL,
    "statementOfAccountId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT,
    "referenceNumber" TEXT,
    "paymentDate" DATE NOT NULL,
    "category" TEXT,
    "status" "RemittanceStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "soa_remittances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statements_of_account" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "soaNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "dueDate" DATE,
    "payrollPeriodIds" TEXT[],
    "totalEmployeeShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalEmployerShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalRemitted" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalOutstanding" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "eppReferenceId" TEXT,
    "eppBillingId" TEXT,
    "eppReconciled" BOOLEAN NOT NULL DEFAULT false,
    "eppReconciledAt" TIMESTAMP(3),
    "eppReconciledById" TEXT,
    "remitteeName" TEXT,
    "remitteeAccount" TEXT,
    "remitteeDetails" JSONB,
    "status" "SOAStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "statements_of_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_incidents" (
    "id" TEXT NOT NULL,
    "incidentKey" TEXT NOT NULL,
    "moduleSlug" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "status_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_state" (
    "id" TEXT NOT NULL,
    "stateKey" TEXT NOT NULL,
    "snapshots" JSONB NOT NULL,
    "incidents" JSONB NOT NULL,
    "runtimeData" JSONB NOT NULL,
    "httpEvents" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "status_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "ChecklistCategory" NOT NULL,
    "dueOffset" INTEGER NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "order" INTEGER NOT NULL,
    "uiElement" TEXT,
    "metadata" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminations" (
    "id" TEXT NOT NULL,
    "terminationNumber" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "initiatedById" TEXT NOT NULL,
    "terminationType" "TerminationType" NOT NULL,
    "status" "TerminationStatus" NOT NULL DEFAULT 'DRAFT',
    "terminationDate" TIMESTAMP(3) NOT NULL,
    "lastWorkingDay" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "severancePackage" TEXT,
    "supportingDocuments" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "hrDirectorApprovedAt" TIMESTAMP(3),
    "hrDirectorId" TEXT,
    "hrDirectorComments" TEXT,
    "legalApprovalRequired" BOOLEAN NOT NULL DEFAULT false,
    "legalApprovedAt" TIMESTAMP(3),
    "legalApproverId" TEXT,
    "legalComments" TEXT,
    "processingStartedAt" TIMESTAMP(3),
    "processingCompletedAt" TIMESTAMP(3),
    "finalPayCalculated" BOOLEAN NOT NULL DEFAULT false,
    "clearanceCompleted" BOOLEAN NOT NULL DEFAULT false,
    "terminationLetterPath" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "termination_audit_logs" (
    "id" TEXT NOT NULL,
    "terminationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "performedBy" TEXT NOT NULL,
    "performedByName" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "comments" TEXT,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "termination_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "enableAutoApprove" BOOLEAN NOT NULL DEFAULT false,
    "enableEditBeforeSubmission" BOOLEAN NOT NULL DEFAULT true,
    "rejectBehavior" "TimesheetRejectBehavior" NOT NULL DEFAULT 'REVISE',
    "overtimeFlagThresholdMinutes" INTEGER NOT NULL DEFAULT 60,
    "requireManagerApprovedOvertime" BOOLEAN NOT NULL DEFAULT true,
    "workTimeRounding" JSONB,
    "overtimeQualification" JSONB,
    "payrollFinalization" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timesheet_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheets" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "totalDays" INTEGER,
    "totalHoursWorked" TEXT,
    "totalRegularHours" TEXT,
    "totalOvertimeHours" TEXT,
    "totalUndertimeHours" TEXT,
    "totalLateHours" TEXT,
    "totalEarlyOutHours" TEXT,
    "metadata" JSONB,
    "status" "TimesheetStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "submittedBy" TEXT,
    "approvedBy" TEXT,
    "approvalDate" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lockReason" TEXT,
    "lockRunId" TEXT,
    "lockedEmployeePayrollId" TEXT,
    "notes" TEXT,
    "editPermissionStatus" "TimesheetEditPermissionStatus" NOT NULL DEFAULT 'NONE',
    "editPermissionRequestId" TEXT,
    "editPermissionRequestedAt" TIMESTAMP(3),
    "editPermissionGrantedAt" TIMESTAMP(3),
    "editPermissionGrantedBy" TEXT,
    "editPermissionRejectedAt" TIMESTAMP(3),
    "editPermissionRejectedBy" TEXT,
    "editPermissionRejectionReason" TEXT,
    "editPermissionConsumedAt" TIMESTAMP(3),
    "editPermissionExpiresAt" TIMESTAMP(3),
    "editPermissionReason" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timesheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_lines" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "timesheetId" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "attendanceId" TEXT,
    "date" DATE NOT NULL,
    "timeIn" TIMESTAMP(3),
    "timeBreak" TIMESTAMP(3),
    "timeOut" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'NOT_CLOCKED_IN',
    "behaviorFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scheduleSnapshot" JSONB,
    "hoursWorked" TEXT,
    "regularHours" TEXT,
    "overtimeHours" TEXT,
    "undertimeHours" TEXT,
    "lateHours" TEXT,
    "earlyOutHours" TEXT,
    "breakMinutes" INTEGER,
    "employeeNotes" TEXT,
    "approverNotes" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "primaryMarker" TEXT,
    "isManualEntry" BOOLEAN NOT NULL DEFAULT false,
    "isVirtual" BOOLEAN NOT NULL DEFAULT false,
    "revisionNo" INTEGER NOT NULL DEFAULT 1,
    "isEffective" BOOLEAN NOT NULL DEFAULT true,
    "ledgerType" TEXT NOT NULL DEFAULT 'SNAPSHOT',
    "supersedesLineId" TEXT,
    "supersededById" TEXT,
    "supersededAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),
    "editedBy" TEXT,
    "editReason" TEXT,
    "employeeCodeSnapshot" TEXT,
    "employeeNameSnapshot" TEXT,
    "departmentIdSnapshot" TEXT,
    "departmentNameSnapshot" TEXT,
    "reportToIdSnapshot" TEXT,
    "workforceSourceSnapshot" "WorkforceSource",
    "agencyIdSnapshot" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timesheet_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "userName" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "role" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "lastLogin" TIMESTAMP(3),
    "loginMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_instances" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "domain" "WorkflowDomain" NOT NULL,
    "domainRecordId" TEXT,
    "requestType" "RequestType",
    "code" TEXT,
    "name" TEXT,
    "description" TEXT,
    "steps" JSONB NOT NULL,
    "states" JSONB,
    "currentStateKey" TEXT NOT NULL DEFAULT 'OPEN',
    "stateHistory" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_step_executions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workflowInstanceId" TEXT NOT NULL,
    "requestId" TEXT,
    "applicantId" TEXT,
    "stepNumber" INTEGER NOT NULL,
    "stepName" TEXT NOT NULL,
    "stepType" "WorkflowStepType" NOT NULL,
    "assigneeType" "WorkflowAssigneeType" NOT NULL,
    "assigneeRole" TEXT,
    "assigneeId" TEXT,
    "status" "WorkflowStepStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "comments" TEXT,
    "metadata" JSONB,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_step_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workforce_recruitment_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "enforceDepartmentManagerScope" BOOLEAN NOT NULL DEFAULT true,
    "defaultWorkflowCode" TEXT NOT NULL DEFAULT 'WF-REQUEST-HIRING-REQUISITION-DEFAULT',
    "requestSubtype" TEXT NOT NULL DEFAULT 'DEPARTMENT_JOB_REQUISITION',
    "autoCreateJobOnApproval" BOOLEAN NOT NULL DEFAULT true,
    "seededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workforce_recruitment_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workforce_recruitment_policies" (
    "id" TEXT NOT NULL,
    "settingId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT,
    "sectionId" TEXT,
    "positionId" TEXT,
    "levelId" TEXT,
    "targetHeadcount" INTEGER NOT NULL DEFAULT 0,
    "limitBehavior" "WorkforceRecruitmentLimitBehavior" NOT NULL DEFAULT 'WARN',
    "defaultWorkflowCode" TEXT,
    "autoCreateJobOnApproval" BOOLEAN NOT NULL DEFAULT true,
    "jobType" TEXT,
    "jobLocation" TEXT,
    "jobTags" TEXT[],
    "jobDescriptionTemplate" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workforce_recruitment_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agencies_organizationId_status_idx" ON "agencies"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "agencies_organizationId_name_key" ON "agencies"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "agencies_organizationId_code_key" ON "agencies"("organizationId", "code");

-- CreateIndex
CREATE INDEX "applicants_organizationId_idx" ON "applicants"("organizationId");

-- CreateIndex
CREATE INDEX "applicants_applicantId_idx" ON "applicants"("applicantId");

-- CreateIndex
CREATE INDEX "applicants_positionId_idx" ON "applicants"("positionId");

-- CreateIndex
CREATE INDEX "applicants_jobId_idx" ON "applicants"("jobId");

-- CreateIndex
CREATE INDEX "applicants_departmentId_idx" ON "applicants"("departmentId");

-- CreateIndex
CREATE INDEX "applicants_appliedDate_idx" ON "applicants"("appliedDate");

-- CreateIndex
CREATE INDEX "applicants_personId_idx" ON "applicants"("personId");

-- CreateIndex
CREATE INDEX "applicants_workflowInstanceId_idx" ON "applicants"("workflowInstanceId");

-- CreateIndex
CREATE INDEX "applicants_currentWorkflowStateKey_idx" ON "applicants"("currentWorkflowStateKey");

-- CreateIndex
CREATE INDEX "applicants_currentStepExecutionId_idx" ON "applicants"("currentStepExecutionId");

-- CreateIndex
CREATE INDEX "applicants_lastCompletedStepExecutionId_idx" ON "applicants"("lastCompletedStepExecutionId");

-- CreateIndex
CREATE INDEX "applicants_convertedToEmployeeId_idx" ON "applicants"("convertedToEmployeeId");

-- CreateIndex
CREATE INDEX "recruitment_activities_organizationId_applicantId_occurredA_idx" ON "recruitment_activities"("organizationId", "applicantId", "occurredAt");

-- CreateIndex
CREATE INDEX "recruitment_activities_workflowInstanceId_idx" ON "recruitment_activities"("workflowInstanceId");

-- CreateIndex
CREATE INDEX "recruitment_activities_stepExecutionId_idx" ON "recruitment_activities"("stepExecutionId");

-- CreateIndex
CREATE INDEX "recruitment_activities_actorEmployeeId_idx" ON "recruitment_activities"("actorEmployeeId");

-- CreateIndex
CREATE INDEX "applicant_attachments_organizationId_applicantId_uploadedAt_idx" ON "applicant_attachments"("organizationId", "applicantId", "uploadedAt");

-- CreateIndex
CREATE INDEX "applicant_attachments_uploadedByEmployeeId_idx" ON "applicant_attachments"("uploadedByEmployeeId");

-- CreateIndex
CREATE INDEX "attendances_organizationId_idx" ON "attendances"("organizationId");

-- CreateIndex
CREATE INDEX "attendances_timesheetId_idx" ON "attendances"("timesheetId");

-- CreateIndex
CREATE INDEX "attendances_organizationId_employeeId_date_idx" ON "attendances"("organizationId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "attendances_organizationId_employeeId_date_isEffective_idx" ON "attendances"("organizationId", "employeeId", "date", "isEffective");

-- CreateIndex
CREATE INDEX "attendances_organizationId_employeeId_sourceRequestId_idx" ON "attendances"("organizationId", "employeeId", "sourceRequestId");

-- CreateIndex
CREATE INDEX "attendances_organizationId_isDeleted_isEffective_date_idx" ON "attendances"("organizationId", "isDeleted", "isEffective", "date");

-- CreateIndex
CREATE INDEX "attendances_organizationId_isDeleted_isEffective_date_statu_idx" ON "attendances"("organizationId", "isDeleted", "isEffective", "date", "status");

-- CreateIndex
CREATE INDEX "attendances_organizationId_isDeleted_isEffective_date_emplo_idx" ON "attendances"("organizationId", "isDeleted", "isEffective", "date", "employeeId");

-- CreateIndex
CREATE INDEX "attendances_organizationId_isDeleted_isEffective_date_depar_idx" ON "attendances"("organizationId", "isDeleted", "isEffective", "date", "departmentIdSnapshot");

-- CreateIndex
CREATE INDEX "attendances_organizationId_isDeleted_isEffective_date_repor_idx" ON "attendances"("organizationId", "isDeleted", "isEffective", "date", "reportToIdSnapshot");

-- CreateIndex
CREATE INDEX "attendance_obligations_organizationId_payrollPeriodId_statu_idx" ON "attendance_obligations"("organizationId", "payrollPeriodId", "status", "isDeleted");

-- CreateIndex
CREATE INDEX "attendance_obligations_organizationId_date_status_isDeleted_idx" ON "attendance_obligations"("organizationId", "date", "status", "isDeleted");

-- CreateIndex
CREATE INDEX "attendance_obligations_organizationId_employeeId_date_isDel_idx" ON "attendance_obligations"("organizationId", "employeeId", "date", "isDeleted");

-- CreateIndex
CREATE INDEX "attendance_obligations_organizationId_departmentIdSnapshot__idx" ON "attendance_obligations"("organizationId", "departmentIdSnapshot", "date", "isDeleted");

-- CreateIndex
CREATE INDEX "attendance_obligations_organizationId_reportToIdSnapshot_da_idx" ON "attendance_obligations"("organizationId", "reportToIdSnapshot", "date", "isDeleted");

-- CreateIndex
CREATE INDEX "attendance_obligations_attendanceId_idx" ON "attendance_obligations"("attendanceId");

-- CreateIndex
CREATE INDEX "attendance_obligations_timesheetId_idx" ON "attendance_obligations"("timesheetId");

-- CreateIndex
CREATE INDEX "attendance_obligations_timesheetlineId_idx" ON "attendance_obligations"("timesheetlineId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_obligations_organizationId_employeeId_payrollPer_key" ON "attendance_obligations"("organizationId", "employeeId", "payrollPeriodId", "date");

-- CreateIndex
CREATE INDEX "benefit_types_organizationId_idx" ON "benefit_types"("organizationId");

-- CreateIndex
CREATE INDEX "benefit_types_organizationId_payrollDirection_idx" ON "benefit_types"("organizationId", "payrollDirection");

-- CreateIndex
CREATE UNIQUE INDEX "benefit_types_organizationId_name_key" ON "benefit_types"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "benefit_types_organizationId_code_key" ON "benefit_types"("organizationId", "code");

-- CreateIndex
CREATE INDEX "calculators_organizationId_idx" ON "calculators"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "calculators_organizationId_name_key" ON "calculators"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "calculators_organizationId_code_key" ON "calculators"("organizationId", "code");

-- CreateIndex
CREATE INDEX "calendar_items_type_idx" ON "calendar_items"("type");

-- CreateIndex
CREATE INDEX "calendar_items_startDate_idx" ON "calendar_items"("startDate");

-- CreateIndex
CREATE INDEX "calendar_items_endDate_idx" ON "calendar_items"("endDate");

-- CreateIndex
CREATE INDEX "calendar_items_tags_idx" ON "calendar_items"("tags");

-- CreateIndex
CREATE INDEX "calendar_items_status_idx" ON "calendar_items"("status");

-- CreateIndex
CREATE INDEX "calendar_items_organizationId_idx" ON "calendar_items"("organizationId");

-- CreateIndex
CREATE INDEX "calendar_items_year_idx" ON "calendar_items"("year");

-- CreateIndex
CREATE INDEX "calendar_items_organizationId_year_idx" ON "calendar_items"("organizationId", "year");

-- CreateIndex
CREATE INDEX "departments_organizationId_idx" ON "departments"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "departments_organizationId_name_key" ON "departments"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "departments_organizationId_code_key" ON "departments"("organizationId", "code");

-- CreateIndex
CREATE INDEX "sections_organizationId_idx" ON "sections"("organizationId");

-- CreateIndex
CREATE INDEX "sections_organizationId_departmentId_isDeleted_idx" ON "sections"("organizationId", "departmentId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "sections_organizationId_code_key" ON "sections"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sections_organizationId_departmentId_name_key" ON "sections"("organizationId", "departmentId", "name");

-- CreateIndex
CREATE INDEX "department_schedule_templates_organizationId_departmentId_i_idx" ON "department_schedule_templates"("organizationId", "departmentId", "isDeleted");

-- CreateIndex
CREATE INDEX "department_schedule_templates_organizationId_scheduleTempla_idx" ON "department_schedule_templates"("organizationId", "scheduleTemplateId", "isDeleted");

-- CreateIndex
CREATE INDEX "department_schedule_templates_createdByEmployeeId_idx" ON "department_schedule_templates"("createdByEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "department_schedule_template_unique" ON "department_schedule_templates"("departmentId", "scheduleTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_organizationId_address_port_key" ON "Device"("organizationId", "address", "port");

-- CreateIndex
CREATE INDEX "documents_employeeId_idx" ON "documents"("employeeId");

-- CreateIndex
CREATE INDEX "documents_number_idx" ON "documents"("number");

-- CreateIndex
CREATE INDEX "documents_documentTypeId_idx" ON "documents"("documentTypeId");

-- CreateIndex
CREATE INDEX "documents_employeeId_reviewStatus_idx" ON "documents"("employeeId", "reviewStatus");

-- CreateIndex
CREATE INDEX "documents_documentTypeId_reviewStatus_idx" ON "documents"("documentTypeId", "reviewStatus");

-- CreateIndex
CREATE INDEX "document_review_events_organizationId_employeeId_occurredAt_idx" ON "document_review_events"("organizationId", "employeeId", "occurredAt");

-- CreateIndex
CREATE INDEX "document_review_events_documentId_occurredAt_idx" ON "document_review_events"("documentId", "occurredAt");

-- CreateIndex
CREATE INDEX "document_review_events_actorEmployeeId_idx" ON "document_review_events"("actorEmployeeId");

-- CreateIndex
CREATE INDEX "documentFolders_employeeId_idx" ON "documentFolders"("employeeId");

-- CreateIndex
CREATE INDEX "document_types_organizationId_isActive_isDeleted_idx" ON "document_types"("organizationId", "isActive", "isDeleted");

-- CreateIndex
CREATE INDEX "document_types_organizationId_isRequired_isDeleted_idx" ON "document_types"("organizationId", "isRequired", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "document_types_organizationId_code_key" ON "document_types"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_personId_key" ON "employees"("personId");

-- CreateIndex
CREATE INDEX "employees_organizationId_idx" ON "employees"("organizationId");

-- CreateIndex
CREATE INDEX "employees_userId_idx" ON "employees"("userId");

-- CreateIndex
CREATE INDEX "employees_role_idx" ON "employees"("role");

-- CreateIndex
CREATE INDEX "employees_levelId_idx" ON "employees"("levelId");

-- CreateIndex
CREATE INDEX "employees_reportToId_idx" ON "employees"("reportToId");

-- CreateIndex
CREATE INDEX "employees_departmentId_levelId_idx" ON "employees"("departmentId", "levelId");

-- CreateIndex
CREATE INDEX "employees_organizationId_departmentId_idx" ON "employees"("organizationId", "departmentId");

-- CreateIndex
CREATE INDEX "employees_organizationId_sectionId_idx" ON "employees"("organizationId", "sectionId");

-- CreateIndex
CREATE INDEX "employees_organizationId_workforceSource_idx" ON "employees"("organizationId", "workforceSource");

-- CreateIndex
CREATE INDEX "employees_organizationId_workforceSource_payFrequency_isDel_idx" ON "employees"("organizationId", "workforceSource", "payFrequency", "isDeleted");

-- CreateIndex
CREATE INDEX "employees_organizationId_isDeleted_employmentStatus_payFreq_idx" ON "employees"("organizationId", "isDeleted", "employmentStatus", "payFrequency", "updatedAt");

-- CreateIndex
CREATE INDEX "employees_organizationId_agencyId_idx" ON "employees"("organizationId", "agencyId");

-- CreateIndex
CREATE INDEX "employees_organizationId_employeeId_isDeleted_idx" ON "employees"("organizationId", "employeeId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "employees_organizationId_employeeId_key" ON "employees"("organizationId", "employeeId");

-- CreateIndex
CREATE INDEX "employee_benefits_organizationId_idx" ON "employee_benefits"("organizationId");

-- CreateIndex
CREATE INDEX "employee_benefits_employeeId_idx" ON "employee_benefits"("employeeId");

-- CreateIndex
CREATE INDEX "employee_benefits_benefitTypeId_idx" ON "employee_benefits"("benefitTypeId");

-- CreateIndex
CREATE INDEX "employee_benefits_payrollPeriodId_idx" ON "employee_benefits"("payrollPeriodId");

-- CreateIndex
CREATE INDEX "employee_benefits_organizationId_status_idx" ON "employee_benefits"("organizationId", "status");

-- CreateIndex
CREATE INDEX "employee_benefits_organizationId_payrollPeriodId_isDeleted_idx" ON "employee_benefits"("organizationId", "payrollPeriodId", "isDeleted");

-- CreateIndex
CREATE INDEX "employee_benefits_employeeId_status_idx" ON "employee_benefits"("employeeId", "status");

-- CreateIndex
CREATE INDEX "employee_benefit_installments_employeeBenefitId_idx" ON "employee_benefit_installments"("employeeBenefitId");

-- CreateIndex
CREATE INDEX "employee_benefit_installments_scheduledDate_idx" ON "employee_benefit_installments"("scheduledDate");

-- CreateIndex
CREATE INDEX "employee_benefit_installments_payrollCutOffId_idx" ON "employee_benefit_installments"("payrollCutOffId");

-- CreateIndex
CREATE INDEX "employee_loans_organizationId_idx" ON "employee_loans"("organizationId");

-- CreateIndex
CREATE INDEX "employee_loans_employeeId_idx" ON "employee_loans"("employeeId");

-- CreateIndex
CREATE INDEX "employee_loans_loanTypeId_idx" ON "employee_loans"("loanTypeId");

-- CreateIndex
CREATE INDEX "employee_loans_status_idx" ON "employee_loans"("status");

-- CreateIndex
CREATE UNIQUE INDEX "employee_payrolls_timesheetId_key" ON "employee_payrolls"("timesheetId");

-- CreateIndex
CREATE INDEX "employee_payrolls_organizationId_idx" ON "employee_payrolls"("organizationId");

-- CreateIndex
CREATE INDEX "employee_payrolls_payrollPeriodId_idx" ON "employee_payrolls"("payrollPeriodId");

-- CreateIndex
CREATE INDEX "employee_payrolls_organizationId_employeeId_isDeleted_idx" ON "employee_payrolls"("organizationId", "employeeId", "isDeleted");

-- CreateIndex
CREATE INDEX "employee_payrolls_organizationId_payrollPeriodId_isPaid_isDeleted_idx" ON "employee_payrolls"("organizationId", "payrollPeriodId", "isPaid", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "employee_payrolls_employeeId_payrollPeriodId_key" ON "employee_payrolls"("employeeId", "payrollPeriodId");

-- CreateIndex
CREATE INDEX "employee_schedule_history_organizationId_employeeId_created_idx" ON "employee_schedule_history"("organizationId", "employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "employee_schedule_history_organizationId_employeeId_effecti_idx" ON "employee_schedule_history"("organizationId", "employeeId", "effectiveAt", "createdAt");

-- CreateIndex
CREATE INDEX "employee_schedule_history_organizationId_action_createdAt_idx" ON "employee_schedule_history"("organizationId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "employee_schedule_history_actorEmployeeId_idx" ON "employee_schedule_history"("actorEmployeeId");

-- CreateIndex
CREATE INDEX "guides_published_idx" ON "guides"("published");

-- CreateIndex
CREATE INDEX "guides_author_idx" ON "guides"("author");

-- CreateIndex
CREATE INDEX "Job_organizationId_idx" ON "Job"("organizationId");

-- CreateIndex
CREATE INDEX "Job_departmentId_idx" ON "Job"("departmentId");

-- CreateIndex
CREATE INDEX "Job_sectionId_idx" ON "Job"("sectionId");

-- CreateIndex
CREATE INDEX "Job_positionId_idx" ON "Job"("positionId");

-- CreateIndex
CREATE INDEX "Job_levelId_idx" ON "Job"("levelId");

-- CreateIndex
CREATE INDEX "Job_sourceRequestId_idx" ON "Job"("sourceRequestId");

-- CreateIndex
CREATE INDEX "employee_leave_balances_organizationId_employeeId_idx" ON "employee_leave_balances"("organizationId", "employeeId");

-- CreateIndex
CREATE INDEX "employee_leave_balances_organizationId_leaveTypeId_idx" ON "employee_leave_balances"("organizationId", "leaveTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_leave_balances_organizationId_employeeId_leaveTypeId_periodStart_periodEnd_key" ON "employee_leave_balances"("organizationId", "employeeId", "leaveTypeId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_organizationId_code_key" ON "leave_types"("organizationId", "code");

-- CreateIndex
CREATE INDEX "leave_types_organizationId_isActive_idx" ON "leave_types"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "leave_types_organizationId_enabled_idx" ON "leave_types"("organizationId", "enabled");

-- CreateIndex
CREATE INDEX "levels_organizationId_idx" ON "levels"("organizationId");

-- CreateIndex
CREATE INDEX "levels_rank_idx" ON "levels"("rank");

-- CreateIndex
CREATE UNIQUE INDEX "levels_organizationId_name_key" ON "levels"("organizationId", "name");

-- CreateIndex
CREATE INDEX "loan_types_organizationId_idx" ON "loan_types"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "loan_types_organizationId_name_key" ON "loan_types"("organizationId", "name");

-- CreateIndex
CREATE INDEX "notifications_organizationId_category_idx" ON "notifications"("organizationId", "category");

-- CreateIndex
CREATE INDEX "notifications_organizationId_createdAt_idx" ON "notifications"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_organizationId_eventKey_idx" ON "notifications"("organizationId", "eventKey");

-- CreateIndex
CREATE INDEX "notifications_sourceEmployeeId_idx" ON "notifications"("sourceEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_code_key" ON "organizations"("code");

-- CreateIndex
CREATE INDEX "organizations_isDeleted_idx" ON "organizations"("isDeleted");

-- CreateIndex
CREATE INDEX "payroll_cycle_configs_organizationId_idx" ON "payroll_cycle_configs"("organizationId");

-- CreateIndex
CREATE INDEX "payroll_periods_organizationId_idx" ON "payroll_periods"("organizationId");

-- CreateIndex
CREATE INDEX "payroll_periods_status_idx" ON "payroll_periods"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_organizationId_startDate_endDate_key" ON "payroll_periods"("organizationId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "Child_organizationId_idx" ON "Child"("organizationId");

-- CreateIndex
CREATE INDEX "Child_parentId_idx" ON "Child"("parentId");

-- CreateIndex
CREATE INDEX "Child_organizationId_isDeleted_dateOfBirth_idx" ON "Child"("organizationId", "isDeleted", "dateOfBirth");

-- CreateIndex
CREATE INDEX "positions_organizationId_idx" ON "positions"("organizationId");

-- CreateIndex
CREATE INDEX "positions_organizationId_sectionId_idx" ON "positions"("organizationId", "sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "positions_organizationId_code_key" ON "positions"("organizationId", "code");

-- CreateIndex
CREATE INDEX "position_levels_positionId_idx" ON "position_levels"("positionId");

-- CreateIndex
CREATE INDEX "position_levels_levelId_idx" ON "position_levels"("levelId");

-- CreateIndex
CREATE UNIQUE INDEX "position_levels_positionId_levelId_key" ON "position_levels"("positionId", "levelId");

-- CreateIndex
CREATE UNIQUE INDEX "requests_code_key" ON "requests"("code");

-- CreateIndex
CREATE INDEX "requests_organizationId_idx" ON "requests"("organizationId");

-- CreateIndex
CREATE INDEX "requests_requesterId_idx" ON "requests"("requesterId");

-- CreateIndex
CREATE INDEX "requests_currentWorkflowStateKey_idx" ON "requests"("currentWorkflowStateKey");

-- CreateIndex
CREATE INDEX "requests_workflowInstanceId_idx" ON "requests"("workflowInstanceId");

-- CreateIndex
CREATE INDEX "requests_organizationId_requesterId_type_isDeleted_createdA_idx" ON "requests"("organizationId", "requesterId", "type", "isDeleted", "createdAt");

-- CreateIndex
CREATE INDEX "request_transactions_organizationId_requestId_occurredAt_idx" ON "request_transactions"("organizationId", "requestId", "occurredAt");

-- CreateIndex
CREATE INDEX "request_transactions_workflowInstanceId_idx" ON "request_transactions"("workflowInstanceId");

-- CreateIndex
CREATE INDEX "request_transactions_stepExecutionId_idx" ON "request_transactions"("stepExecutionId");

-- CreateIndex
CREATE INDEX "request_transactions_actorEmployeeId_idx" ON "request_transactions"("actorEmployeeId");

-- CreateIndex
CREATE INDEX "request_transactions_requestId_eventCategory_occurredAt_idx" ON "request_transactions"("requestId", "eventCategory", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "request_transactions_requestId_sequenceNumber_key" ON "request_transactions"("requestId", "sequenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "rules_code_key" ON "rules"("code");

-- CreateIndex
CREATE INDEX "rules_organizationId_idx" ON "rules"("organizationId");

-- CreateIndex
CREATE INDEX "rules_category_idx" ON "rules"("category");

-- CreateIndex
CREATE INDEX "rules_isActive_idx" ON "rules"("isActive");

-- CreateIndex
CREATE INDEX "schedule_overrides_organizationId_employeeId_isDeleted_idx" ON "schedule_overrides"("organizationId", "employeeId", "isDeleted");

-- CreateIndex
CREATE INDEX "schedule_overrides_organizationId_employeeId_date_isDeleted_idx" ON "schedule_overrides"("organizationId", "employeeId", "date", "isDeleted");

-- CreateIndex
CREATE INDEX "schedule_overrides_organizationId_date_isDeleted_idx" ON "schedule_overrides"("organizationId", "date", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "employee_schedule_override_unique" ON "schedule_overrides"("organizationId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "schedule_templates_organizationId_isDeleted_idx" ON "schedule_templates"("organizationId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_templates_organizationId_code_key" ON "schedule_templates"("organizationId", "code");

-- CreateIndex
CREATE INDEX "shift_types_organizationId_isDeleted_idx" ON "shift_types"("organizationId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "shift_types_organizationId_code_key" ON "shift_types"("organizationId", "code");

-- CreateIndex
CREATE INDEX "soa_line_items_statementOfAccountId_idx" ON "soa_line_items"("statementOfAccountId");

-- CreateIndex
CREATE INDEX "soa_line_items_employeeId_idx" ON "soa_line_items"("employeeId");

-- CreateIndex
CREATE INDEX "soa_line_items_employeePayrollId_idx" ON "soa_line_items"("employeePayrollId");

-- CreateIndex
CREATE INDEX "soa_line_items_employeeLoanId_idx" ON "soa_line_items"("employeeLoanId");

-- CreateIndex
CREATE INDEX "soa_line_items_employeeBenefitId_idx" ON "soa_line_items"("employeeBenefitId");

-- CreateIndex
CREATE INDEX "soa_remittances_statementOfAccountId_idx" ON "soa_remittances"("statementOfAccountId");

-- CreateIndex
CREATE INDEX "soa_remittances_status_idx" ON "soa_remittances"("status");

-- CreateIndex
CREATE INDEX "soa_remittances_paymentDate_idx" ON "soa_remittances"("paymentDate");

-- CreateIndex
CREATE INDEX "statements_of_account_organizationId_idx" ON "statements_of_account"("organizationId");

-- CreateIndex
CREATE INDEX "statements_of_account_organizationId_startDate_endDate_idx" ON "statements_of_account"("organizationId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "statements_of_account_status_idx" ON "statements_of_account"("status");

-- CreateIndex
CREATE INDEX "statements_of_account_startDate_endDate_idx" ON "statements_of_account"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "statements_of_account_dueDate_idx" ON "statements_of_account"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "statements_of_account_organizationId_soaNumber_key" ON "statements_of_account"("organizationId", "soaNumber");

-- CreateIndex
CREATE UNIQUE INDEX "status_incidents_incidentKey_key" ON "status_incidents"("incidentKey");

-- CreateIndex
CREATE INDEX "status_incidents_moduleSlug_startedAt_idx" ON "status_incidents"("moduleSlug", "startedAt");

-- CreateIndex
CREATE INDEX "status_incidents_isResolved_startedAt_idx" ON "status_incidents"("isResolved", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "status_state_stateKey_key" ON "status_state"("stateKey");

-- CreateIndex
CREATE UNIQUE INDEX "terminations_terminationNumber_key" ON "terminations"("terminationNumber");

-- CreateIndex
CREATE INDEX "terminations_organizationId_idx" ON "terminations"("organizationId");

-- CreateIndex
CREATE INDEX "terminations_employeeId_idx" ON "terminations"("employeeId");

-- CreateIndex
CREATE INDEX "terminations_status_idx" ON "terminations"("status");

-- CreateIndex
CREATE INDEX "terminations_initiatedById_idx" ON "terminations"("initiatedById");

-- CreateIndex
CREATE INDEX "termination_audit_logs_terminationId_idx" ON "termination_audit_logs"("terminationId");

-- CreateIndex
CREATE UNIQUE INDEX "timesheet_configs_organizationId_key" ON "timesheet_configs"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "timesheets_code_key" ON "timesheets"("code");

-- CreateIndex
CREATE INDEX "timesheets_organizationId_idx" ON "timesheets"("organizationId");

-- CreateIndex
CREATE INDEX "timesheets_employeeId_idx" ON "timesheets"("employeeId");

-- CreateIndex
CREATE INDEX "timesheets_payrollPeriodId_idx" ON "timesheets"("payrollPeriodId");

-- CreateIndex
CREATE INDEX "timesheets_status_idx" ON "timesheets"("status");

-- CreateIndex
CREATE INDEX "timesheets_lockedAt_idx" ON "timesheets"("lockedAt");

-- CreateIndex
CREATE INDEX "timesheets_lockedBy_idx" ON "timesheets"("lockedBy");

-- CreateIndex
CREATE INDEX "timesheets_editPermissionStatus_idx" ON "timesheets"("editPermissionStatus");

-- CreateIndex
CREATE INDEX "timesheets_editPermissionRequestId_idx" ON "timesheets"("editPermissionRequestId");

-- CreateIndex
CREATE INDEX "timesheets_isDeleted_idx" ON "timesheets"("isDeleted");

-- CreateIndex
CREATE INDEX "timesheets_organizationId_employeeId_isDeleted_idx" ON "timesheets"("organizationId", "employeeId", "isDeleted");

-- CreateIndex
CREATE INDEX "timesheets_organizationId_payrollPeriodId_status_isDeleted_idx" ON "timesheets"("organizationId", "payrollPeriodId", "status", "isDeleted");

-- CreateIndex
CREATE INDEX "timesheets_organizationId_employeeId_payrollPeriodId_editPe_idx" ON "timesheets"("organizationId", "employeeId", "payrollPeriodId", "editPermissionStatus");

-- CreateIndex
CREATE INDEX "timesheets_organizationId_employeeId_payrollPeriodId_isDele_idx" ON "timesheets"("organizationId", "employeeId", "payrollPeriodId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "timesheets_organizationId_employeeId_payrollPeriodId_key" ON "timesheets"("organizationId", "employeeId", "payrollPeriodId");

-- CreateIndex
CREATE INDEX "timesheet_lines_organizationId_date_isDeleted_idx" ON "timesheet_lines"("organizationId", "date", "isDeleted");

-- CreateIndex
CREATE INDEX "timesheet_lines_organizationId_payrollPeriodId_date_isDelet_idx" ON "timesheet_lines"("organizationId", "payrollPeriodId", "date", "isDeleted");

-- CreateIndex
CREATE INDEX "timesheet_lines_organizationId_employeeId_date_isDeleted_idx" ON "timesheet_lines"("organizationId", "employeeId", "date", "isDeleted");

-- CreateIndex
CREATE INDEX "timesheet_lines_organizationId_timesheetId_date_isEffective_idx" ON "timesheet_lines"("organizationId", "timesheetId", "date", "isEffective");

-- CreateIndex
CREATE INDEX "timesheet_lines_organizationId_employeeId_date_isEffective_idx" ON "timesheet_lines"("organizationId", "employeeId", "date", "isEffective");

-- CreateIndex
CREATE INDEX "timesheet_lines_organizationId_status_date_isDeleted_idx" ON "timesheet_lines"("organizationId", "status", "date", "isDeleted");

-- CreateIndex
CREATE INDEX "timesheet_lines_organizationId_departmentIdSnapshot_date_is_idx" ON "timesheet_lines"("organizationId", "departmentIdSnapshot", "date", "isDeleted");

-- CreateIndex
CREATE INDEX "timesheet_lines_organizationId_reportToIdSnapshot_date_isDe_idx" ON "timesheet_lines"("organizationId", "reportToIdSnapshot", "date", "isDeleted");

-- CreateIndex
CREATE INDEX "timesheet_lines_timesheetId_idx" ON "timesheet_lines"("timesheetId");

-- CreateIndex
CREATE INDEX "timesheet_lines_attendanceId_idx" ON "timesheet_lines"("attendanceId");

-- CreateIndex
CREATE INDEX "timesheet_lines_supersedesLineId_idx" ON "timesheet_lines"("supersedesLineId");

-- CreateIndex
CREATE INDEX "timesheet_lines_supersededById_idx" ON "timesheet_lines"("supersededById");

-- CreateIndex
CREATE UNIQUE INDEX "timesheet_lines_organizationId_timesheetId_date_revisionNo_key" ON "timesheet_lines"("organizationId", "timesheetId", "date", "revisionNo");

-- CreateIndex
CREATE UNIQUE INDEX "users_userName_key" ON "users"("userName");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_isDeleted_idx" ON "users"("isDeleted");

-- CreateIndex
CREATE INDEX "workflow_instances_organizationId_domain_isDeleted_idx" ON "workflow_instances"("organizationId", "domain", "isDeleted");

-- CreateIndex
CREATE INDEX "workflow_instances_organizationId_domain_requestType_isDele_idx" ON "workflow_instances"("organizationId", "domain", "requestType", "isDeleted");

-- CreateIndex
CREATE INDEX "workflow_instances_domain_domainRecordId_idx" ON "workflow_instances"("domain", "domainRecordId");

-- CreateIndex
CREATE INDEX "workflow_step_executions_workflowInstanceId_idx" ON "workflow_step_executions"("workflowInstanceId");

-- CreateIndex
CREATE INDEX "workflow_step_executions_requestId_idx" ON "workflow_step_executions"("requestId");

-- CreateIndex
CREATE INDEX "workflow_step_executions_applicantId_idx" ON "workflow_step_executions"("applicantId");

-- CreateIndex
CREATE INDEX "workflow_step_executions_assigneeId_idx" ON "workflow_step_executions"("assigneeId");

-- CreateIndex
CREATE INDEX "workflow_step_executions_status_idx" ON "workflow_step_executions"("status");

-- CreateIndex
CREATE INDEX "workflow_step_executions_organizationId_idx" ON "workflow_step_executions"("organizationId");

-- CreateIndex
CREATE INDEX "workflow_step_executions_workflowInstanceId_isDeleted_statu_idx" ON "workflow_step_executions"("workflowInstanceId", "isDeleted", "status", "stepNumber");

-- CreateIndex
CREATE INDEX "workflow_step_executions_requestId_isDeleted_status_stepNum_idx" ON "workflow_step_executions"("requestId", "isDeleted", "status", "stepNumber");

-- CreateIndex
CREATE INDEX "workflow_step_executions_applicantId_isDeleted_status_stepN_idx" ON "workflow_step_executions"("applicantId", "isDeleted", "status", "stepNumber");

-- CreateIndex
CREATE INDEX "workforce_recruitment_settings_organizationId_idx" ON "workforce_recruitment_settings"("organizationId");

-- CreateIndex
CREATE INDEX "workforce_recruitment_policies_settingId_idx" ON "workforce_recruitment_policies"("settingId");

-- CreateIndex
CREATE INDEX "workforce_recruitment_policies_organizationId_idx" ON "workforce_recruitment_policies"("organizationId");

-- CreateIndex
CREATE INDEX "workforce_recruitment_policies_organizationId_departmentId__idx" ON "workforce_recruitment_policies"("organizationId", "departmentId", "sectionId", "positionId", "levelId", "isActive");

-- AddForeignKey
ALTER TABLE "ActivityLogging" ADD CONSTRAINT "ActivityLogging_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_convertedToEmployeeId_fkey" FOREIGN KEY ("convertedToEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_workflowInstanceId_fkey" FOREIGN KEY ("workflowInstanceId") REFERENCES "workflow_instances"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_currentStepExecutionId_fkey" FOREIGN KEY ("currentStepExecutionId") REFERENCES "workflow_step_executions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_lastCompletedStepExecutionId_fkey" FOREIGN KEY ("lastCompletedStepExecutionId") REFERENCES "workflow_step_executions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recruitment_activities" ADD CONSTRAINT "recruitment_activities_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "applicants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recruitment_activities" ADD CONSTRAINT "recruitment_activities_workflowInstanceId_fkey" FOREIGN KEY ("workflowInstanceId") REFERENCES "workflow_instances"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recruitment_activities" ADD CONSTRAINT "recruitment_activities_stepExecutionId_fkey" FOREIGN KEY ("stepExecutionId") REFERENCES "workflow_step_executions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recruitment_activities" ADD CONSTRAINT "recruitment_activities_actorEmployeeId_fkey" FOREIGN KEY ("actorEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "applicant_attachments" ADD CONSTRAINT "applicant_attachments_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "applicants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "applicant_attachments" ADD CONSTRAINT "applicant_attachments_uploadedByEmployeeId_fkey" FOREIGN KEY ("uploadedByEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_appliedBy_fkey" FOREIGN KEY ("appliedBy") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "timesheets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_obligations" ADD CONSTRAINT "attendance_obligations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_obligations" ADD CONSTRAINT "attendance_obligations_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_obligations" ADD CONSTRAINT "attendance_obligations_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "attendances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_obligations" ADD CONSTRAINT "attendance_obligations_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "timesheets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_obligations" ADD CONSTRAINT "attendance_obligations_timesheetlineId_fkey" FOREIGN KEY ("timesheetlineId") REFERENCES "timesheet_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLogging" ADD CONSTRAINT "AuditLogging_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardingProcess" ADD CONSTRAINT "BoardingProcess_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardingProcess" ADD CONSTRAINT "BoardingProcess_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_items" ADD CONSTRAINT "calendar_items_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_processId_fkey" FOREIGN KEY ("processId") REFERENCES "BoardingProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "departments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_headId_fkey" FOREIGN KEY ("headId") REFERENCES "employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedule_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_schedule_templates" ADD CONSTRAINT "department_schedule_templates_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "department_schedule_templates" ADD CONSTRAINT "department_schedule_templates_scheduleTemplateId_fkey" FOREIGN KEY ("scheduleTemplateId") REFERENCES "schedule_templates"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_schedule_templates" ADD CONSTRAINT "department_schedule_templates_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "document_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_review_events" ADD CONSTRAINT "document_review_events_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentFolders" ADD CONSTRAINT "documentFolders_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_reportToId_fkey" FOREIGN KEY ("reportToId") REFERENCES "employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_benefits" ADD CONSTRAINT "employee_benefits_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_benefits" ADD CONSTRAINT "employee_benefits_benefitTypeId_fkey" FOREIGN KEY ("benefitTypeId") REFERENCES "benefit_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_benefits" ADD CONSTRAINT "employee_benefits_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "payroll_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_benefit_installments" ADD CONSTRAINT "employee_benefit_installments_employeeBenefitId_fkey" FOREIGN KEY ("employeeBenefitId") REFERENCES "employee_benefits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_loans" ADD CONSTRAINT "employee_loans_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_loans" ADD CONSTRAINT "employee_loans_loanTypeId_fkey" FOREIGN KEY ("loanTypeId") REFERENCES "loan_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_leave_balances" ADD CONSTRAINT "employee_leave_balances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_leave_balances" ADD CONSTRAINT "employee_leave_balances_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_payrolls" ADD CONSTRAINT "employee_payrolls_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_payrolls" ADD CONSTRAINT "employee_payrolls_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "payroll_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_payrolls" ADD CONSTRAINT "employee_payrolls_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "timesheets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_schedule_history" ADD CONSTRAINT "employee_schedule_history_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_schedule_history" ADD CONSTRAINT "employee_schedule_history_actorEmployeeId_fkey" FOREIGN KEY ("actorEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_sourceRequestId_fkey" FOREIGN KEY ("sourceRequestId") REFERENCES "requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_processId_fkey" FOREIGN KEY ("processId") REFERENCES "BoardingProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sourceEmployeeId_fkey" FOREIGN KEY ("sourceEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_calculatorId_fkey" FOREIGN KEY ("calculatorId") REFERENCES "calculators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Person"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_levels" ADD CONSTRAINT "position_levels_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_levels" ADD CONSTRAINT "position_levels_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_targetEmployeeId_fkey" FOREIGN KEY ("targetEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_workflowInstanceId_fkey" FOREIGN KEY ("workflowInstanceId") REFERENCES "workflow_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_currentStepExecutionId_fkey" FOREIGN KEY ("currentStepExecutionId") REFERENCES "workflow_step_executions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_lastCompletedStepExecutionId_fkey" FOREIGN KEY ("lastCompletedStepExecutionId") REFERENCES "workflow_step_executions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "request_transactions" ADD CONSTRAINT "request_transactions_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_transactions" ADD CONSTRAINT "request_transactions_workflowInstanceId_fkey" FOREIGN KEY ("workflowInstanceId") REFERENCES "workflow_instances"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "request_transactions" ADD CONSTRAINT "request_transactions_stepExecutionId_fkey" FOREIGN KEY ("stepExecutionId") REFERENCES "workflow_step_executions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "request_transactions" ADD CONSTRAINT "request_transactions_actorEmployeeId_fkey" FOREIGN KEY ("actorEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "schedule_overrides" ADD CONSTRAINT "schedule_overrides_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "schedule_overrides" ADD CONSTRAINT "schedule_overrides_shiftTypeId_fkey" FOREIGN KEY ("shiftTypeId") REFERENCES "shift_types"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_overrides" ADD CONSTRAINT "schedule_overrides_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soa_line_items" ADD CONSTRAINT "soa_line_items_statementOfAccountId_fkey" FOREIGN KEY ("statementOfAccountId") REFERENCES "statements_of_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soa_line_items" ADD CONSTRAINT "soa_line_items_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "soa_line_items" ADD CONSTRAINT "soa_line_items_employeePayrollId_fkey" FOREIGN KEY ("employeePayrollId") REFERENCES "employee_payrolls"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "soa_line_items" ADD CONSTRAINT "soa_line_items_employeeLoanId_fkey" FOREIGN KEY ("employeeLoanId") REFERENCES "employee_loans"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "soa_line_items" ADD CONSTRAINT "soa_line_items_employeeBenefitId_fkey" FOREIGN KEY ("employeeBenefitId") REFERENCES "employee_benefits"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "soa_remittances" ADD CONSTRAINT "soa_remittances_statementOfAccountId_fkey" FOREIGN KEY ("statementOfAccountId") REFERENCES "statements_of_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statements_of_account" ADD CONSTRAINT "statements_of_account_eppReconciledById_fkey" FOREIGN KEY ("eppReconciledById") REFERENCES "employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TemplateItem" ADD CONSTRAINT "TemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BoardingTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminations" ADD CONSTRAINT "terminations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminations" ADD CONSTRAINT "terminations_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminations" ADD CONSTRAINT "terminations_hrDirectorId_fkey" FOREIGN KEY ("hrDirectorId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminations" ADD CONSTRAINT "terminations_legalApproverId_fkey" FOREIGN KEY ("legalApproverId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "termination_audit_logs" ADD CONSTRAINT "termination_audit_logs_terminationId_fkey" FOREIGN KEY ("terminationId") REFERENCES "terminations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_lockedBy_fkey" FOREIGN KEY ("lockedBy") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_editPermissionRequestId_fkey" FOREIGN KEY ("editPermissionRequestId") REFERENCES "requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_editPermissionGrantedBy_fkey" FOREIGN KEY ("editPermissionGrantedBy") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_editPermissionRejectedBy_fkey" FOREIGN KEY ("editPermissionRejectedBy") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_lines" ADD CONSTRAINT "timesheet_lines_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_lines" ADD CONSTRAINT "timesheet_lines_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "timesheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_lines" ADD CONSTRAINT "timesheet_lines_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_lines" ADD CONSTRAINT "timesheet_lines_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "attendances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "MigrationRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "workbookId" TEXT NOT NULL,
    "sourceFilename" TEXT,
    "sourceFiles" JSONB,
    "idempotencyKey" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL,
    "phase" TEXT,
    "startedByUserId" TEXT,
    "jobId" TEXT,
    "progress" JSONB,
    "counts" JSONB,
    "summaryJson" JSONB,
    "proofJson" JSONB,
    "errorJson" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MigrationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MigrationRunStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "stage" TEXT NOT NULL,
    "stepCode" TEXT NOT NULL,
    "phase" TEXT,
    "status" TEXT NOT NULL,
    "sourceWorkbook" TEXT,
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "counts" JSONB,
    "summaryJson" JSONB,
    "proofJson" JSONB,
    "errorJson" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MigrationRunStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MigrationRunEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "stage" TEXT NOT NULL,
    "stepCode" TEXT,
    "phase" TEXT,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sourceWorkbook" TEXT,
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "employeeId" TEXT,
    "employeeName" TEXT,
    "counts" JSONB,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MigrationRunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MigrationRun_organizationId_idempotencyKey_key" ON "MigrationRun"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "MigrationRun_organizationId_workbookId_status_idx" ON "MigrationRun"("organizationId", "workbookId", "status");

-- CreateIndex
CREATE INDEX "MigrationRun_jobId_idx" ON "MigrationRun"("jobId");

-- CreateIndex
CREATE INDEX "MigrationRun_createdAt_idx" ON "MigrationRun"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MigrationRunStep_runId_stepCode_key" ON "MigrationRunStep"("runId", "stepCode");

-- CreateIndex
CREATE INDEX "MigrationRunStep_runId_sequence_idx" ON "MigrationRunStep"("runId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "MigrationRunEvent_runId_sequence_key" ON "MigrationRunEvent"("runId", "sequence");

-- CreateIndex
CREATE INDEX "MigrationRunEvent_runId_timestamp_idx" ON "MigrationRunEvent"("runId", "timestamp");

-- CreateIndex
CREATE INDEX "MigrationRunEvent_stage_stepCode_eventType_idx" ON "MigrationRunEvent"("stage", "stepCode", "eventType");

-- AddForeignKey
ALTER TABLE "MigrationRun" ADD CONSTRAINT "MigrationRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MigrationRun" ADD CONSTRAINT "MigrationRun_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MigrationRunStep" ADD CONSTRAINT "MigrationRunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MigrationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MigrationRunEvent" ADD CONSTRAINT "MigrationRunEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MigrationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_step_executions" ADD CONSTRAINT "workflow_step_executions_workflowInstanceId_fkey" FOREIGN KEY ("workflowInstanceId") REFERENCES "workflow_instances"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "workflow_step_executions" ADD CONSTRAINT "workflow_step_executions_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "workflow_step_executions" ADD CONSTRAINT "workflow_step_executions_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "applicants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "workflow_step_executions" ADD CONSTRAINT "workflow_step_executions_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workforce_recruitment_policies" ADD CONSTRAINT "workforce_recruitment_policies_settingId_fkey" FOREIGN KEY ("settingId") REFERENCES "workforce_recruitment_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workforce_recruitment_policies" ADD CONSTRAINT "workforce_recruitment_policies_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workforce_recruitment_policies" ADD CONSTRAINT "workforce_recruitment_policies_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workforce_recruitment_policies" ADD CONSTRAINT "workforce_recruitment_policies_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workforce_recruitment_policies" ADD CONSTRAINT "workforce_recruitment_policies_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;



