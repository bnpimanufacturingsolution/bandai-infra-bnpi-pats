import { expect, test, type Page } from "@playwright/test";

const timestamp = "2026-06-25T00:00:00.000Z";
const routeReadyTimeoutMs = 30_000;

type NotificationRecipient = {
	employeeId: string;
	readAt: string | null;
};

type NotificationRecord = {
	id: string;
	title: string;
	description: string;
	type: "INFO" | "SUCCESS" | "WARNING" | "ERROR" | "ALERT" | "REMINDER";
	category: "REQUEST" | "APPROVAL" | "SYSTEM" | "ANNOUNCEMENT" | "REMINDER" | "ALERT";
	createdAt: string;
	recipients: {
		read: NotificationRecipient[];
		unread: NotificationRecipient[];
	};
	metadata: Record<string, any>;
	sourceEmployeeId: string | null;
};

const json = (data: unknown) => ({
	status: 200,
	contentType: "application/json",
	body: JSON.stringify({ success: true, message: "OK", data }),
});

const employeeUser = {
	id: "user-employee",
	email: "employee@example.test",
	name: "Employee User",
	role: "hris-employee",
	subRole: "hris-employee",
	organizationId: "org-1",
	organization: {
		id: "org-1",
		name: "Test Organization",
		code: "TEST",
		branding: { colors: {} },
	},
	metadata: {
		employee: {
			id: "employee-1",
			personalInfo: {
				firstName: "Employee",
				lastName: "One",
			},
		},
	},
	token: "smoke-token",
};

const hrUser = {
	id: "user-hr",
	email: "hr-manager@example.test",
	name: "HR Manager",
	role: "hris-hr-manager",
	subRole: "hris-hr-manager",
	organizationId: "org-1",
	organization: {
		id: "org-1",
		name: "Test Organization",
		code: "TEST",
		branding: { colors: {} },
	},
	metadata: {
		employee: {
			id: "employee-hr",
			personalInfo: {
				firstName: "HR",
				lastName: "Manager",
			},
		},
	},
	token: "smoke-token",
};

const makeNotification = (params: {
	id: string;
	title: string;
	description: string;
	type: NotificationRecord["type"];
	category: NotificationRecord["category"];
	employeeId: string;
	metadata: Record<string, any>;
}): NotificationRecord => ({
	id: params.id,
	title: params.title,
	description: params.description,
	type: params.type,
	category: params.category,
	createdAt: timestamp,
	recipients: {
		read: [],
		unread: [{ employeeId: params.employeeId, readAt: null }],
	},
	metadata: params.metadata,
	sourceEmployeeId: null,
});

const employeeRequestNotifications = [
	makeNotification({
		id: "notif-time-adjustment",
		title: "Time adjustment submitted",
		description: "Your time adjustment request TA-001 was submitted.",
		type: "INFO",
		category: "REQUEST",
		employeeId: employeeUser.metadata.employee.id,
		metadata: {
			entityType: "REQUEST",
			entityId: "request-time-adjustment",
			requestType: "TIME_ADJUSTMENT",
			routeKey: "REQUEST_SELF_VIEW",
			action: "view",
			status: "PENDING",
			targetUrl: "/employee/requests?action=view&id=request-time-adjustment",
		},
	}),
	makeNotification({
		id: "notif-overtime",
		title: "Overtime submitted",
		description: "Your overtime request OT-001 was submitted.",
		type: "INFO",
		category: "REQUEST",
		employeeId: employeeUser.metadata.employee.id,
		metadata: {
			entityType: "REQUEST",
			entityId: "request-overtime",
			requestType: "OVERTIME",
			routeKey: "REQUEST_SELF_VIEW",
			action: "view",
			status: "PENDING",
			targetUrl: "/employee/requests?action=view&id=request-overtime",
		},
	}),
];

