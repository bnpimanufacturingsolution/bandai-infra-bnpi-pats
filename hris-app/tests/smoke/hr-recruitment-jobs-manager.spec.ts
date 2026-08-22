import { expect, test, type Page, type Route } from "@playwright/test";

const timestamp = "2026-06-08T00:00:00.000Z";
const routeReadyTimeoutMs = 30_000;

const hrManagerUser = {
	id: "user-hr-manager",
	email: "hr.manager@example.test",
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
			id: "emp-hr-manager",
			employmentStatus: "active",
		},
	},
	token: "smoke-token",
};

const readyProvisioningStatus = {
	mode: "READY",
	canManageSetup: true,
	currentStep: "admin-account",
	isProvisioned: true,
	initializationStatus: "COMPLETED",
	provisionedAt: timestamp,
	provisionedBy: "user-hr-manager",
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
		id: "org-1",
		name: "Test Organization",
		code: "TEST",
	},
};

const levels = [
	{
		id: "level-senior",
		name: "Senior",
		rank: 5,
		isActive: true,
		createdAt: timestamp,
		updatedAt: timestamp,
	},
	{
		id: "level-mid",
		name: "Mid",
		rank: 4,
		isActive: true,
		createdAt: timestamp,
		updatedAt: timestamp,
	},
];

const positions = [
	{
		id: "position-qa",
		title: "QA Engineer",
		code: "POS-QA",
		description: "Owns quality validation.",
		sectionId: "section-eng-qa",
		section: {
			id: "section-eng-qa",
			name: "Quality Engineering",
			code: "QE",
			departmentId: "dept-eng",
			department: {
				id: "dept-eng",
				name: "Engineering",
				code: "ENG",
			},
		},
		levels: [
			{
				id: "position-level-senior",
				levelId: "level-senior",
				level: levels[0],
			},
		],
		isActive: true,
		createdAt: timestamp,
		updatedAt: timestamp,
	},
	{
		id: "position-se",
		title: "Software Engineer",
		code: "POS-SE",
		description: "Builds product features.",
		sectionId: "section-eng-apps",
		section: {
			id: "section-eng-apps",
			name: "Applications",
			code: "APP",
			departmentId: "dept-eng",
			department: {
				id: "dept-eng",
				name: "Engineering",
				code: "ENG",
			},
		},
		levels: [
			{
				id: "position-level-mid",
				levelId: "level-mid",
				level: levels[1],
			},
		],
		isActive: true,
		createdAt: timestamp,
		updatedAt: timestamp,
	},
	{
		id: "position-ops",
		title: "Operations Analyst",
		code: "POS-OPS",
		description: "Supports operational reporting.",
		sectionId: "section-ops",
		section: {
			id: "section-ops",
			name: "Operations",
			code: "OPS",
			departmentId: "dept-ops",
			department: {
				id: "dept-ops",
				name: "Operations",
				code: "OPS",
			},
		},
		levels: [
			{
				id: "position-level-ops",
				levelId: "level-mid",
				level: levels[1],
			},
		],
		isActive: true,
		createdAt: timestamp,
		updatedAt: timestamp,
	},
];

const jobs = [
	{
		id: "job-qa-active",
		positionId: "position-qa",
		position: {
			id: "position-qa",
			title: "QA Engineer",
			sectionId: "section-eng-qa",
			section: {
				id: "section-eng-qa",
				name: "Quality Engineering",
				code: "QE",
				departmentId: "dept-eng",
			},
		},
		levelId: "level-senior",
		level: {
			id: "level-senior",
			name: "Senior",
		},
		headcountRequested: 2,
		type: "FULL_TIME",
		location: "REMOTE",
		description: "Lead the QA practice for product releases.",
		isDeleted: false,
		createdAt: timestamp,
		updatedAt: timestamp,
	},
	{
		id: "job-se-active",
		positionId: "position-se",
		position: {
			id: "position-se",
			title: "Software Engineer",
			sectionId: "section-eng-apps",
			section: {
				id: "section-eng-apps",
				name: "Applications",
				code: "APP",
				departmentId: "dept-eng",
			},
		},
		levelId: "level-mid",
		level: {
			id: "level-mid",
			name: "Mid",
		},
		headcountRequested: 1,
		type: "FULL_TIME",
		location: "HYBRID",
		description: "Build core HR workflows.",
		isDeleted: false,
		createdAt: timestamp,
		updatedAt: timestamp,
	},
	{
		id: "job-ops-archived",
		positionId: "position-ops",
		position: {
			id: "position-ops",
			title: "Operations Analyst",
			sectionId: "section-ops",
			section: {
				id: "section-ops",
				name: "Operations",
				code: "OPS",
				departmentId: "dept-ops",
			},
		},
		levelId: "level-mid",
		level: {
			id: "level-mid",
			name: "Mid",
		},
		headcountRequested: 1,
		type: "CONTRACT",
		location: "ONSITE",
		description: "Archived role for smoke filtering.",
		isDeleted: true,
		createdAt: timestamp,
		updatedAt: timestamp,
	},
];

