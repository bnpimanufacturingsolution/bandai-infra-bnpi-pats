import { expect, test, type Page, type Route } from "@playwright/test";

const timestamp = "2026-06-25T08:00:00.000Z";
const routeReadyTimeoutMs = 30_000;
const organizationId = "org-1";
const requestId = "req-attendance-approval";

type MockUser = {
	id: string;
	email: string;
	name: string;
	role: string;
	subRole: string;
	organizationId: string;
	organization: {
		id: string;
		name: string;
		code: string;
		branding: { colors: Record<string, string> };
	};
	metadata: {
		employee: {
			id: string;
			employeeId: string;
			employmentStatus: string;
			role: string;
			personalInfo: {
				firstName: string;
				lastName: string;
			};
			department: {
				id: string;
				name: string;
				code: string;
			};
			position: {
				id: string;
				title: string;
				code: string;
			};
			level: {
				id: string;
				name: string;
				rank: number;
			};
			isManager: boolean;
			isHrManager: boolean;
			hasDirectReports: boolean;
		};
	};
	person: {
		id: string;
		personalInfo: {
			prefix: string | null;
			firstName: string;
			lastName: string;
			dateOfBirth: string | null;
			placeOfBirth: string | null;
			age: number | null;
			nationality: string | null;
			primaryLanguage: string | null;
			gender: string | null;
			currency: string | null;
			vipCode: string | null;
		};
		contactInfo: {
			email: string;
			phones: Array<{
				type: string;
				countryCode: string;
				number: string;
				isPrimary: boolean;
			}>;
			address: null;
		};
		identification: null;
		metadata: {
			isActive: boolean;
			status: string | null;
			createdBy: string | null;
			updatedBy: string | null;
			lastLoginAt: string | null;
			isDeleted: boolean;
		};
	};
	token: string;
};

const readyProvisioningStatus = {
	mode: "READY",
	canManageSetup: true,
	currentStep: "admin-account",
	isProvisioned: true,
	initializationStatus: "COMPLETED",
	provisionedAt: timestamp,
	provisionedBy: "user-smoke",
	previewAvailable: true,
	steps: [],
	summary: {
		hasAdmin: true,
		isActivated: true,
		hasHrSettings: true,
		hasTimesheetConfig: true,
		hasPayrollCycleConfig: true,
		hasOpenPayrollPeriod: true,
		hasLeavePolicies: true,
		hasDefaultCalculator: true,
		isProvisioned: true,
		initializationStatus: "COMPLETED",
		previewAvailable: true,
	},
	organization: {
		id: organizationId,
		name: "Test Organization",
		code: "TEST",
	},
};

const emptyNotificationsResponse = {
	notifications: [],
	count: 0,
	pagination: {
		total: 0,
		page: 1,
		limit: 20,
		totalPages: 1,
	},
};

const emptyMetricsResponse = {
	success: true,
	message: "OK",
	data: {
		total: 1,
		summary: {
			total: 1,
			high: 0,
			medium: 0,
			low: 1,
		},
		counts: {
			dashboard: 0,
			tickets: { total: 0 },
			requests: { total: 1 },
			approvals: {
				total: 1,
				requests: 1,
				timesheet: 0,
			},
			documents: {
				total: 0,
				missing: 0,
				rejected: 0,
				expired: 0,
				needsUpdate: 0,
				pendingApproval: 0,
				hrPendingApproval: 0,
				optional: 0,
			},
			timesheets: { total: 0 },
			notifications: { total: 0 },
		},
		items: {
			dashboard: [],
			documents: [],
			onboardingDocuments: [],
		},
		categories: {
			documents: [],
		},
		analytics: {
			hrQueue: {
				teamQueue: 0,
			},
		},
	},
};

