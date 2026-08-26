# Attendance Fix Front Door Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one HR `Fix Attendance` front door that switches between `Correct attendance`, `Create missing attendance`, and the locked-period `TIME_ADJUSTMENT` exception flow without making the app guess at payroll policy.

**Architecture:** Keep the app responsible for mode selection and user flow, and keep the API responsible for row-creation semantics. Same-day fixes stay on the existing correction helper, while missing-day fixes use a dedicated create-first helper that reuses the same normalization and downstream refresh pipeline without supersession. If the API reports a locked payroll period, the app should not write directly; it should redirect the user into the existing `TIME_ADJUSTMENT` request flow with the current date prefilled.

**Tech Stack:** TypeScript, React Router, React Query, Express, Prisma, Zod, Vitest, Playwright.

---

## File Structure

- Create `../hris-api/app/attendance/attendance-backfill.service.ts`: create-first attendance mutation for missing days.
- Modify `../hris-api/app/attendance/attendance.controller.ts`: add a backfill handler that calls the new helper.
- Modify `../hris-api/app/attendance/attendance.router.ts`: expose `POST /attendance/backfill`.
- Modify `../hris-api/zod/attendance.zod.ts`: add a backfill schema that reuses the correction rules but does not require `attendanceId`.
- Modify `../hris-api/tests/attendance-backfill.service.spec.ts`: lock the create-first behavior, no-supersession behavior, and downstream refresh behavior.
- Modify `app/components/organisms/attendance/FixAttendanceLauncher.tsx`: new page-level launcher modal for missing-day entry.
- Modify `app/components/templates/common/attendance-management-template.tsx`: add the `Fix Attendance` CTA and keep row actions explicit.
- Modify `app/routes/hr/time-corrections.tsx`: make the form mode-aware so it can run correction or backfill.
- Modify `app/services/attendance.service.ts`: add the backfill API client method and payload type.
- Modify `app/lib/hooks/useAttendances.ts`: add a backfill mutation hook that reuses attendance list invalidation.
- Modify `app/services/attendance.service.test.ts`, `app/components/templates/common/attendance-management-template.test.tsx`, `app/routes/hr/time-corrections.test.ts`, and `app/lib/hooks/useAttendances.test.tsx` if created: add regression coverage for the new branch and labels.
- Modify `tests/smoke/hr-attendance-fix-attendance.spec.ts`: add deterministic browser coverage for the new HR front door.
- Modify `docs/attendance-correction-feature-summary.md`, `docs/attendance-time-correction-context.md`, `docs/attendance-time-correction-implementation-plan.md`, `DOCUMENTATION_INDEX.md`, and `.wwg/workspace/current-task.md`: sync the durable docs and task state after implementation.

## Task 1: Add the backend backfill mutation path

**Files:**
- Create: `../hris-api/app/attendance/attendance-backfill.service.ts`
- Modify: `../hris-api/app/attendance/attendance.controller.ts`
- Modify: `../hris-api/app/attendance/attendance.router.ts`
- Modify: `../hris-api/zod/attendance.zod.ts`
- Test: `../hris-api/tests/attendance-backfill.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("creates the first attendance row for a missing day without requiring attendanceId", async () => {
  const result = await applyAttendanceBackfill({
    prisma,
    organizationId: "org-1",
    rawInput: {
      employeeId: VALID_EMPLOYEE_ID,
      correctionDate: "2026-06-26",
      status: "PRESENT",
      timeIn: "08:00",
      timeOut: "17:00",
      reasonCategory: "MISSED_PUNCH",
      notes: "Backfilled by HR",
    },
    source: "HR_DIRECT_BACKFILL",
    actorEmployeeId: VALID_ACTOR_ID,
  });

  expect(result.createdAttendance.ledgerType).to.equal("RAW");
  expect(result.createdAttendance.isEffective).to.equal(true);
  expect(result.rawAttendance).to.equal(null);
  expect(result.attendanceHistory).to.have.length(1);
});
```

- [ ] **Step 2: Run the API test to verify it fails**

Run: `cd ../hris-api && npm test -- tests/attendance-backfill.service.spec.ts`

Expected: FAIL because the backfill helper, schema, and route do not exist yet.

- [ ] **Step 3: Implement the backfill helper and route**

```ts
// ../hris-api/app/attendance/attendance.router.ts
routes.post("/backfill", controller.createBackfill);
```

```ts
// ../hris-api/app/attendance/attendance.controller.ts
const backfillResult = await applyAttendanceBackfill({
  prisma,
  organizationId,
  rawInput: validation.data,
  source: "HR_DIRECT_BACKFILL",
  actorEmployeeId: appliedByEmployeeId,
});
```

Implementation notes:
- Reuse the same date normalization, status classification, reason-category allowlist, attendance-obligation refresh, timesheet refresh, and cache invalidation pipeline as the correction helper.
- Do not supersede an existing same-day row.
- Reject the request if a same-day attendance row already exists, because this path is create-first only.
- Keep provenance explicit by tagging the source as `HR_DIRECT_BACKFILL`.

