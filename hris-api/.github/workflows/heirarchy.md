A database’s performance largely relies on it’s response to queries. There are primarily two functionalities of a database, to store data and when queried later, it should effectively present the data stored. In order to efficiently find the data one is looking for, we need a data structure, known as indexes.

📍What are Database Indexes?
In simple terms, index is a pointer to data in a table. The pointer helps the storage engines to locate data with a reduced latency. Any kind of index usually slows down writes, because the index also needs to be updated every time data is inserted. Therefore, it is an important trade-off in storage systems to identify the required indexes for a dataset.

There are various data structures that can work as indexes such as Bitcask, SSTables, LSM-trees etc. In this article, I will convey the basic understanding of B-trees as an indexing data structure. It is the most widely used indexing structure for database management systems.

Disk Index
Data is ultimately stored in physical disks. Any block on the disk can be accessed via the sector and the track number. In a more granular sense, a byte on a particular block can be located with the sector, track and the offset value.

Let’s take a very basic example to understand how a table is stored on a disk. For a block size of 512 bytes and a row size of 128 bytes, a total of (512/128), 4 rows can be stored in a block. Now, to store 100 rows, a total of 25 blocks on the disk will be utilized.

In a simple scenario, to look for a particular key in the database, the engine needs to access at most 25 blocks. In order to reduce this time, indexes are introduced. As defined earlier, an index is a pointer to data, therefore, we shall create another table, where each row will have the key and pointer to every value in the database. Considering the size of each row of the index table to be 16 bytes, it would take at most 4 disk blocks.

Press enter or click to view image in full size

Example of a primary index
Now, to lookup for a particular row, the database engine first needs to locate the key value in the index table (4 blocks) and then directly read the record (1 block) from the Data Table using the pointer value. This drastically reduces the access time from 25 blocks to (4+1) 5 blocks. The access time reduction comes with a tradeoff as every time a new key is inserted, the index table also needs to be updated.

Multi Level Indexing
With an increase in the number of records (let’s say 1000 rows), accessing the index table itself will require more disk blocks to be read. To further reduce this time, another level of indexing can be done. Another level of index can be created that stores the pointer to each block of the first-level index table.

In this example, we have created another index table which stores the block address (ID 1 to 32 and so on) of the keys from the first index table.

Press enter or click to view image in full size

Multi-Level Indexing
Since the multi-level index table requires only 2 blocks to get accessed, now the record can be accessed in (2 + 1 + 1) 4 block reads for a 1000 rows data table.

Write on Medium
This is the basic idea of how indexing works. As the scale of the dataset increases, more levels of indexing can be added. The diagram below explains how the intuition of self-managed indexing trees is introduced.

Intuition of B-Trees for Indexing
📍What are B Trees?
A B-tree is a data structure that provides sorted data and allows searches, sequential access, attachments and removals in sorted order. The B-tree is highly capable of storing systems that write large blocks of data. The B-tree simplifies the binary search tree by allowing nodes with more than two children.

B-Tree (Source: Dhanushka Madushan)
It is a search tree where the pointer to the left of a parent value holds child nodes smaller than the parent, whereas the pointer to the right of the parent node holds values greater than that of the parent node value. Inserting/Deleting any value in this tree will be performed while ensuring the search property of the tree remains consistent. They are self-balancing, meaning all leaf nodes (nodes at the bottom level) are at the same depth, ensuring efficient search across the entire structure.

B+ tree is an extension of the B tree. The difference in B+ tree and B tree is that in B tree the keys and records can be stored as internal as well as leaf nodes whereas in B+ trees, the records are stored as leaf nodes and the keys are stored only in internal nodes. The leaf nodes are also linearly connected in B+ trees to improve range-query performance.

B+ Tree | Source: Sudiksha
📍How B+ Indexing Works?
Let’s assume a table with multilevel indexing using B+ trees.

Press enter or click to view image in full size

B+ Tree Indexing
Now in-order to search for a key, example “302", the search traversal flows from the root index to the final data blocks as depicted in the diagram with green highlight. The complete search process was completed with the traversal of 3 disk blocks.

📍Conclusion
Wrapping up, B-trees are very ingrained in the architecture of databases and provide consistently good performance for many workloads by reducing the disk block access time multi-fold. Databases should be able to store, read, and alter data in an efficient manner. The B-tree structure makes it easy to insert and read data. In actual Database implementation, the database stores data using both B-tree and B+tree.

