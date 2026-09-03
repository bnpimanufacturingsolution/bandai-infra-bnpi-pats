# Workforce Manpower Databank And Per-Position Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing HR workforce `Manpower Distribution` report with a position-first `Manpower Databank` section, normalized report drilldowns, employment-type deep links, and export coverage without adding a new route.

**Architecture:** Keep `/hr/reports/workforce?tab=labor` as the only surface for this card. Normalize the existing manpower drilldown helper first, then add a pure aggregation helper for active-manpower position and employment-type summaries, then render that data through an extracted `ManpowerDatabankSection` so `ManpowerDistributionTab.tsx` stays readable. Reuse the same full-roster `useEmployees({ limit: 10000 })` query already used by `ManpowerDistributionTab` so the databank never groups from paginated employee slices.

**Tech Stack:** React, TypeScript, React Router, TanStack Query, React Testing Library, Vitest.

---

## File Structure

- Modify: `app/lib/utils/manpower-distribution-links.ts`
  - Add `positionId` and `employmentType` drilldown support and normalize the helper input from `agencyName` to `agency`.
- Modify: `app/lib/utils/manpower-distribution-links.test.ts`
  - Lock the normalized drilldown contract.
- Create: `app/lib/utils/manpower-databank.ts`
  - Own active-manpower aggregation, employment-type label formatting, and position/employment-type summary row building.
- Create: `app/lib/utils/manpower-databank.test.ts`
  - Lock position grouping, direct vs agency counts, employment-type summaries, and unassigned-position handling.
- Modify: `app/components/shared/EmployeeList.tsx`
  - Parse `employmentType` from the URL, include it in the employee API filter string, surface it in advanced filters, and preserve it through filter serialization/reset.
- Modify: `app/components/shared/EmployeeList.test.tsx`
  - Prove databank deep links survive URL parsing and reach the employee API filter contract.
- Create: `app/routes/hr/reports/tabs/ManpowerDatabankSection.tsx`
  - Render the `Position Summary` and `Employment Type Summary` tables from already-aggregated rows.
- Create: `app/routes/hr/reports/tabs/ManpowerDatabankSection.test.tsx`
  - Lock the section headings, link behavior, compact employment-type mix cell, empty state, and `Unassigned position` row.
- Modify: `app/routes/hr/reports/tabs/ManpowerDistributionTab.tsx`
  - Reuse the full-roster active-manpower query, call the new helper once, compose the new section, normalize agency drilldown call sites, and extend export sheets.
- Modify: `app/routes/hr/reports/tabs/DirectIndirectLaborTab.tsx`
  - Update remaining manpower drilldown call sites to the normalized `agency` input name.
- Create: `app/routes/hr/reports/tabs/ManpowerDistributionTab.test.tsx`
  - Verify the parent report passes databank sheets into `exportReport` and keeps export available when databank rows exist.
- Modify: `.wwg/workspace/current-task.md`
  - Record implementation outcome and validation evidence after the code lands.

## Chain Run Map

### Chain Run 1: Contract Pass

- Execute Task 1 only.
- Outcome:
  - normalized manpower drilldown helper
  - employee-directory `employmentType` filter support
  - updated report call sites
- Validation:
  - `npm run test -- app/lib/utils/manpower-distribution-links.test.ts app/components/shared/EmployeeList.test.tsx`

### Chain Run 2: Aggregation Pass

- Execute Task 2 only.
- Outcome:
  - pure active-manpower aggregation helper
  - unit coverage for grouping and summary rules
- Validation:
  - `npm run test -- app/lib/utils/manpower-databank.test.ts`

### Chain Run 3: UI Pass

- Execute Task 3 only.
- Outcome:
  - extracted `ManpowerDatabankSection`
  - live rendering in `ManpowerDistributionTab`
- Validation:
  - `npm run test -- app/routes/hr/reports/tabs/ManpowerDatabankSection.test.tsx`

### Chain Run 4: Export And Validation Pass

- Execute Tasks 4 and 5.
- Outcome:
  - databank export sheets
  - integration coverage
  - task-log sync
  - full validation evidence
- Validation:
  - `npm run test -- app/routes/hr/reports/tabs/ManpowerDistributionTab.test.tsx`
  - `npm run typecheck:test`
  - `npm run typecheck`
  - `npm run quality:ci`

---

### Task 1: Normalize manpower drilldowns and employee-directory filter support

**Files:**
- Modify: `app/lib/utils/manpower-distribution-links.ts`
- Modify: `app/lib/utils/manpower-distribution-links.test.ts`
- Modify: `app/components/shared/EmployeeList.tsx`
- Modify: `app/components/shared/EmployeeList.test.tsx`
- Modify: `app/routes/hr/reports/tabs/ManpowerDistributionTab.tsx`
- Modify: `app/routes/hr/reports/tabs/DirectIndirectLaborTab.tsx`

- [ ] **Step 1: Write the failing contract tests**

```ts
// app/lib/utils/manpower-distribution-links.test.ts
it("includes position, employment type, and normalized agency filters in manpower drilldowns", () => {
	expect(
		buildManpowerEmployeeListPath({
			positionId: "position-operator",
			employmentType: "REGULAR",
			workforceSource: "AGENCY",
			agency: "Cebu General Services, Inc.",
		}),
	).toBe(
		"/hr/employees?view=list&statusScope=active-manpower&page=1&positionId=position-operator&employmentType=REGULAR&workforceSource=AGENCY&agency=Cebu+General+Services%2C+Inc.",
	);
});
```

```ts
// app/components/shared/EmployeeList.test.tsx
it("replays manpower databank deep links into the employee API filter contract", async () => {
	renderEmployeeList(
		"/hr/employees?view=list&statusScope=active-manpower&page=1&positionId=position-1&employmentType=REGULAR&workforceSource=AGENCY&agency=agency-1",
	);

	await waitFor(() => {
		const employeeListCalls = vi
			.mocked(useEmployees)
			.mock.calls.map(([params]) => params)
			.filter((params) => params?.count === true);

		expect(
			employeeListCalls.some(
				(params) =>
					String(params?.filter || "").includes("positionId:position-1") &&
					String(params?.filter || "").includes("employmentType:REGULAR") &&
					String(params?.filter || "").includes("workforceSource:AGENCY") &&
					String(params?.filter || "").includes("agencyId:agency-1"),
			),
		).toBe(true);
	});
}, 15_000);
```

- [ ] **Step 2: Run the focused drilldown and employee-directory tests to verify they fail**