const employeeTimesheetNotifications = [
	makeNotification({
		id: "notif-timesheet-reminder",
		title: "Submit your timesheet",
		description: "Your timesheet for Period 2 - May 2026 needs to be submitted.",
		type: "REMINDER",
		category: "REMINDER",
		employeeId: employeeUser.metadata.employee.id,
		metadata: {
			entityType: "TIMESHEET",
			entityId: "timesheet-reminder-001",
			employeeId: employeeUser.metadata.employee.id,
			timesheetId: "timesheet-reminder-001",
			routeKey: "TIMESHEET_SELF_VIEW",
			action: "view",
			status: "DRAFT",
			targetUrl: "/employee/attendance?action=view-timesheet",
		},
	}),
	makeNotification({
		id: "notif-timesheet-correction",
		title: "Timesheet needs correction",
		description: "Your timesheet for Period 2 - May 2026 needs correction.",
		type: "REMINDER",
		category: "REMINDER",
		employeeId: employeeUser.metadata.employee.id,
		metadata: {
			entityType: "TIMESHEET",
			entityId: "timesheet-correction-001",
			employeeId: employeeUser.metadata.employee.id,
			timesheetId: "timesheet-correction-001",
			routeKey: "TIMESHEET_SELF_VIEW",
			action: "view",
			status: "REJECTED",
			targetUrl: "/employee/attendance?action=view-timesheet",
		},
	}),
	makeNotification({
		id: "notif-timesheet-approved",
		title: "Timesheet approved",
		description: "Your timesheet TS-003 was approved.",
		type: "SUCCESS",
		category: "APPROVAL",
		employeeId: employeeUser.metadata.employee.id,
		metadata: {
			entityType: "TIMESHEET",
			entityId: "timesheet-approved-001",
			employeeId: employeeUser.metadata.employee.id,
			timesheetId: "timesheet-approved-001",
			routeKey: "TIMESHEET_SELF_VIEW",
			action: "view",
			status: "APPROVED",
			targetUrl: "/employee/attendance?action=view-timesheet",
		},
	}),
	makeNotification({
		id: "notif-timesheet-rejected",
		title: "Timesheet rejected",
		description: "Your timesheet TS-004 was rejected.",
		type: "WARNING",
		category: "APPROVAL",
		employeeId: employeeUser.metadata.employee.id,
		metadata: {
			entityType: "TIMESHEET",
			entityId: "timesheet-rejected-001",
			employeeId: employeeUser.metadata.employee.id,
			timesheetId: "timesheet-rejected-001",
			routeKey: "TIMESHEET_SELF_VIEW",
			action: "view",
			status: "REJECTED",
			targetUrl: "/employee/attendance?action=view-timesheet",
		},
	}),
];

const hrNotifications = [
	makeNotification({
		id: "notif-overtime-approval",
		title: "Approval required",
		description: "An overtime request requires your review.",
		type: "INFO",
		category: "REQUEST",
		employeeId: hrUser.metadata.employee.id,
		metadata: {
			entityType: "REQUEST",
			entityId: "request-overtime-approval",
			requestType: "OVERTIME",
			routeKey: "REQUEST_APPROVAL_VIEW",
			action: "view",
			status: "PENDING",
			targetUrl: "/hr/approvals/requests?action=view&id=request-overtime-approval",
		},
	}),
	makeNotification({
		id: "notif-timesheet-approval",
		title: "Timesheet awaiting approval",
		description: "Employee timesheet TS-001 is waiting for your review.",
		type: "REMINDER",
		category: "APPROVAL",
		employeeId: hrUser.metadata.employee.id,
		metadata: {
			entityType: "TIMESHEET",
			entityId: "timesheet-001",
			timesheetId: "timesheet-001",
			routeKey: "TIMESHEET_APPROVAL_VIEW",
			action: "review",
			status: "SUBMITTED",
			targetUrl: "/hr/approvals/timesheet?action=timesheet.review&id=timesheet-001",
		},
	}),
];