While the inclusion of B+ index improves the reading time of a database query, the drawbacks cannot be ignored. Creating and maintaining a B-Tree requires additional storage space compared to storing un-indexed data. Moreover, Inserting or updating data in a B-Tree can be slower than doing the same in un-indexed data because the tree structure needs to be maintained to ensure balance.

Therefore, database engineers must consider the tradeoff between the read and write performance and devise a suitable index for their tables.

this is the instruction of b tree indexing i want to apply in my system for the logic business

here is my the sample heirarchy

🌟 Sample Employee Hierarchy
1️⃣ IT Department
Role RoleLevel
CTO 1
Tech Lead / PM 2
Senior Developer 3
Developer 4
Intern / Junior Dev 5
2️⃣ Sales Department
Role RoleLevel
Head of Sales 1
Sales Manager 2
Senior Sales Exec 3
Sales Executive 4
Sales Intern 5
3️⃣ HR Department
Role RoleLevel
HR Director 1
HR Manager 2
HR Officer 3
HR Assistant 4
HR Intern 5
4️⃣ Marketing Department
Role RoleLevel
Marketing Director 1
Marketing Manager 2
Senior Marketer 3
Marketer 4
Marketing Intern 5

\_---------------------------------------------------------
Employee Data Migration Logic (6,000 Records)
📌 Objective

Migrate 6,000 employee records into the HR system while:

Maintaining department hierarchy

Executing top-to-bottom role structure

Avoiding performance issues

Ensuring scalability

Preventing duplicate entries

🏗 Migration Strategy Overview
Core Principles

Use batch processing

Use role hierarchy (roleLevel)

Use department grouping

Use database indexing

Avoid loading everything into memory

Use ordered execution per department

🏢 Department Hierarchy Logic

Each department follows:

Level 1 → Head / Director
Level 2 → Manager / Lead
Level 3 → Senior
Level 4 → Regular Staff
Level 5 → Intern / Junior

Example:

IT Department
Role Level
CTO 1
Tech Lead / PM 2
Senior Developer 3
Developer 4
Intern 5
⚙ Migration Execution Logic
Step 1: Create Index (IMPORTANT)

Before migration:

@@index([departmentId, roleLevel])

Run:

npx prisma db push

Step 2: Batch Processing Strategy

Do NOT insert 6,000 records at once.

Use chunking:

Batch Size: 500 or 1000

Pseudo logic:

Split employees into chunks
For each chunk:
Insert into database
Continue until complete

Step 3: Department-Based Execution Order

Migration Logic Flow:

Group employees by department
For each department:
Sort employees by roleLevel ascending
Insert batch by batch

Execution order example:

IT:
CTO
Tech Lead
Senior Dev
Dev
Intern

Sales:
Head
Manager
Staff

🚀 Performance Optimization Rules
1️⃣ Use Cursor Streaming

Avoid loading entire file into memory.

2️⃣ Disable Unnecessary Hooks During Migration

No email triggers

No notification triggers

No heavy validation logic

3️⃣ Use Transactions (Optional but Recommended)

If supported in your environment:

Start Transaction
Insert Batch
Commit

🔄 Optional: Background Job Processing

If migration is heavy:

Use queue worker system.

Flow:

Upload file
Create migration job
Worker processes in background
Return progress percentage

🧪 Validation Logic

Before insert:

Validate email format

Check required fields

Normalize department names

Normalize role names

Assign correct roleLevel

Example logic:

If role == "CTO" → roleLevel = 1
If role contains "Manager" → roleLevel = 2
If role contains "Senior" → roleLevel = 3
Else → roleLevel = 4 or 5

📊 Complexity Analysis

With proper indexing:

Lookup: O(log n)

Sorting: Optimized via index

Batch insert: Efficient

6,000 records → should complete in seconds

🔐 Safety Measures

Unique index on email

Log failed inserts

Track migration progress

Rollback on critical failure

📌 Final Recommended Architecture

Prisma Schema with compound index

CSV streaming reader

Batch insert (500–1000 per batch)

Department + roleLevel sorting

Optional background worker

Logging and error reporting

✅ Expected Result

