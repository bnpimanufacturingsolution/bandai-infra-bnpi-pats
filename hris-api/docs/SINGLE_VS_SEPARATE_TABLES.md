# Single Table vs Separate Tables for Request Reviewers

## Comparison

### Current Approach: **2 Separate Tables**

```prisma
// Employee-based reviewers
model RequestEmployeeReviewer {
  id         String
  requestId  String
  employeeId String  // Required
  status     RequestStatus?
  reviewedAt DateTime?
  notes      String?
}

// Role-based reviewers
model RequestRoleReviewer {
  id           String
  requestId    String
  roleId       String  // Required
  reviewedById String?  // Who actually reviewed
  status       RequestStatus?
  reviewedAt   DateTime?
  notes        String?
}
```

**Pros:**

- ✅ Type-safe (no nullable confusion)
- ✅ Clear separation of concerns
- ✅ Database enforces structure

**Cons:**

- ❌ Need to query 2 tables
- ❌ Duplicate fields (status, reviewedAt, notes)
- ❌ More complex queries
- ❌ More code to maintain

---

### Alternative: **Single Table**

```prisma
model RequestReviewer {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  request    Request  @relation(fields: [requestId], references: [id])
  requestId  String   @db.ObjectId

  // Either employeeId OR roleId must be set (enforced in application layer)
  employee   Employee? @relation("AssignedReviewer", fields: [employeeId], references: [id])
  employeeId String?   @db.ObjectId

  roleId     String?  // Role ID from auth service (no FK)

  // Track who actually reviewed (for role-based, set when someone reviews)
  reviewedBy   Employee? @relation("Reviewer", fields: [reviewedById], references: [id])
  reviewedById String?   @db.ObjectId

  status     RequestStatus?
  reviewedAt DateTime?
  notes      String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  isDeleted Boolean @default(false)

  @@index([requestId])
  @@index([employeeId])
  @@index([roleId])
  @@index([reviewedById])
  @@map("request_reviewers")
}
```

**Pros:**

- ✅ **Simpler queries** - One table to query
- ✅ **Less code duplication** - Same fields in one place
- ✅ **Easier to maintain** - One model to update
- ✅ **Unified logic** - Same business rules apply

**Cons:**

- ❌ Need application-level validation (at least one of employeeId/roleId must be set)
- ❌ Nullable fields (but manageable with proper validation)

---

## Recommendation: **Single Table** ✅

For your use case, **single table is better** because:

1. **Simpler Queries**

    ```typescript
    // Single table - simple!
    const reviewers = await prisma.requestReviewer.findMany({
    	where: { requestId },
    });

    // vs Separate tables - need to combine
    const [employeeReviewers, roleReviewers] = await Promise.all([
    	prisma.requestEmployeeReviewer.findMany({ where: { requestId } }),
    	prisma.requestRoleReviewer.findMany({ where: { requestId } }),
    ]);
    ```

2. **Unified Business Logic**
    - Same status field
    - Same review workflow
    - Same validation rules

3. **Easier to Extend**
    - Add new reviewer types easily
    - Less code to maintain

4. **Better for Your Workflow**
    - You often need BOTH types for one request
    - Single query gets everything

---

## Implementation with Single Table

### Validation (Application Layer)

```typescript
// Validate when creating reviewer
function validateReviewer(data: { employeeId?: string; roleId?: string }) {
	if (!data.employeeId && !data.roleId) {
		throw new Error("Either employeeId or roleId must be provided");
	}
	if (data.employeeId && data.roleId) {
		throw new Error("Cannot set both employeeId and roleId");
	}
}
```

### Creating Reviewers

```typescript
// Employee request - creates 3 reviewers
await prisma.requestReviewer.createMany({
	data: [
		// Role-based reviewers
		{ requestId, roleId: "hris-hr-user" },
		{ requestId, roleId: "hris-hr-manager" },
		// Employee-based reviewer
		{ requestId, employeeId: "emp_manager_123" },
	],
});
```

### Querying All Reviewers

```typescript
// Get all reviewers for a request - SIMPLE!
const reviewers = await prisma.requestReviewer.findMany({
	where: { requestId },
	include: {
		employee: true, // If employee-based
		reviewedBy: true, // If reviewed
	},
});

// Filter by type
const roleReviewers = reviewers.filter((r) => r.roleId);
const employeeReviewers = reviewers.filter((r) => r.employeeId);
```

### Check Pending Reviews for User

```typescript
const userRoles = await getUserRoles(userId);

const pendingReviews = await prisma.requestReviewer.findMany({
	where: {
		OR: [
			// Employee-based: assigned to this user
			{ employeeId: currentEmployeeId, status: "PENDING" },
			// Role-based: user has the role and not yet reviewed
			{
				roleId: { in: userRoles },
				status: "PENDING",
				reviewedById: null,
			},
		],
	},
	include: { request: true },
});
```

---

## Migration Path

If you want to switch to single table:

1. Create new `RequestReviewer` model
2. Migrate data from both tables
3. Update application code
4. Drop old tables

---

## Final Verdict

**Use Single Table** - It's simpler, cleaner, and better suited for your workflow where you often need both types of reviewers for the same request.
