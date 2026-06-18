import { expect } from "chai";
import {
	assertSafeMigrationExecution,
	inspectMigrationDatabaseTarget,
	MIGRATION_SCRIPT_SAFETY_REGISTRY,
	resolveExecutionMode,
	summarizeIdempotentBackfillRun,
} from "../scripts/migration/script-safety";

describe("migration script safety helpers", () => {
	it("defaults high-risk scripts to dry-run mode unless execute is explicit", () => {
		expect(resolveExecutionMode([], {}).execute).to.equal(false);
		expect(resolveExecutionMode([], {}).dryRun).to.equal(true);
		expect(resolveExecutionMode([], {}).source).to.equal("default");
	});

	it("honors explicit argv execute and dry-run flags", () => {
		expect(resolveExecutionMode(["--execute"], {}).execute).to.equal(true);
		expect(resolveExecutionMode(["--execute=true"], {}).execute).to.equal(true);
		expect(resolveExecutionMode(["--dry-run"], {}).execute).to.equal(false);
		expect(resolveExecutionMode(["--execute=false"], {}).execute).to.equal(false);
	});

	it("honors npm and migration env execute flags when argv is absent", () => {
		expect(resolveExecutionMode([], { npm_config_execute: "true" }).execute).to.equal(true);
		expect(resolveExecutionMode([], { MIGRATION_EXECUTE: "true" }).execute).to.equal(true);
		expect(resolveExecutionMode([], { MIGRATION_DRY_RUN: "true" }).execute).to.equal(false);
	});

	it("rejects remote database targets for execute mode", () => {
		const safety = inspectMigrationDatabaseTarget("postgresql://user:pass@db.example.com:5432/hris_test");

		expect(safety.allowed).to.equal(false);
		expect(safety.reason).to.include("localhost");
	});

	it("rejects local shared or production-like database names", () => {
		for (const dbName of ["hris", "hris-new", "hris_dev", "hris_uat", "hris_production"]) {
			const safety = inspectMigrationDatabaseTarget(`postgresql://user:pass@localhost:55432/${dbName}`);
			expect(safety.allowed, dbName).to.equal(false);
		}
	});

	it("accepts explicitly local isolated test targets", () => {
		const postgres = inspectMigrationDatabaseTarget("postgresql://user:pass@127.0.0.1:55432/hris_fault_test");
		const mongo = inspectMigrationDatabaseTarget("mongodb://127.0.0.1:27017/hris_migration_test");

		expect(postgres.allowed).to.equal(true);
		expect(postgres.databaseName).to.equal("hris_fault_test");
		expect(mongo.allowed).to.equal(true);
		expect(mongo.databaseName).to.equal("hris_migration_test");
	});

	it("throws before execute mode can target unsafe databases", () => {
		expect(() =>
			assertSafeMigrationExecution({
				scriptName: "unsafe-test",
				execute: true,
				databaseTargets: [
					{ label: "DATABASE_URL", url: "postgresql://user:pass@localhost:5432/hris" },
				],
			}),
		).to.throw(/unsafe-test: unsafe DATABASE_URL/);
	});

	it("allows a mutating Postgres-only repair to validate the active PG target without inherited legacy URLs", () => {
		expect(() =>
			assertSafeMigrationExecution({
				scriptName: "postgres-repair-test",
				execute: true,
				databaseTargets: [
					{
						label: "PG_DATABASE_URL",
						url: "postgresql://user:pass@localhost:55432/hris_dm4_e2e_test",
					},
				],
			}),
		).to.not.throw();
	});

	it("does not require database targets for dry-run mode", () => {
		expect(() =>
			assertSafeMigrationExecution({
				scriptName: "dry-run-test",
				execute: false,
				databaseTargets: [],
			}),
		).to.not.throw();
	});

	it("keeps every audited high-risk migration/backfill script registered", () => {
		const registered = new Set(MIGRATION_SCRIPT_SAFETY_REGISTRY.map((entry) => entry.scriptPath));
		const expected = [
			"scripts/materialize-computed-attendance.ts",
			"scripts/backfill-timesheet-lines.ts",
			"scripts/migrate-attendance-schedule.ts",
			"scripts/migrate-attendance-status-and-flags.ts",
			"scripts/migrate-attendance-undertime-status.ts",
			"scripts/migrate-timesheet-codes.ts",
			"scripts/migration/mongo-to-postgres-backfill.ts",
			"scripts/migration/mongo-postgres-parity.ts",
			"scripts/qa-migration-post-actions.ts",
			"scripts/backfill-employee-documents.ts",
			"scripts/backfill-applicant-assigned-hr.ts",
			"scripts/audit-dm3-opening-leave-balances.ts",
		];

		for (const scriptPath of expected) {
			expect(registered.has(scriptPath), scriptPath).to.equal(true);
		}
	});

	it("requires explicit execute and target guards for mutating registered scripts", () => {
		const mutating = MIGRATION_SCRIPT_SAFETY_REGISTRY.filter((entry) => entry.mutatesData);

		expect(mutating.length).to.be.greaterThan(0);
		for (const entry of mutating) {
			expect(entry.requiresExplicitExecute, entry.scriptPath).to.equal(true);
			expect(entry.requiresTargetGuard, entry.scriptPath).to.equal(true);
		}
	});

	it("marks idempotent reruns only when no writes or failures remain", () => {
		expect(
			summarizeIdempotentBackfillRun({
				scanned: 10,
				created: 0,
				updated: 0,
				skippedExisting: 10,
				failures: 0,
				dryRun: false,
			}).idempotentRerunExpected,
		).to.equal(true);

		expect(
			summarizeIdempotentBackfillRun({
				scanned: 10,
				created: 2,
				updated: 0,
				skippedExisting: 8,
				failures: 0,
				dryRun: false,
			}).idempotentRerunExpected,
		).to.equal(false);
	});
});
