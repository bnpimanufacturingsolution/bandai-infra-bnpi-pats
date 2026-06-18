# Request Workflow Guide

## Overview

This guide shows how to use the Request model with **two separate junction tables**:
- `RequestEmployeeReviewer` - Employee-based reviewers (specific employee must review)
- `RequestRoleReviewer` - Role-based reviewers (any employee with role can review)

## Workflow Rules

| Requester Role       | Role Reviewers                    | Employee Reviewers        |
| -------------------- | --------------------------------- | ------------------------- |
| **EMPLOYEE**         | `hris-hr-user`, `hris-hr-manager` | Employee's direct manager |
| **EMPLOYEE MANAGER** | `hris-hr-user`, `hris-hr-manager` | None                      |
| **HR USER**          | `hris-hr-manager`                 | None                      |
| **HR MANAGER**       | None                              | None                      |

---

## 1. Creating a Request with Reviewers

### Step 1: Determine Reviewers Based on Requester Role

```typescript
async function determineReviewers(
	requesterRole: string,
	requesterEmployeeId: string,
	prisma: PrismaClient,
) {
	const roleReviewers: string[] = [];
	const employeeReviewers: string[] = [];

	switch (requesterRole) {
		case "hris-employee":
			// EMPLOYEE → HR USER, HR MANAGER (roles) + Direct Manager (employee)
			roleReviewers.push("hris-hr-user", "hris-hr-manager");

			// Get employee's direct manager
			const employee = await prisma.employee.findUnique({
				where: { id: requesterEmployeeId },
				include: {
					department: {
						include: {
							manager: true, // Assuming Department has manager relation
						},
					},
				},
			});

			if (employee?.department?.manager) {
				employeeReviewers.push(employee.department.manager.id);
			}
			break;

		case "hris-employee-manager":
			// EMPLOYEE MANAGER → HR USER, HR MANAGER (roles)
			roleReviewers.push("hris-hr-user", "hris-hr-manager");
			break;

		case "hris-hr-user":
			// HR USER → HR MANAGER (role)
			roleReviewers.push("hris-hr-manager");
			break;

		case "hris-hr-manager":
			// HR MANAGER → No reviewers (final approver)
			break;

		default:
			throw new Error(`Unknown requester role: ${requesterRole}`);
	}

	return { roleReviewers, employeeReviewers };
}
```

### Step 2: Create Request with Reviewers

```typescript
async function createRequestWithReviewers(
	prisma: PrismaClient,
	requestData: {
		organizationId: string;
		type: string;
		description: string;
		startDate?: Date;
		endDate?: Date;
		requesterId: string;
		attachments?: any[];
	},
	requesterRole: string,
) {
	// Determine reviewers
	const { roleReviewers, employeeReviewers } = await determineReviewers(
		requesterRole,
		requestData.requesterId,
		prisma,
	);

	// Create request with reviewers in a transaction
	const request = await prisma.$transaction(async (tx) => {
		// 1. Create the request
		const newRequest = await tx.request.create({
			data: {
				organizationId: requestData.organizationId,
				type: requestData.type,
				description: requestData.description,
				startDate: requestData.startDate || null,
				endDate: requestData.endDate || null,
				requesterId: requestData.requesterId,
				status: "PENDING",
				attachments: requestData.attachments || [],
			},
		});

		// 2. Create role-based reviewers
		if (roleReviewers.length > 0) {
			await tx.requestRoleReviewer.createMany({
				data: roleReviewers.map((roleId) => ({
					requestId: newRequest.id,
					roleId: roleId,
					status: "PENDING",
				})),
			});
		}

		// 3. Create employee-based reviewers
		if (employeeReviewers.length > 0) {
			await tx.requestEmployeeReviewer.createMany({
				data: employeeReviewers.map((employeeId) => ({
					requestId: newRequest.id,
					employeeId: employeeId,
					status: "PENDING",
				})),
			});
		}

		return newRequest;
	});

	return request;
}
```

### Example: Employee Creates Leave Request

```typescript
// Get requester's role from auth service
const requester = await prisma.employee.findUnique({
	where: { id: requesterId },
});
const requesterRoles = await getUserRoles(requester.userId); // From auth microservice
const requesterRole = requesterRoles[0];

// Create request
const request = await createRequestWithReviewers(
	prisma,
	{
		organizationId: "org123",
		type: "LEAVE",
		description: "Vacation leave",
		startDate: new Date("2024-02-01"),
		endDate: new Date("2024-02-05"),
		requesterId: requesterId,
	},
	requesterRole,
);

// This creates:
// - 1 Request
// - 2 RequestRoleReviewer entries (hris-hr-user, hris-hr-manager)
// - 1 RequestEmployeeReviewer entry (direct manager)
```

