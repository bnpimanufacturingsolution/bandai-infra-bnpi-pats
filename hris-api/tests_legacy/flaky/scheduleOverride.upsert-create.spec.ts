import { expect } from "chai";
import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../generated/prisma";
import { controller } from "../app/scheduleOverride/scheduleOverride.controller";

describe("ScheduleOverride Controller Upsert Create", () => {
	const TEST_TIMEOUT = 5000;

	const basePayload = {
		organizationId: "507f1f77bcf86cd799439011",
		employeeId: "507f1f77bcf86cd799439012",
		date: "2026-04-13",
		shiftTypeId: "507f1f77bcf86cd799439013",
		reason: "Updated via test",
	};

	const baseRecord = {
		id: "507f1f77bcf86cd799439099",
		...basePayload,
		date: new Date("2026-04-13T00:00:00.000Z"),
		isDeleted: false,
		createdByEmployeeId: null as string | null,
		createdAt: new Date("2026-04-10T00:00:00.000Z"),
		updatedAt: new Date("2026-04-10T00:00:00.000Z"),
	};

	const buildReq = (body: Record<string, unknown>): Request =>
		({
			body,
			query: {},
			params: {},
			headers: {},
			socket: { remoteAddress: "127.0.0.1" },
			get: (header: string) => {
				if (header === "Content-Type") return "application/json";
				if (header === "User-Agent") return "test-agent";
				return undefined;
			},
			method: "POST",
			originalUrl: "/api/scheduleOverride",
		}) as unknown as Request;

	const buildRes = () => {
		let sentData: any;
		let statusCode = 200;
		const res = {
			status: (code: number) => {
				statusCode = code;
				return res;
			},
			json: (data: any) => {
				sentData = data;
				return res;
			},
		} as unknown as Response;
		return { res, getStatus: () => statusCode, getData: () => sentData };
	};

	it("returns 201 when creating a new override", async function () {
		this.timeout(TEST_TIMEOUT);
		let upsertArgs: any = null;
		const prismaMock: any = {
			scheduleOverride: {
				findUnique: async () => null,
				upsert: async (args: any) => {
					upsertArgs = args;
					return {
						...baseRecord,
						shiftTypeId: args.create.shiftTypeId,
						reason: args.create.reason,
						date: args.create.date,
					};
				},
			},
		};

		const sut = controller(prismaMock as PrismaClient);
		const { res, getStatus, getData } = buildRes();
		await sut.create(buildReq(basePayload), res, (() => {}) as NextFunction);

		expect(getStatus()).to.equal(201);
		expect(getData?.()).to.have.property("status", "success");
		expect(upsertArgs?.where?.organizationId_employeeId_date?.organizationId).to.equal(
			basePayload.organizationId,
		);
		expect(upsertArgs?.where?.organizationId_employeeId_date?.employeeId).to.equal(
			basePayload.employeeId,
		);
		const normalizedDate = upsertArgs?.where?.organizationId_employeeId_date?.date as Date;
		expect(normalizedDate).to.be.instanceOf(Date);
		expect(normalizedDate.toISOString()).to.equal("2026-04-13T00:00:00.000Z");
	});

	it("returns 200 when replacing an existing override on same day", async function () {
		this.timeout(TEST_TIMEOUT);
		const existing = { ...baseRecord, reason: "old reason" };
		const prismaMock: any = {
			scheduleOverride: {
				findUnique: async () => existing,
				upsert: async (args: any) => ({
					...existing,
					shiftTypeId: args.update.shiftTypeId,
					reason: args.update.reason,
					updatedAt: new Date("2026-04-13T08:00:00.000Z"),
				}),
			},
		};

		const sut = controller(prismaMock as PrismaClient);
		const { res, getStatus, getData } = buildRes();
		await sut.create(buildReq(basePayload), res, (() => {}) as NextFunction);

		expect(getStatus()).to.equal(200);
		expect(getData?.()).to.have.property("status", "success");
		expect(getData?.()?.data?.reason).to.equal(basePayload.reason);
	});

	it("returns 409 for duplicate constraint fallback", async function () {
		this.timeout(TEST_TIMEOUT);
		const prismaMock: any = {
			scheduleOverride: {
				findUnique: async () => null,
				upsert: async () => {
					const error = new Error("Unique constraint failed") as any;
					error.code = "P2002";
					throw error;
				},
			},
		};

		const sut = controller(prismaMock as PrismaClient);
		const { res, getStatus, getData } = buildRes();
		await sut.create(buildReq(basePayload), res, (() => {}) as NextFunction);

		expect(getStatus()).to.equal(409);
		expect(getData?.()).to.have.property("status", "error");
	});
});
