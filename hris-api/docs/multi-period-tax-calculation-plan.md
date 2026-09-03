# Multi-Period Tax Calculation System

## Problem Statement

Currently, the payroll system calculates withholding tax independently for each payroll period. However, Philippine tax regulations require **monthly** tax calculations. For employees paid semi-monthly (or other frequencies with multiple periods per month), this creates challenges:

1. **Tax Bracket Accuracy**: Withholding tax should be based on the employee's total monthly income, not individual period income
2. **Period Distribution**: Tax must be distributed appropriately across periods within the month
3. **Contribution Toggles**: SSS, PhilHealth, and Pag-IBIG contributions may need to be deducted only in specific periods (e.g., first cutoff only, or split across periods)

## Current State Analysis

### Existing Schema

```typescript
// PayrollPeriod already has:
- periodNumber: Int?        // Period within month (1, 2, etc.)
- payFrequency: PayFrequency?
- startDate/endDate: DateTime
```

### Current Tax Calculation Flow

```typescript
// In payroll-period.helper.ts
calculateProratedPayroll(
	fullMonthlyBasic, // Employee's monthly basic salary
	actualPeriodGross, // Gross pay for this period
	splitFactor, // 0.5 for semi-monthly
);
```

**Issue**: This prorates the tax based on a simple ratio, but doesn't account for:

- Year-to-date (YTD) tax already withheld
- Total monthly income across all periods
- Which period in the month this is (1st, 2nd, etc.)

## Proposed Solution

### 1. Period-Aware Tax Calculation Strategy

#### Option A: **Cumulative Monthly Approach** (Recommended)

Calculate tax based on cumulative monthly income, then deduct previously withheld tax.

**Algorithm**:

```typescript
// For Period N in month M:
1. Get all payroll periods in month M for this employee
2. Calculate cumulative gross pay for periods 1..N
3. Calculate total tax due on cumulative amount
4. Subtract tax already withheld in periods 1..(N-1)
5. Result = tax to withhold in period N
```

**Advantages**:

- ✅ Accurate tax brackets based on actual monthly income
- ✅ Self-correcting (adjusts for absences/overtime)
- ✅ Compliant with BIR regulations

**Disadvantages**:

- ⚠️ Requires querying previous periods in same month
- ⚠️ More complex logic

#### Option B: **Estimated Split Approach** (Current)

Estimate monthly income, calculate tax, then split proportionally.

**Current Implementation**:

```typescript
// Assumes monthly income = periodBasic * (1/splitFactor)
// Then splits tax proportionally
```

**Advantages**:

- ✅ Simple, no dependencies on other periods
- ✅ Predictable for employees

**Disadvantages**:

- ❌ Inaccurate if absences/overtime vary between periods
- ❌ May over/under-withhold tax

### 2. Contribution Toggle System

Add configuration to control when contributions are deducted.

#### Schema Addition

```typescript
// Add to PayrollPeriod or as separate config
interface ContributionSchedule {
	sss: {
		deductInPeriod: number[]; // [1] = first period only, [1,2] = both
		splitFactor: number; // 1.0 = full, 0.5 = half per period
	};
	philHealth: {
		deductInPeriod: number[];
		splitFactor: number;
	};
	pagIbig: {
		deductInPeriod: number[];
		splitFactor: number;
	};
}
```

#### Common Scenarios

```typescript
// Semi-Monthly Examples:

// Scenario 1: All contributions in 1st period only
{
  sss: { deductInPeriod: [1], splitFactor: 1.0 },
  philHealth: { deductInPeriod: [1], splitFactor: 1.0 },
  pagIbig: { deductInPeriod: [1], splitFactor: 1.0 }
}

// Scenario 2: Split contributions across both periods
{
  sss: { deductInPeriod: [1, 2], splitFactor: 0.5 },
  philHealth: { deductInPeriod: [1, 2], splitFactor: 0.5 },
  pagIbig: { deductInPeriod: [1, 2], splitFactor: 0.5 }
}

// Scenario 3: Mixed (SSS in 1st, others in 2nd)
{
  sss: { deductInPeriod: [1], splitFactor: 1.0 },
  philHealth: { deductInPeriod: [2], splitFactor: 1.0 },
  pagIbig: { deductInPeriod: [2], splitFactor: 1.0 }
}
```

