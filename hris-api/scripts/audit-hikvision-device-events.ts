import { PrismaClient } from "../generated/prisma";
import { hikvisionFetch } from "../lib/hikvision-client";
import { hikvisionEndpoint } from "../config/hikvision.endpoint";
import { controller as callbackController } from "../app/hikvision/controller/callback.controller";
import {
	buildHikvisionDeviceEventDedupeKey,
	extractHikvisionEventData,
	getHikvisionClockSkewSecondsFromSystemTime,
	getHikvisionObservedClockSkewSeconds,
	isHikvisionBiometricVerificationEvent,
	normalizeHikvisionAcsEventListTimes,
	normalizeHikvisionDeviceEventSource,
	parseHikvisionBodyPayload,
	parseHikvisionEventTime,
} from "../helper/hikvision-event-contract.helper";

const prisma = new PrismaClient();

const parseArgs = () => {
	const args = process.argv.slice(2);
	const options: Record<string, string | boolean> = {};
	for (const arg of args) {
		if (arg.startsWith("--") && arg.includes("=")) {
			const [key, ...rest] = arg.slice(2).split("=");
			options[key] = rest.join("=");
		} else if (arg.startsWith("--")) {
			options[arg.slice(2)] = true;
		}
	}
	for (const [key, value] of Object.entries(process.env)) {
		if (!key.startsWith("npm_config_") || value === undefined) continue;
		const normalizedKey = key
			.slice("npm_config_".length)
			.replace(/_/g, "-")
			.replace(/^deviceid$/i, "deviceId");
		if (options[normalizedKey] === undefined) {
			options[normalizedKey] = value;
		}
	}
	const envOptionMap: Record<string, string> = {
		DEVICE_ID: "deviceId",
		HIKVISION_DEVICE_ID: "deviceId",
		HIKVISION_DEVICE_NAME: "deviceName",
		HIKVISION_DEVICE_ADDRESS: "deviceAddress",
		HIKVISION_DEVICE_PORT: "devicePort",
	};
	for (const [envName, optionName] of Object.entries(envOptionMap)) {
		if (!options[optionName] && process.env[envName]) {
			options[optionName] = String(process.env[envName]);
		}
	}
	return options;
};

const toManilaDate = (date: Date) =>
	new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Manila",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);

const loadLivePayload = async (options: Record<string, string | boolean>, deviceId: string) => {
	if (typeof options["live-json"] === "string") {
		const fs = await import("fs/promises");
		const raw = await fs.readFile(options["live-json"], "utf8");
		return JSON.parse(raw);
	}

	const from = String(
		options.from ||
			toManilaDate(new Date(Date.now() - 24 * 60 * 60 * 1000)),
	);
	const to = String(options.to || toManilaDate(new Date()));
	const limit = Math.min(Math.max(Number(options.limit || 100), 1), 200);

	return hikvisionFetch(hikvisionEndpoint.accessControl.acsEvent.list, {
		method: "POST",
		prisma,
		request: { organizationId: options.organizationId || undefined } as any,
		body: {
			deviceId,
			AcsEventCond: {
				searchID: String(options.searchID || `audit-${Date.now()}`),
				searchResultPosition: Number(options.position || 0),
				maxResults: limit,
				startTime: `${from}T00:00:00+08:00`,
				endTime: `${to}T23:59:59+08:00`,
				major: Number(options.major || 0),
				minor: Number(options.minor || 0),
				timeReverseOrder: true,
			},
		},
	});
};

const getAcsEvents = (payload: any) => {
	const acsEvent = payload?.data?.AcsEvent || payload?.AcsEvent || payload?.AcsEventSearch || {};
	return Array.isArray(acsEvent.InfoList) ? acsEvent.InfoList : [];
};

