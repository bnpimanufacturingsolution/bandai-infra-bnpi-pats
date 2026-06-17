# Employee Import - Column Concatenation Guide

## Fields That Can Be Concatenated

### 1. NAME (Highly Recommended)
**Current:**
```
FIRST_NAME, MIDDLE_NAME, LAST_NAME
```

**Concatenated:**
```
NAME
```

**Examples:**
- `"John Doe"` → First: John, Last: Doe
- `"John Cruz Doe"` → First: John, Middle: Cruz, Last: Doe
- `"Maria Santos"` → First: Maria, Last: Santos

**Parsing Logic:**
- 2 parts = First + Last
- 3+ parts = First + Middle(s) + Last

---

### 2. ADDRESS (Recommended)
**Current:**
```
STREET, CITY, STATE, COUNTRY, POSTAL_CODE
```

**Concatenated:**
```
ADDRESS
```

**Format:** `Street, City, State, Country PostalCode`

**Examples:**
- `"123 Main St, Manila, Metro Manila, Philippines 1000"`
- `"456 Business Ave, Quezon City, NCR, Philippines 1100"`

**Parsing Logic:**
- Split by comma
- Last part extracts postal code if numeric

---

### 3. SCHEDULE (Optional - Use Pattern)
**Current:**
```
SCHEDULE (name only)
SCHEDULE_EFFECTIVE_DATE
```

**Concatenated:**
```
SCHEDULE (pattern or name)
```

**Effective date defaults to HIRE_DATE**

**Pattern Examples:**
- `"Standard 9-6"` (existing schedule name)
- `"MON-FRI:09:00-18:00|SAT-SUN:REST"`
- `"MON-FRI:08:00-12:00,13:00-17:00|SAT-SUN:REST"` (with lunch)

---

## Recommended Column Structure

### Minimal (6 columns):
```csv
EMP_ID,NAME,POSITION,DEPARTMENT,HIRE_DATE,BASIC_SALARY
```

### Standard (11 columns):
```csv
EMP_ID,NAME,EMAIL,PHONE,POSITION,LEVEL,DEPARTMENT,HIRE_DATE,BASIC_SALARY,TIN,SCHEDULE
```

### Full (15 columns):
```csv
EMP_ID,NAME,EMAIL,PHONE,ADDRESS,BIRTHDAY,GENDER,POSITION,LEVEL,DEPARTMENT,HIRE_DATE,EMPLOYMENT_STATUS,EMPLOYMENT_TYPE,BASIC_SALARY,TIN,SCHEDULE
```

---

## Fields to Remove/Default

These fields can be removed and set to defaults:

| Field | Default | Reason |
|-------|---------|--------|
| `NATIONALITY` | `Filipino` | Most employees are Filipino |
| `PLACE_OF_BIRTH` | Not critical | Can be added later via edit |
| `CURRENCY` | `PHP` | Organization default |
| `PAY_FREQUENCY` | `MONTHLY` | Organization default |
| `WORK_LOCATION` | `ONSITE` | Organization default |
| `START_DATE` | Same as HIRE_DATE | Usually same |
| `SCHEDULE_EFFECTIVE_DATE` | Same as HIRE_DATE | Usually same |

---

## Comparison: Before vs After

### Before (25 columns):
```
EMP_ID, FIRST_NAME, MIDDLE_NAME, LAST_NAME, EMAIL, PHONE,
BIRTHDAY, GENDER, NATIONALITY, PLACE_OF_BIRTH,
STREET, CITY, STATE, COUNTRY, POSTAL_CODE,
POSITION, LEVEL, DEPARTMENT, HIRE_DATE, START_DATE,
EMPLOYMENT_STATUS, EMPLOYMENT_TYPE, WORK_LOCATION,
BASIC_SALARY, CURRENCY, PAY_FREQUENCY, TIN,
SCHEDULE, SCHEDULE_EFFECTIVE_DATE, REPORT_TO_EMP_ID
```

### After (11 columns):
```
EMP_ID, NAME, EMAIL, PHONE, ADDRESS, BIRTHDAY, GENDER,
POSITION, LEVEL, DEPARTMENT, HIRE_DATE, EMPLOYMENT_STATUS,
EMPLOYMENT_TYPE, BASIC_SALARY, TIN, SCHEDULE
```

**Reduction: 25 → 11 columns (56% fewer columns)**

---

## Sample CSV

```csv
EMP_ID,NAME,EMAIL,PHONE,ADDRESS,BIRTHDAY,GENDER,POSITION,LEVEL,DEPARTMENT,HIRE_DATE,BASIC_SALARY,TIN,SCHEDULE
EMP-001,John Cruz Doe,john@company.com,09171234567,"123 Main St, Manila, Metro Manila, Philippines 1000",1990-01-15,male,Software Engineer,Mid,Information Technology,2025-01-01,50000,123-456-789-000,MON-FRI:09:00-18:00|SAT-SUN:REST
EMP-002,Jane Smith,jane@company.com,09179876543,,1992-05-20,female,HR Specialist,Junior,Human Resources,2025-01-05,45000,,Standard 9-6
EMP-003,Maria Santos,maria@company.com,09171111111,"456 Business Ave, Quezon City, NCR, Philippines 1100",1988-03-10,female,Accountant,Senior,Finance,2025-01-10,60000,234-567-890-000,MON-FRI:08:00-12:00,13:00-17:00|SAT-SUN:REST
```
