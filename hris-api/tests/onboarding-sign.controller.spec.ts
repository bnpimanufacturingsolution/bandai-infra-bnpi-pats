import { expect } from "chai";
import express from "express";
import request from "supertest";
import { Router } from "express";
import { controller } from "../app/onboarding/onboarding.controller";
import { router } from "../app/onboarding/onboarding.router";

const bcrypt = require("bcryptjs") as {
	compare(candidate: string, hash: string): Promise<boolean>;
	hash(value: string, rounds: number): Promise<string>;
};

const PASSWORD = "password123";

interface MockConfig {
	role: string;
	employeeId: string;
	departmentId: string | null;
	employmentStatus?: string;
	userPassword?: string | null;
	newHireStatus?: string;
	itemStatus?: string;
	responsibleDepartmentId?: string | null;
	// Adds a second PENDING no-department (section) row to the checklist items.
	extraSectionPending?: boolean;
}

function buildMockPrisma(config: MockConfig) {
	const calls: any[] = [];
	const item = {
		id: "citem0000000001",
		organizationId: "org-1",
		sectionId: "sec-1",
		parentId: null,
		number: "1.1",
		title: "Laptop issued",
		description: null,
		responsibleDepartmentId:
			config.responsibleDepartmentId === undefined ? "dept-it" : config.responsibleDepartmentId,
		responsibleDepartmentName: "IT",
		order: 1,
		status: config.itemStatus || "PENDING",
		completedDate: null,
		completedByEmployeeId: null,
		signedByName: null,
		remarks: null,
		isDeleted: false,
		section: {
			checklistId: "chk-1",
			checklist: { employeeId: "emp-newhire" },
		},
	};

	const signatureCreated: any[] = [];
	const itemUpdates: any[] = [];
	const checklistUpdates: any[] = [];
	const statusUpdates: any[] = [];
	let statusSyncShouldThrow = false;

	const prismaMock: any = {
		employee: {
			findFirst: async () => ({
				id: config.employeeId,
				employeeId: "E-100",
				departmentId: config.departmentId,
				employmentStatus: config.employmentStatus || "ACTIVE",
				department: config.departmentId ? { id: config.departmentId, name: "IT" } : null,
				person: { personalInfo: { firstName: "Ivan", lastName: "Tester" } },
			}),
			// gate resolver lookups (syncEmployeeEmploymentStatus)
			findUnique: async () => ({
				id: "emp-newhire",
				employmentStatus: config.newHireStatus || "ONBOARDING",
			}),
			update: async (args: any) => {
				if (statusSyncShouldThrow) throw new Error("status sync db down");
				statusUpdates.push(args.data);
				return { id: "emp-newhire", ...args.data };
			},
		},
		boardingProcess: {
			findMany: async () => [], // legacy side clean for these tests
		},
		onboardingChecklist: {
			// syncEmploymentForChecklist resolves checklist -> employee
			findFirst: async () => ({ employeeId: "emp-newhire" }),
		},
		onboardingItem: {
			findFirst: async (args: any) => {
				calls.push({ fn: "onboardingItem.findFirst", args });
				if (args?.where?.id !== item.id) return null;
				return item;
			},
			findUnique: async () => null,
		},
		onboardingTemplateItem: { findFirst: async () => null },
		user: {
			findUnique: async () => ({
				password: config.userPassword === undefined ? PASSWORD_HASH : config.userPassword,
				isDeleted: false,
				status: "active",
			}),
		},
		onboardingSignature: {
			findMany: async () => [],
		},
		$transaction: async (fn: any) =>
			fn({
				onboardingItem: {
					update: async (args: any) => {
						itemUpdates.push(args.data);
						return { ...item, ...args.data };
					},
					findMany: async () => [
						{
							id: item.id,
							parentId: null,
							status: itemUpdates.length
								? itemUpdates[itemUpdates.length - 1].status
								: item.status,
							responsibleDepartmentId: item.responsibleDepartmentId,
						},
						...(config.extraSectionPending
							? [
									{
										id: "citem0000000002",
										parentId: null,
										status: "PENDING",
										responsibleDepartmentId: null,
									},
								]
							: []),
					],
				},
				onboardingSignature: {
					create: async (args: any) => {
						signatureCreated.push(args.data);
						return { id: "sig-1", ...args.data };
					},
				},
				onboardingChecklist: {
					update: async (args: any) => {
						checklistUpdates.push(args.data);
						return { id: "chk-1" };
					},
				},
			}),
	};

	return {
		prismaMock,
		calls,
		item,
		signatureCreated,
		itemUpdates,
		checklistUpdates,
		statusUpdates,
		setStatusSyncThrows: (value: boolean) => {
			statusSyncShouldThrow = value;
		},
	};
}

