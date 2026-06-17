import "dotenv/config";

const HELP_TEXT = `
backfill-applicant-assigned-hr

Status:
  This script entrypoint was restored so package commands resolve again, but the
  original implementation is not present in the repository.

Behavior:
  - Prints a clear warning
  - Exits without modifying data

Why:
  The package scripts \`backfill:applicant-assigned-hr\` and
  \`backfill:applicant-assigned-hr:execute\` existed in package.json, but their
  target file was missing. This placeholder keeps local validation honest and
  prevents an accidental silent failure or a shell-level "file not found" error.
`;

const args = new Set(process.argv.slice(2));
if (args.has("--help") || args.has("-h")) {
	console.log(HELP_TEXT.trim());
	process.exit(0);
}

console.warn("[backfill:applicant-assigned-hr] No implementation is available in this repository.");
console.warn(
	"[backfill:applicant-assigned-hr] This restored placeholder intentionally performs no data changes.",
);
console.warn(
	"[backfill:applicant-assigned-hr] If this backfill is still needed, restore the original implementation before use.",
);
