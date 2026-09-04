/* eslint-disable no-console */
/**
 * Disciplinary rules seeder — company rulebook template.
 *
 * Seeds the `Rule` catalog with a standard progressive-discipline rulebook
 * grounded in PH Labor Code just causes (Art. 297) and the DOLE two-notice
 * due-process convention, following the 5-step progressive ladder
 * (coaching -> verbal warning -> written warning -> suspension -> dismissal).
 *
 * TEMPLATE STATUS: these rows are an industry-standard draft for operator
 * review — they become BNPI official policy only after the operator edits and
 * confirms them (NEEDS_CONFIRMATION in docs/00-product/DISCIPLINARY-AUTO-ESCALATION.md).
 *
 * Idempotent: upserts by the unique `code`. Safe to re-run.
 * Dry-run default: `--execute` writes.
 */

import { PrismaClient } from "../../generated/prisma";

const prisma = new PrismaClient();

type RuleSeed = {
	code: string;
	title: string;
	category:
		| "ATTENDANCE"
		| "BEHAVIOR"
		| "PERFORMANCE"
		| "SAFETY"
		| "POLICY_VIOLATION"
		| "MISCONDUCT"
		| "HARASSMENT"
		| "DRESS_CODE"
		| "PUNCTUALITY"
		| "OTHER";
	severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
	description: string;
	consequences: string;
};

/**
 * Standard progressive-discipline next-step plan per severity tier.
 * Grounded in SHRM/AIHR progressive-discipline practice + PH Labor Code
 * twin-notice due process (Art. 277(b)/292(b), Agabon v. NLRC 2004):
 *  - NTE (notice to explain) common-practice response window: 5 calendar days
 *  - hearing with counsel/representative before any dismissal-grade decision
 *  - CRITICAL requires management/legal escalation before Notice of Decision.
 */
const consequencePlanForSeverity = (
	severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
): Record<string, unknown> => {
	switch (severity) {
		case "LOW":
			return {
				LOW: {
					action: "Verbal counseling / documented coaching",
					employeeStep:
						"Attend coaching with immediate supervisor and acknowledge expectations; correct the behavior immediately.",
					managerStep:
						"Conduct private counseling, document outcome in the supervisory file, inform HR.",
					responseWindowDays: 0,
				},
			};
		case "MEDIUM":
			return {
				MEDIUM: {
					action: "Written warning + counseling",
					employeeStep:
						"Receive and sign the written warning; submit a written explanation or rebuttal within 5 calendar days.",
					managerStep:
						"Issue the written warning with HR, secure employee acknowledgment, file in the 201 record.",
					responseWindowDays: 5,
				},
			};
		case "HIGH":
			return {
				HIGH: {
					action: "Final written warning / suspension + notice to explain",
					employeeStep:
						"Respond to the Notice to Explain in writing within 5 calendar days and attend the administrative hearing; you may bring a representative.",
					managerStep:
						"Lead the investigation with HR, serve the NTE, schedule the hearing, recommend the suspension/decision.",
					responseWindowDays: 5,
				},
			};
		case "CRITICAL":
		default:
			return {
				CRITICAL: {
					action: "Termination process (twin-notice) with management escalation",
					employeeStep:
						"Respond to the Notice to Explain in writing within 5 calendar days and attend the administrative hearing with counsel/representative of choice.",
					managerStep:
						"Escalate to HR + management (+ legal where applicable); run the two-notice due process (NTE, hearing, Notice of Decision); termination decision requires management approval.",
					responseWindowDays: 5,
				},
			};
	}
};

const ORG_ENV = process.env.DISCIPLINARY_RULES_ORGANIZATION_ID || "";
if (!ORG_ENV) {
	console.error(
		"[disciplinary-rules-seed] DISCIPLINARY_RULES_ORGANIZATION_ID is required (the org to seed the rulebook into).",
	);
	process.exit(1);
}

const EXECUTE = process.argv.includes("--execute");

