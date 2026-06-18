import { expect } from "chai";
import {
	APPROVED_DB_FAULT_DATABASE_NAME,
	APPROVED_DB_FAULT_PORT,
	resolveIsolatedDbFaultTestConfig,
} from "../support/isolated-db-fault.guard";

const approvedUrl = `postgresql://postgres:postgres@localhost:${APPROVED_DB_FAULT_PORT}/${APPROVED_DB_FAULT_DATABASE_NAME}`;

describe("isolated DB fault-test guard", () => {
	it("blocks fault tests unless explicitly enabled", () => {
		const result = resolveIsolatedDbFaultTestConfig({
			ISOLATED_TEST_DATABASE_URL: approvedUrl,
		});

		expect(result.allowed).to.equal(false);
		expect(result.reason).to.contain("ALLOW_DB_FAULT_TESTS=true");
	});

	it("blocks enabled runs when the isolated database URL is missing", () => {
		const result = resolveIsolatedDbFaultTestConfig({
			ALLOW_DB_FAULT_TESTS: "true",
		});

		expect(result.allowed).to.equal(false);
		expect(result.reason).to.contain("ISOLATED_TEST_DATABASE_URL");
	});

	it("blocks invalid database URLs before any database client can connect", () => {
		const result = resolveIsolatedDbFaultTestConfig({
			ALLOW_DB_FAULT_TESTS: "true",
			ISOLATED_TEST_DATABASE_URL: "not a url",
		});

		expect(result.allowed).to.equal(false);
		expect(result.reason).to.contain("valid database URL");
	});

	it("blocks non-Postgres URLs", () => {
		const result = resolveIsolatedDbFaultTestConfig({
			ALLOW_DB_FAULT_TESTS: "true",
			ISOLATED_TEST_DATABASE_URL: `mongodb://localhost:${APPROVED_DB_FAULT_PORT}/${APPROVED_DB_FAULT_DATABASE_NAME}`,
		});

		expect(result.allowed).to.equal(false);
		expect(result.reason).to.contain("PostgreSQL URL");
	});

	it("blocks database URLs without a database name", () => {
		const result = resolveIsolatedDbFaultTestConfig({
			ALLOW_DB_FAULT_TESTS: "true",
			ISOLATED_TEST_DATABASE_URL: `postgresql://postgres:postgres@localhost:${APPROVED_DB_FAULT_PORT}`,
		});

		expect(result.allowed).to.equal(false);
		expect(result.reason).to.contain("database name");
	});

	it("allows only the approved localhost database and port", () => {
		const result = resolveIsolatedDbFaultTestConfig({
			ALLOW_DB_FAULT_TESTS: "true",
			DB_FAULT_TEST_SCHEMA: "fault_test_run_1",
			ISOLATED_TEST_DATABASE_URL: approvedUrl,
		});

		expect(result).to.deep.equal({
			allowed: true,
			databaseName: APPROVED_DB_FAULT_DATABASE_NAME,
			hostname: "localhost",
			port: APPROVED_DB_FAULT_PORT,
			reason: "ISOLATED_DB_FAULT_TESTS_ENABLED",
			schemaName: "fault_test_run_1",
			url: approvedUrl,
		});
	});

	it("allows only the approved 127.0.0.1 database and port", () => {
		const url = `postgresql://postgres:postgres@127.0.0.1:${APPROVED_DB_FAULT_PORT}/${APPROVED_DB_FAULT_DATABASE_NAME}`;
		const result = resolveIsolatedDbFaultTestConfig({
			ALLOW_DB_FAULT_TESTS: "true",
			ISOLATED_TEST_DATABASE_URL: url,
		});

		expect(result.allowed).to.equal(true);
		if (result.allowed) {
			expect(result.hostname).to.equal("127.0.0.1");
			expect(result.databaseName).to.equal(APPROVED_DB_FAULT_DATABASE_NAME);
			expect(result.port).to.equal(APPROVED_DB_FAULT_PORT);
		}
	});

	it("blocks hris-new even on localhost", () => {
		const result = resolveIsolatedDbFaultTestConfig({
			ALLOW_DB_FAULT_TESTS: "true",
			ISOLATED_TEST_DATABASE_URL: `postgresql://postgres:postgres@localhost:${APPROVED_DB_FAULT_PORT}/hris-new`,
		});

		expect(result.allowed).to.equal(false);
		expect(result.reason).to.contain(APPROVED_DB_FAULT_DATABASE_NAME);
	});

	it("blocks hris even on localhost", () => {
		const result = resolveIsolatedDbFaultTestConfig({
			ALLOW_DB_FAULT_TESTS: "true",
			ISOLATED_TEST_DATABASE_URL: `postgresql://postgres:postgres@localhost:${APPROVED_DB_FAULT_PORT}/hris`,
		});

		expect(result.allowed).to.equal(false);
		expect(result.reason).to.contain(APPROVED_DB_FAULT_DATABASE_NAME);
	});

	it("blocks wildcard test-looking database names", () => {
		const result = resolveIsolatedDbFaultTestConfig({
			ALLOW_DB_FAULT_TESTS: "true",
			ISOLATED_TEST_DATABASE_URL: `postgresql://postgres:postgres@localhost:${APPROVED_DB_FAULT_PORT}/hris_other_test`,
		});

		expect(result.allowed).to.equal(false);
		expect(result.reason).to.contain(APPROVED_DB_FAULT_DATABASE_NAME);
	});

	it("blocks remote hosts even when the database name is approved", () => {
		const result = resolveIsolatedDbFaultTestConfig({
			ALLOW_DB_FAULT_TESTS: "true",
			ALLOW_REMOTE_ISOLATED_TEST_DATABASE: "true",
			ISOLATED_TEST_DATABASE_APPROVAL: "approved",
			ISOLATED_TEST_DATABASE_URL: `postgresql://postgres:postgres@db.example.internal:${APPROVED_DB_FAULT_PORT}/${APPROVED_DB_FAULT_DATABASE_NAME}`,
		});

		expect(result.allowed).to.equal(false);
		expect(result.reason).to.contain("localhost");
	});

	it("blocks local Postgres ports other than the approved fault-test port", () => {
		const result = resolveIsolatedDbFaultTestConfig({
			ALLOW_DB_FAULT_TESTS: "true",
			ISOLATED_TEST_DATABASE_URL: `postgresql://postgres:postgres@localhost:5432/${APPROVED_DB_FAULT_DATABASE_NAME}`,
		});

		expect(result.allowed).to.equal(false);
		expect(result.reason).to.contain(APPROVED_DB_FAULT_PORT);
	});

	it("blocks explicit fault-test schema names that look shared or production-like", () => {
		const result = resolveIsolatedDbFaultTestConfig({
			ALLOW_DB_FAULT_TESTS: "true",
			DB_FAULT_TEST_SCHEMA: "production",
			ISOLATED_TEST_DATABASE_URL: approvedUrl,
		});

		expect(result.allowed).to.equal(false);
		expect(result.reason).to.contain("schema");
		expect(result.reason).to.contain("shared or production-like");
	});

	it("uses the database URL schema query when no explicit test schema is set", () => {
		const result = resolveIsolatedDbFaultTestConfig({
			ALLOW_DB_FAULT_TESTS: "true",
			ISOLATED_TEST_DATABASE_URL: `${approvedUrl}?schema=fault_run_2`,
		});

		expect(result.allowed).to.equal(true);
		if (result.allowed) {
			expect(result.schemaName).to.equal("fault_run_2");
		}
	});
});
