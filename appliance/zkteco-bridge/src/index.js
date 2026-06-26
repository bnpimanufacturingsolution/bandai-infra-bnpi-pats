"use strict";

const http = require("http");
const ZKJubaer = require("zk-jubaer");

const startedAt = new Date();
const statusPort = Number(process.env.ZKTECO_STATUS_PORT || 4371);
const deviceIps = String(
	process.env.ZKTECO_DEVICE_IPS || "10.184.38.10,10.184.38.234,10.184.38.235,10.184.38.9",
)
	.split(",")
	.map((item) => item.trim())
	.filter(Boolean);
const devicePort = Number(process.env.ZKTECO_DEVICE_PORT || 4370);
const webhookUrl = process.env.ZKTECO_WEBHOOK_URL || "http://hris-api:3001/api/zkteco/events";
const pollIntervalMs = Math.max(Number(process.env.ZKTECO_POLL_INTERVAL_SECONDS || 60), 10) * 1000;
const socketTimeoutMs = Number(process.env.ZKTECO_SOCKET_TIMEOUT_MS || 5200);
const inport = Number(process.env.ZKTECO_INPORT || 5000);
const reconnectMs = Math.max(Number(process.env.ZKTECO_RECONNECT_SECONDS || 10), 3) * 1000;
const dedupeMax = Math.max(Number(process.env.ZKTECO_DEDUPE_MAX || 5000), 100);

const seenEvents = new Map();
const devices = new Map(
	deviceIps.map((ip) => [
		ip,
		{
			ip,
			port: devicePort,
			connected: false,
			streaming: false,
			polling: false,
			connectAttempts: 0,
			webhookOk: 0,
			webhookFailed: 0,
			eventsSeen: 0,
			eventsPosted: 0,
			duplicateEvents: 0,
			lastConnectedAt: null,
			lastDisconnectedAt: null,
			lastPollAt: null,
			lastEventAt: null,
			lastPostedAt: null,
			lastError: null,
		},
	]),
);

