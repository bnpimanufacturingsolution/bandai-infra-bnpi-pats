import { expect, test, type Locator, type Page } from "@playwright/test";

const timestamp = "2026-06-01T00:00:00.000Z";
const routeReadyTimeoutMs = 30_000;

const employeePhones = Array.from({ length: 18 }, (_, index) => ({
	type: index === 0 ? "mobile" : "work",
	countryCode: "+63",
	number: `9170001${String(index).padStart(3, "0")}`,
	isPrimary: index === 0,
}));

const employeeRecord = {
	id: "employee-self",
	organizationId: "org-1",
	employeeId: "BN-001",
	personId: "person-1",
	userId: "user-1",
	employmentHireDate: "2024-01-15",
	employmentStartDate: "2024-01-20",
	employmentStatus: "ACTIVE",
	employmentType: "REGULAR",
	probationEndDate: "2024-07-20",
	departmentId: "dept-1",
	positionId: "position-1",
	levelId: "level-1",
	workLocation: "HYBRID",
	workforceSource: "DIRECT",
	basicSalary: 40000,
	currency: "PHP",
	payFrequency: "MONTHLY",
	isDeleted: false,
	isTour: false,
	createdAt: timestamp,
	updatedAt: timestamp,
	user: {
		id: "user-1",
		avatar: "https://example.test/avatar.png",
	},
	department: {
		id: "dept-1",
		organizationId: "org-1",
		name: "Manufacturing",
		code: "MFG",
		managerId: "manager-1",
		isActive: true,
		isDefault: false,
		isDeleted: false,
		createdAt: timestamp,
		updatedAt: timestamp,
	},
	section: {
		id: "section-1",
		name: "Assembly",
		code: "ASM",
		departmentId: "dept-1",
	},
	position: {
		id: "position-1",
		organizationId: "org-1",
		title: "Line Supervisor",
		code: "LS-1",
		departmentId: "dept-1",
		isActive: true,
		isDeleted: false,
		createdAt: timestamp,
		updatedAt: timestamp,
	},
	level: {
		id: "level-1",
		name: "Level 3",
		rank: 3,
	},
	documents: [],
	person: {
		id: "person-1",
		organizationId: "org-1",
		createdAt: timestamp,
		updatedAt: timestamp,
		isDeleted: false,
		personalInfo: {
			firstName: "Aira",
			lastName: "Santos",
			dateOfBirth: "1995-05-10",
			nationality: "Filipino",
			primaryLanguage: "English",
		},
		contactInfo: {
			email: "aira.santos@example.test",
			phones: employeePhones,
			address: [
				{
					street: "123 Main Street",
					city: "Makati",
					state: "Metro Manila",
					country: "Philippines",
					postalCode: "1200",
					zipCode: "1200",
					houseNumber: "123",
				},
			],
		},
		identification: {
			type: "passport",
			number: "P1234567",
			issuingCountry: "PH",
			expiryDate: "2030-01-01",
		},
	},
};

const employeeUser = {
	id: "user-1",
	email: "aira.santos@example.test",
	name: "Aira Santos",
	role: "hris-employee",
	subRole: "hris-employee",
	organizationId: "org-1",
	organization: {
		id: "org-1",
		name: "Test Organization",
		code: "TEST",
		branding: { colors: {} },
	},
	avatar: "https://example.test/avatar.png",
	metadata: {
		employee: {
			id: "employee-self",
			isDepartmentManager: false,
			personalInfo: {
				firstName: "Aira",
				lastName: "Santos",
			},
			position: {
				title: "Line Supervisor",
			},
			level: {
				name: "Level 3",
			},
			department: {
				name: "Manufacturing",
			},
		},
	},
	token: "smoke-token",
};

const actionMetrics = {
	total: 2,
	summary: {
		total: 2,
		high: 1,
		medium: 1,
		low: 0,
	},
	counts: {
		dashboard: 2,
		tickets: { total: 0 },
		requests: { total: 0 },
		approvals: { total: 0, requests: 0, timesheet: 0 },
		documents: {
			total: 1,
			missing: 1,
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
		documents: [
			{
				key: "gov-id",
				type: "passport",
				displayName: "Passport",
				priorityState: "missing_required",
				isActionable: true,
				isVirtual: false,
				isExpired: false,
				displayOrder: 1,
				priorityLevel: "high",
				isMandated: true,
				requiredForPayroll: false,
				requiredForOnboarding: true,
				requireFileForCompliance: true,
			},
		],
		onboardingDocuments: [],
	},
	categories: {
		documents: [],
	},
};

const json = (data: unknown) => ({
	status: 200,
	contentType: "application/json",
	body: JSON.stringify({ success: true, message: "OK", data }),
});

const rawJson = (data: unknown) => ({
	status: 200,
	contentType: "application/json",
	body: JSON.stringify(data),
});

const installMockApi = async (page: Page) => {
	const e2eAuthUser = {
		...employeeUser,
		metadata: {
			...employeeUser.metadata,
			employee: {
				...employeeUser.metadata.employee,
				employmentStatus: "ACTIVE",
			},
		},
	};

	await page.addInitScript(() => {
		window.localStorage.setItem("authToken", "smoke-token");
		window.localStorage.setItem("userRole", "hris-employee");
		window.localStorage.setItem("userSubRole", "hris-employee");
	});

	await page.addInitScript(
		(currentUser) => {
			window.localStorage.setItem("e2eAuthUser", JSON.stringify(currentUser));
		},
		e2eAuthUser,
	);

	const handleRoute = async (route: any) => {
		const requestUrl = new URL(route.request().url());
		const path = requestUrl.pathname;

		if (!path.startsWith("/api/")) {
			await route.continue();
			return;
		}

		if (path.endsWith("/auth/me")) {
			await route.fulfill(rawJson(employeeUser));
			return;
		}

		if (path.endsWith("/metrics/actions")) {
			await route.fulfill(json(actionMetrics));
			return;
		}

		if (path.endsWith("/employee/employee-self")) {
			await route.fulfill(json(employeeRecord));
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

		if (path.endsWith("/notifications") || path.endsWith("/notification")) {
			await route.fulfill(json({ notifications: [] }));
			return;
		}

		await route.fulfill(json({}));
	};

	await page.route("**/api/**", handleRoute);
};

const getTop = async (locator: Locator) => (await locator.boundingBox())?.y ?? null;

test("employee detail keeps the tab bar pinned while only the tab panel scrolls", async ({
	page,
}) => {
	await installMockApi(page);

	await page.goto("/employee/employee-self?tab=employment&source=smoke");

	await expect(page.getByRole("heading", { name: "Employment Status" })).toBeVisible({
		timeout: routeReadyTimeoutMs,
	});

	await page.getByRole("tab", { name: /^personal$/i }).click();

	await expect(page).toHaveURL(/tab=personal/);
	await expect(page).toHaveURL(/source=smoke/);
	await expect(page.getByTestId("employee-profile-hero")).toBeVisible();
	await expect(page.getByRole("heading", { name: "Contact Information" })).toBeVisible();

	const tabBar = page.getByTestId("employee-detail-tab-bar");
	const tabPanel = page.getByTestId("employee-detail-tab-panel");

	const beforeTabBarTop = await getTop(tabBar);

	await tabPanel.evaluate((node) => {
		node.scrollTop = 480;
	});

	await expect
		.poll(async () => tabPanel.evaluate((node) => node.scrollTop))
		.toBeGreaterThan(0);

	const afterTabBarTop = await getTop(tabBar);

	expect(afterTabBarTop).toBe(beforeTabBarTop);
	expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
