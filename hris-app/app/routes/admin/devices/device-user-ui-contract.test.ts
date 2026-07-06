import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const readAppFile = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("admin device user and log sync UI contract", () => {
	it("keeps device user sync separate from device log sync", () => {
		const manage = readAppFile("app/routes/admin/devices/manage.tsx");
		const enroll = readAppFile("app/routes/admin/devices/enroll.tsx");
		const events = readAppFile("app/routes/admin/devices/events.tsx");

		expect(manage).toContain("View Device Users");
		expect(manage).toContain('title="Device Users"');
		expect(enroll).toContain("Review sync");
		expect(enroll).toContain("Sync device users");
		expect(enroll).toContain("Device user sync status");
		expect(enroll).toContain("Device logs are synced from the logs page");
		expect(enroll).toContain("This does not import attendance logs");
		expect(enroll).not.toContain("Sync logs request accepted");

		expect(events).toContain("Sync logs");
		expect(events).toContain("Sync device logs");
		expect(events).toContain("Known skipped");
		expect(events).toContain("Still missing");
	});
});