---

## 2. Querying Reviewers for a Request

### Get All Reviewers

```typescript
const request = await prisma.request.findUnique({
	where: { id: requestId },
	include: {
		employeeReviewers: {
			include: {
				employee: true, // Include employee details
			},
		},
		roleReviewers: {
			include: {
				reviewedBy: true, // Include who actually reviewed (if reviewed)
			},
		},
	},
});

// Combine both types
const allReviewers = [
	...request.employeeReviewers.map((r) => ({
		type: "employee",
		id: r.id,
		employee: r.employee,
		status: r.status,
		reviewedAt: r.reviewedAt,
	})),
	...request.roleReviewers.map((r) => ({
		type: "role",
		id: r.id,
		roleId: r.roleId,
		reviewedBy: r.reviewedBy,
		status: r.status,
		reviewedAt: r.reviewedAt,
	})),
];
```

### Get Pending Reviewers Only

```typescript
const pendingReviewers = {
	employee: request.employeeReviewers.filter((r) => r.status === "PENDING"),
	role: request.roleReviewers.filter((r) => r.status === "PENDING"),
};
```

---

## 3. Finding Pending Reviews for Current User

### Get All Pending Reviews User Can Review

```typescript
async function getPendingReviewsForUser(
	prisma: PrismaClient,
	currentEmployeeId: string,
	currentUserId: string,
) {
	// Get user's roles from auth service
	const userRoles = await getUserRoles(currentUserId);

	// Get employee-based reviews assigned to this user
	const employeeReviews = await prisma.requestEmployeeReviewer.findMany({
		where: {
			employeeId: currentEmployeeId,
			status: "PENDING",
		},
		include: {
			request: {
				include: {
					requester: true,
				},
			},
		},
	});

	// Get role-based reviews where user has the role and not yet reviewed
	const roleReviews = await prisma.requestRoleReviewer.findMany({
		where: {
			roleId: { in: userRoles },
			status: "PENDING",
			reviewedById: null, // Not yet reviewed
		},
		include: {
			request: {
				include: {
					requester: true,
				},
			},
		},
	});

	return {
		employeeReviews,
		roleReviews,
		all: [...employeeReviews, ...roleReviews],
	};
}
```

---

## 4. Submitting a Review

### Employee-Based Review

```typescript
async function submitEmployeeReview(
	prisma: PrismaClient,
	reviewerId: string,
	requestId: string,
	status: "APPROVED" | "REJECTED",
	notes?: string,
) {
	const review = await prisma.requestEmployeeReviewer.findFirst({
		where: {
			id: reviewerId,
			requestId: requestId,
			employeeId: currentEmployeeId, // Ensure it's assigned to current user
			status: "PENDING",
		},
	});

	if (!review) {
		throw new Error("Review not found or not assigned to you");
	}

	const updatedReview = await prisma.requestEmployeeReviewer.update({
		where: { id: review.id },
		data: {
			status: status,
			reviewedAt: new Date(),
			notes: notes,
		},
	});

	return updatedReview;
}
```

### Role-Based Review

```typescript
async function submitRoleReview(
	prisma: PrismaClient,
	reviewerId: string,
	requestId: string,
	currentEmployeeId: string,
	currentUserId: string,
	status: "APPROVED" | "REJECTED",
	notes?: string,
) {
	// Find the role-based reviewer
	const roleReviewer = await prisma.requestRoleReviewer.findFirst({
		where: {
			id: reviewerId,
			requestId: requestId,
			status: "PENDING",
		},
	});

	if (!roleReviewer) {
		throw new Error("Review not found");
	}

	// Verify user has the required role
	const userRoles = await getUserRoles(currentUserId);
	if (!userRoles.includes(roleReviewer.roleId)) {
		throw new Error("User does not have required role");
	}

	// Update the review
	const updatedReview = await prisma.requestRoleReviewer.update({
		where: { id: roleReviewer.id },
		data: {
			status: status,
			reviewedById: currentEmployeeId, // Track who actually reviewed
			reviewedAt: new Date(),
			notes: notes,
		},
	});

	return updatedReview;
}
```

