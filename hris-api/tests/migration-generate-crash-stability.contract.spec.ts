/**
 * Regression pins for the 2026-09-14 DEV payroll-run stability crashes:
 * 1. index.ts must NOT process.exit on unhandledRejection (a transient
 *    Prisma P1001 DB-forward flap killed the API mid-DM4/payroll, 3x).
 * 2. Both DM4.3 approved-overtime repair spawns (apply + verification)
 *    must run the .ts script through the tsx CLI — the verification spawn
 *    shipped without it and failed the run with ERR_UNKNOWN_FILE_EXTENSION.
 */
import { expect } from "chai";
import fs from "fs";
import path from "path";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf8");

describe("generate-crash stability pins (2026-09-14)", () => {
	const indexSrc = read("index.ts");
	const adapterSrc = read("app/migration/dm4-migration.adapter.ts");

	it("index.ts unhandledRejection handler does not exit the process", () => {
		const handler = indexSrc.slice(
			indexSrc.indexOf(`process.on("unhandledRejection"`),
			indexSrc.indexOf("function getLocalIPAddress"),
		);
		expect(handler).to.include(`logger.error("process.unhandled_rejection"`);
		expect(handler).to.not.include("process.exit");
	});

	it("uncaughtException handler still exits (sync crashes remain fatal)", () => {
		const handler = indexSrc.slice(
			indexSrc.indexOf(`process.on("uncaughtException"`),
			indexSrc.indexOf(`process.on("unhandledRejection"`),
		);
		expect(handler).to.include("process.exit(1)");
	});

	it("both DM4.3 repair spawns include the tsx CLI", () => {
		// apply + verification spawn blocks (spawn(process.execPath, [...]))
		const spawns = adapterSrc.match(/spawn\(\s*process\.execPath,\s*\[[^\]]*\]/g) || [];
		const repairSpawns = spawns.filter((s) => s.includes("tsxCliPath") && s.includes("script"));
		expect(repairSpawns.length, "both apply and verification spawns must route .ts through tsx cli").to.be.at.least(2);
	});

	it("migration event appends are guarded (flap must not kill workers)", () => {
		const src = read("app/migration/migration-event.service.ts");
		expect(src).to.include("console.warn(");
		expect(src).to.match(/async append\([\s\S]*?try \{[\s\S]*?migrationRunEvent\.aggregate/);
	});
});