let PASSWORD_HASH = "";

function buildApp(prismaMock: any) {
	const app = express();
	app.use(express.json());
	app.use((req, _res, next) => {
		(req as any).userId = "user-1";
		(req as any).role = prismaMock.__role;
		(req as any).organizationId = "org-1";
		(req as any).firstName = "Ivan";
		(req as any).lastName = "Tester";
		next();
	});
	const mounted = router(Router(), controller(prismaMock));
	app.use("/api", mounted);
	return app;
}

describe("POST /api/onboarding/items/:id/sign", () => {
	before(async () => {
		PASSWORD_HASH = await bcrypt.hash(PASSWORD, 10);
	});

	const signAs = async (config: MockConfig, body: any, before?: (m: any) => void) => {
		const { prismaMock, ...rest } = buildMockPrisma(config);
		prismaMock.__role = config.role;
		before?.(prismaMock);
		const app = buildApp(prismaMock);
		const response = await request(app).post("/api/onboarding/items/citem0000000001/sign").send(body);
		return { response, ...rest };
	};

	it("promotes the employee to ACTIVE when signing completes the dedicated checklist", async () => {
		const { response, statusUpdates } = await signAs(
			{ role: "hris-employee", employeeId: "emp-it-guy", departmentId: "dept-it" },
			{ password: PASSWORD },
		);
		expect(response.status).to.equal(200);
		// legacy clean + no remaining PENDING dedicated items -> gate promotes
		expect(response.body.data.checklist.employmentStatus).to.equal("ACTIVE");
		expect(statusUpdates[0].employmentStatus).to.equal("ACTIVE");
	});

	it("still signs (200) when the employment-status sync fails internally", async () => {
		const { response } = await signAs(
			{ role: "hris-employee", employeeId: "emp-it-guy", departmentId: "dept-it" },
			{ password: PASSWORD },
			(m: any) => {
				m.employee.update = async () => {
					throw new Error("sync db down");
				};
			},
		);
		expect(response.status).to.equal(200);
		expect(response.body.data.item.status).to.equal("COMPLETED");
		expect(response.body.data.checklist.employmentStatus).to.equal(null);
	});

	it("signs a dept-matched item and stamps the signee server-side", async () => {
		const { response, itemUpdates, signatureCreated, checklistUpdates } = await signAs(
			{ role: "hris-employee", employeeId: "emp-it-guy", departmentId: "dept-it" },
			{ password: PASSWORD, remarks: "Laptop handed over" },
		);
		expect(response.status).to.equal(200);
		expect(response.body.status).to.equal("success");
		expect(itemUpdates[0].status).to.equal("COMPLETED");
		expect(itemUpdates[0].signedByName).to.equal("Ivan Tester");
		expect(itemUpdates[0].completedByEmployeeId).to.equal("emp-it-guy");
		expect(itemUpdates[0].remarks).to.equal("Laptop handed over");
		expect(signatureCreated[0].signerEmployeeId).to.equal("emp-it-guy");
		expect(signatureCreated[0].passwordVerified).to.be.true;
		expect(checklistUpdates.length).to.equal(1);
	});

	it("rejects a wrong password with 401 and does not write", async () => {
		const { response, itemUpdates } = await signAs(
			{ role: "hris-employee", employeeId: "emp-it-guy", departmentId: "dept-it" },
			{ password: "totally-wrong" },
		);
		expect(response.status).to.equal(401);
		expect(itemUpdates).to.have.lengthOf(0);
	});

	it("rejects a passwordless account with 409", async () => {
		const { response } = await signAs(
			{
				role: "hris-employee",
				employeeId: "emp-it-guy",
				departmentId: "dept-it",
				userPassword: null,
			},
			{ password: PASSWORD },
		);
		expect(response.status).to.equal(409);
	});

	it("denies a different department with 403 before checking status", async () => {
		const { response, itemUpdates } = await signAs(
			{ role: "hris-employee", employeeId: "emp-ga-gal", departmentId: "dept-ga" },
			{ password: PASSWORD },
		);
		expect(response.status).to.equal(403);
		expect(response.body.message).to.match(/responsible department/i);
		expect(itemUpdates).to.have.lengthOf(0);
	});

	it("denies the onboarded employee signing their own checklist with 403", async () => {
		const { response } = await signAs(
			{
				role: "hris-employee",
				employeeId: "emp-newhire",
				departmentId: "dept-it",
				employmentStatus: "ONBOARDING",
			},
			{ password: PASSWORD },
		);
		expect(response.status).to.equal(403);
		expect(response.body.message).to.match(/own checklist/i);
	});

	it("denies a department employee signing a no-department item", async () => {
		const { response } = await signAs(
			{
				role: "hris-employee",
				employeeId: "emp-it-guy",
				departmentId: "dept-it",
				responsibleDepartmentId: null,
			},
			{ password: PASSWORD },
		);
		expect(response.status).to.equal(403);
		expect(response.body.message).to.match(/HR or Admin/i);
	});

	it("lets HR sign any item with a matching password", async () => {
		const { response } = await signAs(
			{ role: "hris-hr-manager", employeeId: "emp-hr", departmentId: "dept-hr" },
			{ password: PASSWORD },
		);
		expect(response.status).to.equal(200);
	});

	it("lets admin sign any item", async () => {
		const { response } = await signAs(
			{ role: "hris-admin", employeeId: "emp-admin", departmentId: null },
			{ password: PASSWORD },
		);
		expect(response.status).to.equal(200);
	});

	it("excludes PENDING section rows from progress and the ACTIVE gate", async () => {
		const { response, checklistUpdates, statusUpdates } = await signAs(
			{
				role: "hris-employee",
				employeeId: "emp-it-guy",
				departmentId: "dept-it",
				extraSectionPending: true,
			},
			{ password: PASSWORD },
		);
		expect(response.status).to.equal(200);
		// only actionable items count: the signed item is the sole actionable one.
		expect(checklistUpdates[0].completionPercentage).to.equal(100);
		expect(checklistUpdates[0].status).to.equal("COMPLETED");
		expect(response.body.data.checklist.employmentStatus).to.equal("ACTIVE");
		expect(statusUpdates[0].employmentStatus).to.equal("ACTIVE");
	});

	it("stays permissive: HR signing a no-department section row succeeds but is not counted", async () => {
		const { response, checklistUpdates } = await signAs(
			{
				role: "hris-hr-manager",
				employeeId: "emp-hr",
				departmentId: "dept-hr",
				responsibleDepartmentId: null,
			},
			{ password: PASSWORD },
		);
		expect(response.status).to.equal(200);
		// zero actionable items -> honestly 100%/COMPLETED (nothing left to sign).
		expect(checklistUpdates[0].completionPercentage).to.equal(100);
		expect(checklistUpdates[0].status).to.equal("COMPLETED");
	});

	it("returns 409 when the item is already signed", async () => {
		const { response, itemUpdates } = await signAs(
			{
				role: "hris-employee",
				employeeId: "emp-it-guy",
				departmentId: "dept-it",
				itemStatus: "COMPLETED",
			},
			{ password: PASSWORD },
		);
		expect(response.status).to.equal(409);
		expect(itemUpdates).to.have.lengthOf(0);
	});

	it("requires a password field", async () => {
		const { response } = await signAs(
			{ role: "hris-employee", employeeId: "emp-it-guy", departmentId: "dept-it" },
			{ remarks: "no password given" },
		);
		expect(response.status).to.equal(400);
	});
});
