import { expect } from "chai";
import fs from "node:fs";
import path from "node:path";

/**
 * Guardrail: boarding completion notification titles and the broadcast log
 * must stay ASCII. UTF-8 emoji in this file historically became Latin-1
 * mojibake (e.g. 🎉 -> "ðŸŽ‰", 📢 -> "ðŸ“¢") in user-facing titles.
 */
const controllerSource = fs.readFileSync(
	path.resolve(__dirname, "../app/checklistItem/checklistItem.controller.ts"),
	"utf8",
);

const MOJIBAKE_MARKERS = ["ð", "Ÿ", "Ž"] as const;

function linesContaining(source: string, needle: string): string[] {
	return source.split(/\r?\n/).filter((line) => line.includes(needle));
}

function assertNoMojibake(label: string, text: string): void {
	for (const marker of MOJIBAKE_MARKERS) {
		expect(text, `${label} must not contain mojibake marker ${JSON.stringify(marker)}`).to.not.include(
			marker,
		);
	}
}

describe("checklistItem boarding notification title contract", () => {
	it("uses ASCII onboarding and exit-clearance titles", () => {
		expect(controllerSource).to.contain("Onboarding Completed!");
		expect(controllerSource).to.contain("Exit Clearance Completed!");

		const titleLines = [
			...linesContaining(controllerSource, "Onboarding Completed!"),
			...linesContaining(controllerSource, "Exit Clearance Completed!"),
		];
		expect(titleLines.length).to.be.greaterThan(0);
		for (const line of titleLines) {
			assertNoMojibake("boarding completion title", line);
		}
	});

	it("keeps the broadcast notification log line free of emoji mojibake", () => {
		const broadcastLines = linesContaining(controllerSource, "Broadcast notification");
		expect(broadcastLines.length).to.be.greaterThan(0);
		expect(controllerSource).to.contain(
			"Broadcast notification emitted to all connected sockets",
		);
		for (const line of broadcastLines) {
			assertNoMojibake("broadcast notification log", line);
		}
	});
});
