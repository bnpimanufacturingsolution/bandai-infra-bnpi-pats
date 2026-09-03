# Employee Migration PDF Review

This review compares the employee migration requirements shown in `employee-fields.pdf`
against the current employee migration inputs:

- `docs/csv/sample-employees.csv`
- `docs/csv/sample-persons.csv`

Important note: this review reflects the older enterprise-shaped employee sample that existed
when the document was written. `docs/csv/sample-employees.csv` has since been repurposed as a
cleaned client-template sample, so the field-by-field findings below should be read as legacy
analysis rather than the current CSV contract.

It also checks whether the current position reference setup is sufficient for this canonical
position list that the migration must support:

- Deputy General Manager
- Senior Engineer
- Senior Supervisor
- Senior Manager
- Assistant Manager
- Manager
- Supervisor
- Senior Staff
- Junior Supervisor
- Staff
- Engineer
- Senior Operator
- Staff Engineer
- Operator
- Junior Engineer

The PDF appears to be a rendered field-mapping report and aligns with the structured source in
`reports/employee-field-matches-v2.csv`. Supporting reference CSVs were checked only where they
affect migration fit, such as department, position, level, and reporting-line references.

## Field Comparison

| PDF field or requirement | Current CSV field | Match status | Recommended action | Notes |
| --- | --- | --- | --- | --- |
| Employee ID | `sample-employees.csv.employeeId` and `sample-persons.csv.employeeId` | Matches | Keep as the primary migration key. | Present in both files and already suitable for linking employee and person rows. |
| First name | `sample-persons.csv.personalInfo.firstName` | Matches | Keep current mapping. | Stored inside `personalInfo` JSON rather than a flat column. |
| Middle name | `sample-persons.csv.personalInfo.middleName` | Matches | Keep current mapping; allow blank when valid. | Compatible with the PDF requirement. |
| Last name | `sample-persons.csv.personalInfo.lastName` | Matches | Keep current mapping. | Stored inside `personalInfo` JSON. |
| Full employee name | Derived from `personalInfo.firstName`, `middleName`, `lastName` | Needs Adjustment | Derive full name during migration only if needed for audit/reference. | Current CSV is better than the PDF source because the name is already split. |
| Date of birth / Birthday | `sample-persons.csv.personalInfo.birthDate` | Matches | Keep current mapping. | Present and suitable as identity data. |
| Gender | Not present | Missing | Add a source field or confirm exclusion policy. | No gender field exists in `sample-employees.csv` or `sample-persons.csv`. |
| Nationality | Not present | Missing | Add a source field or confirm exclusion policy. | Not currently available in the employee/person CSV inputs. |
| Email | `sample-persons.csv.contactInfo.email` | Matches | Keep current mapping. | Present inside `contactInfo` JSON. |
| Phone | `sample-persons.csv.contactInfo.phone` | Similar | Normalize to agreed target shape during migration. | Present as a single `phone` value, while the report references `phones`. |
| Registered address | Not present | Missing | Add address data or confirm it is out of scope. | The PDF/report expects address data, but the current sample does not carry it. |
| Postal / zip code | Not present | Missing | Add postal code data or confirm it is out of scope. | No current field in the employee/person sample CSVs. |
| Department / Division / Section | `sample-employees.csv.departmentCode` | Needs Adjustment | Map code to canonical department record during migration. | The current CSV uses canonical codes (`HR`, `ENG`) instead of source labels like Division/Section. |
| Position | `sample-employees.csv.positionCode` | Needs Adjustment | Map code to canonical position record during migration. | Current CSV uses canonical position codes (`HR-MGR`, `ENG-MGR`, `ENG-DEV`). |
| Level / grade / rank | `sample-employees.csv.levelName` | Matches | Keep current mapping. | Compatible with the current sample because level is already explicit. |
| Reports-to employee | Not in employee/person CSVs; available in `sample-reporting_lines.csv` | Missing | Keep as a separate supporting migration input or add it to the main migration package. | This is not in the two main CSVs, but it does exist as a dedicated reference CSV. |
| Hire date | `sample-employees.csv.employmentHireDate` | Matches | Keep current mapping. | Already formatted as ISO datetime. |
| Employment start date | `sample-employees.csv.employmentStartDate` | Matches | Keep current mapping. | Already explicit in the employee CSV. |
| Employment status | `sample-employees.csv.employmentStatus` | Needs Adjustment | Keep the field, but confirm source-to-status mapping rules. | Current CSV already has explicit status, while the PDF/report suggests status may be derived from activity/resignation markers. |
| Resignation / termination date | Not present | Missing | Add if former employees are in scope, or confirm current population is active-only. | No termination date field exists in the sample employee CSV. |
| Employment type | `sample-employees.csv.employmentType` | Matches | Keep current mapping. | Already uses supported enum-style values such as `REGULAR`. |
| Workforce source | Indirect only via `sample-employees.csv.agencyCode` | Similar | Define mapping rule: blank `agencyCode` = direct, populated `agencyCode` = agency, or add explicit field. | The explicit workforce source field is missing, but `agencyCode` gives partial signal. |
| Work location | `sample-employees.csv.workLocation` | Matches | Keep current mapping. | Present and already aligned with migration use. |
| Default schedule / shift | Not present | Missing | Add a schedule reference or confirm fallback/default schedule policy. | Required if attendance and payroll setup depend on per-employee default scheduling. |
| Basic salary | `sample-employees.csv.basicSalary` | Matches | Keep current mapping. | Present and numeric. |
| Pay frequency | `sample-employees.csv.payFrequency` | Matches | Keep current mapping. | Present and aligned with current migration enums. |
| Currency | `sample-employees.csv.currency` | Matches | Keep current mapping. | Present and already explicit. |
| Biometric / RFID ID | `sample-employees.csv.deviceEmpId` | Matches | Keep current mapping. | Suitable for device/timekeeping reference. |
| TIN | `sample-persons.csv.identification.tin` | Needs Adjustment | Map into the final statutory/TIN target explicitly. | Present, but stored in a generic `identification` JSON object rather than a dedicated document/statutory column. |
| SSS number | `sample-persons.csv.identification.sss` | Needs Adjustment | Map into the final statutory/SSS target explicitly. | Present in the sample, but still needs extraction/mapping from JSON. |
| PhilHealth number | Not present | Missing | Add the field or confirm deferred capture. | Not available in the current employee/person sample CSVs. |
| Pag-IBIG MID | Not present | Missing | Add the field or confirm deferred capture. | Not available in the current employee/person sample CSVs. |
| Previous employer | Not present | Missing | Add structured employment-history input if this is required for tax migration. | The current sample does not include prior-employment history. |
| Previous employment period | Not present | Missing | Add structured employment-history dates if required. | Not currently represented in the sample input. |
| Dependents / number of dependents | Not present | Missing | Add dependent data only if the migration truly requires it. | No dependent count or child/dependent records in the employee/person sample CSVs. |
| Civil status | Not present | Missing | Add it explicitly or confirm it is not required. | The PDF/report flags workbook `Status` as likely civil status, but the current sample has no civil-status field. |
| Remarks | Not present | Not Required | Ignore unless the client wants remarks retained as migration notes. | The PDF/report did not identify a concrete HRIS target for this. |
| S.N. | Not present | Not Required | Ignore. | Appears to be only a workbook serial/row helper, not employee master data. |

