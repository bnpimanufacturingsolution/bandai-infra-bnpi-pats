# Employee Import Columns

This document lists all available columns for importing employee data.

## Required Columns (11 total)

| Column | Description | Example |
|--------|-------------|---------|
| `EMP_ID` | Unique employee ID | `EMP-001` |
| `NAME` | Full name (auto-parsed to first/middle/last) | `John Cruz Doe` or `Jane Smith` |
| `POSITION` | Position title or ID | `Software Engineer` |
| `LEVEL` | Job level | `Mid`, `Senior`, `Junior` |
| `DEPARTMENT` | Department name or ID | `Information Technology` |
| `TIN` | Tax Identification Number | `123-456-789-000` |
| `SSS` | SSS Number | `12-3456789-0` |
| `PHILHEALTH` | PhilHealth Number | `12-345678901-2` |
| `PAGIBIG` | Pag-IBIG Number | `1234-5678-9012` |
| `HIRE_DATE` | Hire date (YYYY-MM-DD) | `2025-01-01` |
| `BASIC_SALARY` | Basic salary amount | `50000` |

**Note:** Column order is important: POSITION, LEVEL, DEPARTMENT

### Name Parsing Examples
- `"John Doe"` → First: John, Last: Doe
- `"John Cruz Doe"` → First: John, Middle: Cruz, Last: Doe
- `"Maria Elena Santos Reyes"` → First: Maria, Middle: Elena Santos, Last: Reyes

## Optional Personal Information

| Column | Description | Example |
|--------|-------------|---------|
| `EMAIL` | Email address | `john.doe@company.com` |
| `PHONE` | Phone number | `09171234567` |
| `BIRTHDAY` | Date of birth (YYYY-MM-DD) | `1990-01-15` |
| `GENDER` | Gender | `male`, `female`, `other` |
| `NATIONALITY` | Nationality | `Filipino` |
| `PLACE_OF_BIRTH` | Place of birth | `Manila` |
| `STREET` | Street address | `123 Main Street` |
| `CITY` | City | `Manila` |
| `STATE` | State/Province | `Metro Manila` |
| `COUNTRY` | Country | `Philippines` |
| `POSTAL_CODE` | Postal code | `1000` |

## Optional Employment Information

| Column | Description | Example |
|--------|-------------|---------|
| `START_DATE` | Actual start date (YYYY-MM-DD) | `2025-01-02` |
| `WORK_LOCATION` | Work location | `ONSITE`, `REMOTE`, `HYBRID` |
| `REPORT_TO_EMP_ID` | Manager's employee ID | `EMP-MGR-001` |
| `CURRENCY` | Salary currency | `PHP` (default) |
| `PAY_FREQUENCY` | Pay frequency | `MONTHLY`, `SEMI_MONTHLY`, `WEEKLY` |

**Default Values:**
- `EMPLOYMENT_STATUS` defaults to `ACTIVE`
- `EMPLOYMENT_TYPE` defaults to `PROBATIONARY`

## Note on Schedule Assignment

**Schedule is NOT included in the import** - it should be assigned separately after employee creation (via onboarding or employee update).

## Enum Values

### EMPLOYMENT_STATUS
- `ACTIVE`
- `INACTIVE`
- `TERMINATED`
- `RESIGNED`
- `RETIRED`
- `ON_LEAVE`

### EMPLOYMENT_TYPE
- `REGULAR`
- `PROBATIONARY`
- `CONTRACTUAL`
- `PART_TIME`
- `CONSULTANT`
- `INTERN`

### WORK_LOCATION
- `ONSITE`
- `REMOTE`
- `HYBRID`

### PAY_FREQUENCY
- `DAILY`
- `WEEKLY`
- `BIWEEKLY`
- `SEMI_MONTHLY`
- `MONTHLY`
- `QUARTERLY`
- `ANNUALLY`

### GENDER
- `male`
- `female`
- `other`

## Sample CSV Format

### Minimal (Required Columns Only - 11 columns)
```csv
EMP_ID,NAME,POSITION,LEVEL,DEPARTMENT,TIN,SSS,PHILHEALTH,PAGIBIG,HIRE_DATE,BASIC_SALARY
EMP-001,John Doe,Software Engineer,Mid,Information Technology,123-456-789-000,12-3456789-0,12-345678901-2,1234-5678-9012,2025-01-01,50000
EMP-002,Jane Smith,HR Specialist,Junior,Human Resources,234-567-890-000,23-4567890-1,23-456789012-3,2345-6789-0123,2025-01-05,45000
```

### Full Example (With Optional Columns)
```csv
EMP_ID,NAME,POSITION,LEVEL,DEPARTMENT,TIN,SSS,PHILHEALTH,PAGIBIG,HIRE_DATE,BASIC_SALARY,EMAIL,PHONE,BIRTHDAY,GENDER
EMP-001,John Cruz Doe,Software Engineer,Mid,Information Technology,123-456-789-000,12-3456789-0,12-345678901-2,1234-5678-9012,2025-01-01,50000,john.doe@company.com,09171234567,1990-01-15,male
EMP-002,Jane Smith,HR Specialist,Junior,Human Resources,234-567-890-000,23-4567890-1,23-456789012-3,2345-6789-0123,2025-01-05,45000,jane.smith@company.com,,1992-05-20,female
EMP-003,Maria Santos,Accountant,Senior,Finance,345-678-901-000,34-5678901-2,34-567890123-4,3456-7890-1234,2025-01-10,55000,maria@company.com,09171111111,,female
```

## Usage

1. Load the import helper:
```typescript
import { EmployeeImportHelper } from './helper/employee-import.helper';

const helper = new EmployeeImportHelper(prisma, organizationId);
await helper.loadCaches();
```

2. Map CSV row to employee data:
```typescript
const row: EmployeeImportRow = {
  EMP_ID: 'EMP-001',
  NAME: 'John Cruz Doe',
  POSITION: 'Software Engineer',
  LEVEL: 'Mid',
  DEPARTMENT: 'Information Technology',
  TIN: '123-456-789-000',
  SSS: '12-3456789-0',
  PHILHEALTH: '12-345678901-2',
  PAGIBIG: '1234-5678-9012',
  HIRE_DATE: '2025-01-01',
  BASIC_SALARY: '50000',
  // Optional
  EMAIL: 'john.doe@company.com',
};

const mapped = helper.mapRowToEmployeeData(row);
```

3. Use mapped data to create employee (see employee seeder for full creation logic)
