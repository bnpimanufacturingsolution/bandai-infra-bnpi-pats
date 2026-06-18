# Admin Route Structure Proposal

## Current Structure

```
/admin/configuration/...
  - users
  - departments
  - levels
  - positions
  - schedules
  - benefit-types
  - loan-types
  - calendars
  - devices (landing page exists)

/admin/devices/
  - biometrics (you want to change this)
  - users
  - events
```

## Problem

- `/admin/devices/biometrics` → `/admin/devices/devices` is redundant
- You already have `/admin/configuration/devices` as a landing page

## Proposed Options

### Option 1: Move Devices Under Configuration (RECOMMENDED)

**Structure:**

```
/admin/configuration/devices          → Landing page (device types overview)
/admin/configuration/devices/biometrics → Biometric devices management
/admin/configuration/devices/users    → Device users management
/admin/configuration/devices/events   → Device events
```

**Pros:**

- Consistent with other configuration items
- Devices are configuration-related
- No redundancy
- Clear hierarchy

**Cons:**

- Requires moving files and updating routes
- Longer URLs

---

### Option 2: Make Devices Index Route

**Structure:**

```
/admin/devices                        → Biometrics (index/default)
/admin/devices/users                  → Device users
/admin/devices/events                 → Device events
```

**Pros:**

- Short URLs
- Biometrics is the main device type
- Simple structure

**Cons:**

- Less flexible if you add more device types later
- No landing page for device types

---

### Option 3: Keep Devices Separate, Use "manage" or "list"

**Structure:**

```
/admin/devices                        → Landing page (device types overview)
/admin/devices/manage                 → Biometric devices management (was biometrics)
/admin/devices/users                  → Device users
/admin/devices/events                 → Device events
```

**Pros:**

- Clear separation from configuration
- Landing page for device types
- Descriptive route name

**Cons:**

- "manage" is generic
- Still separate from configuration

---

### Option 4: Use Device Type as Route

**Structure:**

```
/admin/devices                        → Landing page (device types overview)
/admin/devices/biometric              → Biometric devices (singular, cleaner)
/admin/devices/rfid                   → RFID devices (future)
/admin/devices/users                  → Device users
/admin/devices/events                 → Device events
```

**Pros:**

- Scalable for multiple device types
- Clear naming
- Landing page exists

**Cons:**

- Still separate from configuration

---

## Recommendation: **Option 1** (Move to Configuration)

Since you already have `/admin/configuration/devices` as a landing page, and devices are configuration-related, moving everything under configuration makes the most sense:

```
/admin/configuration/devices          → Landing (device types)
/admin/configuration/devices/biometrics → Biometric management
/admin/configuration/devices/users    → Device users
/admin/configuration/devices/events    → Device events
```

This provides:

- ✅ Consistency with other config items
- ✅ No redundancy
- ✅ Clear hierarchy
- ✅ Uses existing landing page

Would you like me to implement Option 1, or do you prefer a different option?

