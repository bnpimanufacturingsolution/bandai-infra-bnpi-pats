import { describe, expect, it } from "vitest";
import { decideDeviceLiveKeepReadyRepair } from "./device-live-keep-ready";

describe("device live Keep ready decision", () => {
	it("does not restart an armed listener merely because it is quiet", () => {
		expect(
			decideDeviceLiveKeepReadyRepair({
				databaseOk: true,
				listenerRunning: true,
				listenerReceiving: false,
				listenerArmed: true,
				listenerState: "armed",
			}),
		).to.deep.equal({ shouldRepair: false, forceReArm: false });
	});

	it("force re-arms a real listener login failure", () => {
		expect(
			decideDeviceLiveKeepReadyRepair({
				databaseOk: true,
				listenerRunning: true,
				listenerReceiving: false,
				listenerArmed: false,
				listenerState: "login_failed",
			}),
		).to.deep.equal({ shouldRepair: true, forceReArm: true });
	});

	it("repairs a database dependency without restarting an armed listener", () => {
		expect(
			decideDeviceLiveKeepReadyRepair({
				databaseOk: false,
				listenerRunning: true,
				listenerReceiving: false,
				listenerArmed: true,
				listenerState: "armed",
			}),
		).to.deep.equal({ shouldRepair: true, forceReArm: false });
	});
});
