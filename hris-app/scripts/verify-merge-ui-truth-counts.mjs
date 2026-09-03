import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const helperUrl = pathToFileURL(resolve(root, "app/lib/merge-ui-truth-counts.ts")).href;
const {
	MERGE_CHIP_CONTRACT,
	buildMergePeerCopyCta,
	formatMergeSourceDeviceTile,
	formatMergeTargetDeviceTile,
	sumSelectedExecutablePeerCopies,
} = await import(helperUrl);

let failed = 0;
function assert(cond, msg) {
	if (!cond) {
		console.error("FAIL", msg);
		failed += 1;
	} else {
		console.log("PASS", msg);
	}
}

const defaults = MERGE_CHIP_CONTRACT.filter((c) => c.defaultVisible);
assert(
	defaults.map((c) => c.id).join(",") ===
		"unique,records,missing,decision,peer_copy,fingerprint,face",
	"default chips",
);
assert(MERGE_CHIP_CONTRACT.find((c) => c.id === "card")?.defaultVisible === false, "card hidden");

const zero = buildMergePeerCopyCta({
	executablePeerCopies: 0,
	selectedUniqueIds: 76,
	canApply: true,
});
assert(
	zero.disabled &&
		zero.label === "No peer copies for this selection" &&
		!/76/.test(zero.label),
	"zero copies CTA",
);

const has = buildMergePeerCopyCta({
	executablePeerCopies: 12,
	selectedUniqueIds: 76,
	canApply: true,
});
assert(
	!has.disabled && has.label === "Start peer copy (12)" && !has.label.includes("76"),
	"copies label not IDs",
);

const profile = buildMergePeerCopyCta({
	executablePeerCopies: 0,
	selectedUniqueIds: 5,
	profileOverlays: 3,
	canApply: true,
});
assert(
	!profile.disabled && profile.label === "Apply profile updates (3)",
	"profile-only CTA",
);

assert(
	sumSelectedExecutablePeerCopies([{ writes: 0 }, { writes: 2 }, { writes: 1 }]) === 3,
	"sum copies",
);

const src = formatMergeSourceDeviceTile({ selectedUniqueIds: 6, peerCopies: 20 });
assert(
	src.primaryValue === 20 &&
		/peer copies/i.test(src.primaryLabel) &&
		/6 selected ID/.test(src.secondaryText),
	"source tile",
);

const tgt = formatMergeTargetDeviceTile({
	writes: 5,
	sourceDeviceNames: ["Main Entrance Device A"],
});
assert(
	tgt.primaryValue === 5 && tgt.primaryLabel === "peer copies to create",
	"target tile",
);

const enroll = readFileSync(resolve(root, "app/routes/admin/devices/enroll.tsx"), "utf8");
assert(
	enroll.includes("buildMergePeerCopyCta") && enroll.includes("sdkMergePeerCopyCta"),
	"enroll imports CTA",
);
assert(
	!/Start peer copy job \(\$\{sdkMergeSelectedUniqueCount\} IDs\)/.test(enroll),
	"no false ID CTA",
);
assert(
	enroll.includes("sdkMergePeerCopyCta.disabled") &&
		enroll.includes("sdkMergePeerCopyCta.label"),
	"CTA wire-up",
);
assert(
	enroll.includes('label: "Missing"') &&
		enroll.includes('label: "Needs decision"') &&
		enroll.includes('label: "Peer-copy ready"'),
	"split chips",
);
assert(!/\["review",\s*"Needs review"/.test(enroll), "no review soup chip");
assert(enroll.includes("includeCardResidual"), "card toggle present");
assert(
	enroll.includes("formatMergeSourceDeviceTile") &&
		enroll.includes("formatMergeTargetDeviceTile"),
	"tile helpers",
);
assert(enroll.includes("sdkMergeSelectedExecutablePeerCopies"), "executable peer copies field");
assert(enroll.includes("totalWrites"), "writeMatrix totalWrites");

if (failed) {
	console.error("FAILED", failed);
	process.exit(1);
}
console.log("ALL GREEN");
