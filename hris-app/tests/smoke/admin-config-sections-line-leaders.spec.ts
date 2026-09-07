import { expect, test, type Page } from "@playwright/test";

type LineLeaderMembership = {
	id: string;
	employeeId: string;
	employee: {
		id: string;
		employeeId: string;
		person: {
			personalInfo: {
				firstName: string;
				lastName: string;
			};
		};
	};
};

type Section = {
	id: string;
	name: string;
	code: string;
	departmentId: string;
	department: { id: string; name: string; code?: string };
	headId: string | null;
	head: null;
	lineLeaders: LineLeaderMembership[];
	scheduleId: string | null;
	isHr: boolean;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
};

const timestamp = "2026-09-07T00:00:00.000Z";
const routeReadyTimeoutMs = 30_000;

const employees = [
	{
		id: "emp-1",
		employeeId: "EMP-1",
		person: { personalInfo: { firstName: "Alice", lastName: "Reyes" } },
	},
	{
		id: "emp-2",
		employeeId: "EMP-2",
		person: { personalInfo: { firstName: "Ben", lastName: "Cruz" } },
	},
	{
		id: "emp-3",
		employeeId: "EMP-3",
		person: { personalInfo: { firstName: "Cara", lastName: "Lim" } },
	},
];

const membershipFor = (employeeId: string, index: number): LineLeaderMembership => {
	const employee = employees.find((candidate) => candidate.id === employeeId)!;
	return {
		id: `mem-${employeeId}`,
		employeeId,
		employee,
		createdAt: timestamp,
		index,
	} as LineLeaderMembership & { index: number };
};

const sections: Section[] = [
	{
		id: "sec-1",
		name: "Assembly Operations",
		code: "ASM-OPS",
		departmentId: "dept-asm",
		department: { id: "dept-asm", name: "Assembly", code: "ASM" },
		headId: null,
		head: null,
		lineLeaders: [membershipFor("emp-1", 0), membershipFor("emp-2", 1)],
		scheduleId: null,
		isHr: false,
		isActive: true,
		createdAt: timestamp,
		updatedAt: timestamp,
	},
	{
		id: "sec-2",
		name: "Decoration Operations",
		code: "DEC-OPS",
		departmentId: "dept-dec",
		department: { id: "dept-dec", name: "Decoration", code: "DEC" },
		headId: null,
		head: null,
		lineLeaders: [],
		scheduleId: null,
		isHr: false,
		isActive: true,
		createdAt: mockUpdatedAt(),
		updatedAt: mockUpdatedAt(),
	},
];

function mockUpdatedAt() {
	return timestamp;
}

