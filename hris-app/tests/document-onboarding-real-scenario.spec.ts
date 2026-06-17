import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const HR_EMAIL = process.env.PLAYWRIGHT_HR_EMAIL || "hr-manager@seed.local";
const HR_PASSWORD = process.env.PLAYWRIGHT_HR_PASSWORD || "Password123!";
const API_BASE = process.env.PLAYWRIGHT_API_BASE || "http://localhost:3001/api";
const CURRENT_YEAR = new Date().getFullYear();

async function login(page: Page, email: string, password: string) {
	await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
	await page.getByPlaceholder("e.g. employee@bandai.com").fill(email);
	await page.getByPlaceholder("Enter your password").fill(password);
	await page.getByRole("button", { name: "Sign In" }).click();
	await page.waitForLoadState("networkidle");
}

async function completeFirstLoginPasswordChangeIfShown(page: Page, newPassword: string) {
	const changePasswordDialog = page.getByRole("heading", {
		name: /Change Your Password/i,
	});
	const isPasswordChangeRequired = await changePasswordDialog
		.isVisible({ timeout: 5_000 })
		.catch(() => false);
	if (!isPasswordChangeRequired) return;

	await page.getByPlaceholder("Enter new password").fill(newPassword);
	await page.getByPlaceholder("Confirm new password").fill(newPassword);
	await page.getByRole("button", { name: /^Change Password$/i }).click();
	await expect(changePasswordDialog).toBeHidden({ timeout: 30_000 });
	await page.waitForLoadState("networkidle");
}

async function resolveWorkingPassword(
	request: APIRequestContext,
	email: string,
	candidates: string[],
) {
	const uniqueCandidates = [...new Set(candidates.filter(Boolean))];
	const failures: string[] = [];
	for (const password of uniqueCandidates) {
		const response = await request.post(`${API_BASE}/auth/login`, {
			data: { email, password },
		});
		if (response.ok()) return password;
		failures.push(`${password}: ${response.status()} ${await response.text()}`);
	}
	throw new Error(`Unable to login as created employee. Tried: ${failures.join(" | ")}`);
}

async function getFormValue(page: Page, name: string) {
	return page.locator(`[name="${name}"]`).inputValue();
}

function buildDefaultEmployeePassword(lastName: string, employeeId: string) {
	return `${lastName.trim().toLowerCase().replace(/\s+/g, "")}${employeeId.trim()}!${CURRENT_YEAR}`;
}

