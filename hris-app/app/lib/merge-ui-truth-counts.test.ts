import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	MERGE_CHIP_CONTRACT,
	buildMergePeerCopyCta,
	formatMergeSourceDeviceTile,
	formatMergeTargetDeviceTile,
	sumSelectedExecutablePeerCopies,
} from "./merge-ui-truth-counts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const enrollSource = readFileSync(
	resolve(currentDir, "../routes/admin/devices/enroll.tsx"),
	"utf8",
);

describe("merge-ui-truth-counts contract", () => {
	it("documents one formula per default chip", () => {
		const defaults = MERGE_CHIP_CONTRACT.filter((chip) => chip.defaultVisible);
		expect(defaults.map((c) => c.id)).toEqual([
			"unique",
			"records",
			"missing",
			"decision",
			"peer_copy",
			"fingerprint",
			"face",
		]);
		for (const chip of defaults) {
			expect(chip.formula.length).toBeGreaterThan(10);
			expect(chip.caption.length).toBeGreaterThan(5);
		}
		const card = MERGE_CHIP_CONTRACT.find((c) => c.id === "card");
		expect(card?.defaultVisible).toBe(false);
	});

	it("disables peer-copy CTA when executable copies are 0 (never uses selected ID count)", () => {
		const cta = buildMergePeerCopyCta({
			executablePeerCopies: 0,
			selectedUniqueIds: 76,
			profileOverlays: 0,
			canApply: true,
		});
		expect(cta.disabled).toBe(true);
		expect(cta.label).toBe("No peer copies for this selection");
		expect(cta.reason).toBe("zero_writes");
		expect(cta.label).not.toMatch(/76/);
		expect(cta.label).not.toMatch(/IDs/i);
	});

	it("labels peer-copy CTA with executable copy count, not selected IDs", () => {
		const cta = buildMergePeerCopyCta({
			executablePeerCopies: 12,
			selectedUniqueIds: 76,
			canApply: true,
		});
		expect(cta.disabled).toBe(false);
		expect(cta.label).toBe("Start peer copy (12)");
		expect(cta.label).not.toContain("76");
		expect(cta.reason).toBe("has_executable_copies");
	});

	it("uses profile-only label when copies=0 but overlays exist", () => {
		const cta = buildMergePeerCopyCta({
			executablePeerCopies: 0,
			selectedUniqueIds: 5,
			profileOverlays: 3,
			canApply: true,
		});
		expect(cta.disabled).toBe(false);
		expect(cta.label).toBe("Apply profile updates (3)");
		expect(cta.reason).toBe("profile_only");
	});

	it("sums selected matrix COPY as executable peer copies", () => {
		expect(
			sumSelectedExecutablePeerCopies([
				{ writes: 0 },
				{ writes: 0 },
				{ writes: 2 },
				{ writes: 1 },
			]),
		).toBe(3);
		expect(sumSelectedExecutablePeerCopies([])).toBe(0);
	});

	it("labels source device tiles so selected IDs and peer copies are not dual bare numbers", () => {
		const tile = formatMergeSourceDeviceTile({
			selectedUniqueIds: 6,
			peerCopies: 20,
		});
		expect(tile.primaryValue).toBe(20);
		expect(tile.primaryLabel).toMatch(/peer copies/i);
		expect(tile.secondaryText).toMatch(/6 selected ID/);
	});

	it("labels target device tiles as peer copies to create", () => {
		const tile = formatMergeTargetDeviceTile({
			writes: 5,
			sourceDeviceNames: ["Main Entrance Device A"],
		});
		expect(tile.primaryValue).toBe(5);
		expect(tile.primaryLabel).toBe("peer copies to create");
		expect(tile.secondaryText).toContain("Main Entrance Device A");
	});
});

describe("enroll.tsx merge UI wire-up", () => {
	it("imports buildMergePeerCopyCta and does not label peer copy from selected unique ID count", () => {
		expect(enrollSource).toContain("buildMergePeerCopyCta");
		expect(enrollSource).toContain("merge-ui-truth-counts");
		expect(enrollSource).toContain("sdkMergePeerCopyCta");
		// Forbidden false CTA pattern from job card Image A
		expect(enrollSource).not.toMatch(
			/Start peer copy job \(\$\{sdkMergeSelectedUniqueCount\} IDs\)/,
		);
		expect(enrollSource).not.toMatch(
			/Start peer copy \(\$\{sdkMergeSelectedUniqueCount\}/,
		);
		// CTA must bind disabled/label from the contract helper
		expect(enrollSource).toContain("sdkMergePeerCopyCta.disabled");
		expect(enrollSource).toContain("sdkMergePeerCopyCta.label");
		// Executable copies = writeMatrix.totalWrites / selected matrix sum(COPY)
		expect(enrollSource).toContain("sdkMergeSelectedExecutablePeerCopies");
		expect(enrollSource).toContain("totalWrites");
	});

	it("splits Missing and Needs decision chips (no Needs review soup as primary chip)", () => {
		expect(enrollSource).toContain('label: "Missing"');
		expect(enrollSource).toContain('label: "Needs decision"');
		expect(enrollSource).toContain('label: "Peer-copy ready"');
		// Top chip grid is the single-source set (inline or named)
		expect(enrollSource).toMatch(/Single-source top chips|sdkMergeTopChips/);
		// Soup label must not be a default top chip entry next to Unique IDs
		expect(enrollSource).not.toMatch(
			/\{\s*key:\s*"review",\s*label:\s*"Needs review"/,
		);
		expect(enrollSource).not.toMatch(
			/\["review",\s*"Needs review"/,
		);
	});

	it("does not put card back into decision residual path", () => {
		// Card residual is opt-in only; decision caption stays profile-only
		expect(enrollSource).toMatch(/people with profile conflicts only|Profile A\/B only \(not card\)/);
		expect(enrollSource).toContain("includeCardResidual");
		expect(enrollSource).toContain("Include card residual");
	});

	it("labels source/target device tiles via truth helpers (no bare dual numbers)", () => {
		expect(enrollSource).toContain("formatMergeSourceDeviceTile");
		expect(enrollSource).toContain("formatMergeTargetDeviceTile");
	});
});
