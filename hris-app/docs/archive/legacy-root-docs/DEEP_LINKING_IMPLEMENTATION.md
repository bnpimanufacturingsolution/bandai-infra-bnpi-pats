# Deep Linking Implementation for Leave Request Forms

## Overview

This implementation enables seamless deep linking between the calendar view and leave request forms, allowing users to:

- Visualize selected dates on the calendar before submitting
- Return to the form with pre-filled dates and leave type
- Save form state before navigating to calendar visualization

## Key Features

### 1. **Form-to-Calendar Navigation**

When users click "Visualise on Calendar" in the leave request form, the app navigates to the calendar with:

- Selected leave type
- Start and end dates
- Return path for back navigation
- Modal action to reopen the form

**URL Pattern:**

```
/calendar?type=leave&leaveType=Vacation+Leave&startDate=2026-02-03&endDate=2026-02-07&from=employee-requests-leave&modalAction=create
```

### 2. **Calendar-to-Form Deep Linking**

When users click the back button on the calendar, they return to the leave form with:

- All previously selected dates preserved
- Leave type pre-selected
- Modal automatically opens in create mode

**URL Pattern:**

```
/employee/requests/leave?action=create&leaveType=Vacation+Leave&startDate=2026-02-03&endDate=2026-02-07
```

### 3. **Utility Functions**

All deep linking logic is centralized in `app/lib/utils/deep-linking.ts`:

#### Main Functions:

- `extractDeepLinkParams()` - Extracts and validates URL parameters
- `buildCalendarViewDeepLink()` - Creates calendar navigation URL
- `buildLeaveFormDeepLink()` - Creates form navigation URL
- `buildReturnToFormUrl()` - Creates return URL from calendar
- `decodeFromParam()` / `encodeFromParam()` - Handles path encoding/decoding
- `isValidDateFormat()` - Validates date format (YYYY-MM-DD)
- `isValidDateRange()` - Validates start/end date relationship

## Implementation Details

### Files Modified:

#### 1. **`app/components/organisms/leave-request-modal.tsx`**

**Changes:**

- Added props: `initialLeaveType?`, `initialStartDate?`, `initialEndDate?`
- Added `useEffect` to populate form fields from URL params when modal opens
- Updated "Visualise on Calendar" link to use `buildCalendarViewDeepLink()` utility

**Flow:**

1. Modal receives initial values from URL params
2. Form fields are pre-populated
3. User can modify dates and leave type
4. "Visualise on Calendar" link includes current values

#### 2. **`app/components/templates/requests/leave-template.tsx`**

**Changes:**

- Extract deep link params from URL: `leaveType`, `startDate`, `endDate`
- Pass extracted params to `LeaveRequestModal` component
- Modal automatically opens in "create" mode when `action=create` in URL

**Flow:**

1. Extract params from URL search params
2. Pass to LeaveRequestModal
3. Modal pre-fills form fields
4. User sees pre-selected dates and leave type

#### 3. **`app/routes/calendar.tsx`**

**Changes:**

- Import `buildReturnToFormUrl` utility
- Updated `handleBack()` function to use utility
- Passes leave type and dates when navigating back to form

**Flow:**

1. User is on calendar with leave details in URL
2. Clicks back button
3. `handleBack()` calls `buildReturnToFormUrl()`
4. Navigates to form with all parameters preserved

#### 4. **`app/lib/utils/deep-linking.ts`** (NEW FILE)

**Purpose:** Centralized deep linking utilities with:

- Type definitions for deep link parameters
- Date validation functions
- URL building functions
- Parameter extraction logic

## Usage Examples

### Example 1: Navigate from Form to Calendar

```typescript
import { buildCalendarViewDeepLink } from "~/lib/utils/deep-linking";

// In the form component:
const link = buildCalendarViewDeepLink(
	"Vacation Leave",
	"2026-02-03",
	"2026-02-07",
	"employee-requests-leave",
	"create",
);
// Result: /calendar?type=leave&leaveType=Vacation+Leave&startDate=2026-02-03&endDate=2026-02-07&from=employee-requests-leave&modalAction=create
```

### Example 2: Navigate from Calendar Back to Form

```typescript
import { buildReturnToFormUrl } from "~/lib/utils/deep-linking";

// In the calendar component:
const returnUrl = buildReturnToFormUrl(
	"employee-requests-leave",
	"Vacation Leave",
	"2026-02-03",
	"2026-02-07",
);
// Result: /employee/requests/leave?action=create&leaveType=Vacation+Leave&startDate=2026-02-03&endDate=2026-02-07
```