const buildUser = (params: {
	role: "hris-employee-manager" | "hris-hr-user";
	employeeId: string;
	firstName: string;
	lastName: string;
	departmentName: string;
	departmentCode: string;
	positionTitle: string;
	positionCode: string;
	levelName: string;
	levelRank: number;
	isManager: boolean;
	isHrManager: boolean;
}): MockUser => {
	const fullName = `${params.firstName} ${params.lastName}`.trim();
	return {
		id: `user-${params.employeeId}`,
		email: `${params.employeeId}@example.test`,
		name: fullName,
		role: params.role,
		subRole: params.role,
		organizationId,
		organization: {
			id: organizationId,
			name: "Test Organization",
			code: "TEST",
			branding: { colors: {} },
		},
		metadata: {
			employee: {
				id: params.employeeId,
				employeeId: params.employeeId.toUpperCase(),
				employmentStatus: "active",
				role: params.role,
				personalInfo: {
					firstName: params.firstName,
					lastName: params.lastName,
				},
				department: {
					id: "dept-ops",
					name: params.departmentName,
					code: params.departmentCode,
				},
				position: {
					id: "pos-approver",
					title: params.positionTitle,
					code: params.positionCode,
				},
				level: {
					id: "level-approver",
					name: params.levelName,
					rank: params.levelRank,
				},
				isManager: params.isManager,
				isHrManager: params.isHrManager,
				hasDirectReports: params.isManager || params.isHrManager,
			},
		},
		person: {
			id: `person-${params.employeeId}`,
			personalInfo: {
				prefix: null,
				firstName: params.firstName,
				lastName: params.lastName,
				dateOfBirth: null,
				placeOfBirth: null,
				age: null,
				nationality: null,
				primaryLanguage: null,
				gender: null,
				currency: null,
				vipCode: null,
			},
			contactInfo: {
				email: `${params.employeeId}@example.test`,
				phones: [],
				address: null,
			},
			identification: null,
			metadata: {
				isActive: true,
				status: null,
				createdBy: null,
				updatedBy: null,
				lastLoginAt: null,
				isDeleted: false,
			},
		},
		token: "smoke-token",
	};
};