## Position Reference Fit

Current reference coverage is very limited:

- `sample-positions.csv` contains only `HR Manager`, `Engineering Manager`, and `Software Engineer`
- `sample-position_levels.csv` maps only `HR-MGR -> Manager`, `ENG-MGR -> Manager`, and `ENG-DEV -> Staff`
- `sample-levels.csv` contains only `Manager` and `Staff`

| Provided position | Current reference match | Level mapping fit | Status | Recommended action |
| --- | --- | --- | --- | --- |
| Deputy General Manager | No exact match | No supporting level | Missing | Add as a new canonical position and define its level explicitly before migration. |
| Senior Engineer | No exact match | No supporting `Senior` level | Missing | Add the position and add/confirm a `Senior`-type level or equivalent mapping rule. |
| Senior Supervisor | No exact match | No supporting `Senior` or `Supervisor` level | Missing | Add the position and define where it sits relative to Manager, Supervisor, and Staff. |
| Senior Manager | No exact match | Current `Manager` level is too broad | Needs Adjustment | Decide whether `Senior Manager` is its own level or a title normalized into an existing management band. |
| Assistant Manager | No exact match | No explicit assistant-management level | Missing | Add the position and define how assistant-manager hierarchy maps to levels. |
| Manager | Similar to `HR Manager` / `Engineering Manager` | Partial | Similar | Clarify whether bare `Manager` is a canonical generic title or whether managers must always be department-specific. |
| Supervisor | No exact match | No supporting supervisor level | Missing | Add the position and define its level band. |
| Senior Staff | No exact match | Current `Staff` level is too broad | Needs Adjustment | Confirm whether `Senior Staff` should be a distinct level or a title variant mapped to `Staff`. |
| Junior Supervisor | No exact match | No supporting `Junior`/`Supervisor` level | Missing | Add the position and define whether it is below Supervisor but above Staff. |
| Staff | Similar to existing `Staff` level only | No exact position row | Needs Adjustment | Add a canonical `Staff` position only if this is meant to be a reusable title and not just a level. |
| Engineer | Similar to `Software Engineer` | Partial | Similar | Clarify whether `Engineer` is a generic canonical title or whether discipline-specific titles are required. |
| Senior Operator | No exact match | No supporting `Senior` or `Operator` level | Missing | Add the position and define hierarchy. |
| Staff Engineer | No exact match | No supporting `Staff Engineer` mapping | Missing | Add the position and clarify whether it maps to `Staff`, `Engineer`, or a separate band. |
| Operator | No exact match | No supporting operator level | Missing | Add the position and define the target level. |
| Junior Engineer | No exact match | No supporting `Junior` level | Missing | Add the position and add/confirm a junior engineering level. |