### 3. Implementation Design

#### New Helper Functions

```typescript
/**
 * Get all payroll periods for an employee in a specific month
 */
async function getEmployeePayrollPeriodsInMonth(
	prisma: PrismaClient,
	employeeId: string,
	year: number,
	month: number,
): Promise<EmployeePayroll[]>;

/**
 * Calculate cumulative tax for current period based on YTD in month
 */
function calculateCumulativeMonthlyTax(
	previousPeriods: EmployeePayroll[],
	currentPeriodGross: number,
	monthlyBasicSalary: number,
): {
	cumulativeGross: number;
	cumulativeTaxDue: number;
	previousTaxWithheld: number;
	currentPeriodTax: number;
};

/**
 * Determine contribution amounts based on period number and schedule
 */
function calculatePeriodContributions(
	monthlyBasicSalary: number,
	periodNumber: number,
	contributionSchedule: ContributionSchedule,
): {
	sss: number;
	philHealth: number;
	pagIbig: number;
};
```

#### Updated Payroll Generation Flow

```typescript
// In generatePayrollFromTimesheets():

// 1. Extract month/year from payroll period
const periodDate = new Date(payrollPeriodData.startDate);
const year = periodDate.getFullYear();
const month = periodDate.getMonth() + 1;
const periodNumber = payrollPeriodData.periodNumber || 1;

// 2. Get previous periods in same month (if any)
const previousPeriods = await getEmployeePayrollPeriodsInMonth(
	prisma,
	employee.id,
	year,
	month,
).filter((p) => p.periodNumber < periodNumber);

// 3. Calculate cumulative tax
const taxCalc = calculateCumulativeMonthlyTax(previousPeriods, grossPay, employee.basicSalary);

// 4. Get contribution schedule (from config or defaults)
const contributionSchedule = getContributionSchedule(employee.payFrequency, organizationId);

// 5. Calculate period-specific contributions
const contributions = calculatePeriodContributions(
	employee.basicSalary,
	periodNumber,
	contributionSchedule,
);

// 6. Create payroll with accurate values
const employeePayroll = await prisma.employeePayroll.create({
	// ... existing fields
	taxAmount: taxCalc.currentPeriodTax,
	sssContribution: contributions.sss,
	philHealthContribution: contributions.philHealth,
	pagibigContribution: contributions.pagIbig,
	metadata: {
		// ... existing metadata
		taxCalculation: {
			method: "CUMULATIVE_MONTHLY",
			periodNumber,
			cumulativeGross: taxCalc.cumulativeGross,
			cumulativeTaxDue: taxCalc.cumulativeTaxDue,
			previousTaxWithheld: taxCalc.previousTaxWithheld,
			currentPeriodTax: taxCalc.currentPeriodTax,
		},
		contributionSchedule,
	},
});
```

### 4. Configuration Storage

#### Option A: Organization-Level Config

```typescript
// Add to Organization schema or separate config table
interface OrganizationPayrollConfig {
	organizationId: string;
	contributionSchedule: ContributionSchedule;
	taxCalculationMethod: "CUMULATIVE" | "PRORATED";
}
```

#### Option B: PayrollPeriod-Level Config

```typescript
// Add to PayrollPeriod schema
model PayrollPeriod {
  // ... existing fields
  contributionSchedule Json? // Store as JSON
}
```

**Recommendation**: Start with **Option B** (PayrollPeriod-level) for flexibility, then add Option A for defaults.

## User Review Required

