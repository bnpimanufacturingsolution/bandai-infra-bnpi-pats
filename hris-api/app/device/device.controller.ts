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
import net from "net";
import { execFile } from "child_process";

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

	const getHealthStatus = (checks: Array<{ ok: boolean }>) => {
		const onlineCount = checks.filter((check) => check.ok).length;
		if (onlineCount === checks.length) return "online";
		if (onlineCount > 1) return "degraded";
		return "offline";
	};

	const getZktecoBridgeStatus = async () => {
		const statusUrl =
			process.env.ZKTECO_BRIDGE_STATUS_URL || "http://zkteco-bridge:4371/status";
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
				error: error?.message || "ZKTeco bridge status did not respond",
			};
		}
	};

	const getBridgeDeviceStatus = (bridgeStatus: any, address: string) => {
		const devices = Array.isArray(bridgeStatus?.data?.devices)
			? bridgeStatus.data.devices
			: [];
		return devices.find((item: any) => String(item?.ip || "").trim() === address) || null;
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

			const [listener, network, zktecoBridge, lastZktecoEvent] = await Promise.all([
				isZkteco ? Promise.resolve(null) : checkWindowsProcess("AlarmDemo.exe"),
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
						{ ok: Boolean(listener?.ok) },
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
						"Project Truth ZKTeco bridge",
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
				responseChecks.hikvisionListener = listener || {
					ok: false,
					status: "unknown",
					error: "Listener status unavailable",
				};
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
			const sort = String(req.query.sort || "receivedAt").trim();
			const order = String(req.query.order || "desc").toLowerCase() === "asc" ? "asc" : "desc";

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
					if (fromDate) whereConditions.push(Prisma.sql`de."eventTime" >= ${fromDate}`);
				}
				if (to) {
					const toDate = parseHikvisionBusinessDateBound(to, true);
					if (toDate) whereConditions.push(Prisma.sql`de."eventTime" <= ${toDate}`);
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
						AND COALESCE(employee_by_id."employeeId", employee_by_device."employeeId", employee_by_code."employeeId") = ${paddedEmployeeCode}
					)
				)`);
			}

			const whereSql = Prisma.sql`WHERE ${Prisma.join(whereConditions, " AND ")}`;
			const eventFromSql = Prisma.sql`
				FROM device_events de
			`;
			const baseFromSql = Prisma.sql`
				FROM device_events de
				INNER JOIN "Device" d ON d.id = de."deviceId"
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
						AND BTRIM(de."employeeNo") ~ '^[0-9]+$'
						AND emp."employeeId" = LPAD(
							COALESCE(NULLIF(REGEXP_REPLACE(BTRIM(de."employeeNo"), '^0+', ''), ''), '0'),
							5,
							'0'
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
			const pageFromSql = hasQuery
				? fromSql
				: sort === "deviceName"
					? baseFromSql
					: eventFromSql;
			const aggregateFromSql = hasQuery ? fromSql : eventFromSql;
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
					JSON_BUILD_OBJECT(
						'id', d.id,
						'name', d.name,
						'address', d.address,
						'port', d.port,
						'protocol', d.protocol::text
					) AS device,
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

			await prisma.device.delete({
				where: { id },
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
		getById,
		update,
		remove,
		enrollDeviceUser,
		importDeviceEnrollment,
	};
};