Migration completes in seconds

Hierarchy preserved

System remains responsive

Scalable for 50k+ employees

🧠 Data Structure Design

---

Employee Model

// Embedded schedule copied from Schedule template
type EmployeeSchedule {
scheduleCode String // Reference to original schedule template code
scheduleName String // Name of the schedule
startDate DateTime // When this schedule starts for the employee
endDate DateTime? // When it ends (null = permanent)
shifts Shift[] // Copy of schedule shifts
}

enum EmploymentStatus {
ACTIVE // Currently working
RESIGNATION_REQUESTED // Resignation submitted, pending approval
SERVING_NOTICE // Exit clearance done, working final days
OFFBOARDING // Approved resignation, offboarding in progress
ONBOARDING // New hire, onboarding in progress
INACTIVE // Temporarily inactive
TERMINATED // Terminated by company
RESIGNED // Completed resignation process
FORMER_EMPLOYEE // No longer with company (resigned/terminated)
RETIRED // Retired
ON_LEAVE // On leave
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
SEMI_MONTHLY
MONTHLY
QUARTERLY
ANNUALLY
}

enum WorkLocation {
ONSITE
REMOTE
HYBRID
}

enum LeaveType {
VACATION
SICK
PERSONAL
MATERNITY
PATERNITY
BEREAVEMENT
UNPAID
COMPENSATORY
}

type LeaveBalanceDetail {
leaveType LeaveType
totalEntitled Float
used Float
pending Float
available Float
carriedOver Float?
maxCarryOver Float?
periodStart DateTime
periodEnd DateTime
}

type EmployeeDocument {
name String
type String // Document type (e.g., passport, driver_license, sss_id, etc.)
number String // Document number/identifier
issueDate DateTime // Date when document was issued
expiryDate DateTime? // Expiry date (optional, for documents that expire)
fileUrl String? // URL to uploaded file (PDF/image)
ext String?
}

type Employer {
name String
tin String
rdoCode String
branchCode String
address String
isVerified Boolean @default(false)
metadata Json?
}

type EmploymentHistory {
employer Employer
position String
startDate DateTime
endDate DateTime? // Null if currently employed there
salary Float?
reasonForLeaving String?
responsibilities String? // Job description/duties
supervisorName String?
supervisorContact String? // Phone/email
location String? // City/country
isVerified Boolean @default(false)

metadata Json?
}

model Employee {
id String @id @default(auto()) @map("\_id") @db.ObjectId
organizationId String
employeeId String

userId String?
role String
// Employment Details
employmentHireDate DateTime?
employmentStartDate DateTime? // Actual start date when employee began working
employmentTerminationDate DateTime?
employmentStatus EmploymentStatus @default(ACTIVE)
employmentType EmploymentType @default(PROBATIONARY)
employer Employer?

probationEndDate DateTime?

// Position & Department
department Department @relation(fields: [departmentId], references: [id], onDelete: NoAction, onUpdate: NoAction)
departmentId String @db.ObjectId

position Position @relation(fields: [positionId], references: [id])
positionId String @db.ObjectId

// Level
level Level? @relation(fields: [levelId], references: [id], onDelete: SetNull, onUpdate: Cascade)
levelId String? @db.ObjectId

// Reporting Structure
reportTo Employee? @relation("EmployeeReportsTo", fields: [reportToId], references: [id], onDelete: NoAction, onUpdate: NoAction)
reportToId String? @db.ObjectId
directReports Employee[] @relation("EmployeeReportsTo") //employees that reports to this employee

// Work Schedule - Embedded schedule (copied from Schedule template)
schedule EmployeeSchedule? // Current active schedule for the employee

workLocation WorkLocation @default(ONSITE)
// Leave Balances (stored as embedded array)
leaveBalances LeaveBalanceDetail[]
leaveBalancesLastUpdated DateTime?

// Compensation
basicSalary Float
currency String @default("PHP")
payFrequency PayFrequency @default(SEMI_MONTHLY)

deviceEmpId String?

// Soft delete & timestamps
isTour Boolean @default(false)
isDeleted Boolean @default(false)
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
isManager Boolean @default(false)
metadata Json?

// Relations
person Person? @relation(fields: [personId], references: [id], onDelete: NoAction, onUpdate: NoAction)
personId String @unique @db.ObjectId

device Device? @relation(fields: [deviceId], references: [id], onDelete: NoAction, onUpdate: NoAction)
deviceId String? @db.ObjectId

attendances Attendance[]
timesheets Timesheet[]
requests Request[] @relation("RequestRequester") // Requests this employee submitted
eligibilityRequests Request[] @relation("RequestTargetEmployee") // Requests where this employee is the subject
stepExecutions RequestStepExecution[] // Workflow steps assigned to this employee

employeePayrolls EmployeePayroll[]
employeeBenefits EmployeeBenefit[]
employeeLoans EmployeeLoan[]
documents EmployeeDocument[]
employmentHistory EmploymentHistory[]
managedDepartments Department[] @relation("DepartmentManager")
assignedApplicants Applicant[] @relation("ApplicantAssignedHR") // Applicants assigned to this HR employee

calendarItem CalendarItem[]

boardingProcesses BoardingProcess[] @relation("EmployeeBoardingProcesses")
notificationsCreated Notification[] @relation("NotificationSource") // Notifications sourced/created by this employee

// Termination relations
terminationsAsEmployee Termination[] @relation("EmployeeTerminations") // Terminations where this employee is the terminated one
terminationsInitiated Termination[] @relation("TerminationInitiator") // Terminations this employee initiated
terminationsAsHRDirector Termination[] @relation("HRDirectorApprovals") // Terminations this employee approved as HR Director
terminationsAsLegal Termination[] @relation("LegalApprovals") // Terminations this employee approved as Legal

@@unique([organizationId, employeeId])
@@index([organizationId])
@@index([userId]) // safe for nulls
@@index([role])
@@index([levelId]) // safe for nulls
@@index([reportToId]) // fast lookup for employees reporting to a manager
@@map("employees")
}

