import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { controller } from "../app/employee/employee.controller";

const buildEmployeeRow = (overrides: Record<string, unknown> = {}) => ({
	id: "emp-1",
	employeeId: "00010",
	employmentStatus: "ACTIVE",
	employmentType: "REGULAR",
	person: {
		personalInfo: { firstName: "Zen", middleName: "Andrei", lastName: "Cruz" },
		contactInfo: { email: "zen.cruz@example.com" },
	},
	department: { id: "dept-1", name: "HR" },
	position: { id: "pos-1", title: "Technician" },
	...overrides,
});

const nameRow = (
	id: string,
	employeeId: string,
	firstName: string,
	lastName: string,
	overrides: Record<string, unknown> = {},
) =>
	buildEmployeeRow({
		id,
		employeeId,
		person: {
			personalInfo: { firstName, lastName },
			contactInfo: { email: `${firstName.toLowerCase()}@example.com` },
		},
		...overrides,
	});

describe("employee integration search endpoint", () => {
	let prisma: any;
	let request: Request;
	let response: Response;
	let responseStatus: number;
	let responseBody: any;
	let findManyArgs: any;
	let countArgs: any;
	let dataset: any[];

	const call = async (query: Record<string, unknown>) => {
		request = {
			query,
			params: {},
			get: () => "application/json",
			originalUrl: "/api/employee/search",
		} as unknown as Request;
		responseStatus = 200;
		responseBody = undefined;
		response = {
			status: (status: number) => {
				responseStatus = status;
				return response;
			},
			json: (body: unknown) => {
				responseBody = body;
				return response;
			},
		} as unknown as Response;
		await controller(prisma).searchEmployees(request, response, () => undefined);
	};

	beforeEach(() => {
		findManyArgs = undefined;
		countArgs = undefined;
		dataset = [
			nameRow("emp-1", "00010", "Zen", "Cruz"),
			nameRow("emp-2", "00020", "June", "Verzero"),
			nameRow("emp-3", "00030", "Zen", "Geraldino"),
		];
		prisma = {
			employee: {
				findMany: async (args: any) => {
					findManyArgs = args;
					return dataset;
				},
			},
		};
	});

	it("rejects missing search text with 400 and a guidance message", async () => {
		await call({});

		assert.equal(responseStatus, 400);
		assert.match(String(responseBody?.message || ""), /query/i);
	});

	it("accepts q and search aliases for the query parameter", async () => {
		await call({ q: "zen" });
		assert.equal(responseStatus, 200);
		await call({ search: "zen" });
		assert.equal(responseStatus, 200);
	});

	it("fetches the filter-scoped pool without DB text matching so fuzzy sees typos", async () => {
		await call({ query: "zyn cruz", employmentStatus: "ACTIVE" });

		const where = findManyArgs?.where;
		assert.equal(where.isDeleted, false);
		assert.equal(where.employmentStatus, "ACTIVE");
		assert.equal(where.AND, undefined);
		assert.equal(findManyArgs?.take, 5000);
	});

	it("applies exact employmentStatus, employmentType, departmentId, positionId filters", async () => {
		await call({
			query: "zen",
			employmentStatus: "ACTIVE",
			employmentType: "REGULAR",
			departmentId: "dept-1",
			positionId: "pos-1",
		});

		const where = findManyArgs?.where;
		assert.equal(where.employmentStatus, "ACTIVE");
		assert.equal(where.employmentType, "REGULAR");
		assert.equal(where.departmentId, "dept-1");
		assert.equal(where.positionId, "pos-1");
	});

	it("clamps limit to 100 and defaults page/limit", async () => {
		await call({ query: "zen", limit: "5000" });
		assert.equal(responseBody?.data?.limit, 100);

		await call({ query: "zen" });
		assert.equal(responseBody?.data?.limit, 10);
		assert.equal(responseBody?.data?.pagination?.page, 1);
		assert.equal(responseBody?.data?.sort, "relevance");
	});

	it("returns honest pagination from the scoped count", async () => {
		dataset = Array.from({ length: 25 }, (_, i) =>
			nameRow(`emp-${i}`, String(i).padStart(5, "0"), "Zen", `Person${i}`),
		);

		await call({ query: "zen", page: "2", limit: "10" });

		const pagination = responseBody?.data?.pagination;
		assert.equal(pagination.total, 25);
		assert.equal(pagination.page, 2);
		assert.equal(pagination.limit, 10);
		assert.equal(pagination.totalPages, 3);
		assert.equal(pagination.hasNext, true);
		assert.equal(pagination.hasPrev, true);
		assert.equal(responseBody?.data?.employees?.length, 10);
	});

	it("requires every query term to match (AND semantics across terms)", async () => {
		dataset = [
			nameRow("emp-a", "00001", "Zen", "Cruz"), // matches both terms
			nameRow("emp-b", "00002", "Zen", "Geraldino"), // matches only "zen"
		];

		await call({ query: "zen cruz" });

		const ids = responseBody?.data?.employees?.map((e: any) => e.employeeId);
		assert.deepEqual(ids, ["00001"]);
		assert.equal(responseBody?.data?.pagination?.total, 1);
	});

	it("fuzzy-matches a typo and reports it in the fuzzy counter", async () => {
		// "zyn" is not a substring of any row; edit distance 1 from "Zen"
		await call({ query: "zyn" });

		assert.equal(responseStatus, 200);
		assert.equal(responseBody?.data?.count, 2);
		assert.equal(responseBody?.data?.fuzzy, 2);
		const ids = responseBody?.data?.employees?.map((e: any) => e.employeeId);
		assert.deepEqual(ids, ["00010", "00030"]);
	});

	it("orders relevance as exact rows first, then fuzzy by score", async () => {
		dataset = [
			nameRow("emp-a", "00001", "Zennith", "Saludo"), // exact substring "zen"
			nameRow("emp-b", "00002", "Kaizen", "Llaneta"), // exact substring "zen" inside Kaizen
			buildEmployeeRow({
				id: "emp-c",
				employeeId: "00003",
				person: {
					personalInfo: { firstName: "Zan", lastName: "Fuzzy" }, // fuzzy distance 1
					contactInfo: {},
				},
			}),
		];

		await call({ query: "zen" });

		const ids = responseBody?.data?.employees?.map((e: any) => e.employeeId);
		assert.deepEqual(ids, ["00001", "00002", "00003"]);
		assert.equal(responseBody?.data?.fuzzy, 1);
	});

	it("sorts by fullName and employeeId with direction", async () => {
		await call({ query: "zen", sort: "fullName" });
		const namesAsc = responseBody?.data?.employees?.map((e: any) => e.fullName);
		assert.deepEqual(namesAsc, [...namesAsc].sort());

		await call({ query: "zen", sort: "employeeId:desc" });
		const idsDesc = responseBody?.data?.employees?.map((e: any) => e.employeeId);
		assert.deepEqual(idsDesc, [...idsDesc].sort().reverse());
	});

	it("named sort returns only query-matched rows, never the whole pool", async () => {
		dataset = [
			nameRow("emp-a", "00001", "Zen", "Cruz"),
			nameRow("emp-b", "00002", "Zen", "Geraldino"),
			nameRow("emp-c", "00003", "Aa", "Nozzmatch"), // contains "z" but NOT "zen"
		];

		await call({ query: "zen", sort: "employeeId", page: "2", limit: "1" });

		assert.equal(responseBody?.data?.pagination?.total, 2);
		assert.equal(responseBody?.data?.employees?.length, 1);
		assert.equal(responseBody?.data?.employees?.[0]?.employeeId, "00002");
	});

	it("maps rows to a flat integration shape with fullName and no payroll fields", async () => {
		await call({ query: "zen" });

		assert.equal(responseStatus, 200);
		const data = responseBody?.data;
		const employee = data.employees[0];
		assert.equal(employee.id, "emp-1");
		assert.equal(employee.employeeId, "00010");
		assert.equal(employee.fullName, "Zen Cruz");
		assert.equal(employee.email, "zen@example.com");
		assert.equal(employee.employmentStatus, "ACTIVE");
		assert.equal(employee.department.name, "HR");
		assert.equal(employee.position.title, "Technician");
		assert.equal(employee.personalInfo, undefined);
		assert.equal(employee.basicSalary, undefined);
	});

	it("omits middleName cleanly from fullName when absent", async () => {
		dataset = [
			buildEmployeeRow({
				person: {
					personalInfo: { firstName: "Ana", lastName: "Santos" },
					contactInfo: {},
				},
			}),
		];

		await call({ query: "ana" });

		const employee = responseBody?.data?.employees?.[0];
		assert.equal(employee.fullName, "Ana Santos");
		assert.equal(employee.email, null);
	});

	it("returns an empty page cleanly when the page is beyond the result set", async () => {
		await call({ query: "zen", page: "99" });

		assert.equal(responseStatus, 200);
		assert.equal(responseBody?.data?.employees?.length, 0);
		assert.equal(responseBody?.data?.pagination?.page, 99);
		assert.equal(responseBody?.data?.pagination?.total, 2);
	});
});
