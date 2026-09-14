import { expect } from "chai";
import express, { Router } from "express";
import request from "supertest";
import { controller } from "../app/onboarding/onboarding.controller";
import { router } from "../app/onboarding/onboarding.router";

const buildApp = (prismaMock: any, auth: { role: string; employeeId?: string | null }) => {
	const app = express();
	app.use(express.json());
	app.use((req, _res, next) => {
		(req as any).userId = "user-1";
		(req as any).role = auth.role;
		(req as any).organizationId = "org-1";
		(req as any).metadata = { employee: { id: auth.employeeId } };
		next();
	});
	app.use("/api", router(Router(), controller(prismaMock)));
	return app;
};

const actorEmployee = (overrides: any = {}) => ({
	id: "emp-actor",
	employeeId: "E-001",
	departmentId: "dept-it",
	employmentStatus: "ACTIVE",
	department: { id: "dept-it", name: "IT" },
	person: { personalInfo: { firstName: "Ivan", lastName: "Tester" } },
	...overrides,
});

describe("onboarding module guards", () => {
	it("rejects unauthenticated actors (no userId)", async () => {
		const app = express();
		app.use(express.json());
		app.use((req, _res, next) => {
			(req as any).userId = "";
			next();
		});
		app.use("/api", router(Router(), controller({} as any)));
		const response = await request(app).get("/api/onboarding/employees");
		expect(response.status).to.equal(401);
	});

	it("maps malformed IDs to 400 before touching the database", async () => {
		const prismaMock: any = {
			employee: { findFirst: async () => actorEmployee() },
		};
		const app = buildApp(prismaMock, { role: "hris-admin" });
		const response = await request(app).get("/api/onboarding/templates/not-an-id");
		expect(response.status).to.equal(400);
	});
});

describe("GET /api/onboarding/employees (roster)", () => {
	it("returns ONBOARDING employees with their checklist summary for any authenticated employee", async () => {
		const prismaMock: any = {
			employee: {
				findFirst: async () => actorEmployee(),
				findMany: async (args: any) => {
					expect(args.where.employmentStatus).to.equal("ONBOARDING");
					expect(args.where.organizationId).to.equal("org-1");
					expect(args.skip).to.equal(0);
					expect(args.take).to.equal(10);
					return [
						{
							id: "emp-newhire",
							employeeId: "E-900",
							employmentStatus: "ONBOARDING",
							employmentStartDate: new Date("2026-09-01"),
							department: { id: "dept-ops", name: "Operations" },
							person: { personalInfo: { firstName: "Nina", lastName: "New" } },
							onboardingChecklists: [
								{
									id: "chk-1",
									title: "Onboarding Checklist - Nina New",
									status: "ACTIVE",
									completionPercentage: 40,
								},
							],
						},
					];
				},
				count: async () => 170,
			},
		};
		const app = buildApp(prismaMock, { role: "hris-employee" });
		const response = await request(app).get("/api/onboarding/employees");
		expect(response.status).to.equal(200);
		const [employee] = response.body.data.employees;
		expect(employee.name).to.equal("Nina New");
		expect(employee.checklist.completionPercentage).to.equal(40);
		expect(response.body.data.pagination).to.deep.include({
			total: 170,
			page: 1,
			limit: 10,
			totalPages: 17,
		});
	});

	it("paginates: page 2 skips 10; limit clamps to 100; bad values fall back to defaults", async () => {
		const seen: any[] = [];
		const prismaMock: any = {
			employee: {
				findFirst: async () => actorEmployee(),
				findMany: async (args: any) => {
					seen.push({ skip: args.skip, take: args.take });
					return [];
				},
				count: async () => 0,
			},
		};
		const app = buildApp(prismaMock, { role: "hris-employee" });

		await request(app).get("/api/onboarding/employees?page=2").expect(200);
		expect(seen[0]).to.deep.equal({ skip: 10, take: 10 });

		await request(app).get("/api/onboarding/employees?limit=500").expect(200);
		expect(seen[1]).to.deep.equal({ skip: 0, take: 100 });

		await request(app).get("/api/onboarding/employees?page=abc&limit=-3").expect(200);
		expect(seen[2]).to.deep.equal({ skip: 0, take: 10 });
	});

	it("applies search (multi-term OR) and departmentId filters server-side", async () => {
		let capturedArgs: any;
		const prismaMock: any = {
			employee: {
				findFirst: async () => actorEmployee(),
				findMany: async (args: any) => {
					capturedArgs = args;
					return [];
				},
				count: async () => 0,
			},
		};
		const app = buildApp(prismaMock, { role: "hris-hr-user" });
		const response = await request(
			app,
		).get(
			"/api/onboarding/employees?search=char%20aznable&departmentId=cmryaf7ms0016nj3o68cn814g",
		);
		expect(response.status).to.equal(200);
		expect(capturedArgs.where.departmentId).to.equal("cmryaf7ms0016nj3o68cn814g");
		expect(capturedArgs.where.AND).to.have.lengthOf(2);
		expect(capturedArgs.where.AND[0].OR.map((clause: any) => Object.keys(clause)[0])).to.deep.equal([
			"employeeId",
			"person",
			"person",
		]);
		expect(capturedArgs.where.AND[1].OR[0].employeeId.contains).to.equal("aznable");
	});

	it("ignores malformed departmentId instead of failing", async () => {
		let capturedArgs: any;
		const prismaMock: any = {
			employee: {
				findFirst: async () => actorEmployee(),
				findMany: async (args: any) => {
					capturedArgs = args;
					return [];
				},
				count: async () => 0,
			},
		};
		const app = buildApp(prismaMock, { role: "hris-hr-user" });
		const response = await request(app).get("/api/onboarding/employees?departmentId=garbage!!");
		expect(response.status).to.equal(200);
		expect(capturedArgs.where.departmentId).to.be.undefined;
	});
});