> [!IMPORTANT]
> **Key Decisions Needed**:
>
> 1. **Tax Calculation Method**: Should we implement the **Cumulative Monthly Approach** (more accurate) or keep the **Estimated Split Approach** (simpler)?
> 2. **Contribution Schedule**: Where should the contribution toggle configuration be stored?
>     - Per PayrollPeriod (more flexible)
>     - Per Organization (simpler, consistent)
>     - Both (defaults at org level, overrides at period level)
> 3. **Default Behavior**: For semi-monthly payroll, what should be the default contribution schedule?
>     - All in 1st period
>     - Split 50/50 across both periods
>     - Configurable per organization

## Implementation Phases

### Phase 1: Foundation (Recommended First)

- [ ] Add `contributionSchedule` JSON field to `PayrollPeriod` schema
- [ ] Create helper functions for period queries
- [ ] Add metadata tracking for tax calculation method

### Phase 2: Cumulative Tax Logic

- [ ] Implement `getEmployeePayrollPeriodsInMonth()`
- [ ] Implement `calculateCumulativeMonthlyTax()`
- [ ] Update `generatePayrollFromTimesheets()` to use cumulative approach

### Phase 3: Contribution Toggles

- [ ] Implement `calculatePeriodContributions()`
- [ ] Add UI for configuring contribution schedules
- [ ] Update payroll generation to respect toggles

### Phase 4: Testing & Validation

- [ ] Test with various scenarios (absences, overtime, etc.)
- [ ] Validate tax accuracy against BIR tables
- [ ] Document configuration options

## Example Scenarios

### Scenario 1: Semi-Monthly, All Contributions in 1st Period

```typescript
Employee: PHP 95,000/month (semi-monthly)
Period 1: 11 working days, 5 present = PHP 43,181.82 gross
Period 2: 11 working days, 11 present = PHP 95,000 gross (estimated)

// Period 1 Calculation:
- Gross: 43,181.82
- SSS: 1,750 (full monthly)
- PhilHealth: 2,375 (full monthly)
- Pag-IBIG: 200 (full monthly)
- Taxable: 43,181.82 - 4,325 = 38,856.82
- Tax (cumulative on 43,181.82): ~X
- Net: 43,181.82 - 4,325 - X

// Period 2 Calculation:
- Cumulative Gross: 43,181.82 + 95,000 = 138,181.82
- Cumulative Tax Due: ~Y
- Previous Tax Withheld: X
- Current Period Tax: Y - X
- Contributions: 0 (already deducted in period 1)
- Net: 95,000 - (Y - X)
```

### Scenario 2: Semi-Monthly, Split Contributions

```typescript
// Period 1:
- SSS: 875 (50%)
- PhilHealth: 1,187.50 (50%)
- Pag-IBIG: 100 (50%)

// Period 2:
- SSS: 875 (50%)
- PhilHealth: 1,187.50 (50%)
- Pag-IBIG: 100 (50%)
```

## Tax Withholding Strategies

### Strategy A: **All Tax in 2nd Period** (Recommended Approach)

This is the simplest and most common approach for semi-monthly payroll in the Philippines:

```typescript
Employee: PHP 35,000/month (semi-monthly = PHP 17,500 per period)
Assuming full attendance both periods

// Period 1 (1st cutoff):
Gross Pay:           17,500.00
SSS:                 -437.50 (50%)
PhilHealth:          -437.50 (50%)
Pag-IBIG:            -100.00 (50%)
Withholding Tax:        0.00 ← NO TAX IN PERIOD 1
─────────────────────────────
Total Deductions:    -975.00
Net Pay:            16,525.00

// Period 2 (2nd cutoff):
Gross Pay:           17,500.00
SSS:                 -437.50 (50%)
PhilHealth:          -437.50 (50%)
Pag-IBIG:            -100.00 (50%)

// Calculate tax on FULL MONTHLY income:
Monthly Gross:       35,000.00
Monthly Contributions: -1,950.00 (SSS 875 + PhilHealth 875 + Pag-IBIG 200)
Taxable Income:      33,050.00
Monthly Tax:         -1,832.50 ← FULL MONTH'S TAX
Tax in Period 1:          0.00
Tax in Period 2:     -1,832.50 ← ALL TAX HERE
─────────────────────────────
Total Deductions:    -2,807.50
Net Pay:            14,692.50

// Monthly Summary:
Total Gross:         35,000.00
Total Deductions:    -3,782.50
Total Net:           31,217.50
```

