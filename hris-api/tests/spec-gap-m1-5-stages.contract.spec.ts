/**
 * Source-contract pins for spec-gap chain stages 6/7/9/10 (modules 1-5).
 * Behavior is proven live in .runtime/spec-gap-m1-5/stages-6-7-9-10/.
 */
import { expect } from "chai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "mocha";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("stage 6 — leave conversion + annual credit upload", () => {
	const requestController = read("app/request/request.controller.ts");
	const requestZod = read("zod/request.zod.ts");
	const requestRouter = read("app/request/request.router.ts");
	const catalog = read("prisma/seeds/requestWorkflowCatalog.ts");

	it("accepts LEAVE_CONVERSION end-to-end (zod + PAN types + workflow)", () => {
		expect(requestZod).to.contain('"LEAVE_CONVERSION"');
		expect(requestController).to.contain('"LEAVE_CONVERSION"');
		expect(catalog).to.contain('code: "WF-PAN-LEAVE-CONVERSION"');
		expect(catalog).to.contain('requestType: "LEAVE_CONVERSION"');
	});

	it("approval effect shrinks totalEntitled and recomputes available", () => {
		expect(requestController).to.contain('case "LEAVE_CONVERSION"');
		expect(requestController).to.contain("Number(conversionBalance.totalEntitled || 0) - conversionDays");
	});

	it("approval effect accepts leaveType|conversionLeaveType and days|conversionDays metadata", () => {
		expect(requestController).to.contain("metadata.leaveType || metadata.conversionLeaveType");
		expect(requestController).to.contain("metadata.days || metadata.conversionDays");
	});

	it("workflow COMPLETED path applies conversion via pan post-actions", () => {
		const runtimeHelper = read("helper/request-runtime.helper.ts");
		const panPostActions = read("helper/pan-post-actions.helper.ts");
		expect(runtimeHelper).to.contain('"LEAVE_CONVERSION"');
		expect(panPostActions).to.contain('case "LEAVE_CONVERSION"');
		expect(panPostActions).to.contain("metadata.leaveType || metadata.conversionLeaveType");
	});

	it("bulk credit upload is dry-run default with per-row results", () => {
		expect(requestController).to.contain("const bulkUploadLeaveCredits");
		expect(requestController).to.contain("execute = req.body?.execute === true");
		expect(requestController).to.contain("LEAVE_CREDITS_BULK_UPLOAD");
		expect(requestRouter).to.contain('"/leave-credits/bulk-upload"');
	});
});

describe("stage 7 — disciplinary action backend", () => {
	const controller = read("app/disciplinaryAction/disciplinaryAction.controller.ts");
	const zod = read("zod/disciplinaryAction.zod.ts");
	const router = read("app/disciplinaryAction/disciplinaryAction.router.ts");

	it("model fields replace the template name field", () => {
		expect(zod).to.contain("offenseType");
		expect(zod).to.contain("employeeId");
		expect(zod).to.not.contain("name: z.string().min(1),");
	});

	it("org-scopes list/update/delete and soft-deletes", () => {
		expect(controller.match(/organizationId: String\(\(req as any\)\.organizationId/g)!.length)
			.to.be.at.least(3);
		expect(controller).to.contain("isDeleted: true, updatedByUserId");
		expect(router).to.contain('routes.put("/:id", controller.update)');
	});

	it("create snapshots employeeName for stable lists", () => {
		expect(controller).to.contain("employeeName");
	});
});

describe("stage 9 — org chart builder", () => {
	const controller = read("app/employee/employee.controller.ts");
	const router = read("app/employee/employee.router.ts");

	it("exposes a cycle-guarded report-to reassignment endpoint", () => {
		expect(controller).to.contain("const updateReportTo");
		expect(controller).to.contain("this would create a reporting cycle");
		expect(router).to.contain('"/:id/report-to"');
	});

	it("is admin/HR gated", () => {
		expect(controller).to.contain("Only admin/HR can restructure the org chart");
	});
});

describe("stage 10 — TIN library", () => {
	const controller = read("app/metrics/metrics.controller.ts");
	const zod = read("zod/metrics.zod.ts");

	it("reads TIN from metadata.manpowerDatabank.tin (postgres truth)", () => {
		expect(controller).to.contain("manpowerDatabank");
		expect(controller).to.contain('case "tinLibrary"');
		expect(zod).to.contain('"tinLibrary"');
	});

	it("reports missing and duplicate statuses", () => {
		expect(controller).to.contain('"DUPLICATE" : tin ? "OK" : "MISSING"');
		expect(controller).to.contain("duplicateEmployees");
	});
});

describe("stage 10b — 201 filing checklist", () => {
	const filing201 = read("../hris-app/app/lib/filing-201-documents.ts");

	it("pins the baseline 201 requirements over existing document types", () => {
		expect(filing201).to.contain('"tin_id"');
		expect(filing201).to.contain('"philhealth_id"');
		expect(filing201).to.contain('"pagibig_id"');
		expect(filing201).to.contain('buildFiling201Checklist');
	});

	it("exposes the 201 tab on the employee profile", () => {
		const page = read("../hris-app/app/routes/employee/employee.$id.tsx");
		expect(page).to.contain('"filing-201"');
		expect(page).to.contain("Filing201Tab");
	});
});

describe("stage 11 — PhilHealth RF-1 remittance generator (M5.1 first form)", () => {
	const generator = read("helper/philhealth-rf1.generator.ts");
	const reportController = read("app/report/report.controller.ts");
	const reportRouter = read("app/report/report.router.ts");

	it("sources contributions from the payroll register and splits EE/ER evenly", () => {
		expect(generator).to.contain("philHealthContribution");
		expect(generator).to.contain("employeeShare");
		expect(generator).to.contain("employerShare");
	});

	it("reads the PhilHealth PIN from metadata.manpowerDatabank.philhealthNo when present", () => {
		expect(generator).to.contain("philhealthNo");
		expect(generator).to.contain("Not on file");
	});

	it("serves an org-scoped xlsx download endpoint", () => {
		expect(reportRouter).to.contain('"/philhealth/rf1"');
		expect(reportController).to.contain("downloadPhilhealthRf1");
		expect(reportController).to.contain(
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		);
	});
});
