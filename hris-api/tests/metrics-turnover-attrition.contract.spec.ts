import { expect } from "chai";
import express from "express";
import request from "supertest";
import metricsModule from "../app/metrics";

describe("metrics turnover attrition contract", () => {
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

	it("accepts turnoverAttritionReport as an employee metric", async () => {
		const app = buildApp({
			employee: {
				findMany: async () => [],
				findFirst: async () => ({ organizationId: "org-1" }),
			},
		});

		const response = await request(app)
			.post("/api/metrics")
			.send({
				model: "Employee",
				data: ["turnoverAttritionReport"],
				filter: {
					dateFrom: "2026-06-01",
					dateTo: "2026-06-30",
					groupBy: "month",
				},
			})
			.expect(200);

		expect(response.body.status).to.equal("success");
		expect(response.body.data.metrics).to.have.property("turnoverAttritionReport");
		expect(response.body.data.metrics.turnoverAttritionReport.summary).to.include({
			openingHeadcount: 0,
			closingHeadcount: 0,
			averageHeadcount: 0,
			totalSeparations: 0,
			voluntarySeparations: 0,
			involuntarySeparations: 0,
			turnoverRate: 0,
			attritionRate: 0,
		});
	});
});