const buildAttendanceCorrectionRequest = (params: {
	assigneeType: "SUPERVISOR" | "HR";
	assigneeEmployeeId: string;
	assigneeFirstName: string;
	assigneeLastName: string;
	requesterId?: string;
	requesterEmployeeId?: string;
	requesterFirstName?: string;
	requesterLastName?: string;
}) => {
	const requesterId = params.requesterId || "emp-requester-1";
	const requesterEmployeeId = params.requesterEmployeeId || "EMP-001";
	const requesterFirstName = params.requesterFirstName || "Ari";
	const requesterLastName = params.requesterLastName || "Tan";
	const requesterFullName = `${requesterFirstName} ${requesterLastName}`.trim();
	const assigneeFullName = `${params.assigneeFirstName} ${params.assigneeLastName}`.trim();

	return {
		id: requestId,
		organizationId,
		code: "REQ-ATT-001",
		requesterId,
		requester: {
			id: requesterId,
			employeeId: requesterEmployeeId,
			reportTo: {
				id: params.assigneeEmployeeId,
			},
			person: {
				personalInfo: {
					firstName: requesterFirstName,
					lastName: requesterLastName,
				},
			},
			department: {
				id: "dept-ops",
				name: "Operations",
				code: "OPS",
			},
			position: {
				id: "pos-ops",
				title: "Operations Associate",
				code: "OPS-ASSOC",
			},
		},
		type: "ATTENDANCE_CORRECTION",
		currentWorkflowStateKey: "SUBMITTED",
		startDate: "2026-06-25",
		endDate: "2026-06-25",
		description: "Correct missed punch",
		attachments: [],
		notes: "Needs correction",
		isDeleted: false,
		createdAt: timestamp,
		updatedAt: timestamp,
		metadata: {
			date: "2026-06-25",
			adjustmentType: "MISSED_PUNCH",
			timeIn: "08:15",
			timeOut: "17:10",
			reason: "Forgot to clock out",
			justification: "Correct missed punch",
		},
		currentStepExecution: {
			id: "step-current",
			stepNumber: 2,
			stepName: params.assigneeType === "HR" ? "HR Review" : "Manager Review",
			stepType: "APPROVAL",
			assigneeType: params.assigneeType,
			assigneeId: params.assigneeEmployeeId,
			status: "PENDING",
			assignee: {
				id: params.assigneeEmployeeId,
				employeeId: params.assigneeEmployeeId.toUpperCase(),
				person: {
					personalInfo: {
						firstName: params.assigneeFirstName,
						lastName: params.assigneeLastName,
					},
				},
				department: {
					id: "dept-ops",
					name: "Operations",
					code: "OPS",
				},
			},
		},
		lastCompletedStepExecution: {
			id: "step-submitted",
			stepNumber: 1,
			stepName: "Submit Request",
			stepType: "SUBMISSION",
			assigneeType: "REQUESTER",
			completedAt: timestamp,
			assignee: {
				id: requesterId,
				employeeId: requesterEmployeeId,
				person: {
					personalInfo: {
						firstName: requesterFirstName,
						lastName: requesterLastName,
					},
				},
			},
		},
		stepExecutions: [
			{
				id: "step-submitted",
				requestId,
				stepNumber: 1,
				stepName: "Submit Request",
				stepType: "SUBMISSION",
				assigneeType: "REQUESTER",
				status: "COMPLETED",
				completedAt: timestamp,
				comments: "Submitted for correction.",
				isRequired: true,
				createdAt: timestamp,
				updatedAt: timestamp,
				assignee: {
					id: requesterId,
					employeeId: requesterEmployeeId,
					person: {
						personalInfo: {
							firstName: requesterFirstName,
							lastName: requesterLastName,
						},
					},
				},
			},
			{
				id: "step-current",
				requestId,
				stepNumber: 2,
				stepName: params.assigneeType === "HR" ? "HR Review" : "Manager Review",
				stepType: "APPROVAL",
				assigneeType: params.assigneeType,
				assigneeId: params.assigneeEmployeeId,
				status: "PENDING",
				isRequired: true,
				createdAt: timestamp,
				updatedAt: timestamp,
				assignee: {
					id: params.assigneeEmployeeId,
					employeeId: params.assigneeEmployeeId.toUpperCase(),
					person: {
						personalInfo: {
							firstName: params.assigneeFirstName,
							lastName: params.assigneeLastName,
						},
					},
					department: {
						id: "dept-ops",
						name: "Operations",
						code: "OPS",
					},
				},
			},
		],
		transactions: [
			{
				id: "txn-1",
				requestId,
				sequenceNumber: 1,
				eventCategory: "LIFECYCLE",
				eventKey: "REQUEST_CREATED",
				actorType: "EMPLOYEE",
				title: "Request submitted",
				description: "Attendance correction request was created.",
				isSystemGenerated: false,
				occurredAt: timestamp,
				createdAt: timestamp,
				updatedAt: timestamp,
				actorEmployeeId: requesterId,
				actorDisplayName: requesterFullName,
				metadata: {},
				fieldChanges: [
					{
						field: "description",
						label: "Description",
						before: "",
						after: "Correct missed punch",
					},
				],
			},
		],
	};
};

const fulfillJson = async (route: Route, data: unknown) => {
	await route.fulfill({
		status: 200,
		contentType: "application/json",
		body: JSON.stringify({ success: true, message: "OK", data }),
	});
};

