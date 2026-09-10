import { expect } from "chai";
import { controller } from "../app/employeeBenefit/employeeBenefit.controller";

const buildRes = () => {
	const res: any = {};
	res.statusCode = 0;
	res.body = null;
	res.status = (code: number) => {
		res.statusCode = code;
		return res;
	};
	res.json = (body: any) => {
		res.body = body;
		return res;
	};
	return res;
};

const buildReq = (body: any) => ({
	body,
	method: "POST",
	path: "/api/employeeBenefit/quick-adjust",
	ip: "127.0.0.1",
	organizationId: "org-1",
	user: { id: "user-1" },
	get: () => "application/json",
	originalUrl: "/api/employeeBenefit/quick-adjust",
	metadata: {},
}) as any;

const stubPrisma = (overrides: Record<string, any> = {}) =>
	({
		payrollPeriod: {
			findFirst: async () => ({ id: "period-1", code: "PP-TEST", status: "OPEN" }),
		},
		benefitType: {
			findFirst: async () => ({ id: "bt-oad", code: "OAD" }),
		},
		employee: {
			findMany: async () => [{ id: "507f1f77bcf86cd799439011", employeeId: "00001" }],
		},
		employeeBenefit: {
			create: async ({ data }: any) => ({ id: "eb-1", ...data }),
		},
		employeeBenefitInstallment: {
			create: async () => ({}),
		},
		...overrides,
	}) as any;

describe("POST /api/employeeBenefit/quick-adjust", () => {
	it("creates an OAD addition with the custom name for one employee", async () => {
		const api = controller(stubPrisma());
		const res = buildRes();
		await api.quickAdjust(
			buildReq({
				employeeIds: ["507f1f77bcf86cd799439011"],
				direction: "ADDITION",
				name: "Good performance",
				amount: 1000,
				payrollPeriodId: "507f1f77bcf86cd799439012",
			}),
			res,
			(() => {}) as any,
		);
		expect(res.statusCode).to.equal(201);
		expect(res.body.data.benefitCode).to.equal("OAD");
		expect(res.body.data.created).to.have.length(1);
		expect(res.body.data.created[0].name).to.equal("Good performance");
		expect(res.body.data.created[0].benefitTypeId).to.equal("bt-oad");
		expect(res.body.data.created[0].payrollPeriodId).to.equal("507f1f77bcf86cd799439012");
	});

	it("uses the NEGADJ carrier for deductions", async () => {
		const api = controller(
			stubPrisma({
				benefitType: { findFirst: async () => ({ id: "bt-neg", code: "NEGADJ" }) },
			}),
		);
		const res = buildRes();
		await api.quickAdjust(
			buildReq({
				employeeIds: ["507f1f77bcf86cd799439011"],
				direction: "DEDUCTION",
				name: "Equipment destroy",
				amount: 500,
				payrollPeriodId: "507f1f77bcf86cd799439012",
			}),
			res,
			(() => {}) as any,
		);
		expect(res.statusCode).to.equal(201);
		expect(res.body.data.benefitCode).to.equal("NEGADJ");
		expect(res.body.data.created[0].benefitTypeId).to.equal("bt-neg");
	});

	it("allows COMPLETED periods (operator-ordered: adjustment lands, next re-run applies)", async () => {
		const api = controller(
			stubPrisma({
				payrollPeriod: {
					findFirst: async () => ({ id: "period-1", code: "PP-OLD", status: "COMPLETED" }),
				},
			}),
		);
		const res = buildRes();
		await api.quickAdjust(
			buildReq({
				employeeIds: ["507f1f77bcf86cd799439011"],
				direction: "ADDITION",
				name: "Good performance",
				amount: 1000,
				payrollPeriodId: "507f1f77bcf86cd799439012",
			}),
			res,
			(() => {}) as any,
		);
		expect(res.statusCode).to.equal(201);
		expect(res.body.data.payrollPeriodId).to.equal("507f1f77bcf86cd799439012");
	});

	it("rejects bad input with 400 (empty name, bad amount)", async () => {
		const api = controller(stubPrisma());
		for (const body of [
			{
				employeeIds: ["507f1f77bcf86cd799439011"],
				direction: "ADDITION",
				name: "",
				amount: 1000,
				payrollPeriodId: "507f1f77bcf86cd799439012",
			},
			{
				employeeIds: ["507f1f77bcf86cd799439011"],
				direction: "ADDITION",
				name: "Good performance",
				amount: -5,
				payrollPeriodId: "507f1f77bcf86cd799439012",
			},
			{
				employeeIds: [],
				direction: "ADDITION",
				name: "Good performance",
				amount: 1000,
				payrollPeriodId: "507f1f77bcf86cd799439012",
			},
		]) {
			const res = buildRes();
			await api.quickAdjust(buildReq(body), res, (() => {}) as any);
			expect(res.statusCode, JSON.stringify(body)).to.equal(400);
		}
	});

	it("reports unknown employees as failed rows, not a hard error", async () => {
		const api = controller(
			stubPrisma({ employee: { findMany: async () => [] } }),
		);
		const res = buildRes();
		await api.quickAdjust(
			buildReq({
				employeeIds: ["507f1f77bcf86cd799439011"],
				direction: "ADDITION",
				name: "Good performance",
				amount: 1000,
				payrollPeriodId: "507f1f77bcf86cd799439012",
			}),
			res,
			(() => {}) as any,
		);
		expect(res.statusCode).to.equal(400);
	});
});