## Position Conclusion

The current position reference CSVs are **not suitable** for the provided canonical position list.
They are too limited in both title coverage and level hierarchy.

The main gaps are:

- most canonical position titles do not exist in `sample-positions.csv`
- the current level set only contains `Manager` and `Staff`
- the current `sample-position_levels.csv` does not cover senior, junior, supervisor, operator,
  assistant-manager, or deputy-manager style hierarchy

Before migration, the client should confirm one of these approaches:

1. Add all canonical position titles directly to `sample-positions.csv` and provide approved
   `sample-position_levels.csv` mappings for each one.
2. Approve a normalization rule where titles like `Senior Engineer`, `Junior Engineer`, and
   `Senior Staff` map into a smaller approved canonical title-and-level model.
3. Confirm whether generic titles like `Manager`, `Staff`, and `Engineer` are real positions or
   only shorthand labels for broader department-specific roles.

## Final Conclusion

The current CSV set is **partially suitable** for employee data migration. It is strong for the
core employee master data already modeled in the new migration shape:

- employee ID
- legal name parts
- date of birth
- email and phone
- hire/start dates
- department, position, level
- employment type, status, work location
- salary, currency, pay frequency
- biometric/device ID

However, the current **position reference setup is not yet suitable** for the canonical position
list you provided.

The main adjustments needed are:

- use both `sample-employees.csv` and `sample-persons.csv` together for employee migration
- map `departmentCode` and `positionCode` through canonical reference tables
- extract `TIN` and `SSS` from `identification` JSON into the final statutory target
- define how `agencyCode` maps to workforce source
- confirm how employment status should be interpreted when the source workbook uses derived activity markers
- decide whether phone should remain single-value or normalize into the final contact structure
- expand or normalize the position reference set so the provided canonical titles are supported
- expand the level hierarchy or approve a title-to-level normalization rule

The main missing fields are:

- gender
- nationality
- registered address
- postal / zip code
- resignation / termination date
- explicit workforce source
- default schedule / shift
- PhilHealth number
- Pag-IBIG number
- previous employer
- previous employment period
- dependents
- civil status
- most of the provided canonical position titles
- supporting level definitions for `Senior`, `Junior`, `Supervisor`, `Operator`, `Assistant Manager`, and `Deputy General Manager` style hierarchy

Items that should be clarified before migration:

1. Whether address, nationality, gender, and civil status are required for this migration wave or can be deferred.
2. Whether employee reporting lines should stay in a separate supporting CSV (`sample-reporting_lines.csv`) or be treated as part of the employee migration package.
3. Whether `agencyCode` is enough to derive workforce source, or whether an explicit field is required.
4. Whether prior-employment and tax-history data are mandatory for the migration or only optional for later payroll/tax setup.
5. Whether statutory IDs beyond TIN and SSS must be present before go-live.
6. Whether a per-employee default schedule is mandatory, or whether the migration may rely on department/template defaults.
7. Whether the provided canonical position list must be loaded exactly as-is, or whether approved normalization into a smaller canonical set is allowed.
8. Whether titles such as `Manager`, `Engineer`, and `Staff` are true standalone positions or shorthand that should map to department-specific titles.
9. What exact level hierarchy should be used for `Deputy`, `Senior`, `Junior`, `Supervisor`, `Operator`, and `Assistant Manager` variants.

## Bottom Line

The current employee migration CSV inputs are **usable for a first-pass employee master migration**,
but they are **not fully complete** for every requirement shown in the PDF/report, and the current
position reference CSVs are **not ready** for the canonical position list you provided. The migration
can move forward safely only if:

- the missing employee fields are either supplied or explicitly approved as out of scope
- and the position/title hierarchy is clarified, then reflected in positions, levels, and
  position-level mappings before import