### Example 3: Extract Parameters

```typescript
import { extractDeepLinkParams } from "~/lib/utils/deep-linking";

const params = extractDeepLinkParams(searchParams);
console.log(params);
// {
//   leaveType: "Vacation Leave",
//   startDate: "2026-02-03",
//   endDate: "2026-02-07",
//   from: "employee-requests-leave",
//   modalAction: "create",
//   action: undefined
// }
```

## User Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│  Employee Leave Requests Page                            │
│  /employee/requests/leave                                │
└──────────────────┬──────────────────────────────────────┘
                   │ Click "New Request"
                   ▼
┌─────────────────────────────────────────────────────────┐
│  Leave Request Modal (Create Mode)                       │
│  - Select Leave Type                                     │
│  - Select Start Date (2026-02-03)                        │
│  - Select End Date (2026-02-07)                          │
│  - Enter Description                                     │
└──────────────────┬──────────────────────────────────────┘
                   │ Click "Visualise on Calendar"
                   ▼ (saves to URL params)
┌─────────────────────────────────────────────────────────┐
│  Calendar View (Leave Preview)                           │
│  /calendar?type=leave&leaveType=Vacation+Leave...       │
│  - Shows calendar with selected date range highlighted  │
│  - Shows leave conflicts, holidays, etc.                │
└──────────────────┬──────────────────────────────────────┘
                   │ Click Back
                   ▼ (restores params)
┌─────────────────────────────────────────────────────────┐
│  Back to Leave Request Modal                             │
│  /employee/requests/leave?action=create&...             │
│  - Modal reopens with SAME VALUES pre-filled           │
│  - Can resume editing or submit                         │
└─────────────────────────────────────────────────────────┘
```

## Date Handling

### Format

- Internal format: `YYYY-MM-DD` (ISO 8601)
- Always validated before use
- Timezone-safe (uses date parts, not timestamps)

### Validation

```typescript
// Valid dates
isValidDateFormat("2026-02-03"); // true
isValidDateRange("2026-02-03", "2026-02-07"); // true

// Invalid dates
isValidDateFormat("02/03/2026"); // false
isValidDateRange("2026-02-07", "2026-02-03"); // false
```

## Query Parameters

### Calendar URL Parameters

| Parameter     | Type   | Purpose                                               |
| ------------- | ------ | ----------------------------------------------------- |
| `type`        | string | View type: "leave"                                    |
| `leaveType`   | string | Leave type (e.g., "Vacation Leave")                   |
| `startDate`   | string | Start date (YYYY-MM-DD)                               |
| `endDate`     | string | End date (YYYY-MM-DD)                                 |
| `from`        | string | Encoded origin path (e.g., "employee-requests-leave") |
| `modalAction` | string | Action on return: "create", "view", etc.              |

### Form URL Parameters

| Parameter   | Type   | Purpose                        |
| ----------- | ------ | ------------------------------ |
| `action`    | string | Modal action: "create", "view" |
| `leaveType` | string | Pre-selected leave type        |
| `startDate` | string | Pre-filled start date          |
| `endDate`   | string | Pre-filled end date            |

## Benefits

1. **Improved UX**: Users can visualize leave dates before submitting
2. **State Preservation**: Form values are preserved when navigating
3. **Deep Linking**: URLs are shareable and bookmarkable
4. **Type Safety**: Centralized validation and type definitions
5. **Maintainability**: All logic in one utility file
6. **Reusability**: Utilities can be used across multiple components

## Testing Checklist

- [ ] Navigate from form to calendar with dates
- [ ] Verify all dates appear in URL parameters
- [ ] Click back button on calendar
- [ ] Verify form reopens with pre-filled dates
- [ ] Modify dates in calendar view (if applicable)
- [ ] Verify modified dates persist when returning
- [ ] Test with different leave types
- [ ] Test date validation (invalid dates should be ignored)
- [ ] Test navigation from deep links directly via URL bar
- [ ] Test mobile responsiveness

## Edge Cases Handled

1. **Missing Parameters**: Invalid or missing dates are gracefully ignored
2. **Timezone Issues**: Uses date string format (YYYY-MM-DD) to avoid timezone confusion
3. **Invalid Date Ranges**: End date before start date is rejected
4. **Path Encoding**: Special characters in paths are properly encoded/decoded
5. **Malformed URLs**: Invalid URLs don't break the application

## Future Enhancements

1. Add support for multiple date ranges in one view
2. Add support for recurring leave patterns
3. Store leave draft in localStorage for auto-recovery
4. Add analytics tracking for form abandonment
5. Add undo/redo for date selections
