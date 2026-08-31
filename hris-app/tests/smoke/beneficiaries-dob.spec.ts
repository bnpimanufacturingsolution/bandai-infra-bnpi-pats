import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), "..", ".runtime", "beneficiaries-dob-20260831");

const login = async (page: Page) => {
	await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
	const identifier = page.locator("#login-identifier");
	await identifier.waitFor({ state: "visible", timeout: 90_000 });
	await identifier.fill("admin@bandai.local");
	await page.locator("#login-password").fill("password123");
	await page.getByRole("button", { name: /sign in/i }).click();
	await page.waitForURL((url) => !url.pathname.includes("/auth/login"), { timeout: 45_000 });
};

test("beneficiary DOB calendar picker defaults to employee birth month and year", async ({ page }) => {
	test.setTimeout(180_000);
	mkdirSync(OUT, { recursive: true });
	await login(page);

	// Navigate to add employee page
	await page.goto("/hr/employees/new", { waitUntil: "domcontentloaded" });

	// Find the employee's date of birth input and fill it
	const empDobInput = page.locator('input[aria-label="Date"]').first();
	await expect(empDobInput).toBeVisible({ timeout: 60_000 });
	await empDobInput.click();
	await empDobInput.pressSequentially("05151990", { delay: 100 });
	await empDobInput.blur();

	// Verify employee DOB was filled correctly
	await expect(empDobInput).toHaveValue("05/15/1990");

	// Click Add Beneficiary button
	const addBeneficiaryBtn = page.getByRole("button", { name: /Add Beneficiary/i });
	await expect(addBeneficiaryBtn).toBeVisible();
	await addBeneficiaryBtn.click();

	// Locate the newly added beneficiary's date of birth date picker trigger inside the Beneficiaries container
	const beneficiarySection = page.locator('div:has(> h3:has-text("Beneficiaries"))');
	const beneficiaryCalendarBtn = beneficiarySection.locator('button:has(svg.lucide-calendar)').first();
	await expect(beneficiaryCalendarBtn).toBeVisible();
	await beneficiaryCalendarBtn.click();

	// Wait for the calendar popover to appear
	const popover = page.locator('[data-radix-popper-content-wrapper]');
	await expect(popover).toBeVisible({ timeout: 10_000 });

	// Take a screenshot of the opened calendar popover
	await page.screenshot({ path: join(OUT, "01-beneficiary-calendar-opened.png"), fullPage: true });

	// Verify the selected month and year dropdowns inside the custom calendar.
	const dropdownButtons = popover.locator('button:has(span)');
	const monthButton = dropdownButtons.first();
	const yearButton = dropdownButtons.nth(1);

	await expect(monthButton).toBeVisible();
	await expect(yearButton).toBeVisible();

	const selectedMonth = await monthButton.locator('span').innerText();
	const selectedYear = await yearButton.locator('span').innerText();

	console.log(`Default Month: ${selectedMonth}, Default Year: ${selectedYear}`);
	expect(selectedMonth).toBe("May");
	expect(selectedYear).toBe("1990");
});