---

## 5. Check if Request is Fully Reviewed

```typescript
async function isRequestFullyReviewed(prisma: PrismaClient, requestId: string) {
	const request = await prisma.request.findUnique({
		where: { id: requestId },
		include: {
			employeeReviewers: true,
			roleReviewers: true,
		},
	});

	if (!request) {
		throw new Error("Request not found");
	}

	// Check if all employee reviewers have reviewed
	const allEmployeeReviewsDone = request.employeeReviewers.every(
		(r) => r.status === "APPROVED" || r.status === "REJECTED",
	);

	// Check if all role reviewers have reviewed
	const allRoleReviewsDone = request.roleReviewers.every(
		(r) => r.status === "APPROVED" || r.status === "REJECTED",
	);

	const isFullyReviewed = allEmployeeReviewsDone && allRoleReviewsDone;

	// If fully reviewed, update request status
	if (isFullyReviewed) {
		// Determine final status based on reviews
		const hasRejection =
			request.employeeReviewers.some((r) => r.status === "REJECTED") ||
			request.roleReviewers.some((r) => r.status === "REJECTED");

		await prisma.request.update({
			where: { id: requestId },
			data: {
				status: hasRejection ? "REJECTED" : "APPROVED",
			},
		});
	}

	return isFullyReviewed;
}
```

---

## 6. Complete API Endpoint Example

```typescript
export const createRequest = async (req: AuthRequest, res: Response) => {
	try {
		const { type, description, startDate, endDate, requesterId } = req.body;

		// Get requester employee
		const requester = await prisma.employee.findUnique({
			where: { id: requesterId },
		});

		if (!requester) {
			return res.status(404).json({ error: "Requester not found" });
		}

		// Get requester's role from auth service
		const requesterRoles = await getUserRoles(requester.userId);
		const requesterRole = requesterRoles[0];

		// Create request with reviewers
		const request = await createRequestWithReviewers(
			prisma,
			{
				organizationId: req.user.organizationId,
				type,
				description,
				startDate: startDate ? new Date(startDate) : undefined,
				endDate: endDate ? new Date(endDate) : undefined,
				requesterId,
			},
			requesterRole,
		);

		res.status(201).json({
			success: true,
			data: request,
		});
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
};

export const getPendingReviews = async (req: AuthRequest, res: Response) => {
	try {
		const currentEmployee = await prisma.employee.findUnique({
			where: { userId: req.user.id },
		});

		if (!currentEmployee) {
			return res.status(404).json({ error: "Employee not found" });
		}

		const { employeeReviews, roleReviews, all } = await getPendingReviewsForUser(
			prisma,
			currentEmployee.id,
			req.user.id,
		);

		res.json({
			success: true,
			data: {
				employeeReviews,
				roleReviews,
				all,
				total: all.length,
			},
		});
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
};

export const submitReview = async (req: AuthRequest, res: Response) => {
	try {
		const { reviewerId, requestId, status, notes, reviewerType } = req.body;

		const currentEmployee = await prisma.employee.findUnique({
			where: { userId: req.user.id },
		});

		if (!currentEmployee) {
			return res.status(404).json({ error: "Employee not found" });
		}

		let review;

		if (reviewerType === "employee") {
			review = await submitEmployeeReview(
				prisma,
				reviewerId,
				requestId,
				status,
				notes,
			);
		} else if (reviewerType === "role") {
			review = await submitRoleReview(
				prisma,
				reviewerId,
				requestId,
				currentEmployee.id,
				req.user.id,
				status,
				notes,
			);
		} else {
			return res.status(400).json({ error: "Invalid reviewer type" });
		}

		// Check if request is fully reviewed
		await isRequestFullyReviewed(prisma, requestId);

		res.json({
			success: true,
			data: review,
		});
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
};
```

---

## 7. Summary

### Key Points:

1. **Two Separate Tables:**
   - `RequestEmployeeReviewer` - Specific employee assignments
   - `RequestRoleReviewer` - Role-based assignments

2. **Creating Reviewers:**
   - Determine reviewers based on requester role
   - Create both types in a transaction

3. **Querying:**
   - Query both tables separately
   - Combine results in application layer

4. **Reviewing:**
   - Employee-based: Only assigned employee can review
   - Role-based: Any employee with role can review, track who did it

5. **Status Management:**
   - Check both tables to determine if request is fully reviewed
   - Update request status when all reviews are complete

