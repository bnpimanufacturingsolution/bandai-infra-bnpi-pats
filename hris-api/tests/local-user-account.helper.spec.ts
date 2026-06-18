import { expect } from "chai";
import {
	buildSafeUserName,
	DEFAULT_MIGRATION_PASSWORD,
	ensureLocalUserAccount,
	resolveMigrationDefaultPassword,
} from "../helper/local-user-account.helper";

describe("local user account helper", () => {
	it("creates and then reuses a local user account without duplicating rows", async () => {
		const users: any[] = [];
		const prisma = {
			user: {
				findFirst: async (args: any) => {
					const where = args?.where || {};
					if (where.id) {
						const match = users.find((user) => user.id === where.id && user.isDeleted === false);
						return match ? { id: match.id } : null;
					}
					const match = users.find(
						(user) =>
							(where.OR || []).some(
								(condition: any) =>
									(condition.email && condition.email === user.email) ||
									(condition.userName && condition.userName === user.userName),
							),
					);
					return match ? { id: match.id } : null;
				},
				create: async (args: any) => {
					const created = {
						id: `user-${users.length + 1}`,
						isDeleted: false,
						...args.data,
					};
					users.push(created);
					return { id: created.id };
				},
				update: async (args: any) => {
					const index = users.findIndex((user) => user.id === args.where.id);
					users[index] = { ...users[index], ...args.data };
					return users[index];
				},
			},
		} as any;

		const created = await ensureLocalUserAccount({
			prisma,
			email: "employee1@example.com",
			userName: buildSafeUserName({
				email: "employee1@example.com",
				firstName: "Employee",
				lastName: "One",
			}),
			password: DEFAULT_MIGRATION_PASSWORD,
			role: "hris-employee",
			organizationId: "org-1",
		});

		expect(created.created).to.equal(true);
		expect(users).to.have.length(1);
		expect(users[0].role).to.equal("hris-employee");
		expect(users[0].password).to.be.a("string");
		expect(users[0].password).to.not.equal(DEFAULT_MIGRATION_PASSWORD);

		const reused = await ensureLocalUserAccount({
			prisma,
			email: "employee1@example.com",
			userName: created.userName,
			password: "DifferentPass123!",
			role: "hris-employee",
			organizationId: "org-1",
			existingUserId: created.userId,
		});

		expect(reused.created).to.equal(false);
		expect(reused.userId).to.equal(created.userId);
		expect(users).to.have.length(1);
		expect(users[0].email).to.equal("employee1@example.com");
		expect(users[0].metadata).to.deep.include({
			requirePasswordChange: true,
			isFirstLogin: true,
		});
	});

	it("uses the migration password override when present", () => {
		const original = process.env.MIGRATION_DEFAULT_PASSWORD;
		process.env.MIGRATION_DEFAULT_PASSWORD = "OverridePass123!";
		try {
			expect(resolveMigrationDefaultPassword()).to.equal("OverridePass123!");
		} finally {
			if (typeof original === "string") process.env.MIGRATION_DEFAULT_PASSWORD = original;
			else delete process.env.MIGRATION_DEFAULT_PASSWORD;
		}
	});
});