**Advantages**:

- ✅ Very simple logic
- ✅ Employee gets larger net pay in 1st period
- ✅ No need to query previous periods
- ✅ Standard practice in Philippine companies

**Disadvantages**:

- ⚠️ Large deduction in 2nd period (but employees expect this)
- ⚠️ If employee has significant absences, tax calculation is based on estimated monthly, not actual

---

## Why Strategy A is the Only Practical Approach

### The Timing Problem

For semi-monthly payroll, you process periods sequentially:

- **Period 1** is processed first (e.g., Jan 1-15, paid on Jan 15)
- **Period 2** is processed later (e.g., Jan 16-31, paid on Jan 31)

**The Challenge**: Tax must be calculated on **actual monthly gross income**, but:

- When processing Period 1, you don't know Period 2's attendance yet
- You can't predict absences, overtime, or other adjustments
- Any "estimated" monthly income will be inaccurate

### Why Other Strategies Fail

**❌ Split Tax 50/50 (Strategy C)**:

```typescript
Problem: When processing Period 1 on Jan 15:
- You estimate monthly income = ₱35,000
- You withhold 50% of tax = ₱916.25

But what if employee is absent in Period 2?
- Actual monthly income = ₱25,000 (not ₱35,000)
- Actual monthly tax = ₱620 (not ₱1,832.50)
- You over-withheld ₱296.25 in Period 1!

Result: Incorrect tax withholding, requires adjustments
```

**❌ Cumulative Tax (Strategy B)**:

```typescript
Problem: Doesn't make sense for fixed-period payroll
- Each period has its own gross pay (₱17,500 each)
- "Cumulative gross" would artificially inflate Period 2
- Not how semi-monthly payroll works in practice
```

### ✅ Strategy A: All Tax in 2nd Period

This solves all the problems:

```typescript
Period 1 (Jan 15):
- Process payroll with actual attendance
- Deduct contributions (SSS, PhilHealth, Pag-IBIG)
- Withhold ₱0 tax
- Pay employee
s
Period 2 (Jan 31):
- Process payroll with actual attendance
- Deduct contributions
- NOW you have both periods' data:
  * Period 1 gross: ₱15,909.09 (5 days absent)
  * Period 2 gross: ₱17,500.00 (full attendance)
  * Total monthly: ₱33,409.09
- Calculate tax on ACTUAL monthly income: ₱1,718.86
- Withhold full monthly tax in Period 2
- Pay employee
```

**Benefits**:

1. ✅ Tax is calculated on **actual** monthly income, not estimates
2. ✅ No over/under-withholding issues
3. ✅ Simple logic - no complex cumulative calculations
4. ✅ Standard practice in Philippine companies
5. ✅ Employees understand and expect this pattern

## Recommendation

Based on your question, it sounds like you prefer **Strategy A** (All Tax in 2nd Period). This is:

1. **Simple to implement** - No complex cumulative logic
2. **Common practice** - Many Philippine companies do this
3. **Employee-friendly for 1st period** - Larger take-home in 1st cutoff

**Implementation for Strategy A**:

```typescript
// In payroll-period.helper.ts

// Determine if we should calculate tax for this period
const shouldCalculateTax = periodNumber === 2; // Only in 2nd period

let withholdingTax = 0;
if (shouldCalculateTax) {
	// Calculate tax on FULL MONTHLY income
	const estimatedMonthlyGross = estimatedMonthlyRate; // Already calculated
	const monthlyContributions = calculateTotalContributions(estimatedMonthlyGross);
	const monthlyTaxable = estimatedMonthlyGross - monthlyContributions.total;
	withholdingTax = calculateWithholdingTax(monthlyTaxable);
}

// Use withholdingTax in payroll creation
```

**Is this the approach you want to implement?**