describe("template CRUD authorization", () => {
	it("blocks non-admin template creation with 403", async () => {
		const prismaMock: any = {
			employee: { findFirst: async () => actorEmployee() },
		};
		const app = buildApp(prismaMock, { role: "hris-employee" });
		const response = await request(app)
			.post("/api/onboarding/templates")
			.send({ name: "Sneaky template" });
		expect(response.status).to.equal(403);
	});

	it("blocks HR from creating templates (admin only)", async () => {
		const prismaMock: any = {
			employee: { findFirst: async () => actorEmployee() },
		};
		const app = buildApp(prismaMock, { role: "hris-hr-manager" });
		const response = await request(app)
			.post("/api/onboarding/templates")
			.send({ name: "HR-made template" });
		expect(response.status).to.equal(403);
	});

	it("lets admin create a template and forces the token organization", async () => {
		const created: any[] = [];
		const prismaMock: any = {
			employee: { findFirst: async () => actorEmployee() },
			onboardingTemplate: {
				create: async (args: any) => {
					created.push(args.data);
					return { id: "ctpl0000000001", ...args.data };
				},
			},
		};
		const app = buildApp(prismaMock, { role: "hris-admin" });
		const response = await request(app)
			.post("/api/onboarding/templates")
			.send({ name: "Standard Onboarding", organizationId: "org-EVIL" });
		expect(response.status).to.equal(201);
		expect(created[0].organizationId).to.equal("org-1");
	});

	it("rejects empty template names", async () => {
		const prismaMock: any = {
			employee: { findFirst: async () => actorEmployee() },
		};
		const app = buildApp(prismaMock, { role: "hris-admin" });
		const response = await request(app).post("/api/onboarding/templates").send({ name: "" });
		expect(response.status).to.equal(400);
	});
});

describe("checklist instance rules", () => {
	it("rejects a second active checklist for the same employee (409)", async () => {
		let findFirstCalls = 0;
		const prismaMock: any = {
			employee: { findFirst: async () => actorEmployee({ id: "emp-newhire" }) },
			onboardingChecklist: {
				findFirst: async () => {
					findFirstCalls += 1;
					// first call = duplicate check finds existing
					return findFirstCalls === 1
						? { id: "chk-existing" }
						: null;
				},
			},
		};
		const app = buildApp(prismaMock, { role: "hris-hr-manager" });
		const response = await request(app)
			.post("/api/onboarding/checklists")
			.send({ employeeId: "ctpl0000000001" });
		expect(response.status).to.equal(409);
	});

	it("blocks regular employees from listing all checklists (admin/HR only)", async () => {
		const prismaMock: any = {
			employee: { findFirst: async () => actorEmployee() },
		};
		const app = buildApp(prismaMock, { role: "hris-employee" });
		const response = await request(app).get("/api/onboarding/checklists");
		expect(response.status).to.equal(403);
	});
});

describe("POST /api/onboarding/checklists auto-resolve + duplicates", () => {
	it("auto-resolves the single active template when templateId is omitted", async () => {
		let checklistFirstCalls = 0;
		const createdChecklists: any[] = [];
		const prismaMock: any = {
			employee: {
				findFirst: async () => actorEmployee({ id: "emp-newhire" }),
			},
			onboardingChecklist: {
				findFirst: async (args: any) => {
					checklistFirstCalls += 1;
					// ensure(): existing lookup -> none; controller load -> full record
					if (checklistFirstCalls === 1) return null;
					return { id: "chk-new-1", sections: [], employee: { person: null } };
				},
			},
			onboardingTemplate: {
				findFirst: async (args: any) =>
					args?.include ? { id: "ctpl0000000001", sections: [] } : { id: "ctpl0000000001" },
			},
			$transaction: async (fn: any) =>
				fn({
					onboardingChecklist: {
						create: async (args: any) => {
							createdChecklists.push(args.data);
							return { id: "chk-new-1", ...args.data };
						},
					},
					onboardingSection: { create: async () => ({ id: "s1" }) },
					onboardingItem: { create: async () => ({ id: "i1" }) },
				}),
		};
		const app = buildApp(prismaMock, { role: "hris-hr-manager" });
		const response = await request(app)
			.post("/api/onboarding/checklists")
			.send({ employeeId: "ctpl0000000009" });
		expect(response.status).to.equal(201);
		expect(createdChecklists[0].templateId).to.equal("ctpl0000000001");
	});

	it("returns 409 when the employee already has a checklist", async () => {
		const prismaMock: any = {
			employee: { findFirst: async () => actorEmployee({ id: "emp-newhire" }) },
			onboardingChecklist: {
				findFirst: async () => ({ id: "chk-existing" }),
			},
		};
		const app = buildApp(prismaMock, { role: "hris-hr-manager" });
		const response = await request(app)
			.post("/api/onboarding/checklists")
			.send({ employeeId: "ctpl0000000009" });
		expect(response.status).to.equal(409);
	});
});

