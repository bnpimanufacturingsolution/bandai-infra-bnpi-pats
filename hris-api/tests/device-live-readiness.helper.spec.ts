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
			callbackPostPathOk: true,
			lastPostAt: "2026-07-17T06:09:30.000Z",
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

	it("is green only when DB + receiving + HRIS post path healthy", () => {
		const readiness = buildDeviceLiveReadiness({
			databaseOk: true,
			databaseLatencyMs: 12,
			listenerRunning: true,
			listenerArmed: true,
			listenerReceiving: true,
			callbackPostPathOk: true,
			lastPostAt: "2026-07-17T06:09:30.000Z",
			lastAlarmAt: "2026-07-17T06:09:30.000Z",
			lastSdkEventAt: "2026-07-17T06:09:30.000Z",
			now,
		});
		expect(readiness.overall).to.equal("green");
		expect(readiness.safeToTap).to.equal(true);
		expect(readiness.safeToEnroll).to.equal(true);
		expect(readiness.checks.find((c) => c.id === "callbackPost")?.level).to.equal("green");
	});

	it("is red when VM:53001 callback reverse is down even if ACS receiving", () => {
		// Operator trap: green strip while posts cannot reach host API.
		const readiness = buildDeviceLiveReadiness({
			databaseOk: true,
			listenerRunning: true,
			listenerArmed: true,
			listenerReceiving: true,
			callbackPostPathOk: false,
			lastAlarmAt: "2026-07-17T06:09:30.000Z",
			lastSdkEventAt: "2026-07-17T06:09:30.000Z",
			now,
		});
		expect(readiness.overall).to.equal("red");
		expect(readiness.safeToTap).to.equal(false);
		expect(readiness.safeToEnroll).to.equal(false);
		expect(readiness.checks.find((c) => c.id === "callbackPost")?.level).to.equal("red");
		expect(readiness.headline).to.match(/53001|callback/i);
	});

	it("is yellow when receiving but no recent successful HRIS post", () => {
		const readiness = buildDeviceLiveReadiness({
			databaseOk: true,
			listenerRunning: true,
			listenerArmed: true,
			listenerReceiving: true,
			callbackPostPathOk: null,
			lastAlarmAt: "2026-07-17T06:09:30.000Z",
			lastSdkEventAt: "2026-07-17T06:09:30.000Z",
			// no lastPostAt
			now,
		});
		expect(readiness.overall).to.equal("yellow");
		expect(readiness.safeToEnroll).to.equal(false);
		expect(readiness.checks.find((c) => c.id === "callbackPost")?.level).to.equal("yellow");
	});

	it("is yellow when armed but 0 receiving (0/1/6 pattern)", () => {
		const readiness = buildDeviceLiveReadiness({
			databaseOk: true,
			listenerRunning: true,
			listenerArmed: true,
			listenerReceiving: false,
			callbackPostPathOk: true,
			lastPostAt: "2026-07-17T06:05:00.000Z",
			lastAlarmAt: "2026-07-17T06:05:00.000Z",
			lastSdkEventAt: "2026-07-17T06:05:00.000Z",
			now,
		});
		expect(readiness.overall).to.equal("yellow");
		expect(readiness.safeToTap).to.equal(true);
		expect(readiness.safeToEnroll).to.equal(false);
		expect(readiness.checks.find((c) => c.id === "liveCapture")?.level).to.equal("yellow");
	});

	it("stays green while receiving with fresh post even if saved proof is aging", () => {
		const readiness = buildDeviceLiveReadiness({
			databaseOk: true,
			listenerRunning: true,
			listenerArmed: true,
			listenerReceiving: true,
			callbackPostPathOk: true,
			lastPostAt: "2026-07-17T06:09:00.000Z",
			lastAlarmAt: "2026-07-17T06:05:00.000Z",
			lastSdkEventAt: "2026-07-17T06:05:00.000Z",
			now,
		});
		expect(readiness.overall).to.equal("green");
		expect(readiness.safeToTap).to.equal(true);
		expect(readiness.safeToEnroll).to.equal(true);
	});

	it("treats receiving evidence as running even when systemd reports stopped", () => {
		const readiness = buildDeviceLiveReadiness({
			databaseOk: true,
			listenerRunning: false,
			listenerArmed: true,
			listenerReceiving: true,
			callbackPostPathOk: true,
			lastPostAt: "2026-07-17T06:09:00.000Z",
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
			callbackPostPathOk: true,
			lastSdkEventAt: "2026-07-17T05:00:00.000Z",
			lastAlarmAt: "2026-07-17T06:09:00.000Z",
			lastPostAt: "2026-07-17T06:08:00.000Z",
			now,
		});
		expect(readiness.proof.lastSdkEventAt).to.equal("2026-07-17T06:09:00.000Z");
		expect(readiness.overall).to.equal("yellow");
		expect(readiness.safeToEnroll).to.equal(false);
	});

	it("treats armed-but-quiet-without-fresh-proof as ready for tap proof, not broken", () => {
		const readiness = buildDeviceLiveReadiness({
			databaseOk: true,
			listenerRunning: true,
			listenerArmed: true,
			listenerReceiving: false,
			callbackPostPathOk: true,
			lastAlarmAt: "2026-07-17T05:20:00.000Z",
			lastSdkEventAt: "2026-07-17T05:20:00.000Z",
			now,
		});
		expect(readiness.proof.stale).to.equal(true);
		expect(readiness.safeToTap).to.equal(true);
		expect(readiness.safeToEnroll).to.equal(false);
		expect(readiness.overall).to.equal("yellow");
		expect(readiness.headline).to.match(/ready for tap proof/i);
		expect(readiness.checks.find((c) => c.id === "eventProof")?.level).to.equal("yellow");
		expect(readiness.checks.find((c) => c.id === "eventProof")?.label).to.equal(
			"Ready for tap proof",
		);
	});

	it("is yellow when armed quiet and proof is aging but not ancient", () => {
		const readiness = buildDeviceLiveReadiness({
			databaseOk: true,
			listenerRunning: true,
			listenerArmed: true,
			listenerReceiving: false,
			callbackPostPathOk: true,
			lastPostAt: "2026-07-17T05:58:00.000Z",
			lastAlarmAt: "2026-07-17T05:58:00.000Z",
			lastSdkEventAt: "2026-07-17T05:58:00.000Z",
			now,
		});
		expect(readiness.proof.fresh).to.equal(false);
		expect(readiness.proof.stale).to.equal(false);
		expect(readiness.safeToTap).to.equal(true);
		expect(readiness.safeToEnroll).to.equal(false);
		expect(readiness.overall).to.equal("yellow");
	});
});
