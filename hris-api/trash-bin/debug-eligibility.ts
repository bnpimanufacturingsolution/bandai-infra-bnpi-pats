import { PrismaClient } from "./generated/prisma";

const prisma = new PrismaClient();

async function main() {
	const AUTH_TOKEN =
		"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTc4NDVlNjQ3OWVhYTZkMmY3OTZiODkiLCJyb2xlIjoiYWRtaW4iLCJyb2xlSWQiOiI2OTc4NDVlNDQ3OWVhYTZkMmY3OTZiODAiLCJvcmdhbml6YXRpb25JZCI6IjY5Nzg0NWUzNDc5ZWFhNmQyZjc5NmI3YyIsIm1ldGFkYXRhIjpudWxsLCJpYXQiOjE3Njk2NTE5NjgsImV4cCI6MTc2OTczODM2OH0.Y9CaD9VB93GE6fmUXs4-X0ScpN8jd0NkDUK2ddA8ma8";

	console.log("Fetching Metrics API...");
	try {
		const res = await fetch("http://localhost:3001/api/metrics", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${AUTH_TOKEN}`,
			},
			body: JSON.stringify({
				model: "Employee",
				data: ["eligibilityCandidates"],
				filter: {},
			}),
		});

		if (res.ok) {
			const data = await res.json();
			console.log("API Response Status:", res.status);
			// console.log("Data:", JSON.stringify(data, null, 2));
			const candidates =
				data.data?.metrics?.eligibilityCandidates || data.metrics?.eligibilityCandidates;
			console.log(`Candidates Found: ${candidates?.length}`);
			if (candidates?.length > 0) {
				console.log(
					"First Candidate:",
					candidates[0].employeeName,
					candidates[0].eligibleFor,
				);
			} else {
				console.log("No candidates returned from API.");
				console.log("Full Response:", JSON.stringify(data, null, 2));
			}
		} else {
			console.log("API Error:", res.status, await res.text());
		}
	} catch (e) {
		console.error("Fetch error:", e);
	}
}

main().finally(async () => await prisma.$disconnect());