Run:

```bash
npm run test -- app/lib/utils/manpower-distribution-links.test.ts app/components/shared/EmployeeList.test.tsx
```

Expected:

- `buildManpowerEmployeeListPath` does not yet accept `positionId`, `employmentType`, or `agency`
- `EmployeeList` does not yet parse or serialize `employmentType`

- [ ] **Step 3: Implement the normalized helper and employee-directory filter support**

```ts
// app/lib/utils/manpower-distribution-links.ts
const ACTIVE_MANPOWER_STATUS_SCOPE = "active-manpower";

export type ManpowerGenderFilter = "Female" | "Male" | "Unknown";
export type ManpowerEmploymentTypeFilter =
	| "REGULAR"
	| "PROBATIONARY"
	| "CONTRACTUAL"
	| "PART_TIME"
	| "CONSULTANT"
	| "INTERN";

export interface ManpowerEmployeeListLinkInput {
	departmentId?: string | null;
	sectionId?: string | null;
	positionId?: string | null;
	workforceSource?: "DIRECT" | "AGENCY";
	agency?: string | null;
	gender?: ManpowerGenderFilter;
	employmentType?: ManpowerEmploymentTypeFilter;
}

export function buildManpowerEmployeeListPath(input: ManpowerEmployeeListLinkInput = {}) {
	const params = new URLSearchParams({
		view: "list",
		statusScope: ACTIVE_MANPOWER_STATUS_SCOPE,
		page: "1",
	});

	if (input.departmentId !== undefined) {
		params.set("departmentId", input.departmentId ?? "null");
	}

	if (input.sectionId !== undefined) {
		params.set("sectionId", input.sectionId ?? "null");
	}

	if (input.positionId !== undefined) {
		params.set("positionId", input.positionId ?? "null");
	}

	if (input.workforceSource) {
		params.set("workforceSource", input.workforceSource);
	}

	if (input.agency) {
		params.set("agency", input.agency);
	}

	if (input.gender) {
		params.set("gender", input.gender);
	}

	if (input.employmentType) {
		params.set("employmentType", input.employmentType);
	}

	return `/hr/employees?${params.toString()}`;
}
```

```ts
// app/components/shared/EmployeeList.tsx
const employmentTypeFilter = searchParams.get("employmentType") || undefined;

if (positionFilter && positionFilter !== "all") {
	filterParts.push(`positionId:${positionFilter}`);
}
if (employmentTypeFilter && employmentTypeFilter !== "all") {
	filterParts.push(`employmentType:${employmentTypeFilter}`);
}
if (levelFilter && levelFilter !== "all") {
	filterParts.push(`levelId:${levelFilter}`);
}
```

```ts
// app/components/shared/EmployeeList.tsx
const employeeFilters = [
	{
		key: "sectionId",
		label: "Section",
		options: visibleSections.map((section: any) => ({
			value: section.id,
			label: section.name,
		})),
	},
	{
		key: "gender",
		label: "Gender",
		options: [
			{ value: "Female", label: "Female" },
			{ value: "Male", label: "Male" },
			{ value: "Unknown", label: "Unknown" },
		],
	},
	{
		key: "teamScope",
		label: "Reporting Scope",
		options: [
			{ value: "reporting-tree", label: "Tree" },
			{ value: "direct-reports", label: "Direct" },
			...(supervisorEmployeeId
				? [
						{ value: "supervisor-tree", label: "Supervisor Tree" },
						{ value: "supervisor-direct", label: "Supervisor Direct" },
					]
				: []),
		],
	},
	{
		key: "agency",
		label: "Agency",
		options: [
			{ value: "DIRECT", label: "BNPI / Direct" },
			...agencies.map((agency: any) => ({
				value: agency.id,
				label: agency.code ? `${agency.code} - ${agency.name}` : agency.name,
			})),
		],
	},
	{
		key: "status",
		label: "Status",
		options: [
			{ value: "ACTIVE", label: "Active" },
			{ value: "ONBOARDING", label: "Onboarding" },
			{ value: "INACTIVE", label: "Inactive" },
			{ value: "ON_LEAVE", label: "On Leave" },
			{ value: "OFFBOARDING", label: "Offboarding" },
			{ value: "SERVING_NOTICE", label: "Serving Notice" },
			{ value: "RESIGNATION_REQUESTED", label: "Resignation Requested" },
			{ value: "TERMINATED", label: "Terminated" },
			{ value: "RESIGNED", label: "Resigned" },
			{ value: "RETIRED", label: "Retired" },
			{ value: "FORMER_EMPLOYEE", label: "Former Employee" },
		],
	},
	{
		key: "employmentType",
		label: "Employment Type",
		options: [
			{ value: "REGULAR", label: "Regular" },
			{ value: "PROBATIONARY", label: "Probationary" },
			{ value: "CONTRACTUAL", label: "Contractual" },
			{ value: "PART_TIME", label: "Part time" },
			{ value: "CONSULTANT", label: "Consultant" },
			{ value: "INTERN", label: "Intern" },
		],
	},
	{
		key: "positionId",
		label: "Position",
		options: positions.map((position: Position) => ({
			value: position.id,
			label: position.title,
		})),
	},
	{
		key: "levelId",
		label: "Level",
		options: levels.map((level: Level) => ({
			value: level.id,
			label: level.rank ? `${level.name} (Rank ${level.rank})` : level.name,
		})),
	},
	{
		key: "hireDateFrom",
		label: "Hire Date From",
		type: "date" as const,
		options: [],
	},
	{
		key: "hireDateTo",
		label: "Hire Date To",
		type: "date" as const,
		options: [],
	},
];
```

```ts
// app/components/shared/EmployeeList.tsx
if (Object.keys(filters).length === 0) {
	next.delete("status");
	next.delete("statusScope");
	next.delete("departmentId");
	next.delete("sectionId");
	next.delete("positionId");
	next.delete("employmentType");
	next.delete("levelId");
	next.delete("gender");
	next.delete("hireDateFrom");
	next.delete("hireDateTo");
	next.delete("managerId");
	next.delete("teamScope");
	next.delete("workforceSource");
	next.delete("agency");
	next.set("page", "1");
	return next;
}

if (filters.employmentType) {
	if (filters.employmentType === "all") {
		next.delete("employmentType");
	} else {
		next.set("employmentType", filters.employmentType);
	}
}

const advancedFilterValues = useMemo(
	() => ({
		status: statusFilter || "",
		sectionId: sectionFilter || "",
		gender: genderFilter || "",
		teamScope: rawTeamScopeFilter || "",
		employmentType: employmentTypeFilter || "",
		positionId: positionFilter || "",
		levelId: levelFilter || "",
		hireDateFrom: hireDateFromFilter || "",
		hireDateTo: hireDateToFilter || "",
		agency: agencyFilterValue,
	}),
	[
		agencyFilterValue,
		employmentTypeFilter,
		genderFilter,
		hireDateFromFilter,
		hireDateToFilter,
		levelFilter,
		positionFilter,
		rawTeamScopeFilter,
		sectionFilter,
		statusFilter,
	],
);
```

