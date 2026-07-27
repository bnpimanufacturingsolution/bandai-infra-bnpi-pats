import { expect } from "chai";
import { calculateAttendanceDailyTrendByDepartment } from "../helper/attendance-obligation-metrics.helper";

describe("attendance daily trend by department helper", () => {
	it("returns a zero-filled daily series grouped by department totals", async () => {
		const prisma = {
			$queryRaw: async () => [
				{
					dailyDepartmentBreakdown: [
						{
							businessDate: "2026-06-01",
							departmentId: "dept-ops",
							departmentName: "Operations",
							total: 4,
						},
						{
							businessDate: "2026-06-01",
							departmentId: "dept-people",
							departmentName: "People",
							total: 1,
						},
						{
							businessDate: "2026-06-03",
							departmentId: "dept-ops",
							departmentName: "Operations",
							total: 2,
						},
						{
							businessDate: "2026-06-03",
							departmentId: null,
							departmentName: "Unassigned",
							total: 1,
						},
					],
					departmentTotals: [
						{
							departmentId: "dept-ops",
							departmentName: "Operations",
							total: 6,
						},
						{
							departmentId: "dept-people",
							departmentName: "People",
							total: 1,
						},
						{
							departmentId: null,
							departmentName: "Unassigned",
							total: 1,
						},
					],
					dayTotals: [
						{ businessDate: "2026-06-01", total: 5 },
						{ businessDate: "2026-06-03", total: 3 },
					],
					totalRecords: [{ total: 8 }],
				},
			],
		} as any;

		const result = await calculateAttendanceDailyTrendByDepartment(
			prisma,
			"org-1",
			new Date("2026-06-01T00:00:00.000Z"),
			new Date("2026-06-03T23:59:59.999Z"),
		);

		expect(result.startDate.toISOString()).to.equal("2026-06-01T00:00:00.000Z");
		expect(result.endDate.toISOString()).to.equal("2026-06-03T23:59:59.999Z");
		expect(result.totalDays).to.equal(3);
		expect(result.totalRecords).to.equal(8);
		expect(result.departments.map((department) => department.departmentName)).to.deep.equal([
			"Operations",
			"People",
			"Unassigned",
		]);
		expect(result.series).to.have.length(3);
		expect(result.series[0]).to.deep.include({
			businessDate: "2026-06-01",
			total: 5,
		});
		expect(result.series[1]).to.deep.include({
			businessDate: "2026-06-02",
			total: 0,
		});
		expect(result.series[1].departmentBreakdown).to.deep.equal([
			{ departmentId: "dept-ops", departmentName: "Operations", total: 0 },
			{ departmentId: "dept-people", departmentName: "People", total: 0 },
			{ departmentId: null, departmentName: "Unassigned", total: 0 },
		]);
		expect(result.series[2]).to.deep.include({
			businessDate: "2026-06-03",
			total: 3,
		});
	});

	it("returns an empty result when the requested range is inverted", async () => {
		const prisma = {
			$queryRaw: async () => {
				throw new Error("should not query for an inverted range");
			},
		} as any;

		const result = await calculateAttendanceDailyTrendByDepartment(
			prisma,
			"org-1",
			new Date("2026-06-03T00:00:00.000Z"),
			new Date("2026-06-01T00:00:00.000Z"),
		);

		expect(result.totalDays).to.equal(0);
		expect(result.totalRecords).to.equal(0);
		expect(result.departments).to.deep.equal([]);
		expect(result.series).to.deep.equal([]);
	});
});
