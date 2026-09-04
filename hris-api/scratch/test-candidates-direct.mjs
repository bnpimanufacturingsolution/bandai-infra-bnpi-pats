import { prisma } from "../prisma/prisma.service.js";
import { getEligibilityCandidates } from "../helper/eligibility.helper.js";

async function main() {
	console.time("getEligibilityCandidates");
	const org = await prisma.organization.findFirst({ select: { id: true } });
	console.log("Found organization:", org?.id);
	if (!org) return;

	const candidates = await getEligibilityCandidates(prisma, org.id);
	console.timeEnd("getEligibilityCandidates");
	console.log(`Total candidates found: ${candidates.length}`);
	console.log("Candidate summary:", candidates.map(c => ({
		name: c.employeeName,
		type: c.eligibleFor,
		reason: c.eligibilityReason
	})));
}

main()
	.catch(err => {
		console.error("Direct test failed:", err);
	})
	.finally(() => prisma.$disconnect());
