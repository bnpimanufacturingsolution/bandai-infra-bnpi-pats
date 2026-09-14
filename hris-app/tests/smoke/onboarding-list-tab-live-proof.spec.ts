import { expect, test, type Page } from "@playwright/test";

const SIGNER = {
	email: "e2e-onb-signer2@bandai.local",
	password: "password123",
};

async function login(page: Page, email: string, password: string) {
	await page.goto("/auth/login");
	await page.locator("#login-identifier").fill(email);
	await page.locator("#login-password").fill(password);
	await page.getByRole("button", { name: /sign in/i }).click();
	// DEV DB forward regularly spikes past 30s on the post-login session checks.
	await page.waitForURL((url) => !url.pathname.includes("/auth/login"), { timeout: 90_000 });
}

test("onboarding list -> search Char -> sign 6.1 with password -> profile tab shows it", async ({
	page,
	request,
}) => {
	test.slow(); // DEV DB forward can be slow (login ~10s spikes observed); keep this reliable.
	const API = "http://localhost:3001";
	const adminLogin = await request.post(`${API}/api/auth/login`, {
		data: { email: "admin@bandai.local", password: "password123", appCode: "hris" },
	});
	const adminToken = (await adminLogin.json()).data.token;
	const headers = { Authorization: `Bearer ${adminToken}` };

	// Reset item 6.1 to PENDING so the proof is re-runnable.
	const roster = await (
		await request.get(`${API}/api/onboarding/employees?search=char%20aznable`, { headers })
	).json();
	const checklistId = roster.data.employees[0].checklist.id;
	const visible = await (
		await request.get(`${API}/api/onboarding/checklists/${checklistId}/visible`, { headers })
	).json();
	const walk = (items: any[]): any[] => items.flatMap((i) => [i, ...walk(i.children ?? [])]);
	const dataItem61 = walk(visible.data.checklist.sections.flatMap((s: any) => s.items)).find(
		(i: any) => i.number === "6.1",
	);
	if (dataItem61?.status === "COMPLETED") {
		await request.post(`${API}/api/onboarding/items/${dataItem61.id}/unsign`, {
			headers,
			data: {},
		});
	}

	const failedRequests: { url: string; status: number }[] = [];
	page.on("response", (response) => {
		if (response.url().includes("/api/onboarding/") && response.status() >= 400) {
			failedRequests.push({ url: response.url(), status: response.status() });
		}
	});

	await login(page, SIGNER.email, SIGNER.password);

	// 1. list page loads roster
	const rosterPromise = page.waitForResponse(
		(r) => r.url().includes("/api/onboarding/employees") && r.status() === 200,
		{ timeout: 30_000 },
	);
	await page.goto("/hr/onboarding");
	await rosterPromise;
	await expect(page.getByText("Onboarding Employees").first()).toBeVisible();

	// Pagination: max 10 rows on the first page + shared DataTable numbered pager.
	const rosterBody = await (
		await request.get(`${API}/api/onboarding/employees`, { headers })
	).json();
	expect(rosterBody.data.pagination.limit).toBe(10);
	expect(rosterBody.data.pagination.total).toBeGreaterThan(0);
	await expect(page.locator("table tbody tr")).toHaveCount(
		Math.min(10, rosterBody.data.employees.length),
	);
	await expect(page.getByText(`Showing 1 to ${Math.min(10, rosterBody.data.employees.length)} of ${rosterBody.data.pagination.total} results`)).toBeVisible();
	await expect(page.getByRole("button", { name: /previous/i })).toBeDisabled();
	await expect(
		page.locator("[data-datatable-pagination] button", { hasText: /^\d+$/ }).first(),
	).toBeVisible();

	// 2. server-side search narrows to Char Aznable
	const searchedPromise = page.waitForResponse(
		(r) =>
			r.url().includes("/api/onboarding/employees?search=char") && r.status() === 200,
		{ timeout: 30_000 },
	);
	await page.getByPlaceholder("Search name or employee #…").fill("char aznable");
	const searched = await searchedPromise;
	const searchedBody = await searched.json();
	expect(searchedBody.data.employees.map((e: any) => e.name)).toContain("Char Aznable");
	// 3. select his row -> checklist panel (dept-filtered view)
	const visiblePromise = page.waitForResponse(
		(r) => r.url().includes("/visible") && r.status() === 200,
		{ timeout: 30_000 },
	);
	await page.getByText("Char Aznable").first().click();
	const visibleBody = await (await visiblePromise).json();
	expect(visibleBody.data.checklist.view).toBe("department");
	expect(visibleBody.data.checklist.employee.employeeNumber).toBe("EMP3338");

	await expect(page.getByText("Before Day 1")).toBeVisible();
	await expect(page.getByText("Email and Office365 account creation, if applicable")).toBeVisible();

	// 4. no-dept parent is a section row (no checkbox at all); the SW-Dev child is signable
	await expect(page.getByRole("button", { name: /sign item 6 email/i })).toHaveCount(0);
	const child = page.getByRole("button", { name: /sign item 6\.1 office 365/i });
	await expect(child).toBeEnabled();

	// 5. sign modal: instruction + wrong password inline error (dialog stays open)
	await child.click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	await expect(
		dialog.getByText(/Enter your account password to confirm/i),
	).toBeVisible();
	await dialog.locator("#sign-password").fill("definitely-wrong");
	await dialog.getByRole("button", { name: "Sign" }).click();
	await expect(dialog.getByRole("alert")).toContainText("Invalid password");

	// 6. correct password signs; row flips to completed with signee + remarks
	await dialog.locator("#sign-password").fill(SIGNER.password);
	await dialog.locator("#sign-remarks").fill("Office 365 mailbox created");
	const resignVisiblePromise = page.waitForResponse(
		(r) => r.url().includes("/visible") && r.status() === 200,
		{ timeout: 30_000 },
	);
	await dialog.getByRole("button", { name: "Sign" }).click();
	await resignVisiblePromise;
	await expect(dialog).toBeHidden();

	const item61 = page.getByText("Office 365, if applicable").locator("xpath=ancestor::tr[1]");
	await expect(item61.getByText("Office 365 mailbox created")).toBeVisible();
	const signedCheckbox = page.getByRole("button", { name: /sign item 6\.1 office 365/i });
	await expect(signedCheckbox).toHaveAttribute("title", /^Signed by /);

	await page.screenshot({
		path: ".runtime/browser-evidence/onboarding-list-sign-char.png",
		fullPage: true,
	});

	// 7. Open Profile -> ?tab=onboarding shows the same panel state.
	// DataTable rows carry role="button" too (name = row text, hence exact:true) and a
	// mobile-card duplicate exists; click the visible real button.
	await page
		.getByRole("button", { name: "Open Profile", exact: true })
		.locator("visible=true")
		.first()
		.click();
	await page.waitForURL(/\/employee\/[a-z0-9]+\?tab=onboarding/i, { timeout: 30_000 });
	await expect(page.getByText("Email and Office365 account creation, if applicable")).toBeVisible();
	await expect(
		page.getByRole("button", { name: /sign item 6\.1 office 365/i }),
	).toHaveAttribute("title", /^Signed by /);
	await page.screenshot({
		path: ".runtime/browser-evidence/onboarding-profile-tab-char.png",
		fullPage: true,
	});

	expect(
		failedRequests.filter((r) => !r.url.includes("/sign")),
		`unexpected onboarding API failures: ${JSON.stringify(failedRequests)}`,
	).toEqual([]);
});
