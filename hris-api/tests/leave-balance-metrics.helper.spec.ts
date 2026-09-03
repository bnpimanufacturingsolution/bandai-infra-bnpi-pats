import { expect } from "chai";
import { calculateLeaveBalanceMetrics } from "../helper/leave-balance-metrics.helper";

describe("leave-balance metrics helper regression", () => {
	it("applies section, position, and level employee scope filters", async () => {
		let capturedWhere: any = null;
		const prisma = {
			employee: {
				findMany: async (args: any) => {
					capturedWhere = args.where;
					return [];
				},
			},
		} as any;

		const result = await calculateLeaveBalanceMetrics(
			prisma,
			"org-1",
			"dept-1",
			"section-1",
			"position-1",
			"level-1",
			"manager-1",
			"emp-1",
		);

		expect(result.totalEmployees).to.equal(0);
		expect(capturedWhere).to.include({
			organizationId: "org-1",
			isDeleted: false,
			departmentId: "dept-1",
			positionId: "position-1",
			levelId: "level-1",
			reportToId: "manager-1",
			id: "emp-1",
		});
		expect(capturedWhere.position).to.deep.equal({ sectionId: "section-1" });
	});
});