describe("POST /api/onboarding/checklists/provision-all", () => {
	it("blocks department employees (admin/HR only)", async () => {
		const prismaMock: any = {
			employee: { findFirst: async () => actorEmployee() },
		};
		const app = buildApp(prismaMock, { role: "hris-employee" });
		const response = await request(app)
			.post("/api/onboarding/checklists/provision-all")
			.send({ dryRun: true });
		expect(response.status).to.equal(403);
	});

	it("dry-run returns the plan without writing", async () => {
		let transactionCalled = false;
		const prismaMock: any = {
			employee: {
				findFirst: async () => actorEmployee(),
				findMany: async (args: any) => {
					expect(args.where.employmentStatus).to.equal("ONBOARDING");
					return [
						{ id: "emp-a", employeeId: "E-A" },
						{ id: "emp-b", employeeId: "E-B" },
					];
				},
			},
			onboardingChecklist: {
				findMany: async () => [{ employeeId: "emp-a" }],
			},
			onboardingTemplate: {
				findFirst: async () => ({ id: "ctpl0000000001", name: "Standard" }),
			},
			$transaction: async () => {
				transactionCalled = true;
			},
		};
		const app = buildApp(prismaMock, { role: "hris-admin" });
		const response = await request(app)
			.post("/api/onboarding/checklists/provision-all")
			.send({ dryRun: true });
		expect(response.status).to.equal(200);
		expect(response.body.data.dryRun).to.be.true;
		expect(response.body.data.wouldCreate).to.equal(1);
		expect(response.body.data.employees.map((e: any) => e.id)).to.deep.equal(["emp-b"]);
		expect(transactionCalled).to.be.false;
	});

	it("executes provisioning idempotently for employees missing a checklist", async () => {
		const checklistFindFirstPerEmployee: Record<string, any> = { emp_b: null };
		const created: any[] = [];
		const prismaMock: any = {
			employee: {
				findFirst: async (args: any) => {
					if (args?.where?.userId || args?.where?.id === "emp-actor") return actorEmployee();
					return {
						id: "emp-b",
						employmentStartDate: new Date(),
						person: { personalInfo: { firstName: "Bea", lastName: "Bee" } },
					};
				},
				findMany: async () => [{ id: "emp-b", employeeId: "E-B" }],
			},
			onboardingChecklist: {
				findMany: async () => [],
				findFirst: async () => checklistFindFirstPerEmployee.emp_b,
			},
			onboardingTemplate: {
				findFirst: async (args: any) =>
					args?.include ? { id: "ctpl0000000001", sections: [] } : { id: "ctpl0000000001", name: "Standard" },
			},
			$transaction: async (fn: any) =>
				fn({
					onboardingChecklist: {
						create: async (args: any) => {
							created.push(args.data);
							return { id: "chk-new-b", ...args.data };
						},
					},
					onboardingSection: { create: async () => ({ id: "s1" }) },
					onboardingItem: { create: async () => ({ id: "i1" }) },
				}),
		};
		const app = buildApp(prismaMock, { role: "hris-hr-manager" });
		const response = await request(app)
			.post("/api/onboarding/checklists/provision-all")
			.send({});
		expect(response.status).to.equal(200);
		expect(response.body.data.created).to.equal(1);
		expect(response.body.data.skipped).to.equal(0);
		expect(response.body.data.failed).to.equal(0);
		expect(created[0].employeeId).to.equal("emp-b");
	});
});

describe("PATCH /api/onboarding/items/:id structure-only", () => {
	it("rejects signature/status fields through the structure endpoint", async () => {
		const prismaMock: any = {
			employee: { findFirst: async () => actorEmployee() },
		};
		const app = buildApp(prismaMock, { role: "hris-admin" });
		const response = await request(app)
			.patch("/api/onboarding/items/citem0000000001")
			.send({ status: "COMPLETED", signedByName: "Impostor" });
		expect(response.status).to.equal(400);
	});
});

describe("POST /api/onboarding/items/:id/unsign", () => {
	it("blocks department employees from unsigned items", async () => {
		const prismaMock: any = {
			employee: { findFirst: async () => actorEmployee() },
		};
		const app = buildApp(prismaMock, { role: "hris-employee" });
		const response = await request(app).post("/api/onboarding/items/citem0000000001/unsign");
		expect(response.status).to.equal(403);
	});
});
