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
			},
		};
		const app = buildApp(prismaMock, { role: "hris-employee" });
		const response = await request(app).get("/api/onboarding/employees");
		expect(response.status).to.equal(200);
		const [employee] = response.body.data.employees;
		expect(employee.name).to.equal("Nina New");
		expect(employee.checklist.completionPercentage).to.equal(40);
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
