import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(
	resolve(currentDir, "../routes/admin/devices/events.tsx"),
	"utf8",
);

describe("device events page UX contract", () => {
	it("defaults saved events to punch time descending so sync/backfill rows keep punch chronology", () => {
		expect(routeSource).to.contain(
			'const sort = searchParams.get("sort") || "eventTime";',
		);
	});

	it("opens Sync logs as a modal journey with bridge preflight and actual sync status", () => {
		expect(routeSource).to.contain('next.set("action", "sync-logs")');
		expect(routeSource).to.contain('title="Sync device logs"');
		expect(routeSource).to.contain("useDeviceSyncPreview");
		expect(routeSource).to.contain("Refresh preflight");
		expect(routeSource).to.contain("device-events-sync-preflight");
		expect(routeSource).to.contain("Sync preflight is unavailable");
		expect(routeSource).to.contain("SDK/vendor truth");
		expect(routeSource).to.contain("DB truth");
		expect(routeSource).to.contain("Device tally");
		expect(routeSource).to.contain("Preview only");
		expect(routeSource).to.contain("Start actual sync");
	});

	it("does not render terminal manage deeplinks from saved rows or punch details", () => {
		expect(routeSource).not.to.contain("/admin/devices/manage/${item.deviceId}");
		expect(routeSource).not.to.contain("/admin/devices/manage/${activeEvent.deviceId}");
		expect(routeSource).to.contain("Employee record");
	});
});
