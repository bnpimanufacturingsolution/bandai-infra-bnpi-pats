# Timesheet Edit Permission UI (Option A)

## Locked Editing Rule (Applies From First View)
1. Even in first `DRAFT` view, manual edit actions are locked by default.
2. Employee can still submit without editing.
3. Employee must request permission before any manual correction.
4. `REVISED` is editable directly (no permission gate).

## Option A - Permission CTA in Banner

```txt
[DRAFT]
+------------------------------------------------------------------+
| Editing is locked until manager approves your edit request.      |
|                                                                   |
|                           [ Request Edit Permission ]             |
+------------------------------------------------------------------+
[ Close ]                               [ Submit for Approval ]

[REVISED]
+------------------------------------------------------------------+
| Your manager requested revisions. Update entries and resubmit.   |
+------------------------------------------------------------------+
[ Close ]                             [ Resubmit for Approval ]

[SUBMITTED / APPROVED]
+------------------------------------------------------------------+
| This timesheet is locked.                                        |
| Request manager permission to unlock for corrections.            |
|                                                                   |
|                           [ Request Edit Permission ]             |
+------------------------------------------------------------------+
[ Close ]
```

## Request Modal Copy (All Options)

```txt
+--------------------------------------------------------------+
| Request Edit Permission                                      |
|--------------------------------------------------------------|
| Submit a request to your manager to unlock this timesheet    |
| for corrections.                                              |
|                                                               |
| Reason for correction *                                       |
| +----------------------------------------------------------+  |
| | e.g. Missing clock-out on Mar 03 due to log discrepancy   |  |
| +----------------------------------------------------------+  |
|                                                               |
|                      [ Cancel ] [ Submit Request ]           |
+--------------------------------------------------------------+
```

## Post-request Banner States

```txt
REQUESTED:
"Edit permission request sent. Waiting for manager approval."

APPROVED:
"Edit permission approved. You can now edit and then submit/resubmit."

REJECTED:
"Edit permission request rejected. Reason: {reason}"

CONSUMED:
"Edit permission already used after submit/resubmit."
```

## Placement Notes for Existing Modal
1. Keep footer buttons in current positions.
2. Keep submit/resubmit button availability by timesheet status as currently designed.
3. Gate edit interactions in `DRAFT`, `SUBMITTED`, and `APPROVED` until permission is `APPROVED`.
4. In `REVISED`, allow editing directly without permission.
5. Place request CTA in the info banner area above footer buttons.
6. In preview mode (`id: null`), CTA stays visible and uses resolver endpoint to create DRAFT then request permission.