test("HR-created employee sees skipped mandated document on onboarding", async ({ page, request }) => {
	test.setTimeout(180_000);
	await login(page, HR_EMAIL, HR_PASSWORD);
	await expect(page).toHaveURL(/\/hr\/|\/dashboard|\/employee\//, { timeout: 30_000 });

	await page.goto("/hr/employees/new?debug=true", { waitUntil: "domcontentloaded" });
	await page.getByRole("button", { name: /Prefill Debug/i }).click();

	await expect
		.poll(async () => getFormValue(page, "person.contactInfo.email"), { timeout: 30_000 })
		.toMatch(/\S+/);

	const email = await getFormValue(page, "person.contactInfo.email");
	const lastName = await getFormValue(page, "person.personalInfo.lastName");

	await page.getByRole("button", { name: "Next" }).click();
	await expect
		.poll(async () => getFormValue(page, "employee.employeeId"), { timeout: 30_000 })
		.toMatch(/\S+/);
	const employeeId = await getFormValue(page, "employee.employeeId");
	const employeePassword = buildDefaultEmployeePassword(lastName, employeeId);

	await page.getByRole("button", { name: "Next" }).click();
	await expect(page.getByText("Compliance Documents")).toBeVisible({ timeout: 30_000 });
	await expect(page.getByRole("button", { name: /Social Security System/i })).toBeVisible();
	await page.getByRole("button", { name: /Social Security System/i }).click();
	await expect(page.getByText("Social Security System").locator("..").locator("..")).toContainText(
		/Not included|Skipped/,
	);

	await page.getByRole("button", { name: "Next" }).click();
	await expect(page.getByRole("heading", { name: "Benefit Types" })).toBeVisible({
		timeout: 30_000,
	});
	await page.getByRole("button", { name: "Next" }).click();
	await expect(page.getByRole("heading", { name: "System Access" })).toBeVisible({
		timeout: 30_000,
	});
	await page.getByRole("button", { name: "Create Employee" }).click();
	await expect(page.getByText(/Employee created successfully/i)).toBeVisible({ timeout: 60_000 });
	await page.waitForURL(/\/hr\/employees|\/admin\/configuration\/employees/, { timeout: 60_000 });

	const hrLogin = await request.post(`${API_BASE}/auth/login`, {
		data: { email: HR_EMAIL, password: HR_PASSWORD },
	});
	expect(hrLogin.ok()).toBeTruthy();
	const hrToken = (await hrLogin.json()).data.token;

	const employeeLookup = await request.get(
		`${API_BASE}/employee?document=true&pagination=true&limit=5&query=${encodeURIComponent(email)}`,
		{ headers: { Authorization: `Bearer ${hrToken}` } },
	);
	expect(employeeLookup.ok(), await employeeLookup.text()).toBeTruthy();
	const employeePayload = await employeeLookup.json();
	const createdEmployee = employeePayload.data?.employees?.[0] || employeePayload.data?.data?.[0];
	expect(createdEmployee?.employeeId).toBe(employeeId);

	const boardingLookup = await request.get(
		`${API_BASE}/boardingProcess?document=true&pagination=true&limit=5&filter=${encodeURIComponent(JSON.stringify({ employeeId: createdEmployee.id, type: "ONBOARDING" }))}&fields=id,employeeId,type,status,checklistItems`,
		{ headers: { Authorization: `Bearer ${hrToken}` } },
	);
	expect(boardingLookup.ok(), await boardingLookup.text()).toBeTruthy();
	const boardingPayload = await boardingLookup.json();
	const boardingProcess =
		boardingPayload.data?.boardingProcesss?.[0] ||
		boardingPayload.data?.data?.boardingProcesss?.[0] ||
		boardingPayload.data?.data?.[0];
	expect(JSON.stringify(boardingProcess)).toContain("Social Security System");
	const workingEmployeePassword = await resolveWorkingPassword(request, email, [
		employeePassword,
		employeeId,
		"Password123!",
	]);

	await page.context().clearCookies();
	await page.evaluate(() => {
		localStorage.clear();
		sessionStorage.clear();
	});

	await login(page, email, workingEmployeePassword);
	await expect(page).not.toHaveURL(/\/auth\/login/, { timeout: 30_000 });
	await completeFirstLoginPasswordChangeIfShown(
		page,
		`${employeeId}Onboarding!${CURRENT_YEAR}`,
	);
	await page.goto("/onboarding", { waitUntil: "domcontentloaded" });
	await expect(page.getByRole("button", { name: /Start Onboarding/i })).toBeVisible({
		timeout: 30_000,
	});
	await page.getByRole("button", { name: /Start Onboarding/i }).click();
	await expect(page.getByRole("heading", { name: /Complete Your Profile/i })).toBeVisible();
	await page.getByRole("button", { name: /Skip for Now/i }).click();
	await expect(page.getByText(/Company|Introduction|Bandai Namco/i).first()).toBeVisible();
	await page.getByRole("button", { name: /^Continue/i }).click();
	await expect(page.getByRole("button", { name: /^Continue/i })).toBeVisible();
	await page.getByRole("button", { name: /^Continue/i }).click();
	await expect(page.getByText(/First Week Checklist/i)).toBeVisible({ timeout: 30_000 });
	await expect(page.getByText(/Social Security System/i)).toBeVisible({ timeout: 60_000 });
	await expect(page.getByText(/Required document missing/i)).toBeVisible();
	await expect(page.getByRole("button", { name: /Submit to HR/i }).first()).toBeVisible();
});
