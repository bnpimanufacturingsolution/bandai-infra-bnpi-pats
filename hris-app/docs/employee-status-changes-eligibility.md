# Employee Status Changes - Eligibility Criteria

This document outlines the criteria and triggers that determine when an employee becomes a candidate for different status changes in the HRIS system.

## Overview

Employees are automatically flagged as candidates for status changes based on their employment data, attendance records, performance metrics, and other relevant factors. These candidates appear in the **Employee Status Changes** page where HR can review and create Personnel Action Requests.

---

## FOR PROMOTION

### Criteria

Employees become eligible for promotion when they meet the following requirements:

#### Employment Status
- `employmentType === "REGULAR"` (must be a regular employee, not probationary)
- Currently active (`employmentStatus === "ACTIVE"`)

#### Tenure Requirements
- **Minimum tenure**: 12 months in current position
- Calculated from `employmentStartDate` or `employmentHireDate`

#### Attendance Metrics (Last 6-12 months)
- **Attendance rate**: ≥ 95%
  - Formula: `(Total Present Days / Total Working Days) × 100`
- **Late occurrences**: ≤ 5% of working days
  - Count of attendance records where `status === "LATE"`
- **Absences**: < 3 unexcused absences in last 6 months
  - Absences without approved leave requests
- **No major violations**: No "No Call, No Show" incidents

#### Performance Indicators
- Consistently high performance ratings (if performance review system exists)
- No disciplinary actions in the last 12 months
- Completed required training/certifications for next level
- Positive manager feedback and recommendation
- Meets or exceeds job expectations consistently

#### Additional Factors
- Skills and competencies align with next level requirements
- Position availability in target level/department
- Budget approval for salary increase

---

## FOR REGULARIZATION

### Criteria

Probationary employees become eligible for regularization when:

#### Employment Status
- `employmentType === "PROBATIONARY"`
- `probationEndDate` is within 30 days (approaching end of probation period)

#### Probation Period Completion
- Completed minimum probation period (typically 6 months)
- `probationEndDate` is set and approaching

#### Attendance Metrics (During Probation Period)
- **Attendance rate**: ≥ 90%
  - Calculated from start of probation to current date
- **Late occurrences**: ≤ 10% of working days
  - More lenient than promotion criteria
- **No major violations**: No serious attendance issues
- **Absences**: All absences are properly documented and approved

#### Performance During Probation
- Satisfactory performance reviews (if conducted)
- No disciplinary actions during probation period
- Completed all onboarding requirements
- Positive feedback from manager and team
- Demonstrates understanding of role and responsibilities

#### Manager Approval
- Direct manager recommends regularization
- HR review confirms eligibility
- No pending issues or concerns

---

## FOR TERMINATION

### Criteria

Employees become candidates for termination when they exhibit serious performance or conduct issues:

#### Attendance Violations
- **Excessive absences**: ≥ 5 unexcused absences in last 3 months
  - Absences without approved leave requests
- **Chronic tardiness**: Late > 20% of working days in last 3 months
  - Count of `status === "LATE"` in attendance records
- **No Call, No Show**: ≥ 3 incidents
  - Employee absent without notification
- **Pattern of violations**: Consistent attendance issues despite warnings

#### Performance Issues
- **Multiple warnings**: ≥ 3 written performance warnings
- **Failed probation**: If on probation, failed to meet probation requirements
- **Consistent underperformance**: Despite coaching and improvement plans
- **Inability to perform job duties**: Cannot meet basic job requirements

#### Policy Violations
- **Repeated violations**: ≥ 3 documented policy violations
- **Serious misconduct**: 
  - Theft, fraud, harassment
  - Safety violations
  - Confidentiality breaches
  - Other serious infractions
- **Disciplinary actions**: Multiple disciplinary actions in short period

#### Manager/HR Recommendation
- Manager recommends termination after exhausting corrective measures
- HR review confirms termination is appropriate
- Documentation supports termination decision

---

## FOR TRANSFER

### Criteria

Employees become eligible for transfer under various circumstances:

#### Employee-Initiated Transfer
- **Transfer request submitted**: Employee has formally requested transfer
- **Skills match**: Employee skills align with target department/position requirements
- **No pending issues**: No active disciplinary actions or performance concerns
- **Minimum tenure**: 6 months in current role (prevents frequent transfers)

#### Organization-Initiated Transfer
- **Department restructuring**: Organizational changes require reassignment
- **Business needs**: Operational requirements need employee in different department
- **Performance management**: Lateral move as alternative to termination
  - Employee struggling in current role but may succeed elsewhere
- **Career development**: Strategic move for employee growth

#### General Requirements
- **Minimum tenure**: 6 months in current role
- **Attendance rate**: ≥ 85% in last 3 months
  - More lenient than promotion criteria
- **Manager approval**: Current manager approves transfer
- **Target department approval**: Receiving department/manager approves
- **Position availability**: Target position is available and budgeted

#### Additional Considerations
- Employee's skills and experience match new role
- Transfer benefits both employee and organization
- No conflicts of interest
- Proper handover can be arranged

---

## Data Sources

The eligibility criteria use the following data sources:

### Employee Data
- `employmentType` (REGULAR, PROBATIONARY, etc.)
- `employmentStatus` (ACTIVE, etc.)
- `employmentHireDate` / `employmentStartDate`
- `probationEndDate`
- `departmentId` / `positionId`
- `levelId`

### Attendance Data
- `Attendance` records with:
  - `status` (PRESENT, LATE, LEAVE, etc.)
  - `date`
  - `lateHours` / `lateMinutes`
  - `hoursWorked`
- Calculated metrics:
  - Total working days
  - Present days
  - Late occurrences
  - Absence count

### Performance Data (if available)
- Performance reviews
- Manager ratings
- Training completion records
- Disciplinary actions

### Request Data
- Transfer requests
- Leave requests (to identify unexcused absences)

---

## Implementation Notes

### Calculation Periods
- **Promotion**: Last 6-12 months of data
- **Regularization**: Entire probation period
- **Termination**: Last 3-6 months (recent issues)
- **Transfer**: Last 3 months (recent performance)

### Thresholds
These thresholds are configurable and should be adjusted based on:
- Company policies
- Industry standards
- Role requirements
- Management discretion

### Manual Override
HR administrators can manually add or remove candidates from the status change list based on:
- Special circumstances
- Manager recommendations
- Business needs
- Other factors not captured by automated criteria

---

## Next Steps

Once employees appear as candidates:

1. **Review**: HR reviews the candidate list and eligibility reasons
2. **Verify**: Confirm all criteria are met and data is accurate
3. **Create Request**: Create a Personnel Action Request for the status change
4. **Approval Process**: Follow the organization's approval workflow
5. **Implementation**: Execute the status change once approved

---

## Related Documentation

- [Personnel Action Requests](./personnel-action-requests.md)
- [Attendance Policies](./attendance-policies.md)
- [Performance Management](./performance-management.md)
- [Termination Process](./termination-process.md)
