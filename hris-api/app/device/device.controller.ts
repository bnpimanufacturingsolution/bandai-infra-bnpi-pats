import { Request, Response, NextFunction } from "express";
import * as XLSX from "xlsx";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { getLogger } from "../../helper/logger.helper";
import { transformFormDataToObject } from "../../helper/transformObject";
import { validateQueryParams } from "../../helper/validation-helper";
import {
	buildFilterConditions,
	buildFindManyQuery,
	buildSearchConditions,
	getNestedFields,
} from "../../helper/query-builder.helper";
import { buildSuccessResponse, buildPagination } from "../../helper/success-handler.helper";
import { groupDataByField } from "../../helper/dataGrouping";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import { CreateDeviceSchema, UpdateDeviceSchema } from "../../zod/device.zod";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { config as appConfig } from "../../config/config";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { createEmployeeHelpers } from "../../helper/employee.helper";
import { parseHikvisionBusinessDateBound } from "../../helper/hikvision-event-contract.helper";
import { hikvisionEndpoint } from "../../config/hikvision.endpoint";
import {
	buildHikvisionDeviceBaseUrl,
	getHikvisionDeviceHttpPort,
	hikvisionFetch,
} from "../../lib/hikvision-client";
import { controller as callbackController } from "../hikvision/controller/callback.controller";
import net from "net";
import { execFile } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";

const logger = getLogger();
const deviceLogger = logger.child({ module: "device" });
const DEVICE_EVENT_STATUSES = new Set([
	"RECEIVED",
	"MATCHED",
	"ATTENDANCE_CREATED",
	"ATTENDANCE_UPDATED",
	"IGNORED",
	"UNMATCHED",
	"FAILED",
]);
const DEVICE_EVENT_SOURCES = new Set([
	"HIKVISION_CALLBACK",
	"EN_HCNETSDK_ALARM",
	"ZKTECO_EVENT",
]);
const DEVICE_EVENT_RESET_ADMIN_ROLES = new Set(["hris-admin", "admin", "super_admin", "superadmin"]);

type DeviceImportJobStatus = "processing" | "completed" | "failed";

type DeviceImportJob = {
	jobId: string;
	status: DeviceImportJobStatus;
	organizationId: string;
	deviceId: string;
	deviceName: string;
	total: number;
	processed: number;
	imported: number;
	skipped: number;
	failed: number;
	message: string;
	errors: Array<{ row: number; error: string }>;
	startedAt: Date;
	completedAt?: Date;
};

const deviceImportJobs = new Map<string, DeviceImportJob>();

const cleanupDeviceImportJobs = () => {
	const cutoff = Date.now() - 60 * 60 * 1000;
	for (const [jobId, job] of deviceImportJobs.entries()) {
		if (job.startedAt.getTime() < cutoff) deviceImportJobs.delete(jobId);
	}
};

const updateDeviceImportJob = (jobId: string, patch: Partial<Omit<DeviceImportJob, "jobId">>) => {
	const job = deviceImportJobs.get(jobId);
	if (!job) return;
	deviceImportJobs.set(jobId, { ...job, ...patch });
};

