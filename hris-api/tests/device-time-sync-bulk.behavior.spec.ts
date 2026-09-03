/**
 * Behavioral tests for the fleet + single Hikvision time-sync handlers.
 * Real controller(prisma) invocation with an injected prisma double.
 *
 * Devices are crafted so the SDK leg fails FAST (invalid SDK host fails the
 * preflight regex before any process spawn) and the ISAPI fallback fails fast
 * (invalid hostname -> immediate https error). Success-path over real
 * hardware is separately proven live (.runtime/time-sync-all-smoke-*).
 */
import { expect } from "chai";
import { describe, it } from "mocha";
import { controller } from "../app/device/device.controller";

const mkDevice = (over: Record<string, any>) => ({
	id: over.id,
	organizationId: "org-1",
	name: over.name,
	address: over.address ?? "bad host", // invalid SDK host -> instant preflight throw
	port: 80,
	protocol: "http",
	config: { vendor: "hikvision", sdkPort: 8000, ...(over.config || {}) },
	access: over.access ?? { username: "u", password: "p" },
});

const makePrisma = (devices: any[]) => ({
	device: {
		findMany: async () => devices,
		findFirst: async ({ where }: any) =>
			devices.find((d) => d.id === where?.id && !where?.isDeleted) || null,
	},
});

const makeReq = (over: Record<any, any> = {}) =>
	({
		organizationId: "org-1",
		userId: "user-1",
		originalUrl: "/api/device/test",
		headers: {},
		params: {},
		body: {},
		...over,
	}) as any;

const makeRes = () => {
	const res: any = { statusCode: 0, body: null };
	res.status = (code: number) => {
		res.statusCode = code;
		return res;
	};
	res.json = (payload: any) => {
		res.body = payload;
		return res;
	};
	return res;
};

const NEXT = (() => undefined) as any;

describe("fleet time-sync-all handler (behavior)", () => {
	it("aggregates honest failure rows across every Hikvision target on preview", async () => {
		const prisma = makePrisma([
			mkDevice({ id: "hk1", name: "Main A" }),
			mkDevice({ id: "hk2", name: "Main B" }),
			mkDevice({ id: "hk3", name: "Main E" }),
			{ id: "zk1", name: "ZK Door", config: { vendor: "zkteco" }, protocol: "tcp", port: 4370 },
			{ id: "pr1", name: "Printer", config: {} },
		]);
		const ctrl = controller(prisma as any);
		const req = makeReq();
		const res = makeRes();

		await ctrl.syncAllHikvisionDevicesTime(req, res, NEXT);

		expect(res.statusCode).to.equal(200);
		expect(res.body.status).to.equal("success");
		expect(res.body.data.execute).to.equal(false);
		expect(res.body.data.totalTargets).to.equal(3); // zkteco + printer filtered out
		expect(res.body.data.results).to.have.lengthOf(3);
		for (const row of res.body.data.results) {
			expect(row.ok).to.equal(false);
			expect(row.wrote).to.equal(false);
			expect(row.error).to.be.a("string").and.not.equal("");
			expect(row.before).to.equal(null);
		}
		expect(res.body.data.readable).to.equal(0);
		expect(res.body.data.failed).to.equal(3);
		expect(res.body.message).to.contain("preview");
	});

	it("honors deviceIds scope freeze including unknown ids being dropped", async () => {
		const prisma = makePrisma([
			mkDevice({ id: "hk1", name: "Main A" }),
			mkDevice({ id: "hk2", name: "Main D" }),
		]);
		const ctrl = controller(prisma as any);
		const res = makeRes();

		await ctrl.syncAllHikvisionDevicesTime(
			makeReq({ body: { deviceIds: ["hk2", "ghost-id"] } }),
			res,
			NEXT,
		);

		expect(res.statusCode).to.equal(200);
		expect(res.body.data.totalTargets).to.equal(1);
		expect(res.body.data.results[0].deviceId).to.equal("hk2");
	});

	it("returns an honest zero-target summary when no Hikvision devices exist", async () => {
		const prisma = makePrisma([
			{ id: "zk1", name: "ZK Door", config: { vendor: "zkteco" }, protocol: "tcp", port: 4370 },
		]);
		const ctrl = controller(prisma as any);
		const res = makeRes();

		await ctrl.syncAllHikvisionDevicesTime(makeReq(), res, NEXT);

		expect(res.statusCode).to.equal(200);
		expect(res.body.data.totalTargets).to.equal(0);
		expect(res.body.data.readable).to.equal(0);
		expect(res.body.data.written).to.equal(0);
		expect(res.body.data.results).to.deep.equal([]);
	});

	it("never reports writes when every target is unreachable on execute", async function () {
		this.timeout(20000);
		const prisma = makePrisma([mkDevice({ id: "hk1", name: "Main A" })]);
		const ctrl = controller(prisma as any);
		const res = makeRes();

		await ctrl.syncAllHikvisionDevicesTime(makeReq({ body: { execute: true } }), res, NEXT);

		expect(res.statusCode).to.equal(200); // 0 readable -> not the partial-write 207 case
		expect(res.body.data.execute).to.equal(true);
		expect(res.body.data.written).to.equal(0);
		expect(res.body.data.readable).to.equal(0);
	});

	it("rejects the call without organization scoping", async () => {
		const prisma = makePrisma([]);
		const ctrl = controller(prisma as any);
		const res = makeRes();

		await ctrl.syncAllHikvisionDevicesTime(makeReq({ organizationId: "" }), res, NEXT);

		expect(res.statusCode).to.equal(400);
		expect(res.body.message).to.contain("Organization ID");
	});
});

describe("single-device time-sync handler (behavior)", () => {
	it("404s unknown devices before touching vendor code", async () => {
		const ctrl = controller(makePrisma([]) as any);
		const res = makeRes();

		await ctrl.syncHikvisionDeviceTime(
			makeReq({ params: { id: "missing" } }),
			res,
			NEXT,
		);

		expect(res.statusCode).to.equal(404);
	});

	it("refuses ZKTeco devices with a dedicated message", async () => {
		const zk = {
			id: "zk1",
			name: "ZK Door",
			config: { vendor: "zkteco" },
			protocol: "tcp",
			port: 4370,
		};
		const ctrl = controller(makePrisma([zk]) as any);
		const res = makeRes();

		await ctrl.syncHikvisionDeviceTime(makeReq({ params: { id: "zk1" } }), res, NEXT);

		expect(res.statusCode).to.equal(400);
		expect(res.body.message).to.contain("ZKTeco");
	});

	it("surfaces core failure as 502 without leaking a success payload", async () => {
		const bad = mkDevice({ id: "hkBad", name: "Bad Host" });
		const ctrl = controller(makePrisma([bad]) as any);
		const res = makeRes();

		await ctrl.syncHikvisionDeviceTime(
			makeReq({ params: { id: "hkBad" }, body: { execute: false } }),
			res,
			NEXT,
		);

		expect(res.statusCode).to.equal(502);
		expect(res.body.status).to.equal("error");
		expect(res.body.message).to.be.a("string").and.not.equal("");
	});
});