const adminUser = {
	id: "user-admin",
	email: "admin@example.test",
	name: "Admin User",
	role: "hris-admin",
	subRole: "hris-admin",
	organizationId: "org-1",
	organization: {
		id: "org-1",
		name: "Test Organization",
		code: "TEST",
		branding: { colors: {} },
	},
	metadata: {
		employee: {
			id: "emp-admin",
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
	steps: [],
	summary: { isProvisioned: true, initializationStatus: "COMPLETED" },
	organization: { id: "org-1", name: "Test Organization", code: "TEST" },
};

const json = (data: unknown) => ({
	status: 200,
	contentType: "application/json",
	body: JSON.stringify({ success: true, message: "OK", data }),
});

const sectionResponseFor = (requestUrl: URL) => {
	const query = (requestUrl.searchParams.get("query") || "").toLowerCase();
	const filter = requestUrl.searchParams.get("filter");
	const page = Number(requestUrl.searchParams.get("page")) || 1;
	const limit = Number(requestUrl.searchParams.get("limit")) || 10;

	let rows = sections;
	if (query) {
		rows = rows.filter((section) =>
			[section.name, section.code].join(" ").toLowerCase().includes(query),
		);
	}
	if (filter === "isActive:true") rows = rows.filter((section) => section.isActive);
	if (filter === "isActive:false") rows = rows.filter((section) => !section.isActive);

	const start = (page - 1) * limit;
	const paginatedRows = rows.slice(start, start + limit);
	return {
		sections: paginatedRows,
		count: rows.length,
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

const installMockApi = async (page: Page) => {
	await page.addInitScript(() => {
		window.localStorage.setItem(
			"e2eAuthUser",
			JSON.stringify(adminUser),
		);
		window.localStorage.setItem("authToken", "smoke-token");
		window.localStorage.setItem("userRole", "hris-admin");
		window.localStorage.setItem("userSubRole", "hris-admin");
	});

	await page.route("**/api/**", async (route) => {
		const requestUrl = new URL(route.request().url());
		const path = requestUrl.pathname;

		if (path.endsWith("/auth/me")) {
			await route.fulfill(json(adminUser));
			return;
		}

		if (path.endsWith("/system-provisioning/status")) {
			await route.fulfill(json(readyProvisioningStatus));
			return;
		}

		if (path.endsWith("/section") && route.request().method() === "GET") {
			await route.fulfill(json(sectionResponseFor(requestUrl)));
			return;
		}

		if (path.includes("/section/") && route.request().method() === "GET") {
			const sectionId = path.split("/").pop() || "";
			const section = sections.find((candidate) => candidate.id === sectionId) || sections[0];
			await route.fulfill(json({ section }));
			return;
		}

		if (path.endsWith("/employee")) {
			await route.fulfill(
				json({
					employees,
					pagination: { total: employees.length, page: 1, limit: 1000, totalPages: 1 },
				}),
			);
			return;
		}

		if (path.endsWith("/scheduleTemplate")) {
			await route.fulfill(
				json({
					scheduleTemplates: [],
					pagination: { total: 0, page: 1, limit: 1000, totalPages: 1 },
				}),
			);
			return;
		}

		if (path.endsWith("/department")) {
			await route.fulfill(
				json({
					departments: [
						{ id: "dept-asm", name: "Assembly", code: "ASM", isActive: true },
						{ id: "dept-dec", name: "Decoration", code: "DEC", isActive: true },
					],
					pagination: { total: 2, page: 1, limit: 1000, totalPages: 1 },
				}),
			);
			return;
		}

		await route.fulfill(json({}));
	});
};

test("admin sections screen shows line leaders column and edit modal chips", async ({
	page,
}) => {
	await installMockApi(page);

	await page.goto("/admin/configuration/sections");

	const table = page.getByRole("table").filter({ hasText: "Assembly Operations" });
	await expect(table).toBeVisible({ timeout: routeReadyTimeoutMs });

	// Line Leaders column renders names from saved memberships
	const assemblyRow = table.getByRole("row", { name: /Assembly Operations/ });
	await expect(assemblyRow.getByText("Alice Reyes, Ben Cruz")).toBeVisible();

	// Section without leaders shows the muted dash (no leader names)
	const decorationRow = table.getByRole("row", { name: /Decoration Operations/ });
	await expect(decorationRow.getByText("Alice Reyes")).toHaveCount(0);
});

test("admin sections edit modal loads existing line leaders into removable chips", async ({
	page,
}) => {
	await installMockApi(page);

	await page.goto("/admin/configuration/sections");

	const table = page.getByRole("table").filter({ hasText: "Assembly Operations" });
	await expect(table).toBeVisible({ timeout: routeReadyTimeoutMs });

	// Open edit for Assembly Operations
	const assemblyRow = table.getByRole("row", { name: /Assembly Operations/ });
	await assemblyRow.getByRole("button").first().click();
	await page.getByText("Edit", { exact: true }).click();

	const modal = page.getByRole("dialog");
	await expect(modal).toBeVisible();

	// Existing memberships render as removable chips
	await expect(modal.getByText("Alice Reyes", { exact: true })).toBeVisible();
	await expect(modal.getByText("Ben Cruz", { exact: true })).toBeVisible();
	await expect(modal.getByText("Line Leaders (optional)")).toBeVisible();

	// Remove one chip -> it disappears from the chip list
	await modal.getByRole("button", { name: /Remove line leader Alice Reyes/ }).click();
	await expect(modal.getByText("Alice Reyes", { exact: true })).toHaveCount(0);
	await expect(modal.getByText("Ben Cruz", { exact: true })).toBeVisible();
});