const getSerialNoFromPayload = (payload: any) =>
	payload?.serialNo ||
	payload?.AcsEventInfo?.serialNo ||
	payload?.EventNotificationAlert?.AccessControllerEvent?.serialNo ||
	payload?.AccessControllerEvent?.serialNo ||
	null;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getPositiveIntegerOption = (
	options: Record<string, string | boolean>,
	keys: string[],
	fallback = 0,
) => {
	for (const key of keys) {
		const value = Number(options[key]);
		if (Number.isFinite(value) && value > 0) return Math.floor(value);
	}
	return fallback;
};

const resolveCallbackUrl = (options: Record<string, string | boolean>) => {
	const configured = String(
		options["callback-url"] ||
			process.env.HIKVISION_CALLBACK_URL ||
			"",
	).trim();
	if (configured) return configured;
	if (process.env.KUBERNETES_SERVICE_HOST) {
		return "http://hris-api:3001/api/hikvision/callback";
	}
	return "";
};

const callCallback = async (payload: Record<string, any>) => {
	const ctrl = callbackController(prisma);
	let statusCode = 200;
	let jsonBody: any = null;
	const req = {
		body: payload,
		query: {},
		get: () => "application/json",
	} as any;
	const res = {
		status(code: number) {
			statusCode = code;
			return this;
		},
		json(body: any) {
			jsonBody = body;
			return this;
		},
	} as any;

	await ctrl.handleCallback(req, res, (() => undefined) as any);
	return { statusCode, body: jsonBody };
};