const workflowTemplate = {
	id: "workflow-recruitment-default",
	code: "WF-RECRUITMENT-APPLICANT-DEFAULT",
	states: [
		{ key: "APPLIED", label: "Applied", order: 1, isTerminal: false },
		{ key: "SCREENING", label: "Screening", order: 2, isTerminal: false },
		{ key: "HIRED", label: "Hired", order: 3, isTerminal: true },
	],
	steps: [
		{
			step_number: 1,
			step_name: "Applied",
			step_type: "SUBMISSION",
			assignee_type: "REQUESTER",
			state_on_enter: "APPLIED",
		},
		{
			step_number: 2,
			step_name: "Screening",
			step_type: "TASK",
			assignee_type: "HR",
			state_on_enter: "SCREENING",
		},
		{
			step_number: 3,
			step_name: "Hire",
			step_type: "APPROVAL",
			assignee_type: "HR",
			state_on_enter: "HIRED",
		},
	],
	currentStateKey: "APPLIED",
};

const parseFilter = (value: string | null) => {
	const pairs = (value || "")
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);

	return Object.fromEntries(
		pairs.map((pair) => {
			const [key, ...rest] = pair.split(":");
			return [key, rest.join(":")];
		}),
	) as Record<string, string>;
};

const jobResponseFor = (url: URL) => {
	const query = (url.searchParams.get("query") || "").trim().toLowerCase();
	const filter = parseFilter(url.searchParams.get("filter"));
	const page = Number(url.searchParams.get("page") || "1");
	const limit = Number(url.searchParams.get("limit") || "10");

	let rows = jobs;

	if (filter.isDeleted === "true") {
		rows = rows.filter((job) => job.isDeleted);
	} else if (filter.isDeleted === "false") {
		rows = rows.filter((job) => !job.isDeleted);
	}

	if (filter.type) {
		rows = rows.filter((job) => job.type === filter.type);
	}

	if (filter.location) {
		rows = rows.filter((job) => job.location === filter.location);
	}

	if (query) {
		rows = rows.filter((job) =>
			[
				job.position.title,
				job.position.section?.name,
				job.level?.name,
				job.description,
				job.type,
				job.location,
				job.isDeleted ? "archived" : "active",
			]
				.join(" ")
				.toLowerCase()
				.includes(query),
		);
	}

	const start = (page - 1) * limit;
	const paginatedRows = rows.slice(start, start + limit);

	return {
		jobs: paginatedRows,
		pagination: {
			total: rows.length,
			page,
			limit,
			totalPages: Math.max(1, Math.ceil(rows.length / limit)),
			hasNext: start + limit < rows.length,
			hasPrev: page > 1,
		},
	};
};

const fulfillJson = async (route: Route, data: unknown) => {
	await route.fulfill({
		status: 200,
		contentType: "application/json",
		body: JSON.stringify(data),
	});
};