const log = (...args) => console.log(new Date().toISOString(), ...args);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const toIsoOrNull = (value) => {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const pick = (...values) => values.find((value) => value !== undefined && value !== null && value !== "");

const normalizeAttendance = (raw) => {
	const timestamp = pick(raw.timestamp, raw.recordTime, raw.attendanceTime, raw.time, raw.punchTime);
	return {
		enrollNumber: String(pick(raw.enrollNumber, raw.userId, raw.userID, raw.deviceUserId, raw.uid, raw.pin) || "").trim(),
		userName: pick(raw.userName, raw.name, raw.employeeName) || "",
		timestamp: toIsoOrNull(timestamp) || new Date().toISOString(),
		verifyMethod: pick(raw.verifyMethod, raw.verifyMode, raw.type, raw.state, 0),
		verifyMethodName: String(pick(raw.verifyMethodName, raw.verifyModeName, raw.verifyMode, raw.type, "") || ""),
		attState: pick(raw.attState, raw.attendanceState, raw.inOutMode, raw.state, 0),
		attStateName: String(pick(raw.attStateName, raw.attendanceStateName, raw.inOutModeName, "") || ""),
		isValid: pick(raw.isValid, raw.valid, true) !== false,
		workCode: pick(raw.workCode, raw.work_code, 0),
		serialNo: pick(raw.serialNo, raw.sn, raw.id, raw.uid, ""),
	};
};

const eventKey = (ip, attendance) =>
	[
		ip,
		attendance.enrollNumber,
		attendance.timestamp,
		attendance.verifyMethod,
		attendance.attState,
		attendance.workCode,
		attendance.serialNo,
	].join("|");

const rememberEvent = (key) => {
	if (seenEvents.has(key)) return false;
	seenEvents.set(key, Date.now());
	if (seenEvents.size > dedupeMax) {
		const oldest = [...seenEvents.entries()]
			.sort((left, right) => left[1] - right[1])
			.slice(0, Math.ceil(dedupeMax / 10));
		oldest.forEach(([oldKey]) => seenEvents.delete(oldKey));
	}
	return true;
};

const postAttendance = async (state, raw) => {
	const attendance = normalizeAttendance(raw || {});
	const key = eventKey(state.ip, attendance);
	state.eventsSeen += 1;
	state.lastEventAt = attendance.timestamp;

	if (!rememberEvent(key)) {
		state.duplicateEvents += 1;
		return;
	}

	const body = {
		device: {
			type: "ZKTeco",
			ip: state.ip,
			port: state.port,
		},
		attendance,
		eventType: "AttendanceTransaction",
	};

	try {
		const response = await fetch(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		const text = await response.text();
		if (!response.ok) {
			throw new Error(`Webhook HTTP ${response.status}: ${text.slice(0, 240)}`);
		}
		state.webhookOk += 1;
		state.eventsPosted += 1;
		state.lastPostedAt = new Date().toISOString();
		state.lastError = null;
		log(`[${state.ip}] posted attendance enroll=${attendance.enrollNumber} time=${attendance.timestamp}`);
	} catch (error) {
		state.webhookFailed += 1;
		state.lastError = error.message || String(error);
		log(`[${state.ip}] webhook failed: ${state.lastError}`);
	}
};

const pollAttendances = async (zk, state) => {
	if (state.polling) return;
	state.polling = true;
	try {
		const rows = await zk.getAttendances();
		state.lastPollAt = new Date().toISOString();
		const attendances = Array.isArray(rows) ? rows : rows?.data || rows?.attendances || [];
		for (const row of attendances) {
			await postAttendance(state, row);
		}
	} catch (error) {
		state.lastError = error.message || String(error);
		log(`[${state.ip}] attendance poll failed: ${state.lastError}`);
	} finally {
		state.polling = false;
	}
};

const runDevice = async (ip) => {
	const state = devices.get(ip);
	while (true) {
		let zk = null;
		try {
			state.connectAttempts += 1;
			state.lastError = null;
			zk = new ZKJubaer(ip, state.port, socketTimeoutMs, inport);
			await zk.createSocket();
			state.connected = true;
			state.lastConnectedAt = new Date().toISOString();
			log(`[${ip}] connected on ${state.port}`);

			await pollAttendances(zk, state);
			const pollTimer = setInterval(() => {
				void pollAttendances(zk, state);
			}, pollIntervalMs);

			state.streaming = true;
			await zk.getRealTimeLogs((data) => {
				void postAttendance(state, data);
			});

			clearInterval(pollTimer);
		} catch (error) {
			state.lastError = error.message || String(error);
			log(`[${ip}] connection loop failed: ${state.lastError}`);
		} finally {
			state.connected = false;
			state.streaming = false;
			state.lastDisconnectedAt = new Date().toISOString();
			if (zk) {
				try {
					await zk.disconnect();
				} catch {
					// Best effort only; reconnect loop owns recovery.
				}
			}
		}
		await sleep(reconnectMs);
	}
};

const buildStatus = () => {
	const deviceList = [...devices.values()];
	const connectedCount = deviceList.filter((device) => device.connected).length;
	const lastEventAt = deviceList
		.map((device) => device.lastEventAt)
		.filter(Boolean)
		.sort()
		.at(-1) || null;
	return {
		service: "project-truth-zkteco-bridge",
		status: connectedCount > 0 ? "online" : "degraded",
		startedAt: startedAt.toISOString(),
		uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
		webhookUrl,
		devicePort,
		configuredDevices: deviceList.length,
		connectedDevices: connectedCount,
		lastEventAt,
		devices: deviceList,
	};
};

const server = http.createServer((req, res) => {
	if (req.url === "/health") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ ok: true }));
		return;
	}
	if (req.url === "/status") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify(buildStatus()));
		return;
	}
	res.writeHead(404, { "Content-Type": "application/json" });
	res.end(JSON.stringify({ error: "not_found" }));
});

server.listen(statusPort, "0.0.0.0", () => {
	log(`ZKTeco bridge status listening on ${statusPort}`);
	log(`Webhook URL: ${webhookUrl}`);
	log(`Devices: ${deviceIps.map((ip) => `${ip}:${devicePort}`).join(", ")}`);
});

for (const ip of deviceIps) {
	void runDevice(ip);
}
