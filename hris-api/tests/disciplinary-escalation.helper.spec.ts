import { expect } from "chai";
import {
	resolveAbsenceSeverity,
	escalateSeverity,
	clusterEvidencedAbsentDays,
	buildAutoEvaluateProposals,
	buildAutoEvaluateProposalKey,
	DISCIPLINARY_AUTO_OFFENSE_TYPE,
} from "../helper/disciplinary-escalation.helper";

describe("disciplinary auto-escalation helper", () => {
	it("maps absent day counts to the accepted severity matrix", () => {
		expect(resolveAbsenceSeverity(1)).to.equal("LOW");
		expect(resolveAbsenceSeverity(2)).to.equal("MEDIUM");
		expect(resolveAbsenceSeverity(3)).to.equal("HIGH");
		expect(resolveAbsenceSeverity(7)).to.equal("HIGH");
	});

	it("escalates severity by prior attempts and caps at HIGH", () => {
		expect(escalateSeverity("LOW", 0)).to.equal("LOW");
		expect(escalateSeverity("LOW", 1)).to.equal("MEDIUM");
		expect(escalateSeverity("LOW", 2)).to.equal("HIGH");
		expect(escalateSeverity("HIGH", 1)).to.equal("HIGH");
		expect(escalateSeverity("MEDIUM", 5)).to.equal("HIGH");
	});

	it("clusters consecutive absence days including Sunday rest into one occurrence", () => {
		const clusters = clusterEvidencedAbsentDays([
			{ code: "00010", date: "2026-08-14" },
			{ code: "00010", date: "2026-08-15" },
			{ code: "00010", date: "2026-08-17" },
			{ code: "00010", date: "2026-08-21" },
		]);

		expect(clusters).to.have.lengthOf(2);
		expect(clusters[0]).to.deep.include({ code: "00010", start: "2026-08-14", end: "2026-08-17", days: 3 });
		expect(clusters[1]).to.deep.include({ code: "00010", start: "2026-08-21", end: "2026-08-21", days: 1 });
	});

	it("keeps different employees in separate clusters", () => {
		const clusters = clusterEvidencedAbsentDays([
			{ code: "00010", date: "2026-08-14" },
			{ code: "01515", date: "2026-08-14" },
		]);

		expect(clusters).to.have.lengthOf(2);
		expect(clusters.map((c) => c.code).sort()).to.deep.equal(["00010", "01515"]);
	});

	it("builds one DRAFT proposal per occurrence with escalation metadata", () => {
		const proposals = buildAutoEvaluateProposals({
			evidencedAbsentRows: [
				{ code: "00010", date: "2026-08-14" },
				{ code: "00010", date: "2026-08-15" },
				{ code: "00010", date: "2026-08-17" },
				{ code: "01515", date: "2026-08-14" },
			],
			employeeIdByCode: new Map([
				["00010", { id: "emp-zen", name: "Zen Andrei" }],
				["01515", { id: "emp-peer", name: "Peer Employee" }],
			]),
			priorAttemptsByCode: new Map([["00010", 2]]),
		});

		expect(proposals).to.have.lengthOf(2);

		const zen = proposals.find((p) => p.employeeCode === "00010");
		expect(zen).to.exist;
		expect(zen!.employeeId).to.equal("emp-zen");
		expect(zen!.absentDays).to.equal(3);
		expect(zen!.baseSeverity).to.equal("HIGH");
		expect(zen!.priorAttempts).to.equal(2);
		expect(zen!.severity).to.equal("HIGH");
		expect(zen!.status).to.equal("DRAFT");
		expect(zen!.offenseType).to.equal(DISCIPLINARY_AUTO_OFFENSE_TYPE);
		expect(zen!.occurrenceWindow).to.deep.equal({ start: "2026-08-14", end: "2026-08-17" });
		expect(zen!.dedupKey).to.equal(
			buildAutoEvaluateProposalKey("00010", { start: "2026-08-14", end: "2026-08-17" }),
		);

		const peer = proposals.find((p) => p.employeeCode === "01515");
		expect(peer).to.exist;
		expect(peer!.absentDays).to.equal(1);
		expect(peer!.baseSeverity).to.equal("LOW");
		expect(peer!.priorAttempts).to.equal(0);
		expect(peer!.severity).to.equal("LOW");
	});

	it("skips codes without a resolvable employee id", () => {
		const proposals = buildAutoEvaluateProposals({
			evidencedAbsentRows: [{ code: "99999", date: "2026-08-14" }],
			employeeIdByCode: new Map(),
			priorAttemptsByCode: new Map(),
		});

		expect(proposals).to.be.empty;
	});
});