```tsx
// app/routes/hr/reports/tabs/ManpowerDistributionTab.tsx
<EmployeeDrillLink
	count={row.headcount}
	input={{ workforceSource: "AGENCY", agency: row.agency }}>
	{row.agency}
</EmployeeDrillLink>
```

```tsx
// app/routes/hr/reports/tabs/DirectIndirectLaborTab.tsx
<EmployeeDrillLink
	count={row.headcount}
	input={{ workforceSource: "AGENCY", agency: row.agency }}>
	{row.agency}
</EmployeeDrillLink>
```

Implementation notes:

- Do not keep both `agencyName` and `agency` in the helper contract.
- Make `employmentType` visible in advanced filters so deep-linked state can be seen and cleared by users.
- Preserve `statusScope=active-manpower`; this card adds filters, not a new scope.

- [ ] **Step 4: Run the focused tests again**

Run:

```bash
npm run test -- app/lib/utils/manpower-distribution-links.test.ts app/components/shared/EmployeeList.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit the contract pass**

```bash
git add app/lib/utils/manpower-distribution-links.ts app/lib/utils/manpower-distribution-links.test.ts app/components/shared/EmployeeList.tsx app/components/shared/EmployeeList.test.tsx app/routes/hr/reports/tabs/ManpowerDistributionTab.tsx app/routes/hr/reports/tabs/DirectIndirectLaborTab.tsx
git commit -m "feat: normalize manpower databank drilldowns"
```

---

### Task 2: Add the pure manpower databank aggregation helper

**Files:**
- Create: `app/lib/utils/manpower-databank.ts`
- Create: `app/lib/utils/manpower-databank.test.ts`

- [ ] **Step 1: Write the failing aggregation tests**

```ts
// app/lib/utils/manpower-databank.test.ts
import { describe, expect, it } from "vitest";
import type { Employee } from "~/services/employees.service";
import { buildManpowerDatabank } from "./manpower-databank";

const makeEmployee = (overrides: Partial<Employee> = {}) =>
	({
		id: overrides.id || "employee-1",
		organizationId: "org-1",
		employeeId: "EMP-001",
		personId: "person-1",
		userId: "user-1",
		employmentHireDate: "2026-01-01",
		employmentStatus: "ACTIVE",
		employmentType: "REGULAR",
		departmentId: "dept-1",
		positionId: "position-operator",
		workLocation: "ONSITE",
		basicSalary: 0,
		currency: "PHP",
		payFrequency: "SEMI_MONTHLY",
		isDeleted: false,
		isTour: false,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		workforceSource: "DIRECT",
		department: {
			id: "dept-1",
			organizationId: "org-1",
			name: "Manufacturing",
			code: "MFG",
			managerId: "manager-1",
			isActive: true,
			isDefault: false,
			isDeleted: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		},
		section: { id: "section-1", name: "Assembly", code: "ASSY", departmentId: "dept-1" },
		position: {
			id: "position-operator",
			organizationId: "org-1",
			title: "Operator",
			code: "OPR",
			departmentId: "dept-1",
			isActive: true,
			isDeleted: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		},
		...overrides,
	}) as Employee;

describe("buildManpowerDatabank", () => {
	it("builds active-manpower position and employment-type summaries", () => {
		const databank = buildManpowerDatabank([
			makeEmployee({ id: "employee-1", employmentType: "REGULAR", workforceSource: "DIRECT" }),
			makeEmployee({ id: "employee-2", employmentType: "PROBATIONARY", workforceSource: "AGENCY" }),
			makeEmployee({
				id: "employee-3",
				positionId: "position-quality",
				position: {
					id: "position-quality",
					organizationId: "org-1",
					title: "Quality Inspector",
					code: "QI",
					departmentId: "dept-1",
					isActive: true,
					isDeleted: false,
					createdAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-01-01T00:00:00.000Z",
				},
			}),
			makeEmployee({
				id: "employee-4",
				positionId: "",
				position: undefined,
				employmentType: "CONTRACTUAL",
			}),
			makeEmployee({ id: "employee-5", employmentStatus: "INACTIVE" }),
		]);

		expect(databank.positionRows.map((row) => [row.position, row.headcount])).toEqual([
			["Operator", 2],
			["Quality Inspector", 1],
			["Unassigned position", 1],
		]);
		expect(databank.positionRows[0]).toMatchObject({
			direct: 1,
			agency: 1,
			employmentTypeMix: "Regular 1, Probationary 1",
		});
		expect(
			databank.employmentTypeRows.find((row) => row.employmentType === "REGULAR"),
		).toMatchObject({
			headcount: 2,
			direct: 2,
			agency: 0,
			positions: 2,
		});
	});
});
```

- [ ] **Step 2: Run the aggregation test to verify it fails**

Run:

```bash
npm run test -- app/lib/utils/manpower-databank.test.ts
```

Expected: FAIL because the helper file does not exist yet.

- [ ] **Step 3: Implement the aggregation helper**

```ts
// app/lib/utils/manpower-databank.ts
import type { Employee } from "~/services/employees.service";

export const ACTIVE_MANPOWER_EMPLOYMENT_STATUSES = new Set([
	"ACTIVE",
	"ONBOARDING",
	"ON_LEAVE",
] as const);

export type ManpowerDatabankPositionRow = {
	position: string;
	positionId: string | null;
	headcount: number;
	direct: number;
	agency: number;
	departments: number;
	sections: number;
	employmentTypeMix: string;
	employmentTypeBreakdown: Array<{ employmentType: string; count: number }>;
	isUnassigned: boolean;
};

export type ManpowerDatabankEmploymentTypeRow = {
	employmentType: string;
	headcount: number;
	direct: number;
	agency: number;
	positions: number;
};

