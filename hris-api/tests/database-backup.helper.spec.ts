import { expect } from "chai";
import fs from "fs";
import os from "os";
import path from "path";
import ExcelJS from "exceljs";
import { PrismaClient } from "../generated/prisma";
import {
	discoverPrismaModelsFromSchema,
	runDatabaseBackup,
	serializeBackupValue,
	toPrismaDelegateName,
} from "../helper/database-backup.helper";

const makeTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "hris-full-backup-"));

const readJson = (filePath: string) => JSON.parse(fs.readFileSync(filePath, "utf8"));

describe("database backup helper", () => {
	it("serializes rollback evidence values deterministically", () => {
		expect(serializeBackupValue(null)).to.equal(null);
		expect(serializeBackupValue(undefined)).to.equal(null);
		expect(serializeBackupValue(true)).to.equal(true);
		expect(serializeBackupValue(42)).to.equal(42);
		expect(serializeBackupValue(10n)).to.equal("10");
		expect(serializeBackupValue(new Date("2026-06-18T00:00:00.000Z"))).to.equal(
			"2026-06-18T00:00:00.000Z",
		);
		expect(serializeBackupValue({ z: 1, a: { b: false, a: "x" } })).to.equal(
			'{"a":{"a":"x","b":false},"z":1}',
		);
	});

	it("keeps every current Prisma schema model exportable through the generated client", async () => {
		const prisma = new PrismaClient();
		try {
			const models = discoverPrismaModelsFromSchema();
			const missingDelegates = models.filter(
				(model) => typeof (prisma as any)[model.delegateName]?.findMany !== "function",
			);
			const emptyFieldModels = models.filter((model) => model.fields.length === 0);

			expect(toPrismaDelegateName("SOALineItem")).to.equal("sOALineItem");
			expect(models).to.have.length(70);
			expect(missingDelegates).to.deep.equal([]);
			expect(emptyFieldModels).to.deep.equal([]);
		} finally {
			await prisma.$disconnect();
		}
	});

	it("writes pg_dump, NDJSON, XML, YAML, Excel, and manifest artifacts", async () => {
		const outputDir = makeTempDir();
		const models = [
			{
				modelName: "User",
				delegateName: "user",
				fields: ["id", "email", "metadata", "createdAt"],
			},
			{
				modelName: "Attendance",
				delegateName: "attendance",
				fields: ["id", "employeeId", "status", "timeIn"],
			},
		];
		const prisma = {
			user: {
				findMany: async ({ skip, take }: { skip: number; take: number }) =>
					[
						{
							id: "user-1",
							email: "user@example.com",
							metadata: { role: "admin" },
							createdAt: new Date("2026-06-18T00:00:00.000Z"),
						},
					].slice(skip, skip + take),
			},
			attendance: {
				findMany: async ({ skip, take }: { skip: number; take: number }) =>
					[
						{
							id: "attendance-1",
							employeeId: "employee-1",
							status: "PRESENT",
							timeIn: null,
						},
					].slice(skip, skip + take),
			},
		};

		const result = await runDatabaseBackup({
			prisma,
			models,
			outputDir,
			runId: "2026-06-18T000000+0800",
			now: new Date("2026-06-17T16:00:00.000Z"),
			timezone: "Asia/Manila",
			pageSize: 1,
			pgDump: {
				enabled: true,
				command: process.execPath,
				args: ["-e", "process.stdout.write('PGDUMP')"],
			},
		});

		expect(result.manifest.status).to.equal("success");
		expect(result.manifest.totalRows).to.equal(2);
		expect(fs.existsSync(path.join(result.runDir, "hris-postgres.dump"))).to.equal(true);
		expect(fs.existsSync(path.join(result.runDir, "json", "User.ndjson"))).to.equal(true);
		expect(fs.existsSync(path.join(result.runDir, "xml", "User.xml"))).to.equal(true);
		expect(fs.existsSync(path.join(result.runDir, "yaml", "User.yml"))).to.equal(true);
		expect(fs.existsSync(path.join(result.runDir, "excel", "hris-readable.xlsx"))).to.equal(true);
		expect(fs.existsSync(path.join(result.runDir, "manifest.json"))).to.equal(true);

		const ndjson = fs.readFileSync(path.join(result.runDir, "json", "User.ndjson"), "utf8");
		expect(ndjson).to.contain('"__model":"User"');
		const xml = fs.readFileSync(path.join(result.runDir, "xml", "Attendance.xml"), "utf8");
		expect(xml).to.contain('<field name="timeIn" null="true" />');
		const manifest = readJson(path.join(result.runDir, "manifest.json"));
		expect(manifest.artifacts.some((artifact: any) => artifact.type === "pg_dump")).to.equal(true);
		expect(manifest.artifacts.every((artifact: any) => artifact.sha256)).to.equal(true);

		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.readFile(path.join(result.runDir, "excel", "hris-readable.xlsx"));
		expect(Boolean(workbook.getWorksheet("User"))).to.equal(true);
		expect(Boolean(workbook.getWorksheet("Attendance"))).to.equal(true);
	});

	it("keeps daily full snapshots: 100 users on day 1 and 300 users on day 2 without changing day 1", async () => {
		const outputDir = makeTempDir();
		const models = [
			{
				modelName: "User",
				delegateName: "user",
				fields: ["id", "email", "createdAt"],
			},
		];
		const day1Users = Array.from({ length: 100 }, (_, index) => ({
			id: `user-${index + 1}`,
			email: `user${index + 1}@example.com`,
			createdAt: new Date("2026-06-18T00:00:00.000Z"),
		}));
		const day2Users = [
			...day1Users,
			...Array.from({ length: 200 }, (_, index) => ({
				id: `user-${index + 101}`,
				email: `user${index + 101}@example.com`,
				createdAt: new Date("2026-06-19T00:00:00.000Z"),
			})),
		];
		const makePrisma = (rows: any[]) => ({
			user: {
				findMany: async ({ skip, take }: { skip: number; take: number }) =>
					rows.slice(skip, skip + take),
			},
		});

		const day1 = await runDatabaseBackup({
			prisma: makePrisma(day1Users),
			models,
			outputDir,
			runId: "2026-06-18T000000+0800",
			formats: ["ndjson", "excel"],
			pgDump: { enabled: false },
			pageSize: 33,
		});
		const day1JsonPath = path.join(day1.runDir, "json", "User.ndjson");
		const day1ExcelPath = path.join(day1.runDir, "excel", "hris-readable.xlsx");
		const day1JsonBefore = fs.readFileSync(day1JsonPath, "utf8");
		const day1ExcelSizeBefore = fs.statSync(day1ExcelPath).size;

		const day2 = await runDatabaseBackup({
			prisma: makePrisma(day2Users),
			models,
			outputDir,
			runId: "2026-06-19T000000+0800",
			formats: ["ndjson", "excel"],
			pgDump: { enabled: false },
			pageSize: 33,
		});

		const day1Rows = fs
			.readFileSync(day1JsonPath, "utf8")
			.trim()
			.split("\n")
			.filter(Boolean);
		const day2Rows = fs
			.readFileSync(path.join(day2.runDir, "json", "User.ndjson"), "utf8")
			.trim()
			.split("\n")
			.filter(Boolean);
		expect(day1Rows).to.have.length(100);
		expect(day2Rows).to.have.length(300);
		expect(fs.readFileSync(day1JsonPath, "utf8")).to.equal(day1JsonBefore);
		expect(fs.statSync(day1ExcelPath).size).to.equal(day1ExcelSizeBefore);
		expect(day1.manifest.rowCounts.User).to.equal(100);
		expect(day2.manifest.rowCounts.User).to.equal(300);
	});

	it("does not create a completed manifest when backup fails", async () => {
		const outputDir = makeTempDir();

		try {
			await runDatabaseBackup({
				prisma: {
					user: {
						findMany: async () => [{ id: "user-1" }],
					},
				},
				models: [{ modelName: "User", delegateName: "user", fields: ["id"] }],
				outputDir,
				runId: "failed-run",
				pgDump: {
					enabled: true,
					command: process.execPath,
					args: ["-e", "process.exit(2)"],
				},
			});
			throw new Error("Expected backup to fail");
		} catch (error) {
			expect(error).to.be.instanceOf(Error);
		}

		expect(fs.existsSync(path.join(outputDir, "failed-run", "manifest.json"))).to.equal(false);
		expect(fs.existsSync(path.join(outputDir, "failed-run", "manifest.failed.json"))).to.equal(
			true,
		);
	});
});