const installMockApi = async (page: Page) => {
	const jobRequestUrls: URL[] = [];

	await page.addInitScript(() => {
		window.localStorage.setItem("authToken", "smoke-token");
		window.localStorage.setItem("userRole", "hris-hr-manager");
		window.localStorage.setItem("userSubRole", "hris-hr-manager");
	});

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

			if (path.endsWith("/auth/me")) {
				await fulfillJson(route, {
					success: true,
					message: "OK",
					data: hrManagerUser,
				});
				return;
			}

			if (path.endsWith("/system-provisioning/status")) {
				await fulfillJson(route, {
					success: true,
					message: "OK",
					data: readyProvisioningStatus,
				});
				return;
			}

			if (path.endsWith("/applicant")) {
				await fulfillJson(route, {
					success: true,
					message: "OK",
					data: {
						applicants: {},
						pagination: {
							total: 0,
							page: 1,
							limit: 1000,
							totalPages: 1,
						},
					},
				});
				return;
			}

			if (path.endsWith("/workflowEngine")) {
				await fulfillJson(route, {
					success: true,
					message: "OK",
					data: {
						workflowInstances: [workflowTemplate],
						pagination: {
							total: 1,
							page: 1,
							limit: 10,
							totalPages: 1,
						},
					},
				});
				return;
			}

			if (path.endsWith("/employee")) {
				await fulfillJson(route, {
					success: true,
					message: "OK",
					data: {
						employees: [],
						pagination: {
							total: 0,
							page: 1,
							limit: 200,
							totalPages: 1,
						},
					},
				});
				return;
			}

			if (path.endsWith("/position")) {
				await fulfillJson(route, {
					success: true,
					message: "OK",
					data: {
						positions,
						pagination: {
							total: positions.length,
							page: 1,
							limit: 1000,
							totalPages: 1,
						},
					},
				});
				return;
			}

			if (path.endsWith("/level")) {
				await fulfillJson(route, {
					success: true,
					message: "OK",
					data: {
						levels,
						pagination: {
							total: levels.length,
							page: 1,
							limit: 1000,
							totalPages: 1,
						},
					},
				});
				return;
			}

			if (path.endsWith("/metrics/actions")) {
				await fulfillJson(route, {
					success: true,
					message: "OK",
					data: {
						total: 0,
						summary: {
							total: 0,
							high: 0,
							medium: 0,
							low: 0,
						},
						counts: {
							dashboard: 0,
							tickets: { total: 0 },
							requests: { total: 0 },
							approvals: {
								total: 0,
								requests: 0,
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
				});
				return;
			}

			if (path.endsWith("/workforce-recruitment-setting/request-context")) {
				await fulfillJson(route, {
					settings: {
						isEnabled: true,
						enforceDepartmentManagerScope: false,
						defaultWorkflowCode: "WF-RECRUITMENT-APPLICANT-DEFAULT",
						requestSubtype: "DEPARTMENT_JOB_REQUISITION",
						autoCreateJobOnApproval: false,
					},
					requester: {
						id: hrManagerUser.id,
						role: hrManagerUser.role,
						isDepartmentManager: false,
					},
					scope: {},
					policy: {
						id: "policy-1",
						targetHeadcount: 3,
						limitBehavior: "WARN",
						isActive: true,
					},
					headcount: {
						currentHeadcount: 1,
						availableHeadcount: 2,
					},
					permissions: {
						canSubmit: true,
					},
				});
				return;
			}

			if (path.endsWith("/job")) {
				jobRequestUrls.push(requestUrl);
				await fulfillJson(route, jobResponseFor(requestUrl));
				return;
			}

			await fulfillJson(route, {});
		},
	);

	return jobRequestUrls;
};

test("hr recruitment jobs manager searches and filters through server query params", async ({
	page,
}) => {
	const jobRequestUrls = await installMockApi(page);

	await page.goto("/hr/recruitment");

	await expect(page.getByRole("heading", { name: "Recruitment" })).toBeVisible({
		timeout: routeReadyTimeoutMs,
	});
	await expect(page.getByPlaceholder("Search applicants...")).toBeVisible();

	await page.getByRole("button", { name: "Manage Jobs" }).click();

	await expect(page.getByRole("heading", { name: "Manage Jobs" })).toBeVisible();
	await expect(page.getByPlaceholder("Search positions...")).toBeVisible();

	const table = page.getByRole("table");
	const jobNameCell = (name: string) => table.getByRole("cell", { name, exact: false });

	await expect(jobNameCell("QA Engineer")).toBeVisible();
	await expect(jobNameCell("Software Engineer")).toBeVisible();
	await expect(page.getByText("Showing 1 to 2 of 2 results")).toBeVisible();

	await page.getByPlaceholder("Search positions...").fill("qa");

	await expect(page).toHaveURL(/jobSearch=qa/);
	await expect(jobNameCell("QA Engineer")).toBeVisible();
	await expect(jobNameCell("Software Engineer")).toBeHidden();
	await expect(page.getByText("Showing 1 to 1 of 1 results")).toBeVisible();
	expect(jobRequestUrls.some((url) => url.searchParams.get("query") === "qa")).toBe(true);

	await page.getByPlaceholder("Search positions...").fill("");
	await expect(page).not.toHaveURL(/jobSearch=/);
	await expect(jobNameCell("Software Engineer")).toBeVisible();

	await page.getByRole("button", { name: /filters/i }).click();
	await page.getByRole("combobox").first().click();
	await page.getByRole("option", { name: "Archived" }).click();

	await expect(page).toHaveURL(/jobStatus=inactive/);
	await expect(jobNameCell("Operations Analyst")).toBeVisible();
	await expect(jobNameCell("QA Engineer")).toBeHidden();
	await expect(page.getByText("Showing 1 to 1 of 1 results")).toBeVisible();
	expect(
		jobRequestUrls.some((url) => {
			const filter = parseFilter(url.searchParams.get("filter"));
			return filter.isDeleted === "true";
		}),
	).toBe(true);
});