- [ ] **Step 4: Run the focused API tests again**

Run:

```bash
cd ../hris-api
npm test -- tests/attendance-backfill.service.spec.ts tests/attendance-correction.service.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the API change**

```bash
cd ../hris-api
git add app/attendance/attendance-backfill.service.ts app/attendance/attendance.controller.ts app/attendance/attendance.router.ts zod/attendance.zod.ts tests/attendance-backfill.service.spec.ts
git commit -m "feat: add attendance backfill mutation"
```

---

## Task 2: Add the app client and mutation hook for backfill

**Files:**
- Modify: `app/services/attendance.service.ts`
- Modify: `app/lib/hooks/useAttendances.ts`
- Test: `app/services/attendance.service.test.ts`
- Test: `app/lib/hooks/useAttendances.test.tsx` if created

- [ ] **Step 1: Write the failing service test**

```ts
it("posts attendance backfills to the dedicated HRIS endpoint", async () => {
  const { default: attendanceService } = await import("./attendance.service");
  hrisPostMock.mockResolvedValueOnce({
    data: {
      data: {
        attendance: { id: "attendance-backfill-1", ledgerType: "RAW" },
      },
    },
  });

  const result = await attendanceService.createAttendanceBackfill({
    employeeId: "employee-1",
    correctionDate: "2026-06-26",
    status: "PRESENT",
    timeIn: "2026-06-26T08:00:00.000Z",
    timeOut: "2026-06-26T17:00:00.000Z",
    reasonCategory: "MISSED_PUNCH",
    notes: "Missing attendance backfilled by HR",
  });

  expect(hrisPostMock).toHaveBeenCalledWith("/api/attendance/backfill", expect.any(Object));
  expect(result.id).toBe("attendance-backfill-1");
});
```

- [ ] **Step 2: Run the focused app test to verify it fails**

Run: `npm run test -- app/services/attendance.service.test.ts`

Expected: FAIL because `createAttendanceBackfill` does not exist yet.

- [ ] **Step 3: Implement the client method and hook**

```ts
export interface CreateAttendanceBackfillPayload {
  employeeId: string;
  correctionDate: string;
  status: "PRESENT" | "LEAVE" | "INCOMPLETE" | "ABSENT" | "REST_DAY";
  timeIn?: string;
  timeOut?: string;
  reasonCategory: AttendanceCorrectionReasonCategory;
  notes: string;
}

async createAttendanceBackfill(
  payload: CreateAttendanceBackfillPayload,
): Promise<Attendance> {
  const response = await hrisApiClient.post<{ data: { attendance: Attendance } }>(
    "/api/attendance/backfill",
    payload,
  );

  const attendanceData = response.data?.data?.attendance || (response.data as any)?.attendance;
  if (!attendanceData) throw new Error("Failed to create attendance backfill");
  return attendanceData as Attendance;
}
```

```ts
export const useCreateAttendanceBackfill = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAttendanceBackfillPayload) =>
      attendanceService.createAttendanceBackfill(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.attendances.all });
    },
    onError: (error: any) => {
      sonnerToast.error(error?.message || "Failed to create attendance backfill");
    },
  });
};
```

Implementation notes:
- Keep the correction mutation intact.
- Keep query invalidation scoped to `queryKeys.attendances.all` so both correction and backfill refresh the same list.
- Use the same payload fields as correction except for `attendanceId`.

- [ ] **Step 4: Run the app service and hook tests again**

Run:

```bash
npm run test -- app/services/attendance.service.test.ts app/lib/hooks/useAttendances.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the app client change**

```bash
git add app/services/attendance.service.ts app/lib/hooks/useAttendances.ts app/services/attendance.service.test.ts app/lib/hooks/useAttendances.test.tsx
git commit -m "feat: add attendance backfill client flow"
```

---

## Task 3: Add the HR front door and mode-aware attendance fix form

**Files:**
- Create: `app/components/organisms/attendance/FixAttendanceLauncher.tsx`
- Modify: `app/components/templates/common/attendance-management-template.tsx`
- Modify: `app/routes/hr/time-corrections.tsx`
- Modify: `app/components/templates/common/attendance-management-template.test.tsx`
- Modify: `app/routes/hr/time-corrections.test.ts`

- [ ] **Step 1: Write the failing UI tests**

```ts
it("shows a Fix Attendance title action on the attendance management page", async () => {
  render(<AttendanceManagement title="Attendance Management" description="View records" />);

  expect(await screen.findByRole("button", { name: "Fix Attendance" })).toBeInTheDocument();
});

it("switches the HR fix form between correction and backfill modes", async () => {
  render(
    <MemoryRouter initialEntries={["/hr/time-corrections?action=create&mode=backfill"]}>
      <Routes>
        <Route path="/hr/time-corrections" element={<HRTimeCorrectionsPage />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(await screen.findByText("Create missing attendance")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Apply Attendance Backfill" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused UI tests to verify they fail**

Run:

```bash
npm run test -- app/components/templates/common/attendance-management-template.test.tsx app/routes/hr/time-corrections.test.ts
```

Expected: FAIL because the `Fix Attendance` launcher and mode-aware labels do not exist yet.

- [ ] **Step 3: Implement the launcher, title action, and mode switch**

```tsx
<DataTable
  ...
  titleActions={<Button onClick={openFixAttendance}>Fix Attendance</Button>}
