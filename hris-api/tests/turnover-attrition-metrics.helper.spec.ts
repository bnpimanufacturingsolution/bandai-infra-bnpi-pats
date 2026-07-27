import { expect } from "chai";
import {
	buildTurnoverAttritionBuckets,
	calculateTurnoverAttritionReport,
} from "../helper/turnover-attrition-metrics.helper";

describe("turnover attrition metrics helper", () => {
	it("calculates turnover and attrition from finalized separations with opening and closing headcount", async () => {
		const findManyCalls: any[] = [];
		const prisma = {
			employee: {
				findMany: async (args: any) => {
					findManyCalls.push(args);
					return [
						{
							id: "emp-active",
							employeeId: "EMP-001",
							employmentStatus: "ACTIVE",
							employmentStartDate: new Date("2025-01-10T00:00:00.000Z"),
							employmentHireDate: null,
							employmentTerminationDate: null,
							person: {
								personalInfo: {
									firstName: "Ada",
									lastName: "Rivera",
								},
							},
						},
						{
							id: "emp-resigned",
							employeeId: "EMP-002",
							employmentStatus: "RESIGNED",
							employmentStartDate: new Date("2024-03-01T00:00:00.000Z"),
							employmentHireDate: null,
							employmentTerminationDate: new Date("2026-06-05T00:00:00.000Z"),
							person: {
								personalInfo: {
									firstName: "Bea",
									lastName: "Santos",
								},
							},
						},
						{
							id: "emp-terminated",
							employeeId: "EMP-003",
							employmentStatus: "TERMINATED",
							employmentStartDate: null,
							employmentHireDate: new Date("2024-04-15T00:00:00.000Z"),
							employmentTerminationDate: new Date("2026-06-20T00:00:00.000Z"),
							person: {
								personalInfo: {
									firstName: "Cory",
									lastName: "Lopez",
								},
							},
						},
						{
							id: "emp-future",
							employeeId: "EMP-004",
							employmentStatus: "ACTIVE",
							employmentStartDate: new Date("2026-07-01T00:00:00.000Z"),
							employmentHireDate: null,
							employmentTerminationDate: null,
							person: {
								personalInfo: {
									firstName: "Dani",
									lastName: "Yu",
								},
							},
						},
					];
				},
			},
		} as any;

		const result = await calculateTurnoverAttritionReport(prisma, {
			organizationId: "org-1",
			dateFrom: new Date("2026-06-01T00:00:00.000Z"),
			dateTo: new Date("2026-06-30T23:59:59.999Z"),
			groupBy: "month",
		});

		expect(findManyCalls).to.have.length(1);
		expect(findManyCalls[0].where).to.deep.equal({
			organizationId: "org-1",
			isDeleted: false,
		});

		expect(result.summary.openingHeadcount).to.equal(3);
		expect(result.summary.closingHeadcount).to.equal(1);
		expect(result.summary.averageHeadcount).to.equal(2);
		expect(result.summary.totalSeparations).to.equal(2);
		expect(result.summary.voluntarySeparations).to.equal(1);
		expect(result.summary.involuntarySeparations).to.equal(1);
		expect(result.summary.turnoverRate).to.equal(1);
		expect(result.summary.attritionRate).to.equal(0.5);
		expect(result.buckets).to.have.length(1);
		expect(result.buckets[0]).to.deep.include({
			openingHeadcount: 3,
			closingHeadcount: 1,
			averageHeadcount: 2,
			totalSeparations: 2,
			voluntarySeparations: 1,
			involuntarySeparations: 1,
			turnoverRate: 1,
			attritionRate: 0.5,
		});
	});

	it("treats termination dates as inclusive and excludes non-finalized statuses from separations", async () => {
		const prisma = {
			employee: {
				findMany: async () => [
					{
						id: "emp-resigned",
						employeeId: "EMP-010",
						employmentStatus: "RESIGNED",
						employmentStartDate: new Date("2024-01-01T00:00:00.000Z"),
						employmentHireDate: null,
						employmentTerminationDate: new Date("2026-06-05T00:00:00.000Z"),
						person: { personalInfo: { firstName: "Ira", lastName: "Paz" } },
					},
					{
						id: "emp-terminated",
						employeeId: "EMP-011",
						employmentStatus: "TERMINATED",
						employmentStartDate: new Date("2024-01-01T00:00:00.000Z"),
						employmentHireDate: null,
						employmentTerminationDate: new Date("2026-06-20T00:00:00.000Z"),
						person: { personalInfo: { firstName: "Jules", lastName: "Tan" } },
					},
					{
						id: "emp-former",
						employeeId: "EMP-012",
						employmentStatus: "FORMER_EMPLOYEE",
						employmentStartDate: new Date("2024-01-01T00:00:00.000Z"),
						employmentHireDate: null,
						employmentTerminationDate: new Date("2026-06-10T00:00:00.000Z"),
						person: { personalInfo: { firstName: "Kai", lastName: "Uy" } },
					},
					{
						id: "emp-requested",
						employeeId: "EMP-013",
						employmentStatus: "RESIGNATION_REQUESTED",
						employmentStartDate: new Date("2024-01-01T00:00:00.000Z"),
						employmentHireDate: null,
						employmentTerminationDate: new Date("2026-06-12T00:00:00.000Z"),
						person: { personalInfo: { firstName: "Lia", lastName: "Go" } },
					},
				],
			},
		} as any;

		const result = await calculateTurnoverAttritionReport(prisma, {
			organizationId: "org-1",
			dateFrom: new Date("2026-06-05T00:00:00.000Z"),
			dateTo: new Date("2026-06-20T23:59:59.999Z"),
			groupBy: "month",
		});

		expect(result.summary.totalSeparations).to.equal(2);
		expect(result.summary.voluntarySeparations).to.equal(1);
		expect(result.summary.involuntarySeparations).to.equal(1);
	});

	it("applies organization hierarchy filters when calculating turnover and attrition", async () => {
		const findManyCalls: any[] = [];
		const prisma = {
			employee: {
				findMany: async (args: any) => {
					findManyCalls.push(args);
					return [];
				},
			},
		} as any;

		await calculateTurnoverAttritionReport(prisma, {
			organizationId: "org-1",
			dateFrom: new Date("2026-06-01T00:00:00.000Z"),
			dateTo: new Date("2026-06-30T23:59:59.999Z"),
			groupBy: "month",
			departmentId: "dept-1",
			sectionId: "section-1",
			positionId: "position-1",
			levelId: "level-1",
		});

		expect(findManyCalls).to.have.length(1);
		expect(findManyCalls[0].where).to.deep.equal({
			organizationId: "org-1",
			isDeleted: false,
			departmentId: "dept-1",
			position: {
				sectionId: "section-1",
			},
			positionId: "position-1",
			levelId: "level-1",
		});
	});

	it("builds day, week, month, and year buckets for supported report groupings", () => {
		const dayBuckets = buildTurnoverAttritionBuckets(
			new Date("2026-06-02T00:00:00.000Z"),
			new Date("2026-06-08T23:59:59.999Z"),
			"day",
		);
		expect(dayBuckets).to.have.length(7);
		expect(dayBuckets[0].start.toISOString().slice(0, 10)).to.equal("2026-06-02");
		expect(dayBuckets[6].end.toISOString().slice(0, 10)).to.equal("2026-06-08");

		const weekBuckets = buildTurnoverAttritionBuckets(
			new Date("2026-06-01T00:00:00.000Z"),
			new Date("2026-06-30T23:59:59.999Z"),
			"week",
		);
		expect(weekBuckets).to.have.length(5);
		expect(weekBuckets[0].start.toISOString().slice(0, 10)).to.equal("2026-06-01");
		expect(weekBuckets[0].end.toISOString().slice(0, 10)).to.equal("2026-06-07");
		expect(weekBuckets[4].start.toISOString().slice(0, 10)).to.equal("2026-06-29");
		expect(weekBuckets[4].end.toISOString().slice(0, 10)).to.equal("2026-06-30");

		const monthBuckets = buildTurnoverAttritionBuckets(
			new Date("2026-01-01T00:00:00.000Z"),
			new Date("2026-12-31T23:59:59.999Z"),
			"month",
		);
		expect(monthBuckets).to.have.length(12);
		expect(monthBuckets[0].start.toISOString().slice(0, 10)).to.equal("2026-01-01");
		expect(monthBuckets[11].end.toISOString().slice(0, 10)).to.equal("2026-12-31");

		const yearBuckets = buildTurnoverAttritionBuckets(
			new Date("2025-01-01T00:00:00.000Z"),
			new Date("2026-12-31T23:59:59.999Z"),
			"year",
		);
		expect(yearBuckets).to.have.length(2);
		expect(yearBuckets[0].start.toISOString().slice(0, 10)).to.equal("2025-01-01");
		expect(yearBuckets[1].end.toISOString().slice(0, 10)).to.equal("2026-12-31");
	});
});