---

Position Model
model Position {
id String @id @default(auto()) @map("\_id") @db.ObjectId
organizationId String
title String
code String
description String?
departmentId String? @db.ObjectId
minSalary Float?
maxSalary Float?
department Department? @relation(fields: [departmentId], references: [id], onDelete: NoAction, onUpdate: NoAction)
isActive Boolean @default(true)
isDeleted Boolean @default(false)
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
employees Employee[]
levels PositionLevel[]
applicants Applicant[]
jobs Job[]
isOffer Boolean @default(false)

@@unique([organizationId, code])
@@index([organizationId])
@@map("positions")
}

model PositionLevel {
id String @id @default(auto()) @map("\_id") @db.ObjectId
positionId String @db.ObjectId
levelId String @db.ObjectId
position Position @relation(fields: [positionId], references: [id], onDelete: Cascade, onUpdate: Cascade)
level Level @relation(fields: [levelId], references: [id], onDelete: Cascade, onUpdate: Cascade)
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt

@@unique([positionId, levelId])
@@index([positionId])
@@index([levelId])
@@map("position_levels")
}

---

level Model
model Level {
id String @id @default(auto()) @map("\_id") @db.ObjectId
organizationId String
name String
rank Int? // Numeric rank for ordering (e.g., 1, 2, 3)
description String?

isActive Boolean @default(true)
isDeleted Boolean @default(false)
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt

// Relations
positionLevels PositionLevel[]
employees Employee[]
jobs Job[]

@@unique([organizationId, name])
@@index([organizationId])
@@index([rank])
@@map("levels")
}

---

Department Model
model Department {
id String @id @default(auto()) @map("\_id") @db.ObjectId
organizationId String
name String
code String
description String?

// Manager: Optional, one-to-one
managerId String? @db.ObjectId
manager Employee? @relation("DepartmentManager", fields: [managerId], references: [id], onDelete: SetNull, onUpdate: Cascade)

parentId String? @db.ObjectId
parent Department? @relation("DepartmentHierarchy", fields: [parentId], references: [id], onDelete: NoAction, onUpdate: NoAction)
children Department[] @relation("DepartmentHierarchy")
boardings BoardingProcess[]
isActive Boolean @default(true)
isDefault Boolean @default(false)
isDeleted Boolean @default(false)
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt

positions Position[]
employees Employee[]
applicants Applicant[]

@@unique([organizationId, name])
@@unique([organizationId, code])
@@index([organizationId])
@@map("departments")
}