/>
```

```ts
const mode = searchParams.get("mode") === "backfill" ? "backfill" : "correction";
const isBackfillMode = mode === "backfill";
const pageTitle = isBackfillMode ? "Create missing attendance" : "Correct attendance";
const submitLabel = isBackfillMode ? "Apply Attendance Backfill" : "Apply Attendance Correction";
```

Implementation notes:
- Put the new launch modal in `app/components/organisms/attendance/FixAttendanceLauncher.tsx` so `attendance-management-template.tsx` stays readable.
- Make row actions explicit: `Correct attendance` for same-day rows, `Fix Attendance` for the page-level launcher.
- Have the launcher collect employee and attendance date, then open `/hr/time-corrections?action=create&mode=...` with the selected context.
- When the backend returns a locked-period error, redirect to `/hr/requests/time-requests?type=TIME_ADJUSTMENT&tab=PENDING&action=create&date=YYYY-MM-DD`.
- Keep the error handling strict: do not silently fall back to a direct write when the API says the period is locked.

- [ ] **Step 4: Run the UI tests again**

Run:

```bash
npm run test -- app/components/templates/common/attendance-management-template.test.tsx app/routes/hr/time-corrections.test.ts app/services/attendance.service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the app UX change**

```bash
git add app/components/organisms/attendance/FixAttendanceLauncher.tsx app/components/templates/common/attendance-management-template.tsx app/routes/hr/time-corrections.tsx app/components/templates/common/attendance-management-template.test.tsx app/routes/hr/time-corrections.test.ts
git commit -m "feat: add fix attendance front door"
```

---

## Task 4: Add browser coverage, sync docs, and validate the full branch

**Files:**
- Create: `tests/smoke/hr-attendance-fix-attendance.spec.ts`
- Modify: `docs/attendance-correction-feature-summary.md`
- Modify: `docs/attendance-time-correction-context.md`
- Modify: `docs/attendance-time-correction-implementation-plan.md`
- Modify: `DOCUMENTATION_INDEX.md`
- Modify: `.wwg/workspace/current-task.md`

- [ ] **Step 1: Write the failing smoke test**

```ts
test("HR can open Fix Attendance and reach the backfill/correction flow", async ({ page }) => {
  await page.goto("/hr/attendance");
  await expect(page.getByRole("button", { name: "Fix Attendance" })).toBeVisible();
  await page.getByRole("button", { name: "Fix Attendance" }).click();
  await expect(page.getByText("Create missing attendance")).toBeVisible();
});
```

- [ ] **Step 2: Run the smoke test to verify it fails**

Run: `npm run test:e2e:smoke -- tests/smoke/hr-attendance-fix-attendance.spec.ts`

Expected: FAIL until the front door, mode labels, and route branching are implemented.

- [ ] **Step 3: Update the docs and task state**

Implementation notes:
- `docs/attendance-correction-feature-summary.md` should say the HR path now distinguishes backfill from correction and that locked periods route to `TIME_ADJUSTMENT`.
- `docs/attendance-time-correction-context.md` should keep the provisional policy visible and explicitly mention the backfill helper.
- `docs/attendance-time-correction-implementation-plan.md` should stop describing the missing-day case as an open question once the code lands.
- `DOCUMENTATION_INDEX.md` should gain a link to `docs/superpowers/plans/2026-06-26-attendance-fix-attendance-front-door.md`.
- `.wwg/workspace/current-task.md` should record the implementation branch and the validation status after the code lands.

- [ ] **Step 4: Run the full validation set**

Run:

```bash
npm run test:e2e:smoke -- tests/smoke/hr-attendance-fix-attendance.spec.ts
npm run quality:ci
cd ../hris-api && npm run test:ci:source-truth
cd ../hris-api && npm test -- tests/attendance-backfill.service.spec.ts tests/attendance-correction.service.spec.ts
```

Expected: PASS, with only the repo's existing non-blocking warnings remaining.

- [ ] **Step 5: Commit the docs and smoke update**

```bash
git add tests/smoke/hr-attendance-fix-attendance.spec.ts docs/attendance-correction-feature-summary.md docs/attendance-time-correction-context.md docs/attendance-time-correction-implementation-plan.md DOCUMENTATION_INDEX.md .wwg/workspace/current-task.md
git commit -m "docs: sync attendance fix front door"
```

---

## Self-Review

- No placeholders remain in the plan.
- The app/API split is explicit: the app owns the front door and fallback flow, and the API owns the missing-day write path.
- Every task has a concrete test command and a commit boundary.
- The locked-period branch does not depend on guessing lock state in the UI; it relies on structured API failure handling.

