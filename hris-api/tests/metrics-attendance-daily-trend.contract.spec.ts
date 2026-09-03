import { expect } from "chai";
import express from "express";
import request from "supertest";
import metricsModule from "../app/metrics";

describe("metrics attendance daily trend contract", () => {
	function buildApp(prisma: any) {
		const app = express();
		app.use(express.json());
		app.use((req, _res, next) => {
			(req as any).organizationId = "org-1";
			(req as any).user = { id: "user-1", organizationId: "org-1" };
			next();
		});
		app.use("/api", metricsModule(prisma));
		return app;
	}

	it("accepts attendanceDailyTrendByDepartment as an attendance metric", async () => {
		const app = buildApp({
			employee: {
				findFirst: async () => ({ organizationId: "org-1" }),
			},
			$queryRaw: async () => [
				{
					dailyDepartmentBreakdown: [],
					departmentTotals: [],
					dayTotals: [],
					totalRecords: [{ total: 0 }],
				},
			],
		});

		const response = await request(app)
			.post("/api/metrics")
			.send({
				model: "Attendance",
				data: ["attendanceDailyTrendByDepartment"],
				filter: {
					dateFrom: "2026-06-01",
					dateTo: "2026-06-02",
				},
			})
			.expect(200);

		expect(response.body.status).to.equal("success");
		expect(response.body.data.metrics).to.have.property("attendanceDailyTrendByDepartment");
		expect(response.body.data.metrics.attendanceDailyTrendByDepartment).to.include({
			totalDays: 2,
			totalRecords: 0,
		});
		expect(response.body.data.metrics.attendanceDailyTrendByDepartment.departments).to.deep.equal(
			[],
		);
		expect(response.body.data.metrics.attendanceDailyTrendByDepartment.series).to.have.length(2);
	});
});