const installMockApi = async (page: Page, user: MockUser, requestPayload: unknown) => {
	const listRequestUrls: URL[] = [];
	const detailRequestUrls: URL[] = [];
	const notificationRequestUrls: URL[] = [];
	const metricsRequestUrls: URL[] = [];
	const approvalRequestBodies: Array<Record<string, unknown>> = [];

	await page.addInitScript(
		({ userRole, userSubRole }) => {
			window.localStorage.setItem("authToken", "smoke-token");
			window.localStorage.setItem("userRole", userRole);
			window.localStorage.setItem("userSubRole", userSubRole);
		},
		{ userRole: user.role, userSubRole: user.subRole },
	);

	await page.route(
		(url) => {
			try {
				return new URL(url.toString()).pathname.startsWith("/api/");
			} catch {
				return false;
			}
		},
		async (route) => {
			const requestUrl = new URL(route.request().url());
			const path = requestUrl.pathname;
			const method = route.request().method();

			if (path.endsWith("/auth/me")) {
				await fulfillJson(route, user);
				return;
			}

			if (path.endsWith("/system-provisioning/status")) {
				await fulfillJson(route, readyProvisioningStatus);
				return;
			}

			if (path.endsWith("/metrics/actions")) {
				metricsRequestUrls.push(requestUrl);
				await fulfillJson(route, emptyMetricsResponse.data);
				return;
			}

			if (path.endsWith("/notification") && method === "GET") {
				notificationRequestUrls.push(requestUrl);
				await fulfillJson(route, emptyNotificationsResponse);
				return;
			}

			if (path === "/api/request" && method === "GET") {
				listRequestUrls.push(requestUrl);
				await fulfillJson(route, {
					requests: [requestPayload],
					pagination: {
						total: 1,
						page: 1,
						limit: 10,
						totalPages: 1,
						hasNext: false,
						hasPrev: false,
					},
					count: 1,
				});
				return;
			}

			if (path === `/api/request/${requestId}` && method === "GET") {
				detailRequestUrls.push(requestUrl);
				await fulfillJson(route, requestPayload);
				return;
			}

			if (path === `/api/request/${requestId}/approval` && method === "POST") {
				const approvalBody = route.request().postDataJSON() as Record<string, unknown>;
				approvalRequestBodies.push(approvalBody);
				await fulfillJson(route, {
					request: {
						...(requestPayload as Record<string, unknown>),
						currentWorkflowStateKey:
							String(approvalBody.action || "").toLowerCase() === "reject"
								? "REJECTED"
								: "APPROVED",
					},
				});
				return;
			}

			await fulfillJson(route, {});
		},
	);

	return {
		listRequestUrls,
		detailRequestUrls,
		notificationRequestUrls,
		metricsRequestUrls,
		approvalRequestBodies,
	};
};

