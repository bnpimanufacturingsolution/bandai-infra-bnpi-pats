import { expect } from "chai";
import { buildDeviceLiveReadiness } from "../helper/device-live-readiness.helper";

describe("device-live-readiness helper", () => {
	const now = new Date("2026-07-17T06:10:00.000Z");

	it("is red when database is down even if listener is armed", () => {
		const readiness = buildDeviceLiveReadiness({
			databaseOk: false,
			databaseError: "Can't reach database server at 127.0.0.1:55435",
			listenerRunning: true,
			listenerArmed: true,
			listenerReceiving: true,
			lastAlarmAt: "2026-07-17T06:09:30.000Z",
			lastSdkEventAt: "2026-07-17T06:09:30.000Z",
			now,
		});
		expect(readiness.overall).to.equal("red");
		expect(readiness.safeToTap).to.equal(false);
		expect(readiness.safeToEnroll).to.equal(false);
		expect(readiness.checks.find((c) => c.id === "database")?.level).to.equal("red");
		expect(readiness.headline).to.match(/database/i);
	});

	it("is green only when DB + live path + fresh proof all pass", () => {
		const readiness = buildDeviceLiveReadiness({
			databaseOk: true,
			databaseLatencyMs: 12,
			listenerRunning: true,
			listenerArmed: true,
			listenerReceiving: true,
			lastAlarmAt: "2026-07-17T06:09:30.000Z",
			lastSdkEventAt: "2026-07-17T06:09:30.000Z",
			now,
		});
		expect(readiness.overall).to.equal("green");
		expect(readiness.safeToTap).to.equal(true);
		expect(readiness.safeToEnroll).to.equal(true);
	});

	it("treats armed-but-quiet-without-fresh-proof as not fully safe", () => {
		const readiness = buildDeviceLiveReadiness({
			databaseOk: true,
			listenerRunning: true,
			listenerArmed: true,
			listenerReceiving: false,
			lastAlarmAt: "2026-07-17T05:47:00.000Z",
			lastSdkEventAt: "2026-07-17T05:47:00.000Z",
			now,
		});
		// 23 minutes old proof → stale → red proof / not safe enroll
		expect(readiness.proof.stale).to.equal(true);
		expect(readiness.safeToEnroll).to.equal(false);
		expect(readiness.overall).to.equal("red");
		expect(readiness.checks.find((c) => c.id === "eventProof")?.level).to.equal("red");
	});

	it("is yellow when armed and proof is aging but not ancient", () => {
		const readiness = buildDeviceLiveReadiness({
			databaseOk: true,
			listenerRunning: true,
			listenerArmed: true,
			listenerReceiving: false,
			lastAlarmAt: "2026-07-17T06:05:00.000Z",
			lastSdkEventAt: "2026-07-17T06:05:00.000Z",
			now,
		});
		expect(readiness.proof.fresh).to.equal(false);
		expect(readiness.proof.stale).to.equal(false);
		expect(readiness.safeToTap).to.equal(true);
		expect(readiness.safeToEnroll).to.equal(true);
		expect(readiness.overall).to.equal("yellow");
	});
});