export const controller = (prisma: PrismaClient) => {
	// Initialize employee helpers for auth service communication
	const helpers = createEmployeeHelpers(prisma, deviceLogger);

	const resolveEmployeeForUser = async (
		organizationId: string,
		userId: string,
		employeeIdFromMetadata?: string,
	) => {
		if (employeeIdFromMetadata) {
			const employeeById = await prisma.employee.findFirst({
				where: {
					id: employeeIdFromMetadata,
					organizationId,
					isDeleted: false,
				},
				select: { id: true },
			});
			if (employeeById) return employeeById;
		}

		return prisma.employee.findFirst({
			where: {
				organizationId,
				userId,
				isDeleted: false,
			},
			select: { id: true },
		});
	};

	const getEmployeeDisplayName = (employee: any) => {
		const personalInfo = employee?.person?.personalInfo || {};
		return [
			personalInfo.firstName,
			personalInfo.middleName,
			personalInfo.lastName,
		]
			.map((part) => String(part || "").trim())
			.filter(Boolean)
			.join(" ")
			.trim();
	};

	const buildEventEmployeeSnapshot = (employee: any) => ({
		id: employee.id,
		employeeId: employee.employeeId,
		deviceEmpId: employee.deviceEmpId,
		fullName: getEmployeeDisplayName(employee) || employee.employeeId,
	});

	const checkTcpReachability = (
		host: string,
		port: number,
		timeoutMs = 2500,
	): Promise<{ ok: boolean; latencyMs: number | null; error?: string }> =>
		new Promise((resolve) => {
			const startedAt = Date.now();
			const socket = new net.Socket();
			let settled = false;
			const finish = (ok: boolean, error?: string) => {
				if (settled) return;
				settled = true;
				socket.destroy();
				resolve({
					ok,
					latencyMs: ok ? Date.now() - startedAt : null,
					...(error ? { error } : {}),
				});
			};
			socket.setTimeout(timeoutMs);
			socket.once("connect", () => finish(true));
			socket.once("timeout", () => finish(false, `Timed out after ${timeoutMs}ms`));
			socket.once("error", (error) => finish(false, error.message));
			socket.connect(port, host);
		});

	const checkWindowsProcess = (
		processName: string,
	): Promise<{
		ok: boolean;
		status: "running" | "not_running" | "unknown";
		pid?: number;
		error?: string;
	}> =>
		new Promise((resolve) => {
			if (process.platform !== "win32") {
				resolve({ ok: false, status: "unknown", error: "Process check is Windows-only" });
				return;
			}
			execFile(
				"tasklist",
				["/FI", `IMAGENAME eq ${processName}`, "/FO", "CSV", "/NH"],
				{ timeout: 2500 },
				(error, stdout) => {
					if (error) {
						resolve({ ok: false, status: "unknown", error: error.message });
						return;
					}
					const line = stdout
						.split(/\r?\n/)
						.map((item) => item.trim())
						.find((item) => item && !item.includes("INFO:"));
					const pid = line?.match(/^"[^"]+","(\d+)"/i)?.[1];
					resolve(
						pid
							? { ok: true, status: "running", pid: Number(pid) }
							: { ok: false, status: "not_running" },
					);
				},
			);
		});

	const isZktecoDevice = (device: {
		name?: string | null;
		protocol?: string | null;
		port?: number | null;
		config?: Prisma.JsonValue | null;
	}) => {
		const configValue = device.config as any;
		const vendor = String(configValue?.vendor || configValue?.type || "").toLowerCase();
		const name = String(device.name || "").toLowerCase();
		return (
			vendor.includes("zkteco") ||
			name.includes("zkteco") ||
			(String(device.protocol || "").toLowerCase() === "tcp" && Number(device.port) === 4370)
		);
	};

	const isHikvisionDevice = (device: {
		name?: string | null;
		config?: Prisma.JsonValue | null;
	}) => {
		const configValue = device.config as any;
		const vendor = String(configValue?.vendor || configValue?.type || configValue?.source || "").toLowerCase();
		const name = String(device.name || "").toLowerCase();
		return vendor.includes("hikvision") || name.includes("hikvision") || name.includes("entrance");
	};

	const getHealthStatus = (checks: Array<{ ok: boolean }>) => {
		const onlineCount = checks.filter((check) => check.ok).length;
		if (onlineCount === checks.length) return "online";
		if (onlineCount > 1) return "degraded";
		return "offline";
	};

	const getZktecoBridgeStatusUrl = () => {
		const configuredUrl = String(process.env.ZKTECO_BRIDGE_STATUS_URL || "").trim();
		if (configuredUrl) return configuredUrl;
		const nodeHostIp = String(process.env.NODE_HOST_IP || "").trim();
		if (nodeHostIp) return `http://${nodeHostIp}:4371/status`;
		return "";
	};

	const getZktecoBridgeStatus = async () => {
		const statusUrl = getZktecoBridgeStatusUrl();
		if (!statusUrl) {
			return {
				ok: false,
				status: "not_configured",
				statusUrl: null,
				latencyMs: null,
				data: null,
				error: "ZKTECO_BRIDGE_STATUS_URL is not configured",
			};
		}
		const timeoutMs = Number(process.env.ZKTECO_BRIDGE_STATUS_TIMEOUT_MS || 10000);
		const startedAt = Date.now();
		try {
			const response = await fetch(statusUrl, {
				method: "GET",
				signal: AbortSignal.timeout(timeoutMs),
			});
			const data = await response.json().catch(() => null);
			return {
				ok: response.ok,
				status: response.ok ? data?.status || "online" : "offline",
				statusUrl,
				latencyMs: Date.now() - startedAt,
				data,
				...(response.ok ? {} : { error: `HTTP ${response.status}` }),
			};
		} catch (error: any) {
			return {
				ok: false,
				status: "offline",
				statusUrl,
				latencyMs: null,
				data: null,
				error: error?.message || "ZKTeco SDK sidecar status did not respond",
			};
		}
	};

	const getZktecoBridgePreview = async (deviceIp?: string | null) => {
		const statusUrl = getZktecoBridgeStatusUrl();
		if (!statusUrl) {
			return {
				ok: false,
				status: "not_configured",
				statusUrl: null,
				data: null,
				error: "ZKTECO_BRIDGE_STATUS_URL is not configured",
			};
		}

		const previewUrl = new URL(statusUrl);
		previewUrl.pathname = previewUrl.pathname.replace(/\/status\/?$/, "/preview");
		if (deviceIp) previewUrl.searchParams.set("deviceIp", deviceIp);

		const timeoutMs = Number(process.env.ZKTECO_BRIDGE_PREVIEW_TIMEOUT_MS || 180000);
		try {
			const response = await fetch(previewUrl.toString(), {
				method: "GET",
				signal: AbortSignal.timeout(timeoutMs),
			});
			const data = await response.json().catch(() => null);
			return {
				ok: response.ok,
				status: response.ok ? data?.status || "previewed" : "failed",
				statusUrl: previewUrl.toString(),
				data,
				...(response.ok ? {} : { error: `HTTP ${response.status}` }),
			};
		} catch (error: any) {
			return {
				ok: false,
				status: "offline",
				statusUrl: previewUrl.toString(),
				data: null,
				error: error?.message || "ZKTeco SDK sidecar preview did not respond",
			};
		}
	};

	const postZktecoBridgeSync = async (deviceIp?: string | null) => {
		const statusUrl = getZktecoBridgeStatusUrl();
		if (!statusUrl) {
			return {
				ok: false,
				status: "not_configured",
				statusUrl: null,
				data: null,
				error: "ZKTECO_BRIDGE_STATUS_URL is not configured",
			};
		}

		const syncUrl = new URL(statusUrl);
		syncUrl.pathname = syncUrl.pathname.replace(/\/status\/?$/, "/sync");
		if (deviceIp) syncUrl.searchParams.set("deviceIp", deviceIp);

		const timeoutMs = Number(process.env.ZKTECO_BRIDGE_SYNC_TIMEOUT_MS || 90000);
		try {
			const response = await fetch(syncUrl.toString(), {
				method: "POST",
				signal: AbortSignal.timeout(timeoutMs),
			});
			const data = await response.json().catch(() => null);
			return {
				ok: response.ok,
				status: response.ok ? data?.status || "started" : "failed",
				statusUrl: syncUrl.toString(),
				data,
				...(response.ok ? {} : { error: `HTTP ${response.status}` }),
			};
		} catch (error: any) {
			return {
				ok: false,
				status: "offline",
				statusUrl: syncUrl.toString(),
				data: null,
				error: error?.message || "ZKTeco SDK sidecar sync did not respond",
			};
		}
	};

	const firstNumericValueForKeys = (value: unknown, keys: string[]): number | null => {
		if (!value || typeof value !== "object") return null;
		const record = value as Record<string, unknown>;
		for (const key of keys) {
			const direct = record[key];
			if (direct !== undefined && direct !== null && Number.isFinite(Number(direct))) {
				return Number(direct);
			}
		}
		for (const nested of Object.values(record)) {
			const found = firstNumericValueForKeys(nested, keys);
			if (found !== null) return found;
		}
		return null;
	};

	const readHikvisionSearchTotal = (data: unknown, envelopeKey: string) => {
		const payload = data && typeof data === "object" ? (data as any) : {};
		const envelope = payload?.[envelopeKey] || payload?.data?.[envelopeKey] || payload;
		return firstNumericValueForKeys(envelope, [
			"totalMatches",
			"numOfMatches",
			"totalNum",
			"totalNumber",
			"total",
			"eventTotal",
		]);
	};

	const formatHikvisionManilaDateTime = (date: Date) => {
		const parts = new Intl.DateTimeFormat("en-CA", {
			timeZone: "Asia/Manila",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		})
			.formatToParts(date)
			.reduce<Record<string, string>>((acc, part) => {
				if (part.type !== "literal") acc[part.type] = part.value;
				return acc;
			}, {});
		return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`;
	};

	const getProjectRuntimeRoot = () => {
		const cwd = process.cwd();
		if (path.basename(cwd).toLowerCase() === "hris-api") {
			return path.resolve(cwd, "..", ".runtime");
		}
		return path.resolve(cwd, ".runtime");
	};

	const serializeForJson = (value: unknown) =>
		JSON.parse(
			JSON.stringify(value, (_key, innerValue) =>
				typeof innerValue === "bigint" ? innerValue.toString() : innerValue,
			),
		);

	const writeJsonFile = async (filePath: string, value: unknown) => {
		await fs.writeFile(filePath, `${JSON.stringify(serializeForJson(value), null, 2)}\n`, "utf8");
	};

	const buildDeviceEventResetScope = (req: Request, organizationId: string) => {
		const body = (req.body || {}) as Record<string, unknown>;
		const deviceId = String(body.deviceId || req.query.deviceId || "").trim();
		const source = String(body.source || req.query.source || "").trim();
		const status = String(body.status || req.query.status || "").trim();
		const from = String(body.from || req.query.from || "").trim();
		const to = String(body.to || req.query.to || "").trim();
		const dateField = String(body.dateField || req.query.dateField || "eventTime").trim();
		const where: Prisma.DeviceEventWhereInput = {
			organizationId,
		};

		if (deviceId && deviceId !== "all") where.deviceId = deviceId;
		if (source && source !== "all" && DEVICE_EVENT_SOURCES.has(source)) {
			where.source = source as any;
		}
		if (status && status !== "all" && DEVICE_EVENT_STATUSES.has(status)) {
			where.status = status as any;
		}

		const eventTimeFilter: Prisma.DateTimeFilter = {};
		const receivedAtFilter: Prisma.DateTimeFilter = {};
		const targetFilter = dateField === "receivedAt" ? receivedAtFilter : eventTimeFilter;
		if (from) {
			const fromDate = parseHikvisionBusinessDateBound(from);
			if (fromDate) targetFilter.gte = fromDate;
		}
		if (to) {
			const toDate = parseHikvisionBusinessDateBound(to, true);
			if (toDate) targetFilter.lte = toDate;
		}
		if (Object.keys(eventTimeFilter).length) where.eventTime = eventTimeFilter;
		if (Object.keys(receivedAtFilter).length) where.receivedAt = receivedAtFilter;

		return {
			where,
			scope: {
				organizationId,
				deviceId: deviceId || "all",
				source: source || "all",
				status: status || "all",
				from: from || null,
				to: to || null,
				dateField: dateField === "receivedAt" ? "receivedAt" : "eventTime",
			},
		};
	};

	const getHikvisionCountFromSearch = async (
		req: Request,
		deviceId: string,
		endpoint: string,
		body: Record<string, unknown>,
		keys: string[],
	) => {
		try {
			const data = await hikvisionFetch(endpoint, {
				method: "POST",
				deviceId,
				prisma,
				request: req,
				timeoutMs: 10000,
				headers: { "Content-Type": "application/json" },
				body,
			});
			const envelopeKey =
				(data as any)?.AcsEvent || (data as any)?.data?.AcsEvent
					? "AcsEvent"
					: "UserInfoSearch";
			return {
				ok: true,
				count: readHikvisionSearchTotal(data, envelopeKey) ?? firstNumericValueForKeys(data, keys),
				raw: data,
			};
		} catch (error: any) {
			return {
				ok: false,
				count: null,
				error:
					error?.data?.errorCode ||
					error?.data?.errorCause ||
					error?.message ||
					"Hikvision count request did not respond",
			};
		}
	};

	const getHikvisionSourceCounts = async (req: Request, deviceId: string) => {
		const startedAt = Date.now();
		const endTime = formatHikvisionManilaDateTime(new Date(Date.now() + 60 * 1000));
		const [userSearch, eventSearch] = await Promise.all([
			getHikvisionCountFromSearch(
				req,
				deviceId,
				hikvisionEndpoint.accessControl.userInfo.search,
				{
					UserInfoSearchCond: {
						searchID: `hris-user-count-${Date.now()}`,
						searchResultPosition: 0,
						maxResults: 1,
					},
				},
				["totalMatches", "numOfMatches", "totalNum", "totalNumber", "total"],
			),
			getHikvisionCountFromSearch(
				req,
				deviceId,
				hikvisionEndpoint.accessControl.acsEvent.list,
				{
					AcsEventCond: {
						searchID: `hris-event-count-${Date.now()}`,
						searchResultPosition: 0,
						maxResults: 1,
						major: 0,
						minor: 0,
						startTime: "2000-01-01T00:00:00+08:00",
						endTime,
					},
				},
				["totalMatches", "numOfMatches", "totalNum", "totalNumber", "total", "eventTotal"],
			),
		]);

		return {
			ok: userSearch.ok || eventSearch.ok,
			totalEvents: eventSearch.count,
			userCount: userSearch.count,
			latencyMs: Date.now() - startedAt,
			raw: {
				userSearch: userSearch.raw,
				eventSearch: eventSearch.raw,
			},
			error:
				eventSearch.ok || userSearch.ok
					? null
					: eventSearch.error || userSearch.error || "Hikvision device counts did not respond",
		};
	};

	const getHikvisionSourceTotal = async (req: Request, deviceId: string) => {
		const directCounts = await getHikvisionSourceCounts(req, deviceId);
		if (directCounts.ok && (directCounts.totalEvents !== null || directCounts.userCount !== null)) {
			return directCounts;
		}

		try {
			const data = await hikvisionFetch(hikvisionEndpoint.accessControl.acsEventTotalNum.get, {
				method: "GET",
				deviceId,
				prisma,
				request: req,
				timeoutMs: 3500,
			});
			return {
				ok: true,
				totalEvents: firstNumericValueForKeys(data, [
					"totalNum",
					"totalNumber",
					"total",
					"eventTotal",
					"eventTotalNum",
				]),
				userCount: directCounts.userCount,
				latencyMs: directCounts.latencyMs,
				raw: data,
			};
		} catch (error: any) {
			return {
				ok: false,
				totalEvents: null,
				userCount: directCounts.userCount,
				latencyMs: directCounts.latencyMs,
				error:
					directCounts.error ||
					error?.data?.errorCode ||
					error?.data?.errorCause ||
					error?.message ||
					"Hikvision ACS total number did not respond",
			};
		}
	};

	const getBridgeDeviceStatus = (bridgeStatus: any, address: string) => {
		const devices = Array.isArray(bridgeStatus?.data?.devices)
			? bridgeStatus.data.devices
			: [];
		return devices.find((item: any) => String(item?.ip || "").trim() === address) || null;
	};

	const triggerZktecoAttendanceSync = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const deviceId = String((req.body as any)?.deviceId || (req.query as any)?.deviceId || "").trim();
			let deviceIp = String((req.body as any)?.deviceIp || (req.query as any)?.deviceIp || "").trim();

			if (deviceId && !deviceIp) {
				const device = await (prisma as any).device.findFirst({
					where: { id: deviceId, isDeleted: false },
					select: { address: true },
				});
				deviceIp = String(device?.address || "").trim();
			}

			const result = await postZktecoBridgeSync(deviceIp || null);
			if (!result.ok) {
				res.status(result.status === "failed" ? 409 : 502).json(
					buildErrorResponse(result.error || "Failed to start ZKTeco sync", 502),
				);
				return;
			}

			res.status(202).json(
				buildSuccessResponse(
					"ZKTeco attendance sync started",
					{
						sync: result.data,
						statusUrl: result.statusUrl,
					},
					202,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to start ZKTeco sync", 500),
			);
		}
	};

	const getAcsEventList = (data: any): any[] => {
		const events = data?.AcsEvent?.InfoList;
		return Array.isArray(events) ? events : [];
	};

	const getHikvisionImportProgress = (jobId: string) => {
		cleanupDeviceImportJobs();
		return deviceImportJobs.get(jobId) || null;
	};

	const processHikvisionImportJob = async (params: {
		jobId: string;
		req: Request;
		device: any;
		totalHint: number;
	}) => {
		const { jobId, req, device, totalHint } = params;
		const ctrl = callbackController(prisma);
		const pageSize = Math.max(
			1,
			Math.min(Number(process.env.HIKVISION_IMPORT_PAGE_SIZE || 50), 200),
		);
		const maxEvents = Math.max(
			1,
			Math.min(Number(process.env.HIKVISION_IMPORT_MAX_EVENTS || totalHint || 1000), 10000),
		);
		const endTime = formatHikvisionManilaDateTime(new Date(Date.now() + 60 * 1000));
		let position = 0;
		let processed = 0;
		let imported = 0;
		let skipped = 0;
		let failed = 0;

		try {
			updateDeviceImportJob(jobId, {
				total: Math.min(totalHint || maxEvents, maxEvents),
				message: "Reading device logs",
			});

			while (processed < maxEvents) {
				const payload = {
					AcsEventCond: {
						searchID: `${jobId}-${position}`,
						searchResultPosition: position,
						maxResults: Math.min(pageSize, maxEvents - processed),
						major: 0,
						minor: 0,
						startTime: "2000-01-01T00:00:00+08:00",
						endTime,
						timeReverseOrder: true,
					},
				};
				const data = await hikvisionFetch(hikvisionEndpoint.accessControl.acsEvent.list, {
					method: "POST",
					deviceId: device.id,
					prisma,
					request: req,
					timeoutMs: 10000,
					headers: { "Content-Type": "application/json" },
					body: payload,
				});
				const pageEvents = getAcsEventList(data);
				const totalFromDevice = firstNumericValueForKeys(data, [
					"totalMatches",
					"numOfMatches",
					"totalNum",
					"total",
				]);
				if (totalFromDevice !== null) {
					updateDeviceImportJob(jobId, {
						total: Math.min(Number(totalFromDevice), maxEvents),
					});
				}
				if (!pageEvents.length) break;

				for (const event of pageEvents) {
					processed += 1;
					const employeeNo = String(event?.employeeNoString || event?.employeeNo || "").trim();
					if (!employeeNo) {
						skipped += 1;
					} else {
						let statusCode = 200;
						const callbackReq = {
							...req,
							body: { deviceId: device.id, AcsEventInfo: event },
							query: {},
							get: () => "application/json",
						} as any;
						const callbackRes = {
							status(code: number) {
								statusCode = code;
								return this;
							},
							json() {
								return this;
							},
						} as any;
						try {
							await ctrl.handleCallback(callbackReq, callbackRes, (() => undefined) as any);
							if (statusCode >= 200 && statusCode < 300) imported += 1;
							else failed += 1;
						} catch (error: any) {
							failed += 1;
							const job = deviceImportJobs.get(jobId);
							if (job && job.errors.length < 25) {
								job.errors.push({
									row: processed,
									error: error?.message || "Failed to save device punch",
								});
							}
						}
					}

					if (processed % 10 === 0 || processed >= maxEvents) {
						updateDeviceImportJob(jobId, {
							processed,
							imported,
							skipped,
							failed,
							message: "Syncing device logs",
						});
					}
					if (processed >= maxEvents) break;
				}

				position += pageEvents.length;
				const total = deviceImportJobs.get(jobId)?.total || totalHint || maxEvents;
				if (position >= total) break;
			}

			updateDeviceImportJob(jobId, {
				status: failed > 0 && imported === 0 ? "failed" : "completed",
				processed,
				imported,
				skipped,
				failed,
				message:
					failed > 0 && imported === 0
						? "Import failed"
						: `Imported ${imported.toLocaleString()} device logs`,
				completedAt: new Date(),
			});
			await invalidateCache.byPattern("cache:device:events:*").catch(() => undefined);
		} catch (error: any) {
			const job = deviceImportJobs.get(jobId);
			if (job && job.errors.length < 25) {
				job.errors.push({ row: processed + 1, error: error?.message || "Import failed" });
			}
			updateDeviceImportJob(jobId, {
				status: "failed",
				processed,
				imported,
				skipped,
				failed: failed + 1,
					message: error?.message || "Sync failed",
				completedAt: new Date(),
			});
		}
	};

	const triggerHikvisionAttendanceImport = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const organizationId = (req as any).organizationId;
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID not found", 400));
				return;
			}
			const deviceId = String((req.body as any)?.deviceId || (req.query as any)?.deviceId || "").trim();
			if (!deviceId) {
				res.status(400).json(buildErrorResponse("Device is required", 400));
				return;
			}
			const device = await (prisma as any).device.findFirst({
				where: { id: deviceId, organizationId: String(organizationId), isDeleted: false },
				select: { id: true, organizationId: true, name: true, address: true, port: true, protocol: true, config: true },
			});
			if (!device || !isHikvisionDevice(device)) {
				res.status(400).json(buildErrorResponse("Select a Hikvision attendance device", 400));
				return;
			}

			const counts = await getHikvisionSourceCounts(req, device.id);
			const totalHint = Number(counts.totalEvents || 0);
			const jobId = randomUUID();
			const job: DeviceImportJob = {
				jobId,
				status: "processing",
				organizationId: String(organizationId),
				deviceId: device.id,
				deviceName: device.name || device.address,
				total: totalHint,
				processed: 0,
				imported: 0,
				skipped: 0,
				failed: 0,
				message: "Sync queued",
				errors: [],
				startedAt: new Date(),
			};
			deviceImportJobs.set(jobId, job);
			processHikvisionImportJob({ jobId, req, device, totalHint }).catch((error) => {
				deviceLogger.error(`Hikvision import job ${jobId} failed: ${error}`);
			});

			res.status(202).json(
				buildSuccessResponse(
					"Device log sync started",
					{ jobId, progress: job },
					202,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to start device log import", 500),
			);
		}
	};

	const getDeviceImportJob = async (req: Request, res: Response, _next: NextFunction) => {
		const jobId = String(req.params.jobId || "").trim();
		const job = getHikvisionImportProgress(jobId);
		if (!job) {
			res.status(404).json(buildErrorResponse("Import job not found or expired", 404));
			return;
		}
		res.status(200).json(buildSuccessResponse("Import job retrieved", job, 200));
	};

	const resetDeviceEvents = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const organizationId = String((req as any).organizationId || "").trim();
			const role = String((req as any).role || "").trim();
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID not found", 400));
				return;
			}
			if (!DEVICE_EVENT_RESET_ADMIN_ROLES.has(role)) {
				res.status(403).json(buildErrorResponse("Only admins can reset saved device events", 403));
				return;
			}

			const execute = Boolean((req.body as any)?.execute);
			const includeLinkedAttendance = Boolean((req.body as any)?.includeLinkedAttendance);
			const { where, scope } = buildDeviceEventResetScope(req, organizationId);

			const events = await prisma.deviceEvent.findMany({
				where,
				orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
			});
			const deviceIds = [...new Set(events.map((event) => event.deviceId).filter(Boolean))];
			const attendanceIds = [
				...new Set(events.map((event) => event.attendanceId).filter(Boolean) as string[]),
			];
			const [devices, linkedAttendance] = await Promise.all([
				deviceIds.length
					? prisma.device.findMany({
							where: { id: { in: deviceIds }, organizationId },
							select: {
								id: true,
								organizationId: true,
								name: true,
								address: true,
								port: true,
								protocol: true,
								config: true,
								access: true,
								isDeleted: true,
								createdAt: true,
								updatedAt: true,
							},
						})
					: Promise.resolve([]),
				attendanceIds.length
					? prisma.attendance.findMany({
							where: { id: { in: attendanceIds }, organizationId },
						})
					: Promise.resolve([]),
			]);
			const counts = {
				devices: devices.length,
				deviceEvents: events.length,
				linkedAttendance: linkedAttendance.length,
				importJobs: deviceImportJobs.size,
			};

			if (!execute) {
				res.status(200).json(
					buildSuccessResponse(
						"Device event reset preview generated",
						{
							mode: "preview",
							scope,
							counts,
							affectedModels: ["DeviceEvent", "Attendance (linked only, optional)", "Device (export only)"],
						},
						200,
					),
				);
				return;
			}

			const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
			const backupDir = path.join(getProjectRuntimeRoot(), "backups", `device-events-reset-${timestamp}`);
			await fs.mkdir(backupDir, { recursive: true });
			const importJobs = Array.from(deviceImportJobs.values()).filter(
				(job) =>
					job.organizationId === organizationId &&
					(scope.deviceId === "all" || job.deviceId === scope.deviceId),
			);
			const manifest = {
				createdAt: new Date().toISOString(),
				actor: {
					userId: (req as any).userId || (req as any).user?.id || null,
					role,
				},
				scope,
				countsBefore: counts,
				includeLinkedAttendance,
				affectedModels: ["DeviceEvent", "Attendance (linked only, optional)", "Device (export only)", "Import jobs (memory snapshot only)"],
			};

			await Promise.all([
				writeJsonFile(path.join(backupDir, "manifest.json"), manifest),
				writeJsonFile(path.join(backupDir, "devices.json"), devices),
				writeJsonFile(path.join(backupDir, "device-events.json"), events),
				writeJsonFile(path.join(backupDir, "linked-attendance.json"), linkedAttendance),
				writeJsonFile(path.join(backupDir, "import-jobs.json"), importJobs),
				fs.writeFile(
					path.join(backupDir, "RECOVERY.md"),
					[
						"# Device Events Reset Recovery",
						"",
						"Records were exported before deletion. Restore should be reviewed by an admin/operator before reinserting into the active database.",
						"",
						"Suggested recovery order:",
						"1. Review `manifest.json` scope and counts.",
						"2. Reinsert `linked-attendance.json` only if attendance was deleted and those rows are still appropriate.",
						"3. Reinsert `device-events.json` after confirming dedupe keys do not already exist.",
						"4. Do not restore `devices.json` unless device rows were separately changed; this reset exports devices for context only.",
						"",
					].join("\n"),
					"utf8",
				),
			]);

			let deletedAttendance = 0;
			let deletedDeviceEvents = 0;
			await prisma.$transaction(async (tx) => {
				if (includeLinkedAttendance && attendanceIds.length) {
					const result = await tx.attendance.deleteMany({
						where: { id: { in: attendanceIds }, organizationId },
					});
					deletedAttendance = result.count;
				}
				const result = await tx.deviceEvent.deleteMany({ where });
				deletedDeviceEvents = result.count;
			});
			await invalidateCache.byPattern("cache:device:events:*").catch(() => undefined);

			const countsAfter = {
				deviceEvents: await prisma.deviceEvent.count({ where }),
				linkedAttendance: attendanceIds.length
					? await prisma.attendance.count({ where: { id: { in: attendanceIds }, organizationId } })
					: 0,
			};

			res.status(200).json(
				buildSuccessResponse(
					"Device event reset completed",
					{
						mode: "executed",
						scope,
						backupDir,
						countsBefore: counts,
						countsAfter,
						deleted: {
							deviceEvents: deletedDeviceEvents,
							linkedAttendance: deletedAttendance,
						},
					},
					200,
				),
			);
		} catch (error: any) {
			deviceLogger.error(`Device event reset failed: ${error?.message || error}`);
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to reset saved device events", 500),
			);
		}
	};

	const getDeviceSyncPreview = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const organizationId = (req as any).organizationId;
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID not found", 400));
				return;
			}

			const selectedDeviceId = String(req.query.deviceId || "").trim();
			const selectedSource = String(req.query.source || "all").trim();
			const devices = await prisma.device.findMany({
				where: {
					organizationId: String(organizationId),
					isDeleted: false,
					...(selectedDeviceId && selectedDeviceId !== "all" ? { id: selectedDeviceId } : {}),
				},
				select: {
					id: true,
					name: true,
					address: true,
					port: true,
					protocol: true,
					config: true,
				},
				orderBy: [{ name: "asc" }, { address: "asc" }],
			});

			const syncDevices = devices
				.map((device) => {
					if (isZktecoDevice(device)) {
						return { ...device, vendor: "ZKTeco", source: "ZKTECO_EVENT" as const };
					}
					if (isHikvisionDevice(device)) {
						return { ...device, vendor: "Hikvision", source: "HIKVISION_CALLBACK" as const };
					}
					return null;
				})
				.filter((device): device is NonNullable<typeof device> => Boolean(device))
				.filter((device) => selectedSource === "all" || device.source === selectedSource);

			if (!syncDevices.length) {
				res.status(200).json(
					buildSuccessResponse(
						"Device sync preview generated",
						{
							generatedAt: new Date().toISOString(),
							scope: {
								deviceId: selectedDeviceId || "all",
								source: selectedSource,
							},
							devices: [],
						},
						200,
					),
				);
				return;
			}

			const savedCounts = await (prisma as any).deviceEvent.groupBy({
				by: ["deviceId", "source"],
				where: {
					organizationId: String(organizationId),
					deviceId: { in: syncDevices.map((device) => device.id) },
					source: { in: ["ZKTECO_EVENT", "HIKVISION_CALLBACK"] },
				},
				_count: { _all: true },
			});
			const savedCountByDeviceAndSource = new Map<string, number>();
			for (const row of savedCounts || []) {
				savedCountByDeviceAndSource.set(
					`${row.deviceId}|${row.source}`,
					Number(row?._count?._all || 0),
				);
			}

			const zktecoDevices = syncDevices.filter((device) => device.vendor === "ZKTeco");
			const zktecoPreview =
				zktecoDevices.length > 0
					? zktecoDevices.length === 1
						? await getZktecoBridgePreview(zktecoDevices[0].address)
						: await getZktecoBridgeStatus()
					: null;
			const zktecoPreviewByIp = new Map<string, any>();
			for (const item of zktecoPreview?.data?.devices || []) {
				zktecoPreviewByIp.set(String(item?.ip || "").trim(), item);
			}

			const hikvisionTotals = new Map<string, Awaited<ReturnType<typeof getHikvisionSourceTotal>>>();
			await Promise.all(
				syncDevices
					.filter((device) => device.vendor === "Hikvision")
					.map(async (device) => {
						hikvisionTotals.set(device.id, await getHikvisionSourceTotal(req, device.id));
					}),
			);

			const previewRows = syncDevices.map((device) => {
				const syncedEvents = savedCountByDeviceAndSource.get(`${device.id}|${device.source}`) || 0;
				const sourcePreview =
					device.vendor === "ZKTeco"
						? zktecoPreviewByIp.get(String(device.address || "").trim())
						: hikvisionTotals.get(device.id);
				const totalEvents =
					device.vendor === "ZKTeco"
						? sourcePreview?.totalEvents ?? null
						: sourcePreview?.totalEvents ?? null;
				const vendorUserCount =
					device.vendor === "ZKTeco"
						? firstNumericValueForKeys(sourcePreview, [
								"userCount",
								"usersCount",
								"totalUsers",
								"userTotal",
								"users",
							])
						: sourcePreview?.userCount ?? null;
				const needsSyncEvents =
					totalEvents !== null && totalEvents !== undefined && Number.isFinite(Number(totalEvents))
						? Math.max(Number(totalEvents) - syncedEvents, 0)
						: null;
				const sourceError =
					sourcePreview?.error ||
					sourcePreview?.lastError ||
					(device.vendor === "ZKTeco" && zktecoPreview && !sourcePreview
						? zktecoPreview.error || "ZKTeco SDK preview did not return this device"
						: null);
				const rawSourceErrorMessage =
					sourceError === null || sourceError === undefined ? null : String(sourceError);
				const sourceErrorMessage =
					device.vendor === "Hikvision" && rawSourceErrorMessage && /^\d+$/.test(rawSourceErrorMessage)
						? `Hikvision event total unavailable (code ${rawSourceErrorMessage})`
						: rawSourceErrorMessage;
				const canStartSync =
					!sourceErrorMessage &&
					Number.isFinite(Number(needsSyncEvents)) &&
					Number(needsSyncEvents) > 0 &&
					(device.vendor === "Hikvision" ||
						(device.vendor === "ZKTeco" && Boolean(zktecoPreview?.ok)));
				return {
					deviceId: device.id,
					name: device.name,
					address: device.address,
					port: device.port,
					vendor: device.vendor,
					source: device.source,
					syncedEvents,
					totalEvents,
					needsSyncEvents,
					hrisSavedCount: syncedEvents,
					vendorEventCount: totalEvents,
					vendorUserCount,
					missingEventCount: needsSyncEvents,
					canStartSync,
					syncAction: canStartSync
						? device.vendor === "Hikvision"
							? "hikvision-import"
							: "zkteco-bridge-sync"
						: null,
					status:
						sourceErrorMessage
							? "source_unavailable"
							: totalEvents === null
							? "source_total_unavailable"
							: needsSyncEvents && needsSyncEvents > 0
								? "needs_sync"
								: "synced",
					lastSourceEventAt:
						device.vendor === "ZKTeco" ? sourcePreview?.lastSelectedAt || null : null,
					countLatencyMs: sourcePreview?.latencyMs ?? null,
					...(sourceErrorMessage ? { error: sourceErrorMessage } : {}),
				};
			});

			res.status(200).json(
				buildSuccessResponse(
					"Device sync preview generated",
					{
						generatedAt: new Date().toISOString(),
						scope: {
							deviceId: selectedDeviceId || "all",
							source: selectedSource,
						},
						bridge: zktecoPreview
							? {
									ok: zktecoPreview.ok,
									status: zktecoPreview.status,
									statusUrl: zktecoPreview.statusUrl,
									error: zktecoPreview.error,
								}
							: null,
						devices: previewRows,
					},
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to build device sync preview", 500),
			);
		}
	};

	const getDeviceHealth = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const organizationId = (req as any).organizationId;
			const { id } = req.params;
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID not found", 400));
				return;
			}

			const device = await prisma.device.findFirst({
				where: {
					id,
					organizationId: String(organizationId),
					isDeleted: false,
				},
				select: {
					id: true,
					name: true,
					address: true,
					port: true,
					protocol: true,
					config: true,
					access: true,
					updatedAt: true,
				},
			});

			if (!device) {
				res.status(404).json(buildErrorResponse(config.ERROR.DEVICE.NOT_FOUND, 404));
				return;
			}

			const parsedAddress = /^https?:\/\//i.test(device.address)
				? new URL(device.address).hostname
				: device.address;
			const isZkteco = isZktecoDevice(device);
			const healthPort = isZkteco ? Number(device.port || 4370) : getHikvisionDeviceHttpPort(device);
			const baseUrl = isZkteco ? null : buildHikvisionDeviceBaseUrl(device);
			const startedAt = Date.now();

			const [network, zktecoBridge, lastZktecoEvent] = await Promise.all([
				checkTcpReachability(parsedAddress, healthPort),
				isZkteco ? getZktecoBridgeStatus() : Promise.resolve(null),
				isZkteco
					? (prisma as any).deviceEvent.findFirst({
							where: {
								deviceId: device.id,
								source: "ZKTECO_EVENT",
							},
							orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
							select: {
								id: true,
								status: true,
								eventTime: true,
								receivedAt: true,
								employeeNo: true,
								errorMessage: true,
							},
						})
					: Promise.resolve(null),
			]);

			let deviceApi: {
				ok: boolean;
				status: "online" | "offline";
				latencyMs: number | null;
				error?: string;
				time?: unknown;
			} | null = null;
			if (!isZkteco) {
				const apiStartedAt = Date.now();
				try {
					const time = await hikvisionFetch(hikvisionEndpoint.system.time, {
						method: "GET",
						deviceId: id,
						prisma,
						request: req,
						timeoutMs: 3500,
					});
					deviceApi = {
						ok: true,
						status: "online",
						latencyMs: Date.now() - apiStartedAt,
						time,
					};
				} catch (error: any) {
					deviceApi = {
						ok: false,
						status: "offline",
						latencyMs: null,
						error:
							error?.data?.errorCode ||
							error?.data?.errorCause ||
							error?.message ||
							"Device API did not respond",
					};
				}
			}

			const zktecoWebhook = isZkteco
				? {
						ok: appConfig.enableDeviceServices,
						status: appConfig.enableDeviceServices ? "ready" : "disabled",
						path: `${appConfig.baseApiPath || "/api"}/zkteco/events`,
					}
				: undefined;
			const bridgeDevice = isZkteco ? getBridgeDeviceStatus(zktecoBridge, parsedAddress) : null;
			const zktecoDeviceConnected =
				!isZkteco || (bridgeDevice ? Boolean(bridgeDevice.connected) : false);

			const checks = isZkteco
				? [
						{ ok: true },
						{ ok: Boolean(zktecoWebhook?.ok) },
						{ ok: Boolean(zktecoBridge?.ok) },
						{ ok: zktecoDeviceConnected },
						{ ok: network.ok },
					]
				: [
						{ ok: true },
						{ ok: network.ok },
						{ ok: Boolean(deviceApi?.ok) },
					];
			const summary = {
				status: getHealthStatus(checks),
				checkedAt: new Date().toISOString(),
				durationMs: Date.now() - startedAt,
			};

			const responseChecks: Record<string, unknown> = {
				hrisApi: { ok: true, status: "online" },
				network: {
					ok: network.ok,
					status: network.ok ? "reachable" : "unreachable",
					host: parsedAddress,
					port: healthPort,
					latencyMs: network.latencyMs,
					...(network.error ? { error: network.error } : {}),
				},
			};

			if (isZkteco) {
				responseChecks.zktecoWebhook = zktecoWebhook;
				responseChecks.zktecoBridge = {
					ok: Boolean(zktecoBridge?.ok),
					status: zktecoBridge?.status || "offline",
					runtime:
						zktecoBridge?.data?.runtime ||
						zktecoBridge?.data?.service ||
						"project-truth-zkteco-linux-pyzk",
					statusUrl: zktecoBridge?.statusUrl,
					latencyMs: zktecoBridge?.latencyMs,
					configuredDevices: zktecoBridge?.data?.configuredDevices ?? null,
					connectedDevices: zktecoBridge?.data?.connectedDevices ?? null,
					lastEventAt: zktecoBridge?.data?.lastEventAt || null,
					device: bridgeDevice,
					...(zktecoBridge?.error ? { error: zktecoBridge.error } : {}),
				};
				responseChecks.lastZktecoEvent = lastZktecoEvent;
			} else {
				responseChecks.deviceApi = deviceApi;
			}

			res.status(200).json(
				buildSuccessResponse(
					"Device health checked successfully",
					{
						device: {
							id: device.id,
							name: device.name,
							address: device.address,
							port: device.port,
							protocol: device.protocol,
							vendor: isZkteco ? "ZKTeco" : "Hikvision",
							...(baseUrl ? { baseUrl } : {}),
						},
						summary,
						checks: responseChecks,
					},
					200,
				),
			);
		} catch (error: any) {
			deviceLogger.error(`Device health check failed: ${error?.message || error}`);
			res.status(500).json(buildErrorResponse("Failed to check device health", 500));
		}
	};

	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			deviceLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			deviceLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateDeviceSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			deviceLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const device = await prisma.device.create({ data: validation.data });
			deviceLogger.info(`Device created successfully: ${device.id}`);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.DEVICE.ACTIONS.CREATE_DEVICE,
				description: `${config.ACTIVITY_LOG.DEVICE.DESCRIPTIONS.DEVICE_CREATED}: ${device.name || device.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.DEVICE.PAGES.DEVICE_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.DEVICE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.DEVICE,
				entityId: device.id,
				changesBefore: null,
				changesAfter: {
					id: device.id,
					name: device.name,
					createdAt: device.createdAt,
					updatedAt: device.updatedAt,
				},
				description: `${config.AUDIT_LOG.DEVICE.DESCRIPTIONS.DEVICE_CREATED}: ${device.name || device.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:device:list:*");
				deviceLogger.info("Device list cache invalidated after creation");
			} catch (cacheError) {
				deviceLogger.warn("Failed to invalidate cache after device creation:", cacheError);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.DEVICE.CREATED,
				device,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			deviceLogger.error(`${config.ERROR.DEVICE.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const getEvents = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const organizationId = (req as any).organizationId;
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID not found", 400));
				return;
			}

			const page = Math.max(Number(req.query.page || 1), 1);
			const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 100);
			const skip = (page - 1) * limit;
			const deviceId = String(req.query.deviceId || "").trim();
			const status = String(req.query.status || "").trim();
			const source = String(req.query.source || "").trim();
			const query = String(req.query.query || req.query.search || "").trim();
			const from = String(req.query.from || "").trim();
			const to = String(req.query.to || "").trim();
			const dateField = String(req.query.dateField || "eventTime").trim();
			const sort = String(req.query.sort || "eventTime").trim();
			const order = String(req.query.order || "desc").toLowerCase() === "asc" ? "asc" : "desc";
			const dateColumnSql =
				dateField === "receivedAt" ? Prisma.sql`de."receivedAt"` : Prisma.sql`de."eventTime"`;

			const whereConditions: Prisma.Sql[] = [
				Prisma.sql`de."organizationId" = ${String(organizationId)}`,
			];

			if (deviceId) whereConditions.push(Prisma.sql`de."deviceId" = ${deviceId}`);
			if (status && status !== "all" && DEVICE_EVENT_STATUSES.has(status)) {
				whereConditions.push(Prisma.sql`de."status" = ${status}::"DeviceEventStatus"`);
			}
			if (source && source !== "all" && DEVICE_EVENT_SOURCES.has(source)) {
				whereConditions.push(Prisma.sql`de."source" = ${source}::"DeviceEventSource"`);
			}

			if (from || to) {
				if (from) {
					const fromDate = parseHikvisionBusinessDateBound(from);
					if (fromDate) whereConditions.push(Prisma.sql`${dateColumnSql} >= ${fromDate}`);
				}
				if (to) {
					const toDate = parseHikvisionBusinessDateBound(to, true);
					if (toDate) whereConditions.push(Prisma.sql`${dateColumnSql} <= ${toDate}`);
				}
			}

			const hasQuery = Boolean(query);
			if (hasQuery) {
				const queryLike = `%${query}%`;
				const strippedNumericQuery = /^\d+$/.test(query)
					? query.replace(/^0+/, "") || "0"
					: "";
				const paddedEmployeeCode = strippedNumericQuery
					? strippedNumericQuery.padStart(5, "0")
					: "";
				whereConditions.push(Prisma.sql`(
					de."employeeNo" ILIKE ${queryLike}
					OR de."eventType" ILIKE ${queryLike}
					OR de."doorNo" ILIKE ${queryLike}
					OR d."name" ILIKE ${queryLike}
					OR d."address" ILIKE ${queryLike}
					OR COALESCE(employee_by_id."employeeId", employee_by_device."employeeId", employee_by_code."employeeId") ILIKE ${queryLike}
					OR COALESCE(employee_by_id."deviceEmpId", employee_by_device."deviceEmpId", employee_by_code."deviceEmpId") ILIKE ${queryLike}
					OR NULLIF(
						BTRIM(
							CONCAT_WS(
								' ',
								matched_person."personalInfo"->>'firstName',
								matched_person."personalInfo"->>'middleName',
								matched_person."personalInfo"->>'lastName'
							)
						),
						''
					) ILIKE ${queryLike}
					OR (
						${paddedEmployeeCode} <> ''
						AND COALESCE(employee_by_id."employeeId", employee_by_device."employeeId", employee_by_code."employeeId") IN (
							${query},
							${strippedNumericQuery},
							${paddedEmployeeCode}
						)
					)
				)`);
			}

			const whereSql = Prisma.sql`WHERE ${Prisma.join(whereConditions, " AND ")}`;
			const baseFromSql = Prisma.sql`
				FROM device_events de
				LEFT JOIN "Device" d ON d.id = de."deviceId"
			`;
			const employeeJoinSql = Prisma.sql`
				LEFT JOIN LATERAL (
					SELECT emp.id, emp."employeeId", emp."deviceEmpId", emp."personId"
					FROM employees emp
					WHERE emp."organizationId" = de."organizationId"
						AND emp."isDeleted" = false
						AND de."employeeId" IS NOT NULL
						AND emp.id = de."employeeId"
					LIMIT 1
				) employee_by_id ON true
				LEFT JOIN LATERAL (
					SELECT emp.id, emp."employeeId", emp."deviceEmpId", emp."personId"
					FROM employees emp
					WHERE employee_by_id.id IS NULL
						AND emp."organizationId" = de."organizationId"
						AND emp."isDeleted" = false
						AND de."employeeNo" IS NOT NULL
						AND BTRIM(de."employeeNo") <> ''
						AND emp."deviceEmpId" = BTRIM(de."employeeNo")
					LIMIT 1
				) employee_by_device ON true
				LEFT JOIN LATERAL (
					SELECT emp.id, emp."employeeId", emp."deviceEmpId", emp."personId"
					FROM employees emp
					WHERE employee_by_id.id IS NULL
						AND employee_by_device.id IS NULL
						AND emp."organizationId" = de."organizationId"
						AND emp."isDeleted" = false
						AND de."employeeNo" IS NOT NULL
						AND BTRIM(de."employeeNo") <> ''
						AND emp."employeeId" IN (
							BTRIM(de."employeeNo"),
							CASE
								WHEN BTRIM(de."employeeNo") ~ '^[0-9]+$'
								THEN COALESCE(NULLIF(REGEXP_REPLACE(BTRIM(de."employeeNo"), '^0+', ''), ''), '0')
								ELSE BTRIM(de."employeeNo")
							END,
							CASE
								WHEN BTRIM(de."employeeNo") ~ '^[0-9]+$'
								THEN LPAD(
									COALESCE(NULLIF(REGEXP_REPLACE(BTRIM(de."employeeNo"), '^0+', ''), ''), '0'),
									5,
									'0'
								)
								ELSE BTRIM(de."employeeNo")
							END
						)
					LIMIT 1
				) employee_by_code ON true
				LEFT JOIN "Person" matched_person ON matched_person.id = COALESCE(
					employee_by_id."personId",
					employee_by_device."personId",
					employee_by_code."personId"
				)
			`;
			const fromSql = Prisma.sql`
				${baseFromSql}
				${employeeJoinSql}
			`;
			const pageFromSql = hasQuery ? fromSql : baseFromSql;
			const aggregateFromSql = hasQuery ? fromSql : baseFromSql;
			const orderColumnSql =
				sort === "deviceName"
					? Prisma.sql`d."name"`
					: sort === "eventTime"
						? Prisma.sql`de."eventTime"`
						: sort === "updatedAt"
							? Prisma.sql`de."updatedAt"`
							: sort === "status"
								? Prisma.sql`de."status"`
								: sort === "source"
									? Prisma.sql`de."source"`
									: sort === "employeeNo"
										? Prisma.sql`de."employeeNo"`
										: sort === "doorNo"
											? Prisma.sql`de."doorNo"`
											: Prisma.sql`de."receivedAt"`;
			const orderDirectionSql = Prisma.raw(order === "asc" ? "ASC" : "DESC");
			const eventsSql = Prisma.sql`
				WITH page_events AS (
					SELECT de.id
					${pageFromSql}
					${whereSql}
					ORDER BY ${orderColumnSql} ${orderDirectionSql}, de."receivedAt" DESC, de."createdAt" DESC
					OFFSET ${skip}
					LIMIT ${limit}
				)
				SELECT
					de.id,
					de."organizationId",
					de."deviceId",
					de."employeeId",
					de."attendanceId",
					de."eventTime",
					de."receivedAt",
					de."employeeNo",
					de.source::text AS source,
					de.status::text AS status,
					de."eventType",
					de.major,
					de.minor,
					de."doorNo",
					de."verifyMode",
					de."dedupeKey",
					de.payload,
					de."errorMessage",
					de."createdAt",
					de."updatedAt",
					CASE
						WHEN d.id IS NULL THEN NULL
						ELSE JSON_BUILD_OBJECT(
							'id', d.id,
							'name', d.name,
							'address', d.address,
							'port', d.port,
							'protocol', d.protocol::text
						)
					END AS device,
					CASE
						WHEN COALESCE(employee_by_id.id, employee_by_device.id, employee_by_code.id) IS NULL THEN NULL
						ELSE JSON_BUILD_OBJECT(
							'id', COALESCE(employee_by_id.id, employee_by_device.id, employee_by_code.id),
							'employeeId', COALESCE(employee_by_id."employeeId", employee_by_device."employeeId", employee_by_code."employeeId"),
							'deviceEmpId', COALESCE(employee_by_id."deviceEmpId", employee_by_device."deviceEmpId", employee_by_code."deviceEmpId"),
							'fullName', COALESCE(
								NULLIF(
									BTRIM(
										CONCAT_WS(
											' ',
											matched_person."personalInfo"->>'firstName',
											matched_person."personalInfo"->>'middleName',
											matched_person."personalInfo"->>'lastName'
										)
									),
									''
								),
								COALESCE(employee_by_id."employeeId", employee_by_device."employeeId", employee_by_code."employeeId")
							)
						)
					END AS employee
				${fromSql}
				INNER JOIN page_events page_event ON page_event.id = de.id
				ORDER BY ${orderColumnSql} ${orderDirectionSql}, de."receivedAt" DESC, de."createdAt" DESC
			`;
			const countSql = Prisma.sql`
				SELECT COUNT(*)::bigint AS total
				${aggregateFromSql}
				${whereSql}
			`;
			const statusGroupsSql = Prisma.sql`
				SELECT de.status::text AS status, COUNT(*)::bigint AS count
				${aggregateFromSql}
				${whereSql}
				GROUP BY de.status
			`;
			const sourceGroupsSql = Prisma.sql`
				SELECT de.source::text AS source, COUNT(*)::bigint AS count
				${aggregateFromSql}
				${whereSql}
				GROUP BY de.source
			`;

			const [events, totalRows, statusGroups, sourceGroups] = await Promise.all([
				prisma.$queryRaw<any[]>(eventsSql),
				prisma.$queryRaw<Array<{ total: bigint | number }>>(countSql),
				prisma.$queryRaw<Array<{ status: string; count: bigint | number }>>(statusGroupsSql),
				prisma.$queryRaw<Array<{ source: string; count: bigint | number }>>(sourceGroupsSql),
			]);
			const total = Number(totalRows[0]?.total || 0);

			const summary = {
				total,
				byStatus: Object.fromEntries(
					statusGroups.map((item: any) => [item.status, Number(item.count || 0)]),
				),
				bySource: Object.fromEntries(
					sourceGroups.map((item: any) => [item.source, Number(item.count || 0)]),
				),
			};

			res.status(200).json(
				buildSuccessResponse(
					"Device events retrieved successfully",
					{
						events,
						summary,
						pagination: buildPagination(total, page, limit),
					},
					200,
				),
			);
		} catch (error) {
			deviceLogger.error(`Failed to get device events: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, deviceLogger);

		if (!validationResult.isValid) {
			res.status(400).json(validationResult.errorResponse);
			return;
		}

		const {
			page,
			limit,
			order,
			fields,
			sort,
			skip,
			query,
			document,
			pagination,
			count,
			filter,
			groupBy,
		} = validationResult.validatedParams!;

		deviceLogger.info(
			`Getting devices, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			// Base where clause
			const whereClause: Prisma.DeviceWhereInput = {
				isDeleted: false,
				...((req as any).organizationId
					? { organizationId: String((req as any).organizationId) }
					: {}),
			};

			// search fields sample ("name", "description", "type")
			const searchFields = ["name", "description", "type"];
			if (query) {
				const searchConditions = buildSearchConditions("Device", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Device", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(whereClause, skip, limit, order, sort, fields);

			const [devices, total] = await Promise.all([
				document ? prisma.device.findMany(findManyQuery) : [],
				count ? prisma.device.count({ where: whereClause }) : 0,
			]);

			deviceLogger.info(`Retrieved ${devices.length} devices`);
			const processedData =
				groupBy && document ? groupDataByField(devices, groupBy as string) : devices;

			const responseData: Record<string, any> = {
				...(document && { devices: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.DEVICE.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			deviceLogger.error(`${config.ERROR.DEVICE.GET_ALL_FAILED}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};
	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { fields } = req.query;

		try {
			if (!id) {
				deviceLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				deviceLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			deviceLogger.info(`${config.SUCCESS.DEVICE.GETTING_BY_ID}: ${id}`);

			const cacheKey = `cache:device:byId:${id}:${fields || "full"}`;
			let device = null;

			try {
				if (redisClient.isClientConnected()) {
					device = await redisClient.getJSON(cacheKey);
					if (device) {
						deviceLogger.info(`Device ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				deviceLogger.warn(`Redis cache retrieval failed for device ${id}:`, cacheError);
			}

			if (!device) {
				const query: Prisma.DeviceFindFirstArgs = {
					where: {
						id,
						...((req as any).organizationId
							? { organizationId: String((req as any).organizationId) }
							: {}),
					},
				};

				query.select = getNestedFields(fields);

				device = await prisma.device.findFirst(query);

				if (device && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, device, 3600);
						deviceLogger.info(`Device ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						deviceLogger.warn(
							`Failed to store device ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!device) {
				deviceLogger.error(`${config.ERROR.DEVICE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DEVICE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			deviceLogger.info(`${config.SUCCESS.DEVICE.RETRIEVED}: ${(device as any).id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DEVICE.RETRIEVED,
				device,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			deviceLogger.error(`${config.ERROR.DEVICE.ERROR_GETTING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				deviceLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateDeviceSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				deviceLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				deviceLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			deviceLogger.info(`Updating device: ${id}`);

			const existingDevice = await prisma.device.findFirst({
				where: {
					id,
					...((req as any).organizationId
						? { organizationId: String((req as any).organizationId) }
						: {}),
				},
			});

			if (!existingDevice) {
				deviceLogger.error(`${config.ERROR.DEVICE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DEVICE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			const prismaData = { ...validatedData };

			const updatedDevice = await prisma.device.update({
				where: { id },
				data: prismaData,
			});

			try {
				await invalidateCache.byPattern(`cache:device:byId:${id}:*`);
				await invalidateCache.byPattern("cache:device:list:*");
				deviceLogger.info(`Cache invalidated after device ${id} update`);
			} catch (cacheError) {
				deviceLogger.warn("Failed to invalidate cache after device update:", cacheError);
			}

			deviceLogger.info(`${config.SUCCESS.DEVICE.UPDATED}: ${updatedDevice.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.DEVICE.UPDATED,
				{ device: updatedDevice },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			deviceLogger.error(`${config.ERROR.DEVICE.ERROR_UPDATING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				deviceLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			deviceLogger.info(`${config.SUCCESS.DEVICE.DELETED}: ${id}`);

			const existingDevice = await prisma.device.findFirst({
				where: {
					id,
					...((req as any).organizationId
						? { organizationId: String((req as any).organizationId) }
						: {}),
				},
			});

			if (!existingDevice) {
				deviceLogger.error(`${config.ERROR.DEVICE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.DEVICE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.device.update({
				where: { id },
				data: { isDeleted: true },
			});

			try {
				await invalidateCache.byPattern(`cache:device:byId:${id}:*`);
				await invalidateCache.byPattern("cache:device:list:*");
				deviceLogger.info(`Cache invalidated after device ${id} deletion`);
			} catch (cacheError) {
				deviceLogger.warn("Failed to invalidate cache after device deletion:", cacheError);
			}

			deviceLogger.info(`${config.SUCCESS.DEVICE.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(config.SUCCESS.DEVICE.DELETED, {}, 200);
			res.status(200).json(successResponse);
		} catch (error) {
			deviceLogger.error(`${config.ERROR.DEVICE.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const enrollDeviceUser = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const organizationId = (req as any).organizationId;
			const actorUserId = (req as any).userId;
			const { userId, deviceId, deviceUserId } = req.body || {};

			if (!organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID not found", 400));
				return;
			}

			if (!userId || !deviceId || !deviceUserId) {
				res.status(400).json(
					buildErrorResponse("userId, deviceId, and deviceUserId are required", 400),
				);
				return;
			}

			const device = await prisma.device.findFirst({
				where: {
					id: String(deviceId),
					organizationId: String(organizationId),
					isDeleted: false,
				},
				select: { id: true, name: true },
			});
			if (!device) {
				res.status(404).json(buildErrorResponse(`Device not found: ${deviceId}`, 404));
				return;
			}

			const headers = helpers.prepareAuthHeaders(req);
			let targetUser: any = null;
			if (appConfig.idpEnabled) {
				const getUserUrl = helpers.buildAuthServiceUrl(`/api/user/${String(userId)}`);
				const getUserResponse = await fetch(getUserUrl, {
					method: "GET",
					headers,
				});
				if (!getUserResponse.ok) {
					const errorText = await getUserResponse.text();
					res.status(404).json(
						buildErrorResponse(`User not found or inaccessible: ${errorText}`, 404),
					);
					return;
				}

				const getUserData = await getUserResponse.json();
				targetUser = getUserData?.data || getUserData?.user || getUserData;
			} else {
				targetUser = await prisma.user.findFirst({
					where: {
						id: String(userId),
						organizationId: String(organizationId),
						isDeleted: false,
					},
					select: {
						id: true,
						organizationId: true,
						metadata: true,
					},
				});
			}
			if (!targetUser?.id) {
				res.status(404).json(buildErrorResponse("User not found", 404));
				return;
			}
			if (
				targetUser.organizationId &&
				String(targetUser.organizationId) !== String(organizationId)
			) {
				res.status(404).json(buildErrorResponse("User not found", 404));
				return;
			}

			const currentMetadata = (targetUser.metadata as any) || {};
			const currentDevice = currentMetadata.device || {};
			const normalizedDeviceEmpId = String(deviceUserId).trim();

			const employeeIdFromMetadata = currentMetadata?.employee?.id;
			const employee = await resolveEmployeeForUser(
				String(organizationId),
				String(targetUser.id),
				employeeIdFromMetadata ? String(employeeIdFromMetadata) : undefined,
			);
			if (!employee?.id) {
				res.status(404).json(
					buildErrorResponse(
						`Employee link not found for user ${targetUser.id}; enrollment aborted to keep metadata and employee in sync`,
						404,
					),
				);
				return;
			}

			const updatedMetadata = {
				...currentMetadata,
				device: {
					...currentDevice,
					access: {
						empId: normalizedDeviceEmpId,
						status: "enrolled",
						deviceId: String(deviceId),
					},
				},
			};

			if (appConfig.idpEnabled) {
				const updateUserUrl = helpers.buildAuthServiceUrl(`/api/user/${targetUser.id}`);
				const updateUserResponse = await fetch(updateUserUrl, {
					method: "PATCH",
					headers,
					body: JSON.stringify({ metadata: updatedMetadata }),
				});

				if (!updateUserResponse.ok) {
					const errorText = await updateUserResponse.text();
					res.status(500).json(
						buildErrorResponse(`Failed to update user metadata: ${errorText}`, 500),
					);
					return;
				}
			} else {
				await prisma.user.update({
					where: { id: String(targetUser.id) },
					data: { metadata: updatedMetadata },
				});
			}

			await prisma.employee.update({
				where: { id: employee.id },
				data: {
					deviceEmpId: normalizedDeviceEmpId,
					deviceId: String(deviceId),
				},
			});

			logActivity(req, {
				userId: actorUserId || "unknown",
				action: "DEVICE_ENROLL_USER",
				description: `Enrolled user ${targetUser.id} to device ${device.id} with empId ${normalizedDeviceEmpId}`,
				page: {
					url: req.originalUrl,
					title: "Device Enrollment",
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					"User enrolled and employee deviceEmpId synced successfully",
					{
						userId: targetUser.id,
						employeeId: employee.id,
						deviceId: device.id,
						deviceUserId: normalizedDeviceEmpId,
					},
					200,
				),
			);
		} catch (error: any) {
			deviceLogger.error(`Enroll device user failed: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to enroll user to device", 500));
		}
	};

	const importDeviceEnrollment = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			if (!req.file) {
				const errorResponse = buildErrorResponse("No file uploaded", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const buffer = req.file.buffer;
			const workbook = XLSX.read(buffer, { type: "buffer" });
			const sheetName = workbook.SheetNames[0];
			const sheet = workbook.Sheets[sheetName];
			const rows = XLSX.utils.sheet_to_json(sheet) as any[];

			// Validate that file has data
			if (!rows || rows.length === 0) {
				deviceLogger.warn("Empty CSV file uploaded");
				const errorResponse = buildErrorResponse(
					"CSV file is empty or has no data rows",
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			deviceLogger.info(`Processing ${rows.length} rows from import file`);

			const summary = {
				totalRows: rows.length,
				processedRows: 0,
				enrolled: 0,
				failed: 0,
				errors: [] as any[],
			};

			// Get user info from request (auth middleware populates these directly on req)
			const organizationId = (req as any).organizationId;
			const userId = (req as any).userId;

			if (!organizationId) {
				deviceLogger.error(`Organization ID not found in request`);
				const errorResponse = buildErrorResponse("Organization ID not found", 400);
				res.status(400).json(errorResponse);
				return;
			}

			deviceLogger.info(
				`Processing import for organization: ${organizationId}, user: ${userId}`,
			);

			const devices = await prisma.device.findMany({
				where: {
					isDeleted: false,
					organizationId: String(organizationId),
				},
			});
			const deviceMap = new Map(devices.map((d) => [d.id, d]));

			let rowIndex = 1; // Header is 0, data starts at 1

			for (const row of rows) {
				rowIndex++;
				summary.processedRows++;

				// Handle flexible header names
				const email = row["EMAIL"] || row["email"] || row["Email"];
				const deviceId = row["DEVICE_ID"] || row["device_id"] || row["Device ID"];
				const deviceUserId =
					row["DEVICE_USER_ID"] || row["device_user_id"] || row["Device User ID"];

				if (!email || !deviceId || !deviceUserId) {
					summary.failed++;
					summary.errors.push({
						row: rowIndex,
						error: "Missing required fields (EMAIL, DEVICE_ID, DEVICE_USER_ID)",
						data: row,
					});
					continue;
				}

				try {
					// Validate Device
					const device = deviceMap.get(deviceId);
					// If device schema has organizationId, we should check it.
					// Assuming device is valid if found for now, or check explicit relation if needed.
					if (!device) {
						throw new Error(`Device not found: ${deviceId}`);
					}

					let targetUser: any = null;
					const headers = helpers.prepareAuthHeaders(req);
					if (appConfig.idpEnabled) {
						const getUserUrl = helpers.buildAuthServiceUrl(
							`/api/user?filter=email:${encodeURIComponent(email)},organizationId:${organizationId},status:active&limit=1`,
						);
						const getUserResponse = await fetch(getUserUrl, {
							method: "GET",
							headers,
						});

						if (!getUserResponse.ok) {
							throw new Error(`User not found: ${email}`);
						}

						const getUserData = await getUserResponse.json();
						const users = getUserData.data?.users || getUserData.users || [];
						targetUser = users[0];
					} else {
						targetUser = await prisma.user.findFirst({
							where: {
								email: String(email),
								organizationId: String(organizationId),
								status: "active",
								isDeleted: false,
							},
							select: {
								id: true,
								metadata: true,
							},
						});
					}

					if (!targetUser) {
						throw new Error(`User not found: ${email}`);
					}

					// Update Metadata via Auth Service
					const currentMetadata = (targetUser.metadata as any) || {};
					const currentDevice = currentMetadata.device || {};

					const updatedMetadata = {
						...currentMetadata,
						device: {
							...currentDevice,
							access: {
								empId: deviceUserId.toString(),
								status: "enrolled",
								deviceId: deviceId,
							},
						},
					};

					if (appConfig.idpEnabled) {
						const updateUserUrl = helpers.buildAuthServiceUrl(`/api/user/${targetUser.id}`);
						const updateUserResponse = await fetch(updateUserUrl, {
							method: "PATCH",
							headers,
							body: JSON.stringify({ metadata: updatedMetadata }),
						});

						if (!updateUserResponse.ok) {
							const errorText = await updateUserResponse.text();
							throw new Error(`Failed to update user: ${errorText}`);
						}
					} else {
						await prisma.user.update({
							where: { id: String(targetUser.id) },
							data: { metadata: updatedMetadata },
						});
					}

					const employeeIdFromMetadata = currentMetadata?.employee?.id;
					const employee = await resolveEmployeeForUser(
						String(organizationId),
						String(targetUser.id),
						employeeIdFromMetadata ? String(employeeIdFromMetadata) : undefined,
					);
					if (!employee?.id) {
						throw new Error(
							`Employee link not found for ${email}; cannot sync deviceEmpId`,
						);
					}

					await prisma.employee.update({
						where: { id: employee.id },
						data: {
							deviceEmpId: deviceUserId.toString(),
							deviceId: deviceId.toString(),
						},
					});

					summary.enrolled++;
				} catch (error: any) {
					summary.failed++;
					// Keep errors limit to 10
					if (summary.errors.length < 10) {
						summary.errors.push({
							row: rowIndex,
							error: error.message || "Enrollment failed",
							data: { email, deviceId, deviceUserId },
						});
					}
				}
			}

			// Invalidate cache
			try {
				await invalidateCache.byPattern("cache:user:*");
				await invalidateCache.byPattern("cache:users:*");
			} catch (e) {
				console.error("Cache invalidation failed", e);
			}

			logActivity(req, {
				userId: userId || "unknown",
				action: "IMPORT_DEVICE_ENROLLMENT",
				description: `Imported device enrollments: ${summary.enrolled} enrolled, ${summary.failed} failed`,
				page: {
					url: req.originalUrl,
					title: "Device Enrollment Import",
				},
			});

			res.status(200).json(buildSuccessResponse("Import completed", { summary }, 200));
		} catch (error: any) {
			deviceLogger.error(`Import failed: ${error}`);
			res.status(500).json(buildErrorResponse("Import failed", 500));
		}
	};
	return {
		create,
		getAll,
		getEvents,
		getDeviceHealth,
		getDeviceSyncPreview,
		resetDeviceEvents,
		triggerZktecoAttendanceSync,
		triggerHikvisionAttendanceImport,
		getDeviceImportJob,
		getById,
		update,
		remove,
		enrollDeviceUser,
		importDeviceEnrollment,
	};
};
