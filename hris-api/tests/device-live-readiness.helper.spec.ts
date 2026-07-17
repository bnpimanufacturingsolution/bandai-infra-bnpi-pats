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

	it("stays green while receiving even if last saved proof is aging", () => {
		// Repro: operator taps → row lands → 3–4 minutes later strip went yellow while Live receiving.
		const readiness = buildDeviceLiveReadiness({
			databaseOk: true,
			listenerRunning: true,
			listenerArmed: true,
			listenerReceiving: true,
			lastAlarmAt: "2026-07-17T06:05:00.000Z",
			lastSdkEventAt: "2026-07-17T06:05:00.000Z",
			now,
		});
		expect(readiness.proof.fresh).to.equal(true);
		expect(readiness.overall).to.equal("green");
		expect(readiness.safeToTap).to.equal(true);
		expect(readiness.safeToEnroll).to.equal(true);
		expect(readiness.checks.find((c) => c.id === "eventProof")?.level).to.equal("green");
		expect(readiness.checks.find((c) => c.id === "liveCapture")?.level).to.equal("green");
	});

	it("treats receiving evidence as running even when systemd reports stopped", () => {
		const readiness = buildDeviceLiveReadiness({
			databaseOk: true,
			listenerRunning: false,
			listenerArmed: true,
			listenerReceiving: true,
			lastAlarmAt: "2026-07-17T06:09:00.000Z",
			lastSdkEventAt: "2026-07-17T06:09:00.000Z",
			now,
		});
		expect(readiness.listener.running).to.equal(true);
		expect(readiness.overall).to.equal("green");
		expect(readiness.safeToTap).to.equal(true);
	});

	it("uses newest of saved + alarm + post timestamps for proof age", () => {
		const readiness = buildDeviceLiveReadiness({
			databaseOk: true,
			listenerRunning: true,
			listenerArmed: true,
			listenerReceiving: false,
			lastSdkEventAt: "2026-07-17T05:00:00.000Z",
			lastAlarmAt: "2026-07-17T06:09:00.000Z",
			lastPostAt: "2026-07-17T06:08:00.000Z",
			now,
		});
		expect(readiness.proof.lastSdkEventAt).to.equal("2026-07-17T06:09:00.000Z");
		expect(readiness.proof.fresh).to.equal(true);
		expect(readiness.overall).to.equal("green");
	});

	it("treats armed-but-quiet-without-fresh-proof as not fully safe", () => {
		const readiness = buildDeviceLiveReadiness({
			databaseOk: true,
			listenerRunning: true,
			listenerArmed: true,
			listenerReceiving: false,
			lastAlarmAt: "2026-07-17T05:20:00.000Z",
			lastSdkEventAt: "2026-07-17T05:20:00.000Z",
			now,
		});
		// 50 minutes old proof → stale → red proof / not safe enroll
		expect(readiness.proof.stale).to.equal(true);
		expect(readiness.safeToEnroll).to.equal(false);
		expect(readiness.overall).to.equal("red");
		expect(readiness.checks.find((c) => c.id === "eventProof")?.level).to.equal("red");
	});

	it("is yellow when armed quiet and proof is aging but not ancient", () => {
		const readiness = buildDeviceLiveReadiness({
			databaseOk: true,
			listenerRunning: true,
			listenerArmed: true,
			listenerReceiving: false,
			// 12 minutes ago — between fresh (10m) and stale (30m)
			lastAlarmAt: "2026-07-17T05:58:00.000Z",
			lastSdkEventAt: "2026-07-17T05:58:00.000Z",
			now,
		});
		expect(readiness.proof.fresh).to.equal(false);
		expect(readiness.proof.stale).to.equal(false);
		expect(readiness.safeToTap).to.equal(true);
		expect(readiness.safeToEnroll).to.equal(true);
		expect(readiness.overall).to.equal("yellow");
	});
});
