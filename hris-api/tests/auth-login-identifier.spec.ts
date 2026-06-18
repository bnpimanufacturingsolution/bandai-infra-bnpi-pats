import { strict as assert } from "assert";
import { resolveLocalLoginUserByIdentifier } from "../app/auth/auth.controller";

const buildPrisma = () => {
	const users = [
		{
			id: "user-hr",
			email: "hr-manager@seed.local",
			password: "hashed",
			status: "active",
			isDeleted: false,
		},
		{
			id: "user-employee",
			email: "employee@seed.local",
			password: "hashed",
			status: "active",
			isDeleted: false,
		},
		{
			id: "user-person-email",
			email: "old.email@seed.local",
			password: "hashed",
			status: "active",
			isDeleted: false,
		},
	];
	const persons = [
		{
			id: "person-employee",
			userId: "user-employee",
			isDeleted: false,
			contactInfo: { email: "employee@seed.local" },
		},
		{
			id: "person-contact-email",
			userId: "user-person-email",
			isDeleted: false,
			contactInfo: { email: "current.contact@seed.local" },
		},
	];
	const employees = [
		{
			id: "emp-hr",
			employeeId: "EMP-HR-MGR-001",
			personId: "person-hr",
			userId: "user-hr",
			isDeleted: false,
		},
		{
			id: "emp-employee",
			employeeId: "EMP-SW-DEV-001",
			personId: "person-employee",
			userId: "user-employee",
			isDeleted: false,
		},
		{
			id: "emp-contact-email",
			employeeId: "EMP-CONTACT-001",
			personId: "person-contact-email",
			userId: "user-person-email",
			isDeleted: false,
		},
		{
			id: "emp-unlinked",
			employeeId: "EMP-NO-USER-001",
			personId: "person-unlinked",
			userId: null,
			isDeleted: false,
		},
	];

	return {
		user: {
			findFirst: async ({ where }: any) => {
				const match = users.find((user) => {
					if (where.id && user.id !== where.id) return false;
					if (where.email && user.email !== where.email) return false;
					if (where.isDeleted !== undefined && user.isDeleted !== where.isDeleted) return false;
					return true;
				});
				return match || null;
			},
		},
		person: {
			findMany: async ({ where }: any) =>
				persons.filter((person) => {
					if (where.isDeleted !== undefined && person.isDeleted !== where.isDeleted) return false;
					return true;
				}),
		},
		employee: {
			findFirst: async ({ where }: any) => {
				const personIds = Array.isArray(where.personId?.in) ? where.personId.in : null;
				const match = employees.find((employee) => {
					if (where.employeeId && employee.employeeId !== where.employeeId) return false;
					if (where.isDeleted !== undefined && employee.isDeleted !== where.isDeleted) return false;
					if (personIds && !personIds.includes(employee.personId)) return false;
					if (where.userId?.not === null && !employee.userId) return false;
					return true;
				});
				return match ? { userId: match.userId } : null;
			},
		},
	} as any;
};

describe("auth login identifier resolver", () => {
	it("resolves existing users directly by email", async () => {
		const user = await resolveLocalLoginUserByIdentifier(
			buildPrisma(),
			"hr-manager@seed.local",
		);

		assert.equal(user?.id, "user-hr");
	});

	it("resolves employee ID through the linked employee user", async () => {
		const user = await resolveLocalLoginUserByIdentifier(
			buildPrisma(),
			"EMP-SW-DEV-001",
		);

		assert.equal(user?.id, "user-employee");
	});

	it("falls back from person contact email to the linked employee user", async () => {
		const user = await resolveLocalLoginUserByIdentifier(
			buildPrisma(),
			"current.contact@seed.local",
		);

		assert.equal(user?.id, "user-person-email");
	});

	it("does not resolve employee IDs that have no linked user account", async () => {
		const user = await resolveLocalLoginUserByIdentifier(
			buildPrisma(),
			"EMP-NO-USER-001",
		);

		assert.equal(user, null);
	});
});