const employeePayrollNotifications = [
	makeNotification({
		id: "notif-payroll-published",
		title: "Payroll published",
		description: "Your payroll for Period 2 - June 2026 is now available.",
		type: "INFO",
		category: "ANNOUNCEMENT",
		employeeId: employeeUser.metadata.employee.id,
		metadata: {
			entityType: "EMPLOYEE_PAYROLL",
			entityId: "payroll-001",
			employeeId: employeeUser.metadata.employee.id,
			employeePayrollId: "payroll-001",
			payrollPeriodId: "period-2026-06-2",
			routeKey: "PAYROLL_SELF_VIEW",
		},
	}),
	makeNotification({
		id: "notif-payslip-available",
		title: "Payslip available",
		description: "Your payslip for Period 2 - June 2026 is now available.",
		type: "SUCCESS",
		category: "ANNOUNCEMENT",
		employeeId: employeeUser.metadata.employee.id,
		metadata: {
			entityType: "EMPLOYEE_PAYROLL",
			entityId: "payroll-002",
			employeeId: employeeUser.metadata.employee.id,
			employeePayrollId: "payroll-002",
			payrollPeriodId: "period-2026-06-2",
			routeKey: "PAYSLIP_SELF_VIEW",
		},
	}),
	makeNotification({
		id: "notif-payment-issue",
		title: "Payment issue",
		description: "There is a payment issue affecting your payroll.",
		type: "WARNING",
		category: "ALERT",
		employeeId: employeeUser.metadata.employee.id,
		metadata: {
			entityType: "EMPLOYEE_PAYROLL",
			entityId: "payroll-003",
			employeeId: employeeUser.metadata.employee.id,
			employeePayrollId: "payroll-003",
			payrollPeriodId: "period-2026-06-2",
			routeKey: "PAYMENT_ISSUE_SELF_VIEW",
		},
	}),
	makeNotification({
		id: "notif-payroll-malformed",
		title: "Payroll published (fallback)",
		description: "Malformed payroll notification should fail safely.",
		type: "INFO",
		category: "ANNOUNCEMENT",
		employeeId: employeeUser.metadata.employee.id,
		metadata: {
			entityType: "EMPLOYEE_PAYROLL",
			entityId: "payroll-malformed",
			routeKey: "PAYROLL_SELF_VIEW",
		},
	}),
];