const postCallback = async (
	payload: Record<string, any>,
	options: Record<string, string | boolean>,
) => {
	const callbackUrl = resolveCallbackUrl(options);
	if (!callbackUrl) return callCallback(payload);

	const response = await fetch(callbackUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	let body: any = null;
	try {
		body = await response.json();
	} catch {
		body = await response.text();
	}
	return { statusCode: response.status, body };
};

const isHikvisionDevice = (device: any) => {
	const config = (device?.config || {}) as Record<string, any>;
	const haystack = [
		device?.name,
		device?.source,
		device?.vendor,
		config.vendor,
		config.source,
		config.model,
	]
		.map((value) => String(value || "").toLowerCase())
		.join(" ");
	return haystack.includes("hikvision") || haystack.includes("vendor/hikvision-linux");
};

const resolveAuditDevice = async (options: Record<string, string | boolean>) => {
	const deviceId = String(options.deviceId || "").trim();
	const deviceName = String(options.deviceName || options["device-name"] || "").trim();
	const deviceAddress = String(
		options.deviceAddress || options["device-address"] || "",
	).trim();
	const devicePort = Number(options.devicePort || options["device-port"] || 0);

	const select = {
		id: true,
		organizationId: true,
		name: true,
		address: true,
		port: true,
		protocol: true,
		config: true,
	};
	const candidates = [
		deviceId ? { id: deviceId, isDeleted: false } : null,
		deviceName && deviceAddress && devicePort
			? { name: deviceName, address: deviceAddress, port: devicePort, isDeleted: false }
			: null,
		deviceName && deviceAddress
			? { name: deviceName, address: deviceAddress, isDeleted: false }
			: null,
		deviceAddress && devicePort
			? { address: deviceAddress, port: devicePort, isDeleted: false }
			: null,
		deviceName ? { name: deviceName, isDeleted: false } : null,
	].filter(Boolean) as any[];

	if (candidates.length === 0) {
		throw new Error(
			"Missing device selector: provide --deviceId=<id>, --deviceName=<name>, or --deviceAddress=<address>",
		);
	}

	for (const where of candidates) {
		const device = await prisma.device.findFirst({ where, select });
		if (device) return device;
	}

	throw new Error(
		`Device not found for selector: ${JSON.stringify({
			deviceId: deviceId || undefined,
			deviceName: deviceName || undefined,
			deviceAddress: deviceAddress || undefined,
			devicePort: devicePort || undefined,
		})}`,
	);
};

const resolveAuditDevices = async (options: Record<string, string | boolean>) => {
	const allHikvision = options["all-hikvision"] === true || options.allHikvision === true;
	if (!allHikvision) return [await resolveAuditDevice(options)];

	const devices = await (prisma as any).device.findMany({
		where: { isDeleted: false },
		select: {
			id: true,
			organizationId: true,
			name: true,
			address: true,
			port: true,
			protocol: true,
			config: true,
		},
		orderBy: { name: "asc" },
	});
	const hikvisionDevices = devices.filter(isHikvisionDevice);
	if (hikvisionDevices.length === 0) {
		throw new Error("No configured Hikvision devices found in HRIS device config.");
	}
	return hikvisionDevices;
};

const runAuditForDevice = async (
	options: Record<string, string | boolean>,
	device: Awaited<ReturnType<typeof resolveAuditDevice>>,
) => {
	const apply = options.apply === true;
	const targetUnsaved = getPositiveIntegerOption(options, [
		"target-unsaved",
		"targetUnsaved",
		"target",
	]);
	const deviceId = device.id;

	if (!options.organizationId) {
		options.organizationId = device.organizationId;
	}

	const livePayload = await loadLivePayload(options, deviceId);
	const rawLiveEvents = getAcsEvents(livePayload);
	const knownSkewSeconds = Number((device.config as any)?.hikvisionClockSkewSeconds || 0);
	const allowClockSkewCorrection =
		(device.config as any)?.hikvisionAllowClockSkewCorrection === true;
	let deviceClockSkewSeconds = 0;
	try {
		const timePayload = await hikvisionFetch(hikvisionEndpoint.system.time, {
			method: "GET",
			prisma,
			deviceId,
			request: { organizationId: device.organizationId } as any,
		});
		deviceClockSkewSeconds = getHikvisionClockSkewSecondsFromSystemTime(timePayload);
	} catch {
		deviceClockSkewSeconds = 0;
	}
	const observedSkewSeconds = getHikvisionObservedClockSkewSeconds(rawLiveEvents);
	const skewSeconds = allowClockSkewCorrection
		? deviceClockSkewSeconds || knownSkewSeconds || observedSkewSeconds
		: 0;
	if (allowClockSkewCorrection && skewSeconds > 0 && skewSeconds !== knownSkewSeconds) {
		await (prisma as any).device.update({
			where: { id: device.id },
			data: {
				config: {
					...((device.config as any) || {}),
					hikvisionClockSkewSeconds: skewSeconds,
					hikvisionClockSkewObservedAt: new Date().toISOString(),
				},
			},
		});
		(device as any).config = {
			...((device.config as any) || {}),
			hikvisionClockSkewSeconds: skewSeconds,
		};
	}
	const liveEvents = normalizeHikvisionAcsEventListTimes(
		rawLiveEvents,
		new Date(),
		skewSeconds,
		{
			allowStoredSkew: allowClockSkewCorrection,
			allowAutoAdjust: allowClockSkewCorrection,
		},
	);
	const normalized = liveEvents.map((item: any) => {
		const payload = parseHikvisionBodyPayload({
			deviceId,
			deviceIP: device.address,
			AcsEventInfo: item,
		});
		const event = extractHikvisionEventData(payload);
		const employeeNo = String(event.employeeNo || "").trim();
		const eventTime = parseHikvisionEventTime(event.time);
		const source = normalizeHikvisionDeviceEventSource(event.source);
		const dedupeKey = buildHikvisionDeviceEventDedupeKey({
			deviceId,
			source,
			eventTime,
			employeeNo,
			event,
		});
		return { raw: item, payload, event, employeeNo, eventTime, source, dedupeKey };
	});

	const dedupeKeys = normalized.map((item) => item.dedupeKey);
	const savedEvents = dedupeKeys.length
		? await (prisma as any).deviceEvent.findMany({
				where: {
					organizationId: device.organizationId,
					deviceId,
					dedupeKey: { in: dedupeKeys },
				},
				select: {
					id: true,
					dedupeKey: true,
					status: true,
					employeeNo: true,
					employeeId: true,
					attendanceId: true,
					eventTime: true,
					payload: true,
				},
			})
		: [];
	const employeeNos = Array.from(
		new Set(normalized.map((item) => item.employeeNo).filter(Boolean)),
	);
	const serialNos = Array.from(
		new Set(normalized.map((item) => String(item.event.serialNo || "").trim()).filter(Boolean)),
	);
	const eventTimes = normalized.map((item) => item.eventTime.getTime());
	const candidateStart = eventTimes.length ? new Date(Math.min(...eventTimes) - 24 * 60 * 60 * 1000) : null;
	const candidateEnd = eventTimes.length ? new Date(Math.max(...eventTimes) + 24 * 60 * 60 * 1000) : null;
	const serialCandidates =
		employeeNos.length && serialNos.length && candidateStart && candidateEnd
			? await (prisma as any).deviceEvent.findMany({
					where: {
						organizationId: device.organizationId,
						deviceId,
						employeeNo: { in: employeeNos },
						eventTime: { gte: candidateStart, lte: candidateEnd },
					},
					select: {
						id: true,
						dedupeKey: true,
						status: true,
						employeeNo: true,
						employeeId: true,
						attendanceId: true,
						eventTime: true,
						payload: true,
					},
					orderBy: { receivedAt: "desc" },
					take: 500,
				})
			: [];
	const savedByKey = new Map(savedEvents.map((event: any) => [event.dedupeKey, event]));
	const savedBySerial = new Map<string, any>();
	for (const event of [...serialCandidates, ...savedEvents]) {
		const serial = String(getSerialNoFromPayload(event.payload) || "").trim();
		if (event.employeeNo && serial) {
			savedBySerial.set(`${event.employeeNo}|${serial}`, event);
		}
	}
	for (const item of normalized) {
		const serial = String(item.event.serialNo || "").trim();
		const serialMatch = serial ? savedBySerial.get(`${item.employeeNo}|${serial}`) : null;
		if (serialMatch && !savedByKey.has(item.dedupeKey)) {
			savedByKey.set(item.dedupeKey, serialMatch);
		}
	}
	const missing = normalized.filter((item) => !savedByKey.has(item.dedupeKey));
	const needsClockNormalization = normalized.filter((item) => {
		const serial = String(item.event.serialNo || "").trim();
		if (!serial || !item.employeeNo) return false;
		const serialMatch = savedBySerial.get(`${item.employeeNo}|${serial}`);
		return serialMatch && serialMatch.dedupeKey !== item.dedupeKey;
	});
	const missingWithEmployeeNo = missing.filter((item) => item.employeeNo);
	const missingVisibleBiometric = missing.filter(
		(item) => !item.employeeNo && isHikvisionBiometricVerificationEvent(item.event),
	);
	const missingEmployeeNo = missing.filter(
		(item) => !item.employeeNo && !isHikvisionBiometricVerificationEvent(item.event),
	);

	const applied: any[] = [];
	if (apply) {
		const applyCandidates = [
			...missingWithEmployeeNo,
			...missingVisibleBiometric,
			...needsClockNormalization,
		];
		for (const item of (targetUnsaved > 0 ? applyCandidates.slice(0, targetUnsaved) : applyCandidates)) {
			const reason = missingWithEmployeeNo.includes(item)
				? "missing"
				: missingVisibleBiometric.includes(item)
					? "visible_biometric_missing_employee_no"
					: "clock_normalization";
			applied.push({
				dedupeKey: item.dedupeKey,
				employeeNo: item.employeeNo,
				eventTime: item.eventTime.toISOString(),
				reason,
				result: await postCallback(item.payload, options),
			});
		}
	}

	const postApplySavedCount = apply
		? liveEvents.length - missingEmployeeNo.length
		: savedByKey.size;

	const report = {
		mode: apply ? "apply" : "dry-run",
		checkedAt: new Date().toISOString(),
		target: {
			unsaved: targetUnsaved || null,
			appliesAtMostTarget: apply && targetUnsaved > 0,
			note:
				targetUnsaved > 0
					? "This checks the latest ACS page from the device and compares fingerprints against HRIS; Hikvision does not filter by HRIS-unsaved server-side."
					: null,
		},
		device: {
			id: device.id,
			organizationId: device.organizationId,
			name: device.name,
			address: device.address,
			port: device.port,
			protocol: device.protocol,
			hikvisionClockSkewSeconds: Number(
				((device as any).config as any)?.hikvisionClockSkewSeconds || 0,
			),
		},
		live: {
			total: liveEvents.length,
			withEmployeeNo: normalized.filter((item) => item.employeeNo).length,
			withoutEmployeeNo: normalized.filter((item) => !item.employeeNo).length,
		},
		saved: {
			matchingBeforeApply: savedByKey.size,
			matchingAfterApply: postApplySavedCount,
		},
		gap: {
			missing: missing.length,
			missingWithEmployeeNo: missingWithEmployeeNo.length,
			missingVisibleBiometric: missingVisibleBiometric.length,
			missingEmployeeNo: missingEmployeeNo.length,
			needsClockNormalization: needsClockNormalization.length,
			sample: missing.slice(0, 10).map((item) => ({
				dedupeKey: item.dedupeKey,
				employeeNo: item.employeeNo || null,
				eventTime: item.eventTime.toISOString(),
				major: item.event.major ?? null,
				minor: item.event.minor ?? null,
				doorNo: item.event.doorNo ?? null,
				verifyMode: item.event.verifyMode ?? null,
				serialNo: item.event.serialNo ?? null,
			})),
		},
		applied,
	};

	return report;
};

const runAudit = async (options: Record<string, string | boolean>) => {
	const devices = await resolveAuditDevices(options);
	if (devices.length === 1) {
		return runAuditForDevice(options, devices[0]);
	}

	const reports = [];
	for (const device of devices) {
		reports.push(await runAuditForDevice({ ...options, organizationId: device.organizationId }, device));
	}
	const totals = reports.reduce(
		(acc, report) => {
			acc.live += report.live.total;
			acc.missing += report.gap.missing;
			acc.missingWithEmployeeNo += report.gap.missingWithEmployeeNo;
			acc.applied += report.applied.length;
			return acc;
		},
		{ live: 0, missing: 0, missingWithEmployeeNo: 0, applied: 0 },
	);

	return {
		mode: options.apply === true ? "apply" : "dry-run",
		checkedAt: new Date().toISOString(),
		scope: "all-configured-hikvision-devices",
		deviceCount: reports.length,
		totals,
		reports,
	};
};

const main = async () => {
	const options = parseArgs();
	const watch = options.watch === true;
	const intervalSeconds = Math.min(Math.max(Number(options.interval || 10), 3), 120);
	const maxLoops = Math.max(Number(options.loops || 0), 0);
	const untilClean = options["until-clean"] === true;
	let loop = 0;
	let sawLiveEvents = false;

	do {
		loop += 1;
		const report = await runAudit(options);
		const liveTotal =
			"live" in report
				? report.live.total
				: "totals" in report
					? report.totals.live
					: 0;
		const missingWithEmployeeNo =
			"gap" in report
				? report.gap.missingWithEmployeeNo
				: "totals" in report
					? report.totals.missingWithEmployeeNo
					: 0;
		sawLiveEvents = sawLiveEvents || liveTotal > 0;
		console.log(JSON.stringify({ loop, ...report }, null, 2));

		if (!watch) break;
		if (untilClean && sawLiveEvents && missingWithEmployeeNo === 0) break;
		if (maxLoops > 0 && loop >= maxLoops) break;

		await wait(intervalSeconds * 1000);
	} while (true);
};

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
