# Employee Import API

## Endpoint

```
POST /api/employee/import
```

## Description

Bulk import employees from CSV data. This endpoint creates employees with Person, Employment, and Schedule assignments following the same flow as individual employee creation.

## Headers

```
Authorization: Bearer <token>
Content-Type: application/json
```

## Request Body

```json
{
  "rows": [
    {
      "EMP_ID": "EMP-TEST-001",
      "NAME": "Juan Dela Cruz",
      "POSITION": "Software Engineer",
      "LEVEL": "Mid",
      "DEPARTMENT": "Information Technology",
      "TIN": "123-456-789-001",
      "SSS": "12-3456789-1",
      "PHILHEALTH": "12-345678901-3",
      "PAGIBIG": "1234-5678-9013",
      "HIRE_DATE": "2025-01-15",
      "BASIC_SALARY": "50000",
      "EMAIL": "juan.delacruz@company.com",
      "PHONE": "09171234567",
      "BIRTHDAY": "1990-05-10",
      "GENDER": "male"
    }
  ],
  "scheduleId": "507f1f77bcf86cd799439011",
  "roleId": "69250b864670a429f3429a30"
}
```

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `rows` | Array | Array of employee data objects |
| `scheduleId` | String | Default schedule ID (MongoDB ObjectId) |
| `roleId` | String | Default role ID for user accounts (MongoDB ObjectId) |

## Row Object Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `EMP_ID` | String | Unique employee ID |
| `NAME` | String | Full name (parsed to first/middle/last) |
| `POSITION` | String | Position title (must exist) |
| `LEVEL` | String | Job level (must exist) |
| `DEPARTMENT` | String | Department name (must exist) |
| `TIN` | String | Tax Identification Number |
| `SSS` | String | SSS Number |
| `PHILHEALTH` | String | PhilHealth Number |
| `PAGIBIG` | String | Pag-IBIG Number |
| `HIRE_DATE` | String | Hire date (YYYY-MM-DD) |
| `BASIC_SALARY` | String | Basic salary amount |

## Row Object Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `EMAIL` | String | Email address |
| `PHONE` | String | Phone number |
| `BIRTHDAY` | String | Date of birth (YYYY-MM-DD) |
| `GENDER` | String | Gender (male, female, other) |
| `NATIONALITY` | String | Nationality |
| `PLACE_OF_BIRTH` | String | Place of birth |
| `STREET` | String | Street address |
| `CITY` | String | City |
| `STATE` | String | State/Province |
| `COUNTRY` | String | Country |
| `POSTAL_CODE` | String | Postal code |

## Response

### Success (200)

```json
{
  "success": true,
  "message": "Employee import completed: 5 success, 0 failed",
  "data": {
    "summary": {
      "total": 5,
      "success": 5,
      "failed": 0
    },
    "results": [
      {
        "success": true,
        "employeeId": "EMP-TEST-001",
        "employeeDbId": "507f1f77bcf86cd799439011",
        "userId": "691ab078401fbe2c2b5f5a51",
        "email": "juan.delacruz@company.com"
      }
    ]
  },
  "statusCode": 200
}
```

### Error (400, 401, 500)

```json
{
  "success": false,
  "message": "Error message",
  "statusCode": 400
}
```

## Example: CSV to JSON Conversion

If you have a flat employee-import CSV like this:

```csv
EMP_ID,NAME,POSITION,LEVEL,DEPARTMENT,TIN,SSS,PHILHEALTH,PAGIBIG,HIRE_DATE,BASIC_SALARY,EMAIL,PHONE,BIRTHDAY,GENDER
EMP-TEST-001,Juan Dela Cruz,Software Engineer,Mid,Information Technology,123-456-789-001,12-3456789-1,12-345678901-3,1234-5678-9013,2025-01-15,50000,juan.delacruz@company.com,09171234567,1990-05-10,male
```

Convert it to JSON:

```javascript
const Papa = require('papaparse');
const fs = require('fs');

const csvFile = fs.readFileSync('employee-import-flat.csv', 'utf8');
const parsed = Papa.parse(csvFile, { header: true, skipEmptyLines: true });
const rows = parsed.data;

// Make API request
fetch('/api/employee/import', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    rows: rows,
    scheduleId: '507f1f77bcf86cd799439011', // Your default schedule ID
    roleId: '69250b864670a429f3429a30'      // Your default role ID (e.g., hris-employee)
  })
});
```

## Default Values

The import automatically sets these defaults:

- `EMPLOYMENT_STATUS`: `ACTIVE`
- `EMPLOYMENT_TYPE`: `PROBATIONARY`
- `WORK_LOCATION`: `ONSITE`
- `CURRENCY`: `PHP`
- `PAY_FREQUENCY`: `MONTHLY`
- `NATIONALITY`: Uses value from CSV or leaves blank

## What Gets Created

For each employee row, the import creates:

1. **Person** record with:
   - Personal info (parsed name, birthday, gender, etc.)
   - Contact info (email, phone, address)

2. **Employee** record with:
   - Employment details (hire date, salary, department, position, level)
   - Government IDs (TIN, SSS, PhilHealth, Pag-IBIG)
   - Employer information (company details)

3. **User** account (if email provided):
   - Email login
   - Default password: `Welcome123!`
   - Assigned role ID

4. **EmployeeSchedule** assignment:
   - Links employee to the default schedule
   - Effective from hire date
   - Marked as default schedule

## Error Handling

If an employee fails to import:
- The result will have `success: false`
- The `error` field will contain the error message
- Other employees will continue to import
- Final response includes both successful and failed imports

## Notes

- Position, Level, and Department must exist in the system before import
- Employee IDs must be unique
- Email addresses (if provided) must be unique
- If user creation fails (e.g., email already exists), the employee is still created but without a user account
- Schedule assignment uses the provided `scheduleId` for all employees