const buildActionMetrics = (notificationCount: number) => ({
	total: notificationCount,
	summary: {
		total: notificationCount,
		high: 0,
		medium: 0,
		low: 0,
	},
	counts: {
		dashboard: 0,
		tickets: {
			total: 0,
		},
		requests: {
			total: notificationCount,
		},
		approvals: {
			total: Math.max(notificationCount - 1, 0),
			requests: Math.min(notificationCount, 1),
			timesheet: Math.min(notificationCount, 1),
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
		timesheets: {
			total: 0,
		},
		notifications: {
			total: notificationCount,
		},
	},
	items: {
		dashboard: [],
		documents: [],
		onboardingDocuments: [],
	},
	categories: {
		documents: [],
	},
});

const installMockApi = async (page: Page, user: typeof employeeUser | typeof hrUser, notifications: NotificationRecord[]) => {
	const responseById = new Map(notifications.map((notification) => [notification.id, notification]));
	const resolvedRole = user.role;
	const resolvedSubRole = user.subRole;

	await page.addInitScript(() => {
		window.localStorage.setItem("authToken", "smoke-token");
	});

	await page.addInitScript(
		({ role, subRole }) => {
			window.localStorage.setItem("userRole", role);
			window.localStorage.setItem("userSubRole", subRole);
		},
		{ role: resolvedRole, subRole: resolvedSubRole },
	);

	await page.addInitScript(
		(currentUser) => {
			window.localStorage.setItem("e2eAuthUser", JSON.stringify(currentUser));
		},
		user,
	);

	await page.route("**/api/**", async (route) => {
		const request = route.request();
		const requestUrl = new URL(request.url());
		const path = requestUrl.pathname;
		const method = request.method();

		if (path.endsWith("/auth/me")) {
			await route.fulfill(rawJson(user));
			return;
		}

		if (path.endsWith("/system-provisioning/status")) {
			await route.fulfill(
				json({
					mode: "READY",
					canManageSetup: false,
					isProvisioned: true,
					currentStep: "complete",
					initializationStatus: "COMPLETED",
					steps: [],
				}),
			);
			return;
		}

		if (path.endsWith("/metrics/actions")) {
			await route.fulfill(json(buildActionMetrics(notifications.length)));
			return;
		}

		if (path.endsWith("/notification") && method === "GET") {
			await route.fulfill(json({ notifications, count: notifications.length }));
			return;
		}

		if (path.includes("/notification/") && path.endsWith("/mark-read") && method === "POST") {
			const notificationId = path.split("/").slice(-2, -1)[0];
			await route.fulfill(
				json({
					notification: notificationId ? responseById.get(notificationId) : notifications[0],
				}),
			);
			return;
		}

		if (path.includes("/notification/") && method === "DELETE") {
			await route.fulfill({ status: 204, body: "" });
			return;
		}

		await route.fulfill(json({}));
	});
};

const rawJson = (data: unknown) => ({
	status: 200,
	contentType: "application/json",
	body: JSON.stringify(data),
});

test("employee notifications badge and dropdown route time adjustment and overtime requests to the employee request hub", async ({
	page,
}) => {
	await installMockApi(page, employeeUser, employeeRequestNotifications);

	await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

	await expect(page.locator("#navbar-notifications")).toContainText("2");

	await page.locator("#navbar-notifications").click();
	await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
	await expect(page.getByText("Time adjustment submitted")).toBeVisible();
	await expect(page.getByText("Overtime submitted")).toBeVisible();

	await Promise.all([
		page.waitForURL(/\/employee\/requests\?action=view&id=request-time-adjustment$/),
		page.getByText("Time adjustment submitted").click(),
	]);
	await expect(page).toHaveURL(/\/employee\/requests\?action=view&id=request-time-adjustment$/);

	await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
	await page.locator("#navbar-notifications").click();
	await Promise.all([
		page.waitForURL(/\/employee\/requests\?action=view&id=request-overtime$/),
		page.getByText("Overtime submitted").click(),
	]);
	await expect(page).toHaveURL(/\/employee\/requests\?action=view&id=request-overtime$/);
});

test("employee timesheet notifications open the attendance timesheet view from the shared feed", async ({
	page,
}) => {
	await installMockApi(page, employeeUser, employeeTimesheetNotifications);
	const attendanceUrl = new RegExp(
		`/employee/${employeeUser.metadata.employee.id}/attendance\\?action=view-timesheet$`,
	);

	await page.goto("/employee/notifications", { waitUntil: "domcontentloaded" });

	await expect(page.locator("#navbar-notifications")).toContainText("4");
	await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
	await expect(page.getByText("Submit your timesheet")).toBeVisible();
	await expect(page.getByText("Timesheet needs correction")).toBeVisible();
	await expect(page.getByText("Timesheet approved")).toBeVisible();
	await expect(page.getByText("Timesheet rejected")).toBeVisible();

	await Promise.all([
		page.waitForURL(attendanceUrl),
		page.getByRole("heading", { name: "Timesheet needs correction" }).click(),
	]);
	await expect(page).toHaveURL(attendanceUrl);
});

test("hr notifications page routes overtime approvals and timesheet approvals to the right approval pages", async ({
	page,
}) => {
	await installMockApi(page, hrUser, hrNotifications);

	await page.goto("/hr/notifications", { waitUntil: "domcontentloaded" });

	await expect(page.locator("#navbar-notifications")).toContainText("2");
	await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
	await expect(page.getByText("1 Requests | 1 Approvals")).toBeVisible();

	await Promise.all([
		page.waitForURL(/\/hr\/approvals\/requests\?action=view&id=request-overtime-approval$/),
		page.getByRole("heading", { name: "Approval required" }).click(),
	]);
	await expect(page).toHaveURL(/\/hr\/approvals\/requests\?action=view&id=request-overtime-approval$/);

	await page.goto("/hr/notifications", { waitUntil: "domcontentloaded" });
	await Promise.all([
		page.waitForURL(/\/hr\/approvals\/timesheet\?action=timesheet.review&id=timesheet-001$/),
		page.getByRole("heading", { name: "Timesheet awaiting approval" }).click(),
	]);
	await expect(page).toHaveURL(/\/hr\/approvals\/timesheet\?action=timesheet.review&id=timesheet-001$/);
});

test("employee payroll notifications route to app-specific payroll pages and malformed metadata falls back safely", async ({
	page,
}) => {
	await installMockApi(page, employeeUser, employeePayrollNotifications);

	await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
	await expect(page.locator("#navbar-notifications")).toContainText("4");

	await page.locator("#navbar-notifications").click();
	await expect(page.getByText("Payroll published", { exact: true })).toBeVisible();
	await expect(page.getByText("Payslip available", { exact: true })).toBeVisible();
	await expect(page.getByText("Payment issue", { exact: true })).toBeVisible();

	await Promise.all([
		page.waitForURL(
			new RegExp(`/employee/${employeeUser.metadata.employee.id}/payroll/payroll-001$`),
		),
		page.getByText("Payroll published", { exact: true }).click(),
	]);
	await expect(page).toHaveURL(
		new RegExp(`/employee/${employeeUser.metadata.employee.id}/payroll/payroll-001$`),
	);

	await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
	await page.locator("#navbar-notifications").click();
	await Promise.all([
		page.waitForURL(
			new RegExp(`/employee/${employeeUser.metadata.employee.id}/payroll/payroll-002$`),
		),
		page.getByText("Payslip available", { exact: true }).click(),
	]);
	await expect(page).toHaveURL(
		new RegExp(`/employee/${employeeUser.metadata.employee.id}/payroll/payroll-002$`),
	);

	await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
	await page.locator("#navbar-notifications").click();
	await Promise.all([
		page.waitForURL(
			new RegExp(`/employee/${employeeUser.metadata.employee.id}/payroll/payroll-003$`),
		),
		page.getByText("Payment issue", { exact: true }).click(),
	]);
	await expect(page).toHaveURL(
		new RegExp(`/employee/${employeeUser.metadata.employee.id}/payroll/payroll-003$`),
	);

	await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
	await page.locator("#navbar-notifications").click();
	await Promise.all([
		page.waitForURL(/\/dashboard$/),
		page.getByText("Payroll published (fallback)").click(),
	]);
	await expect(page).toHaveURL(/\/dashboard$/);
});

test("authorized HR user can submit a broadcast announcement and calls POST /api/notification with correct payload", async ({
	page,
}) => {
	let postPayload: any = null;

	await installMockApi(page, hrUser, []);

	await page.route("**/api/notification", async (route) => {
		const request = route.request();
		const method = request.method();

		if (method === "POST") {
			postPayload = request.postDataJSON();
			await route.fulfill({
				status: 201,
				contentType: "application/json",
				body: JSON.stringify({
					success: true,
					data: {
						id: "new-notif-id",
						title: postPayload.title,
						description: postPayload.description,
						category: postPayload.category,
						type: postPayload.type,
						createdAt: new Date().toISOString(),
						recipients: { read: [], unread: [] },
					},
				}),
			});
			return;
		}

		await route.fallback();
	});

	await page.goto("/announcements", { waitUntil: "domcontentloaded" });

	await expect(page.getByRole("heading", { name: "HR Announcements" })).toBeVisible();
	const createBtn = page.locator("#create-announcement-btn");
	await expect(createBtn).toBeVisible();

	await createBtn.click();

	await page.locator("#announcement-form-title").fill("Urgent Holiday Notice");
	await page.locator("#announcement-form-description").fill("All offices closed next Monday.");
	await page.locator("#announcement-form-type").selectOption("ALERT");
	await page.locator("#announcement-form-subcategory").selectOption("Holiday");

	const broadcastCheckbox = page.locator("#announcement-form-broadcast");
	await expect(broadcastCheckbox).toBeChecked();

	page.on("dialog", async (dialog) => {
		expect(dialog.message()).toContain("Announcement created successfully");
		await dialog.accept();
	});

	await page.locator("#announcement-form-submit").click();

	await expect.poll(() => postPayload).not.toBeNull();

	expect(postPayload.title).toBe("Urgent Holiday Notice");
	expect(postPayload.description).toBe("All offices closed next Monday.");
	expect(postPayload.type).toBe("ALERT");
	expect(postPayload.category).toBe("ALERT");
	expect(postPayload.broadcast).toBe(true);
	expect(postPayload.metadata.subcategory).toBe("Holiday");
});
