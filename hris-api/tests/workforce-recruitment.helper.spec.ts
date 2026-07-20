import { expect } from "chai";
import { listCurrentHeadcounts } from "../helper/workforce-recruitment.helper";

describe("workforce recruitment helper", () => {
	it("groups active employee headcounts and hydrates coverage names", async () => {
		const prisma: any = {
			employee: {
				groupBy: async (args: any) => {
					expect(args).to.deep.include({
						by: ["departmentId", "sectionId", "positionId", "levelId"],
					});
					expect(args.where).to.deep.include({
						organizationId: "org-1",
						isDeleted: false,
					});
					expect(args.where.employmentStatus.in).to.include.members([
						"ACTIVE",
						"ONBOARDING",
						"ON_LEAVE",
						"SERVING_NOTICE",
					]);
					return [
						{
							departmentId: "department-manufacturing",
							sectionId: "section-assembly",
							positionId: "position-operator",
							levelId: null,
							_count: { _all: 986 },
						},
					];
				},
			},
			department: {
				findMany: async () => [
					{ id: "department-manufacturing", name: "Manufacturing" },
				],
			},
			section: {
				findMany: async () => [{ id: "section-assembly", name: "Assembly" }],
			},
			position: {
				findMany: async () => [{ id: "position-operator", title: "Operator" }],
			},
			level: {
				findMany: async () => [],
			},
		};

		const headcounts = await listCurrentHeadcounts(prisma, "org-1");

		expect(headcounts).to.deep.equal([
			{
				departmentId: "department-manufacturing",
				departmentName: "Manufacturing",
				sectionId: "section-assembly",
				sectionName: "Assembly",
				positionId: "position-operator",
				positionTitle: "Operator",
				levelId: null,
				levelName: null,
				currentHeadcount: 986,
			},
		]);
	});
});
