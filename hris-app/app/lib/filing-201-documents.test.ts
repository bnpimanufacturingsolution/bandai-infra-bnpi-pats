import { describe, expect, it } from "vitest";
import {
	buildFiling201Checklist,
	summarizeFiling201,
} from "./filing-201-documents";

describe("filing-201-documents", () => {
	it("marks required items missing when no documents exist", () => {
		const rows = buildFiling201Checklist([]);
		expect(rows.length).to.be.greaterThan(0);
		const required = rows.filter((row) => row.required);
		expect(required.length).to.be.greaterThan(0);
		for (const row of required) {
			expect(row.status).to.equal("MISSING");
		}
	});

	it("matches uploaded document types case-insensitively and keeps the newest upload", () => {
		const rows = buildFiling201Checklist([
			{ type: "TIN_ID", createdAt: "2026-01-01T00:00:00Z" },
			{ type: "tin_id", createdAt: "2026-05-01T00:00:00Z" },
			{ type: "contract", createdAt: "2026-02-02T00:00:00Z" },
		]);
		const tin = rows.find((row) => row.type === "tin_id");
		expect(tin?.status).to.equal("UPLOADED");
		expect(tin?.count).to.equal(2);
		expect(tin?.lastUploadedAt).to.equal("2026-05-01T00:00:00Z");
	});

	it("treats optional requirements as non-blocking", () => {
		const rows = buildFiling201Checklist([]);
		const marriage = rows.find((row) => row.type === "marriage_certificate");
		expect(marriage?.required).to.equal(false);
		expect(marriage?.status).to.equal("MISSING");
		const summary = summarizeFiling201(rows);
		expect(summary.requiredMissing).to.equal(
			rows.filter((row) => row.required && row.status === "MISSING").length,
		);
	});
});
