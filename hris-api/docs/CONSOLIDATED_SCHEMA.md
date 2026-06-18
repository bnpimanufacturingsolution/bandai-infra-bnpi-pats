# HRIS Consolidated Schema Documentation

This document contains all Prisma models in a single file for documentation and reference purposes.

**Database:** MongoDB  
**Generated:** October 20, 2025

---

## Table of Contents

1. [Enumerations](#enumerations)
2. [Core Entities](#core-entities)
3. [Admin Master Data](#admin-master-data)
4. [Junction Tables](#junction-tables)
5. [Entity Relationships](#entity-relationships)

---

## Enumerations

### Employment & Employee Related

```prisma
enum EmploymentStatus {
  ACTIVE
  INACTIVE
  TERMINATED
  RESIGNED
  RETIRED
  ON_LEAVE
}

enum EmploymentType {
  REGULAR
  PROBATIONARY
  CONTRACTUAL
  PART_TIME
  CONSULTANT
  INTERN
}

enum PayFrequency {
  DAILY
  WEEKLY
  BIWEEKLY
  MONTHLY
  QUARTERLY
  ANNUALLY
}

enum WorkLocation {
  ONSITE
  REMOTE
  HYBRID
}
```

### Attendance

```prisma
enum AttendanceStatus {
  PRESENT
  ABSENT
  LEAVE
  HOLIDAY
  WORK_FROM_HOME
}
```

### Request Management

```prisma
enum RequestType {
  LEAVE
  OVERTIME
  TIME_ADJUSTMENT
  EXPENSE_REIMBURSEMENT
  DOCUMENT_REQUEST
  OTHER
}

enum RequestStatus {
  PENDING
  APPROVED
  REJECTED
  CANCELLED
}
```

### Schedule & Calendar

```prisma
enum ScheduleType {
  FIXED
  FLEXIBLE
  SHIFT
  ROTATING
}

enum DayOfWeek {
  MONDAY
  TUESDAY
  WEDNESDAY
  THURSDAY
  FRIDAY
  SATURDAY
  SUNDAY
}

enum CalendarType {
  COMPANY
  DEPARTMENT
  REGIONAL
}

enum EventType {
  HOLIDAY
  COMPANY_EVENT
  MEETING
  TRAINING
  DEADLINE
  OTHER
}
```

### Payroll & Benefits

```prisma
enum CalculatorType {
  BASIC
  GROSS_TO_NET
  NET_TO_GROSS
  THIRTEENTH_MONTH
  CUSTOM
}

enum PeriodStatus {
  DRAFT
  OPEN
  PROCESSING
  COMPLETED
  CLOSED
}

enum BenefitCategory {
  INSURANCE
  ALLOWANCE
  BONUS
  RETIREMENT
  HEALTH
  EDUCATION
  TRANSPORTATION
  OTHER
}

enum LoanCategory {
  SALARY_LOAN
  EMERGENCY_LOAN
  HOUSING_LOAN
  CALAMITY_LOAN
  SSS_LOAN
  PAGIBIG_LOAN
  OTHER
}

enum LoanStatus {
  PENDING
  APPROVED
  ACTIVE
  PAID
  DEFAULTED
  CANCELLED
}
```

---

## Core Entities

### Employee

The central entity of the HRIS system. Represents an employee in the organization.

```prisma
model Employee {
  id                String            @id @default(auto()) @map("_id") @db.ObjectId
  organizationId    String            // Multi-tenancy support
  employeeId        String            // Company employee ID
  personId         String             @db.ObjectId // Just store the ID, no relation
  userId            String?           @db.ObjectId // Just store the ID, no relation

  // Employment Details
  employmentHireDate          DateTime
  employmentTerminationDate   DateTime?
  employmentStatus  EmploymentStatus  @default(ACTIVE)
  employmentType    EmploymentType    @default(PROBATIONARY)
  probationEndDate  DateTime?

  // Position & Department
  department        Department        @relation(fields: [departmentId], references: [id])
  departmentId      String            @db.ObjectId
  position          Position          @relation(fields: [positionId], references: [id])
  positionId        String            @db.ObjectId

  // Work Schedule
  schedule          Schedule?         @relation(fields: [scheduleId], references: [id])
  scheduleId        String?           @db.ObjectId
  workLocation      WorkLocation      @default(ONSITE)

  // Compensation
  basicSalary       Float
  currency          String            @default("PHP")
  payFrequency      PayFrequency      @default(MONTHLY)

  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  // Relations
  attendances       Attendance[]
  requests          Request[]
  employeePayrolls  EmployeePayroll[]
  employeeBenefits  EmployeeBenefit[]
  employeeLoans     EmployeeLoan[]
  documents         Json[]

  @@unique([organizationId, employeeId])
  @@unique([organizationId, personId])
  @@unique([organizationId, userId])
  @@index([organizationId])
  @@unique([personId])
  @@unique([userId])
  @@map("employees")
}
```

### Attendance

Tracks daily attendance records for employees.

```prisma
model Attendance {
  id          String           @id @default(auto()) @map("_id") @db.ObjectId
  organizationId String        // Multi-tenancy support
  employee    Employee         @relation(fields: [employeeId], references: [id])
  employeeId  String           @db.ObjectId
  date        DateTime         @db.Date
  timeIn      DateTime?
  timeOut     DateTime?
  breakStart  DateTime?
  breakEnd    DateTime?
  totalHours  Float            @default(0)
  regularHours Float           @default(0)
  overtimeHours Float          @default(0)
  lateMinutes Int              @default(0)
  undertimeMinutes Int         @default(0)
  status      AttendanceStatus @default(PRESENT)

  // Geolocation data
  timeInLocation  Json? // {lat: number, lng: number, address: string}
  timeOutLocation Json? // {lat: number, lng: number, address: string}

  // Biometric/Device info
  deviceInfo      Json? // Device details for mobile check-in
  isManualEntry   Boolean @default(false)
  approvedBy      String? @db.ObjectId

  notes       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([employeeId, date])
  @@index([organizationId])
  @@map("attendances")
}
```

### Request

Handles various employee requests (leave, overtime, etc.).

```prisma
model Request {
  id             String        @id @default(auto()) @map("_id") @db.ObjectId
  organizationId String        // Multi-tenancy support
  employee       Employee      @relation(fields: [employeeId], references: [id])
  employeeId     String        @db.ObjectId
  type           RequestType
  status         RequestStatus @default(PENDING)
  startDate      DateTime?
  endDate        DateTime?
  reason         String
  attachments    Json[]        // Array of file URLs/paths

  // Approval workflow
  approvedBy     String?       @db.ObjectId // User ID who approved
  approvedAt     DateTime?
  rejectedBy     String?       @db.ObjectId // User ID who rejected
  rejectedAt     DateTime?
  rejectionReason String?

  notes          String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  @@index([organizationId])
  @@index([employeeId])
  @@index([status])
  @@map("requests")
}
```

---

## Admin Master Data

### Department

Organizational departments with hierarchical support.

```prisma
model Department {
  id          String    @id @default(auto()) @map("_id") @db.ObjectId
  organizationId String // Multi-tenancy support
  name        String
  code        String
  description String?
  managerId   String?   @db.ObjectId // Employee who manages this department
  parentId    String?   @db.ObjectId // For nested departments
  parent      Department? @relation("DepartmentHierarchy", fields: [parentId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  children    Department[] @relation("DepartmentHierarchy")
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  positions   Position[]
  employees   Employee[]

  @@unique([organizationId, name])
  @@unique([organizationId, code])
  @@index([organizationId])
  @@map("departments")
}
```

### Position

Job positions within departments.

```prisma
model Position {
  id           String     @id @default(auto()) @map("_id") @db.ObjectId
  organizationId String   // Multi-tenancy support
  title        String
  code         String
  description  String?
  department   Department @relation(fields: [departmentId], references: [id])
  departmentId String     @db.ObjectId
  minSalary    Float?
  maxSalary    Float?
  isActive     Boolean    @default(true)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  employees    Employee[]

  @@unique([organizationId, code])
  @@index([organizationId])
  @@map("positions")
}
```

### Schedule

Work schedules that can be assigned to employees.

```prisma
model Schedule {
  id             String       @id @default(auto()) @map("_id") @db.ObjectId
  organizationId String       // Multi-tenancy support
  name           String
  description    String?
  type           ScheduleType @default(FIXED)

  // Work hours
  startTime      String       // Format: "09:00"
  endTime        String       // Format: "18:00"
  breakDuration  Int          @default(60) // Minutes
  workDays       DayOfWeek[]  // Days this schedule applies

  // Hours calculation
  hoursPerDay    Float        @default(8)
  hoursPerWeek   Float        @default(40)

  isActive       Boolean      @default(true)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  // Relations
  employees      Employee[]

  @@unique([organizationId, name])
  @@index([organizationId])
  @@map("schedules")
}
```

### Calendar

Company calendars for managing holidays and events.

```prisma
model Calendar {
  id             String        @id @default(auto()) @map("_id") @db.ObjectId
  organizationId String        // Multi-tenancy support
  name           String
  description    String?
  type           CalendarType  @default(COMPANY)
  year           Int
  country        String?       @default("PH")
  region         String?

  isActive       Boolean       @default(true)
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  // Relations
  events         CalendarEvent[]

  @@unique([organizationId, name, year])
  @@index([organizationId])
  @@index([year])
  @@map("calendars")
}
```

### CalendarEvent

Events within a calendar (holidays, meetings, etc.).

```prisma
model CalendarEvent {
  id             String    @id @default(auto()) @map("_id") @db.ObjectId
  organizationId String    // Multi-tenancy support
  calendar       Calendar  @relation(fields: [calendarId], references: [id], onDelete: Cascade)
  calendarId     String    @db.ObjectId

  title          String
  description    String?
  type           EventType @default(HOLIDAY)
  startDate      DateTime  @db.Date
  endDate        DateTime  @db.Date

  // Holiday specifics
  isRecurring    Boolean   @default(false)
  isPaid         Boolean   @default(true)
  isWorkday      Boolean   @default(false)

  color          String?   @default("#FF5733") // For calendar UI

  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@index([organizationId])
  @@index([calendarId])
  @@index([startDate])
  @@map("calendar_events")
}
```

### Calculator

Payroll calculation rules and configurations.

```prisma
model Calculator {
  id             String         @id @default(auto()) @map("_id") @db.ObjectId
  organizationId String         // Multi-tenancy support
  name           String
  description    String?
  type           CalculatorType @default(BASIC)

  // Tax and contribution settings
  taxRates       Json           // Tax brackets and rates
  sssRates       Json?          // SSS contribution rates
  philHealthRates Json?         // PhilHealth rates
  pagibigRates   Json?          // Pag-IBIG rates

  // Overtime and other calculation rules
  overtimeRates  Json?          // {regular: 1.25, restDay: 1.3, holiday: 2.0}
  nightDiffRate  Float?         @default(0.1) // 10% night differential

  isActive       Boolean        @default(true)
  isDefault      Boolean        @default(false)

  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  // Relations
  payrollPeriods PayrollPeriod[]

  @@unique([organizationId, name])
  @@index([organizationId])
  @@map("calculators")
}
```

### PayrollPeriod

Payroll processing periods.

```prisma
model PayrollPeriod {
  id             String        @id @default(auto()) @map("_id") @db.ObjectId
  organizationId String        // Multi-tenancy support
  name           String        // e.g., "January 2025 - 1st Half"
  startDate      DateTime      @db.Date
  endDate        DateTime      @db.Date
  payDate        DateTime      @db.Date

  calculator     Calculator?   @relation(fields: [calculatorId], references: [id])
  calculatorId   String?       @db.ObjectId

  status         PeriodStatus  @default(DRAFT)

  // Cutoff settings
  cutoffDay      Int?          // Day of month for cutoff

  notes          String?
  processedBy    String?       @db.ObjectId
  processedAt    DateTime?

  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  // Relations
  employeePayrolls EmployeePayroll[]

  @@unique([organizationId, startDate, endDate])
  @@index([organizationId])
  @@index([status])
  @@map("payroll_periods")
}
```

### BenefitType

Types of employee benefits available in the organization.

```prisma
model BenefitType {
  id             String           @id @default(auto()) @map("_id") @db.ObjectId
  organizationId String           // Multi-tenancy support
  name           String
  description    String?
  category       BenefitCategory  @default(OTHER)

  // Value settings
  fixedAmount    Float?
  percentage     Float?           // Percentage of basic salary

  // Eligibility
  requiresEmploymentType String[]  // e.g., ["REGULAR", "PROBATIONARY"]
  minServiceMonths Int?            // Minimum months of service required

  // Tax treatment
  isTaxable      Boolean          @default(false)

  isActive       Boolean          @default(true)
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  // Relations
  employeeBenefits EmployeeBenefit[]

  @@unique([organizationId, name])
  @@index([organizationId])
  @@map("benefit_types")
}
```

### LoanType

Types of loans available to employees.

```prisma
model LoanType {
  id             String        @id @default(auto()) @map("_id") @db.ObjectId
  organizationId String        // Multi-tenancy support
  name           String
  description    String?
  category       LoanCategory  @default(OTHER)

  // Loan settings
  maxAmount      Float?
  minAmount      Float?
  interestRate   Float         @default(0) // Annual interest rate
  maxTermMonths  Int           @default(12) // Maximum repayment period

  // Eligibility
  minServiceMonths Int?        // Minimum months of service required
  requiresEmploymentType String[] // e.g., ["REGULAR"]

  isActive       Boolean       @default(true)
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  // Relations
  employeeLoans  EmployeeLoan[]

  @@unique([organizationId, name])
  @@index([organizationId])
  @@map("loan_types")
}
```

### Template

Generic template entity for various document templates.

```prisma
model Template {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  organizationId String // Multi-tenancy support
  name        String
  description String?
  type        String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([organizationId])
}
```

---

## Junction Tables

### EmployeePayroll

Links employees to payroll periods with detailed payroll information.

```prisma
model EmployeePayroll {
  id               String        @id @default(auto()) @map("_id") @db.ObjectId
  organizationId   String        // Multi-tenancy support
  employee         Employee      @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  employeeId       String        @db.ObjectId
  payrollPeriod    PayrollPeriod @relation(fields: [payrollPeriodId], references: [id], onDelete: Cascade)
  payrollPeriodId  String        @db.ObjectId

  // Earnings
  basicPay         Float         @default(0)
  overtimePay      Float         @default(0)
  nightDiffPay     Float         @default(0)
  holidayPay       Float         @default(0)
  allowances       Float         @default(0)
  bonuses          Float         @default(0)

  // Deductions
  taxAmount        Float         @default(0)
  sssContribution  Float         @default(0)
  philHealthContribution Float   @default(0)
  pagibigContribution Float      @default(0)
  loanDeductions   Float         @default(0)
  otherDeductions  Float         @default(0)

  // Totals
  grossPay         Float         @default(0)
  totalDeductions  Float         @default(0)
  netPay           Float         @default(0)

  // Hours worked
  regularHours     Float         @default(0)
  overtimeHours    Float         @default(0)

  // Status
  isPaid           Boolean       @default(false)
  paidAt           DateTime?
  paymentMethod    String?       // BANK_TRANSFER, CASH, CHECK
  referenceNumber  String?

  notes            String?
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  @@unique([employeeId, payrollPeriodId])
  @@index([organizationId])
  @@index([payrollPeriodId])
  @@map("employee_payrolls")
}
```

### EmployeeBenefit

Links employees to their assigned benefits.

```prisma
model EmployeeBenefit {
  id             String      @id @default(auto()) @map("_id") @db.ObjectId
  organizationId String      // Multi-tenancy support
  employee       Employee    @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  employeeId     String      @db.ObjectId
  benefitType    BenefitType @relation(fields: [benefitTypeId], references: [id], onDelete: Cascade)
  benefitTypeId  String      @db.ObjectId

  // Benefit details
  amount         Float
  startDate      DateTime    @db.Date
  endDate        DateTime?   @db.Date

  // Status
  isActive       Boolean     @default(true)

  // Approval
  approvedBy     String?     @db.ObjectId
  approvedAt     DateTime?

  notes          String?
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  @@unique([employeeId, benefitTypeId])
  @@index([organizationId])
  @@index([employeeId])
  @@index([benefitTypeId])
  @@map("employee_benefits")
}
```

### EmployeeLoan

Links employees to their loans with repayment tracking.

```prisma
model EmployeeLoan {
  id               String      @id @default(auto()) @map("_id") @db.ObjectId
  organizationId   String      // Multi-tenancy support
  employee         Employee    @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  employeeId       String      @db.ObjectId
  loanType         LoanType    @relation(fields: [loanTypeId], references: [id])
  loanTypeId       String      @db.ObjectId

  // Loan details
  principalAmount  Float
  interestRate     Float       @default(0)
  totalAmount      Float       // Principal + Interest

  // Repayment
  termMonths       Int
  monthlyPayment   Float
  startDate        DateTime    @db.Date
  endDate          DateTime    @db.Date

  // Balance tracking
  amountPaid       Float       @default(0)
  balance          Float

  // Status
  status           LoanStatus  @default(PENDING)

  // Approval
  approvedBy       String?     @db.ObjectId
  approvedAt       DateTime?

  notes            String?
  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt

  @@index([organizationId])
  @@index([employeeId])
  @@index([loanTypeId])
  @@index([status])
  @@map("employee_loans")
}
```

---

## Entity Relationships

### Core Relationships

```
Department (1) ---> (*) Position
Department (1) ---> (*) Employee
Position (1) ---> (*) Employee
Schedule (1) ---> (*) Employee
Employee (1) ---> (*) Attendance
Employee (1) ---> (*) Request
Calendar (1) ---> (*) CalendarEvent
Calculator (1) ---> (*) PayrollPeriod
```

### Many-to-Many Relationships (via Junction Tables)

```
Employee (*) <---> (*) PayrollPeriod (via EmployeePayroll)
Employee (*) <---> (*) BenefitType (via EmployeeBenefit)
Employee (*) <---> (*) LoanType (via EmployeeLoan)
```

### Relationship Summary

| Parent Entity | Child Entity  | Relationship Type | Junction Table  |
| ------------- | ------------- | ----------------- | --------------- |
| Department    | Position      | One-to-Many       | -               |
| Department    | Employee      | One-to-Many       | -               |
| Position      | Employee      | One-to-Many       | -               |
| Schedule      | Employee      | One-to-Many       | -               |
| Employee      | Attendance    | One-to-Many       | -               |
| Employee      | Request       | One-to-Many       | -               |
| Calendar      | CalendarEvent | One-to-Many       | -               |
| Calculator    | PayrollPeriod | One-to-Many       | -               |
| Employee      | PayrollPeriod | Many-to-Many      | EmployeePayroll |
| Employee      | BenefitType   | Many-to-Many      | EmployeeBenefit |
| Employee      | LoanType      | Many-to-Many      | EmployeeLoan    |

---

## Notes

- **Multi-tenancy:** All models include `organizationId` for multi-tenant support
- **Database:** MongoDB with ObjectId primary keys
- **Soft Delete:** Most entities use `isActive` flag instead of hard deletion
- **Audit Trail:** All models include `createdAt` and `updatedAt` timestamps
- **Approval Workflow:** Request, EmployeeBenefit, and EmployeeLoan support approval tracking
- **Geolocation:** Attendance supports location tracking for remote check-ins
- **Hierarchical Data:** Department supports parent-child relationships

---

**End of Documentation**