async function assertAttendanceCorrectionApprovalsFlow(params: {
	page: Page;
	user: MockUser;
	requestPayload: ReturnType<typeof buildAttendanceCorrectionRequest>;
	expectedActorParam: "approvalActorId" | "approvalActorType";
	expectedActorValue: string;
	decision?: "approve" | "reject";
	rejectionReason?: string;
}) {
	const { page, user, requestPayload, expectedActorParam, expectedActorValue, decision } = params;
	const routes = await installMockApi(page, user, requestPayload);

	await page.goto(
		expectedActorParam === "approvalActorId"
			? "/employee/approvals/requests?view=all"
			: "/hr/approvals/requests?view=all",
	);

	await expect(page.locator("main").getByText("My Approvals", { exact: true })).toBeVisible({
		timeout: routeReadyTimeoutMs,
	});
	await expect(
		page.locator("tbody").getByText("Attendance Correction", { exact: true }).first(),
	).toBeVisible();

	const reviewActionsButton = page.getByRole("button", {
		name: "Review Request actions",
	});
	await expect(reviewActionsButton).toBeVisible();
	await reviewActionsButton.click();

	await expect(page.getByRole("menuitem", { name: "Review Request" })).toBeVisible();
	await page.getByRole("menuitem", { name: "Review Request" }).click();

	await expect(page).toHaveURL(
		new RegExp(`action=view&id=${requestId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
	);
	await expect(
		page.getByText(
			"Approval updates attendance source records that may affect timesheets and payroll.",
		),
	).toBeVisible({
		timeout: routeReadyTimeoutMs,
	});
	await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Reject" })).toBeVisible();

	if (decision === "reject") {
		const rejectionReason =
			params.rejectionReason || "Attendance correction needs a supporting document.";
		await page.getByRole("button", { name: "Reject" }).click();
		await expect(page.getByRole("button", { name: "Confirm Rejection" })).toBeVisible({
			timeout: routeReadyTimeoutMs,
		});
		await page
			.getByPlaceholder("Explain why this request is being rejected...")
			.fill(rejectionReason);

		const rejectionResponse = page.waitForResponse((response) => {
			const url = new URL(response.url());
			return (
				url.pathname === `/api/request/${requestId}/approval` &&
				response.request().method() === "POST"
			);
		});
		await page.getByRole("button", { name: "Confirm Rejection" }).click();
		await rejectionResponse;

		expect(routes.approvalRequestBodies).toHaveLength(1);
		expect(routes.approvalRequestBodies[0]).toMatchObject({
			action: "reject",
			comment: rejectionReason,
		});
	}

	expect(
		routes.listRequestUrls.some(
			(url) => url.searchParams.get(expectedActorParam) === expectedActorValue,
		),
	).toBe(true);
	expect(
		routes.listRequestUrls.some((url) =>
			expectedActorParam === "approvalActorId"
				? url.searchParams.has("approvalActorType")
				: url.searchParams.has("approvalActorId"),
		),
	).toBe(false);
	expect(
		routes.detailRequestUrls.some((url) => url.pathname === `/api/request/${requestId}`),
	).toBe(true);
	expect(routes.notificationRequestUrls.length).toBeGreaterThan(0);
	expect(routes.metricsRequestUrls.length).toBeGreaterThan(0);
}

test("employee approvals route loads attendance correction review through the employee-manager branch", async ({
	page,
}) => {
	const user = buildUser({
		role: "hris-employee-manager",
		employeeId: "emp-manager-1",
		firstName: "Mia",
		lastName: "Santos",
		departmentName: "Operations",
		departmentCode: "OPS",
		positionTitle: "Operations Manager",
		positionCode: "OPS-MGR",
		levelName: "Manager",
		levelRank: 5,
		isManager: true,
		isHrManager: false,
	});
	const requestPayload = buildAttendanceCorrectionRequest({
		assigneeType: "SUPERVISOR",
		assigneeEmployeeId: "emp-manager-1",
		assigneeFirstName: "Mia",
		assigneeLastName: "Santos",
	});

	await assertAttendanceCorrectionApprovalsFlow({
		page,
		user,
		requestPayload,
		expectedActorParam: "approvalActorId",
		expectedActorValue: "emp-manager-1",
	});
});

test("hr approvals route loads attendance correction review through the HR branch", async ({
	page,
}) => {
	const user = buildUser({
		role: "hris-hr-user",
		employeeId: "emp-hr-1",
		firstName: "Jamie",
		lastName: "Lopez",
		departmentName: "Human Resources",
		departmentCode: "HR",
		positionTitle: "HR Specialist",
		positionCode: "HR-SPEC",
		levelName: "Associate",
		levelRank: 3,
		isManager: false,
		isHrManager: false,
	});
	const requestPayload = buildAttendanceCorrectionRequest({
		assigneeType: "HR",
		assigneeEmployeeId: "emp-hr-1",
		assigneeFirstName: "Jamie",
		assigneeLastName: "Lopez",
	});

	await assertAttendanceCorrectionApprovalsFlow({
		page,
		user,
		requestPayload,
		expectedActorParam: "approvalActorType",
		expectedActorValue: "HR",
	});
});

test("employee approvals route rejects attendance correction through the employee-manager branch", async ({
	page,
}) => {
	const user = buildUser({
		role: "hris-employee-manager",
		employeeId: "emp-manager-1",
		firstName: "Mia",
		lastName: "Santos",
		departmentName: "Operations",
		departmentCode: "OPS",
		positionTitle: "Operations Manager",
		positionCode: "OPS-MGR",
		levelName: "Manager",
		levelRank: 5,
		isManager: true,
		isHrManager: false,
	});
	const requestPayload = buildAttendanceCorrectionRequest({
		assigneeType: "SUPERVISOR",
		assigneeEmployeeId: "emp-manager-1",
		assigneeFirstName: "Mia",
		assigneeLastName: "Santos",
	});

	await assertAttendanceCorrectionApprovalsFlow({
		page,
		user,
		requestPayload,
		expectedActorParam: "approvalActorId",
		expectedActorValue: "emp-manager-1",
		decision: "reject",
		rejectionReason: "Attendance correction needs a supporting document.",
	});
});