const RULEBOOK: RuleSeed[] = [
	// --- Attendance & punctuality (progressive) ---
	{
		code: "DISC-ATT-001",
		title: "Tardiness",
		category: "PUNCTUALITY",
		severity: "LOW",
		description:
			"Reporting to work later than the scheduled start time without an approved reason. Habitual tardiness (repeated within a rolling month) escalates.",
		consequences:
			"1st offense: Verbal warning (coaching). 2nd offense: Written warning. 3rd offense: Suspension 1-3 days. Habitual tardiness within 6 months: Suspension up to 5 days / dismissal per Labor Code Art. 297 analogous causes.",
	},
	{
		code: "DISC-ATT-002",
		title: "Undertime / early leaving",
		category: "PUNCTUALITY",
		severity: "LOW",
		description:
			"Leaving work before the scheduled end time without an approved undertime request.",
		consequences:
			"1st offense: Verbal warning. 2nd offense: Written warning. 3rd offense: Suspension 1-3 days. Habitual undertime: Dismissal per company policy.",
	},
	{
		code: "DISC-ATT-003",
		title: "Simple absence without notice",
		category: "ATTENDANCE",
		severity: "MEDIUM",
		description:
			"Absence from a scheduled workday without prior approved leave and without immediate notice.",
		consequences:
			"1st offense: Written warning. 2nd offense: Suspension 1-3 days. 3rd offense: Suspension 3-5 days + final written warning.",
	},
	{
		code: "DISC-ATT-004",
		title: "Absence auto-escalation (1-3+ days AWOL matrix)",
		category: "ATTENDANCE",
		severity: "HIGH",
		description:
			"Evidenced absent days in one occurrence cluster (Mon-Sat schedule; Sunday rest does not split a cluster): 1 day = LOW, 2 days = MEDIUM, 3+ days = HIGH. Each prior non-dismissed absenteeism case in the last 180 days escalates severity one level (cap HIGH). Engine files DRAFT cases; HR confirms before a case becomes official. Bare no-shows without evidence never auto-file (review queue only).",
		consequences:
			"LOW: Written warning. MEDIUM: Written warning + counseling. HIGH: Suspension up to 5 days; repetition within 6 months: dismissal for gross neglect (Art. 297[g] analogous).",
	},
	{
		code: "DISC-ATT-005",
		title: "AWOL / abandonment (continuous)",
		category: "ATTENDANCE",
		severity: "CRITICAL",
		description:
			"Continuous unexplained absence beyond the allowed AWOL threshold (company standard: half or more of the working days in a payroll window, or failure to report for consecutive scheduled days without notice), indicating intent to abandon employment.",
		consequences:
			"1st offense: Dismissal for abandonment after due process (two-notice rule). Company sends return-to-work notice before termination.",
	},
	// --- Conduct / misconduct ---
	{
		code: "DISC-CON-001",
		title: "Insubordination / willful disobedience",
		category: "MISCONDUCT",
		severity: "HIGH",
		description:
			"Intentional refusal to follow lawful and reasonable instructions of a supervisor or company policy (Labor Code Art. 297[b] willful disobedience).",
		consequences:
			"1st offense: Written warning to suspension depending on gravity. Repeated/serious: Dismissal (Art. 297[b]).",
	},
	{
		code: "DISC-CON-002",
		title: "Dishonesty / falsification of records",
		category: "MISCONDUCT",
		severity: "CRITICAL",
		description:
			"Falsifying attendance records, timesheets, official documents, or giving false information in employment records (Labor Code Art. 297[d] fraud / breach of trust).",
		consequences:
			"1st offense: Dismissal (just cause) after due process, plus civil/criminal action where applicable.",
	},
	{
		code: "DISC-CON-003",
		title: "Theft / misappropriation of company or coworker property",
		category: "MISCONDUCT",
		severity: "CRITICAL",
		description:
			"Taking, using, or misappropriating company, coworker, or client property without authorization (Labor Code Art. 297[c+e]).",
		consequences:
			"1st offense: Dismissal (just cause) after due process, restitution where applicable, criminal referral.",
	},
	{
		code: "DISC-CON-004",
		title: "Fighting / physical aggression",
		category: "MISCONDUCT",
		severity: "HIGH",
		description:
			"Physical fighting, threatening behavior, or violence in the workplace.",
		consequences:
			"1st offense: Suspension 5+ days up to dismissal depending on gravity and injury. With serious injury or weapons: Dismissal + criminal referral.",
	},
	{
		code: "DISC-CON-005",
		title: "Gambling in the workplace",
		category: "POLICY_VIOLATION",
		severity: "MEDIUM",
		description: "Betting or gambling during work hours or on company premises.",
		consequences:
			"1st offense: Written warning. 2nd offense: Suspension 1-3 days. 3rd offense: Dismissal per company policy.",
	},
	{
		code: "DISC-CON-006",
		title: "Alcohol / prohibited substances at work",
		category: "SAFETY",
		severity: "HIGH",
		description:
			"Reporting to work under the influence of, possessing, using, or distributing alcohol or prohibited drugs.",
		consequences:
			"1st offense: Suspension 3-5 days + mandatory counseling. Distribution or repeat offense: Dismissal + criminal referral for drugs.",
	},
	// --- Safety & property ---
	{
		code: "DISC-SAF-001",
		title: "Safety rule violation / negligence",
		category: "SAFETY",
		severity: "MEDIUM",
		description:
			"Violating safety rules, bypassing guards/PPE requirements, or negligent acts endangering self or others (Art. 297[f] commission of offense vs. employer/colleagues).",
		consequences:
			"1st offense: Written warning + retraining. 2nd offense: Suspension 1-5 days. Endangering others / repeat: Dismissal.",
	},
	{
		code: "DISC-SAF-002",
		title: "Damage to company property",
		category: "POLICY_VIOLATION",
		severity: "HIGH",
		description:
			"Willful or negligent damage/destruction of company equipment, tools, or facilities.",
		consequences:
			"1st offense: Restitution + suspension 1-5 days. Willful/serious damage: Dismissal + civil action.",
	},
	// --- Minor policy ---
	{
		code: "DISC-POL-001",
		title: "Dress code / ID violation",
		category: "DRESS_CODE",
		severity: "LOW",
		description:
			"Not wearing the prescribed uniform, PPE, or company ID while on duty or in restricted areas.",
		consequences:
			"1st offense: Verbal reminder. 2nd offense: Written warning. 3rd offense: Suspension 1 day.",
	},
	{
		code: "DISC-POL-002",
		title: "Personal business / mobile phone misuse during work hours",
		category: "POLICY_VIOLATION",
		severity: "LOW",
		description:
			"Excessive personal mobile phone use, entertainment, or personal transactions during productive hours.",
		consequences:
			"1st offense: Verbal warning (coaching). 2nd offense: Written warning. 3rd offense: Suspension 1 day.",
	},
	{
		code: "DISC-PER-001",
		title: "Poor performance / failure to meet standards",
		category: "PERFORMANCE",
		severity: "MEDIUM",
		description:
			"Persistent failure to meet reasonable performance standards after coaching and a documented performance improvement period (Art. 297[e]-adjacent: gross and habitual neglect).",
		consequences:
			"Stage 1: Coaching + documented PIP (30 days). Stage 2: Final written warning + extended PIP. Stage 3: Dismissal for gross and habitual neglect.",
	},
];

