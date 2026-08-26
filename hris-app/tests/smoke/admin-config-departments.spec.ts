import { expect, test, type Page } from "@playwright/test";

type Department = {
	id: string;
	name: string;
	code: string;
	description: string;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
};

const timestamp = "2026-05-28T00:00:00.000Z";
const routeReadyTimeoutMs = 30_000;

const departments: Department[] = [
	{
		id: "dept-eng",
		name: "Engineering",
		code: "ENG",
		description: "Product and platform delivery",
		isActive: true,
		createdAt: timestamp,
		updatedAt: timestamp,
	},
	{
		id: "dept-hr",
		name: "Human Resources",
		code: "HR",
		description: "People operations",
		isActive: true,
		createdAt: timestamp,
		updatedAt: timestamp,
	},
	{
		id: "dept-ops",
		name: "Operations",
		code: "OPS",
		description: "Store and logistics support",
		isActive: false,
		createdAt: timestamp,
		updatedAt: timestamp,
	},
	{
		id: "dept-fin",
		name: "Finance",
		code: "FIN",
		description: "Payroll and accounting",
		isActive: true,
		createdAt: timestamp,
		updatedAt: timestamp,
	},
	{
		id: "dept-arc",
		name: "Archive Office",
		code: "ARC",
		description: "Legacy records",
		isActive: false,
		createdAt: timestamp,
		updatedAt: timestamp,
	},
];

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
	provisionedAt: timestamp,
	provisionedBy: "user-admin",
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

const json = (data: unknown) => ({
	status: 200,
	contentType: "application/json",
	body: JSON.stringify({ success: true, message: "OK", data }),
});

const departmentResponseFor = (url: URL) => {
	const query = (url.searchParams.get("query") || "").trim().toLowerCase();
	const filter = url.searchParams.get("filter") || "";
	const page = Number(url.searchParams.get("page") || "1");
	const limit = Number(url.searchParams.get("limit") || "10");

	let rows = departments;
	if (query) {
		rows = rows.filter((department) =>
			[
				department.name,
				department.code,
				department.description,
				department.isActive ? "active" : "inactive",
			]
				.join(" ")
				.toLowerCase()
				.includes(query),
		);
	}

	if (filter === "isActive:false") {
		rows = rows.filter((department) => !department.isActive);
	} else if (filter === "isActive:true") {
		rows = rows.filter((department) => department.isActive);
	}

	const start = (page - 1) * limit;
	const paginatedRows = rows.slice(start, start + limit);

	return {
		departments: paginatedRows,
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
	const departmentRequestUrls: URL[] = [];

	await page.addInitScript(() => {
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

		if (path.endsWith("/department")) {
			departmentRequestUrls.push(requestUrl);
			await route.fulfill(json(departmentResponseFor(requestUrl)));
			return;
		}

		if (path.endsWith("/employee")) {
			await route.fulfill(
				json({
					employees: [],
					pagination: { total: 0, page: 1, limit: 1000, totalPages: 1 },
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

		await route.fulfill(json({}));
	});

	return departmentRequestUrls;
};

test("admin departments configuration searches and filters through server query params", async ({
	page,
}) => {
	const departmentRequestUrls = await installMockApi(page);

	await page.goto("/admin/configuration/departments");

	await expect(page.getByPlaceholder("Search departments...")).toBeVisible({
		timeout: routeReadyTimeoutMs,
	});
	const table = page.getByRole("table");
	const departmentNameCell = (name: string) => table.getByRole("cell", { name, exact: true });
	await expect(departmentNameCell("Engineering")).toBeVisible();
	await expect(departmentNameCell("Human Resources")).toBeVisible();
	await expect(page.getByText("Showing 1 to 5 of 5 results")).toBeVisible();

	await page.getByPlaceholder("Search departments...").fill("eng");

	await expect(page).toHaveURL(/search=eng/);
	await expect(departmentNameCell("Engineering")).toBeVisible();
	await expect(departmentNameCell("Human Resources")).toBeHidden();
	await expect(page.getByText("Showing 1 to 1 of 1 results")).toBeVisible();
	expect(departmentRequestUrls.some((url) => url.searchParams.get("query") === "eng")).toBe(
		true,
	);

	await page.getByPlaceholder("Search departments...").fill("");
	await expect(page).not.toHaveURL(/search=/);
	await expect(departmentNameCell("Human Resources")).toBeVisible();

	await page.getByRole("button", { name: /filters/i }).click();
	await page.getByRole("combobox").click();
	await page.getByRole("option", { name: "Inactive" }).click();

	await expect(page).toHaveURL(/status=false/);
	await expect(departmentNameCell("Operations")).toBeVisible();
	await expect(departmentNameCell("Archive Office")).toBeVisible();
	await expect(departmentNameCell("Engineering")).toBeHidden();
	await expect(page.getByText("Showing 1 to 2 of 2 results")).toBeVisible();
	expect(
		departmentRequestUrls.some(
			(url) => url.searchParams.get("filter") === "isActive:false",
		),
	).toBe(true);
});
