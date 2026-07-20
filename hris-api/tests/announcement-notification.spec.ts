import { expect } from "chai";
import express from "express";
import request from "supertest";
import { CreateNotificationSchema } from "../zod/notification.zod";
import { controller } from "../app/notification/notification.controller";

describe("CreateNotificationSchema Validation", () => {
	const validBase = {
		organizationId: "507f1f77bcf86cd799439011",
		title: "New Policy Update",
		description: "Please check the new employee policy handbook.",
		category: "ANNOUNCEMENT",
		type: "INFO",
	};

	it("succeeds when broadcast is false and recipientEmployeeIds has IDs", () => {
		const payload = {
			...validBase,
			broadcast: false,
			recipientEmployeeIds: ["507f1f77bcf86cd799439012"],
		};
		const result = CreateNotificationSchema.safeParse(payload);
		expect(result.success).to.be.true;
	});

	it("fails when broadcast is false and recipientEmployeeIds is missing or empty", () => {
		const payload1 = {
			...validBase,
			broadcast: false,
		};
		const result1 = CreateNotificationSchema.safeParse(payload1);
		expect(result1.success).to.be.false;

		const payload2 = {
			...validBase,
			broadcast: false,
			recipientEmployeeIds: [],
		};
		const result2 = CreateNotificationSchema.safeParse(payload2);
		expect(result2.success).to.be.false;
	});

	it("succeeds when broadcast is true and recipientEmployeeIds is missing or empty", () => {
		const payload1 = {
			...validBase,
			broadcast: true,
		};
		const result1 = CreateNotificationSchema.safeParse(payload1);
		expect(result1.success).to.be.true;

		const payload2 = {
			...validBase,
			broadcast: true,
			recipientEmployeeIds: [],
		};
		const result2 = CreateNotificationSchema.safeParse(payload2);
		expect(result2.success).to.be.true;
	});
});

describe("Notification Controller Broadcast Creation", () => {
	const orgId = "507f1f77bcf86cd799439011";

	function buildApp(prisma: any) {
		const app = express();
		const notificationController = controller(prisma);
		app.use(express.json());
		app.use((req, _res, next) => {
			(req as any).user = { id: "user-1" };
			next();
		});
		app.post("/api/notification", (req, res, next) =>
			notificationController.create(req, res, next),
		);
		return app;
	}

	it("resolves active employee IDs dynamically when broadcast is true", async () => {
		const prismaCalls: any[] = [];
		const activeEmployeesMock = [
			{ id: "emp-1" },
			{ id: "emp-2" },
			{ id: "emp-3" },
		];

		const prismaMock = {
			employee: {
				findMany: async (args: any) => {
					prismaCalls.push({ model: "employee", method: "findMany", args });
					return activeEmployeesMock;
				},
			},
			notification: {
				create: async (args: any) => {
					prismaCalls.push({ model: "notification", method: "create", args });
					return {
						id: "notif-1",
						createdAt: new Date(),
						updatedAt: new Date(),
						...args.data,
					};
				},
			},
		};

		const app = buildApp(prismaMock);

		const response = await request(app)
			.post("/api/notification")
			.send({
				organizationId: orgId,
				title: "Alert: Holiday Notice",
				description: "Office closed on Monday.",
				category: "ANNOUNCEMENT",
				type: "INFO",
				broadcast: true,
			})
			.expect(201);

		expect(response.body.status).to.equal("success");
		expect(prismaCalls).to.have.length(2);

		// Verify employee query
		const empQuery = prismaCalls[0];
		expect(empQuery.model).to.equal("employee");
		expect(empQuery.args.where.organizationId).to.equal(orgId);
		expect(empQuery.args.where.isDeleted).to.be.false;

		// Verify notification create payload
		const notifCreate = prismaCalls[1];
		expect(notifCreate.model).to.equal("notification");
		const recipients = notifCreate.args.data.recipients;
		expect(recipients.read).to.have.length(0);
		expect(recipients.unread).to.deep.equal([
			{ employeeId: "emp-1", readAt: null },
			{ employeeId: "emp-2", readAt: null },
			{ employeeId: "emp-3", readAt: null },
		]);
	});
});