async function main() {
	console.log(
		`[disciplinary-rules-seed] template rows=${RULEBOOK.length} org=${ORG_ENV} execute=${EXECUTE}`,
	);
	let created = 0;
	let updated = 0;

	for (const rule of RULEBOOK) {
		const consequencePlan = consequencePlanForSeverity(rule.severity);
		const existing = await prisma.rule.findFirst({
			where: { code: rule.code, organizationId: ORG_ENV, isDeleted: false },
			select: { id: true, title: true, description: true, consequences: true, severity: true, consequencePlan: true },
		});

		if (!existing) {
			if (!EXECUTE) {
				console.log(`[dry-run] would create ${rule.code} — ${rule.title}`);
				continue;
			}
			await prisma.rule.create({
				data: {
					title: rule.title,
					code: rule.code,
					category: rule.category,
					severity: rule.severity,
					description: rule.description,
					consequences: rule.consequences,
					consequencePlan: consequencePlan as any,
					isActive: true,
					organizationId: ORG_ENV,
				},
			});
			created += 1;
			continue;
		}

		const same =
			existing.title === rule.title &&
			existing.description === rule.description &&
			existing.consequences === rule.consequences &&
			existing.severity === rule.severity &&
			JSON.stringify(existing.consequencePlan ?? {}) === JSON.stringify(consequencePlan);
		if (same) continue;

		if (!EXECUTE) {
			console.log(`[dry-run] would update ${rule.code} — ${rule.title}`);
			continue;
		}
		await prisma.rule.update({
			where: { id: existing.id },
			data: {
				title: rule.title,
				category: rule.category,
				severity: rule.severity,
				description: rule.description,
				consequences: rule.consequences,
				consequencePlan: consequencePlan as any,
			},
		});
		updated += 1;
	}

	console.log(
		`[disciplinary-rules-seed] done execute=${EXECUTE} created=${created} updated=${updated} total=${RULEBOOK.length}`,
	);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
