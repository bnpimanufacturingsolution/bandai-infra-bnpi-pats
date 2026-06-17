# Migration to Single RequestReviewer Table

## ✅ Changes Completed

### 1. Schema Updates

**`requestreviewer.prisma`** - Now supports both employee and role-based reviewers:
- `employeeId` - Optional, for employee-based reviewers
- `roleId` - Optional, for role-based reviewers  
- `reviewedById` - Optional, tracks who actually reviewed (for role-based)
- Validation: Either `employeeId` OR `roleId` must be set (enforced in Zod)

**`employee.prisma`** - Updated relations:
- `assignedReviews` - Reviews assigned to this employee (via `employeeId`)
- `performedReviews` - Reviews this employee performed (via `reviewedById`)

**`request.prisma`** - Already uses single `reviewers` relation ✅

### 2. Zod Schema Updates

**`requestReviewer.zod.ts`** - Added validation:
- `employeeId` - Optional, nullable
- `roleId` - Optional, nullable
- `reviewedById` - Optional, nullable
- **Validation rules:**
  - At least one of `employeeId` or `roleId` must be provided
  - Cannot set both `employeeId` and `roleId`

**`request.zod.ts`** - Updated `RequestWithRelations` type to include:
- `employee` - For employee-based reviewers
- `reviewedBy` - For role-based reviewers

## Usage Examples

### Creating Reviewers

```typescript
// Employee request - creates 3 reviewers
await prisma.requestReviewer.createMany({
  data: [
    // Role-based reviewers
    { 
      requestId: request.id, 
      roleId: 'hris-hr-user',
      status: 'PENDING'
    },
    { 
      requestId: request.id, 
      roleId: 'hris-hr-manager',
      status: 'PENDING'
    },
    // Employee-based reviewer
    { 
      requestId: request.id, 
      employeeId: 'emp_manager_123',
      status: 'PENDING'
    }
  ]
});
```

### Querying Reviewers

```typescript
// Get all reviewers for a request
const reviewers = await prisma.requestReviewer.findMany({
  where: { requestId },
  include: {
    employee: true,      // If employee-based
    reviewedBy: true     // If reviewed (role-based)
  }
});

// Filter by type
const roleReviewers = reviewers.filter(r => r.roleId);
const employeeReviewers = reviewers.filter(r => r.employeeId);
```

### Finding Pending Reviews for User

```typescript
const userRoles = await getUserRoles(userId);

const pendingReviews = await prisma.requestReviewer.findMany({
  where: {
    OR: [
      // Employee-based: assigned to this user
      { employeeId: currentEmployeeId, status: 'PENDING' },
      // Role-based: user has the role and not yet reviewed
      { 
        roleId: { in: userRoles }, 
        status: 'PENDING',
        reviewedById: null 
      }
    ]
  },
  include: { request: true }
});
```

### Submitting a Role-Based Review

```typescript
// User with HR_USER role reviews a request
const roleReviewer = await prisma.requestReviewer.findFirst({
  where: {
    requestId: requestId,
    roleId: 'hris-hr-user',
    status: 'PENDING'
  }
});

// Verify user has the role (from auth service)
const userRoles = await getUserRoles(currentUserId);
if (!userRoles.includes('hris-hr-user')) {
  throw new Error('User does not have required role');
}

// Update the review
await prisma.requestReviewer.update({
  where: { id: roleReviewer.id },
  data: {
    status: 'APPROVED',
    reviewedById: currentEmployeeId, // Track who reviewed
    reviewedAt: new Date(),
    notes: 'Approved by HR'
  }
});
```

## Validation

The Zod schema automatically validates:
- ✅ Either `employeeId` or `roleId` must be provided
- ✅ Cannot set both `employeeId` and `roleId`
- ✅ `employeeId` and `reviewedById` must be valid ObjectIds if provided

## Benefits

✅ **Simpler queries** - One table instead of two  
✅ **Less code duplication** - Same fields in one place  
✅ **Easier to maintain** - One model to update  
✅ **Unified logic** - Same business rules apply  
✅ **Better for your workflow** - Often need both types for one request

