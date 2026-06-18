const API_BASE_URL = (process.env.HRIS_API_BASE_URL || "http://localhost:3001").replace(/\/$/, "");
const EMAIL = process.env.HRIS_SMOKE_EMAIL || "hr-manager@seed.local";
const PASSWORD = process.env.HRIS_SMOKE_PASSWORD || "Password123!";

type SmokeResult = {
	name: string;
	ok: boolean;
	status?: number;
	message?: string;
};

async function requestJson<T>(
	path: string,
	options: RequestInit = {},
	token?: string,
): Promise<{ status: number; body: T }> {
	const response = await fetch(`${API_BASE_URL}${path}`, {
		...options,
		headers: {
			"Content-Type": "application/json",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...(options.headers || {}),
		},
	});
	const text = await response.text();
	const body = text ? JSON.parse(text) : {};
	return { status: response.status, body };
}

async function smoke(name: string, fn: () => Promise<void>): Promise<SmokeResult> {
	try {
		await fn();
		return { name, ok: true };
	} catch (error) {
		return {
			name,
			ok: false,
			message: error instanceof Error ? error.message : String(error),
		};
	}
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

async function main() {
	const login = await requestJson<any>("/api/auth/login", {
		method: "POST",
		body: JSON.stringify({ email: EMAIL, password: PASSWORD, appCode: "hris" }),
	});
	assert(login.status === 200, `login failed with HTTP ${login.status}`);
	const token = login.body?.data?.token;
	assert(typeof token === "string" && token.length > 0, "login response did not include token");

	const results: SmokeResult[] = [];

	results.push(
		await smoke("payrollRunSummary metric", async () => {
			const periods = await requestJson<any>(
				"/api/payrollPeriod?fields=id,code,startDate,endDate,status,payFrequency&document=true&page=1&limit=1&sort=startDate&order=desc",
				{},
				token,
			);
			assert(periods.status === 200, `payrollPeriod list returned HTTP ${periods.status}`);
			const payrollPeriodId = periods.body?.data?.payrollPeriods?.[0]?.id;
			assert(payrollPeriodId, "no payroll period available for metric smoke");

			const metrics = await requestJson<any>(
				"/api/metrics",
				{
					method: "POST",
					body: JSON.stringify({
						model: "PayrollPeriod",
						data: ["payrollRunSummary"],
						filter: { payrollPeriodId },
					}),
				},
				token,
			);
			assert(metrics.status === 200, `metrics returned HTTP ${metrics.status}`);
			const summary = metrics.body?.data?.metrics?.payrollRunSummary;
			assert(summary && !summary.error, `payrollRunSummary failed: ${JSON.stringify(summary)}`);
		}),
	);

	results.push(
		await smoke("applicant grouped read with JSON field selection", async () => {
			const fields = [
				"id",
				"applicantId",
				"jobId",
				"job.id",
				"job.position.id",
				"job.position.title",
				"job.position.department.name",
				"job.level.name",
				"person",
				"position",
				"convertedToEmployee.id",
				"convertedToEmployee.employeeId",
				"convertedToEmployee.embeddedSchedule.templateId",
				"convertedToEmployee.embeddedSchedule.templateCode",
				"convertedToEmployee.embeddedSchedule.templateName",
				"convertedToEmployee.person.personalInfo",
				"convertedToEmployee.person.contactInfo",
				"applicationSource",
				"expectedSalary",
				"currency",
			].join(",");
			const applicant = await requestJson<any>(
				`/api/applicant?fields=${encodeURIComponent(fields)}&document=true&page=1&limit=1000&filter=isDeleted%3Afalse&groupBy=job&pagination=true&count=false`,
				{},
				token,
			);
			assert(applicant.status === 200, `applicant grouped read returned HTTP ${applicant.status}`);
			assert(applicant.body?.status === "success", "applicant grouped read did not return success");
		}),
	);

	results.push(
		await smoke("employee search across JSON person fields", async () => {
			const employees = await requestJson<any>(
				"/api/employee?fields=id,employeeId,person.personalInfo,person.contactInfo&document=true&page=1&limit=5&query=Test",
				{},
				token,
			);
			assert(employees.status === 200, `employee search returned HTTP ${employees.status}`);
			assert(employees.body?.status === "success", "employee search did not return success");
		}),
	);

	results.push(
		await smoke("employeeSchedule read with JSON schedule filter", async () => {
			const schedules = await requestJson<any>(
				"/api/employee-schedules?document=true&page=1&limit=20",
				{},
				token,
			);
			assert(schedules.status === 200, `employeeSchedule returned HTTP ${schedules.status}`);
			assert(schedules.body?.status === "success", "employeeSchedule did not return success");
		}),
	);

	for (const result of results) {
		console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}${result.message ? ` - ${result.message}` : ""}`);
	}

	if (results.some((result) => !result.ok)) {
		process.exitCode = 1;
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