export function formatEmploymentTypeLabel(value?: string | null) {
	return String(value || "UNKNOWN")
		.toLowerCase()
		.split("_")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function buildEmploymentTypeMixLabel(
	breakdown: Array<{ employmentType: string; count: number }>,
) {
	const topTwo = breakdown
		.slice(0, 2)
		.map(
			(item) => `${formatEmploymentTypeLabel(item.employmentType)} ${item.count}`,
		)
		.join(", ");

	const remainder = breakdown.length - 2;
	if (remainder <= 0) return topTwo;
	return `${topTwo}, +${remainder} more`;
}

export function getActiveManpowerEmployees(employees: Employee[]) {
	return employees.filter((employee) =>
		ACTIVE_MANPOWER_EMPLOYMENT_STATUSES.has(
			employee.employmentStatus as (typeof ACTIVE_MANPOWER_EMPLOYMENT_STATUSES extends Set<
				infer T
			>
				? T
				: never),
		),
	);
}

export function buildManpowerDatabank(employees: Employee[]) {
	const activeEmployees = getActiveManpowerEmployees(employees);
	const positionMap = new Map<
		string,
		{
			position: string;
			positionId: string | null;
			headcount: number;
			direct: number;
			agency: number;
			departments: Set<string>;
			sections: Set<string>;
			employmentTypes: Map<string, number>;
			isUnassigned: boolean;
		}
	>();
	const employmentTypeMap = new Map<
		string,
		{
			employmentType: string;
			headcount: number;
			direct: number;
			agency: number;
			positions: Set<string>;
		}
	>();

	activeEmployees.forEach((employee) => {
		const positionId = String(employee.position?.id || employee.positionId || "").trim() || null;
		const position = String(employee.position?.title || "").trim() || "Unassigned position";
		const positionKey = positionId || "__unassigned_position__";
		const departmentKey = String(employee.department?.id || employee.departmentId || "null");
		const sectionKey = String(employee.section?.id || employee.sectionId || "null");
		const employmentType = String(employee.employmentType || "UNKNOWN");
		const isAgency = employee.workforceSource === "AGENCY";

		const positionEntry =
			positionMap.get(positionKey) || {
				position,
				positionId,
				headcount: 0,
				direct: 0,
				agency: 0,
				departments: new Set<string>(),
				sections: new Set<string>(),
				employmentTypes: new Map<string, number>(),
				isUnassigned: !positionId,
			};
		positionEntry.headcount += 1;
		if (isAgency) positionEntry.agency += 1;
		else positionEntry.direct += 1;
		positionEntry.departments.add(departmentKey);
		positionEntry.sections.add(sectionKey);
		positionEntry.employmentTypes.set(
			employmentType,
			(positionEntry.employmentTypes.get(employmentType) || 0) + 1,
		);
		positionMap.set(positionKey, positionEntry);

		const employmentTypeEntry =
			employmentTypeMap.get(employmentType) || {
				employmentType,
				headcount: 0,
				direct: 0,
				agency: 0,
				positions: new Set<string>(),
			};
		employmentTypeEntry.headcount += 1;
		if (isAgency) employmentTypeEntry.agency += 1;
		else employmentTypeEntry.direct += 1;
		employmentTypeEntry.positions.add(positionKey);
		employmentTypeMap.set(employmentType, employmentTypeEntry);
	});

	const positionRows: ManpowerDatabankPositionRow[] = Array.from(positionMap.values())
		.map((entry) => {
			const employmentTypeBreakdown = Array.from(entry.employmentTypes.entries())
				.map(([employmentType, count]) => ({ employmentType, count }))
				.sort((a, b) => b.count - a.count || a.employmentType.localeCompare(b.employmentType));

			return {
				position: entry.position,
				positionId: entry.positionId,
				headcount: entry.headcount,
				direct: entry.direct,
				agency: entry.agency,
				departments: entry.departments.size,
				sections: entry.sections.size,
				employmentTypeMix: buildEmploymentTypeMixLabel(employmentTypeBreakdown),
				employmentTypeBreakdown,
				isUnassigned: entry.isUnassigned,
			};
		})
		.sort((a, b) => b.headcount - a.headcount || a.position.localeCompare(b.position));

	const employmentTypeRows: ManpowerDatabankEmploymentTypeRow[] = Array.from(
		employmentTypeMap.values(),
	)
		.map((entry) => ({
			employmentType: entry.employmentType,
			headcount: entry.headcount,
			direct: entry.direct,
			agency: entry.agency,
			positions: entry.positions.size,
		}))
		.sort((a, b) => b.headcount - a.headcount || a.employmentType.localeCompare(b.employmentType));

	return { activeEmployees, positionRows, employmentTypeRows };
}
```

Implementation notes:

- Keep aggregation pure. No hooks, no router access, no export config in this file.
- Filter inactive employees inside the helper so the population rule is locked in one place.
- Preserve a visible `Unassigned position` row instead of dropping unmatched headcount.

- [ ] **Step 4: Run the aggregation test and the touched typecheck**

Run:

```bash
npm run test -- app/lib/utils/manpower-databank.test.ts
npm run typecheck:test
```

Expected: PASS

- [ ] **Step 5: Commit the helper pass**

```bash
git add app/lib/utils/manpower-databank.ts app/lib/utils/manpower-databank.test.ts
git commit -m "feat: add manpower databank aggregation helper"
```

---

### Task 3: Render the extracted manpower databank section inside the live report

**Files:**
- Create: `app/routes/hr/reports/tabs/ManpowerDatabankSection.tsx`
- Create: `app/routes/hr/reports/tabs/ManpowerDatabankSection.test.tsx`
- Modify: `app/routes/hr/reports/tabs/ManpowerDistributionTab.tsx`

- [ ] **Step 1: Write the failing section test**

```tsx
// app/routes/hr/reports/tabs/ManpowerDatabankSection.test.tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { ManpowerDatabankSection } from "./ManpowerDatabankSection";

describe("ManpowerDatabankSection", () => {
	it("renders position and employment-type summaries with databank drill links", () => {
		render(
			<MemoryRouter>
				<ManpowerDatabankSection
					positionRows={[
						{
							position: "Operator",
							positionId: "position-operator",
							headcount: 8,
							direct: 5,
							agency: 3,
							departments: 1,
							sections: 2,
							employmentTypeMix: "Regular 5, Probationary 3",
							employmentTypeBreakdown: [
								{ employmentType: "REGULAR", count: 5 },
								{ employmentType: "PROBATIONARY", count: 3 },
							],
							isUnassigned: false,
						},
					]}
					employmentTypeRows={[
						{
							employmentType: "REGULAR",
							headcount: 5,
							direct: 5,
							agency: 0,
							positions: 2,
						},
					]}
				/>
			</MemoryRouter>,
		);

		expect(screen.getByText("Manpower Databank")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Operator" })).toHaveAttribute(
			"href",
			"/hr/employees?view=list&statusScope=active-manpower&page=1&positionId=position-operator",
		);
		expect(screen.getByText("Regular 5, Probationary 3")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Regular" })).toHaveAttribute(
			"href",
			"/hr/employees?view=list&statusScope=active-manpower&page=1&employmentType=REGULAR",
		);
	});

	it("renders the empty state when the databank has no rows", () => {
		render(
			<MemoryRouter>
				<ManpowerDatabankSection positionRows={[]} employmentTypeRows={[]} />
			</MemoryRouter>,
		);

		expect(screen.getByText("No manpower databank rows found")).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run the new section test to verify it fails**

Run:

```bash
npm run test -- app/routes/hr/reports/tabs/ManpowerDatabankSection.test.tsx
```

Expected: FAIL because the section component does not exist yet.

- [ ] **Step 3: Implement the extracted section and wire it into the live report**

```tsx
// app/routes/hr/reports/tabs/ManpowerDatabankSection.tsx
import { Link } from "react-router";
import { ReportTable } from "../components/ReportTable";
import {
	buildManpowerEmployeeListPath,
	type ManpowerEmployeeListLinkInput,
} from "~/lib/utils/manpower-distribution-links";
import {
	formatEmploymentTypeLabel,
	type ManpowerDatabankEmploymentTypeRow,
	type ManpowerDatabankPositionRow,
} from "~/lib/utils/manpower-databank";

function formatNumber(value?: number | null) {
	return new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 }).format(value || 0);
}

function EmployeeDrillLink({
	children,
	count,
	input,
	disabled = false,
}: {
	children: React.ReactNode;
	count: number;
	input?: ManpowerEmployeeListLinkInput;
	disabled?: boolean;
}) {
	if (disabled || count <= 0) return <span>{children}</span>;
	return (
		<Link
			to={buildManpowerEmployeeListPath(input)}
			className="font-medium text-neutral-900 underline-offset-4 hover:text-orange-600 hover:underline">
			{children}
		</Link>
	);
}

export function ManpowerDatabankSection({
	positionRows,
	employmentTypeRows,
}: {
	positionRows: ManpowerDatabankPositionRow[];
	employmentTypeRows: ManpowerDatabankEmploymentTypeRow[];
}) {
	return (
		<section className="space-y-6">
			<div className="space-y-3">
				<div className="space-y-1">
					<h3 className="text-sm font-semibold text-neutral-900">Manpower Databank</h3>
					<p className="text-sm text-neutral-500">
						Position-level active manpower review with employee-directory drilldowns.
					</p>
				</div>
				<ReportTable
					columns={[
						{
							key: "position",
							header: "Position",
							render: (row) => (
								<EmployeeDrillLink
									count={row.headcount}
									input={{ positionId: row.positionId }}
									disabled={row.isUnassigned}>
									{row.position}
								</EmployeeDrillLink>
							),
						},
						{
							key: "headcount",
							header: "Headcount",
							align: "right",
							render: (row) => (
								<EmployeeDrillLink count={row.headcount} input={{ positionId: row.positionId }}>
									{formatNumber(row.headcount)}
								</EmployeeDrillLink>
							),
						},
						{
							key: "direct",
							header: "Direct",
							align: "right",
							render: (row) => (
								<EmployeeDrillLink
									count={row.direct}
									input={{ positionId: row.positionId, workforceSource: "DIRECT" }}>
									{formatNumber(row.direct)}
								</EmployeeDrillLink>
							),
						},
						{
							key: "agency",
							header: "Agency",
							align: "right",
							render: (row) => (
								<EmployeeDrillLink
									count={row.agency}
									input={{ positionId: row.positionId, workforceSource: "AGENCY" }}>
									{formatNumber(row.agency)}
								</EmployeeDrillLink>
							),
						},
						{ key: "departments", header: "Departments", accessor: "departments", align: "right", valueType: "number" },
						{ key: "sections", header: "Sections", accessor: "sections", align: "right", valueType: "number" },
						{ key: "employmentTypeMix", header: "Employment Type Mix", accessor: "employmentTypeMix" },
					]}
					rows={positionRows}
					getRowKey={(row) => row.positionId || row.position}
					emptyMessage="No manpower databank rows found"
				/>
			</div>

			<div className="space-y-3">
				<h4 className="text-sm font-semibold text-neutral-900">Employment Type Summary</h4>
				<ReportTable
					columns={[
						{
							key: "employmentType",
							header: "Employment Type",
							render: (row) => (
								<EmployeeDrillLink
									count={row.headcount}
									input={{ employmentType: row.employmentType as any }}>
									{formatEmploymentTypeLabel(row.employmentType)}
								</EmployeeDrillLink>
							),
						},
						{
							key: "headcount",
							header: "Headcount",
							align: "right",
							render: (row) => (
								<EmployeeDrillLink
									count={row.headcount}
									input={{ employmentType: row.employmentType as any }}>
									{formatNumber(row.headcount)}
								</EmployeeDrillLink>
							),
						},
						{
							key: "direct",
							header: "Direct",
							align: "right",
							render: (row) => (
								<EmployeeDrillLink
									count={row.direct}
									input={{ employmentType: row.employmentType as any, workforceSource: "DIRECT" }}>
									{formatNumber(row.direct)}
								</EmployeeDrillLink>
							),
						},
						{
							key: "agency",
							header: "Agency",
							align: "right",
							render: (row) => (
								<EmployeeDrillLink
									count={row.agency}
									input={{ employmentType: row.employmentType as any, workforceSource: "AGENCY" }}>
									{formatNumber(row.agency)}
								</EmployeeDrillLink>
							),
						},
						{ key: "positions", header: "Positions", accessor: "positions", align: "right", valueType: "number" },
					]}
					rows={employmentTypeRows}
					getRowKey={(row) => row.employmentType}
					emptyMessage="No employment type summary rows found"
				/>
			</div>
		</section>
	);
}
```

```tsx
// app/routes/hr/reports/tabs/ManpowerDistributionTab.tsx
import {
	buildManpowerDatabank,
	getActiveManpowerEmployees,
} from "~/lib/utils/manpower-databank";
import { ManpowerDatabankSection } from "./ManpowerDatabankSection";

const rosterEmployees = useMemo(
	() => getEmployeesFromResponse(employeesData),
	[employeesData],
);
const activeEmployees = useMemo(
	() => getActiveManpowerEmployees(rosterEmployees),
	[rosterEmployees],
);
const databank = useMemo(
	() => buildManpowerDatabank(rosterEmployees),
	[rosterEmployees],
);

const distribution = useMemo(() => {
	const genderMap = new Map<string, GenderRow>();
	const agencyMap = new Map<string, AgencyRow>();
	const directAgencyMap = new Map<string, DirectAgencyRow>();
	let directTotal = 0;
	let agencyTotal = 0;

	activeEmployees.forEach((employee) => {
		const department = getDepartmentName(employee);
		const departmentId = getDepartmentId(employee);
		const section = getSectionName(employee);
		const sectionId = getSectionId(employee);
		const gender = getGender(employee);
		const isAgency = employee.workforceSource === "AGENCY";

		if (isAgency) agencyTotal += 1;
		else directTotal += 1;

		const genderRow =
			genderMap.get(department) ||
			({
				department,
				departmentId,
				female: 0,
				male: 0,
				unknown: 0,
				total: 0,
				direct: 0,
				agency: 0,
			} satisfies GenderRow);
		genderRow[gender] += 1;
		if (gender !== "unknown") {
			genderRow.total += 1;
		}
		if (isAgency) genderRow.agency += 1;
		else genderRow.direct += 1;
		genderMap.set(department, genderRow);

		if (isAgency) {
			const agency = getAgencyName(employee);
			const agencyRow =
				agencyMap.get(agency) ||
				({
					agency,
					female: 0,
					male: 0,
					unknown: 0,
					headcount: 0,
					departments: 0,
					sections: 0,
				} satisfies AgencyRow);
			agencyRow[gender] += 1;
			agencyRow.headcount += 1;
			agencyMap.set(agency, agencyRow);
		}

		const directAgencyKey = `${departmentId || department}:::${sectionId || section}`;
		const directAgencyRow =
			directAgencyMap.get(directAgencyKey) ||
			({
				department,
				departmentId,
				section,
				sectionId,
				direct: 0,
				agency: 0,
				total: 0,
			} satisfies DirectAgencyRow);
		if (isAgency) directAgencyRow.agency += 1;
		else directAgencyRow.direct += 1;
		directAgencyRow.total += 1;
		directAgencyMap.set(directAgencyKey, directAgencyRow);
	});

	const agencyEmployeesByName = new Map<string, Employee[]>();
	activeEmployees
		.filter((employee) => employee.workforceSource === "AGENCY")
		.forEach((employee) => {
			const agency = getAgencyName(employee);
			agencyEmployeesByName.set(agency, [...(agencyEmployeesByName.get(agency) || []), employee]);
		});

	agencyMap.forEach((row, agency) => {
		const agencyEmployees = agencyEmployeesByName.get(agency) || [];
		row.departments = new Set(agencyEmployees.map(getDepartmentName)).size;
		row.sections = new Set(agencyEmployees.map(getSectionName)).size;
	});

	const total = directTotal + agencyTotal;
	const totalManpowerRows: TotalManpowerRow[] = [
		{
			source: "Direct",
			headcount: directTotal,
			share: total ? `${((directTotal / total) * 100).toFixed(1)}%` : "0.0%",
		},
		{
			source: "Agency",
			headcount: agencyTotal,
			share: total ? `${((agencyTotal / total) * 100).toFixed(1)}%` : "0.0%",
		},
		{ source: "Total", headcount: total, share: "100.0%" },
	];

	return {
		genderRows: Array.from(genderMap.values())
			.filter((row) => row.total > 0)
			.sort((a, b) => a.department.localeCompare(b.department)),
		agencyRows: Array.from(agencyMap.values()).sort((a, b) => b.headcount - a.headcount),
		directAgencyRows: Array.from(directAgencyMap.values()).sort((a, b) =>
			`${a.department} ${a.section}`.localeCompare(`${b.department} ${b.section}`),
		),
		totalManpowerRows,
		total,
		directTotal,
		agencyTotal,
		genderKnownTotal: Array.from(genderMap.values()).reduce((sum, row) => sum + row.total, 0),
		femaleTotal: Array.from(genderMap.values()).reduce((sum, row) => sum + row.female, 0),
		maleTotal: Array.from(genderMap.values()).reduce((sum, row) => sum + row.male, 0),
		unknownGenderTotal: Array.from(genderMap.values()).reduce(
			(sum, row) => sum + row.unknown,
			0,
		),
	};
}, [activeEmployees]);

// inside the rendered sections
<section className="space-y-3">
	<h3 className="text-sm font-semibold text-neutral-900">Agency Direct Headcount</h3>
	<ReportTable
		columns={directAgencyColumns}
		rows={distribution.directAgencyRows}
		getRowKey={(row) => `${row.department}-${row.section}`}
		emptyMessage="No direct/agency headcount rows found"
	/>
</section>

<ManpowerDatabankSection
	positionRows={databank.positionRows}
	employmentTypeRows={databank.employmentTypeRows}
/>

<section className="space-y-3">
	<h3 className="text-sm font-semibold text-neutral-900">Total Manpower</h3>
	<ReportTable
		columns={totalManpowerColumns}
		rows={distribution.totalManpowerRows}
		getRowKey={(row) => row.source}
		emptyMessage="No total manpower rows found"
	/>
</section>
```

Implementation notes:

- Do not recompute databank rows inside the section component.
- Keep `ManpowerDistributionTab` as the parent orchestrator and `ManpowerDatabankSection` as the focused renderer.
- Use plain text for the `Unassigned position` label in v1, not a null-position deep link.

- [ ] **Step 4: Run the section test and the touched report tests**

Run:

```bash
npm run test -- app/routes/hr/reports/tabs/ManpowerDatabankSection.test.tsx app/lib/utils/manpower-databank.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit the UI pass**

```bash
git add app/routes/hr/reports/tabs/ManpowerDatabankSection.tsx app/routes/hr/reports/tabs/ManpowerDatabankSection.test.tsx app/routes/hr/reports/tabs/ManpowerDistributionTab.tsx
git commit -m "feat: add manpower databank report section"
```

---

### Task 4: Extend manpower export sheets and lock the parent report integration

**Files:**
- Create: `app/routes/hr/reports/tabs/ManpowerDistributionTab.test.tsx`
- Modify: `app/routes/hr/reports/tabs/ManpowerDistributionTab.tsx`

- [ ] **Step 1: Write the failing parent integration test**

```tsx
// app/routes/hr/reports/tabs/ManpowerDistributionTab.test.tsx
// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { useQuery } from "@tanstack/react-query";
import { useEmployees } from "~/lib/hooks/useEmployees";
import { exportReport } from "~/lib/utils/report-export";
import { ManpowerDistributionTab } from "./ManpowerDistributionTab";

vi.mock("~/lib/hooks/useEmployees", () => ({
	useEmployees: vi.fn(),
}));

vi.mock("@tanstack/react-query", async () => {
	const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
		"@tanstack/react-query",
	);
	return {
		...actual,
		useQuery: vi.fn(),
	};
});

vi.mock("~/lib/utils/report-export", async () => {
	const actual = await vi.importActual<typeof import("~/lib/utils/report-export")>(
		"~/lib/utils/report-export",
	);
	return {
		...actual,
		exportReport: vi.fn(() => Promise.resolve()),
	};
});

describe("ManpowerDistributionTab export", () => {
	it("includes databank sheets in the workforce export config", async () => {
		vi.mocked(useEmployees).mockReturnValue({
			data: {
				employees: [
					{
						id: "employee-1",
						organizationId: "org-1",
						employeeId: "EMP-001",
						personId: "person-1",
						userId: "user-1",
						employmentHireDate: "2026-01-01",
						employmentStatus: "ACTIVE",
						employmentType: "REGULAR",
						departmentId: "dept-1",
						positionId: "position-operator",
						workLocation: "ONSITE",
						basicSalary: 0,
						currency: "PHP",
						payFrequency: "SEMI_MONTHLY",
						isDeleted: false,
						isTour: false,
						createdAt: "2026-01-01T00:00:00.000Z",
						updatedAt: "2026-01-01T00:00:00.000Z",
						workforceSource: "DIRECT",
						department: {
							id: "dept-1",
							organizationId: "org-1",
							name: "Manufacturing",
							code: "MFG",
							managerId: "manager-1",
							isActive: true,
							isDefault: false,
							isDeleted: false,
							createdAt: "2026-01-01T00:00:00.000Z",
							updatedAt: "2026-01-01T00:00:00.000Z",
						},
						section: {
							id: "section-1",
							name: "Assembly",
							code: "ASSY",
							departmentId: "dept-1",
						},
						position: {
							id: "position-operator",
							organizationId: "org-1",
							title: "Operator",
							code: "OPR",
							departmentId: "dept-1",
							isActive: true,
							isDeleted: false,
							createdAt: "2026-01-01T00:00:00.000Z",
							updatedAt: "2026-01-01T00:00:00.000Z",
						},
					},
				],
			},
			isLoading: false,
			error: null,
		} as any);

		vi.mocked(useQuery).mockReturnValue({
			data: {
				directAgencySnapshot: {
					date: "2026-04-30",
					direct: 1,
					agency: 0,
					total: 1,
				},
			},
			isLoading: false,
			error: null,
		} as any);

		render(
			<MemoryRouter>
				<ManpowerDistributionTab />
			</MemoryRouter>,
		);

		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "Export" }));
		await user.click(screen.getByRole("button", { name: "Export XLSX" }));

		await waitFor(() => {
			expect(exportReport).toHaveBeenCalledWith(
				expect.objectContaining({
					format: "xlsx",
					config: expect.objectContaining({
						xlsxSheets: expect.arrayContaining([
							expect.objectContaining({ name: "Position Summary" }),
							expect.objectContaining({ name: "Employment Type Summary" }),
						]),
					}),
				}),
			);
		});
	});
});
```

- [ ] **Step 2: Run the parent integration test to verify it fails**

Run:

```bash
npm run test -- app/routes/hr/reports/tabs/ManpowerDistributionTab.test.tsx
```

Expected: FAIL because the databank export sheets do not exist yet.

- [ ] **Step 3: Implement the export sheet wiring in the parent report**

```ts
// app/routes/hr/reports/tabs/ManpowerDistributionTab.tsx
import type {
	ManpowerDatabankEmploymentTypeRow,
	ManpowerDatabankPositionRow,
} from "~/lib/utils/manpower-databank";

const positionExportColumns: ReportExportColumn<ManpowerDatabankPositionRow>[] = [
	{ header: "Position", accessor: "position" },
	{ header: "Headcount", accessor: "headcount", align: "right", valueType: "number" },
	{ header: "Direct", accessor: "direct", align: "right", valueType: "number" },
	{ header: "Agency", accessor: "agency", align: "right", valueType: "number" },
	{ header: "Departments", accessor: "departments", align: "right", valueType: "number" },
	{ header: "Sections", accessor: "sections", align: "right", valueType: "number" },
	{ header: "Employment Type Mix", accessor: "employmentTypeMix" },
];

const employmentTypeExportColumns: ReportExportColumn<ManpowerDatabankEmploymentTypeRow>[] = [
	{
		header: "Employment Type",
		accessor: (row) => formatEmploymentTypeLabel(row.employmentType),
	},
	{ header: "Headcount", accessor: "headcount", align: "right", valueType: "number" },
	{ header: "Direct", accessor: "direct", align: "right", valueType: "number" },
	{ header: "Agency", accessor: "agency", align: "right", valueType: "number" },
	{ header: "Positions", accessor: "positions", align: "right", valueType: "number" },
];

const openExportModal = () => {
	if (
		!distribution.genderRows.length &&
		!distribution.agencyRows.length &&
		!databank.positionRows.length &&
		!databank.employmentTypeRows.length
	) {
		toast.error("No manpower distribution rows available to export.");
		return;
	}

	setIsExportModalOpen(true);
};

const handleExport = async (format: ReportExportFormat) => {
	await exportReport({
		format,
		config: {
			reportKey: "workforce-manpower-distribution",
			title: "Monthly Manpower Distribution",
			fileBaseName,
			rows: distribution.genderRows,
			columns: genderExportColumns,
			filtersSummary: exportReferenceNotes,
			summaryRows: [
				{ label: "Total Manpower", value: distribution.total },
				{ label: "Direct", value: distribution.directTotal },
				{ label: "Agency", value: distribution.agencyTotal },
				{ label: "Positions", value: databank.positionRows.length },
			],
			orientation: "landscape",
			xlsxSheets: [
				{
					name: "Gender Summary",
					title: "Gender Summary",
					rows: distribution.genderRows,
					columns: genderExportColumns,
					summaryRows: [
						{ label: "Female", value: distribution.femaleTotal },
						{ label: "Male", value: distribution.maleTotal },
						{ label: "Grand Total", value: distribution.genderKnownTotal },
					],
				},
				{
					name: "Agency Summary",
					title: "Agency Summary",
					rows: distribution.agencyRows,
					columns: agencyExportColumns,
					summaryRows: [
						{ label: "Agency Headcount", value: distribution.agencyTotal },
						{ label: "Agency Count", value: distribution.agencyRows.length },
					],
					emptyStateMessage: "No agency employees found",
				},
				{
					name: "Agency Direct Headcount",
					title: "Agency Direct Headcount",
					rows: distribution.directAgencyRows,
					columns: directAgencyExportColumns,
					summaryRows: [
						{ label: "Direct", value: distribution.directTotal },
						{ label: "Agency", value: distribution.agencyTotal },
						{ label: "Total", value: distribution.total },
					],
				},
				{
					name: "Total Manpower",
					title: "Total Manpower",
					rows: distribution.totalManpowerRows,
					columns: totalManpowerExportColumns,
					summaryRows: [{ label: "Total Manpower", value: distribution.total }],
				},
				{
					name: "Position Summary",
					title: "Position Summary",
					rows: databank.positionRows,
					columns: positionExportColumns,
					summaryRows: [
						{ label: "Position Rows", value: databank.positionRows.length },
						{ label: "Total Headcount", value: distribution.total },
					],
					emptyStateMessage: "No position summary rows found",
				},
				{
					name: "Employment Type Summary",
					title: "Employment Type Summary",
					rows: databank.employmentTypeRows,
					columns: employmentTypeExportColumns,
					summaryRows: [
						{ label: "Employment Type Rows", value: databank.employmentTypeRows.length },
						{ label: "Total Headcount", value: distribution.total },
					],
					emptyStateMessage: "No employment type summary rows found",
				},
			],
		},
	});

	setIsExportModalOpen(false);
};
```

Implementation notes:

- Do not create a second export button for the databank.
- Keep the existing report key and modal flow.
- Use the databank sheet names exactly as the spec says so downstream evidence and reviewer screenshots stay aligned.

- [ ] **Step 4: Run the parent report test and the full focused suite**

Run:

```bash
npm run test -- app/routes/hr/reports/tabs/ManpowerDistributionTab.test.tsx app/routes/hr/reports/tabs/ManpowerDatabankSection.test.tsx app/lib/utils/manpower-databank.test.ts app/lib/utils/manpower-distribution-links.test.ts app/components/shared/EmployeeList.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit the export pass**

```bash
git add app/routes/hr/reports/tabs/ManpowerDistributionTab.tsx app/routes/hr/reports/tabs/ManpowerDistributionTab.test.tsx
git commit -m "feat: add manpower databank export coverage"
```

---

### Task 5: Validate the branch and sync the workspace task log

**Files:**
- Modify: `.wwg/workspace/current-task.md`

- [ ] **Step 1: Update the workspace task log with implementation evidence**

```md
## Workforce Manpower Databank And Per-Position Lists

- Status: COMPLETE.
- Task mode: meaningful feature implementation.
- Delivery mode: AI-agent.
- User request:
  - Implement the existing workforce report extension `Workforce: manpower databank and per-position lists`.
- Follow-through:
  - Normalized manpower drilldown filters so workforce reports can deep-link by `positionId`, `employmentType`, `workforceSource`, and `agency`.
  - Added `app/lib/utils/manpower-databank.ts` to build active-manpower position and employment-type summaries from the same full-roster query already used by the workforce report.
  - Added `ManpowerDatabankSection` under the existing `Manpower Distribution` tab with position-level headcount, compact employment-type mix text, and dedicated employment-type summary rows.
  - Extended the manpower export config with `Position Summary` and `Employment Type Summary` sheets.
- Validation:
  - Passed: `npm run test -- app/lib/utils/manpower-distribution-links.test.ts app/lib/utils/manpower-databank.test.ts app/components/shared/EmployeeList.test.tsx app/routes/hr/reports/tabs/ManpowerDatabankSection.test.tsx app/routes/hr/reports/tabs/ManpowerDistributionTab.test.tsx`.
  - Passed: `npm run typecheck:test`.
  - Passed: `npm run typecheck`.
  - Passed: `npm run quality:ci`.
- Recommendations:
  - No new recommendations were identified.
```

- [ ] **Step 2: Run the focused validation set**

Run:

```bash
npm run test -- app/lib/utils/manpower-distribution-links.test.ts app/lib/utils/manpower-databank.test.ts app/components/shared/EmployeeList.test.tsx app/routes/hr/reports/tabs/ManpowerDatabankSection.test.tsx app/routes/hr/reports/tabs/ManpowerDistributionTab.test.tsx
npm run typecheck:test
```

Expected: PASS

- [ ] **Step 3: Run the broader app gates**

Run:

```bash
npm run typecheck
npm run quality:ci
```

Expected: PASS, with only pre-existing non-blocking warnings if any remain.

- [ ] **Step 4: Perform the close-out self-check**

Checklist:

- Confirm the databank still lives only in `/hr/reports/workforce?tab=labor`
- Confirm no new route, schema, or backend endpoint was introduced
- Confirm `agency` is the only manpower drilldown input name left in touched report files
- Confirm `Unassigned position` is visible when fixture data lacks a position
- Confirm the export sheets are named `Position Summary` and `Employment Type Summary`

- [ ] **Step 5: Commit the validation and task-log sync**

```bash
git add .wwg/workspace/current-task.md
git commit -m "docs: record manpower databank implementation evidence"
```

---

## Self-Review

- Spec coverage:
  - drilldown contract: Task 1
  - full-roster query reuse and aggregation correctness: Task 2 and Task 3
  - extracted databank UI: Task 3
  - export sheets: Task 4
  - validation and WWG sync: Task 5
- Placeholder scan:
  - no `TBD`, `TODO`, or “similar to task N” shortcuts remain
- Type consistency:
  - `agency`, `positionId`, `employmentType`, `ManpowerDatabankPositionRow`, and `ManpowerDatabankEmploymentTypeRow` are used consistently throughout the plan
