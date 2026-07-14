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
import {
	buildHikvisionDeviceEventDedupeKey,
	normalizeHikvisionDeviceEventSource,
	normalizeHikvisionFutureSkewedEventTime,
	parseHikvisionBusinessDateBound,
	parseHikvisionEventTime,
} from "../../helper/hikvision-event-contract.helper";
import { classifyDeviceEvent } from "../../helper/device-event-taxonomy.helper";
import { hikvisionEndpoint } from "../../config/hikvision.endpoint";
import {
	buildHikvisionDeviceBaseUrl,
	getHikvisionDeviceHttpPort,
	hikvisionFetch,
	hikvisionFetchBinary,
} from "../../lib/hikvision-client";
import {
	buildDeviceUserEmployeeNoCandidates,
	extractHikvisionCredentialSummary,
	normalizeHikvisionDeviceUser,
	resolveDeviceUserLinkDecision,
	summarizeDeviceUserStatuses,
	type DeviceUserCandidate,
} from "../../helper/device-user-sync.helper";
import {
	applyMergeChoices,
	buildDeviceUserMergePlan,
	type DeviceUserMergeField,
	type DeviceUserMergeRecord,
} from "../../helper/device-user-merge.helper";
import { buildDeviceRuntimeConfig } from "../../helper/device-config-defaults.helper";
import { summarizeHikvisionListenerLogs } from "../../helper/hikvision-listener-status.helper";
import { controller as callbackController } from "../hikvision/controller/callback.controller";
import net from "net";
import { execFile } from "child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "crypto";
import fs from "fs/promises";
import fsSync from "fs";
import * as os from "os";
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
const DEVICE_EVENT_SOURCES = new Set(["HIKVISION_CALLBACK", "EN_HCNETSDK_ALARM", "ZKTECO_EVENT"]);
const DEVICE_EVENT_CATEGORIES = new Set([
	"ATTENDANCE",
	"ENROLLMENT",
	"USER_MANAGEMENT",
	"ACCESS_CONTROL",
	"DEVICE_HEALTH",
	"RUNTIME",
	"UNKNOWN_VENDOR",
]);
const DEVICE_EVENT_ACTIONS = new Set([
	"TAP",
	"FINGERPRINT_ENROLLED",
	"FINGERPRINT_UPDATED",
	"FINGERPRINT_DELETED",
	"CARD_ENROLLED",
	"CARD_UPDATED",
	"CARD_DELETED",
	"USER_CREATED",
	"USER_UPDATED",
	"USER_DELETED",
	"TAP_REJECTED",
	"SYNC_SIGNAL",
	"SYNC_IMPORTED",
	"LISTENER_RECEIVED",
	"UNKNOWN",
]);
const DEVICE_EVENT_RESET_ADMIN_ROLES = new Set([
	"hris-admin",
	"admin",
	"super_admin",
	"superadmin",
]);
const DEVICE_USER_ADMIN_ROLES = new Set(["hris-admin", "admin", "super_admin", "superadmin"]);
const DEVICE_ADDRESS_PORT_CONFLICT_MESSAGE = "Another device already uses this address and port.";
const HIKVISION_HOT_RELOAD_LISTENER_SERVICE = "project-truth-hikvision-hot-reload-listener.service";
const HIKVISION_LISTENER_CONTROL_ACTIONS = new Set(["start", "stop", "restart"]);
const HIKVISION_VM_WRAPPER_REMOTE_PATH =
	"/usr/local/bin/project-truth-hikvision-hot-reload-listener";
const HIKVISION_VM_DAEMON_REMOTE_PATH = "/usr/local/bin/project-truth-hikvision-hot-reload-daemon";
const HIKVISION_VM_WRAPPER_TMP_PATH = "/tmp/project-truth-hikvision-hot-reload-listener.sh";
const HIKVISION_VM_DAEMON_TMP_PATH = "/tmp/project-truth-hikvision-hot-reload-daemon.sh";
const HIKVISION_VM_SERVICE_REMOTE_PATH = `/etc/systemd/system/${HIKVISION_HOT_RELOAD_LISTENER_SERVICE}`;
const HIKVISION_VM_SERVICE_TMP_PATH = `/tmp/${HIKVISION_HOT_RELOAD_LISTENER_SERVICE}`;
const HIKVISION_VM_LOCAL_API_BASE =
	String(process.env.HIKVISION_VM_LOCAL_API_BASE || "").trim() || "http://127.0.0.1:3101";
const HIKVISION_PEER_COPY_RETRY_LIMIT = Math.max(
	1,
	Math.min(Number(process.env.HIKVISION_PEER_COPY_RETRY_LIMIT || 2), 4),
);
const HIKVISION_PEER_COPY_COMPLETION_WAIT_MS = Math.max(
	0,
	Math.min(Number(process.env.HIKVISION_PEER_COPY_COMPLETION_WAIT_MS || 90000), 180000),
);
const DEVICE_USER_IMPORT_ROW_TIMEOUT_MS = Math.max(
	30000,
	Math.min(Number(process.env.DEVICE_USER_IMPORT_ROW_TIMEOUT_MS || 90000), 180000),
);
const DEVICE_USER_EXPORT_SCHEMA_VERSION = "project-truth.hikvision-device-users.v1";
const DEVICE_USER_IMPORT_CONFIRMATION = "IMPORT DEVICE USERS";
const DEVICE_USER_BIOMETRIC_BUNDLE_ALGORITHM = "aes-256-gcm";
const DEVICE_USER_PACKAGE_IMPORT_JOB_DIR = path.join(
	process.cwd(),
	"..",
	".runtime",
	"device-user-import-jobs",
);

type DeviceImportJobStatus = "processing" | "completed" | "failed" | "cancelled";

type DeviceImportJob = {
	jobId: string;
	runId?: string;
	status: DeviceImportJobStatus;
	organizationId: string;
	deviceId: string;
	deviceName: string;
	total: number;
	sourceTotal?: number | null;
	targetImportCount?: number | null;
	scanLimit?: number | null;
	processed: number;
	imported: number;
	skipped: number;
	alreadySaved?: number;
	knownSkipped?: number;
	skipMissingEmployeeNo?: boolean;
	cancelRequested?: boolean;
	cancelRequestedAt?: Date;
	failed: number;
	message: string;
	errors: Array<{ row: number; error: string }>;
	startedAt: Date;
	completedAt?: Date;
};

const deviceImportJobs = new Map<string, DeviceImportJob>();

type DeviceUserPackageImportJobStatus = "processing" | "completed" | "failed";

type DeviceUserPackageImportJob = {
	jobId: string;
	status: DeviceUserPackageImportJobStatus;
	organizationId: string;
	targetDeviceId?: string | null;
	targetDeviceName?: string | null;
	planned: number;
	imported: number;
	failed: number;
	skipped: number;
	message: string;
	backupDir?: string | null;
	plaintextBiometricExposed: false;
	results: any[];
	error?: string | null;
	startedAt: Date;
	completedAt?: Date;
};

const deviceUserPackageImportJobs = new Map<string, DeviceUserPackageImportJob>();

const serializeDeviceUserPackageImportJob = (job: DeviceUserPackageImportJob) => ({
	...job,
	startedAt: job.startedAt instanceof Date ? job.startedAt.toISOString() : job.startedAt,
	completedAt: job.completedAt instanceof Date ? job.completedAt.toISOString() : job.completedAt || null,
	plaintextBiometricExposed: false,
});

const persistDeviceUserPackageImportJob = (job: DeviceUserPackageImportJob) => {
	try {
		fsSync.mkdirSync(DEVICE_USER_PACKAGE_IMPORT_JOB_DIR, { recursive: true });
		fsSync.writeFileSync(
			path.join(DEVICE_USER_PACKAGE_IMPORT_JOB_DIR, `${job.jobId}.json`),
			JSON.stringify(serializeDeviceUserPackageImportJob(job), null, 2),
		);
	} catch (error) {
		deviceLogger.warn(`Failed to persist device-user import job snapshot: ${error}`);
	}
};

const readDeviceUserPackageImportJob = (jobId: string): DeviceUserPackageImportJob | null => {
	try {
		const filePath = path.join(DEVICE_USER_PACKAGE_IMPORT_JOB_DIR, `${jobId}.json`);
		if (!fsSync.existsSync(filePath)) return null;
		const parsed = JSON.parse(fsSync.readFileSync(filePath, "utf8"));
		return {
			...parsed,
			startedAt: parsed.startedAt ? new Date(parsed.startedAt) : new Date(),
			completedAt: parsed.completedAt ? new Date(parsed.completedAt) : undefined,
			plaintextBiometricExposed: false,
			results: Array.isArray(parsed.results) ? parsed.results : [],
		};
	} catch (error) {
		deviceLogger.warn(`Failed to read device-user import job snapshot: ${error}`);
		return null;
	}
};

type DeviceUserSyncJobStatus = "processing" | "completed" | "failed" | "cancelled";
type DeviceUserSyncMode = "full_refresh" | "needs_attention_only" | "peer_converge";

type DeviceUserSyncJobResult = {
	deviceId: string;
	deviceName: string;
	status: "success" | "error" | "cancelled";
	summary?: Record<string, any>;
	runId?: string | null;
	error?: string | null;
};

type DeviceUserSyncJob = {
	jobId: string;
	status: DeviceUserSyncJobStatus;
	syncMode: DeviceUserSyncMode;
	organizationId: string;
	totalDevices: number;
	processedDevices: number;
	successfulDevices: number;
	failedDevices: number;
	message: string;
	cancelRequested?: boolean;
	cancelRequestedAt?: Date;
	results: DeviceUserSyncJobResult[];
	startedAt: Date;
	completedAt?: Date;
};

type HikvisionCapabilityStatus =
	| "supported"
	| "notSupported"
	| "methodNotAllowed"
	| "authFailed"
	| "unknown";

type DeviceUserMergeJobStatus = "processing" | "completed" | "failed";

type DeviceUserMergeJob = {
	jobId: string;
	planId: string;
	retryPlanId?: string;
	status: DeviceUserMergeJobStatus;
	organizationId: string;
	totalWrites: number;
	processedWrites: number;
	successfulWrites: number;
	failedWrites: number;
	message: string;
	results: any[];
	remainingConflicts?: number;
	remainingMissing?: number;
	attention?: number;
	error?: string | null;
	startedAt: Date;
	completedAt?: Date;
};

const deviceUserSyncJobs = new Map<string, DeviceUserSyncJob>();
const deviceUserMergeJobs = new Map<string, DeviceUserMergeJob>();
const deviceUserMergePlans = new Map<
	string,
	{ organizationId: string; plan: any; createdAt: Date; req: Request }
>();

const cleanupDeviceImportJobs = () => {
	const cutoff = Date.now() - 60 * 60 * 1000;
	for (const [jobId, job] of deviceImportJobs.entries()) {
		if (job.startedAt.getTime() < cutoff) deviceImportJobs.delete(jobId);
	}
};

const cleanupDeviceUserPackageImportJobs = () => {
	const cutoff = Date.now() - 60 * 60 * 1000;
	for (const [jobId, job] of deviceUserPackageImportJobs.entries()) {
		if (job.startedAt.getTime() < cutoff) deviceUserPackageImportJobs.delete(jobId);
	}
};

const cleanupDeviceUserSyncJobs = () => {
	const cutoff = Date.now() - 60 * 60 * 1000;
	for (const [jobId, job] of deviceUserSyncJobs.entries()) {
		if (job.startedAt.getTime() < cutoff) deviceUserSyncJobs.delete(jobId);
	}
};

const cleanupDeviceUserMergeJobs = () => {
	const cutoff = Date.now() - 60 * 60 * 1000;
	for (const [jobId, job] of deviceUserMergeJobs.entries()) {
		if (job.startedAt.getTime() < cutoff) deviceUserMergeJobs.delete(jobId);
	}
};

const updateDeviceImportJob = (jobId: string, patch: Partial<Omit<DeviceImportJob, "jobId">>) => {
	const job = deviceImportJobs.get(jobId);
	if (!job) return;
	deviceImportJobs.set(jobId, { ...job, ...patch });
};

const updateDeviceUserPackageImportJob = (
	jobId: string,
	patch: Partial<Omit<DeviceUserPackageImportJob, "jobId" | "results">> & { results?: any[] },
) => {
	const job = deviceUserPackageImportJobs.get(jobId);
	if (!job) return;
	const nextJob = {
		...job,
		...patch,
		results: patch.results || job.results,
	};
	deviceUserPackageImportJobs.set(jobId, nextJob);
	persistDeviceUserPackageImportJob(nextJob);
};

const updateDeviceUserSyncJob = (
	jobId: string,
	patch: Partial<Omit<DeviceUserSyncJob, "jobId" | "results">> & {
		results?: DeviceUserSyncJobResult[];
	},
) => {
	const job = deviceUserSyncJobs.get(jobId);
	if (!job) return;
	deviceUserSyncJobs.set(jobId, {
		...job,
		...patch,
		results: patch.results || job.results,
	});
};

const updateDeviceUserMergeJob = (
	jobId: string,
	patch: Partial<Omit<DeviceUserMergeJob, "jobId" | "results">> & { results?: any[] },
) => {
	const job = deviceUserMergeJobs.get(jobId);
	if (!job) return;
	deviceUserMergeJobs.set(jobId, {
		...job,
		...patch,
		results: patch.results || job.results,
	});
};

const runFixedProcess = (
	file: string,
	args: string[],
	options: { timeoutMs?: number } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> =>
	new Promise((resolve) => {
		execFile(
			file,
			args,
			{
				timeout: options.timeoutMs ?? 7000,
				windowsHide: true,
				maxBuffer: 5 * 1024 * 1024,
			},
			(error: any, stdout, stderr) => {
				resolve({
					exitCode: typeof error?.code === "number" ? error.code : error ? 1 : 0,
					stdout: String(stdout || ""),
					stderr: String(stderr || ""),
				});
			},
		);
	});

const quoteRemoteShellArg = (value: string) => `'${String(value).replace(/'/g, `'\\''`)}'`;

type HikvisionListenerVmTarget = {
	mode: "local" | "ssh";
	host: string;
	user: string;
	key: string;
	destination: string;
	label: string;
};

const getHikvisionListenerVmTargets = (): HikvisionListenerVmTarget[] => {
	const configuredHost = String(process.env.PROJECT_TRUTH_VM_HOST || "").trim();
	const configuredAlias = String(
		process.env.PROJECT_TRUTH_VM_SSH_ALIAS || "project-truth-hris",
	).trim();
	const isLinuxRuntime = process.platform === "linux";
	const host = configuredHost || "10.184.37.19";
	const user = process.env.PROJECT_TRUTH_VM_USER || "infra";
	const key =
		process.env.PROJECT_TRUTH_VM_SSH_KEY ||
		path.join(os.homedir(), ".ssh", "node-health-appliance_ed25519");
	if (!configuredHost && isLinuxRuntime) {
		return [
			{
				mode: "local",
				host,
				user,
				key,
				destination: "local",
				label: "local",
			},
		];
	}
	const targets: HikvisionListenerVmTarget[] = [
		{
			mode: "ssh",
			host,
			user,
			key,
			destination: `${user}@${host}`,
			label: `lan:${host}`,
		},
	];
	if (configuredAlias && configuredAlias !== host && configuredAlias !== `${user}@${host}`) {
		targets.push({
			mode: "ssh",
			host,
			user,
			key,
			destination: configuredAlias,
			label: `alias:${configuredAlias}`,
		});
	}
	return targets;
};

const runHikvisionListenerVmCommand = (remoteArgs: string[], timeoutMs = 7000) => {
	const targets = getHikvisionListenerVmTargets();
	const runAgainstTarget = async (target: HikvisionListenerVmTarget) => {
		if (target.mode === "local") {
			const result = await runFixedProcess(remoteArgs[0] || "true", remoteArgs.slice(1), {
				timeoutMs,
			});
			return { ...result, target };
		}
		const sshArgs = [
			"-o",
			"BatchMode=yes",
			"-o",
			"ConnectTimeout=5",
			"-o",
			"StrictHostKeyChecking=accept-new",
		];
		if (target.destination.includes("@")) {
			sshArgs.unshift(target.key);
			sshArgs.unshift("-i");
		}
		const result = await runFixedProcess(
			process.env.PROJECT_TRUTH_SSH_BIN || "ssh",
			[...sshArgs, target.destination, remoteArgs.map(quoteRemoteShellArg).join(" ")],
			{ timeoutMs },
		);
		return { ...result, target };
	};
	return (async () => {
		let lastResult: Awaited<ReturnType<typeof runAgainstTarget>> | null = null;
		for (const target of targets) {
			const result = await runAgainstTarget(target);
			if (result.exitCode === 0) return result;
			lastResult = result;
		}
		return (
			lastResult || {
				exitCode: 1,
				stdout: "",
				stderr: "No Hikvision VM target configured",
				target: targets[0],
			}
		);
	})();
};

const runHikvisionListenerVmCopy = (localPath: string, remotePath: string, timeoutMs = 12000) => {
	const targets = getHikvisionListenerVmTargets();
	const runAgainstTarget = async (target: HikvisionListenerVmTarget) => {
		if (target.mode === "local") {
			try {
				fsSync.copyFileSync(localPath, remotePath);
				return { exitCode: 0, stdout: "", stderr: "", target };
			} catch (error: any) {
				return {
					exitCode: 1,
					stdout: "",
					stderr: error?.message || "Failed to copy listener runtime locally",
					target,
				};
			}
		}
		const scpArgs = [
			"-o",
			"BatchMode=yes",
			"-o",
			"ConnectTimeout=5",
			"-o",
			"StrictHostKeyChecking=accept-new",
		];
		if (target.destination.includes("@")) {
			scpArgs.unshift(target.key);
			scpArgs.unshift("-i");
		}
		const result = await runFixedProcess(
			process.env.PROJECT_TRUTH_SCP_BIN || "scp",
			[...scpArgs, localPath, `${target.destination}:${remotePath}`],
			{ timeoutMs },
		);
		return { ...result, target };
	};
	return (async () => {
		let lastResult: Awaited<ReturnType<typeof runAgainstTarget>> | null = null;
		for (const target of targets) {
			const result = await runAgainstTarget(target);
			if (result.exitCode === 0) return result;
			lastResult = result;
		}
		return (
			lastResult || {
				exitCode: 1,
				stdout: "",
				stderr: "No Hikvision VM target configured",
				target: targets[0],
			}
		);
	})();
};

const resolveManagedHikvisionListenerWrapperLocalPath = () => {
	const candidates = [
		path.resolve(process.cwd(), "../scripts/project-truth-hikvision-hot-reload-listener.sh"),
		path.resolve(process.cwd(), "scripts/project-truth-hikvision-hot-reload-listener.sh"),
		path.resolve(__dirname, "../../../scripts/project-truth-hikvision-hot-reload-listener.sh"),
	];
	return candidates.find((candidate) => fsSync.existsSync(candidate)) || null;
};

const resolveManagedHikvisionListenerDaemonLocalPath = () => {
	const candidates = [
		path.resolve(process.cwd(), "../scripts/project-truth-hikvision-hot-reload-daemon.sh"),
		path.resolve(process.cwd(), "scripts/project-truth-hikvision-hot-reload-daemon.sh"),
		path.resolve(__dirname, "../../../scripts/project-truth-hikvision-hot-reload-daemon.sh"),
	];
	return candidates.find((candidate) => fsSync.existsSync(candidate)) || null;
};

const resolveManagedHikvisionListenerServiceLocalPath = () => {
	const candidates = [
		path.resolve(
			process.cwd(),
			"../appliance/systemd/project-truth-hikvision-hot-reload-listener.service",
		),
		path.resolve(
			process.cwd(),
			"appliance/systemd/project-truth-hikvision-hot-reload-listener.service",
		),
		path.resolve(
			__dirname,
			"../../../appliance/systemd/project-truth-hikvision-hot-reload-listener.service",
		),
	];
	return candidates.find((candidate) => fsSync.existsSync(candidate)) || null;
};

const installManagedHikvisionListenerWrapperOnVm = async () => {
	const wrapperLocalPath = resolveManagedHikvisionListenerWrapperLocalPath();
	const daemonLocalPath = resolveManagedHikvisionListenerDaemonLocalPath();
	const serviceLocalPath = resolveManagedHikvisionListenerServiceLocalPath();
	if (!wrapperLocalPath || !daemonLocalPath || !serviceLocalPath) {
		return {
			ok: false,
			error: "Managed Hikvision listener runtime files are missing from the workspace",
		};
	}

	for (const [localPath, remotePath] of [
		[wrapperLocalPath, HIKVISION_VM_WRAPPER_TMP_PATH],
		[daemonLocalPath, HIKVISION_VM_DAEMON_TMP_PATH],
		[serviceLocalPath, HIKVISION_VM_SERVICE_TMP_PATH],
	] as const) {
		const copyResult = await runHikvisionListenerVmCopy(localPath, remotePath, 12000);
		if (copyResult.exitCode !== 0) {
			return {
				ok: false,
				error:
					copyResult.stderr.trim() ||
					copyResult.stdout.trim() ||
					`Failed to copy listener runtime ${path.basename(localPath)}`,
			};
		}
	}

	for (const remoteArgs of [
		[
			"sudo",
			"install",
			"-o",
			"root",
			"-g",
			"root",
			"-m",
			"0755",
			HIKVISION_VM_WRAPPER_TMP_PATH,
			HIKVISION_VM_WRAPPER_REMOTE_PATH,
		],
		[
			"sudo",
			"install",
			"-o",
			"root",
			"-g",
			"root",
			"-m",
			"0755",
			HIKVISION_VM_DAEMON_TMP_PATH,
			HIKVISION_VM_DAEMON_REMOTE_PATH,
		],
		[
			"sudo",
			"install",
			"-o",
			"root",
			"-g",
			"root",
			"-m",
			"0644",
			HIKVISION_VM_SERVICE_TMP_PATH,
			HIKVISION_VM_SERVICE_REMOTE_PATH,
		],
		["sudo", "systemctl", "daemon-reload"],
	] as const) {
		const installResult = await runHikvisionListenerVmCommand([...remoteArgs], 12000);
		if (installResult.exitCode !== 0) {
			return {
				ok: false,
				error:
					installResult.stderr.trim() ||
					installResult.stdout.trim() ||
					"Failed to install listener wrapper",
			};
		}
	}

	return { ok: true, localPath: wrapperLocalPath };
};

const parseSystemctlShow = (stdout: string) =>
	String(stdout || "")
		.split(/\r?\n/)
		.reduce<Record<string, string>>((acc, line) => {
			const index = line.indexOf("=");
			if (index > 0) acc[line.slice(0, index)] = line.slice(index + 1);
			return acc;
		}, {});

const parseJsonLines = (stdout: string) =>
	String(stdout || "")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			try {
				return JSON.parse(line) as Record<string, any>;
			} catch {
				return { raw: line };
			}
		});

const isMissingHikvisionListenerRuntimeError = (detail: string) =>
	/no such file|not found|command not found/i.test(String(detail || ""));

const hikvisionDeviceLabel = (device: any) =>
	String(device?.name || device?.address || device?.id || "device").trim();

const buildHikvisionManualCopySdkFailureMessage = (params: {
	events: Record<string, any>[];
	sourceDevice: any;
	targetDevice: any;
	employeeNo: string;
}) => {
	const sourceDeviceId = String(params.sourceDevice?.id || "").trim();
	const targetDeviceId = String(params.targetDevice?.id || "").trim();
	const sourceFailure = params.events.find(
		(event) =>
			event?.event === "manual_reconcile_queue_failed" &&
			String(event?.sourceDeviceId || "").trim() === sourceDeviceId,
	);
	const failedLogin = params.events.find(
		(event) =>
			event?.event === "sdk_login" &&
			String(event?.ok || "").trim().toLowerCase() === "false" &&
			(!event?.deviceId || String(event.deviceId).trim() === sourceDeviceId),
	);
	if (sourceFailure || failedLogin) {
		const sourceName = hikvisionDeviceLabel(params.sourceDevice);
		const targetName = hikvisionDeviceLabel(params.targetDevice);
		const reason = String(sourceFailure?.reason || "source SDK login failed").trim();
		const lastError = failedLogin?.lastError
			? `; SDK login lastError ${failedLogin.lastError}`
			: "";
		const host = failedLogin?.host
			? ` on ${failedLogin.host}${failedLogin.sdkPort ? `:${failedLogin.sdkPort}` : ""}`
			: "";
		return `${sourceName} cannot be used as the SDK copy source for employee ${params.employeeNo} right now (${reason}${lastError}${host}). ${targetName} was not the device reported by the SDK failure.`;
	}
	const targetFailure = params.events.find(
		(event) =>
			event?.event === "sdk_login" &&
			String(event?.ok || "").trim().toLowerCase() === "false" &&
			String(event?.deviceId || "").trim() === targetDeviceId,
	);
	if (targetFailure) {
		const targetName = hikvisionDeviceLabel(params.targetDevice);
		const host = targetFailure.host
			? ` on ${targetFailure.host}${targetFailure.sdkPort ? `:${targetFailure.sdkPort}` : ""}`
			: "";
		return `${targetName} cannot be used as the SDK copy target for employee ${params.employeeNo} right now (SDK login lastError ${targetFailure.lastError || "unknown"}${host}).`;
	}
	return "";
};

const isDeterministicHikvisionManualCopySdkFailure = (message: string) =>
	/cannot be used as the SDK copy (source|target)/i.test(String(message || ""));

const sleep = (ms: number) =>
	new Promise((resolve) => {
		setTimeout(resolve, Math.max(0, Math.floor(ms)));
	});

const withDeviceUserImportTimeout = async <T>(
	promise: Promise<T>,
	timeoutMs: number,
	message: string,
): Promise<T> => {
	let timer: NodeJS.Timeout | undefined;
	const timeout = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => reject(new Error(message)), timeoutMs);
	});
	try {
		return await Promise.race([promise, timeout]);
	} finally {
		if (timer) clearTimeout(timer);
	}
};

type HikvisionManualCopyParams = {
	sourceDevice: any;
	targetDevice: any;
	sourceDeviceId: string;
	targetDeviceId: string;
	employeeNo: string;
	includeFingerprints: boolean;
	includeFaceRecognition: boolean;
	waitSeconds?: number;
};

const readStoredHikvisionSyntheticCredentialSummary = (rawPayload: any) => {
	const synthetic = rawPayload?._hrisDeviceMetadata?.syntheticCredentialSummary || {};
	const fingerprintCount = Number(synthetic?.fingerprintCount ?? 0);
	const faceCount = Number(synthetic?.faceCount ?? 0);
	return {
		fingerprintCount:
			Number.isFinite(fingerprintCount) && fingerprintCount > 0
				? Math.max(0, Math.floor(fingerprintCount))
				: 0,
		faceCount:
			Number.isFinite(faceCount) && faceCount > 0 ? Math.max(0, Math.floor(faceCount)) : 0,
	};
};

const readStoredHikvisionSyntheticFingerprintCount = (rawPayload: any) =>
	readStoredHikvisionSyntheticCredentialSummary(rawPayload).fingerprintCount;

const readStoredHikvisionSyntheticFaceCount = (rawPayload: any) =>
	readStoredHikvisionSyntheticCredentialSummary(rawPayload).faceCount;

const buildEffectiveHikvisionCredentialSummary = (rawPayload: any) => {
	const physical = extractHikvisionCredentialSummary(rawPayload || {});
	const synthetic = readStoredHikvisionSyntheticCredentialSummary(rawPayload || {});
	return {
		fingerprintCount: Math.max(physical.fingerprintCount, synthetic.fingerprintCount),
		cardCount: physical.cardCount,
		faceCount: Math.max(physical.faceCount, synthetic.faceCount),
		hasFingerprint: Math.max(physical.fingerprintCount, synthetic.fingerprintCount) > 0,
		hasCard: physical.cardCount > 0,
		hasFace: Math.max(physical.faceCount, synthetic.faceCount) > 0,
		syntheticFingerprintCount: synthetic.fingerprintCount,
		syntheticFaceCount: synthetic.faceCount,
	};
};

type SavedDeviceUserTruthRow = {
	deviceId?: string | null;
	vendorUserId?: string | null;
	rawPayload?: any;
	status?: string | null;
	employeeId?: string | null;
};

const summarizeSavedDeviceUserTruth = (deviceUsers: SavedDeviceUserTruthRow[]) => {
	const uniqueUsers = new Map<string, SavedDeviceUserTruthRow>();
	for (const deviceUser of deviceUsers || []) {
		const vendorUserId = String(deviceUser?.vendorUserId || "").trim();
		if (!vendorUserId || uniqueUsers.has(vendorUserId)) continue;
		uniqueUsers.set(vendorUserId, deviceUser);
	}
	return Array.from(uniqueUsers.values()).reduce(
		(summary, deviceUser) => {
			const credentialSummary = buildEffectiveHikvisionCredentialSummary(
				deviceUser?.rawPayload || {},
			);
			return {
				userCount: summary.userCount + 1,
				fingerprintCount:
					summary.fingerprintCount + Number(credentialSummary.fingerprintCount || 0),
				faceCount: summary.faceCount + Number(credentialSummary.faceCount || 0),
				cardCount: summary.cardCount + Number(credentialSummary.cardCount || 0),
			};
		},
		{
			userCount: 0,
			fingerprintCount: 0,
			faceCount: 0,
			cardCount: 0,
		},
	);
};

const compareSavedDeviceUserTruth = (
	baselineUsers: SavedDeviceUserTruthRow[],
	targetUsers: SavedDeviceUserTruthRow[],
) => {
	const baselineByVendorUserId = new Map<string, SavedDeviceUserTruthRow>();
	for (const deviceUser of baselineUsers || []) {
		const vendorUserId = String(deviceUser?.vendorUserId || "").trim();
		if (!vendorUserId || baselineByVendorUserId.has(vendorUserId)) continue;
		baselineByVendorUserId.set(vendorUserId, deviceUser);
	}
	const targetByVendorUserId = new Map<string, SavedDeviceUserTruthRow>();
	for (const deviceUser of targetUsers || []) {
		const vendorUserId = String(deviceUser?.vendorUserId || "").trim();
		if (!vendorUserId || targetByVendorUserId.has(vendorUserId)) continue;
		targetByVendorUserId.set(vendorUserId, deviceUser);
	}

	let missingUsers = 0;
	let staleUsers = 0;
	let missingFingerprintCount = 0;
	let missingFaceCount = 0;
	let missingCardCount = 0;

	for (const [vendorUserId, baselineUser] of baselineByVendorUserId.entries()) {
		const baselineSummary = buildEffectiveHikvisionCredentialSummary(
			baselineUser?.rawPayload || {},
		);
		const targetUser = targetByVendorUserId.get(vendorUserId) || null;
		if (!targetUser) {
			missingUsers += 1;
			missingFingerprintCount += Number(baselineSummary.fingerprintCount || 0);
			missingFaceCount += Number(baselineSummary.faceCount || 0);
			missingCardCount += Number(baselineSummary.cardCount || 0);
			continue;
		}

		const targetSummary = buildEffectiveHikvisionCredentialSummary(
			targetUser?.rawPayload || {},
		);
		const fingerprintGap = Math.max(
			Number(baselineSummary.fingerprintCount || 0) -
				Number(targetSummary.fingerprintCount || 0),
			0,
		);
		const faceGap = Math.max(
			Number(baselineSummary.faceCount || 0) - Number(targetSummary.faceCount || 0),
			0,
		);
		const cardGap = Math.max(
			Number(baselineSummary.cardCount || 0) - Number(targetSummary.cardCount || 0),
			0,
		);
		if (fingerprintGap > 0 || faceGap > 0 || cardGap > 0) {
			staleUsers += 1;
			missingFingerprintCount += fingerprintGap;
			missingFaceCount += faceGap;
			missingCardCount += cardGap;
		}
	}

	return {
		missingUsers,
		staleUsers,
		missingFingerprintCount,
		missingFaceCount,
		missingCardCount,
		totalCredentialGapCount: missingFingerprintCount + missingFaceCount + missingCardCount,
		totalNeedsMatchCount: missingUsers + staleUsers,
	};
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

	const cleanHikvisionDeviceSpecValue = (value: any) =>
		String(value ?? "")
			.replace(/[\r\n|]+/g, " ")
			.trim();

	const getHikvisionSdkEndpoint = (device: any) => {
		const config = device?.config || {};
		return {
			host: cleanHikvisionDeviceSpecValue(config.hikvisionSdkRuntimeAddress || device?.address),
			port: cleanHikvisionDeviceSpecValue(
				config.hikvisionSdkRuntimePort || config.sdkPort || "8000",
			),
		};
	};

	const buildHikvisionManualCopySpecLine = (device: any) => {
		const config = device?.config || {};
		const access = device?.access || {};
		const { host: sdkHost, port: sdkPort } = getHikvisionSdkEndpoint(device);
		const username = cleanHikvisionDeviceSpecValue(
			access.username || process.env.HIKVISION_USERNAME,
		);
		const password = cleanHikvisionDeviceSpecValue(
			access.password || process.env.HIKVISION_PASSWORD,
		);
		if (!device?.id || !device?.organizationId || !sdkHost || !sdkPort || !username || !password) {
			throw new Error(
				`Hikvision manual copy cannot prepare SDK spec for ${
					device?.name || device?.id || "unknown device"
				}`,
			);
		}
		return [
			cleanHikvisionDeviceSpecValue(device.id),
			cleanHikvisionDeviceSpecValue(device.organizationId),
			cleanHikvisionDeviceSpecValue(device.name || device.id),
			sdkHost,
			sdkPort,
			username,
			password,
			"true",
		].join("|");
	};

	const writeHikvisionManualCopySpec = (params: HikvisionManualCopyParams) => {
		const specText = [
			buildHikvisionManualCopySpecLine(params.sourceDevice),
			buildHikvisionManualCopySpecLine(params.targetDevice),
		].join("\n");
		const localPath = path.join(
			os.tmpdir(),
			`project-truth-hikvision-manual-copy-${Date.now()}-${Math.random()
				.toString(16)
				.slice(2)}.spec`,
		);
		fsSync.writeFileSync(localPath, `${specText}\n`, { mode: 0o600 });
		return localPath;
	};

	const preflightHikvisionManualCopyEndpoint = async (
		device: any,
		role: "source" | "target",
		employeeNo: string,
	) => {
		const { host, port } = getHikvisionSdkEndpoint(device);
		const label = hikvisionDeviceLabel(device);
		if (!/^[A-Za-z0-9_.-]+$/.test(host) || !/^\d+$/.test(port)) {
			throw new Error(
				`${label} cannot be used as the SDK copy ${role} for employee ${employeeNo} because its SDK endpoint is invalid (${host || "missing"}:${port || "missing"}).`,
			);
		}
		const result = await runHikvisionListenerVmCommand(
			[
				"bash",
				"-lc",
				`timeout 4 nc -z ${host} ${port}`,
			],
			7000,
		);
		if (result.exitCode !== 0) {
			throw new Error(
				`${label} cannot be used as the SDK copy ${role} for employee ${employeeNo} right now (VM cannot reach ${host}:${port} before SDK login).`,
			);
		}
	};

	const runHikvisionManualCopyOnVm = async (params: HikvisionManualCopyParams) => {
		const waitSeconds = Math.max(1, Math.min(Number(params.waitSeconds || 1), 8));
		await preflightHikvisionManualCopyEndpoint(
			params.sourceDevice,
			"source",
			params.employeeNo,
		);
		await preflightHikvisionManualCopyEndpoint(
			params.targetDevice,
			"target",
			params.employeeNo,
		);
		const localSpecPath = writeHikvisionManualCopySpec(params);
		const remoteSpecPath = `/tmp/project-truth-hikvision-manual-copy-${Date.now()}.spec`;
		try {
			const copySpecResult = await runHikvisionListenerVmCopy(
				localSpecPath,
				remoteSpecPath,
				12000,
			);
			if (copySpecResult.exitCode !== 0) {
				throw new Error(
					copySpecResult.stderr.trim() ||
						copySpecResult.stdout.trim() ||
						"Failed to copy Hikvision manual peer-copy spec to the VM",
				);
			}

			const runManualCopy = (extraEnv: string[] = []) =>
				runHikvisionListenerVmCommand(
					[
						"sudo",
						"env",
						...extraEnv,
						"HIKVISION_ALLOW_STATIC_DEVICE_SPEC=1",
						"HIKVISION_SKIP_SPOOL_REPLAY=1",
						`HIKVISION_DEVICE_SPEC_OVERRIDE=${remoteSpecPath}`,
						`HIKVISION_RUN_SECONDS=${waitSeconds}`,
						HIKVISION_VM_WRAPPER_REMOTE_PATH,
						"--run-once",
						"--manual-full-mirror-source-device-id",
						params.sourceDeviceId,
						"--manual-employee-no",
						params.employeeNo,
						...(params.includeFingerprints ? ["--manual-include-fingerprints"] : []),
						...(params.includeFaceRecognition ? [] : ["--manual-exclude-face"]),
					],
					Math.max(waitSeconds * 1000 + 45000, 60000),
				);
		const strategies = [
			{
				name: "static_spec",
				extraEnv: [] as string[],
			},
			{
				name: "postgres",
				extraEnv: [] as string[],
			},
			{
				name: "api",
				extraEnv: [
					"HIKVISION_HOT_RELOAD_DEVICE_SOURCE=api",
					`HIKVISION_HOT_RELOAD_API_BASE=${HIKVISION_VM_LOCAL_API_BASE}`,
				],
			},
		];
		const failures: string[] = [];
		for (const strategy of strategies) {
			let result = await runManualCopy(strategy.extraEnv);
			const firstAttemptDetail = result.stderr.trim() || result.stdout.trim();
			if (
				result.exitCode !== 0 &&
				isMissingHikvisionListenerRuntimeError(firstAttemptDetail)
			) {
				const installResult = await installManagedHikvisionListenerWrapperOnVm();
				if (!installResult.ok) {
					throw new Error(
						installResult.error ||
							"Failed to prepare Hikvision listener runtime for manual copy",
					);
				}
				result = await runManualCopy(strategy.extraEnv);
			}
			const events = parseJsonLines(result.stdout);
			const peerUserWriteOk = events.some(
				(event) =>
					event?.event === "peer_user_write" &&
					String(event?.employeeNo || "").trim() === params.employeeNo &&
					String(event?.ok || "")
						.trim()
						.toLowerCase() === "true",
			);
			const fingerprintWriteOk =
				!params.includeFingerprints ||
				events.some(
					(event) =>
						event?.event === "peer_fingerprint_write" &&
						String(event?.employeeNo || "").trim() === params.employeeNo &&
						String(event?.ok || "")
							.trim()
							.toLowerCase() === "true",
				) ||
				events.some(
					(event) =>
						event?.event === "peer_fingerprint_write_skipped" &&
						String(event?.employeeNo || "").trim() === params.employeeNo,
				);
			const completed = events.some(
				(event) =>
					event?.event === "reconcile_completed" &&
					String(event?.employeeNo || "").trim() === params.employeeNo,
			);
			if (result.exitCode === 0 && peerUserWriteOk && completed && fingerprintWriteOk) {
				return {
					waitSeconds,
					strategy: strategy.name,
					stdout: result.stdout,
					stderr: result.stderr,
					events,
				};
			}
			const sdkFailureMessage = buildHikvisionManualCopySdkFailureMessage({
				events,
				sourceDevice: params.sourceDevice,
				targetDevice: params.targetDevice,
				employeeNo: params.employeeNo,
			});
			if (sdkFailureMessage && isDeterministicHikvisionManualCopySdkFailure(sdkFailureMessage)) {
				throw new Error(sdkFailureMessage);
			}
			failures.push(
				`${strategy.name}: ${
					sdkFailureMessage ||
					result.stderr.trim() ||
					result.stdout.trim() ||
					"Scoped Hikvision user copy did not report a completed peer write"
				}`,
			);
		}
		throw new Error(failures.join(" | "));
		} finally {
			try {
				fsSync.unlinkSync(localSpecPath);
			} catch {}
			await runHikvisionListenerVmCommand(["sudo", "rm", "-f", remoteSpecPath], 7000).catch(
				() => undefined,
			);
		}
	};

	const getDeviceUserBiometricBundleSecret = (organizationId: string, deviceId: string) => {
		const configured = String(process.env.DEVICE_USER_BIOMETRIC_BUNDLE_KEY || "").trim();
		if (configured) return { secret: configured, source: "DEVICE_USER_BIOMETRIC_BUNDLE_KEY" };
		return {
			secret: `project-truth-dev-biometric-bundle:${organizationId}:${deviceId}`,
			source: "development-derived-context-key",
		};
	};

	const encryptDeviceUserBiometricPayload = (params: {
		organizationId: string;
		deviceId: string;
		vendorUserId: string;
		modality?: "fingerprint" | "face" | "combined";
		payload: Record<string, any>;
	}) => {
		const { secret, source } = getDeviceUserBiometricBundleSecret(
			params.organizationId,
			params.deviceId,
		);
		const salt = randomBytes(16);
		const iv = randomBytes(12);
		const key = createHash("sha256").update(secret).update(salt).digest();
		const cipher = createCipheriv("aes-256-gcm", key, iv);
		const plaintext = Buffer.from(JSON.stringify(params.payload), "utf8");
		const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
		const authTag = cipher.getAuthTag();
		return {
			format: "project-truth.hikvision-biometric-template.v1",
			algorithm: DEVICE_USER_BIOMETRIC_BUNDLE_ALGORITHM,
			keySource: source,
			deviceId: params.deviceId,
			vendorUserId: params.vendorUserId,
			modality: params.modality || "combined",
			salt: salt.toString("base64"),
			iv: iv.toString("base64"),
			authTag: authTag.toString("base64"),
			ciphertext: ciphertext.toString("base64"),
			plaintextSha256: createHash("sha256").update(plaintext).digest("hex"),
			createdAt: new Date().toISOString(),
		};
	};

	const decryptDeviceUserBiometricPayload = (params: {
		organizationId: string;
		deviceId: string;
		encrypted: any;
	}) => {
		const encrypted = params.encrypted || {};
		const { secret } = getDeviceUserBiometricBundleSecret(params.organizationId, params.deviceId);
		const salt = Buffer.from(String(encrypted.salt || ""), "base64");
		const iv = Buffer.from(String(encrypted.iv || ""), "base64");
		const authTag = Buffer.from(String(encrypted.authTag || ""), "base64");
		const ciphertext = Buffer.from(String(encrypted.ciphertext || ""), "base64");
		const key = createHash("sha256").update(secret).update(salt).digest();
		const decipher = createDecipheriv("aes-256-gcm", key, iv);
		decipher.setAuthTag(authTag);
		const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
		const plaintextSha256 = createHash("sha256").update(plaintext).digest("hex");
		if (encrypted.plaintextSha256 && encrypted.plaintextSha256 !== plaintextSha256) {
			throw new Error("Encrypted biometric bundle hash mismatch");
		}
		return JSON.parse(plaintext.toString("utf8"));
	};

	const parseEncryptedDeviceUserBiometricTemplate = (...candidates: any[]) => {
		for (const candidate of candidates.flat()) {
			if (!candidate) continue;
			try {
				const parsed =
					typeof candidate === "string" ? JSON.parse(candidate.trim()) : candidate;
				if (parsed?.ciphertext && parsed?.algorithm === DEVICE_USER_BIOMETRIC_BUNDLE_ALGORITHM) {
					return parsed;
				}
			} catch {}
		}
		return null;
	};
	const parseEncryptedDeviceUserBiometricModality = (
		modality: "fingerprint" | "face",
		...candidates: any[]
	) => {
		const parsed = parseEncryptedDeviceUserBiometricTemplate(...candidates);
		return parsed?.modality === modality ? parsed : null;
	};

	const parseImportedEncryptedBiometricTemplates = (row: any) => {
		const fingerprintCandidate = parseEncryptedDeviceUserBiometricTemplate(
			row?.vendorMetadata?.biometricBundle?.fingerprintRawTemplateBlob,
			row?.rawPayload?._hrisDeviceMetadata?.biometricCsvColumns?.fingerprintRawTemplateBlob,
		);
		const faceCandidate = parseEncryptedDeviceUserBiometricTemplate(
			row?.vendorMetadata?.biometricBundle?.faceRawTemplateBlob,
			row?.rawPayload?._hrisDeviceMetadata?.biometricCsvColumns?.faceRawTemplateBlob,
		);
		return {
			fingerprint: fingerprintCandidate?.modality === "fingerprint" ? fingerprintCandidate : null,
			face: faceCandidate?.modality === "face" ? faceCandidate : null,
			legacy: parseEncryptedDeviceUserBiometricTemplate(
				row?.vendorMetadata?.biometricBundle?.encryptedBiometricTemplate,
				row?.rawPayload?._hrisDeviceMetadata?.biometricExport?.encryptedBiometricTemplate,
				...(!fingerprintCandidate?.modality ? [fingerprintCandidate] : []),
				...(!faceCandidate?.modality ? [faceCandidate] : []),
			),
		};
	};

	const parseCachedDeviceUserBiometricTemplates = (row: any) => {
		const biometricExport = row?.rawPayload?._hrisDeviceMetadata?.biometricExport || {};
		const biometricBundle = row?.vendorMetadata?.biometricBundle || {};
		return {
			fingerprint: parseEncryptedDeviceUserBiometricModality(
				"fingerprint",
				biometricExport.encryptedFingerprintTemplate,
				biometricBundle.encryptedFingerprintTemplate,
				biometricBundle.fingerprintRawTemplateBlob,
			),
			face: parseEncryptedDeviceUserBiometricModality(
				"face",
				biometricExport.encryptedFaceTemplate,
				biometricBundle.encryptedFaceTemplate,
				biometricBundle.faceRawTemplateBlob,
			),
			legacy: parseEncryptedDeviceUserBiometricTemplate(
				biometricExport.encryptedBiometricTemplate,
				biometricBundle.encryptedBiometricTemplate,
			),
		};
	};

	const buildDeviceUserBiometricMetadata = (biometricExport: any, source = "hikvision_sdk_live_read") => {
		const fingerprintEncrypted = biometricExport.encryptedFingerprint || null;
		const faceEncrypted = biometricExport.encryptedFace || null;
		const fingerprintEncryptedValue = fingerprintEncrypted
			? JSON.stringify(fingerprintEncrypted)
			: "";
		const faceEncryptedValue = faceEncrypted ? JSON.stringify(faceEncrypted) : "";
		return {
			rawPayloadMetadata: {
				encryptedFingerprintTemplate: fingerprintEncrypted,
				encryptedFaceTemplate: faceEncrypted,
				fingerprintTemplateCount: biometricExport.fingerprintCount,
				faceTemplateSize: biometricExport.faceTemplateSize,
				facePictureSize: biometricExport.facePictureSize,
				cardNo: biometricExport.cardNo,
				source,
				capturedAt: new Date().toISOString(),
			},
			vendorMetadata: {
				present: Boolean(fingerprintEncrypted || faceEncrypted),
				algorithm: DEVICE_USER_BIOMETRIC_BUNDLE_ALGORITHM,
				fingerprintPresent: Boolean(fingerprintEncrypted),
				facePresent: Boolean(faceEncrypted),
				fingerprintRawTemplateBlob: fingerprintEncryptedValue,
				faceRawTemplateBlob: faceEncryptedValue,
				encryptedFingerprintTemplate: fingerprintEncrypted,
				encryptedFaceTemplate: faceEncrypted,
				fingerprintTemplateKeySource: fingerprintEncrypted?.keySource || null,
				faceTemplateKeySource: faceEncrypted?.keySource || null,
				fingerprintTemplateSha256: fingerprintEncrypted?.plaintextSha256 || null,
				faceTemplateSha256: faceEncrypted?.plaintextSha256 || null,
				source,
				capturedAt: new Date().toISOString(),
			},
		};
	};

	const applyDeviceUserBiometricMetadataToRow = (row: any, metadata: any) => {
		const fingerprintCount = Number(metadata.rawPayloadMetadata?.fingerprintTemplateCount || 0);
		const faceCount =
			Number(metadata.rawPayloadMetadata?.faceTemplateSize || 0) > 0 ||
			Number(metadata.rawPayloadMetadata?.facePictureSize || 0) > 0
				? 1
				: 0;
		const credentialSummary = {
			...(row.rawPayload?._hrisDeviceMetadata?.credentialSummary ||
				row.vendorMetadata?.credentialSummary ||
				{}),
			fingerprintCount,
			faceCount,
			hasFingerprint: fingerprintCount > 0,
			hasFace: faceCount > 0,
		};
		row.rawPayload = {
			...(row.rawPayload || {}),
			_hrisDeviceMetadata: {
				...(row.rawPayload?._hrisDeviceMetadata || {}),
				credentialSummary,
				biometricExport: metadata.rawPayloadMetadata,
			},
		};
		row.vendorMetadata = {
			...(row.vendorMetadata || {}),
			credentialSummary,
			biometricBundle: {
				...(row.vendorMetadata?.biometricBundle || {}),
				...metadata.vendorMetadata,
			},
		};
	};

	const persistDeviceUserBiometricMetadata = async (params: {
		organizationId: string;
		deviceId: string;
		vendorUserId: string;
		row: any;
	}) => {
		if (!(await hasDeviceUserVendorMetadataColumn())) return null;
		return (prisma as any).deviceUser.update({
			where: {
				organizationId_deviceId_vendorUserId: {
					organizationId: params.organizationId,
					deviceId: params.deviceId,
					vendorUserId: params.vendorUserId,
				},
			},
			data: {
				rawPayload: params.row.rawPayload || {},
				vendorMetadata: params.row.vendorMetadata || {},
				lastSyncedAt: new Date(),
			},
			select: { id: true, vendorUserId: true, updatedAt: true },
		});
	};

	const summarizeDeviceUserBiometricEvents = async (params: {
		organizationId: string;
		deviceId: string;
		deviceUserId?: string | null;
		employeeNo?: string | null;
	}) => {
		const eventWhere: any = {
			organizationId: params.organizationId,
			deviceId: params.deviceId,
			eventAction: {
				in: [
					"USER_CREATED",
					"USER_UPDATED",
					"FINGERPRINT_ENROLLED",
					"FINGERPRINT_UPDATED",
					"FINGERPRINT_DELETED",
				],
			},
		};
		if (params.deviceUserId) {
			eventWhere.deviceUserId = params.deviceUserId;
		} else if (params.employeeNo) {
			eventWhere.employeeNo = params.employeeNo;
		} else {
			return [];
		}
		const events = await (prisma as any).deviceEvent.findMany({
			where: eventWhere,
			select: {
				id: true,
				eventTime: true,
				eventAction: true,
				eventCategory: true,
				eventConfidence: true,
				source: true,
			},
			orderBy: [{ eventTime: "desc" }],
			take: 10,
		});
		return events.map((event: any) => ({
			id: event.id,
			eventTime: event.eventTime,
			eventAction: event.eventAction,
			eventCategory: event.eventCategory,
			eventConfidence: event.eventConfidence,
			source: event.source,
		}));
	};

	const writeDecryptedBiometricBundleToHikvisionDevice = async (params: {
		req: Request;
		targetDevice: any;
		employeeNo: string;
		decrypted: any;
	}) => {
		const fingerprints = Array.isArray(params.decrypted?.fingerprints)
			? params.decrypted.fingerprints
			: [];
		const results = [];
		for (const fingerprint of fingerprints) {
			const fingerData = String(fingerprint?.data || "").trim();
			if (!fingerData) continue;
			const response = await hikvisionFetch(
				"/ISAPI/AccessControl/FingerPrintDownload?format=json",
				{
					method: "POST",
					deviceId: params.targetDevice.id,
					prisma,
					request: params.req,
					timeoutMs: 15000,
					headers: { "Content-Type": "application/json" },
					body: {
						FingerPrintCfg: {
							employeeNo: params.employeeNo,
							cardReaderNo: 1,
							fingerPrintID: Number(fingerprint.fingerPrintId || 1),
							fingerType: Number(fingerprint.fingerType || 0),
							enableCardReader: [1],
							fingerData,
						},
					},
				},
			);
			results.push({
				fingerPrintId: Number(fingerprint.fingerPrintId || 1),
				fingerType: Number(fingerprint.fingerType || 0),
				responseStatus:
					response?.ResponseStatus?.statusString ||
					response?.statusString ||
					response?.raw ||
					"accepted",
			});
		}
		return {
			fingerprintWrites: results,
			fingerprintWriteCount: results.length,
			faceWrite: params.decrypted?.faceTemplate
				? "not_implemented_for_encrypted_bundle"
				: "not_present",
		};
	};

	const buildHikvisionBiometricExportSpec = (device: any) => {
		const specText = `${buildHikvisionManualCopySpecLine(device)}\n`;
		const localPath = path.join(
			os.tmpdir(),
			`project-truth-hikvision-biometric-export-${Date.now()}-${Math.random()
				.toString(16)
				.slice(2)}.spec`,
		);
		fsSync.writeFileSync(localPath, specText, { mode: 0o600 });
		return localPath;
	};

	const runHikvisionBiometricExportOnVm = async (params: {
		device: any;
		organizationId: string;
		vendorUserId: string;
		includeFingerprints: boolean;
		includeFaces: boolean;
	}) => {
		await preflightHikvisionManualCopyEndpoint(params.device, "source", params.vendorUserId);
		const localSpecPath = buildHikvisionBiometricExportSpec(params.device);
		const remoteSpecPath = `/tmp/project-truth-hikvision-biometric-export-${Date.now()}.spec`;
		try {
			const copySpecResult = await runHikvisionListenerVmCopy(localSpecPath, remoteSpecPath, 12000);
			if (copySpecResult.exitCode !== 0) {
				throw new Error(
					copySpecResult.stderr.trim() ||
						copySpecResult.stdout.trim() ||
						"Failed to copy Hikvision biometric export spec to the VM",
				);
			}
			const runExport = (extraEnv: string[] = []) =>
				runHikvisionListenerVmCommand(
					[
						"sudo",
						"env",
						...extraEnv,
						"HIKVISION_ALLOW_STATIC_DEVICE_SPEC=1",
						"HIKVISION_SKIP_SPOOL_REPLAY=1",
						`HIKVISION_DEVICE_SPEC_OVERRIDE=${remoteSpecPath}`,
						"HIKVISION_RUN_SECONDS=1",
						HIKVISION_VM_WRAPPER_REMOTE_PATH,
						"--run-once",
						"--export-biometric-source-device-id",
						params.device.id,
						"--export-biometric-employee-no",
						params.vendorUserId,
						...(params.includeFingerprints ? [] : ["--export-biometric-no-fingerprints"]),
						...(params.includeFaces ? [] : ["--export-biometric-no-face"]),
					],
					90000,
				);
			const result = await runExport();
			if (
				result.exitCode !== 0 &&
				isMissingHikvisionListenerRuntimeError(result.stderr || result.stdout)
			) {
				const installResult = await installManagedHikvisionListenerWrapperOnVm();
				if (!installResult.ok) {
					throw new Error(
						installResult.error ||
							"Failed to prepare Hikvision listener runtime for biometric export",
					);
				}
			}
			const finalResult =
				result.exitCode === 0 || !isMissingHikvisionListenerRuntimeError(result.stderr || result.stdout)
					? result
					: await runExport();
			const events = parseJsonLines(finalResult.stdout);
			const exportEvent = events.find(
				(event) =>
					event?.event === "manual_biometric_export_completed" &&
					String(event?.employeeNo || "").trim() === params.vendorUserId,
			);
			if (!exportEvent) {
				throw new Error(
					finalResult.stderr.trim() ||
						finalResult.stdout.trim() ||
						"No biometric export event returned from Hikvision SDK service",
				);
			}
			const fingerprints =
				typeof exportEvent.fingerprints === "string"
					? JSON.parse(exportEvent.fingerprints || "[]")
					: exportEvent.fingerprints || [];
			const sharedPayload = {
				sourceDeviceId: params.device.id,
				sourceDeviceName: params.device.name || params.device.id,
				vendorUserId: params.vendorUserId,
				cardNo: exportEvent.cardNo || "",
				exportedAt: new Date().toISOString(),
			};
			const encryptedFingerprint = Array.isArray(fingerprints) && fingerprints.length
				? encryptDeviceUserBiometricPayload({
						organizationId: params.organizationId,
						deviceId: params.device.id,
						vendorUserId: params.vendorUserId,
						modality: "fingerprint",
						payload: { ...sharedPayload, fingerprints },
					})
				: null;
			const encryptedFace = exportEvent.faceTemplate || exportEvent.facePicture
				? encryptDeviceUserBiometricPayload({
						organizationId: params.organizationId,
						deviceId: params.device.id,
						vendorUserId: params.vendorUserId,
						modality: "face",
						payload: {
							...sharedPayload,
							faceTemplate: exportEvent.faceTemplate || "",
							facePicture: exportEvent.facePicture || "",
						},
					})
				: null;
			if (!encryptedFingerprint && !encryptedFace) {
				throw new Error(
					`Hikvision SDK returned no fingerprint or face template bytes for device user ${params.vendorUserId}`,
				);
			}
			return {
				encrypted: encryptedFingerprint || encryptedFace,
				encryptedFingerprint,
				encryptedFace,
				fingerprintCount: Array.isArray(fingerprints) ? fingerprints.length : 0,
				faceTemplateSize: Number(exportEvent.faceTemplateSize || 0),
				facePictureSize: Number(exportEvent.facePictureSize || 0),
				cardNo: exportEvent.cardNo || "",
				events: events.map((event) =>
					event?.event === "manual_biometric_export_completed"
						? {
								...event,
								fingerprints: "[encrypted-before-api-response]",
								faceTemplate: event.faceTemplate ? "[encrypted-before-api-response]" : "",
								facePicture: event.facePicture ? "[encrypted-before-api-response]" : "",
							}
						: event,
				),
			};
		} finally {
			try {
				fsSync.unlinkSync(localSpecPath);
			} catch {}
			await runHikvisionListenerVmCommand(["sudo", "rm", "-f", remoteSpecPath], 7000).catch(
				() => undefined,
			);
		}
	};

	const updateHikvisionSyntheticCredentialTally = async (params: {
		organizationId: string;
		deviceId: string;
		vendorUserId: string;
		fingerprintCount?: number | null;
		faceCount?: number | null;
		copiedFromDeviceId?: string | null;
		copiedFromVendorUserId?: string | null;
		note?: string | null;
	}) => {
		const deviceUser = await (prisma as any).deviceUser.findUnique({
			where: {
				organizationId_deviceId_vendorUserId: {
					organizationId: params.organizationId,
					deviceId: params.deviceId,
					vendorUserId: params.vendorUserId,
				},
			},
			select: {
				id: true,
				vendorUserId: true,
				employeeId: true,
				status: true,
				lastSyncedAt: true,
				rawPayload: true,
			},
		});
		if (!deviceUser?.id) {
			throw new Error(
				`Device user ${params.vendorUserId} does not exist in HRIS truth for device ${params.deviceId}`,
			);
		}

		const rawPayload =
			deviceUser.rawPayload &&
			typeof deviceUser.rawPayload === "object" &&
			!Array.isArray(deviceUser.rawPayload)
				? { ...(deviceUser.rawPayload as Record<string, any>) }
				: {};
		const metadata =
			rawPayload._hrisDeviceMetadata &&
			typeof rawPayload._hrisDeviceMetadata === "object" &&
			!Array.isArray(rawPayload._hrisDeviceMetadata)
				? { ...(rawPayload._hrisDeviceMetadata as Record<string, any>) }
				: {};
		const existingSynthetic =
			metadata.syntheticCredentialSummary &&
			typeof metadata.syntheticCredentialSummary === "object" &&
			!Array.isArray(metadata.syntheticCredentialSummary)
				? { ...(metadata.syntheticCredentialSummary as Record<string, any>) }
				: {};
		const nextFingerprintCount =
			params.fingerprintCount === undefined || params.fingerprintCount === null
				? Math.max(0, Math.floor(Number(existingSynthetic.fingerprintCount) || 0))
				: Math.max(0, Math.min(10, Math.floor(Number(params.fingerprintCount) || 0)));
		const nextFaceCount =
			params.faceCount === undefined || params.faceCount === null
				? Math.max(0, Math.floor(Number(existingSynthetic.faceCount) || 0))
				: Math.max(0, Math.min(10, Math.floor(Number(params.faceCount) || 0)));
		if (nextFingerprintCount > 0 || nextFaceCount > 0) {
			metadata.syntheticCredentialSummary = {
				...(nextFingerprintCount > 0
					? {
							fingerprintCount: nextFingerprintCount,
							hasFingerprint: true,
						}
					: {}),
				...(nextFaceCount > 0
					? {
							faceCount: nextFaceCount,
							hasFace: true,
						}
					: {}),
				source: "dev_mock",
				updatedAt: new Date().toISOString(),
				...(params.copiedFromDeviceId
					? { copiedFromDeviceId: params.copiedFromDeviceId }
					: {}),
				...(params.copiedFromVendorUserId
					? { copiedFromVendorUserId: params.copiedFromVendorUserId }
					: {}),
				...(params.note ? { note: params.note } : {}),
			};
		} else {
			delete metadata.syntheticCredentialSummary;
		}
		if (Object.keys(metadata).length > 0) rawPayload._hrisDeviceMetadata = metadata;
		else delete rawPayload._hrisDeviceMetadata;

		return (prisma as any).deviceUser.update({
			where: { id: deviceUser.id },
			data: { rawPayload },
			select: {
				id: true,
				vendorUserId: true,
				employeeId: true,
				status: true,
				lastSyncedAt: true,
				rawPayload: true,
			},
		});
	};

	const updateHikvisionSyntheticFingerprintTally = async (
		params: Omit<Parameters<typeof updateHikvisionSyntheticCredentialTally>[0], "faceCount"> & {
			fingerprintCount: number;
		},
	) =>
		updateHikvisionSyntheticCredentialTally({
			...params,
			fingerprintCount: params.fingerprintCount,
		});

	const updateHikvisionSyntheticFaceTally = async (
		params: Omit<
			Parameters<typeof updateHikvisionSyntheticCredentialTally>[0],
			"fingerprintCount"
		> & { faceCount: number },
	) =>
		updateHikvisionSyntheticCredentialTally({
			...params,
			faceCount: params.faceCount,
		});

	const getEmployeeDisplayName = (employee: any) => {
		const personalInfo = employee?.person?.personalInfo || {};
		return [personalInfo.firstName, personalInfo.middleName, personalInfo.lastName]
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
		const vendor = String(
			configValue?.vendor || configValue?.type || configValue?.source || "",
		).toLowerCase();
		const name = String(device.name || "").toLowerCase();
		return (
			vendor.includes("hikvision") || name.includes("hikvision") || name.includes("entrance")
		);
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
		await fs.writeFile(
			filePath,
			`${JSON.stringify(serializeForJson(value), null, 2)}\n`,
			"utf8",
		);
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
				count:
					readHikvisionSearchTotal(data, envelopeKey) ??
					firstNumericValueForKeys(data, keys),
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
					: eventSearch.error ||
						userSearch.error ||
						"Hikvision device counts did not respond",
		};
	};

	const getHikvisionSourceTotal = async (req: Request, deviceId: string) => {
		const directCounts = await getHikvisionSourceCounts(req, deviceId);
		if (
			directCounts.ok &&
			(directCounts.totalEvents !== null || directCounts.userCount !== null)
		) {
			return directCounts;
		}

		try {
			const data = await hikvisionFetch(
				hikvisionEndpoint.accessControl.acsEventTotalNum.get,
				{
					method: "GET",
					deviceId,
					prisma,
					request: req,
					timeoutMs: 3500,
				},
			);
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
		const devices = Array.isArray(bridgeStatus?.data?.devices) ? bridgeStatus.data.devices : [];
		return devices.find((item: any) => String(item?.ip || "").trim() === address) || null;
	};

	const triggerZktecoAttendanceSync = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		try {
			const deviceId = String(
				(req.body as any)?.deviceId || (req.query as any)?.deviceId || "",
			).trim();
			let deviceIp = String(
				(req.body as any)?.deviceIp || (req.query as any)?.deviceIp || "",
			).trim();

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

	const getUserInfoSearchList = (data: any): any[] => {
		const users = data?.UserInfoSearch?.UserInfo || data?.data?.UserInfoSearch?.UserInfo;
		return Array.isArray(users) ? users : [];
	};

	const assertDeviceUserAdmin = (req: Request, res: Response) => {
		const organizationId = String((req as any).organizationId || "").trim();
		const role = String((req as any).role || "").trim();
		if (!organizationId) {
			res.status(400).json(buildErrorResponse("Organization ID not found", 400));
			return null;
		}
		if (!DEVICE_USER_ADMIN_ROLES.has(role)) {
			res.status(403).json(buildErrorResponse("Only admins can manage device users", 403));
			return null;
		}
		return { organizationId, role };
	};

	const getDeviceForUserSync = async (organizationId: string, deviceId: string) => {
		if (!deviceId) return null;
		return (prisma as any).device.findFirst({
			where: { id: deviceId, organizationId, isDeleted: false },
			select: {
				id: true,
				organizationId: true,
				name: true,
				address: true,
				port: true,
				protocol: true,
				config: true,
				access: true,
			},
		});
	};

	const loadEmployeesForDeviceUserCandidates = async (
		organizationId: string,
		candidates: DeviceUserCandidate[],
	) => {
		const values = Array.from(
			new Set(
				candidates
					.flatMap((candidate) => [
						candidate.employeeNo,
						...buildDeviceUserEmployeeNoCandidates(candidate.employeeNo),
					])
					.map((value) => String(value || "").trim())
					.filter(Boolean),
			),
		);
		if (!values.length) return [];
		return prisma.employee.findMany({
			where: {
				organizationId,
				isDeleted: false,
				OR: [{ deviceEmpId: { in: values } }, { employeeId: { in: values } }],
			},
			select: {
				id: true,
				employeeId: true,
				deviceEmpId: true,
			},
		});
	};

	const buildDeviceUserSelect = (options: { includeVendorMetadata?: boolean } = {}) => ({
		id: true,
		organizationId: true,
		deviceId: true,
		employeeId: true,
		vendorUserId: true,
		employeeNo: true,
		displayName: true,
		userType: true,
		status: true,
		validFrom: true,
		validTo: true,
		doorRight: true,
		accessPlan: true,
		rawPayload: true,
		...(options.includeVendorMetadata ? { vendorMetadata: true } : {}),
		lastSyncedAt: true,
		createdAt: true,
		updatedAt: true,
		device: {
			select: {
				id: true,
				name: true,
				address: true,
				port: true,
				protocol: true,
			},
		},
		employee: {
			select: {
				id: true,
				employeeId: true,
				deviceEmpId: true,
				person: { select: { personalInfo: true } },
			},
		},
	});

	const decorateDeviceUser = (row: any) => {
		const employee = row?.employee;
		const vendorMetadata =
			row?.vendorMetadata ||
			(row?.rawPayload
				? {
						source: "rawPayload",
						rawVendorPayload: row.rawPayload,
					}
				: null);
		return {
			...row,
			vendorMetadata,
			employee: employee
				? {
						id: employee.id,
						employeeId: employee.employeeId,
						deviceEmpId: employee.deviceEmpId,
						fullName: getEmployeeDisplayName(employee) || employee.employeeId,
					}
				: null,
		};
	};

	const readDeviceUserFaceUrl = (rawPayload: any) => {
		const direct = String(rawPayload?.faceURL || rawPayload?.UserInfo?.faceURL || "").trim();
		return direct || "";
	};

	const getAllowedDeviceHosts = (device: {
		address?: string | null;
		port?: number | null;
		protocol?: string | null;
		config?: unknown;
	}) => {
		const hosts = new Set<string>();
		const rawAddress = String(device.address || "").trim();
		if (rawAddress) {
			try {
				if (/^https?:\/\//i.test(rawAddress)) {
					hosts.add(new URL(rawAddress).hostname.toLowerCase());
				} else {
					hosts.add(rawAddress.toLowerCase());
				}
			} catch {
				hosts.add(rawAddress.toLowerCase());
			}
		}
		try {
			const runtimeBaseUrl = buildHikvisionDeviceBaseUrl({
				address: String(device.address || ""),
				port: Number(device.port || 0),
				protocol: String(device.protocol || "http"),
				config: device.config,
			});
			if (runtimeBaseUrl) hosts.add(new URL(runtimeBaseUrl).hostname.toLowerCase());
		} catch {
			// Ignore malformed runtime base URL and rely on direct device address validation.
		}
		return hosts;
	};

	const getDeviceUserPhoto = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const admin = assertDeviceUserAdmin(req, res);
			if (!admin) return;
			const userId = String(req.params.userId || "").trim();
			if (!userId) {
				res.status(400).json(buildErrorResponse("Device user is required", 400));
				return;
			}

			const deviceUser = await (prisma as any).deviceUser.findFirst({
				where: {
					id: userId,
					organizationId: admin.organizationId,
				},
				select: {
					id: true,
					vendorUserId: true,
					displayName: true,
					rawPayload: true,
					device: {
						select: {
							id: true,
							name: true,
							address: true,
							port: true,
							protocol: true,
							config: true,
							access: true,
						},
					},
				},
			});

			if (!deviceUser?.device) {
				res.status(404).json(buildErrorResponse("Device user not found", 404));
				return;
			}

			const faceUrl = readDeviceUserFaceUrl(deviceUser.rawPayload);
			if (!faceUrl) {
				res.status(404).json(
					buildErrorResponse("No enrolled face photo found for this device user", 404),
				);
				return;
			}

			const parsedFaceUrl = new URL(faceUrl);
			const allowedHosts = getAllowedDeviceHosts(deviceUser.device);
			if (!allowedHosts.has(parsedFaceUrl.hostname.toLowerCase())) {
				res.status(400).json(
					buildErrorResponse(
						"Device user face photo host does not match the configured device",
						400,
					),
				);
				return;
			}

			const relativePath = `${parsedFaceUrl.pathname}${parsedFaceUrl.search}`;
			const binary = await hikvisionFetchBinary(relativePath, {
				deviceId: deviceUser.device.id,
				prisma,
				request: req,
				timeoutMs: 15000,
				headers: {
					Accept: "image/*,*/*",
				},
			});

			res.setHeader("Content-Type", binary.contentType || "image/jpeg");
			res.setHeader("Content-Length", String(binary.contentLength || binary.buffer.length));
			res.setHeader("Cache-Control", "private, max-age=30");
			res.setHeader(
				"Content-Disposition",
				`inline; filename=\"device-user-${deviceUser.vendorUserId || deviceUser.id}.jpg\"`,
			);
			res.status(200).send(binary.buffer);
		} catch (error: any) {
			const status = Number(error?.status || 500);
			res.status(status).json(
				buildErrorResponse(
					error?.message || "Failed to load device user face photo",
					status,
				),
			);
		}
	};

	const listDeviceUsers = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const organizationId = String((req as any).organizationId || "").trim();
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID not found", 400));
				return;
			}
			const deviceId = String(req.params.id || req.query.deviceId || "").trim();
			const employeeId = String(req.query.employeeId || "").trim();
			if (!deviceId && !employeeId) {
				res.status(400).json(buildErrorResponse("Device or employee is required", 400));
				return;
			}
			const status = String(req.query.status || "all").trim();
			const query = String(req.query.query || req.query.search || "").trim();
			const vendorUserId = String(req.query.vendorUserId || "").trim();
			const vendorUserIds = Array.from(
				new Set(
					[]
						.concat(req.query.vendorUserIds as any)
						.flatMap((value) => String(value || "").split(","))
						.map((value) => value.trim())
						.filter(Boolean),
				),
			).slice(0, 100);
			const page = Math.max(Number(req.query.page || 1), 1);
			const limit = Math.min(Math.max(Number(req.query.limit || 25), 1), 100);
			const where: any = {
				organizationId,
				...(deviceId ? { deviceId } : {}),
				...(employeeId ? { employeeId } : {}),
				...(status && status !== "all" ? { status } : {}),
				...(vendorUserId
					? { vendorUserId }
					: vendorUserIds.length
						? { vendorUserId: { in: vendorUserIds } }
						: {}),
				...(query
					? {
							OR: [
								{ vendorUserId: { contains: query, mode: "insensitive" } },
								{ employeeNo: { contains: query, mode: "insensitive" } },
								{ displayName: { contains: query, mode: "insensitive" } },
								{
									employee: {
										employeeId: { contains: query, mode: "insensitive" },
									},
								},
								{
									employee: {
										deviceEmpId: { contains: query, mode: "insensitive" },
									},
								},
							],
						}
					: {}),
			};

			if (!(await hasDeviceUserTable())) {
				res.status(200).json(
					buildSuccessResponse(
						"Device users retrieved",
						{
							deviceUsers: [],
							summary: {
								total: 0,
								active: 0,
								matched: 0,
								unmatched: 0,
								conflict: 0,
								disabled: 0,
							},
							pagination: buildPagination(0, page, limit),
							migrationState: "device_users_table_missing",
						},
						200,
					),
				);
				return;
			}

			const includeVendorMetadata = await hasDeviceUserVendorMetadataColumn();
			const [rows, total, allRows] = await Promise.all([
				(prisma as any).deviceUser.findMany({
					where,
					select: buildDeviceUserSelect({ includeVendorMetadata }),
					orderBy: [{ status: "asc" }, { vendorUserId: "asc" }],
					skip: (page - 1) * limit,
					take: limit,
				}),
				(prisma as any).deviceUser.count({ where }),
				(prisma as any).deviceUser.findMany({
					where: {
						organizationId,
						...(deviceId ? { deviceId } : {}),
						...(employeeId ? { employeeId } : {}),
					},
					select: { status: true, employeeId: true },
				}),
			]);

			res.status(200).json(
				buildSuccessResponse(
					"Device users retrieved",
					{
						deviceUsers: rows.map(decorateDeviceUser),
						summary: summarizeDeviceUserStatuses(allRows),
						pagination: buildPagination(total, page, limit),
					},
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to retrieve device users", 500),
			);
		}
	};

	const buildReleasedDeviceAddress = (device: { id: string; address?: string | null }) => {
		const address = String(device.address || "unknown").trim() || "unknown";
		const prefix = `deleted:${device.id}:`;
		return address.startsWith(prefix) ? address : `${prefix}${address}`;
	};

	const isDeviceAddressPortUniqueError = (error: unknown) => {
		const record = error as { code?: string; meta?: { target?: unknown } };
		const target = Array.isArray(record?.meta?.target)
			? record.meta.target.map((item) => String(item))
			: [];
		return (
			record?.code === "P2002" &&
			target.includes("organizationId") &&
			target.includes("address") &&
			target.includes("port")
		);
	};

	const buildDeviceAddressPortConflictResponse = () =>
		buildErrorResponse(DEVICE_ADDRESS_PORT_CONFLICT_MESSAGE, 409, [
			{
				field: "address",
				message:
					"Choose a different address or restore the deleted device that already used this endpoint.",
			},
			{
				field: "port",
				message:
					"Choose a different port or restore the deleted device that already used this endpoint.",
			},
		]);

	const isMissingDeviceSyncRunTableError = (error: unknown) => {
		const record = error as {
			code?: string;
			message?: string;
			meta?: { table?: string; modelName?: string };
		};
		const message = String(record?.message || "").toLowerCase();
		return (
			record?.code === "P2021" ||
			record?.meta?.table === "public.device_sync_runs" ||
			record?.meta?.modelName === "DeviceSyncRun" ||
			(message.includes("device_sync_runs") && message.includes("does not exist"))
		);
	};

	const isMissingDeviceUserTableError = (error: unknown) => {
		const record = error as {
			code?: string;
			message?: string;
			meta?: { table?: string; modelName?: string };
		};
		const message = String(record?.message || "").toLowerCase();
		return (
			record?.code === "P2021" ||
			record?.code === "42P01" ||
			record?.meta?.table === "public.device_users" ||
			record?.meta?.modelName === "DeviceUser" ||
			(message.includes("device_users") && message.includes("does not exist")) ||
			(message.includes('relation "device_users"') && message.includes("does not exist"))
		);
	};

	const hasDeviceUserTable = async () => {
		try {
			const rows =
				(await prisma.$queryRaw<
					Array<{ device_users?: string | null }>
				>`SELECT to_regclass('public.device_users')::text AS device_users`) || [];
			return Boolean(rows[0]?.device_users);
		} catch (error) {
			if (isMissingDeviceUserTableError(error)) {
				return false;
			}
			throw error;
		}
	};

	const hasDeviceUserVendorMetadataColumn = async () => {
		if (!(await hasDeviceUserTable())) return false;
		const rows =
			(await prisma.$queryRaw<Array<{ vendorMetadata?: boolean | null }>>`
			SELECT EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_schema = 'public'
					AND table_name = 'device_users'
					AND column_name = 'vendorMetadata'
			) AS "vendorMetadata"
		`) || [];
		return Boolean(rows[0]?.vendorMetadata);
	};

	const getDeviceEventColumnPresence = async () => {
		const rows =
			(await prisma.$queryRaw<
				Array<{
					deviceUserId?: boolean | null;
					eventCategory?: boolean | null;
					eventAction?: boolean | null;
					eventLabel?: boolean | null;
					eventConfidence?: boolean | null;
				}>
			>`
			SELECT
				EXISTS (
					SELECT 1
					FROM information_schema.columns
					WHERE table_schema = 'public'
						AND table_name = 'device_events'
						AND column_name = 'deviceUserId'
				) AS "deviceUserId",
				EXISTS (
					SELECT 1
					FROM information_schema.columns
					WHERE table_schema = 'public'
						AND table_name = 'device_events'
						AND column_name = 'eventCategory'
				) AS "eventCategory",
				EXISTS (
					SELECT 1
					FROM information_schema.columns
					WHERE table_schema = 'public'
						AND table_name = 'device_events'
						AND column_name = 'eventAction'
				) AS "eventAction",
				EXISTS (
					SELECT 1
					FROM information_schema.columns
					WHERE table_schema = 'public'
						AND table_name = 'device_events'
						AND column_name = 'eventLabel'
				) AS "eventLabel",
				EXISTS (
					SELECT 1
					FROM information_schema.columns
					WHERE table_schema = 'public'
						AND table_name = 'device_events'
						AND column_name = 'eventConfidence'
				) AS "eventConfidence"
		`) || [];
		return {
			deviceUserId: rows[0]?.deviceUserId === true,
			eventCategory: rows[0]?.eventCategory === true,
			eventAction: rows[0]?.eventAction === true,
			eventLabel: rows[0]?.eventLabel === true,
			eventConfidence: rows[0]?.eventConfidence === true,
		};
	};

	const findLatestCompletedDeviceLogRun = async (
		organizationId: string,
		deviceId: string,
		source: "HIKVISION_CALLBACK" | "ZKTECO_EVENT",
	) => {
		try {
			return await (prisma as any).deviceSyncRun?.findFirst?.({
				where: {
					organizationId,
					deviceId,
					runType: "DEVICE_LOGS",
					status: "COMPLETED",
					source,
				},
				orderBy: { completedAt: "desc" },
			});
		} catch (error) {
			if (isMissingDeviceSyncRunTableError(error)) {
				deviceLogger.warn(
					`Device sync run history table is missing; continuing preview without known skipped counts for device ${deviceId}`,
				);
				return null;
			}
			throw error;
		}
	};

	const getDeviceSyncRuns = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const organizationId = String((req as any).organizationId || "").trim();
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID not found", 400));
				return;
			}
			const deviceId = String(req.params.id || "").trim();
			if (!deviceId) {
				res.status(400).json(buildErrorResponse("Device is required", 400));
				return;
			}
			const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 50);
			const rows = await (prisma as any).deviceSyncRun.findMany({
				where: { organizationId, deviceId },
				orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
				take: limit,
				select: {
					id: true,
					organizationId: true,
					deviceId: true,
					runType: true,
					status: true,
					source: true,
					totalSourceRecords: true,
					importableRecords: true,
					savedRecords: true,
					skippedRecords: true,
					failedRecords: true,
					missingRecords: true,
					skipSummary: true,
					failureSummary: true,
					rawSummary: true,
					startedAt: true,
					completedAt: true,
					createdAt: true,
					updatedAt: true,
				},
			});
			res.status(200).json(
				buildSuccessResponse("Device sync runs retrieved", { syncRuns: rows }, 200),
			);
		} catch (error: any) {
			if (isMissingDeviceSyncRunTableError(error)) {
				deviceLogger.warn(
					"Device sync run history table is missing; returning an empty sync run list",
				);
				res.status(200).json(
					buildSuccessResponse("Device sync runs retrieved", { syncRuns: [] }, 200),
				);
				return;
			}
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to retrieve device sync runs", 500),
			);
		}
	};

	const normalizeDeviceActivityStatus = (
		run?: { status?: string | null; runType?: string | null } | null,
	) => {
		const status = String(run?.status || "").toUpperCase();
		const runType = String(run?.runType || "").toUpperCase();
		if (status === "PROCESSING") {
			if (runType === "DEVICE_USERS") return "reconciling";
			if (runType === "DEVICE_LOGS") return "importing";
			return "running";
		}
		if (status === "FAILED") return "failed";
		if (status === "COMPLETED") return "completed";
		return "idle";
	};

	const getActiveDeviceUserSyncJobForDevice = (
		organizationId: string,
		deviceId: string,
	) => {
		cleanupDeviceUserSyncJobs();
		for (const job of deviceUserSyncJobs.values()) {
			if (job.organizationId !== organizationId || job.status !== "processing") continue;
			const result = job.results.find((item) => item.deviceId === deviceId);
			const isPendingDevice =
				!result &&
				job.processedDevices < job.totalDevices &&
				(job.syncMode === "full_refresh" ||
					job.syncMode === "needs_attention_only" ||
					job.syncMode === "peer_converge");
			if (result || isPendingDevice) {
				return {
					jobId: job.jobId,
					status: job.status,
					syncMode: job.syncMode,
					totalDevices: job.totalDevices,
					processedDevices: job.processedDevices,
					successfulDevices: job.successfulDevices,
					failedDevices: job.failedDevices,
					message: job.message,
					result: result || null,
					startedAt: job.startedAt,
					completedAt: job.completedAt || null,
				};
			}
		}
		return null;
	};

	const getDeviceActivity = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const admin = assertDeviceUserAdmin(req, res);
			if (!admin) return;
			const organizationId = String((req as any).organizationId || "").trim();
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID not found", 400));
				return;
			}
			const deviceId = String(req.params.id || "").trim();
			if (!deviceId) {
				res.status(400).json(buildErrorResponse("Device is required", 400));
				return;
			}

			const statusFilter = String(req.query.status || "all").trim();
			const sourceFilter = String(req.query.source || "all").trim();
			const runId = String(req.query.runId || "").trim();
			const search = String(req.query.search || req.query.query || "").trim();
			const limit = Math.min(Math.max(Number(req.query.limit || 25), 1), 100);

			const device = await prisma.device.findFirst({
				where: { id: deviceId, organizationId, isDeleted: false },
				select: {
					id: true,
					name: true,
					address: true,
					port: true,
					protocol: true,
					config: true,
				},
			});
			if (!device) {
				res.status(404).json(buildErrorResponse("Device not found", 404));
				return;
			}

			const [syncRuns, hasDeviceEventColumns, hasDeviceUsersTable] = await Promise.all([
				(prisma as any).deviceSyncRun
					.findMany({
						where: { organizationId, deviceId },
						orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
						take: 12,
						select: {
							id: true,
							deviceId: true,
							runType: true,
							status: true,
							source: true,
							totalSourceRecords: true,
							importableRecords: true,
							savedRecords: true,
							skippedRecords: true,
							failedRecords: true,
							missingRecords: true,
							skipSummary: true,
							failureSummary: true,
							rawSummary: true,
							startedAt: true,
							completedAt: true,
							createdAt: true,
							updatedAt: true,
						},
					})
					.catch((error: unknown) => {
						if (isMissingDeviceSyncRunTableError(error)) return [];
						throw error;
					}),
				getDeviceEventColumnPresence(),
				hasDeviceUserTable(),
			]);

			const activeRun =
				syncRuns.find((run: any) => String(run.status || "").toUpperCase() === "PROCESSING") ||
				null;
			const lastRun = syncRuns[0] || null;
			const activeJob = getActiveDeviceUserSyncJobForDevice(organizationId, deviceId);
			const currentStatus = activeJob
				? "reconciling"
				: normalizeDeviceActivityStatus(activeRun || lastRun);

			const whereConditions: Prisma.Sql[] = [
				Prisma.sql`de."organizationId" = ${organizationId}`,
				Prisma.sql`de."deviceId" = ${deviceId}`,
			];
			if (statusFilter && statusFilter !== "all" && DEVICE_EVENT_STATUSES.has(statusFilter)) {
				whereConditions.push(
					Prisma.sql`de."status" = ${statusFilter}::"DeviceEventStatus"`,
				);
			}
			if (sourceFilter && sourceFilter !== "all" && DEVICE_EVENT_SOURCES.has(sourceFilter)) {
				whereConditions.push(
					Prisma.sql`de."source" = ${sourceFilter}::"DeviceEventSource"`,
				);
			}
			if (search) {
				const searchLike = `%${search}%`;
				whereConditions.push(Prisma.sql`(
					de."employeeNo" ILIKE ${searchLike}
					OR de."eventType" ILIKE ${searchLike}
					OR de."errorMessage" ILIKE ${searchLike}
					OR de."dedupeKey" ILIKE ${searchLike}
					OR CAST(de.payload AS text) ILIKE ${searchLike}
					${
						hasDeviceEventColumns.eventLabel
							? Prisma.sql`OR de."eventLabel" ILIKE ${searchLike}`
							: Prisma.sql``
					}
				)`);
			}
			void runId;

			const deviceUserIdSql = hasDeviceEventColumns.deviceUserId
				? Prisma.sql`de."deviceUserId"`
				: Prisma.sql`NULL::text`;
			const eventActionSql = hasDeviceEventColumns.eventAction
				? Prisma.sql`de."eventAction"::text`
				: Prisma.sql`'UNKNOWN'::text`;
			const eventLabelSql = hasDeviceEventColumns.eventLabel
				? Prisma.sql`de."eventLabel"`
				: Prisma.sql`COALESCE(de."eventType", 'Device event')`;
			const deviceUserJoinSql = hasDeviceUsersTable && hasDeviceEventColumns.deviceUserId
				? Prisma.sql`LEFT JOIN device_users du ON du.id = ${deviceUserIdSql}`
				: Prisma.sql`
					LEFT JOIN LATERAL (
						SELECT NULL::text AS id, NULL::text AS "vendorUserId", NULL::text AS "displayName", NULL::text AS "employeeId"
					) du ON true
				`;
			const whereSql = Prisma.sql`WHERE ${Prisma.join(whereConditions, " AND ")}`;
			const eventRows = await prisma.$queryRaw<any[]>(Prisma.sql`
				SELECT
					de.id,
					de."receivedAt",
					de."eventTime",
					de.source::text AS source,
					de.status::text AS status,
					${
						hasDeviceEventColumns.eventCategory
							? Prisma.sql`de."eventCategory"::text`
							: Prisma.sql`'UNKNOWN_VENDOR'::text`
					} AS "eventCategory",
					${eventActionSql} AS "eventAction",
					${eventLabelSql} AS "eventLabel",
					de."employeeNo",
					de."eventType",
					de."dedupeKey",
					de.payload,
					de."errorMessage",
					CASE
						WHEN du.id IS NULL THEN NULL
						ELSE JSON_BUILD_OBJECT(
							'id', du.id,
							'vendorUserId', du."vendorUserId",
							'displayName', du."displayName",
							'employeeId', du."employeeId"
						)
					END AS "deviceUser"
				FROM device_events de
				${deviceUserJoinSql}
				${whereSql}
				ORDER BY de."receivedAt" DESC, de."createdAt" DESC
				LIMIT ${limit}
			`);

			const deviceUserWhere: any = { organizationId, deviceId };
			const [deviceUserCounts, savedCounts] = await Promise.all([
				hasDeviceUsersTable
					? (prisma as any).deviceUser
							.groupBy({
								by: ["status"],
								where: deviceUserWhere,
								_count: { _all: true },
							})
							.catch((error: unknown) => {
								if (isMissingDeviceUserTableError(error)) return [];
								throw error;
							})
					: [],
				prisma.deviceEvent
					.groupBy({
						by: ["status"],
						where: { organizationId, deviceId } as any,
						_count: { _all: true },
					})
					.catch(() => []),
			]);
			const deviceUserCountMap = new Map(
				(deviceUserCounts || []).map((row: any) => [
					String(row.status || ""),
					Number(row._count?._all || 0),
				]),
			);
			const savedEventCountMap = new Map(
				(savedCounts || []).map((row: any) => [
					String(row.status || ""),
					Number(row._count?._all || 0),
				]),
			);

			const activeCounts = activeRun || lastRun || {};
			const counts = {
				sdkReceived: Number(activeCounts.totalSourceRecords || 0),
				parsed: Number(activeCounts.importableRecords || 0),
				savedInHris:
					Number(activeCounts.savedRecords || 0) ||
					Number(savedEventCountMap.get("ATTENDANCE_CREATED") || 0) +
						Number(savedEventCountMap.get("MATCHED") || 0),
				skipped: Number(activeCounts.skippedRecords || 0),
				failed:
					Number(activeCounts.failedRecords || 0) ||
					Number(savedEventCountMap.get("FAILED") || 0),
				needsLink: Number(deviceUserCountMap.get("UNMATCHED") || 0),
				gap: Number(activeCounts.missingRecords || 0),
			};

			const readActivityRowValue = (event: any, key: string) =>
				event?.[key] ?? event?.[key.toLowerCase()] ?? null;

			const events = eventRows.map((event) => {
				const payload = event.payload && typeof event.payload === "object" ? event.payload : null;
				const deviceUser = event.deviceUser || null;
				const eventCategory = readActivityRowValue(event, "eventCategory");
				const eventAction = readActivityRowValue(event, "eventAction");
				const eventLabel = readActivityRowValue(event, "eventLabel");
				const rawId =
					String(deviceUser?.vendorUserId || event.employeeNo || "").trim() ||
					String(payload?.employeeNoString || payload?.employeeNo || payload?.cardNo || "").trim() ||
					null;
				const origin =
					payload?.derivedFromCurrentDeviceState
						? "device_user_state_backfill"
						: payload?.derivedFromReconcile
							? "biometric_reconcile"
							: event.source === "EN_HCNETSDK_ALARM"
								? "sdk_alarm_callback"
								: event.source === "HIKVISION_CALLBACK"
									? "hikvision_callback"
									: event.source === "ZKTECO_EVENT"
										? "zkteco_bridge"
										: "device_event";
				const originLabel =
					payload?.derivedFromCurrentDeviceState
						? "Derived from current device-user state"
						: payload?.derivedFromReconcile
							? "Created by biometric reconcile"
							: event.source === "EN_HCNETSDK_ALARM"
								? "Received from SDK alarm listener"
								: event.source === "HIKVISION_CALLBACK"
									? "Received from Hikvision callback"
									: event.source === "ZKTECO_EVENT"
										? "Received from ZKTeco bridge"
										: "Saved device event";
				return {
					id: event.id,
					receivedAt: event.receivedAt,
					deviceEventTime: event.eventTime,
					source: event.source,
					eventCategory,
					eventAction,
					eventLabel,
					rawId,
					employeeMatch: deviceUser?.employeeId
						? { employeeId: deviceUser.employeeId, label: deviceUser.displayName || rawId }
						: null,
					hrisStatus: event.status,
					action: eventLabel || eventAction || event.eventType || "-",
					origin,
					originLabel,
					originDetail:
						String(payload?.backfillReason || payload?.eventKind || payload?.actionCode || "").trim() ||
						null,
					message: event.errorMessage || null,
					runId: runId || null,
					correlationId: event.dedupeKey,
					payload,
				};
			});

			res.status(200).json(
				buildSuccessResponse(
					"Device activity retrieved",
					{
						generatedAt: new Date().toISOString(),
						device,
						status: currentStatus,
						activeRun,
						activeJob,
						lastRun,
						counts,
						filters: {
							status: statusFilter || "all",
							source: sourceFilter || "all",
							runId: runId || null,
							search,
							limit,
						},
						events,
						rawSdkPersistence: {
							persisted: false,
							message:
								"Raw SDK source reads are not persisted as a separate stream yet; this table uses saved DeviceEvent rows and linked DeviceUser payloads.",
						},
					},
					200,
				),
			);
		} catch (error: any) {
			deviceLogger.error(`Device activity failed: ${error?.message || error}`);
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to retrieve device activity", 500),
			);
		}
	};

	const fetchAllHikvisionDeviceUsers = async (req: Request, device: any) => {
		const pageSize = Math.max(
			1,
			Math.min(Number(process.env.HIKVISION_USER_SYNC_PAGE_SIZE || 100), 200),
		);
		const maxUsers = Math.max(
			1,
			Math.min(Number(process.env.HIKVISION_USER_SYNC_MAX_USERS || 2000), 10000),
		);
		const allUsers: any[] = [];
		let position = 0;
		for (let page = 0; page < 100 && allUsers.length < maxUsers; page += 1) {
			const data = await hikvisionFetch(hikvisionEndpoint.accessControl.userInfo.search, {
				method: "POST",
				deviceId: device.id,
				prisma,
				request: req,
				timeoutMs: 15000,
				headers: { "Content-Type": "application/json" },
				body: {
					UserInfoSearchCond: {
						searchID: `device-user-sync-${Date.now()}-${position}`,
						searchResultPosition: position,
						maxResults: Math.min(pageSize, maxUsers - allUsers.length),
					},
				},
			});
			const pageUsers = getUserInfoSearchList(data);
			const search = data?.UserInfoSearch || data?.data?.UserInfoSearch || {};
			allUsers.push(...pageUsers);
			const numOfMatches = Number(search.numOfMatches || pageUsers.length || 0);
			const status = String(search.responseStatusStrg || "").toUpperCase();
			if (!pageUsers.length || status !== "MORE" || numOfMatches <= 0) break;
			position += numOfMatches;
		}
		return Array.from(
			new Map(
				allUsers.map((user) => [
					String(user?.employeeNo || user?.employeeNoString || user?.userId),
					user,
				]),
			).values(),
		);
	};

	const loadHikvisionDeviceUserSnapshot = async (req: Request, device: any) => {
		const rawUsers = await fetchAllHikvisionDeviceUsers(req, device);
		const candidates = rawUsers
			.map(normalizeHikvisionDeviceUser)
			.filter((candidate): candidate is DeviceUserCandidate => Boolean(candidate));
		return { rawUsers, candidates };
	};

	const loadSingleHikvisionDeviceUserSnapshot = async (
		req: Request,
		device: any,
		employeeNo: string,
	) => {
		const data = await hikvisionFetch(hikvisionEndpoint.accessControl.userInfo.search, {
			method: "POST",
			deviceId: device.id,
			prisma,
			request: req,
			timeoutMs: 8000,
			headers: { "Content-Type": "application/json" },
			body: {
				UserInfoSearchCond: {
					searchID: `device-user-single-${Date.now()}`,
					searchResultPosition: 0,
					maxResults: 4,
					EmployeeNoList: [{ employeeNo }],
				},
			},
		});
		const rawUsers = getUserInfoSearchList(data).filter(
			(user) =>
				String(user?.employeeNo || user?.employeeNoString || "").trim() === employeeNo,
		);
		const candidates = rawUsers
			.map(normalizeHikvisionDeviceUser)
			.filter((candidate): candidate is DeviceUserCandidate => Boolean(candidate));
		return { rawUsers, candidates };
	};

	const upsertDeviceUsersFromCandidates = async (params: {
		organizationId: string;
		deviceId: string;
		candidates: DeviceUserCandidate[];
		source: "hikvision" | "legacy-backfill";
		pruneMissing?: boolean;
	}) => {
		const { organizationId, deviceId, candidates } = params;
		const employees = await loadEmployeesForDeviceUserCandidates(organizationId, candidates);
		const now = new Date();
		let created = 0;
		let updated = 0;
		let linked = 0;
		let unmatched = 0;
		let conflict = 0;
		let disabled = 0;
		let pruned = 0;
		const canPersistVendorMetadata = await hasDeviceUserVendorMetadataColumn();
		const currentVendorUserIds = new Set(
			candidates
				.map((candidate) => String(candidate.vendorUserId || "").trim())
				.filter(Boolean),
		);

		for (const candidate of candidates) {
			const existing = await (prisma as any).deviceUser.findUnique({
				where: {
					organizationId_deviceId_vendorUserId: {
						organizationId,
						deviceId,
						vendorUserId: candidate.vendorUserId,
					},
				},
				select: { id: true, employeeId: true, status: true },
			});
			const decision = resolveDeviceUserLinkDecision(candidate, employees);
			const preserveManualEmployee =
				existing?.employeeId &&
				decision.status !== "CONFLICT" &&
				decision.status !== "DISABLED" &&
				(!decision.employeeId || decision.employeeId === existing.employeeId);
			const employeeId = preserveManualEmployee ? existing.employeeId : decision.employeeId;
			const status = preserveManualEmployee ? "ACTIVE" : decision.status;
			if (status === "ACTIVE" && employeeId) linked += 1;
			else if (status === "CONFLICT") conflict += 1;
			else if (status === "DISABLED") disabled += 1;
			else unmatched += 1;

			const data: any = {
				employeeId,
				employeeNo: candidate.employeeNo,
				displayName: candidate.displayName,
				userType: candidate.userType,
				status,
				validFrom: candidate.validFrom,
				validTo: candidate.validTo,
				doorRight: candidate.doorRight,
				accessPlan: candidate.accessPlan as any,
				rawPayload: {
					...(candidate.rawPayload as any),
					hrisSync: {
						source: params.source,
						matchReason: preserveManualEmployee
							? "manual_existing"
							: decision.matchReason,
						matchCount: decision.matchCount,
					},
				},
				lastSyncedAt: now,
			};
			if (canPersistVendorMetadata) {
				data.vendorMetadata = {
					...((candidate.vendorMetadata as any) || {}),
					hrisSync: {
						source: params.source,
						matchReason: preserveManualEmployee
							? "manual_existing"
							: decision.matchReason,
						matchCount: decision.matchCount,
						lastSyncedAt: now.toISOString(),
					},
				};
			}
			if (existing?.id) {
				await (prisma as any).deviceUser.update({ where: { id: existing.id }, data });
				updated += 1;
			} else {
				await (prisma as any).deviceUser.create({
					data: {
						organizationId,
						deviceId,
						vendorUserId: candidate.vendorUserId,
						...data,
					},
				});
				created += 1;
			}
		}
		// A live device read is not proof that an HRIS/physical user was deleted.
		// Preserve stale and one-device-only identities for explicit admin review.
		void currentVendorUserIds;
		void params.pruneMissing;
		return { created, updated, linked, unmatched, conflict, disabled, pruned };
	};

	const backfillDeviceUsersFromLegacyEmployees = async (params: {
		organizationId: string;
		deviceId: string;
	}) => {
		const legacyEmployees = await prisma.employee.findMany({
			where: {
				organizationId: params.organizationId,
				isDeleted: false,
				deviceEmpId: { not: null },
			},
			select: {
				id: true,
				employeeId: true,
				deviceEmpId: true,
				person: { select: { personalInfo: true } },
			},
		});
		const candidates = legacyEmployees.reduce<DeviceUserCandidate[]>((items, employee) => {
			const vendorUserId = String(employee.deviceEmpId || "").trim();
			if (!vendorUserId) return items;
			items.push({
				vendorUserId,
				employeeNo: vendorUserId,
				displayName: getEmployeeDisplayName(employee) || employee.employeeId,
				userType: "legacy",
				status: "UNMATCHED" as const,
				validFrom: null,
				validTo: null,
				doorRight: null,
				accessPlan: null,
				rawPayload: {
					source: "Employee.deviceEmpId",
					employeeId: employee.employeeId,
					employeeDbId: employee.id,
				},
				vendorMetadata: {
					vendor: "legacy",
					source: "Employee.deviceEmpId",
					vendorUserId,
					employeeId: employee.employeeId,
					employeeDbId: employee.id,
				},
			});
			return items;
		}, []);
		const result = await upsertDeviceUsersFromCandidates({
			organizationId: params.organizationId,
			deviceId: params.deviceId,
			candidates,
			source: "legacy-backfill",
		});
		return { total: candidates.length, ...result };
	};

	const syncHikvisionDeviceUsersFromSource = async (params: {
		req: Request;
		organizationId: string;
		device: any;
		startedByUserId?: string | null;
	}) => {
		const run = await (prisma as any).deviceSyncRun.create({
			data: {
				organizationId: params.organizationId,
				deviceId: params.device.id,
				runType: "DEVICE_USERS",
				status: "PROCESSING",
				startedByUserId: params.startedByUserId || null,
			},
		});

		try {
			const { rawUsers, candidates } = await loadHikvisionDeviceUserSnapshot(
				params.req,
				params.device,
			);
			const result = await upsertDeviceUsersFromCandidates({
				organizationId: params.organizationId,
				deviceId: params.device.id,
				candidates,
				source: "hikvision",
			});
			const summary = {
				totalSourceRecords: rawUsers.length,
				importableRecords: candidates.length,
				...result,
			};
			const updatedRun = await (prisma as any).deviceSyncRun.update({
				where: { id: run.id },
				data: {
					status: "COMPLETED",
					totalSourceRecords: rawUsers.length,
					importableRecords: candidates.length,
					savedRecords: result.created + result.updated,
					skippedRecords: rawUsers.length - candidates.length,
					failedRecords: 0,
					missingRecords: 0,
					skipSummary: { invalidUserId: rawUsers.length - candidates.length },
					rawSummary: result,
					completedAt: new Date(),
				},
			});
			return { run: updatedRun, summary };
		} catch (error: any) {
			await (prisma as any).deviceSyncRun.update({
				where: { id: run.id },
				data: {
					status: "FAILED",
					failedRecords: 1,
					failureSummary: { message: error?.message || "device_user_sync_failed" },
					completedAt: new Date(),
				},
			});
			throw error;
		}
	};

	const syncSingleHikvisionDeviceUserFromSource = async (params: {
		req: Request;
		organizationId: string;
		device: any;
		employeeNo: string;
	}) => {
		const { rawUsers, candidates } = await loadSingleHikvisionDeviceUserSnapshot(
			params.req,
			params.device,
			params.employeeNo,
		);
		const result = candidates.length
			? await upsertDeviceUsersFromCandidates({
					organizationId: params.organizationId,
					deviceId: params.device.id,
					candidates,
					source: "hikvision",
					pruneMissing: false,
				})
			: {
					created: 0,
					updated: 0,
					linked: 0,
					unmatched: 0,
					conflict: 0,
					disabled: 0,
					pruned: 0,
				};
		return {
			summary: {
				totalSourceRecords: rawUsers.length,
				importableRecords: candidates.length,
				...result,
			},
		};
	};

	const mirrorDeviceUserLinkToPeer = async (params: {
		organizationId: string;
		sourceDeviceId: string;
		targetDeviceId: string;
		vendorUserId: string;
	}) => {
		const sourceDeviceUser = await (prisma as any).deviceUser.findUnique({
			where: {
				organizationId_deviceId_vendorUserId: {
					organizationId: params.organizationId,
					deviceId: params.sourceDeviceId,
					vendorUserId: params.vendorUserId,
				},
			},
			select: {
				employeeId: true,
				status: true,
			},
		});
		if (!sourceDeviceUser?.employeeId) return null;

		const targetDeviceUser = await (prisma as any).deviceUser.findUnique({
			where: {
				organizationId_deviceId_vendorUserId: {
					organizationId: params.organizationId,
					deviceId: params.targetDeviceId,
					vendorUserId: params.vendorUserId,
				},
			},
			select: {
				id: true,
				employeeId: true,
				status: true,
			},
		});
		if (!targetDeviceUser?.id) return null;
		if (
			targetDeviceUser.employeeId === sourceDeviceUser.employeeId &&
			targetDeviceUser.status === sourceDeviceUser.status
		) {
			return targetDeviceUser;
		}

		return await (prisma as any).deviceUser.update({
			where: { id: targetDeviceUser.id },
			data: {
				employeeId: sourceDeviceUser.employeeId,
				status: sourceDeviceUser.status,
			},
			select: {
				id: true,
				employeeId: true,
				status: true,
			},
		});
	};

	const createBiometricLifecycleSyncRun = async (params: {
		organizationId: string;
		deviceId: string;
		startedByUserId?: string | null;
		source?: string | null;
		eventKind: string;
		minor: string;
		employeeNo?: string | null;
		cardNo?: string | null;
		sourceWideRefresh: boolean;
		targetDeviceCount: number;
	}) => {
		try {
			return await (prisma as any).deviceSyncRun.create({
				data: {
					organizationId: params.organizationId,
					deviceId: params.deviceId,
					runType: "DEVICE_USERS",
					status: "PROCESSING",
					source: DEVICE_EVENT_SOURCES.has(String(params.source || "").trim())
						? String(params.source || "").trim()
						: null,
					startedByUserId: params.startedByUserId || null,
					totalSourceRecords: params.sourceWideRefresh ? params.targetDeviceCount : 1,
					importableRecords: params.sourceWideRefresh ? params.targetDeviceCount : 1,
					rawSummary: {
						kind: "biometric_lifecycle_reconcile",
						eventKind: params.eventKind,
						minor: params.minor,
						employeeNo: params.employeeNo || null,
						cardNo: params.cardNo || null,
						sourceWideRefresh: params.sourceWideRefresh,
						targetDeviceCount: params.targetDeviceCount,
					},
				},
				select: { id: true },
			});
		} catch (error) {
			if (isMissingDeviceSyncRunTableError(error)) {
				deviceLogger.warn(
					`Device sync run history table is missing; continuing biometric reconcile without durable run journal for device ${params.deviceId}`,
				);
				return null;
			}
			throw error;
		}
	};

	const finalizeBiometricLifecycleSyncRun = async (
		runId: string | null | undefined,
		data: Record<string, any>,
	) => {
		if (!runId) return;
		try {
			await (prisma as any).deviceSyncRun.update({
				where: { id: runId },
				data,
			});
		} catch (error) {
			if (isMissingDeviceSyncRunTableError(error)) return;
			throw error;
		}
	};

	const buildReconcileDerivedEventTaxonomy = (minor: string, eventKind: string) => {
		const normalizedMinor = String(minor || "")
			.trim()
			.toUpperCase();
		if (
			normalizedMinor === "MINOR_ADD_FINGER_BY_CARD" ||
			normalizedMinor === "MINOR_ADD_FINGER_BY_EMPLOYEE_NO"
		) {
			return {
				eventCategory: "ENROLLMENT",
				eventAction: "FINGERPRINT_ENROLLED",
				eventLabel: "Fingerprint enrolled",
				eventConfidence: "SUPPORTED",
			} as const;
		}
		if (
			normalizedMinor === "MINOR_MOD_FINGER_BY_CARD" ||
			normalizedMinor === "MINOR_MOD_FINGER_BY_EMPLOYEE_NO"
		) {
			return {
				eventCategory: "ENROLLMENT",
				eventAction: "FINGERPRINT_UPDATED",
				eventLabel: "Fingerprint updated",
				eventConfidence: "SUPPORTED",
			} as const;
		}
		if (
			normalizedMinor === "MINOR_DEL_FINGER" ||
			normalizedMinor === "MINOR_CLR_FINGER_BY_READER" ||
			normalizedMinor === "MINOR_CLR_FINGER_BY_CARD" ||
			normalizedMinor === "MINOR_CLR_FINGER_BY_EMPLOYEE_ON"
		) {
			return {
				eventCategory: "ENROLLMENT",
				eventAction: "FINGERPRINT_DELETED",
				eventLabel: "Fingerprint deleted",
				eventConfidence: "SUPPORTED",
			} as const;
		}
		if (normalizedMinor === "MINOR_ADD_USER_INFO") {
			return {
				eventCategory: "USER_MANAGEMENT",
				eventAction: "USER_CREATED",
				eventLabel: "Device user created",
				eventConfidence: "SUPPORTED",
			} as const;
		}
		if (normalizedMinor === "MINOR_MODIFY_USER_INFO") {
			return {
				eventCategory: "USER_MANAGEMENT",
				eventAction: "USER_UPDATED",
				eventLabel: "Device user updated",
				eventConfidence: "SUPPORTED",
			} as const;
		}
		if (normalizedMinor === "MINOR_CLR_USER_INFO") {
			return {
				eventCategory: "USER_MANAGEMENT",
				eventAction: "USER_DELETED",
				eventLabel: "Device user deleted",
				eventConfidence: "SUPPORTED",
			} as const;
		}
		if (
			eventKind === "biometric_operation_sync" ||
			normalizedMinor.startsWith("OBSERVED_OPERATION_MINOR_")
		) {
			return {
				eventCategory: "RUNTIME",
				eventAction: "SYNC_IMPORTED",
				eventLabel: "Device user sync reconciled",
				eventConfidence: "INFERRED",
			} as const;
		}
		return null;
	};

	const persistDerivedBiometricLifecycleEvent = async (params: {
		req: Request;
		organizationId: string;
		sourceDevice: any;
		employeeNo: string;
		eventKind: string;
		minor: string;
		source: string;
		sdkTime?: string | null;
		fingerprintSummary?: Record<string, any>;
		deviceUser?: { id?: string | null; employeeId?: string | null; rawPayload?: any } | null;
	}) => {
		const taxonomy = buildReconcileDerivedEventTaxonomy(params.minor, params.eventKind);
		if (!taxonomy) return null;
		const eventTime = params.sdkTime ? parseHikvisionEventTime(params.sdkTime) : new Date();
		const dedupeKey = [
			"reconcile-derived",
			params.sourceDevice.id,
			params.employeeNo || "all",
			taxonomy.eventAction,
			String(params.sdkTime || eventTime.toISOString()).trim(),
			String(params.minor || "").trim(),
		].join(":");
		const existing = await (prisma as any).deviceEvent.findFirst({
			where: {
				organizationId: params.organizationId,
				dedupeKey,
			},
			select: { id: true },
		});
		if (existing) return existing;
		const eventRecord = await (prisma as any).deviceEvent.create({
			data: {
				organizationId: params.organizationId,
				deviceId: params.sourceDevice.id,
				deviceUserId: params.deviceUser?.id || null,
				employeeId: params.deviceUser?.employeeId || null,
				eventTime,
				employeeNo: params.employeeNo || null,
				source: params.source,
				status: params.deviceUser?.employeeId ? "MATCHED" : "UNMATCHED",
				eventCategory: taxonomy.eventCategory,
				eventAction: taxonomy.eventAction,
				eventLabel: taxonomy.eventLabel,
				eventConfidence: taxonomy.eventConfidence,
				eventType: "BiometricReconcile",
				major: "3",
				minor: params.minor || null,
				dedupeKey,
				payload: {
					derivedFromReconcile: true,
					eventKind: params.eventKind,
					actionCode: params.minor,
					sourceDeviceId: params.sourceDevice.id,
					deviceIP: params.sourceDevice.address,
					ipAddress: params.sourceDevice.address,
					employeeNo: params.employeeNo,
					employeeNoString: params.employeeNo,
					fingerprintSummary: params.fingerprintSummary || {},
					deviceUserMetadata:
						params.deviceUser?.rawPayload &&
						typeof params.deviceUser.rawPayload === "object"
							? (params.deviceUser.rawPayload as any)._hrisDeviceMetadata || null
							: null,
				},
			},
		});
		await invalidateCache.byPattern("cache:device:events:*").catch(() => undefined);
		return eventRecord;
	};

	const buildDeviceUserLifecycleBackfillPlan = (params: {
		deviceUsers: Array<{
			id: string;
			vendorUserId?: string | null;
			employeeId?: string | null;
			employeeNo?: string | null;
			rawPayload?: any;
			lastSyncedAt?: Date | string | null;
		}>;
		existingKeys: Set<string>;
	}) => {
		const planned: Array<Record<string, any>> = [];
		for (const deviceUser of params.deviceUsers) {
			const employeeNo =
				String(deviceUser.employeeNo || deviceUser.vendorUserId || "").trim() || null;
			if (!employeeNo) continue;
			const credentialSummary = extractHikvisionCredentialSummary(
				deviceUser.rawPayload || {},
			);
			const createdKey = `${deviceUser.id}:USER_CREATED`;
			if (!params.existingKeys.has(createdKey)) {
				planned.push({
					deviceUser,
					employeeNo,
					eventAction: "USER_CREATED",
					eventCategory: "USER_MANAGEMENT",
					eventLabel: "Device user created",
					eventConfidence: "INFERRED",
					eventType: "BiometricStateBackfill",
					payload: {
						derivedFromCurrentDeviceState: true,
						credentialSummary,
					},
				});
			}
			if (credentialSummary.fingerprintCount > 0) {
				const fingerprintKey = `${deviceUser.id}:FINGERPRINT_ENROLLED`;
				if (!params.existingKeys.has(fingerprintKey)) {
					planned.push({
						deviceUser,
						employeeNo,
						eventAction: "FINGERPRINT_ENROLLED",
						eventCategory: "ENROLLMENT",
						eventLabel: "Fingerprint enrolled",
						eventConfidence: "INFERRED",
						eventType: "BiometricStateBackfill",
						payload: {
							derivedFromCurrentDeviceState: true,
							credentialSummary,
						},
					});
				}
			}
		}
		return planned;
	};

	const persistDeviceUserLifecycleBackfill = async (params: {
		organizationId: string;
		sourceDevice: { id: string; name: string; address?: string | null };
		deviceUsers: Array<{
			id: string;
			vendorUserId?: string | null;
			employeeId?: string | null;
			employeeNo?: string | null;
			rawPayload?: any;
			lastSyncedAt?: Date | string | null;
		}>;
		source: string;
		reason: string;
		execute: boolean;
		sdkTime?: string | null;
		minor?: string | null;
	}) => {
		const deviceUserIds = params.deviceUsers
			.map((row) => String(row.id || "").trim())
			.filter(Boolean);
		if (!deviceUserIds.length) {
			return {
				execute: params.execute,
				totalDeviceUsers: 0,
				plannedEvents: [],
				createdEvents: [],
			};
		}

		const existingEvents = await (prisma as any).deviceEvent.findMany({
			where: {
				organizationId: params.organizationId,
				deviceId: params.sourceDevice.id,
				deviceUserId: { in: deviceUserIds },
				eventAction: { in: ["USER_CREATED", "FINGERPRINT_ENROLLED"] },
			},
			select: {
				deviceUserId: true,
				eventAction: true,
			},
		});
		const existingKeys = new Set<string>(
			existingEvents.map(
				(event: { deviceUserId?: string | null; eventAction?: string | null }) =>
					`${String(event.deviceUserId || "").trim()}:${String(event.eventAction || "").trim()}`,
			),
		);
		const plannedEvents = buildDeviceUserLifecycleBackfillPlan({
			deviceUsers: params.deviceUsers,
			existingKeys,
		});

		if (!params.execute) {
			return {
				execute: false,
				totalDeviceUsers: params.deviceUsers.length,
				plannedEvents: plannedEvents.map((event) => ({
					deviceUserId: event.deviceUser.id,
					vendorUserId: event.deviceUser.vendorUserId || null,
					employeeNo: event.employeeNo,
					eventAction: event.eventAction,
					eventCategory: event.eventCategory,
				})),
				createdEvents: [],
			};
		}

		const createdEvents = [];
		for (const plannedEvent of plannedEvents) {
			const eventTime = params.sdkTime
				? parseHikvisionEventTime(params.sdkTime)
				: plannedEvent.deviceUser.lastSyncedAt
					? new Date(plannedEvent.deviceUser.lastSyncedAt)
					: new Date();
			const dedupeKey = [
				"device-user-lifecycle-backfill",
				params.sourceDevice.id,
				plannedEvent.deviceUser.id,
				plannedEvent.eventAction,
			].join(":");
			const eventRecord = await (prisma as any).deviceEvent.create({
				data: {
					organizationId: params.organizationId,
					deviceId: params.sourceDevice.id,
					deviceUserId: plannedEvent.deviceUser.id,
					employeeId: plannedEvent.deviceUser.employeeId || null,
					eventTime,
					employeeNo: plannedEvent.employeeNo,
					source: params.source,
					status: plannedEvent.deviceUser.employeeId ? "MATCHED" : "UNMATCHED",
					eventCategory: plannedEvent.eventCategory,
					eventAction: plannedEvent.eventAction,
					eventLabel: plannedEvent.eventLabel,
					eventConfidence: plannedEvent.eventConfidence,
					eventType: plannedEvent.eventType,
					major: "3",
					minor: params.minor || "STATE_BACKFILL",
					dedupeKey,
					payload: {
						...plannedEvent.payload,
						backfillReason: params.reason,
						sourceDeviceId: params.sourceDevice.id,
						sourceDeviceName: params.sourceDevice.name,
						deviceIP: params.sourceDevice.address || null,
						ipAddress: params.sourceDevice.address || null,
						employeeNo: plannedEvent.employeeNo,
						employeeNoString: plannedEvent.employeeNo,
						deviceUserMetadata:
							plannedEvent.deviceUser.rawPayload &&
							typeof plannedEvent.deviceUser.rawPayload === "object"
								? (plannedEvent.deviceUser.rawPayload as any)._hrisDeviceMetadata ||
									null
								: null,
					},
				},
				select: {
					id: true,
					deviceUserId: true,
					eventAction: true,
					eventCategory: true,
					employeeNo: true,
				},
			});
			createdEvents.push(eventRecord);
		}
		if (createdEvents.length) {
			await invalidateCache.byPattern("cache:device:events:*").catch(() => undefined);
		}
		return {
			execute: true,
			totalDeviceUsers: params.deviceUsers.length,
			plannedEvents: plannedEvents.map((event) => ({
				deviceUserId: event.deviceUser.id,
				vendorUserId: event.deviceUser.vendorUserId || null,
				employeeNo: event.employeeNo,
				eventAction: event.eventAction,
				eventCategory: event.eventCategory,
			})),
			createdEvents,
		};
	};

	const syncDeviceUsers = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		try {
			const deviceId = String(req.params.id || (req.body as any)?.deviceId || "").trim();
			const device = await getDeviceForUserSync(gate.organizationId, deviceId);
			if (!device || !isHikvisionDevice(device)) {
				res.status(400).json(
					buildErrorResponse("Select a Hikvision device before syncing users", 400),
				);
				return;
			}
			const { run: updatedRun, summary } = await syncHikvisionDeviceUsersFromSource({
				req,
				organizationId: gate.organizationId,
				device,
				startedByUserId: (req as any).userId || null,
			});
			const syncedDeviceUsers = await prisma.deviceUser.findMany({
				where: {
					organizationId: gate.organizationId,
					deviceId: device.id,
				},
				orderBy: { vendorUserId: "asc" },
				select: {
					id: true,
					vendorUserId: true,
					employeeId: true,
					employeeNo: true,
					rawPayload: true,
					lastSyncedAt: true,
				},
			});
			const lifecycleBackfill = await persistDeviceUserLifecycleBackfill({
				organizationId: gate.organizationId,
				sourceDevice: {
					id: device.id,
					name: device.name,
					address: device.address,
				},
				deviceUsers: syncedDeviceUsers,
				source: "EN_HCNETSDK_ALARM",
				reason: "sync_device_users_route",
				execute: true,
				minor: "SYNC_ROUTE_BACKFILL",
			});
			await invalidateCache.byPattern("cache:device:*").catch(() => undefined);
			res.status(200).json(
				buildSuccessResponse(
					"Device users synced",
					{
						run: updatedRun,
						summary,
						lifecycleBackfill,
					},
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to sync device users", 500),
			);
		}
	};

	const classifyHikvisionProbeError = (error: any): HikvisionCapabilityStatus => {
		const status = Number(error?.status || 0);
		const text = JSON.stringify(error?.data || error || {}).toLowerCase();
		if (status === 401 || status === 403) return "authFailed";
		if (status === 405 || text.includes("methodnotallowed") || text.includes("method not allowed")) {
			return "methodNotAllowed";
		}
		if (
			status === 404 ||
			text.includes("notsupport") ||
			text.includes("not support") ||
			text.includes("not_supported")
		) {
			return "notSupported";
		}
		return "unknown";
	};

	const probeHikvisionCapability = async (params: {
		req: Request;
		deviceId: string;
		name: string;
		endpoint: string;
		method?: "GET" | "POST" | "PUT";
		body?: Record<string, any>;
	}) => {
		const startedAt = Date.now();
		try {
			const data = await hikvisionFetch(params.endpoint, {
				method: params.method || "GET",
				deviceId: params.deviceId,
				prisma,
				request: params.req,
				timeoutMs: 6000,
				headers: { "Content-Type": "application/json" },
				...(params.body ? { body: params.body } : {}),
			});
			return {
				name: params.name,
				endpoint: params.endpoint,
				method: params.method || "GET",
				status: "supported" as HikvisionCapabilityStatus,
				durationMs: Date.now() - startedAt,
				evidence: {
					responseKeys: data && typeof data === "object" ? Object.keys(data).slice(0, 8) : [],
					statusString:
						data?.statusString ||
						data?.ResponseStatus?.statusString ||
						data?.UserInfoSearch?.responseStatusStrg ||
						null,
				},
			};
		} catch (error: any) {
			return {
				name: params.name,
				endpoint: params.endpoint,
				method: params.method || "GET",
				status: classifyHikvisionProbeError(error),
				durationMs: Date.now() - startedAt,
				error: error?.message || error?.data?.message || "Capability probe failed",
				rawStatus: error?.status || null,
				raw: error?.data || null,
			};
		}
	};

	const discoverHikvisionUserExportCapabilities = async (
		req: Request,
		device: { id: string; name?: string | null },
		options: { includeCards?: boolean; includeFingerprints?: boolean; includeFaces?: boolean } = {},
	) => {
		const probes = [
			await probeHikvisionCapability({
				req,
				deviceId: device.id,
				name: "userCount",
				endpoint: hikvisionEndpoint.accessControl.userInfo.count,
			}),
			await probeHikvisionCapability({
				req,
				deviceId: device.id,
				name: "userSearch",
				endpoint: hikvisionEndpoint.accessControl.userInfo.search,
				method: "POST",
				body: {
					UserInfoSearchCond: {
						searchID: `export-capability-${Date.now()}`,
						searchResultPosition: 0,
						maxResults: 1,
					},
				},
			}),
		];
		if (options.includeCards) {
			probes.push(
				await probeHikvisionCapability({
					req,
					deviceId: device.id,
					name: "cardSearch",
					endpoint: "/ISAPI/AccessControl/CardInfo/Search",
					method: "POST",
					body: {
						CardInfoSearchCond: {
							searchID: `card-export-capability-${Date.now()}`,
							searchResultPosition: 0,
							maxResults: 1,
						},
					},
				}),
			);
		}
		if (options.includeFingerprints) {
			probes.push(
				await probeHikvisionCapability({
					req,
					deviceId: device.id,
					name: "fingerprintSearch",
					endpoint: "/ISAPI/AccessControl/FingerPrintUpload",
					method: "POST",
					body: {
						FingerPrintCond: {
							searchID: `fingerprint-export-capability-${Date.now()}`,
							searchResultPosition: 0,
							maxResults: 1,
						},
					},
				}),
				await probeHikvisionCapability({
					req,
					deviceId: device.id,
					name: "fingerprintImportSetup",
					endpoint: "/ISAPI/AccessControl/FingerPrint/SetUp/capabilities",
				}),
			);
		}
		if (options.includeFaces) {
			probes.push(
				await probeHikvisionCapability({
					req,
					deviceId: device.id,
					name: "faceDataRecord",
					endpoint: "/ISAPI/Intelligent/FDLib/FaceDataRecord/capabilities",
				}),
			);
		}
		const byName = Object.fromEntries(probes.map((probe) => [probe.name, probe]));
		return {
			deviceId: device.id,
			deviceName: device.name || null,
			probedAt: new Date().toISOString(),
			probes,
			support: {
				userExport: byName.userSearch?.status === "supported",
				cardExport: byName.cardSearch?.status === "supported",
				fingerprintExport: byName.fingerprintSearch?.status === "supported",
				fingerprintImport: byName.fingerprintImportSetup?.status === "supported",
				faceImportExport: byName.faceDataRecord?.status === "supported",
			},
			policy: {
				fingerprintTemplateExport:
					"blocked_until_encrypted_biometric_custody_design_is_approved",
				fingerprintTemplateImport:
					"blocked_until_encrypted_biometric_custody_design_is_approved",
			},
		};
	};

	const loadDeviceUsersForExport = async (organizationId: string, deviceId: string) => {
		if (!(await hasDeviceUserTable())) return [];
		const includeVendorMetadata = await hasDeviceUserVendorMetadataColumn();
		const rows = await (prisma as any).deviceUser.findMany({
			where: { organizationId, deviceId },
			select: buildDeviceUserSelect({ includeVendorMetadata }),
			orderBy: [{ vendorUserId: "asc" }],
		});
		return rows.map(decorateDeviceUser);
	};

	const normalizeDeviceUserExportSelection = (value: unknown) => {
		const selection = String(value || "all").trim();
		return ["all", "filtered", "currentPage", "selectedRows"].includes(selection)
			? selection
			: "all";
	};

	const normalizeDeviceUserExportVendorIds = (value: unknown) =>
		Array.from(
			new Set(
				[]
					.concat(value as any)
					.flatMap((item) => String(item || "").split(","))
					.map((item) => item.trim())
					.filter(Boolean),
			),
		).slice(0, 500);

	const filterDeviceUserExportRows = (
		rows: any[],
		options: {
			selection?: string;
			status?: string;
			query?: string;
			page?: number;
			limit?: number;
			vendorUserIds?: string[];
		},
	) => {
		const selection = normalizeDeviceUserExportSelection(options.selection);
		const vendorUserIds = normalizeDeviceUserExportVendorIds(options.vendorUserIds);
		const vendorUserIdSet = new Set(vendorUserIds);
		const status = String(options.status || "all").trim();
		const query = String(options.query || "").trim().toLowerCase();
		let selectedRows = rows;
		if (vendorUserIdSet.size > 0) {
			selectedRows = rows
				.filter((row) => vendorUserIdSet.has(String(row.vendorUserId || "").trim()))
				.sort(
					(left, right) =>
						vendorUserIds.indexOf(String(left.vendorUserId || "").trim()) -
						vendorUserIds.indexOf(String(right.vendorUserId || "").trim()),
				);
		} else if (selection === "filtered" || selection === "currentPage") {
			selectedRows = rows.filter((row) => {
				const rowStatus = String(row.status || "").trim();
				const statusMatch =
					!status ||
					status === "all" ||
					rowStatus === status ||
					(status === "UNMATCHED" && rowStatus === "SOURCE_ONLY");
				if (!statusMatch) return false;
				if (!query) return true;
				return [
					row.vendorUserId,
					row.employeeNo,
					row.displayName,
					row.userType,
					row.hrisDeviceUser?.employee?.employeeId,
					row.hrisDeviceUser?.employee?.fullName,
				]
					.filter(Boolean)
					.some((value) => String(value).toLowerCase().includes(query));
			});
			if (selection === "currentPage") {
				const page = Math.max(Number(options.page || 1), 1);
				const limit = Math.min(Math.max(Number(options.limit || 25), 1), 500);
				selectedRows = selectedRows.slice((page - 1) * limit, page * limit);
			}
		}
		return {
			rows: selectedRows,
			selection: {
				mode: selection,
				status,
				query,
				page:
					selection === "currentPage" && vendorUserIds.length === 0
						? Math.max(Number(options.page || 1), 1)
						: null,
				limit:
					selection === "currentPage" && vendorUserIds.length === 0
						? Math.min(Math.max(Number(options.limit || 25), 1), 500)
						: null,
				vendorUserIds,
				matchedRows: selectedRows.length,
				totalRowsBeforeSelection: rows.length,
			},
		};
	};

	const buildDeviceUserImportPreviewToken = (params: {
		organizationId: string;
		targetDeviceId: string;
		payload: any;
		planRows: any[];
	}) =>
		createHash("sha256")
			.update(
				JSON.stringify({
					organizationId: params.organizationId,
					targetDeviceId: params.targetDeviceId,
					schemaVersion: params.payload?.schemaVersion || null,
					exportedAt: params.payload?.exportedAt || null,
					sourceDevices: (params.payload?.devices || []).map((device: any) => ({
						id: device?.device?.id || null,
						name: device?.device?.name || null,
					})),
					users: params.planRows.map((row) => ({
						vendorUserId: row.vendorUserId,
						action: row.action,
						sourceDeviceId: row.sourceDeviceId || null,
						conflictFields: row.conflictFields || [],
					})),
				}),
			)
			.digest("hex");

	const BIOMETRIC_TEMPLATE_KEY_PATTERN =
		/(finger.*(template|data|payload|bytes)|fp.*(template|data|payload|bytes)|face.*(template|data|payload|bytes)|templateData|templateBytes|byFingerData|fingerData|faceData|imageData|photoData|biometric.*(template|data|payload|bytes))/i;

	const isEncryptedDeviceUserBiometricBundleValue = (value: any) => {
		const parsed =
			typeof value === "string"
				? (() => {
						try {
							return JSON.parse(value);
						} catch {
							return null;
						}
					})()
				: value;
		return Boolean(
			parsed?.ciphertext &&
				parsed?.algorithm === DEVICE_USER_BIOMETRIC_BUNDLE_ALGORITHM &&
				parsed?.format === "project-truth.hikvision-biometric-template.v1",
		);
	};

	const sanitizeDeviceUserPortableValue = (value: any, key = ""): any => {
		if (value == null) return value;
		if (BIOMETRIC_TEMPLATE_KEY_PATTERN.test(key)) {
			if (isEncryptedDeviceUserBiometricBundleValue(value)) return value;
			return "[redacted-biometric-template]";
		}
		if (Buffer.isBuffer(value)) return "[redacted-binary-value]";
		if (Array.isArray(value)) {
			return value.map((item) => sanitizeDeviceUserPortableValue(item));
		}
		if (typeof value === "object") {
			return Object.fromEntries(
				Object.entries(value).map(([entryKey, entryValue]) => [
					entryKey,
					sanitizeDeviceUserPortableValue(entryValue, entryKey),
				]),
			);
		}
		return value;
	};

	const sanitizeDeviceUserImportPayloadForBackup = (payload: any) => ({
		schemaVersion: payload?.schemaVersion || null,
		exportedAt: payload?.exportedAt || null,
		scope: payload?.scope || null,
		policy: payload?.policy || null,
		biometricBundle: payload?.biometricBundle
			? {
					...payload.biometricBundle,
					ciphertext: payload.biometricBundle.ciphertext
						? "[encrypted-bundle-redacted]"
						: undefined,
				}
			: null,
		summary: payload?.summary || null,
		devices: (Array.isArray(payload?.devices) ? payload.devices : []).map((device: any) => ({
			device: device?.device || null,
			sourceRead: device?.sourceRead || null,
			capabilities: device?.capabilities || null,
			summary: device?.summary || null,
			userCount: Array.isArray(device?.users) ? device.users.length : 0,
			users: (Array.isArray(device?.users) ? device.users : []).map((user: any) => ({
				vendorUserId: user?.vendorUserId || null,
				employeeNo: user?.employeeNo || null,
				displayName: user?.displayName || null,
				status: user?.status || null,
				sourceDeviceId: user?.sourceDeviceId || null,
				credentialSummary:
					user?.rawPayload?._hrisDeviceMetadata?.credentialSummary ||
					user?.vendorMetadata?.credentialSummary ||
					null,
			})),
		})),
	});

	const buildDeviceUserImportResultRow = (row: any, extra: Record<string, any> = {}) => ({
		vendorUserId: row?.vendorUserId || null,
		employeeNo: row?.employeeNo || null,
		sourceDeviceId: row?.sourceDeviceId || null,
		sourceDeviceName: row?.sourceDeviceName || null,
		action: row?.action || null,
		conflictFields: Array.isArray(row?.conflictFields) ? row.conflictFields : [],
		currentDeviceUserId: row?.currentDeviceUserId || null,
		...extra,
	});

	const summarizeDeviceUserImportTarget = (deviceUser: any) =>
		deviceUser
			? {
					id: deviceUser.id || null,
					vendorUserId: deviceUser.vendorUserId || null,
					employeeNo: deviceUser.employeeNo || null,
					employeeId: deviceUser.employeeId || null,
					status: deviceUser.status || null,
					credentialSummary: deviceUser.rawPayload?._hrisDeviceMetadata?.credentialSummary || null,
				}
			: null;

	const waitForDelayedHikvisionPeerCopy = async (params: {
		req: Request;
		organizationId: string;
		targetDevice: any;
		employeeNo: string;
	}) => {
		const deadline = Date.now() + HIKVISION_PEER_COPY_COMPLETION_WAIT_MS;
		let lastSummary: any = null;
		let attempts = 0;
		do {
			attempts += 1;
			if (attempts > 1) await sleep(5000);
			const { summary } = await syncSingleHikvisionDeviceUserFromSource({
				req: params.req,
				organizationId: params.organizationId,
				device: params.targetDevice,
				employeeNo: params.employeeNo,
			});
			lastSummary = summary;
			const targetDeviceUser = await (prisma as any).deviceUser.findUnique({
				where: {
					organizationId_deviceId_vendorUserId: {
						organizationId: params.organizationId,
						deviceId: params.targetDevice.id,
						vendorUserId: params.employeeNo,
					},
				},
				select: {
					id: true,
					vendorUserId: true,
					employeeNo: true,
					employeeId: true,
					status: true,
					lastSyncedAt: true,
					rawPayload: true,
				},
			});
			if (targetDeviceUser?.id) {
				return {
					attempts,
					waitedMs: Math.max(0, HIKVISION_PEER_COPY_COMPLETION_WAIT_MS - (deadline - Date.now())),
					targetSyncSummary: summary,
					targetDeviceUser,
				};
			}
		} while (Date.now() < deadline);
		return { attempts, waitedMs: HIKVISION_PEER_COPY_COMPLETION_WAIT_MS, targetSyncSummary: lastSummary };
	};

	const buildDeviceUserExportPayload = async (
		req: Request,
		options: {
			organizationId: string;
			deviceId?: string;
			scope?: "currentDevice" | "allHikvisionDevices";
			includeRecords: boolean;
			includeCards?: boolean;
			includeFingerprints?: boolean;
			includeFaces?: boolean;
			encryptedBiometricBundle?: boolean;
			refreshSourceUsers?: boolean;
			refreshBiometricBundle?: boolean;
			cacheBiometricMetadata?: boolean;
			selection?: string;
			status?: string;
			query?: string;
			page?: number;
			limit?: number;
			vendorUserIds?: string[];
		},
	) => {
		const requestedScope = options.scope || "currentDevice";
		const encryptedBiometricExports: any[] = [];
		const encryptedBiometricExportErrors: any[] = [];
		const devices = await prisma.device.findMany({
			where: {
				organizationId: options.organizationId,
				isDeleted: false,
				...(requestedScope === "currentDevice" ? { id: options.deviceId || "" } : {}),
			},
			select: {
				id: true,
				organizationId: true,
				name: true,
				address: true,
				port: true,
				protocol: true,
				config: true,
				access: true,
			},
			orderBy: { name: "asc" },
		});
		const hikvisionDevices = devices.filter((device) => isHikvisionDevice(device));
		if (requestedScope === "currentDevice" && !hikvisionDevices.length) {
			throw { status: 400, message: "Select a Hikvision device before exporting users" };
		}

		const exportDevices = [];
		for (const device of hikvisionDevices) {
			let sourceSnapshot: { rawUsers: any[]; candidates: DeviceUserCandidate[] } = {
				rawUsers: [],
				candidates: [],
			};
			let sourceRead: Record<string, any> = {
				status: "skipped_cached_device_user_metadata",
				endpoint: "DeviceUser table",
				reason:
					"Normal export uses saved DeviceUser metadata so CSV generation does not wait for live SDK reads.",
			};
			if (options.refreshSourceUsers === true) {
				try {
					sourceSnapshot = await loadHikvisionDeviceUserSnapshot(req, device);
					sourceRead = {
						status: "supported",
						endpoint: "POST /ISAPI/AccessControl/UserInfo/Search?format=json",
						total: sourceSnapshot.rawUsers.length,
					};
				} catch (error: any) {
					sourceRead = {
						status: classifyHikvisionProbeError(error),
						endpoint: "POST /ISAPI/AccessControl/UserInfo/Search?format=json",
						error: error?.message || "Source user read failed",
						rawStatus: error?.status || null,
					};
				}
			}

			const savedUsers = await loadDeviceUsersForExport(options.organizationId, device.id);
			const savedByVendorUserId = new Map(
				savedUsers.map((row: any) => [String(row.vendorUserId || "").trim(), row]),
			);
			const sourceByVendorUserId = new Map(
				sourceSnapshot.candidates.map((candidate) => [
					String(candidate.vendorUserId || "").trim(),
					candidate,
				]),
			);
			const allVendorUserIds: string[] = Array.from(
				new Set<string>(
					[...savedByVendorUserId.keys(), ...sourceByVendorUserId.keys()]
						.map((value) => String(value || "").trim())
						.filter(Boolean),
				),
			).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
			const rows = allVendorUserIds.map((vendorUserId) => {
				const saved = savedByVendorUserId.get(vendorUserId) as any;
				const source = sourceByVendorUserId.get(vendorUserId);
				const rawPayload = sanitizeDeviceUserPortableValue(
					saved?.rawPayload || source?.rawPayload || null,
				);
				const vendorMetadata = sanitizeDeviceUserPortableValue(
					saved?.vendorMetadata ||
						source?.vendorMetadata ||
						(rawPayload
							? {
									source: "rawPayload",
									rawVendorPayload: rawPayload,
								}
							: null),
				);
				return {
					vendorUserId,
					employeeNo: saved?.employeeNo || source?.employeeNo || vendorUserId,
					displayName: saved?.displayName || source?.displayName || null,
					userType: saved?.userType || source?.userType || null,
					status: saved?.status || "SOURCE_ONLY",
					validFrom: saved?.validFrom || source?.validFrom || null,
					validTo: saved?.validTo || source?.validTo || null,
					doorRight: saved?.doorRight || source?.doorRight || null,
					accessPlan: saved?.accessPlan || source?.accessPlan || null,
					hrisDeviceUser: saved
						? {
								id: saved.id,
								employeeId: saved.employeeId || null,
								lastSyncedAt: saved.lastSyncedAt || null,
								employee: saved.employee || null,
						}
						: null,
					rawPayload,
					vendorMetadata,
				};
			});
			const selected = filterDeviceUserExportRows(rows, {
				selection: options.selection,
				status: options.status,
				query: options.query,
				page: options.page,
				limit: options.limit,
				vendorUserIds: options.vendorUserIds,
			});
			const exportRows = selected.rows;
			const linked = exportRows.filter((row) => row.hrisDeviceUser?.employeeId).length;
			const capabilitySummary = await discoverHikvisionUserExportCapabilities(req, device, {
				includeCards: options.includeCards,
				includeFingerprints: options.includeFingerprints,
				includeFaces: options.includeFaces,
			});
			const sensitiveCredentialRequested =
				Boolean(options.includeFingerprints || options.includeFaces) &&
				Boolean(options.encryptedBiometricBundle);
			if (sensitiveCredentialRequested) {
				for (const row of exportRows as any[]) {
					const credentialSummary =
						row.rawPayload?._hrisDeviceMetadata?.credentialSummary ||
						row.vendorMetadata?.credentialSummary ||
						extractHikvisionCredentialSummary(row.rawPayload || {});
					const shouldExportBiometric =
						(options.includeFingerprints && credentialSummary.fingerprintCount > 0) ||
						(options.includeFaces && credentialSummary.faceCount > 0);
					if (!shouldExportBiometric) continue;
					const cachedTemplates = parseCachedDeviceUserBiometricTemplates(row);
					const fingerprintCount = Number(credentialSummary.fingerprintCount || 0);
					const faceCount = Number(credentialSummary.faceCount || 0);
					const cachedFingerprint =
						cachedTemplates.fingerprint ||
						(fingerprintCount > 0 && faceCount === 0 ? cachedTemplates.legacy : null);
					const cachedFace =
						cachedTemplates.face ||
						(faceCount > 0 && fingerprintCount === 0 ? cachedTemplates.legacy : null);
					const requestedFingerprint = Boolean(options.includeFingerprints && fingerprintCount > 0);
					const requestedFace = Boolean(options.includeFaces && faceCount > 0);
					const requestedModalitiesCached =
						(!requestedFingerprint || Boolean(cachedFingerprint)) &&
						(!requestedFace || Boolean(cachedFace));
					if (requestedModalitiesCached && options.refreshBiometricBundle !== true) {
						row.vendorMetadata = {
							...(row.vendorMetadata || {}),
							biometricBundle: {
								...(row.vendorMetadata?.biometricBundle || {}),
								present: true,
								algorithm: DEVICE_USER_BIOMETRIC_BUNDLE_ALGORITHM,
								fingerprintPresent: Boolean(cachedFingerprint),
								facePresent: Boolean(cachedFace),
								fingerprintRawTemplateBlob: cachedFingerprint
									? JSON.stringify(cachedFingerprint)
									: "",
								faceRawTemplateBlob: cachedFace ? JSON.stringify(cachedFace) : "",
								encryptedFingerprintTemplate: cachedFingerprint,
								encryptedFaceTemplate: cachedFace,
								fingerprintTemplateKeySource: cachedFingerprint?.keySource || null,
								faceTemplateKeySource: cachedFace?.keySource || null,
								source: "device_user_metadata_cache",
							},
						};
						encryptedBiometricExports.push({
							sourceDeviceId: device.id,
							vendorUserId: row.vendorUserId,
							source: "device_user_metadata_cache",
							fingerprintPlaintextSha256: cachedFingerprint?.plaintextSha256 || null,
							fingerprintCiphertextLength: String(cachedFingerprint?.ciphertext || "").length,
							fingerprintKeySource: cachedFingerprint?.keySource || null,
							facePlaintextSha256: cachedFace?.plaintextSha256 || null,
							faceCiphertextLength: String(cachedFace?.ciphertext || "").length,
							faceKeySource: cachedFace?.keySource || null,
						});
						continue;
					}
					if (options.refreshBiometricBundle !== true) {
						encryptedBiometricExportErrors.push({
							sourceDeviceId: device.id,
							vendorUserId: row.vendorUserId,
							status: "not_cached",
							error:
								"No encrypted biometric metadata is cached on DeviceUser. Run biometric metadata backfill or export with refreshBiometricBundle=true.",
						});
						continue;
					}
					try {
						const biometricExport = await runHikvisionBiometricExportOnVm({
							device,
							organizationId: options.organizationId,
							vendorUserId: String(row.vendorUserId || row.employeeNo || "").trim(),
							includeFingerprints: Boolean(options.includeFingerprints),
							includeFaces: Boolean(options.includeFaces),
						});
						const metadata = buildDeviceUserBiometricMetadata(
							biometricExport,
							"hikvision_sdk_export_refresh",
						);
						applyDeviceUserBiometricMetadataToRow(row, metadata);
						if (options.cacheBiometricMetadata !== false && row.hrisDeviceUser?.id) {
							await persistDeviceUserBiometricMetadata({
								organizationId: options.organizationId,
								deviceId: device.id,
								vendorUserId: String(row.vendorUserId || row.employeeNo || "").trim(),
								row,
							}).catch(() => null);
						}
						encryptedBiometricExports.push({
							sourceDeviceId: device.id,
							vendorUserId: row.vendorUserId,
							source: "hikvision_sdk_export_refresh",
							fingerprintCount: biometricExport.fingerprintCount,
							faceTemplateSize: biometricExport.faceTemplateSize,
							facePictureSize: biometricExport.facePictureSize,
							fingerprintPlaintextSha256:
								biometricExport.encryptedFingerprint?.plaintextSha256 || null,
							fingerprintCiphertextLength: String(
								biometricExport.encryptedFingerprint?.ciphertext || "",
							).length,
							fingerprintKeySource:
								biometricExport.encryptedFingerprint?.keySource || null,
							facePlaintextSha256: biometricExport.encryptedFace?.plaintextSha256 || null,
							faceCiphertextLength: String(
								biometricExport.encryptedFace?.ciphertext || "",
							).length,
							faceKeySource: biometricExport.encryptedFace?.keySource || null,
						});
					} catch (error: any) {
						encryptedBiometricExportErrors.push({
							sourceDeviceId: device.id,
							vendorUserId: row.vendorUserId,
							error: error?.message || "Biometric SDK export failed",
						});
					}
				}
			}
			exportDevices.push({
				device: {
					id: device.id,
					name: device.name,
					address: device.address,
					port: device.port,
					protocol: device.protocol,
					model: (device.config as any)?.model || (device.config as any)?.deviceModel || null,
					serialNumber:
						(device.config as any)?.serialNumber || (device.config as any)?.serial || null,
				},
				sourceRead,
				capabilities: capabilitySummary,
				summary: {
					totalUsers: exportRows.length,
					readFromDevice: sourceSnapshot.rawUsers.length,
					savedInHris: savedUsers.length,
					linked,
					unlinked: Math.max(exportRows.length - linked, 0),
					selection: selected.selection,
					credentialTypes: {
						users: "included",
						hrisLinks: "included",
						cards: capabilitySummary.support.cardExport ? "supported" : "unsupported_or_not_requested",
							fingerprints: capabilitySummary.support.fingerprintExport
								? sensitiveCredentialRequested
									? options.refreshBiometricBundle === true
										? "encrypted_bundle_refreshed_from_sdk"
										: "encrypted_bundle_from_device_user_metadata"
									: "supported_but_template_export_blocked_by_policy"
								: "unsupported_or_not_requested",
							faces: capabilitySummary.support.faceImportExport
								? sensitiveCredentialRequested
									? options.refreshBiometricBundle === true
										? "encrypted_bundle_refreshed_from_sdk"
										: "encrypted_bundle_from_device_user_metadata"
									: "supported_by_probe"
								: "unsupported_or_not_requested",
					},
				},
				users: options.includeRecords ? exportRows : [],
			});
		}

		return {
			schemaVersion: DEVICE_USER_EXPORT_SCHEMA_VERSION,
			exportedAt: new Date().toISOString(),
			scope: {
				type: requestedScope,
				deviceId: options.deviceId || null,
				sourceEndpoint: "POST /ISAPI/AccessControl/UserInfo/Search?format=json",
				selection: normalizeDeviceUserExportSelection(options.selection),
				status: options.status || "all",
				query: options.query || "",
				page: options.page || null,
				limit: options.limit || null,
			},
			policy: {
				mutating: false,
				fingerprintTemplateCustody:
					"raw fingerprint and face template bytes are never exported in normal JSON",
				biometricTransferModes: ["sdkPeerCopy", "encryptedBundle"],
			},
			biometricBundle: options.encryptedBiometricBundle
				? {
						present: encryptedBiometricExports.length > 0,
						requiredForPortableTemplateImport: Boolean(
							options.includeFingerprints || options.includeFaces,
						),
						algorithm: DEVICE_USER_BIOMETRIC_BUNDLE_ALGORITHM,
						status: encryptedBiometricExports.length
							? encryptedBiometricExports.some((item) => item.source === "hikvision_sdk_export_refresh")
								? "refreshed_from_hikvision_sdk_and_cached"
								: "cached_from_device_user_metadata"
							: encryptedBiometricExportErrors.length
								? encryptedBiometricExportErrors.every((item) => item.status === "not_cached")
									? "not_cached_run_biometric_metadata_backfill"
									: "sdk_export_failed"
								: "not_created_no_biometric_rows",
						reason: encryptedBiometricExports.length
							? "Export wrote encrypted biometric bundle values from DeviceUser metadata cache unless refreshBiometricBundle=true was requested."
							: "No SDK biometric template bytes were encrypted for this export. Check biometricExportErrors for device/SDK failures.",
						plaintextPolicy:
							"Do not write raw biometric template bytes to JSON, logs, screenshots, or reports.",
						users: encryptedBiometricExports,
						errors: encryptedBiometricExportErrors,
					}
				: {
						present: false,
						requiredForPortableTemplateImport: false,
						status: "not_requested",
					},
			devices: exportDevices,
			summary: {
				devices: exportDevices.length,
				totalUsers: exportDevices.reduce((sum, item) => sum + item.summary.totalUsers, 0),
				linked: exportDevices.reduce((sum, item) => sum + item.summary.linked, 0),
				unlinked: exportDevices.reduce((sum, item) => sum + item.summary.unlinked, 0),
			},
		};
	};

	const previewDeviceUserExport = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		try {
			const body = (req.body || {}) as Record<string, any>;
			const payload = await buildDeviceUserExportPayload(req, {
				organizationId: gate.organizationId,
				deviceId: String(body.deviceId || body.targetDeviceId || "").trim(),
				scope:
					body.scope === "allHikvisionDevices" ? "allHikvisionDevices" : "currentDevice",
				includeRecords: false,
				includeCards: body.includeCards === true,
				includeFingerprints: body.includeFingerprints === true,
				includeFaces: body.includeFaces === true,
				encryptedBiometricBundle: body.encryptedBiometricBundle === true,
				refreshSourceUsers: body.refreshSourceUsers === true,
				refreshBiometricBundle: body.refreshBiometricBundle === true,
				selection: body.selection,
				status: body.status,
				query: body.query,
				page: Number(body.page || 0) || undefined,
				limit: Number(body.limit || 0) || undefined,
				vendorUserIds: normalizeDeviceUserExportVendorIds(body.vendorUserIds),
			});
			res.status(200).json(buildSuccessResponse("Device user export preview built", payload, 200));
		} catch (error: any) {
			const status = Number(error?.status || 500);
			res.status(status).json(
				buildErrorResponse(error?.message || "Failed to preview device user export", status),
			);
		}
	};

	const exportDeviceUsers = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		try {
			const body = (req.body || {}) as Record<string, any>;
			const payload = await buildDeviceUserExportPayload(req, {
				organizationId: gate.organizationId,
				deviceId: String(body.deviceId || body.targetDeviceId || "").trim(),
				scope:
					body.scope === "allHikvisionDevices" ? "allHikvisionDevices" : "currentDevice",
				includeRecords: true,
				includeCards: body.includeCards === true,
				includeFingerprints: body.includeFingerprints === true,
				includeFaces: body.includeFaces === true,
				encryptedBiometricBundle: body.encryptedBiometricBundle === true,
				refreshSourceUsers: body.refreshSourceUsers === true,
				refreshBiometricBundle: body.refreshBiometricBundle === true,
				selection: body.selection,
				status: body.status,
				query: body.query,
				page: Number(body.page || 0) || undefined,
				limit: Number(body.limit || 0) || undefined,
				vendorUserIds: normalizeDeviceUserExportVendorIds(body.vendorUserIds),
			});
			res.status(200).json(buildSuccessResponse("Device users exported", payload, 200));
		} catch (error: any) {
			const status = Number(error?.status || 500);
			res.status(status).json(
				buildErrorResponse(error?.message || "Failed to export device users", status),
			);
		}
	};

	const backfillDeviceUserBiometricMetadata = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		const startedAt = Date.now();
		try {
			const body = (req.body || {}) as Record<string, any>;
			const deviceId = String(req.params.id || body.deviceId || "").trim();
			const execute = body.execute === true;
			const limit = Math.min(Math.max(Number(body.limit || 25), 1), 200);
			const device = await getDeviceForUserSync(gate.organizationId, deviceId);
			if (!device || !isHikvisionDevice(device)) {
				res.status(400).json(
					buildErrorResponse("Select a Hikvision device before biometric metadata backfill", 400),
				);
				return;
			}
			const savedUsers = await loadDeviceUsersForExport(gate.organizationId, device.id);
			const selected = filterDeviceUserExportRows(savedUsers, {
				selection: body.selection || (body.vendorUserIds ? "selectedRows" : "all"),
				status: body.status || "all",
				query: body.query || "",
				page: Number(body.page || 0) || undefined,
				limit,
				vendorUserIds: normalizeDeviceUserExportVendorIds(body.vendorUserIds),
			});
			const candidates = selected.rows.slice(0, limit);
			const results = [];
			for (const row of candidates as any[]) {
				const credentialSummary =
					row.rawPayload?._hrisDeviceMetadata?.credentialSummary ||
					row.vendorMetadata?.credentialSummary ||
					extractHikvisionCredentialSummary(row.rawPayload || {});
				const hasCredential =
					(body.includeFingerprints !== false && Number(credentialSummary.fingerprintCount || 0) > 0) ||
					(body.includeFaces === true && Number(credentialSummary.faceCount || 0) > 0);
				const cachedTemplates = parseCachedDeviceUserBiometricTemplates(row);
				const fingerprintCount = Number(credentialSummary.fingerprintCount || 0);
				const faceCount = Number(credentialSummary.faceCount || 0);
				const cachedFingerprint =
					cachedTemplates.fingerprint ||
					(fingerprintCount > 0 && faceCount === 0 ? cachedTemplates.legacy : null);
				const cachedFace =
					cachedTemplates.face ||
					(faceCount > 0 && fingerprintCount === 0 ? cachedTemplates.legacy : null);
				const requestedFingerprint = body.includeFingerprints !== false && fingerprintCount > 0;
				const requestedFace = body.includeFaces === true && faceCount > 0;
				const requestedModalitiesCached =
					(!requestedFingerprint || Boolean(cachedFingerprint)) &&
					(!requestedFace || Boolean(cachedFace));
				const eventSummary = await summarizeDeviceUserBiometricEvents({
					organizationId: gate.organizationId,
					deviceId: device.id,
					deviceUserId: row.hrisDeviceUser?.id || row.id || null,
					employeeNo: String(row.employeeNo || row.vendorUserId || "").trim(),
				});
				if (!hasCredential) {
					results.push({
						vendorUserId: row.vendorUserId,
						employeeNo: row.employeeNo,
						status: "skipped_no_biometric_count",
						cached: Boolean(cachedFingerprint || cachedFace),
						credentialSummary,
						relatedEvents: eventSummary,
					});
					continue;
				}
				if (requestedModalitiesCached && body.refreshBiometricBundle !== true) {
					results.push({
						vendorUserId: row.vendorUserId,
						employeeNo: row.employeeNo,
						status: "already_cached",
						cached: true,
						fingerprintPlaintextSha256: cachedFingerprint?.plaintextSha256 || null,
						fingerprintCiphertextLength: String(cachedFingerprint?.ciphertext || "").length,
						fingerprintKeySource: cachedFingerprint?.keySource || null,
						facePlaintextSha256: cachedFace?.plaintextSha256 || null,
						faceCiphertextLength: String(cachedFace?.ciphertext || "").length,
						faceKeySource: cachedFace?.keySource || null,
						credentialSummary,
						relatedEvents: eventSummary,
					});
					continue;
				}
				if (!execute) {
					results.push({
						vendorUserId: row.vendorUserId,
						employeeNo: row.employeeNo,
						status: cachedFingerprint || cachedFace ? "would_refresh" : "would_backfill",
						cached: Boolean(cachedFingerprint || cachedFace),
						credentialSummary,
						relatedEvents: eventSummary,
					});
					continue;
				}
				try {
					const biometricExport = await runHikvisionBiometricExportOnVm({
						device,
						organizationId: gate.organizationId,
						vendorUserId: String(row.vendorUserId || row.employeeNo || "").trim(),
						includeFingerprints: body.includeFingerprints !== false,
						includeFaces: body.includeFaces === true,
					});
					const metadata = buildDeviceUserBiometricMetadata(
						biometricExport,
						"hikvision_sdk_biometric_metadata_backfill",
					);
					(metadata.rawPayloadMetadata as any).relatedEnrollmentEvents = eventSummary;
					(metadata.vendorMetadata as any).relatedEnrollmentEventCount = eventSummary.length;
					applyDeviceUserBiometricMetadataToRow(row, metadata);
					const updated = await persistDeviceUserBiometricMetadata({
						organizationId: gate.organizationId,
						deviceId: device.id,
						vendorUserId: String(row.vendorUserId || row.employeeNo || "").trim(),
						row,
					});
					results.push({
						vendorUserId: row.vendorUserId,
						employeeNo: row.employeeNo,
						status: "cached_from_hikvision_sdk",
						deviceUserId: updated?.id || row.hrisDeviceUser?.id || row.id || null,
						fingerprintCount: biometricExport.fingerprintCount,
						faceTemplateSize: biometricExport.faceTemplateSize,
						facePictureSize: biometricExport.facePictureSize,
						fingerprintPlaintextSha256:
							biometricExport.encryptedFingerprint?.plaintextSha256 || null,
						fingerprintCiphertextLength: String(
							biometricExport.encryptedFingerprint?.ciphertext || "",
						).length,
						fingerprintKeySource:
							biometricExport.encryptedFingerprint?.keySource || null,
						facePlaintextSha256: biometricExport.encryptedFace?.plaintextSha256 || null,
						faceCiphertextLength: String(
							biometricExport.encryptedFace?.ciphertext || "",
						).length,
						faceKeySource: biometricExport.encryptedFace?.keySource || null,
						relatedEvents: eventSummary,
					});
				} catch (error: any) {
					results.push({
						vendorUserId: row.vendorUserId,
						employeeNo: row.employeeNo,
						status: "failed",
						error: error?.message || "Biometric metadata backfill failed",
						credentialSummary,
						relatedEvents: eventSummary,
					});
				}
			}
			await invalidateCache.byPattern("cache:device:*").catch(() => undefined);
			const data = {
				execute,
				device: {
					id: device.id,
					name: device.name,
					address: device.address,
					port: device.port,
				},
				selection: selected.selection,
				elapsedMs: Date.now() - startedAt,
				counts: {
					candidates: candidates.length,
					cached: results.filter((row: any) =>
						["cached_from_hikvision_sdk", "already_cached"].includes(row.status),
					).length,
					failed: results.filter((row: any) => row.status === "failed").length,
					skipped: results.filter((row: any) => String(row.status).startsWith("skipped")).length,
				},
				plaintextBiometricExposed: false,
				results,
			};
			res.status(200).json(
				buildSuccessResponse(
					execute
						? "Device user biometric metadata backfill executed"
						: "Device user biometric metadata backfill preview built",
					data,
					200,
				),
			);
		} catch (error: any) {
			const status = Number(error?.status || 500);
			res.status(status).json(
				buildErrorResponse(
					error?.message || "Failed to backfill device user biometric metadata",
					status,
				),
			);
		}
	};

	const getImportPayloadFromRequest = (body: Record<string, any>) => {
		const payload = body.exportFile || body.importFile || body.payload || body;
		return payload && typeof payload === "object" ? payload : null;
	};

	const previewDeviceUserImport = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		try {
			const body = (req.body || {}) as Record<string, any>;
			const payload = getImportPayloadFromRequest(body);
			const targetDeviceId = String(body.targetDeviceId || body.deviceId || "").trim();
			if (!payload || payload.schemaVersion !== DEVICE_USER_EXPORT_SCHEMA_VERSION) {
				res.status(400).json(
					buildErrorResponse("Import file schema is not a supported device-user export", 400),
				);
				return;
			}
			const targetDevice = await getDeviceForUserSync(gate.organizationId, targetDeviceId);
			if (!targetDevice || !isHikvisionDevice(targetDevice)) {
				res.status(400).json(
					buildErrorResponse("Select a Hikvision target device before import preview", 400),
				);
				return;
			}
			const importedUsers = (Array.isArray(payload.devices) ? payload.devices : []).flatMap(
				(device: any) =>
					(Array.isArray(device?.users) ? device.users : []).map((user: any) => ({
						...user,
						sourceDeviceId: device?.device?.id || null,
						sourceDeviceName: device?.device?.name || null,
					})),
			);
			const currentUsers = await loadDeviceUsersForExport(gate.organizationId, targetDevice.id);
			const currentByVendorUserId = new Map(
				currentUsers.map((user: any) => [String(user.vendorUserId || "").trim(), user]),
			);
			const importedEmployeeNos: string[] = Array.from(
				new Set<string>(
					importedUsers
						.map((user: any) => String(user.employeeNo || user.vendorUserId || "").trim())
						.filter(Boolean),
				),
			);
			const employees = importedEmployeeNos.length
				? await prisma.employee.findMany({
						where: {
							organizationId: gate.organizationId,
							isDeleted: false,
							OR: [
								{ employeeId: { in: importedEmployeeNos } },
								{ deviceEmpId: { in: importedEmployeeNos } },
							],
						},
						select: { id: true, employeeId: true, deviceEmpId: true },
					})
				: [];
			const employeeKeys = new Set(
				employees.flatMap((employee) => [
					String(employee.employeeId || "").trim(),
					String(employee.deviceEmpId || "").trim(),
				]),
			);
			const planRows = importedUsers.map((user: any) => {
				const vendorUserId = String(user.vendorUserId || "").trim();
				const current = currentByVendorUserId.get(vendorUserId) as any;
				const employeeNo = String(user.employeeNo || vendorUserId).trim();
				const conflictFields = current
					? (["displayName", "employeeNo", "userType"] as const).filter(
							(field) =>
								String(current?.[field] || "").trim() !==
								String(user?.[field] || "").trim(),
						)
					: [];
				return {
					vendorUserId,
					employeeNo,
					sourceDeviceId: user.sourceDeviceId,
					sourceDeviceName: user.sourceDeviceName,
					action: current ? (conflictFields.length ? "review_conflict" : "match") : "create_preview",
					conflictFields,
					missingEmployee: employeeNo ? !employeeKeys.has(employeeNo) : true,
					currentDeviceUserId: current?.id || null,
					credentialGap: {
						card: false,
						fingerprint: false,
						face: false,
					},
					transferMode:
						user.sourceDeviceId && user.sourceDeviceId !== targetDevice.id
							? "sdkPeerCopy"
							: payload?.biometricBundle?.present
								? "encryptedBundle"
								: "metadataOnly",
				};
			});
			const unsupportedCredentialTypes = Array.from(
				new Set(
					(Array.isArray(payload.devices) ? payload.devices : []).flatMap((device: any) =>
						Object.entries(device?.summary?.credentialTypes || {})
							.filter(([, value]) => String(value).includes("blocked") || String(value).includes("unsupported"))
							.map(([key]) => key),
					),
				),
			);
			const preview = {
				execute: false,
				dryRun: true,
				targetDevice: {
					id: targetDevice.id,
					name: targetDevice.name,
					address: targetDevice.address,
					port: targetDevice.port,
				},
				file: {
					schemaVersion: payload.schemaVersion,
					exportedAt: payload.exportedAt || null,
					sourceDevices: Array.isArray(payload.devices) ? payload.devices.length : 0,
					users: importedUsers.length,
				},
				counts: {
					newUsers: planRows.filter((row: any) => row.action === "create_preview").length,
					matchingUsers: planRows.filter((row: any) => row.action === "match").length,
					conflicts: planRows.filter((row: any) => row.action === "review_conflict").length,
					missingHrisEmployees: planRows.filter((row: any) => row.missingEmployee).length,
				},
				unsupportedCredentialTypes,
				biometricBundle: {
					present: Boolean(payload?.biometricBundle?.present),
					requiredForPortableTemplateImport: Boolean(
						payload?.biometricBundle?.requiredForPortableTemplateImport,
					),
					algorithm: payload?.biometricBundle?.algorithm || null,
					status: payload?.biometricBundle?.status || "not_present",
					unlockable:
						Boolean(payload?.biometricBundle?.present) &&
						importedUsers.some((user: any) =>
							Object.values(parseImportedEncryptedBiometricTemplates(user)).some(Boolean),
						),
					plaintextExposed: false,
					transferModes: Array.from(
						new Set(planRows.map((row: any) => row.transferMode).filter(Boolean)),
					),
				},
				previewToken: buildDeviceUserImportPreviewToken({
					organizationId: gate.organizationId,
					targetDeviceId: targetDevice.id,
					payload,
					planRows,
				}),
				plan: planRows.slice(0, 500),
				executeAvailable: planRows.length > 0,
				executeBlockedReason:
					planRows.length > 0
						? null
						: "Import file contains no users for the selected target.",
				executeRequirements: [
					`confirmation="${DEVICE_USER_IMPORT_CONFIRMATION}"`,
					"previewToken from this preview response",
					"biometricTransferMode=sdkPeerCopy or an encrypted bundle passphrase when importing portable template payloads",
					"additive create/update only",
				],
			};
			res.status(200).json(buildSuccessResponse("Device user import preview built", preview, 200));
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to preview device user import", 500),
			);
		}
	};

	const deviceUserImportRequestError = (message: string, statusCode = 400) =>
		Object.assign(new Error(message), { statusCode });

	const runDeviceUserImportExecuteWork = async (params: {
		req: Request;
		gate: { organizationId: string };
		body: Record<string, any>;
		jobId?: string;
	}) => {
		const { req, gate, body, jobId } = params;
		const payload = getImportPayloadFromRequest(body);
		const targetDeviceId = String(body.targetDeviceId || body.deviceId || "").trim();
		const previewToken = String(body.previewToken || "").trim();
		const biometricTransferMode = String(body.biometricTransferMode || "sdkPeerCopy").trim();
		const passphraseProvided = Boolean(
			String(body.biometricBundlePassphrase || body.encryptionPassphrase || "").trim(),
		);

		if (!payload || payload.schemaVersion !== DEVICE_USER_EXPORT_SCHEMA_VERSION) {
			throw deviceUserImportRequestError(
				"Import file schema is not a supported device-user export",
			);
		}
		const targetDevice = await getDeviceForUserSync(gate.organizationId, targetDeviceId);
		if (!targetDevice || !isHikvisionDevice(targetDevice)) {
			throw deviceUserImportRequestError("Select a Hikvision target device before import execute");
		}

		const importedUsers = (Array.isArray(payload.devices) ? payload.devices : []).flatMap(
			(device: any) =>
				(Array.isArray(device?.users) ? device.users : []).map((user: any) => ({
					...user,
					sourceDeviceId: device?.device?.id || user?.sourceDeviceId || null,
					sourceDeviceName: device?.device?.name || user?.sourceDeviceName || null,
				})),
		);
		const currentUsers = await loadDeviceUsersForExport(gate.organizationId, targetDevice.id);
		const currentByVendorUserId = new Map(
			currentUsers.map((user: any) => [String(user.vendorUserId || "").trim(), user]),
		);
		const planRows = importedUsers.map((user: any) => {
			const vendorUserId = String(user.vendorUserId || "").trim();
			const current = currentByVendorUserId.get(vendorUserId) as any;
			const conflictFields = current
				? (["displayName", "employeeNo", "userType"] as const).filter(
						(field) =>
							String(current?.[field] || "").trim() !== String(user?.[field] || "").trim(),
					)
				: [];
			return {
				vendorUserId,
				employeeNo: String(user.employeeNo || vendorUserId).trim(),
				sourceDeviceId: user.sourceDeviceId || null,
				sourceDeviceName: user.sourceDeviceName || null,
				action: current ? (conflictFields.length ? "review_conflict" : "match") : "create_preview",
				conflictFields,
				currentDeviceUserId: current?.id || null,
				rawUser: user,
			};
		});
		const expectedPreviewToken = buildDeviceUserImportPreviewToken({
			organizationId: gate.organizationId,
			targetDeviceId: targetDevice.id,
			payload,
			planRows,
		});
		if (!previewToken || previewToken !== expectedPreviewToken) {
			throw deviceUserImportRequestError(
				"Import execute requires a fresh previewToken from import preview",
			);
		}
		if (payload?.biometricBundle?.present && !passphraseProvided) {
			throw deviceUserImportRequestError(
				"Encrypted biometric bundle import requires a passphrase for this request",
			);
		}
		if (
			payload?.biometricBundle?.requiredForPortableTemplateImport &&
			biometricTransferMode !== "sdkPeerCopy" &&
			!passphraseProvided
		) {
			throw deviceUserImportRequestError(
				"Portable biometric import requires an encrypted bundle passphrase; use sdkPeerCopy only when the source device is reachable",
			);
		}
		if (!["sdkPeerCopy", "metadataOnly", "encryptedBundle"].includes(biometricTransferMode)) {
			throw deviceUserImportRequestError("Unsupported biometric transfer mode");
		}

		if (jobId) {
			updateDeviceUserPackageImportJob(jobId, {
				targetDeviceId: targetDevice.id,
				targetDeviceName: targetDevice.name || targetDevice.id,
				planned: planRows.length,
				message: `Importing ${planRows.length} device users to ${targetDevice.name || targetDevice.id}`,
			});
		}

		const backupDir = path.join(
			process.cwd(),
			"..",
			".runtime",
			"backups",
			`device-user-import-${new Date().toISOString().replace(/[:.]/g, "-")}`,
		);
		await fs.mkdir(backupDir, { recursive: true });
		await Promise.all([
			writeJsonFile(path.join(backupDir, "target-device-users-before.json"), currentUsers),
			writeJsonFile(
				path.join(backupDir, "import-package-manifest.json"),
				sanitizeDeviceUserImportPayloadForBackup(payload),
			),
			writeJsonFile(path.join(backupDir, "plan.json"), {
				targetDeviceId: targetDevice.id,
				previewToken,
				biometricTransferMode,
				rows: planRows.map(
					({
						rawUser: _rawUser,
						...row
					}: { rawUser?: unknown } & Record<string, any>) => row,
				),
			}),
		]);

		const devices = await prisma.device.findMany({
			where: {
				organizationId: gate.organizationId,
				isDeleted: false,
				id: {
					in: Array.from(
						new Set(
							planRows
								.map((row: any) => row.sourceDeviceId)
								.concat(targetDevice.id)
								.filter(Boolean),
						),
					),
				},
			},
		});
		const deviceById = new Map(devices.map((device) => [device.id, device]));
		const results = [];
		for (const row of planRows) {
			if (!row.vendorUserId) {
				results.push(
					buildDeviceUserImportResultRow(row, {
						status: "skipped",
						error: "Missing vendor user ID",
					}),
				);
			} else if (row.conflictFields.length > 0) {
				results.push(
					buildDeviceUserImportResultRow(row, {
						status: "skipped_conflict",
						error: "Conflict requires manual review before additive import",
					}),
				);
			} else if (
				biometricTransferMode === "sdkPeerCopy" &&
				row.sourceDeviceId &&
				row.sourceDeviceId !== targetDevice.id
			) {
				const sourceDevice = deviceById.get(row.sourceDeviceId);
				if (!sourceDevice || !isHikvisionDevice(sourceDevice)) {
					results.push(
						buildDeviceUserImportResultRow(row, {
							status: "failed",
							error: "Source Hikvision device was not found for SDK peer copy",
						}),
					);
				} else {
					try {
						const copyData = await withDeviceUserImportTimeout(
							copyHikvisionUserToPeerWithRetry({
								req,
								organizationId: gate.organizationId,
								sourceDevice,
								targetDevice,
								employeeNo: row.vendorUserId,
								includeFingerprints: true,
								includeFaceRecognition: true,
							}),
							DEVICE_USER_IMPORT_ROW_TIMEOUT_MS,
							`Timed out copying device user ${row.vendorUserId} after ${DEVICE_USER_IMPORT_ROW_TIMEOUT_MS}ms`,
						);
						results.push(
							buildDeviceUserImportResultRow(row, {
								status: "imported",
								method: "sdkPeerCopy",
								vmCopy: copyData.vmCopy,
								targetSyncSummary: copyData.targetSyncSummary,
								targetDeviceUser: summarizeDeviceUserImportTarget(copyData.targetDeviceUser),
							}),
						);
					} catch (error: any) {
						const delayedCopy = await withDeviceUserImportTimeout(
							waitForDelayedHikvisionPeerCopy({
								req,
								organizationId: gate.organizationId,
								targetDevice,
								employeeNo: row.vendorUserId,
							}),
							Math.min(HIKVISION_PEER_COPY_COMPLETION_WAIT_MS + 10000, DEVICE_USER_IMPORT_ROW_TIMEOUT_MS),
							`Timed out waiting for target device ${targetDevice.name || targetDevice.id} to report copied user ${row.vendorUserId}`,
						).catch(() => null);
						if ((delayedCopy as any)?.targetDeviceUser?.id) {
							results.push(
								buildDeviceUserImportResultRow(row, {
									status: "imported",
									method: "sdkPeerCopy",
									vmCopy: {
										strategy: "delayed_target_reread",
										warning: error?.message || "SDK peer copy completed after wrapper response",
										attempts: (delayedCopy as any).attempts,
										waitedMs: (delayedCopy as any).waitedMs,
									},
									targetSyncSummary: (delayedCopy as any).targetSyncSummary,
									targetDeviceUser: summarizeDeviceUserImportTarget(
										(delayedCopy as any).targetDeviceUser,
									),
								}),
							);
						} else {
							results.push(
								buildDeviceUserImportResultRow(row, {
									status: "failed",
									method: "sdkPeerCopy",
									error: error?.message || "SDK peer copy failed",
									targetSyncSummary: (delayedCopy as any)?.targetSyncSummary || null,
								}),
							);
						}
					}
				}
			} else if (biometricTransferMode === "encryptedBundle") {
				const encryptedTemplates = parseImportedEncryptedBiometricTemplates(row.rawUser);
				const templatesToDecrypt = [
					encryptedTemplates.fingerprint,
					encryptedTemplates.face,
					...(!encryptedTemplates.fingerprint && !encryptedTemplates.face
						? [encryptedTemplates.legacy]
						: []),
				].filter(Boolean);
				if (!templatesToDecrypt.length) {
					results.push(
						buildDeviceUserImportResultRow(row, {
							status: "failed",
							method: "encryptedBundle",
							error: "No encrypted biometric template value was found on this import row",
						}),
					);
				} else {
					try {
						const decryptedParts = templatesToDecrypt.map((encrypted) => ({
							encrypted,
							payload: decryptDeviceUserBiometricPayload({
								organizationId: gate.organizationId,
								deviceId: row.sourceDeviceId || targetDevice.id,
								encrypted,
							}),
						}));
						const decrypted = decryptedParts.reduce(
							(merged, part) => ({
								...merged,
								...part.payload,
								fingerprints: [
									...(Array.isArray(merged.fingerprints) ? merged.fingerprints : []),
									...(Array.isArray(part.payload?.fingerprints)
										? part.payload.fingerprints
										: []),
								],
							}),
							{} as Record<string, any>,
						);
						const writeResult = await writeDecryptedBiometricBundleToHikvisionDevice({
							req,
							targetDevice,
							employeeNo: row.employeeNo || row.vendorUserId,
							decrypted,
						});
						results.push(
							buildDeviceUserImportResultRow(row, {
								status: writeResult.fingerprintWriteCount > 0 ? "imported" : "decrypted_bundle_ready",
								method: "encryptedBundle",
								error:
									writeResult.fingerprintWriteCount > 0
										? null
										: "Encrypted biometric bundle decrypted successfully, but no writable fingerprint template was present.",
								biometricBundle: {
									fingerprintCount: Array.isArray(decrypted?.fingerprints)
										? decrypted.fingerprints.length
										: 0,
									faceTemplatePresent: Boolean(decrypted?.faceTemplate),
									facePicturePresent: Boolean(decrypted?.facePicture),
									plaintextSha256: decryptedParts.map(
										(part) => part.encrypted.plaintextSha256 || null,
									),
									writeResult,
								},
							}),
						);
					} catch (error: any) {
						results.push(
							buildDeviceUserImportResultRow(row, {
								status: "failed",
								method: "encryptedBundle",
								error:
									error?.message ||
									"Encrypted biometric bundle could not be decrypted with the configured key",
							}),
						);
					}
				}
			} else {
				results.push(
					buildDeviceUserImportResultRow(row, {
						status: row.currentDeviceUserId ? "matched_metadata_only" : "skipped_no_source_copy",
						method: "metadataOnly",
						error: row.currentDeviceUserId
							? null
							: "No encrypted bundle execute path is implemented for offline user creation yet; use SDK peer copy while source device is reachable.",
					}),
				);
			}

			if (jobId) {
				const imported = results.filter((item: any) => item.status === "imported").length;
				const failed = results.filter((item: any) => item.status === "failed").length;
				updateDeviceUserPackageImportJob(jobId, {
					imported,
					failed,
					skipped: results.length - imported - failed,
					message: `Processed ${results.length} of ${planRows.length} device users`,
					results,
				});
			}
		}

		const targetAfter = await loadDeviceUsersForExport(gate.organizationId, targetDevice.id);
		await writeJsonFile(path.join(backupDir, "target-device-users-after.json"), targetAfter);
		const imported = results.filter((row: any) => row.status === "imported").length;
		const failed = results.filter((row: any) => row.status === "failed").length;
		const skipped = results.length - imported - failed;

		logActivity(req, {
			userId: String((req as any).userId || "unknown"),
			action: "DEVICE_USER_IMPORT_EXECUTE",
			description: `Imported ${imported} device users to ${targetDevice.name || targetDevice.id}`,
			page: { url: req.originalUrl, title: "Device Users" },
		});

		const message =
			failed > 0 && imported === 0
				? "Device-user import could not write target users"
				: "Device-user import executed";
		return {
			message,
			data: {
				mode: jobId ? "job" : "executed",
				jobId: jobId || null,
				targetDevice: {
					id: targetDevice.id,
					name: targetDevice.name,
					address: targetDevice.address,
					port: targetDevice.port,
				},
				backupDir,
				biometricTransferMode,
				plaintextBiometricExposed: false,
				counts: {
					planned: planRows.length,
					imported,
					failed,
					skipped,
					targetUsersAfter: targetAfter.length,
				},
				results,
			},
		};
	};

	const executeDeviceUserImport = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		const body = (req.body || {}) as Record<string, any>;
		if (body.execute !== true || body.confirmation !== DEVICE_USER_IMPORT_CONFIRMATION) {
			res.status(400).json(
				buildErrorResponse(
					`Import execute requires execute=true and confirmation="${DEVICE_USER_IMPORT_CONFIRMATION}"`,
					400,
				),
			);
			return;
		}

		const runAsJob = body.runAsJob === true || body.jobMode === "background" || body.async === true;
		if (runAsJob) {
			cleanupDeviceUserPackageImportJobs();
			const jobId = randomUUID();
			const job: DeviceUserPackageImportJob = {
				jobId,
				status: "processing",
				organizationId: gate.organizationId,
				targetDeviceId: String(body.targetDeviceId || body.deviceId || "").trim() || null,
				planned: 0,
				imported: 0,
				failed: 0,
				skipped: 0,
				message: "Device-user import job queued",
				plaintextBiometricExposed: false,
				results: [],
				startedAt: new Date(),
			};
			deviceUserPackageImportJobs.set(jobId, job);
			persistDeviceUserPackageImportJob(job);
			setImmediate(async () => {
				try {
					const result = await runDeviceUserImportExecuteWork({ req, gate, body, jobId });
					const terminalStatus =
						result.data.counts.failed > 0 && result.data.counts.imported === 0
							? "failed"
							: "completed";
					updateDeviceUserPackageImportJob(jobId, {
						status: terminalStatus,
						message: result.message,
						backupDir: result.data.backupDir,
						planned: result.data.counts.planned,
						imported: result.data.counts.imported,
						failed: result.data.counts.failed,
						skipped: result.data.counts.skipped,
						targetDeviceId: result.data.targetDevice.id,
						targetDeviceName: result.data.targetDevice.name || result.data.targetDevice.id,
						results: result.data.results,
						completedAt: new Date(),
					});
				} catch (error: any) {
					updateDeviceUserPackageImportJob(jobId, {
						status: "failed",
						message: error?.message || "Device-user import job failed",
						error: error?.message || "Device-user import job failed",
						failed: 1,
						completedAt: new Date(),
					});
					deviceLogger.error(`Device-user import job ${jobId} failed: ${error}`);
				}
			});
			res.status(202).json(
				buildSuccessResponse(
					"Device-user import job accepted",
					{
						mode: "job",
						jobId,
						status: "processing",
						pollUrl: `/api/device/users/import/jobs/${jobId}`,
						plaintextBiometricExposed: false,
						message: "Device-user import is running in the background.",
					},
					202,
				),
			);
			return;
		}

		try {
			const result = await runDeviceUserImportExecuteWork({ req, gate, body });
			res.status(200).json(buildSuccessResponse(result.message, result.data, 200));
		} catch (error: any) {
			res.status(error?.statusCode || 500).json(
				buildErrorResponse(
					error?.message || "Failed to execute device-user import",
					error?.statusCode || 500,
				),
			);
		}
	};

	const getDeviceUserImportJob = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		cleanupDeviceUserPackageImportJobs();
		const jobId = String(req.params.jobId || "").trim();
		let job = deviceUserPackageImportJobs.get(jobId) || readDeviceUserPackageImportJob(jobId);
		if (job && !deviceUserPackageImportJobs.has(jobId) && job.status === "processing") {
			job = {
				...job,
				status: "failed",
				message: "Device-user import job was interrupted before completion; rerun from preview.",
				error: "interrupted_by_api_restart",
				failed: Math.max(1, job.failed || 0),
				completedAt: new Date(),
			};
			persistDeviceUserPackageImportJob(job);
		}
		if (!job || job.organizationId !== gate.organizationId) {
			res.status(404).json(buildErrorResponse("Device-user import job was not found", 404));
			return;
		}
		res.status(200).json(
			buildSuccessResponse(
				"Device-user import job retrieved",
				{
					...job,
					plaintextBiometricExposed: false,
				},
				200,
			),
		);
	};

	const reconcileBiometricSync = async (req: Request, res: Response, _next: NextFunction) => {
		let reconcileRunId: string | null = null;
		let reconcileRunOrganizationId: string | null = null;
		let reconcileRunDeviceId: string | null = null;
		let reconcileRunRequestSummary: Record<string, any> | null = null;
		try {
			const admin = assertDeviceUserAdmin(req, res);
			if (!admin) return;

			const body = (req.body || {}) as Record<string, any>;
			const execute = body.execute === true;
			const sourceDeviceId = String(body.sourceDeviceId || "").trim();
			const employeeNo = String(body.employeeNo || body.vendorUserId || "").trim();
			const cardNo = String(body.cardNo || "").trim();
			const eventKind = String(body.eventKind || "biometric_reconcile").trim();
			const minor = String(body.minor || "").trim();
			const source = String(body.source || "EN_HCNETSDK_ALARM").trim();
			const sdkTime = String(body.sdkTime || "").trim() || null;
			const fingerprintSummary =
				body.fingerprintSummary && typeof body.fingerprintSummary === "object"
					? body.fingerprintSummary
					: {};
			const allowsSourceWideRefresh =
				!employeeNo &&
				(eventKind === "biometric_operation_sync" ||
					minor.toUpperCase().startsWith("OBSERVED_OPERATION_MINOR_") ||
					String(body.status || "")
						.trim()
						.toLowerCase() === "mirrored");

			if (!sourceDeviceId || (!employeeNo && !allowsSourceWideRefresh)) {
				res.status(400).json(
					buildErrorResponse(
						"sourceDeviceId is required, and employeeNo is required unless this is a source-wide sync reconcile",
						400,
					),
				);
				return;
			}

			const sourceDevice = await prisma.device.findFirst({
				where: {
					id: sourceDeviceId,
					organizationId: String(admin.organizationId),
					isDeleted: false,
				},
				select: { id: true, name: true, address: true, port: true, config: true },
			});
			if (!sourceDevice) {
				res.status(404).json(buildErrorResponse("Source device not found", 404));
				return;
			}

			const peerDeviceIds = Array.isArray(body.peerDeviceIds)
				? body.peerDeviceIds.map((id) => String(id).trim()).filter(Boolean)
				: [];
			const peerDevices = await prisma.device.findMany({
				where: {
					organizationId: String(admin.organizationId),
					isDeleted: false,
					NOT: { id: sourceDevice.id },
					...(peerDeviceIds.length ? { id: { in: peerDeviceIds } } : {}),
				},
				select: { id: true, name: true, address: true, port: true, config: true },
			});
			const biometricPeers = peerDevices.filter((device) => isHikvisionDevice(device));

			const employee = employeeNo
				? await prisma.employee.findFirst({
						where: {
							organizationId: String(admin.organizationId),
							isDeleted: false,
							OR: [{ employeeId: employeeNo }, { deviceEmpId: employeeNo }],
						},
						select: { id: true, employeeId: true, deviceEmpId: true },
					})
				: null;

			const biometricSyncPayload = {
				source,
				eventKind,
				minor,
				sourceDeviceId: sourceDevice.id,
				cardNo: cardNo || null,
				fingerprintTemplateCount: Number(fingerprintSummary.templateCount || 0),
				rawFingerprintTemplateStored: false,
				reconciledAt: new Date().toISOString(),
			};

			const targetDevices = [sourceDevice, ...biometricPeers];
			const plannedChanges = allowsSourceWideRefresh
				? targetDevices.map((device) => ({
						deviceId: device.id,
						deviceName: device.name,
						scope: "all_source_users",
						wouldPersistDeviceUser: true,
						rawFingerprintTemplateStored: false,
					}))
				: targetDevices.map((device) => ({
						deviceId: device.id,
						deviceName: device.name,
						vendorUserId: employeeNo,
						employeeId: employee?.id || null,
						status: employee?.id ? "ACTIVE" : "UNMATCHED",
						wouldPersistDeviceUser: true,
						rawFingerprintTemplateStored: false,
					}));

			if (!execute) {
				res.status(200).json(
					buildSuccessResponse(
						"Biometric sync reconcile dry-run completed",
						{
							execute: false,
							sourceDevice,
							employee,
							plannedChanges,
							biometricSyncPayload,
						},
						200,
					),
				);
				return;
			}

			reconcileRunOrganizationId = String(admin.organizationId);
			reconcileRunDeviceId = sourceDevice.id;
			reconcileRunRequestSummary = {
				kind: "biometric_lifecycle_reconcile",
				sourceDeviceId: sourceDevice.id,
				sourceDeviceName: sourceDevice.name,
				eventKind,
				minor,
				source,
				employeeNo: employeeNo || null,
				cardNo: cardNo || null,
				sdkTime,
				allowsSourceWideRefresh,
				peerDeviceIds: biometricPeers.map((device) => device.id),
				plannedChanges,
				fingerprintSummary,
				rawFingerprintTemplateStored: false,
			};
			const reconcileRun = await createBiometricLifecycleSyncRun({
				organizationId: reconcileRunOrganizationId,
				deviceId: reconcileRunDeviceId,
				startedByUserId: (req as any).userId || null,
				source,
				eventKind,
				minor,
				employeeNo,
				cardNo,
				sourceWideRefresh: allowsSourceWideRefresh,
				targetDeviceCount: targetDevices.length,
			});
			reconcileRunId = reconcileRun?.id || null;

			const runBiometricLifecycleReconcileWork = async () => {
				const persisted = [];
				const refreshResults: Array<Record<string, any>> = [];
				let sourceLifecycleBackfillResult: Record<string, any> | null = null;
				let derivedLifecycleEvent: Record<string, any> | null = null;
				for (const device of targetDevices) {
					try {
						const { rawUsers, candidates } = await loadHikvisionDeviceUserSnapshot(
							req,
							device,
						);
						const result = await upsertDeviceUsersFromCandidates({
							organizationId: String(admin.organizationId),
							deviceId: device.id,
							candidates,
							source: "hikvision",
						});
						refreshResults.push({
							deviceId: device.id,
							deviceName: device.name,
							totalSourceRecords: rawUsers.length,
							importableRecords: candidates.length,
							...result,
						});

						if (allowsSourceWideRefresh && device.id === sourceDevice.id) {
							const sourceDeviceUsers = await prisma.deviceUser.findMany({
								where: {
									organizationId: String(admin.organizationId),
									deviceId: device.id,
									vendorUserId: {
										in: candidates.map((candidate) => candidate.vendorUserId),
									},
								},
								select: {
									id: true,
									vendorUserId: true,
									employeeId: true,
									employeeNo: true,
									rawPayload: true,
									lastSyncedAt: true,
								},
							});
							sourceLifecycleBackfillResult = await persistDeviceUserLifecycleBackfill({
								organizationId: String(admin.organizationId),
								sourceDevice,
								deviceUsers: sourceDeviceUsers,
								source,
								reason: eventKind,
								execute: true,
								sdkTime,
								minor: minor || "OBSERVED_OPERATION_SYNC",
							});
						}

						if (!allowsSourceWideRefresh && employeeNo) {
							const matchedCandidate = candidates.find(
								(candidate) => candidate.vendorUserId === employeeNo,
							);
							const existing = await prisma.deviceUser.findUnique({
								where: {
									organizationId_deviceId_vendorUserId: {
										organizationId: String(admin.organizationId),
										deviceId: device.id,
										vendorUserId: employeeNo,
									},
								},
								select: {
									id: true,
									rawPayload: true,
									employeeId: true,
									status: true,
									lastSyncedAt: true,
								},
							});
							if (existing) {
								const nextRawPayload = {
									...((existing.rawPayload as any) || {}),
									biometricSync: biometricSyncPayload,
									...(matchedCandidate?.rawPayload &&
									typeof matchedCandidate.rawPayload === "object"
										? {
												_hrisDeviceMetadata: (
													matchedCandidate.rawPayload as any
												)._hrisDeviceMetadata,
											}
										: {}),
								};
								const record = await prisma.deviceUser.update({
									where: { id: existing.id },
									data: {
										rawPayload: nextRawPayload,
										lastSyncedAt: new Date(),
									},
									select: {
										id: true,
										deviceId: true,
										vendorUserId: true,
										employeeId: true,
										status: true,
										lastSyncedAt: true,
										rawPayload: true,
									},
								});
								persisted.push(record);
							}
						}
					} catch (error: any) {
						refreshResults.push({
							deviceId: device.id,
							deviceName: device.name,
							error: error?.message || "device_user_refresh_failed",
						});
					}
				}

				if (!allowsSourceWideRefresh && employeeNo) {
					const sourceDeviceUser = await prisma.deviceUser.findUnique({
						where: {
							organizationId_deviceId_vendorUserId: {
								organizationId: String(admin.organizationId),
								deviceId: sourceDevice.id,
								vendorUserId: employeeNo,
							},
						},
						select: { id: true, employeeId: true, rawPayload: true },
					});
					derivedLifecycleEvent = await persistDerivedBiometricLifecycleEvent({
						req,
						organizationId: String(admin.organizationId),
						sourceDevice,
						employeeNo,
						eventKind,
						minor,
						source,
						sdkTime,
						fingerprintSummary,
						deviceUser: sourceDeviceUser,
					});
				}

				const refreshUpsertCount = refreshResults.reduce(
					(total, item) => total + Number(item.created || 0) + Number(item.updated || 0),
					0,
				);
				const refreshFailureCount = refreshResults.filter((item) => item.error).length;
				const refreshSkippedCount = refreshResults.reduce(
					(total, item) =>
						total +
						Math.max(
							Number(item.totalSourceRecords || 0) - Number(item.importableRecords || 0),
							0,
						),
					0,
				);
				const lifecycleCreatedCount =
					Number(sourceLifecycleBackfillResult?.createdEvents?.length || 0) +
					(derivedLifecycleEvent ? 1 : 0);
				await finalizeBiometricLifecycleSyncRun(reconcileRunId, {
					status: "COMPLETED",
					totalSourceRecords: allowsSourceWideRefresh
						? Number(sourceLifecycleBackfillResult?.totalDeviceUsers || 0)
						: 1,
					importableRecords: allowsSourceWideRefresh
						? Number(sourceLifecycleBackfillResult?.plannedEvents?.length || 0)
						: 1,
					savedRecords: refreshUpsertCount + persisted.length + lifecycleCreatedCount,
					skippedRecords: refreshSkippedCount,
					failedRecords: refreshFailureCount,
					missingRecords: 0,
					skipSummary: {
						refreshSkippedCount,
						refreshFailureCount,
					},
					rawSummary: {
						...(reconcileRunRequestSummary || {}),
						refreshResults,
						persistedCount: persisted.length,
						derivedLifecycleEventId: derivedLifecycleEvent?.id || null,
						sourceLifecycleBackfillResult,
						jobMode: "background",
					},
					completedAt: new Date(),
				});

				logActivity(req, {
					userId: (req as any).userId || "hikvision-biometric-service",
					action: "HIKVISION_BIOMETRIC_RECONCILE",
					description: allowsSourceWideRefresh
						? `Reconciled full Hikvision device-user truth from device ${sourceDevice.name}`
						: `Reconciled biometric metadata for employee ${employeeNo} from device ${sourceDevice.name}`,
					page: {
						url: req.originalUrl,
						title: "Hikvision Biometric Sync",
					},
				});

				return {
					execute: true,
					sourceDevice,
					employee,
					persisted,
					refreshResults,
					sourceLifecycleBackfillResult,
					derivedLifecycleEvent,
					rawFingerprintTemplateStored: false,
				};
			};

			const runPayload = {
				runId: reconcileRunId,
				jobId: reconcileRunId,
				status: "PROCESSING",
				sourceDevice,
				employee,
				plannedChanges,
				rawFingerprintTemplateStored: false,
			};
			const runSynchronously =
				body.synchronous === true || body.wait === true || body.inline === true;
			if (!runSynchronously) {
				setImmediate(() => {
					runBiometricLifecycleReconcileWork().catch(async (error: any) => {
						await finalizeBiometricLifecycleSyncRun(reconcileRunId, {
							status: "FAILED",
							failedRecords: 1,
							failureSummary: {
								message: error?.message || "Failed to reconcile biometric sync",
							},
							rawSummary: reconcileRunRequestSummary
								? {
										...reconcileRunRequestSummary,
										failed: true,
										jobMode: "background",
									}
								: undefined,
							completedAt: new Date(),
						}).catch(() => undefined);
						deviceLogger.error(`Biometric sync reconcile job failed: ${error}`);
					});
				});
				res.status(202).json(
					buildSuccessResponse("Biometric sync reconcile job accepted", runPayload, 202),
				);
				return;
			}

			const result = await runBiometricLifecycleReconcileWork();
			res.status(200).json(
				buildSuccessResponse("Biometric sync reconcile persisted", result, 200),
			);
		} catch (error: any) {
			await finalizeBiometricLifecycleSyncRun(reconcileRunId, {
				status: "FAILED",
				failedRecords: 1,
				failureSummary: {
					message: error?.message || "Failed to reconcile biometric sync",
				},
				rawSummary: reconcileRunRequestSummary
					? {
							...reconcileRunRequestSummary,
							failed: true,
						}
					: undefined,
				completedAt: new Date(),
			}).catch(() => undefined);
			deviceLogger.error(`Biometric sync reconcile failed: ${error}`);
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to reconcile biometric sync", 500),
			);
		}
	};

	const loadHikvisionSdkMergePlan = async (params: {
		req: Request;
		organizationId: string;
		deviceIds: string[];
	}) => {
		const devices = await prisma.device.findMany({
			where: {
				organizationId: params.organizationId,
				isDeleted: false,
				id: { in: params.deviceIds },
			},
			select: {
				id: true,
				name: true,
				address: true,
				port: true,
				protocol: true,
				config: true,
			},
		});
		if (devices.length !== params.deviceIds.length) {
			throw Object.assign(new Error("One or more selected devices were not found"), {
				statusCode: 404,
			});
		}
		if (devices.some((device) => !isHikvisionDevice(device))) {
			throw Object.assign(new Error("All selected devices must be Hikvision devices"), {
				statusCode: 400,
			});
		}

		const records: DeviceUserMergeRecord[] = [];
		const errors: Array<{ deviceId: string; deviceName: string; error: string }> = [];
		for (const device of devices) {
			try {
				const { candidates } = await loadHikvisionDeviceUserSnapshot(params.req, device);
				const employees = await loadEmployeesForDeviceUserCandidates(
					params.organizationId,
					candidates,
				);
				const vendorUserIds = candidates
					.map((candidate) => candidate.vendorUserId)
					.filter(Boolean);
				const savedRows = vendorUserIds.length
					? await (prisma as any).deviceUser.findMany({
							where: {
								organizationId: params.organizationId,
								deviceId: device.id,
								vendorUserId: { in: vendorUserIds },
							},
							select: {
								vendorUserId: true,
								employeeId: true,
								status: true,
								rawPayload: true,
							},
						})
					: [];
				const savedByVendorId = new Map<string, any>(
					savedRows.map((row: any) => [String(row.vendorUserId), row] as [string, any]),
				);
				for (const candidate of candidates) {
					const saved = savedByVendorId.get(candidate.vendorUserId);
					const decision = resolveDeviceUserLinkDecision(candidate, employees);
					const employeeId = saved?.employeeId || decision.employeeId || null;
					records.push({
						deviceId: device.id,
						deviceName: device.name || device.address || device.id,
						vendorUserId: candidate.vendorUserId,
						employeeNo: candidate.employeeNo,
						employeeId,
						displayName: candidate.displayName,
						status: saved?.status || decision.status,
						validFrom: candidate.validFrom,
						validTo: candidate.validTo,
						doorRight: candidate.doorRight,
						accessPlan: candidate.accessPlan,
						rawPayload: candidate.rawPayload,
						manualLink: Boolean(
							saved?.employeeId ||
							saved?.rawPayload?.hrisSync?.matchReason === "manual_existing",
						),
					});
				}
			} catch (error: any) {
				errors.push({
					deviceId: device.id,
					deviceName: device.name || device.address || device.id,
					error: error?.message || "SDK user read failed",
				});
			}
		}
		const plan: any = buildDeviceUserMergePlan({
			records,
			deviceIds: params.deviceIds as string[],
		});
		return {
			...plan,
			errors,
			sdkErrors: errors,
			unreachableDevices: errors.map((error) => ({
				deviceId: error.deviceId,
				deviceName: error.deviceName,
				error: error.error,
			})),
			devices: devices.map((device) => ({
				id: device.id,
				name: device.name,
				address: device.address,
				port: device.port,
			})),
		};
	};

	const planHikvisionSdkUserMerge = async (req: Request, res: Response, _next: NextFunction) => {
		const admin = assertDeviceUserAdmin(req, res);
		if (!admin) return;
		try {
			const deviceIds: string[] = Array.from(
				new Set(
					Array.isArray(req.body?.deviceIds)
						? req.body.deviceIds
								.map((id: unknown) => String(id || "").trim())
								.filter(Boolean)
						: [],
				),
			) as string[];
			if (deviceIds.length < 2) {
				res.status(400).json(
					buildErrorResponse("Select at least two Hikvision devices", 400),
				);
				return;
			}
			const plan = await loadHikvisionSdkMergePlan({
				req,
				organizationId: String(admin.organizationId),
				deviceIds,
			});
			const planId = randomUUID();
			deviceUserMergePlans.set(planId, {
				organizationId: String(admin.organizationId),
				plan,
				createdAt: new Date(),
				req,
			});
			res.status(200).json(
				buildSuccessResponse("SDK user merge plan ready", { planId, plan }, 200),
			);
		} catch (error: any) {
			res.status(error?.statusCode || 500).json(
				buildErrorResponse(
					error?.message || "Failed to build SDK user merge plan",
					error?.statusCode || 500,
				),
			);
		}
	};

	const applyHikvisionSdkUserMerge = async (req: Request, res: Response, _next: NextFunction) => {
		const admin = assertDeviceUserAdmin(req, res);
		if (!admin) return;
		try {
			const planId = String(req.body?.planId || "").trim();
			const stored = deviceUserMergePlans.get(planId);
			if (!stored || stored.organizationId !== String(admin.organizationId)) {
				res.status(404).json(
					buildErrorResponse(
						"Merge plan not found or expired. Refresh the devices and try again.",
						404,
					),
				);
				return;
			}
			const appliedPlan = applyMergeChoices(stored.plan, {
				choices: req.body?.choices || {},
				applyAll:
					req.body?.applyAll === "A" || req.body?.applyAll === "B"
						? req.body.applyAll
						: undefined,
			});
			if (!appliedPlan.executable) {
				const reason = appliedPlan.ambiguousMatches?.length
					? "Resolve ambiguous SDK user identities before applying the merge"
					: (appliedPlan as any).errors?.length
						? "Resolve unreachable or failed SDK reads before applying the merge"
						: "Resolve every SDK user conflict before applying the merge";
				res.status(409).json(buildErrorResponse(reason, 409));
				return;
			}

			const devices = await prisma.device.findMany({
				where: {
					organizationId: String(admin.organizationId),
					isDeleted: false,
					id: { in: appliedPlan.deviceIds },
				},
				select: {
					id: true,
					name: true,
					address: true,
					port: true,
					protocol: true,
					config: true,
				},
			});
			for (const device of devices) {
				const { candidates } = await loadHikvisionDeviceUserSnapshot(req, device);
				await upsertDeviceUsersFromCandidates({
					organizationId: String(admin.organizationId),
					deviceId: device.id,
					candidates,
					source: "hikvision",
					pruneMissing: false,
				});
			}
			const results: any[] = [];
			for (const user of appliedPlan.users) {
				const selectedConflict = user.conflicts.find((conflict: any) => conflict.choice);
				const sourceDeviceId =
					selectedConflict?.choice === "B"
						? selectedConflict.deviceB.id
						: selectedConflict?.choice === "A"
							? selectedConflict.deviceA.id
							: user.sourceDeviceId;
				const sourceDevice =
					devices.find((device) => device.id === sourceDeviceId) ||
					devices.find((device) => device.id === user.sourceDeviceId);
				if (!sourceDevice) continue;
				const sourceRecord = user.records.find(
					(record) => record.deviceId === sourceDevice.id,
				);
				if (!sourceRecord) continue;
				for (const targetDeviceId of user.targetDeviceIds) {
					if (targetDeviceId === sourceDevice.id) continue;
					const targetDevice = devices.find((device) => device.id === targetDeviceId);
					if (!targetDevice) continue;
					try {
						const copy = await copyHikvisionUserToPeerWithRetry({
							req,
							organizationId: String(admin.organizationId),
							sourceDevice,
							targetDevice,
							employeeNo: sourceRecord.vendorUserId,
							includeFingerprints: true,
							includeFaceRecognition: true,
						});
						results.push({
							userKey: user.key,
							sourceDeviceId: sourceDevice.id,
							targetDeviceId,
							status: "success",
							strategy: copy.vmCopy?.strategy || null,
						});
					} catch (error: any) {
						results.push({
							userKey: user.key,
							sourceDeviceId: sourceDevice.id,
							targetDeviceId,
							status: "error",
							error: error?.message || "SDK user copy failed",
						});
					}
					const targetRow = await (prisma as any).deviceUser.findFirst({
						where: {
							organizationId: String(admin.organizationId),
							deviceId: targetDeviceId,
							vendorUserId: sourceRecord.vendorUserId,
						},
						select: {
							id: true,
							employeeId: true,
							employeeNo: true,
							displayName: true,
							status: true,
							validFrom: true,
							validTo: true,
							doorRight: true,
							accessPlan: true,
							rawPayload: true,
						},
					});
					if (targetRow?.id) {
						const selectedRecordFor = (field: string) => {
							const conflict = user.conflicts.find(
								(item: any) => item.field === field,
							);
							if (conflict?.choice === "KEEP") return null;
							if (!conflict?.choice) return sourceRecord;
							const selectedDeviceId =
								conflict.choice === "B" ? conflict.deviceB.id : conflict.deviceA.id;
							return (
								user.records.find(
									(record: any) => record.deviceId === selectedDeviceId,
								) || sourceRecord
							);
						};
						const employeeRecord = selectedRecordFor("employeeId");
						const nameRecord = selectedRecordFor("displayName");
						const statusRecord = selectedRecordFor("status");
						const validityFromRecord = selectedRecordFor("validFrom");
						const validityToRecord = selectedRecordFor("validTo");
						const accessRecord = selectedRecordFor("doorRight");
						const selectedRawRecord = selectedRecordFor("fingerprint") || sourceRecord;
						const selectedRaw = selectedRawRecord.rawPayload as any;
						const targetCredentials = extractHikvisionCredentialSummary(
							targetRow.rawPayload || {},
						);
						const selectedCredentials = extractHikvisionCredentialSummary(
							selectedRaw || {},
						);
						const preserveBiometricRaw =
							targetCredentials.fingerprintCount >
								selectedCredentials.fingerprintCount ||
							targetCredentials.faceCount > selectedCredentials.faceCount ||
							targetCredentials.cardCount > selectedCredentials.cardCount;
						await (prisma as any).deviceUser.update({
							where: { id: targetRow.id },
							data: {
								employeeId: employeeRecord
									? employeeRecord.employeeId || user.employeeId || null
									: targetRow.employeeId,
								displayName: nameRecord
									? nameRecord.displayName
									: targetRow.displayName,
								status: statusRecord ? statusRecord.status : targetRow.status,
								validFrom: validityFromRecord
									? validityFromRecord.validFrom
										? new Date(validityFromRecord.validFrom)
										: null
									: targetRow.validFrom,
								validTo: validityToRecord
									? validityToRecord.validTo
										? new Date(validityToRecord.validTo)
										: null
									: targetRow.validTo,
								doorRight: accessRecord
									? accessRecord.doorRight
									: targetRow.doorRight,
								accessPlan: accessRecord
									? accessRecord.accessPlan
									: targetRow.accessPlan,
								rawPayload: {
									...(targetRow.rawPayload || {}),
									...(preserveBiometricRaw ? {} : selectedRaw || {}),
									hrisMerge: { reviewed: true, decisions: user.conflicts },
								},
							},
						});
					}
				}
				const decisions = user.conflicts.map((conflict: any) => ({
					field: conflict.field,
					choice: conflict.choice,
					selectedDeviceId:
						conflict.choice === "B" ? conflict.deviceB.id : conflict.deviceA.id,
				}));
				await logAudit(req, {
					userId: String((req as any).userId || "unknown"),
					action: config.AUDIT_LOG.ACTIONS.UPDATE,
					resource: config.AUDIT_LOG.RESOURCES.DEVICE,
					severity: config.AUDIT_LOG.SEVERITY.HIGH,
					entityType: config.AUDIT_LOG.ENTITY_TYPES.DEVICE,
					entityId: user.key,
					changesBefore: null,
					changesAfter: {
						employeeId: user.employeeId,
						sourceDeviceId: sourceDevice.id,
						targetDeviceIds: user.targetDeviceIds,
						decisions,
					},
					description: "Applied reviewed Hikvision device-user merge decisions",
					organizationId: String(admin.organizationId),
				});
			}
			const reread = await loadHikvisionSdkMergePlan({
				req,
				organizationId: String(admin.organizationId),
				deviceIds: appliedPlan.deviceIds,
			});
			logActivity(req, {
				userId: String((req as any).userId || "unknown"),
				action: "HIKVISION_SDK_USER_MERGE",
				description: `Applied Hikvision SDK user merge plan ${planId}`,
				page: { url: req.originalUrl, title: "Hikvision SDK User Merge" },
			});
			await invalidateCache.byPattern("cache:device:*").catch(() => undefined);
			deviceUserMergePlans.delete(planId);
			res.status(200).json(
				buildSuccessResponse(
					"SDK user merge applied",
					{
						planId,
						results,
						reread,
						remainingConflicts: reread.plan.counts.conflicts,
						remainingMissing: reread.plan.counts.missing,
						attention: results.filter((result) => result.status === "error").length,
					},
					200,
				),
			);
		} catch (error: any) {
			res.status(error?.statusCode || 500).json(
				buildErrorResponse(
					error?.message || "Failed to apply SDK user merge",
					error?.statusCode || 500,
				),
			);
		}
	};

	const runHikvisionSdkUserMergeApplyForJob = async (params: {
		req: Request;
		planId: string;
		choices?: Record<string, any>;
		applyAll?: "A" | "B";
	}) => {
		const originalBody = params.req.body;
		let statusCode = 200;
		let responsePayload: any = null;
		const fakeRes = {
			status(code: number) {
				statusCode = code;
				return this;
			},
			json(payload: any) {
				responsePayload = payload;
				return this;
			},
		} as unknown as Response;
		try {
			(params.req as any).body = {
				planId: params.planId,
				choices: params.choices || {},
				applyAll: params.applyAll,
			};
			await applyHikvisionSdkUserMerge(params.req, fakeRes, (() => undefined) as NextFunction);
		} finally {
			(params.req as any).body = originalBody;
		}
		if (statusCode >= 400) {
			const message =
				responsePayload?.errors?.[0]?.message ||
				responsePayload?.message ||
				"Device-user merge job failed.";
			throw Object.assign(new Error(message), { statusCode });
		}
		return responsePayload?.data || responsePayload;
	};

	const processHikvisionSdkUserMergeJob = async (params: {
		jobId: string;
		req: Request;
		organizationId: string;
		planId: string;
		choices?: Record<string, any>;
		applyAll?: "A" | "B";
	}) => {
		const job = deviceUserMergeJobs.get(params.jobId);
		if (!job) return;
		try {
			updateDeviceUserMergeJob(params.jobId, {
				message: "Applying reviewed decisions to the selected devices.",
				processedWrites: Math.max(1, Math.floor(job.totalWrites * 0.15)),
			});
			const result = await runHikvisionSdkUserMergeApplyForJob({
				req: params.req,
				planId: params.planId,
				choices: params.choices,
				applyAll: params.applyAll,
			});
			const results = Array.isArray(result?.results) ? result.results : [];
			const failedWrites = results.filter((item: any) => item.status === "error").length;
			const successfulWrites = Math.max(0, results.length - failedWrites);
			const attention = Number(result?.attention || failedWrites || 0);
			let retryPlanId: string | undefined;
			const retryPlan = result?.reread?.plan || result?.reread;
			if (attention > 0 && retryPlan?.deviceIds?.length) {
				retryPlanId = randomUUID();
				deviceUserMergePlans.set(retryPlanId, {
					organizationId: params.organizationId,
					plan: retryPlan,
					createdAt: new Date(),
					req: params.req,
				});
			}
			updateDeviceUserMergeJob(params.jobId, {
				status: attention > 0 ? "failed" : "completed",
				planId: retryPlanId || params.planId,
				retryPlanId,
				message:
					attention > 0
						? "Merge finished with attention items. Review the failed rows, then retry from the reread plan."
						: "Merge finished and devices were reread.",
				processedWrites: job.totalWrites,
				successfulWrites,
				failedWrites: attention,
				results,
				remainingConflicts: Number(result?.remainingConflicts || 0),
				remainingMissing: Number(result?.remainingMissing || 0),
				attention,
				completedAt: new Date(),
			});
		} catch (error: any) {
			updateDeviceUserMergeJob(params.jobId, {
				status: "failed",
				message: error?.message || "Device-user merge job failed.",
				failedWrites: Math.max(1, job.failedWrites || 0),
				error: error?.message || "Device-user merge job failed.",
				completedAt: new Date(),
			});
		}
	};

	const startHikvisionSdkUserMergeJob = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		const admin = assertDeviceUserAdmin(req, res);
		if (!admin) return;
		try {
			cleanupDeviceUserMergeJobs();
			const planId = String(req.body?.planId || "").trim();
			const stored = deviceUserMergePlans.get(planId);
			if (!stored || stored.organizationId !== String(admin.organizationId)) {
				res.status(404).json(
					buildErrorResponse(
						"Merge plan not found or expired. Refresh the devices and try again.",
						404,
					),
				);
				return;
			}
			const choices = req.body?.choices || {};
			const applyAll =
				req.body?.applyAll === "A" || req.body?.applyAll === "B"
					? req.body.applyAll
					: undefined;
			const appliedPlan = applyMergeChoices(stored.plan, { choices, applyAll });
			if (!appliedPlan.executable) {
				const reason = appliedPlan.ambiguousMatches?.length
					? "Resolve ambiguous SDK user identities before starting the merge job"
					: (appliedPlan as any).errors?.length
						? "Resolve unreachable or failed SDK reads before starting the merge job"
						: "Resolve every SDK user conflict before starting the merge job";
				res.status(409).json(buildErrorResponse(reason, 409));
				return;
			}
			const totalWrites = Math.max(1, Number(appliedPlan.plannedWrites?.length || 0));
			const jobId = randomUUID();
			const job: DeviceUserMergeJob = {
				jobId,
				planId,
				status: "processing",
				organizationId: String(admin.organizationId),
				totalWrites,
				processedWrites: 0,
				successfulWrites: 0,
				failedWrites: 0,
				message:
					"Merge job queued. HRIS will apply reviewed decisions, copy credentials, then reread devices.",
				results: [],
				startedAt: new Date(),
			};
			deviceUserMergeJobs.set(jobId, job);
			processHikvisionSdkUserMergeJob({
				jobId,
				req,
				organizationId: String(admin.organizationId),
				planId,
				choices,
				applyAll,
			}).catch((error: any) => {
				deviceLogger.error(`Hikvision SDK user merge job ${jobId} failed: ${error}`);
				updateDeviceUserMergeJob(jobId, {
					status: "failed",
					message: error?.message || "Device-user merge job failed.",
					failedWrites: 1,
					error: error?.message || "Device-user merge job failed.",
					completedAt: new Date(),
				});
			});
			res.status(202).json(
				buildSuccessResponse("SDK user merge job started", { jobId, progress: job }, 202),
			);
		} catch (error: any) {
			res.status(error?.statusCode || 500).json(
				buildErrorResponse(
					error?.message || "Failed to start SDK user merge job",
					error?.statusCode || 500,
				),
			);
		}
	};

	const getHikvisionSdkUserMergeJob = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		const admin = assertDeviceUserAdmin(req, res);
		if (!admin) return;
		const jobId = String(req.params.jobId || "").trim();
		const job = deviceUserMergeJobs.get(jobId);
		if (!job || job.organizationId !== String(admin.organizationId)) {
			res.status(404).json(
				buildErrorResponse("SDK user merge job not found or expired", 404),
			);
			return;
		}
		res.status(200).json(buildSuccessResponse("SDK user merge job retrieved", job, 200));
	};

	const getHikvisionMergeDevices = async (organizationId: string, requestedIds: unknown) => {
		const ids = Array.isArray(requestedIds)
			? [...new Set(requestedIds.map((id) => String(id || "").trim()).filter(Boolean))]
			: [];
		const devices = await prisma.device.findMany({
			where: {
				organizationId,
				isDeleted: false,
				...(ids.length ? { id: { in: ids } } : {}),
			},
			select: {
				id: true,
				organizationId: true,
				name: true,
				address: true,
				port: true,
				protocol: true,
				config: true,
			},
			orderBy: { createdAt: "asc" },
		});
		const hikvisionDevices = devices.filter((device) => isHikvisionDevice(device));
		if (ids.length && hikvisionDevices.length !== ids.length) {
			throw Object.assign(
				new Error("Every selected device must be a configured Hikvision device"),
				{ statusCode: 400 },
			);
		}
		if (hikvisionDevices.length < 2) {
			throw Object.assign(new Error("Select at least two configured Hikvision devices"), {
				statusCode: 400,
			});
		}
		return hikvisionDevices;
	};

	const buildLiveDeviceUserMergePlan = async (params: {
		req: Request;
		organizationId: string;
		deviceIds?: unknown[];
	}) => {
		const devices = await getHikvisionMergeDevices(params.organizationId, params.deviceIds);
		const records: DeviceUserMergeRecord[] = [];
		for (const device of devices) {
			const snapshot = await loadHikvisionDeviceUserSnapshot(params.req, device);
			const savedRows = await (prisma as any).deviceUser.findMany({
				where: { organizationId: params.organizationId, deviceId: device.id },
				select: { vendorUserId: true, employeeId: true, rawPayload: true },
			});
			const savedByVendor = new Map<string, any>(
				savedRows.map(
					(row: any) => [String(row.vendorUserId || "").trim(), row] as [string, any],
				),
			);
			for (const candidate of snapshot.candidates) {
				const saved = savedByVendor.get(String(candidate.vendorUserId).trim());
				records.push({
					deviceId: device.id,
					deviceName: device.name || device.address,
					vendorUserId: candidate.vendorUserId,
					employeeNo: candidate.employeeNo,
					employeeId: saved?.employeeId || null,
					displayName: candidate.displayName,
					status: candidate.status,
					validFrom: candidate.validFrom,
					validTo: candidate.validTo,
					doorRight: candidate.doorRight,
					accessPlan: candidate.accessPlan,
					rawPayload: candidate.rawPayload,
					manualLink:
						String(saved?.rawPayload?.hrisSync?.matchReason || "") ===
						"manual_existing",
				});
			}
		}
		const plan: any = buildDeviceUserMergePlan({
			records,
			deviceIds: devices.map((device) => device.id),
		});
		const employeeIds = [
			...new Set(plan.users.map((user: any) => user.employeeId).filter(Boolean)),
		];
		const employees = employeeIds.length
			? await prisma.employee.findMany({
					where: {
						organizationId: params.organizationId,
						id: { in: employeeIds as string[] },
						isDeleted: false,
					},
					select: {
						id: true,
						employeeId: true,
						deviceEmpId: true,
						person: { select: { personalInfo: true } },
					},
				})
			: [];
		const employeeById = new Map(employees.map((employee: any) => [employee.id, employee]));
		return {
			...plan,
			devices: devices.map(({ config: _config, ...device }) => device),
			users: plan.users.map((user: any) => ({
				...user,
				employee: employeeById.get(user.employeeId || "") || null,
			})),
		};
	};

	const createDeviceUserMergePlan = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const admin = assertDeviceUserAdmin(req, res);
			if (!admin) return;
			const plan = await buildLiveDeviceUserMergePlan({
				req,
				organizationId: admin.organizationId,
				deviceIds: (req.body as any)?.deviceIds,
			});
			const planId = randomUUID();
			deviceUserMergePlans.set(planId, {
				organizationId: admin.organizationId,
				plan,
				createdAt: new Date(),
				req,
			});
			res.status(200).json(
				buildSuccessResponse("Device-user merge plan ready", { planId, ...plan }, 200),
			);
		} catch (error: any) {
			res.status(error?.statusCode || 500).json(
				buildErrorResponse(
					error?.message || "Failed to build device-user merge plan",
					error?.statusCode || 500,
				),
			);
		}
	};

	const applyDeviceUserMergePlan = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const admin = assertDeviceUserAdmin(req, res);
			if (!admin) return;
			const planId = String((req.body as any)?.planId || "").trim();
			const stored = deviceUserMergePlans.get(planId);
			if (!stored || stored.organizationId !== admin.organizationId) {
				res.status(404).json(buildErrorResponse("Merge plan not found or expired", 404));
				return;
			}
			const reviewed = applyMergeChoices(stored.plan, {
				choices: (req.body as any)?.choices,
				applyAll: (req.body as any)?.applyAll,
			});
			if (!reviewed.executable) {
				res.status(409).json(
					buildErrorResponse(
						"Resolve every merge conflict before applying",
						409,
						reviewed.unresolved.map((item: any) => ({
							field: `${item.key}:${item.field}`,
							message: "Selection required",
						})),
					),
				);
				return;
			}
			const results: any[] = [];
			for (const user of reviewed.users) {
				const source = user.records[0];
				const sourceDevice =
					user.records.find((record) => record.deviceId === user.sourceDeviceId) ||
					source;
				for (const targetDeviceId of user.targetDeviceIds) {
					const existing = await (prisma as any).deviceUser.findFirst({
						where: {
							organizationId: admin.organizationId,
							deviceId: targetDeviceId,
							vendorUserId: source.vendorUserId,
						},
						select: { id: true, employeeId: true, rawPayload: true },
					});
					let copy: any = null;
					if (!existing?.id) {
						const sourceDeviceRow = (stored.plan.devices || []).find(
							(device: any) => device.id === sourceDevice.deviceId,
						);
						const targetDeviceRow = (stored.plan.devices || []).find(
							(device: any) => device.id === targetDeviceId,
						);
						if (sourceDeviceRow && targetDeviceRow) {
							try {
								copy = await copyHikvisionUserToPeerWithRetry({
									req,
									organizationId: admin.organizationId,
									sourceDevice: sourceDeviceRow,
									targetDevice: targetDeviceRow,
									employeeNo: source.vendorUserId,
									includeFingerprints: true,
									includeFaceRecognition: true,
								});
							} catch (error: any) {
								results.push({
									key: user.key,
									targetDeviceId,
									status: "copy_failed",
									error: error?.message || "Target-device copy failed",
								});
								continue;
							}
						}
					}
					const target = await (prisma as any).deviceUser.findFirst({
						where: {
							organizationId: admin.organizationId,
							deviceId: targetDeviceId,
							vendorUserId: source.vendorUserId,
						},
						select: { id: true, employeeId: true, rawPayload: true },
					});
					const data: any = {
						employeeId: target?.employeeId || user.employeeId || null,
						employeeNo: source.employeeNo || source.vendorUserId,
						displayName: source.displayName,
						status: source.status,
						validFrom: source.validFrom ? new Date(source.validFrom) : null,
						validTo: source.validTo ? new Date(source.validTo) : null,
						doorRight: source.doorRight,
						accessPlan: source.accessPlan,
						rawPayload: source.rawPayload,
						lastSyncedAt: new Date(),
					};
					if (target?.id)
						await (prisma as any).deviceUser.update({ where: { id: target.id }, data });
					else
						await (prisma as any).deviceUser.create({
							data: {
								organizationId: admin.organizationId,
								deviceId: targetDeviceId,
								vendorUserId: source.vendorUserId,
								...data,
							},
						});
					results.push({
						key: user.key,
						targetDeviceId,
						status: "applied",
						copyAttempt: copy?.attempt || 0,
					});
				}
				await logAudit(req, {
					userId: (req as any).userId || "unknown",
					action: config.AUDIT_LOG.ACTIONS.UPDATE,
					resource: config.AUDIT_LOG.RESOURCES.DEVICE,
					severity: config.AUDIT_LOG.SEVERITY.HIGH,
					entityType: config.AUDIT_LOG.ENTITY_TYPES.DEVICE,
					entityId: user.key,
					changesBefore: null,
					changesAfter: { merge: user, decisions: user.conflicts },
					description: "Applied reviewed Hikvision device-user union merge",
					organizationId: admin.organizationId,
				});
			}
			const reread = await buildLiveDeviceUserMergePlan({
				req,
				organizationId: admin.organizationId,
				deviceIds: stored.plan.deviceIds,
			});
			deviceUserMergePlans.delete(planId);
			await invalidateCache.byPattern("cache:device:*").catch(() => undefined);
			res.status(200).json(
				buildSuccessResponse(
					"Device-user merge applied",
					{
						planId,
						results,
						reread,
						remainingConflicts: reread.counts.conflicts,
						remainingMissing: reread.counts.missing,
					},
					200,
				),
			);
		} catch (error: any) {
			res.status(error?.statusCode || 500).json(
				buildErrorResponse(
					error?.message || "Failed to apply device-user merge",
					error?.statusCode || 500,
				),
			);
		}
	};

	const executeHikvisionDeviceUserPeerCopy = async (params: {
		req: Request;
		organizationId: string;
		sourceDevice: any;
		targetDevice: any;
		employeeNo: string;
		includeFingerprints: boolean;
		includeFaceRecognition: boolean;
	}) => {
		const sourceDeviceId = String(params.sourceDevice?.id || "").trim();
		const targetDeviceId = String(params.targetDevice?.id || "").trim();
		const employeeNo = String(params.employeeNo || "").trim();
		const timingStartedAt = Date.now();
		const timings: Record<string, number> = {};
		const timePhase = async <T>(name: string, action: () => Promise<T>): Promise<T> => {
			const startedAt = Date.now();
			try {
				return await action();
			} finally {
				timings[name] = Date.now() - startedAt;
			}
		};
		const sourceDeviceUser: any = await timePhase("sourceDeviceUserLookupMs", () =>
			(prisma as any).deviceUser.findUnique({
			where: {
				organizationId_deviceId_vendorUserId: {
					organizationId: params.organizationId,
					deviceId: sourceDeviceId,
					vendorUserId: employeeNo,
				},
			},
			select: {
				id: true,
				vendorUserId: true,
				employeeId: true,
				status: true,
				lastSyncedAt: true,
				rawPayload: true,
			},
			}),
		);
		const existingTargetDeviceUser: any = await timePhase("targetDeviceUserLookupMs", () =>
			(prisma as any).deviceUser.findUnique({
			where: {
				organizationId_deviceId_vendorUserId: {
					organizationId: params.organizationId,
					deviceId: targetDeviceId,
					vendorUserId: employeeNo,
				},
			},
			select: {
				id: true,
				vendorUserId: true,
				employeeId: true,
				status: true,
				lastSyncedAt: true,
				rawPayload: true,
			},
			}),
		);
		const alreadyConverged =
			Boolean(sourceDeviceUser?.id) &&
			!shouldConvergeDeviceUserToPeer(sourceDeviceUser, existingTargetDeviceUser);
		const requiresPhysicalPeerCopy =
			!sourceDeviceUser?.id ||
			!existingTargetDeviceUser?.id ||
			(() => {
				const sourcePhysicalSummary = extractHikvisionCredentialSummary(
					sourceDeviceUser?.rawPayload || {},
				);
				const targetPhysicalSummary = extractHikvisionCredentialSummary(
					existingTargetDeviceUser?.rawPayload || {},
				);
				if (targetPhysicalSummary.cardCount < sourcePhysicalSummary.cardCount) return true;
				if (
					params.includeFingerprints &&
					targetPhysicalSummary.fingerprintCount < sourcePhysicalSummary.fingerprintCount
				) {
					return true;
				}
				return false;
			})();
		const copyResult = alreadyConverged
			? {
					waitSeconds: 0,
					strategy: "noop_already_synced",
					stdout: "",
					stderr: "",
					events: [
						{
							event: "peer_copy_noop_already_synced",
							sourceDeviceId,
							targetDeviceId,
							employeeNo,
						},
					],
				}
			: !requiresPhysicalPeerCopy
				? {
						waitSeconds: 0,
						strategy: "noop_overlay_only",
						stdout: "",
						stderr: "",
						events: [
							{
								event: "peer_copy_noop_overlay_only",
								sourceDeviceId,
								targetDeviceId,
								employeeNo,
							},
						],
					}
				: await timePhase("vmManualCopyMs", () => runHikvisionManualCopyOnVm({
						sourceDevice: params.sourceDevice,
						targetDevice: params.targetDevice,
						sourceDeviceId,
						targetDeviceId,
						employeeNo,
						includeFingerprints: params.includeFingerprints,
						includeFaceRecognition: params.includeFaceRecognition,
					}));
		const { summary: targetSummary } = await timePhase("targetSingleUserRefreshMs", () =>
			syncSingleHikvisionDeviceUserFromSource({
			req: params.req,
			organizationId: params.organizationId,
			device: params.targetDevice,
			employeeNo,
			}),
		);
		await timePhase("peerLinkMirrorMs", () => mirrorDeviceUserLinkToPeer({
			organizationId: params.organizationId,
			sourceDeviceId,
			targetDeviceId,
			vendorUserId: employeeNo,
		}));

		let targetDeviceUser: any = await timePhase("targetDeviceUserVerifyLookupMs", () =>
			(prisma as any).deviceUser.findUnique({
			where: {
				organizationId_deviceId_vendorUserId: {
					organizationId: params.organizationId,
					deviceId: targetDeviceId,
					vendorUserId: employeeNo,
				},
			},
			select: {
				id: true,
				vendorUserId: true,
				employeeId: true,
				status: true,
				lastSyncedAt: true,
				rawPayload: true,
			},
			}),
		);
		if (!targetDeviceUser?.id) {
			throw new Error(
				"Copy completed at the SDK layer, but the target device user did not appear in refreshed HRIS truth",
			);
		}

		const sourceSyntheticFingerprintCount = readStoredHikvisionSyntheticFingerprintCount(
			sourceDeviceUser?.rawPayload || {},
		);
		const sourceSyntheticFaceCount = readStoredHikvisionSyntheticFaceCount(
			sourceDeviceUser?.rawPayload || {},
		);
		const sourceRealCredentialSummary = extractHikvisionCredentialSummary(
			sourceDeviceUser?.rawPayload || {},
		);
		const targetRealCredentialSummary = extractHikvisionCredentialSummary(
			targetDeviceUser?.rawPayload || {},
		);
		if (
			params.includeFingerprints &&
			sourceRealCredentialSummary.fingerprintCount > targetRealCredentialSummary.fingerprintCount
		) {
			const fingerprintEvents = copyResult.events.filter((event) =>
				String(event?.event || "").toLowerCase().includes("fingerprint"),
			);
			deviceLogger.warn(
				`Hikvision peer fingerprint verification mismatch for ${employeeNo}: source=${sourceRealCredentialSummary.fingerprintCount} target=${targetRealCredentialSummary.fingerprintCount} events=${JSON.stringify(
					fingerprintEvents.slice(-12),
				)}`,
			);
			throw new Error(
				`SDK copy returned, but refreshed target truth still shows ${hikvisionDeviceLabel(
					params.targetDevice,
				)} fingerprint count ${targetRealCredentialSummary.fingerprintCount} while ${hikvisionDeviceLabel(
					params.sourceDevice,
				)} has ${sourceRealCredentialSummary.fingerprintCount} for employee ${employeeNo}. Treat this as not copied yet and retry after the target device reports the template.`,
			);
		}
		if (sourceRealCredentialSummary.cardCount > targetRealCredentialSummary.cardCount) {
			throw new Error(
				`SDK copy returned, but refreshed target truth still shows ${hikvisionDeviceLabel(
					params.targetDevice,
				)} card count ${targetRealCredentialSummary.cardCount} while ${hikvisionDeviceLabel(
					params.sourceDevice,
				)} has ${sourceRealCredentialSummary.cardCount} for employee ${employeeNo}. Treat this as not copied yet and retry after the target device reports the card.`,
			);
		}
		const fingerprintSkippedNoTemplates = copyResult.events.some(
			(event) =>
				event?.event === "peer_fingerprint_write_skipped" &&
				String(event?.employeeNo || "").trim() === employeeNo &&
				String(event?.reason || "").trim() === "no_source_templates",
		);
		let syntheticCredentialOverlayApplied: Record<string, any> | null = null;
		if (
			params.includeFingerprints &&
			sourceSyntheticFingerprintCount > 0 &&
			(sourceRealCredentialSummary.fingerprintCount <= 0 || fingerprintSkippedNoTemplates)
		) {
			targetDeviceUser = await updateHikvisionSyntheticFingerprintTally({
				organizationId: params.organizationId,
				deviceId: targetDeviceId,
				vendorUserId: employeeNo,
				fingerprintCount: sourceSyntheticFingerprintCount,
				copiedFromDeviceId: sourceDeviceId,
				copiedFromVendorUserId: employeeNo,
				note: "Copied as dev-only synthetic fingerprint tally because no real source templates were available",
			});
			syntheticCredentialOverlayApplied = {
				...(syntheticCredentialOverlayApplied || {}),
				fingerprintCount: sourceSyntheticFingerprintCount,
				fingerprintReason: "no_real_source_templates",
			};
		}
		if (sourceSyntheticFaceCount > 0) {
			targetDeviceUser = await updateHikvisionSyntheticFaceTally({
				organizationId: params.organizationId,
				deviceId: targetDeviceId,
				vendorUserId: employeeNo,
				faceCount: sourceSyntheticFaceCount,
				copiedFromDeviceId: sourceDeviceId,
				copiedFromVendorUserId: employeeNo,
				note: "Copied as dev-only synthetic face tally for cross-device verification",
			});
			syntheticCredentialOverlayApplied = {
				...(syntheticCredentialOverlayApplied || {}),
				faceCount: sourceSyntheticFaceCount,
				faceReason: "dev_mock_face_overlay",
			};
		}

		return {
			sourceDeviceUser,
			targetDeviceUser,
			targetSyncSummary: targetSummary,
			vmCopy: {
				waitSeconds: copyResult.waitSeconds,
				strategy: copyResult.strategy,
				events: copyResult.events,
			},
			timings: {
				...timings,
				totalMs: Date.now() - timingStartedAt,
			},
			syntheticCredentialOverlayApplied,
		};
	};

	const copyHikvisionUserToPeerWithRetry = async (params: {
		req: Request;
		organizationId: string;
		sourceDevice: any;
		targetDevice: any;
		employeeNo: string;
		includeFingerprints: boolean;
		includeFaceRecognition: boolean;
		retryLimit?: number;
	}) => {
		let lastError: any = null;
		const retryLimit = Math.max(
			1,
			Math.floor(Number(params.retryLimit || HIKVISION_PEER_COPY_RETRY_LIMIT)),
		);
		for (let attempt = 1; attempt <= retryLimit; attempt += 1) {
			try {
				const result = await executeHikvisionDeviceUserPeerCopy(params);
				return {
					...result,
					attempt,
					retried: attempt > 1,
				};
			} catch (error: any) {
				lastError = error;
				if (attempt >= retryLimit) break;
				await sleep(600 * attempt);
			}
		}
		throw lastError || new Error("Hikvision peer copy failed");
	};

	const copyHikvisionDeviceUserToPeer = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		try {
			const admin = assertDeviceUserAdmin(req, res);
			if (!admin) return;

			const sourceDeviceId = String(req.body?.sourceDeviceId || "").trim();
			const targetDeviceId = String(req.body?.targetDeviceId || "").trim();
			const employeeNo = String(req.body?.employeeNo || req.body?.vendorUserId || "").trim();
			const includeFingerprints = req.body?.includeFingerprints !== false;
			const includeFaceRecognition = req.body?.includeFaceRecognition !== false;
			const isDryRun = req.body?.dryRun === true || req.body?.execute === false;
			const requestStartedAt = Date.now();

			if (!sourceDeviceId || !targetDeviceId || !employeeNo) {
				res.status(400).json(
					buildErrorResponse(
						"sourceDeviceId, targetDeviceId, and employeeNo are required",
						400,
					),
				);
				return;
			}
			if (sourceDeviceId === targetDeviceId) {
				res.status(400).json(
					buildErrorResponse("Source and target devices must be different", 400),
				);
				return;
			}

			const devices = await prisma.device.findMany({
				where: {
					organizationId: String(admin.organizationId),
					isDeleted: false,
					id: { in: [sourceDeviceId, targetDeviceId] },
				},
			});
			const sourceDevice = devices.find((device) => device.id === sourceDeviceId);
			const targetDevice = devices.find((device) => device.id === targetDeviceId);
			if (!sourceDevice || !targetDevice) {
				res.status(404).json(
					buildErrorResponse("Source or target device was not found", 404),
				);
				return;
			}
			if (!isHikvisionDevice(sourceDevice) || !isHikvisionDevice(targetDevice)) {
				res.status(400).json(
					buildErrorResponse(
						"Both source and target devices must be Hikvision devices",
						400,
					),
				);
				return;
			}
			if (isDryRun) {
				const sourceDeviceUser = await (prisma as any).deviceUser.findUnique({
					where: {
						organizationId_deviceId_vendorUserId: {
							organizationId: String(admin.organizationId),
							deviceId: sourceDeviceId,
							vendorUserId: employeeNo,
						},
					},
					select: {
						id: true,
						vendorUserId: true,
						employeeId: true,
						status: true,
						lastSyncedAt: true,
						rawPayload: true,
					},
				});
				const targetDeviceUser = await (prisma as any).deviceUser.findUnique({
					where: {
						organizationId_deviceId_vendorUserId: {
							organizationId: String(admin.organizationId),
							deviceId: targetDeviceId,
							vendorUserId: employeeNo,
						},
					},
					select: {
						id: true,
						vendorUserId: true,
						employeeId: true,
						status: true,
						lastSyncedAt: true,
						rawPayload: true,
					},
				});
				const alreadyConverged =
					Boolean(sourceDeviceUser?.id) &&
					!shouldConvergeDeviceUserToPeer(sourceDeviceUser, targetDeviceUser);
				const sourcePhysicalSummary = extractHikvisionCredentialSummary(
					sourceDeviceUser?.rawPayload || {},
				);
				const targetPhysicalSummary = extractHikvisionCredentialSummary(
					targetDeviceUser?.rawPayload || {},
				);
				const requiresPhysicalPeerCopy =
					!sourceDeviceUser?.id ||
					!targetDeviceUser?.id ||
					targetPhysicalSummary.cardCount < sourcePhysicalSummary.cardCount ||
					(includeFingerprints &&
						targetPhysicalSummary.fingerprintCount <
							sourcePhysicalSummary.fingerprintCount);
				const plannedStages = alreadyConverged
					? ["noop_already_synced"]
					: !requiresPhysicalPeerCopy
						? ["noop_overlay_only", "target_single_user_refresh", "peer_link_mirror"]
						: [
								"vm_manual_copy",
								"target_single_user_refresh",
								"peer_link_mirror",
								"credential_verification",
							];
				res.status(200).json(
					buildSuccessResponse(
						"Dry run only; no Hikvision device or HRIS records were changed",
						{
							dryRun: true,
							execute: false,
							sourceDevice: {
								id: sourceDevice.id,
								name: sourceDevice.name,
							},
							targetDevice: {
								id: targetDevice.id,
								name: targetDevice.name,
							},
							employeeNo,
							includeFingerprints,
							includeFaceRecognition,
							alreadyConverged,
							requiresPhysicalPeerCopy,
							plannedStages,
							sourceCredentialSummary: sourcePhysicalSummary,
							targetCredentialSummary: targetPhysicalSummary,
							sourceDeviceUserFound: Boolean(sourceDeviceUser?.id),
							targetDeviceUserFound: Boolean(targetDeviceUser?.id),
							timings: {
								totalMs: Date.now() - requestStartedAt,
							},
						},
						200,
					),
				);
				return;
			}
			const copyData = await copyHikvisionUserToPeerWithRetry({
				req,
				organizationId: String(admin.organizationId),
				sourceDevice,
				targetDevice,
				employeeNo,
				includeFingerprints,
				includeFaceRecognition,
			});

			logActivity(req, {
				userId: String((req as any).userId || "unknown"),
				action: "HIKVISION_DEVICE_USER_COPY",
				description: `Copied Hikvision device user ${employeeNo} from ${sourceDevice.name} to ${targetDevice.name}`,
				page: {
					url: req.originalUrl,
					title: "Device Users",
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					"Hikvision device user copied to peer device",
					{
						sourceDevice: {
							id: sourceDevice.id,
							name: sourceDevice.name,
						},
						targetDevice: {
							id: targetDevice.id,
							name: targetDevice.name,
						},
						employeeNo,
						includeFingerprints,
						includeFaceRecognition,
						vmCopy: copyData.vmCopy,
						retry: {
							attempt: copyData.attempt,
							retried: copyData.retried,
						},
						syntheticCredentialOverlayApplied:
							copyData.syntheticCredentialOverlayApplied,
						targetSyncSummary: copyData.targetSyncSummary,
						targetDeviceUser: copyData.targetDeviceUser,
						timings: {
							...copyData.timings,
							requestTotalMs: Date.now() - requestStartedAt,
						},
					},
					200,
				),
			);
		} catch (error: any) {
			deviceLogger.error(`Hikvision peer copy failed: ${error?.message || error}`);
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to copy Hikvision device user", 500),
			);
		}
	};

	const mockHikvisionFingerprintTally = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		try {
			const admin = assertDeviceUserAdmin(req, res);
			if (!admin) return;

			const deviceId = String(req.body?.deviceId || "").trim();
			const vendorUserId = String(
				req.body?.vendorUserId || req.body?.employeeNo || "",
			).trim();
			const targetDeviceId = String(req.body?.targetDeviceId || "").trim();
			const fingerprintCount = Math.max(
				0,
				Math.min(10, Math.floor(Number(req.body?.fingerprintCount) || 0)),
			);
			if (!deviceId || !vendorUserId) {
				res.status(400).json(
					buildErrorResponse("deviceId and vendorUserId are required", 400),
				);
				return;
			}

			const deviceIds = [deviceId, targetDeviceId].filter(Boolean);
			const devices = await prisma.device.findMany({
				where: {
					organizationId: String(admin.organizationId),
					isDeleted: false,
					id: { in: deviceIds },
				},
			});
			const sourceDevice = devices.find((device) => device.id === deviceId);
			const targetDevice = targetDeviceId
				? devices.find((device) => device.id === targetDeviceId)
				: null;
			if (!sourceDevice) {
				res.status(404).json(buildErrorResponse("Source device was not found", 404));
				return;
			}
			if (!isHikvisionDevice(sourceDevice)) {
				res.status(400).json(buildErrorResponse("Source device must be Hikvision", 400));
				return;
			}
			if (targetDeviceId) {
				if (!targetDevice) {
					res.status(404).json(buildErrorResponse("Target device was not found", 404));
					return;
				}
				if (!isHikvisionDevice(targetDevice)) {
					res.status(400).json(
						buildErrorResponse("Target device must be Hikvision", 400),
					);
					return;
				}
			}

			const sourceDeviceUser = await updateHikvisionSyntheticFingerprintTally({
				organizationId: String(admin.organizationId),
				deviceId,
				vendorUserId,
				fingerprintCount,
				note:
					fingerprintCount > 0
						? "Applied as dev-only synthetic fingerprint tally for UI verification"
						: "Cleared dev-only synthetic fingerprint tally",
			});
			const targetDeviceUser =
				targetDeviceId && targetDevice
					? await updateHikvisionSyntheticFingerprintTally({
							organizationId: String(admin.organizationId),
							deviceId: targetDeviceId,
							vendorUserId,
							fingerprintCount,
							copiedFromDeviceId: deviceId,
							copiedFromVendorUserId: vendorUserId,
							note:
								fingerprintCount > 0
									? "Copied as dev-only synthetic fingerprint tally for peer verification"
									: "Cleared dev-only synthetic fingerprint tally",
						})
					: null;

			logActivity(req, {
				userId: String((req as any).userId || "unknown"),
				action: "HIKVISION_DEVICE_USER_MOCK_FINGERPRINT",
				description:
					fingerprintCount > 0
						? `Applied dev-only synthetic fingerprint tally ${fingerprintCount} to Hikvision device user ${vendorUserId}`
						: `Cleared dev-only synthetic fingerprint tally for Hikvision device user ${vendorUserId}`,
				page: {
					url: req.originalUrl,
					title: "Device Users",
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					fingerprintCount > 0
						? "Synthetic fingerprint tally applied"
						: "Synthetic fingerprint tally cleared",
					{
						deviceId,
						targetDeviceId: targetDeviceId || null,
						vendorUserId,
						fingerprintCount,
						synthetic: true,
						sourceDeviceUser,
						targetDeviceUser,
					},
					200,
				),
			);
		} catch (error: any) {
			deviceLogger.error(
				`Hikvision synthetic fingerprint tally failed: ${error?.message || error}`,
			);
			res.status(500).json(
				buildErrorResponse(
					error?.message || "Failed to apply synthetic fingerprint tally",
					500,
				),
			);
		}
	};

	const mirrorHikvisionFaceToPeers = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const admin = assertDeviceUserAdmin(req, res);
			if (!admin) return;
			const sourceDeviceId = String(req.body?.sourceDeviceId || "").trim();
			const employeeNo = String(req.body?.employeeNo || req.body?.vendorUserId || "").trim();
			if (!sourceDeviceId || !employeeNo) {
				res.status(400).json(
					buildErrorResponse("sourceDeviceId and employeeNo are required", 400),
				);
				return;
			}
			const sourceDevice = await prisma.device.findFirst({
				where: {
					id: sourceDeviceId,
					organizationId: String(admin.organizationId),
					isDeleted: false,
				},
			});
			if (!sourceDevice || !isHikvisionDevice(sourceDevice)) {
				res.status(404).json(
					buildErrorResponse("Hikvision source device was not found", 404),
				);
				return;
			}
			const result = await runHikvisionListenerVmCommand(
				[
					"sudo",
					"env",
					"HIKVISION_DEVICE_SPEC_OVERRIDE=/etc/project-truth/hikvision-live-device.spec",
					"HIKVISION_SKIP_SPOOL_REPLAY=1",
					"HIKVISION_RUN_SECONDS=8",
					HIKVISION_VM_WRAPPER_REMOTE_PATH,
					"--run-once",
					"--mirror-face-source-device-id",
					sourceDeviceId,
					"--mirror-face-employee-no",
					employeeNo,
				],
				30000,
			);
			const events = parseJsonLines(result.stdout);
			if (result.exitCode !== 0) {
				res.status(502).json(
					buildErrorResponse(
						result.stderr.trim() ||
							result.stdout.trim() ||
							"Hikvision face mirror failed",
						502,
					),
				);
				return;
			}
			const completed =
				events.find((event) => event.event === "manual_face_mirror_completed") || null;
			logActivity(req, {
				userId: String((req as any).userId || "unknown"),
				action: "HIKVISION_FACE_MIRROR",
				description: `Mirrored Hikvision face for ${employeeNo} from ${sourceDevice.name} to peers`,
				page: { url: req.originalUrl, title: "Device Users" },
			});
			res.status(200).json(
				buildSuccessResponse(
					"Hikvision face mirror completed",
					{
						sourceDeviceId,
						employeeNo,
						completed,
						events,
					},
					200,
				),
			);
		} catch (error: any) {
			deviceLogger.error(`Hikvision face mirror failed: ${error?.message || error}`);
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to mirror Hikvision face", 500),
			);
		}
	};

	const mockHikvisionFaceTally = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const admin = assertDeviceUserAdmin(req, res);
			if (!admin) return;

			const deviceId = String(req.body?.deviceId || "").trim();
			const vendorUserId = String(
				req.body?.vendorUserId || req.body?.employeeNo || "",
			).trim();
			const targetDeviceId = String(req.body?.targetDeviceId || "").trim();
			const faceCount = Math.max(
				0,
				Math.min(10, Math.floor(Number(req.body?.faceCount) || 0)),
			);
			if (!deviceId || !vendorUserId) {
				res.status(400).json(
					buildErrorResponse("deviceId and vendorUserId are required", 400),
				);
				return;
			}

			const deviceIds = [deviceId, targetDeviceId].filter(Boolean);
			const devices = await prisma.device.findMany({
				where: {
					organizationId: String(admin.organizationId),
					isDeleted: false,
					id: { in: deviceIds },
				},
			});
			const sourceDevice = devices.find((device) => device.id === deviceId);
			const targetDevice = targetDeviceId
				? devices.find((device) => device.id === targetDeviceId)
				: null;
			if (!sourceDevice) {
				res.status(404).json(buildErrorResponse("Source device was not found", 404));
				return;
			}
			if (!isHikvisionDevice(sourceDevice)) {
				res.status(400).json(buildErrorResponse("Source device must be Hikvision", 400));
				return;
			}
			if (targetDeviceId) {
				if (!targetDevice) {
					res.status(404).json(buildErrorResponse("Target device was not found", 404));
					return;
				}
				if (!isHikvisionDevice(targetDevice)) {
					res.status(400).json(
						buildErrorResponse("Target device must be Hikvision", 400),
					);
					return;
				}
			}

			const sourceDeviceUser = await updateHikvisionSyntheticFaceTally({
				organizationId: String(admin.organizationId),
				deviceId,
				vendorUserId,
				faceCount,
				note:
					faceCount > 0
						? "Applied as dev-only synthetic face tally for UI verification"
						: "Cleared dev-only synthetic face tally",
			});
			const targetDeviceUser =
				targetDeviceId && targetDevice
					? await updateHikvisionSyntheticFaceTally({
							organizationId: String(admin.organizationId),
							deviceId: targetDeviceId,
							vendorUserId,
							faceCount,
							copiedFromDeviceId: deviceId,
							copiedFromVendorUserId: vendorUserId,
							note:
								faceCount > 0
									? "Copied as dev-only synthetic face tally for peer verification"
									: "Cleared dev-only synthetic face tally",
						})
					: null;

			logActivity(req, {
				userId: String((req as any).userId || "unknown"),
				action: "HIKVISION_DEVICE_USER_MOCK_FACE",
				description:
					faceCount > 0
						? `Applied dev-only synthetic face tally ${faceCount} to Hikvision device user ${vendorUserId}`
						: `Cleared dev-only synthetic face tally for Hikvision device user ${vendorUserId}`,
				page: {
					url: req.originalUrl,
					title: "Device Users",
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					faceCount > 0 ? "Synthetic face tally applied" : "Synthetic face tally cleared",
					{
						deviceId,
						targetDeviceId: targetDeviceId || null,
						vendorUserId,
						faceCount,
						synthetic: true,
						sourceDeviceUser,
						targetDeviceUser,
					},
					200,
				),
			);
		} catch (error: any) {
			deviceLogger.error(`Hikvision synthetic face tally failed: ${error?.message || error}`);
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to apply synthetic face tally", 500),
			);
		}
	};

	const backfillDeviceUsers = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		try {
			const deviceId = String(req.params.id || (req.body as any)?.deviceId || "").trim();
			const device = await getDeviceForUserSync(gate.organizationId, deviceId);
			if (!device) {
				res.status(404).json(buildErrorResponse("Device not found", 404));
				return;
			}
			const result = await backfillDeviceUsersFromLegacyEmployees({
				organizationId: gate.organizationId,
				deviceId: device.id,
			});
			res.status(200).json(
				buildSuccessResponse("Legacy device users backfilled", result, 200),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to backfill device users", 500),
			);
		}
	};

	const getBulkSyncModeQueuedMessage = (syncMode: DeviceUserSyncMode) => {
		if (syncMode === "needs_attention_only")
			return "Needs-attention device-user refresh queued";
		if (syncMode === "peer_converge") return "Cross-device convergence queued";
		return "Full device-user refresh queued";
	};

	const getBulkSyncModeCancelledMessage = (syncMode: DeviceUserSyncMode) => {
		if (syncMode === "needs_attention_only") {
			return "Cancel requested. The needs-attention refresh stopped before the next device.";
		}
		if (syncMode === "peer_converge") {
			return "Cancel requested. Cross-device convergence stopped before the next device.";
		}
		return "Cancel requested. The full source refresh stopped before the next device.";
	};

	const getBulkSyncModeProgressMessage = (
		syncMode: DeviceUserSyncMode,
		deviceName: string,
		index: number,
		total: number,
		success: boolean,
	) => {
		if (success) {
			if (syncMode === "needs_attention_only") {
				return `Refreshed ${deviceName} from the needs-attention queue (${index}/${total}).`;
			}
			if (syncMode === "peer_converge") {
				return `Refreshed ${deviceName} before peer convergence (${index}/${total}).`;
			}
			return `Refreshed ${deviceName} from live source truth (${index}/${total}).`;
		}
		if (syncMode === "needs_attention_only") {
			return `Review needed for ${deviceName} in the needs-attention queue (${index}/${total}).`;
		}
		if (syncMode === "peer_converge") {
			return `Review needed for ${deviceName} before peer convergence (${index}/${total}).`;
		}
		return `Review needed for ${deviceName} during the full source refresh (${index}/${total}).`;
	};

	const setDeviceUserSyncJobResult = (
		results: DeviceUserSyncJobResult[],
		nextResult: DeviceUserSyncJobResult,
	) => {
		const index = results.findIndex((item) => item.deviceId === nextResult.deviceId);
		if (index >= 0) {
			results[index] = {
				...results[index],
				...nextResult,
				summary: {
					...((results[index].summary as Record<string, any>) || {}),
					...((nextResult.summary as Record<string, any>) || {}),
				},
			};
			return;
		}
		results.push(nextResult);
	};

	const shouldConvergeDeviceUserToPeer = (
		sourceDeviceUser: any,
		targetDeviceUser?: any | null,
	) => {
		if (!targetDeviceUser) return true;
		const sourceSummary = buildEffectiveHikvisionCredentialSummary(
			sourceDeviceUser?.rawPayload || {},
		);
		const targetSummary = buildEffectiveHikvisionCredentialSummary(
			targetDeviceUser?.rawPayload || {},
		);
		if (targetSummary.fingerprintCount < sourceSummary.fingerprintCount) return true;
		if (targetSummary.faceCount < sourceSummary.faceCount) return true;
		if (targetSummary.cardCount < sourceSummary.cardCount) return true;
		return false;
	};

	const summarizeDeviceUserTruth = (deviceUsers: any[]) =>
		deviceUsers.reduce(
			(summary, deviceUser) => {
				const credentialSummary = buildEffectiveHikvisionCredentialSummary(
					deviceUser?.rawPayload || {},
				);
				return {
					userCount: summary.userCount + 1,
					fingerprintCount:
						summary.fingerprintCount + Number(credentialSummary.fingerprintCount || 0),
					faceCount: summary.faceCount + Number(credentialSummary.faceCount || 0),
					cardCount: summary.cardCount + Number(credentialSummary.cardCount || 0),
				};
			},
			{
				userCount: 0,
				fingerprintCount: 0,
				faceCount: 0,
				cardCount: 0,
			},
		);

	const processBulkDeviceUserSyncJob = async (params: {
		jobId: string;
		req: Request;
		organizationId: string;
		devices: any[];
		syncMode: DeviceUserSyncMode;
		startedByUserId?: string | null;
	}) => {
		const results: DeviceUserSyncJobResult[] = [];
		let successfulDevices = 0;
		let failedDevices = 0;

		for (const device of params.devices) {
			const currentJob = deviceUserSyncJobs.get(params.jobId);
			if (!currentJob) return;
			if (currentJob.cancelRequested) {
				updateDeviceUserSyncJob(params.jobId, {
					status: "cancelled",
					message: getBulkSyncModeCancelledMessage(params.syncMode),
					processedDevices: results.length,
					successfulDevices,
					failedDevices,
					results,
					completedAt: new Date(),
				});
				return;
			}

			try {
				const { run, summary } = await syncHikvisionDeviceUsersFromSource({
					req: params.req,
					organizationId: params.organizationId,
					device,
					startedByUserId: params.startedByUserId || null,
				});
				setDeviceUserSyncJobResult(results, {
					deviceId: device.id,
					deviceName: device.name || device.address || "Hikvision device",
					status: "success",
					runId: run?.id || null,
					summary,
				});
				successfulDevices += 1;
				updateDeviceUserSyncJob(params.jobId, {
					status: "processing",
					message: getBulkSyncModeProgressMessage(
						params.syncMode,
						device.name || device.address || "device",
						results.length,
						params.devices.length,
						true,
					),
					processedDevices: results.length,
					successfulDevices,
					failedDevices,
					results,
				});
			} catch (error: any) {
				setDeviceUserSyncJobResult(results, {
					deviceId: device.id,
					deviceName: device.name || device.address || "Hikvision device",
					status: "error",
					error: error?.message || "Device-user sync failed.",
				});
				failedDevices += 1;
				updateDeviceUserSyncJob(params.jobId, {
					status: "processing",
					message: getBulkSyncModeProgressMessage(
						params.syncMode,
						device.name || device.address || "device",
						results.length,
						params.devices.length,
						false,
					),
					processedDevices: results.length,
					successfulDevices,
					failedDevices,
					results,
				});
			}
		}

		if (params.syncMode === "peer_converge" && successfulDevices > 1) {
			const successfulResults = results.filter((result) => result.status === "success");
			const savedDeviceUsers = await (prisma as any).deviceUser.findMany({
				where: {
					organizationId: params.organizationId,
					deviceId: { in: successfulResults.map((result) => result.deviceId) },
				},
				select: {
					id: true,
					deviceId: true,
					vendorUserId: true,
					employeeId: true,
					status: true,
					lastSyncedAt: true,
					rawPayload: true,
				},
			});
			const deviceTruthByDeviceId = savedDeviceUsers.reduce(
				(groups: Map<string, any[]>, deviceUser: any) => {
					const deviceId = String(deviceUser.deviceId || "").trim();
					if (!deviceId) return groups;
					const bucket = groups.get(deviceId) || [];
					bucket.push(deviceUser);
					groups.set(deviceId, bucket);
					return groups;
				},
				new Map<string, any[]>(),
			);
			const sourceResult = [...successfulResults].sort((left, right) => {
				const leftTruth = summarizeDeviceUserTruth(
					deviceTruthByDeviceId.get(left.deviceId) || [],
				);
				const rightTruth = summarizeDeviceUserTruth(
					deviceTruthByDeviceId.get(right.deviceId) || [],
				);
				if (leftTruth.userCount !== rightTruth.userCount)
					return rightTruth.userCount - leftTruth.userCount;
				if (leftTruth.fingerprintCount !== rightTruth.fingerprintCount) {
					return rightTruth.fingerprintCount - leftTruth.fingerprintCount;
				}
				if (leftTruth.faceCount !== rightTruth.faceCount)
					return rightTruth.faceCount - leftTruth.faceCount;
				if (leftTruth.cardCount !== rightTruth.cardCount)
					return rightTruth.cardCount - leftTruth.cardCount;
				const leftImportable = Number(left.summary?.importableRecords || 0);
				const rightImportable = Number(right.summary?.importableRecords || 0);
				if (leftImportable !== rightImportable) return rightImportable - leftImportable;
				const leftTotal = Number(left.summary?.totalSourceRecords || 0);
				const rightTotal = Number(right.summary?.totalSourceRecords || 0);
				return rightTotal - leftTotal;
			})[0];
			const sourceDevice =
				params.devices.find((device) => device.id === sourceResult?.deviceId) || null;
			if (sourceDevice?.id) {
				const deviceUserMap = savedDeviceUsers.reduce(
					(groups: Map<string, Map<string, any>>, deviceUser: any) => {
						const deviceId = String(deviceUser.deviceId || "").trim();
						const vendorUserId = String(deviceUser.vendorUserId || "").trim();
						if (!deviceId || !vendorUserId) return groups;
						const bucket = groups.get(deviceId) || new Map<string, any>();
						bucket.set(vendorUserId, deviceUser);
						groups.set(deviceId, bucket);
						return groups;
					},
					new Map<string, Map<string, any>>(),
				);
				const sourceUsers = [...(deviceUserMap.get(sourceDevice.id)?.values() || [])];
				for (const targetDevice of params.devices.filter(
					(device) =>
						device.id !== sourceDevice.id &&
						successfulResults.some((result) => result.deviceId === device.id),
				)) {
					const currentJob = deviceUserSyncJobs.get(params.jobId);
					if (!currentJob) return;
					if (currentJob.cancelRequested) {
						updateDeviceUserSyncJob(params.jobId, {
							status: "cancelled",
							message:
								"Cancel requested. Cross-device convergence stopped during peer copy.",
							processedDevices: results.length,
							successfulDevices,
							failedDevices,
							results,
							completedAt: new Date(),
						});
						return;
					}
					const targetUsers =
						deviceUserMap.get(targetDevice.id) || new Map<string, any>();
					let copiedUsers = 0;
					let retryCount = 0;
					let skippedUsers = 0;
					let failedCopies = 0;
					let syntheticFaceMirrors = 0;
					let lastCopyError = "";
					for (const sourceUser of sourceUsers) {
						const vendorUserId = String(sourceUser?.vendorUserId || "").trim();
						if (!vendorUserId) continue;
						const targetUser = targetUsers.get(vendorUserId) || null;
						if (!shouldConvergeDeviceUserToPeer(sourceUser, targetUser)) {
							await mirrorDeviceUserLinkToPeer({
								organizationId: params.organizationId,
								sourceDeviceId: sourceDevice.id,
								targetDeviceId: targetDevice.id,
								vendorUserId,
							});
							skippedUsers += 1;
							continue;
						}
						try {
							const copyResult = await copyHikvisionUserToPeerWithRetry({
								req: params.req,
								organizationId: params.organizationId,
								sourceDevice,
								targetDevice,
								employeeNo: vendorUserId,
								includeFingerprints: true,
								includeFaceRecognition: true,
							});
							targetUsers.set(vendorUserId, copyResult.targetDeviceUser);
							copiedUsers += 1;
							retryCount += Math.max(0, Number(copyResult.attempt || 1) - 1);
							if (
								Number(
									copyResult.syntheticCredentialOverlayApplied?.faceCount || 0,
								) > 0
							) {
								syntheticFaceMirrors += 1;
							}
						} catch (error: any) {
							failedCopies += 1;
							lastCopyError = error?.message || "Peer convergence copy failed.";
						}
					}
					if (failedCopies > 0) {
						failedDevices += 1;
						successfulDevices = Math.max(0, successfulDevices - 1);
					}
					setDeviceUserSyncJobResult(results, {
						deviceId: targetDevice.id,
						deviceName: targetDevice.name || targetDevice.address || "Hikvision device",
						status: failedCopies > 0 ? "error" : "success",
						summary: {
							...(results.find((result) => result.deviceId === targetDevice.id)
								?.summary || {}),
							mode: "peer_converge",
							sourceDeviceId: sourceDevice.id,
							sourceDeviceName:
								sourceDevice.name || sourceDevice.address || "Hikvision device",
							copiedUsers,
							retryCount,
							skippedUsers,
							failedCopies,
							syntheticFaceMirrors,
						},
						error: failedCopies > 0 ? lastCopyError : null,
					});
					updateDeviceUserSyncJob(params.jobId, {
						status: "processing",
						message: `Converged ${targetDevice.name || targetDevice.address || "device"} from ${sourceDevice.name || sourceDevice.address || "source device"}.`,
						processedDevices: results.length,
						successfulDevices,
						failedDevices,
						results,
					});
				}
				setDeviceUserSyncJobResult(results, {
					deviceId: sourceDevice.id,
					deviceName: sourceDevice.name || sourceDevice.address || "Hikvision device",
					status: "success",
					summary: {
						...(results.find((result) => result.deviceId === sourceDevice.id)
							?.summary || {}),
						mode: "peer_converge",
						convergenceSource: true,
						sourceDeviceId: sourceDevice.id,
						sourceDeviceName:
							sourceDevice.name || sourceDevice.address || "Hikvision device",
						copiedUsers: 0,
						retryCount: 0,
						skippedUsers: sourceUsers.length,
						failedCopies: 0,
					},
				});
			}
		}

		await invalidateCache.byPattern("cache:device:*").catch(() => undefined);
		updateDeviceUserSyncJob(params.jobId, {
			status: failedDevices > 0 ? "failed" : "completed",
			message:
				failedDevices > 0
					? params.syncMode === "needs_attention_only"
						? "Needs-attention device-user refresh finished with devices still needing review."
						: params.syncMode === "peer_converge"
							? "Cross-device convergence finished with devices still needing review."
							: "Full device-user refresh finished with devices still needing review."
					: params.syncMode === "needs_attention_only"
						? "Needs-attention device-user refresh finished."
						: params.syncMode === "peer_converge"
							? "Cross-device convergence finished."
							: "Full device-user refresh finished across configured devices.",
			processedDevices: results.length,
			successfulDevices,
			failedDevices,
			results,
			completedAt: new Date(),
		});
	};

	const startDeviceUserSyncJob = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		try {
			const requestedMode = String((req.body as any)?.mode || "")
				.trim()
				.toLowerCase();
			const syncMode: DeviceUserSyncMode =
				requestedMode === "needs_attention_only"
					? "needs_attention_only"
					: requestedMode === "peer_converge"
						? "peer_converge"
						: "full_refresh";
			const requestedDeviceIds = Array.isArray((req.body as any)?.deviceIds)
				? Array.from(
						new Set(
							((req.body as any).deviceIds as unknown[])
								.map((value) => String(value || "").trim())
								.filter(Boolean),
						),
					)
				: [];
			cleanupDeviceUserSyncJobs();
			const devices = await prisma.device.findMany({
				where: {
					organizationId: gate.organizationId,
					isDeleted: false,
				},
				select: {
					id: true,
					name: true,
					address: true,
					port: true,
					protocol: true,
					config: true,
				},
				orderBy: { createdAt: "asc" },
			});
			const hikvisionDevices = devices.filter((device) => isHikvisionDevice(device));
			if (!hikvisionDevices.length) {
				res.status(400).json(
					buildErrorResponse(
						"No Hikvision devices are configured for device-user sync",
						400,
					),
				);
				return;
			}
			const targetDevices = requestedDeviceIds.length
				? hikvisionDevices.filter((device) =>
						requestedDeviceIds.includes(String(device.id)),
					)
				: hikvisionDevices;
			if (!targetDevices.length) {
				res.status(400).json(
					buildErrorResponse(
						syncMode === "needs_attention_only"
							? "No configured Hikvision devices matched the current needs-attention refresh scope"
							: syncMode === "peer_converge"
								? "No configured Hikvision devices matched the current convergence scope"
								: "No configured Hikvision devices matched the requested sync scope",
						400,
					),
				);
				return;
			}

			const jobId = randomUUID();
			const job: DeviceUserSyncJob = {
				jobId,
				status: "processing",
				syncMode,
				organizationId: gate.organizationId,
				totalDevices: targetDevices.length,
				processedDevices: 0,
				successfulDevices: 0,
				failedDevices: 0,
				message: getBulkSyncModeQueuedMessage(syncMode),
				results: [],
				startedAt: new Date(),
			};
			deviceUserSyncJobs.set(jobId, job);

			processBulkDeviceUserSyncJob({
				jobId,
				req,
				organizationId: gate.organizationId,
				devices: targetDevices,
				syncMode,
				startedByUserId: (req as any).userId || null,
			}).catch((error: any) => {
				deviceLogger.error(`Device user sync job ${jobId} failed: ${error}`);
				updateDeviceUserSyncJob(jobId, {
					status: "failed",
					message: error?.message || "Device-user tally failed.",
					failedDevices: Math.max(1, deviceUserSyncJobs.get(jobId)?.failedDevices || 0),
					completedAt: new Date(),
				});
			});

			res.status(202).json(
				buildSuccessResponse("Device user sync started", { jobId, progress: job }, 202),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to start device-user sync", 500),
			);
		}
	};

	const getDeviceUserSyncJob = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		const jobId = String(req.params.jobId || "").trim();
		const job = deviceUserSyncJobs.get(jobId);
		if (!job || job.organizationId !== gate.organizationId) {
			res.status(404).json(
				buildErrorResponse("Device-user sync job not found or expired", 404),
			);
			return;
		}
		res.status(200).json(buildSuccessResponse("Device-user sync job retrieved", job, 200));
	};

	const cancelDeviceUserSyncJob = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		try {
			const jobId = String(req.params.jobId || "").trim();
			const job = deviceUserSyncJobs.get(jobId);
			if (!job || job.organizationId !== gate.organizationId) {
				res.status(404).json(
					buildErrorResponse("Device-user sync job not found or expired", 404),
				);
				return;
			}
			if (job.status !== "processing") {
				res.status(200).json(
					buildSuccessResponse("Device-user sync job already finished", job, 200),
				);
				return;
			}
			updateDeviceUserSyncJob(jobId, {
				cancelRequested: true,
				cancelRequestedAt: new Date(),
				message: "Cancel requested",
			});
			res.status(200).json(
				buildSuccessResponse(
					"Device-user sync cancellation requested",
					deviceUserSyncJobs.get(jobId) || job,
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to cancel device-user sync", 500),
			);
		}
	};

	const backfillDeviceUserLifecycleEvents = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		try {
			const deviceId = String(req.params.id || (req.body as any)?.deviceId || "").trim();
			const execute = (req.body as any)?.execute === true;
			const device = await getDeviceForUserSync(gate.organizationId, deviceId);
			if (!device || !isHikvisionDevice(device)) {
				res.status(400).json(
					buildErrorResponse(
						"Select a Hikvision device before backfilling lifecycle events",
						400,
					),
				);
				return;
			}

			const deviceUsers = await prisma.deviceUser.findMany({
				where: {
					organizationId: gate.organizationId,
					deviceId: device.id,
				},
				orderBy: { vendorUserId: "asc" },
				select: {
					id: true,
					vendorUserId: true,
					employeeId: true,
					employeeNo: true,
					rawPayload: true,
					lastSyncedAt: true,
				},
			});
			const result = await persistDeviceUserLifecycleBackfill({
				organizationId: gate.organizationId,
				sourceDevice: {
					id: device.id,
					name: device.name,
					address: device.address,
				},
				deviceUsers,
				source: "EN_HCNETSDK_ALARM",
				reason: "manual_device_user_lifecycle_backfill",
				execute,
				minor: "STATE_BACKFILL",
			});
			res.status(200).json(
				buildSuccessResponse(
					execute
						? "Device user lifecycle events backfilled"
						: "Device user lifecycle backfill preview ready",
					{
						device: {
							id: device.id,
							name: device.name,
							address: device.address,
						},
						...result,
					},
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(
					error?.message || "Failed to backfill device user lifecycle events",
					500,
				),
			);
		}
	};

	const linkDeviceUser = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		try {
			const deviceUserId = String(req.params.userId || "").trim();
			const employeeId = String((req.body as any)?.employeeId || "").trim();
			if (!employeeId) {
				res.status(400).json(buildErrorResponse("Employee is required", 400));
				return;
			}
			const [deviceUser, employee] = await Promise.all([
				(prisma as any).deviceUser.findFirst({
					where: { id: deviceUserId, organizationId: gate.organizationId },
				}),
				prisma.employee.findFirst({
					where: {
						id: employeeId,
						organizationId: gate.organizationId,
						isDeleted: false,
					},
					select: { id: true },
				}),
			]);
			if (!deviceUser) {
				res.status(404).json(buildErrorResponse("Device user not found", 404));
				return;
			}
			if (!employee) {
				res.status(404).json(buildErrorResponse("Employee not found", 404));
				return;
			}
			const updated = await (prisma as any).deviceUser.update({
				where: { id: deviceUserId },
				data: { employeeId: employee.id, status: "ACTIVE" },
				select: buildDeviceUserSelect({
					includeVendorMetadata: await hasDeviceUserVendorMetadataColumn(),
				}),
			});
			res.status(200).json(
				buildSuccessResponse("Device user linked", decorateDeviceUser(updated), 200),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to link device user", 500),
			);
		}
	};

	const unlinkDeviceUser = async (req: Request, res: Response, _next: NextFunction) => {
		const gate = assertDeviceUserAdmin(req, res);
		if (!gate) return;
		try {
			const deviceUserId = String(req.params.userId || "").trim();
			const deviceUser = await (prisma as any).deviceUser.findFirst({
				where: { id: deviceUserId, organizationId: gate.organizationId },
			});
			if (!deviceUser) {
				res.status(404).json(buildErrorResponse("Device user not found", 404));
				return;
			}
			const updated = await (prisma as any).deviceUser.update({
				where: { id: deviceUserId },
				data: {
					employeeId: null,
					status: deviceUser.status === "DISABLED" ? "DISABLED" : "UNMATCHED",
				},
				select: buildDeviceUserSelect({
					includeVendorMetadata: await hasDeviceUserVendorMetadataColumn(),
				}),
			});
			res.status(200).json(
				buildSuccessResponse("Device user unlinked", decorateDeviceUser(updated), 200),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to unlink device user", 500),
			);
		}
	};

	const getHikvisionImportProgress = (jobId: string) => {
		cleanupDeviceImportJobs();
		return deviceImportJobs.get(jobId) || null;
	};

	const buildHikvisionImportEventFingerprint = (device: any, event: any) => {
		const employeeNo = String(event?.employeeNoString || event?.employeeNo || "").trim();
		const receivedAt = new Date();
		const knownSkewSeconds = Number((device?.config as any)?.hikvisionClockSkewSeconds || 0);
		const allowClockSkewCorrection =
			(device?.config as any)?.hikvisionAllowClockSkewCorrection === true;
		const eventWasAlreadyAdjusted = Boolean(event?.timeAdjusted);
		const normalizedTime = eventWasAlreadyAdjusted
			? parseHikvisionEventTime(event?.time)
			: normalizeHikvisionFutureSkewedEventTime(event?.time, receivedAt, knownSkewSeconds, {
					allowStoredSkew: allowClockSkewCorrection,
					allowAutoAdjust: allowClockSkewCorrection,
				}).eventTime;
		const source = normalizeHikvisionDeviceEventSource(event?.source);
		return {
			employeeNo,
			eventTime: normalizedTime,
			source,
			serialNo: String(event?.serialNo || "").trim(),
			dedupeKey: buildHikvisionDeviceEventDedupeKey({
				deviceId: device.id,
				source,
				eventTime: normalizedTime,
				employeeNo,
				event,
			}),
		};
	};

	const findExistingHikvisionDeviceEvent = async (params: {
		organizationId: string;
		deviceId: string;
		employeeNo: string;
		source: string;
		eventTime: Date;
		serialNo?: string | null;
		dedupeKey: string;
	}) => {
		const existingByDedupe = await (prisma as any).deviceEvent.findFirst({
			where: {
				organizationId: params.organizationId,
				dedupeKey: params.dedupeKey,
			},
			select: { id: true },
		});
		if (existingByDedupe) return existingByDedupe;

		const serialNo = String(params.serialNo || "").trim();
		if (!serialNo || !params.employeeNo) return null;
		const start = new Date(params.eventTime);
		start.setUTCHours(0, 0, 0, 0);
		start.setUTCDate(start.getUTCDate() - 1);
		const end = new Date(params.eventTime);
		end.setUTCHours(23, 59, 59, 999);
		end.setUTCDate(end.getUTCDate() + 1);
		const candidates = await (prisma as any).deviceEvent.findMany({
			where: {
				organizationId: params.organizationId,
				deviceId: params.deviceId,
				employeeNo: params.employeeNo,
				source: params.source,
				eventTime: { gte: start, lte: end },
			},
			select: { id: true, payload: true },
			orderBy: { receivedAt: "desc" },
			take: 200,
		});
		return (
			candidates.find((candidate: any) => {
				const payload = candidate?.payload || {};
				const candidateSerial =
					payload?.serialNo ||
					payload?.AcsEventInfo?.serialNo ||
					payload?.EventNotificationAlert?.AccessControllerEvent?.serialNo ||
					payload?.AccessControllerEvent?.serialNo;
				return String(candidateSerial || "").trim() === serialNo;
			}) || null
		);
	};

	const processHikvisionImportJob = async (params: {
		jobId: string;
		runId?: string;
		req: Request;
		device: any;
		totalHint: number;
		targetImportCount?: number | null;
		skipMissingEmployeeNo?: boolean;
	}) => {
		const { jobId, runId, req, device, totalHint } = params;
		const skipMissingEmployeeNo = params.skipMissingEmployeeNo === true;
		const targetImportCount =
			params.targetImportCount !== null &&
			params.targetImportCount !== undefined &&
			Number.isFinite(Number(params.targetImportCount))
				? Math.max(Number(params.targetImportCount), 0)
				: null;
		const ctrl = callbackController(prisma);
		const pageSize = Math.max(
			1,
			Math.min(Number(process.env.HIKVISION_IMPORT_PAGE_SIZE || 50), 200),
		);
		const fullScanLimit = Math.max(
			1,
			Math.min(Number(process.env.HIKVISION_IMPORT_MAX_EVENTS || totalHint || 1000), 10000),
		);
		const targetedScanLimit = targetImportCount
			? Math.max(
					Math.min(
						Number(process.env.HIKVISION_IMPORT_TARGETED_MAX_SCAN || 200),
						Math.max(targetImportCount + 10, targetImportCount * 3, 10),
					),
				)
			: null;
		const maxEvents = Math.min(fullScanLimit, targetedScanLimit || fullScanLimit);
		const effectivePageSize =
			targetImportCount !== null
				? Math.min(pageSize, Math.max(targetImportCount + 10, 10))
				: pageSize;
		const endTime = formatHikvisionManilaDateTime(new Date(Date.now() + 60 * 1000));
		let position = 0;
		let processed = 0;
		let imported = 0;
		let skipped = 0;
		let alreadySaved = 0;
		let knownSkipped = 0;
		let failed = 0;
		let sourceTotalForLoop =
			Number.isFinite(Number(totalHint)) && Number(totalHint) > 0
				? Math.min(Number(totalHint), maxEvents)
				: maxEvents;

		try {
			updateDeviceImportJob(jobId, {
				total: targetImportCount || Math.min(totalHint || maxEvents, maxEvents),
				sourceTotal: totalHint,
				targetImportCount,
				scanLimit: maxEvents,
				message: targetImportCount
					? `Reading latest device logs for ${targetImportCount.toLocaleString()} estimated unsaved row${targetImportCount === 1 ? "" : "s"}`
					: "Reading device logs",
			});

			while (processed < maxEvents) {
				const currentJob = deviceImportJobs.get(jobId);
				if (currentJob?.cancelRequested) {
					updateDeviceImportJob(jobId, {
						status: "cancelled",
						message: "Sync cancelled",
						completedAt: new Date(),
					});
					break;
				}
				const payload = {
					AcsEventCond: {
						searchID: `${jobId}-${position}`,
						searchResultPosition: position,
						maxResults: Math.min(effectivePageSize, maxEvents - processed),
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
					sourceTotalForLoop = Math.min(Number(totalFromDevice), maxEvents);
					updateDeviceImportJob(jobId, {
						total: targetImportCount || Math.min(Number(totalFromDevice), maxEvents),
						sourceTotal: Number(totalFromDevice),
					});
				}
				if (!pageEvents.length) break;

				for (const event of pageEvents) {
					processed += 1;
					const employeeNo = String(
						event?.employeeNoString || event?.employeeNo || "",
					).trim();
					if (!employeeNo && skipMissingEmployeeNo) {
						skipped += 1;
						knownSkipped += 1;
					} else {
						const fingerprint = buildHikvisionImportEventFingerprint(device, event);
						const existingEvent = await findExistingHikvisionDeviceEvent({
							organizationId: String(device.organizationId),
							deviceId: device.id,
							employeeNo,
							source: fingerprint.source,
							eventTime: fingerprint.eventTime,
							serialNo: fingerprint.serialNo,
							dedupeKey: fingerprint.dedupeKey,
						});
						if (existingEvent) {
							alreadySaved += 1;
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
								await ctrl.handleCallback(
									callbackReq,
									callbackRes,
									(() => undefined) as any,
								);
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
					}

					if (processed % 10 === 0 || processed >= maxEvents) {
						updateDeviceImportJob(jobId, {
							processed,
							imported,
							skipped,
							alreadySaved,
							knownSkipped,
							failed,
							message: targetImportCount
								? "Checking latest estimated unsaved rows against HRIS"
								: "Scanning device logs and checking HRIS matches",
						});
					}
					if (targetImportCount !== null && imported >= targetImportCount) break;
					if (processed >= maxEvents) break;
				}

				position += pageEvents.length;
				if (targetImportCount !== null && imported >= targetImportCount) break;
				if (position >= sourceTotalForLoop) break;
			}

			const finalJob = deviceImportJobs.get(jobId);
			const wasCancelled = finalJob?.status === "cancelled" || finalJob?.cancelRequested;
			const remainingEstimatedMissing =
				targetImportCount === null ? 0 : Math.max(targetImportCount - imported, 0);
			updateDeviceImportJob(jobId, {
				status: wasCancelled
					? "cancelled"
					: failed > 0 && imported === 0
						? "failed"
						: "completed",
				processed,
				imported,
				skipped,
				alreadySaved,
				knownSkipped,
				failed,
				message: wasCancelled
					? "Sync cancelled"
					: failed > 0 && imported === 0
						? "Import failed"
						: imported > 0
							? `Saved ${imported.toLocaleString()} device logs to HRIS`
							: remainingEstimatedMissing > 0
								? "Estimated rows were not found in the latest device scan"
								: "No new device logs saved",
				completedAt: new Date(),
			});
			if (runId) {
				await (prisma as any).deviceSyncRun.update({
					where: { id: runId },
					data: {
						status: wasCancelled
							? "FAILED"
							: failed > 0 && imported === 0
								? "FAILED"
								: "COMPLETED",
						totalSourceRecords: processed,
						importableRecords: Math.max(processed - skipped - alreadySaved, 0),
						savedRecords: imported,
						skippedRecords: skipped,
						failedRecords: failed,
						missingRecords: remainingEstimatedMissing,
						skipSummary: {
							missingEmployeeNo: knownSkipped,
							alreadySaved,
						},
						failureSummary: failed ? { failed } : null,
						rawSummary: {
							totalHint,
							processed,
							imported,
							skipped,
							alreadySaved,
							knownSkipped,
							failed,
							skipMissingEmployeeNo,
							targetImportCount,
							scanLimit: maxEvents,
							targetedLatestScan: targetImportCount !== null,
							remainingEstimatedMissing,
							cancelled: wasCancelled,
						},
						completedAt: new Date(),
					},
				});
			}
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
			if (runId) {
				await (prisma as any).deviceSyncRun
					.update({
						where: { id: runId },
						data: {
							status: "FAILED",
							totalSourceRecords: processed,
							importableRecords: processed - skipped,
							savedRecords: imported,
							skippedRecords: skipped,
							failedRecords: failed + 1,
							failureSummary: { message: error?.message || "Sync failed" },
							completedAt: new Date(),
						},
					})
					.catch(() => undefined);
			}
		}
	};

	const triggerHikvisionAttendanceImport = async (
		req: Request,
		res: Response,
		_next: NextFunction,
	) => {
		try {
			const organizationId = (req as any).organizationId;
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID not found", 400));
				return;
			}
			const deviceId = String(
				(req.body as any)?.deviceId || (req.query as any)?.deviceId || "",
			).trim();
			const requestedTargetImportCount = Number(
				(req.body as any)?.targetImportCount ?? (req.query as any)?.targetImportCount,
			);
			const hasRequestedTargetImportCount =
				Number.isFinite(requestedTargetImportCount) && requestedTargetImportCount >= 0;
			const skipMissingEmployeeNo =
				(req.body as any)?.skipMissingEmployeeNo === true ||
				(req.query as any)?.skipMissingEmployeeNo === "true";
			if (!deviceId) {
				res.status(400).json(buildErrorResponse("Device is required", 400));
				return;
			}
			const device = await (prisma as any).device.findFirst({
				where: { id: deviceId, organizationId: String(organizationId), isDeleted: false },
				select: {
					id: true,
					organizationId: true,
					name: true,
					address: true,
					port: true,
					protocol: true,
					config: true,
				},
			});
			if (!device || !isHikvisionDevice(device)) {
				res.status(400).json(
					buildErrorResponse("Select a Hikvision attendance device", 400),
				);
				return;
			}

			const counts = await getHikvisionSourceCounts(req, device.id);
			const totalHint = Number(counts.totalEvents || 0);
			const [savedEvents, latestCompletedRun] = await Promise.all([
				(prisma as any).deviceEvent.count({
					where: {
						organizationId: String(organizationId),
						deviceId: device.id,
						source: "HIKVISION_CALLBACK",
					},
				}),
				findLatestCompletedDeviceLogRun(
					String(organizationId),
					device.id,
					"HIKVISION_CALLBACK",
				),
			]);
			const knownSkippedEvents = Number(latestCompletedRun?.skippedRecords || 0);
			const estimatedUnsaved =
				Number.isFinite(totalHint) && totalHint > 0
					? Math.max(totalHint - Number(savedEvents || 0), 0)
					: null;
			const serverEstimatedTargetImportCount =
				estimatedUnsaved === null
					? null
					: skipMissingEmployeeNo
						? Math.max(estimatedUnsaved - knownSkippedEvents, 0)
						: estimatedUnsaved;
			const targetImportCount = hasRequestedTargetImportCount
				? Math.max(Math.floor(requestedTargetImportCount), 0)
				: serverEstimatedTargetImportCount;
			if (targetImportCount === 0) {
				res.status(200).json(
					buildSuccessResponse(
						"No unsaved device logs found",
						{
							jobId: null,
							progress: {
								status: "completed",
								deviceId: device.id,
								deviceName: device.name || device.address,
								total: totalHint,
								sourceTotal: totalHint,
								targetImportCount,
								processed: 0,
								imported: 0,
								skipped: 0,
								failed: 0,
								message: "No unsaved device logs found in the dry-run estimate",
							},
						},
						200,
					),
				);
				return;
			}
			const jobId = randomUUID();
			let run: { id: string } | null = null;
			try {
				run = await (prisma as any).deviceSyncRun.create({
					data: {
						organizationId: String(organizationId),
						deviceId: device.id,
						runType: "DEVICE_LOGS",
						status: "PROCESSING",
						source: "HIKVISION_CALLBACK",
						startedByUserId: (req as any).userId || null,
						totalSourceRecords: totalHint,
						importableRecords: targetImportCount,
						rawSummary: {
							totalHint,
							savedEvents,
							knownSkippedEvents,
							estimatedUnsaved,
							serverEstimatedTargetImportCount,
							requestedTargetImportCount: hasRequestedTargetImportCount
								? Math.max(Math.floor(requestedTargetImportCount), 0)
								: null,
							targetImportCount,
							targetedLatestScan: targetImportCount !== null,
						},
					},
				});
			} catch (error) {
				if (isMissingDeviceSyncRunTableError(error)) {
					deviceLogger.warn(
						`Device sync run history table is missing; starting Hikvision import without durable run journal for device ${device.id}`,
					);
				} else {
					throw error;
				}
			}
			const job: DeviceImportJob = {
				jobId,
				runId: run?.id || undefined,
				status: "processing",
				organizationId: String(organizationId),
				deviceId: device.id,
				deviceName: device.name || device.address,
				total: targetImportCount || totalHint,
				sourceTotal: totalHint,
				targetImportCount,
				processed: 0,
				imported: 0,
				skipped: 0,
				skipMissingEmployeeNo,
				failed: 0,
				message: "Sync queued",
				errors: [],
				startedAt: new Date(),
			};
			deviceImportJobs.set(jobId, job);
			processHikvisionImportJob({
				jobId,
				runId: run?.id || undefined,
				req,
				device,
				totalHint,
				targetImportCount,
				skipMissingEmployeeNo,
			}).catch((error) => {
				deviceLogger.error(`Hikvision import job ${jobId} failed: ${error}`);
			});

			res.status(202).json(
				buildSuccessResponse("Device log sync started", { jobId, progress: job }, 202),
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

	const cancelDeviceImportJob = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const organizationId = String((req as any).organizationId || "").trim();
			const jobId = String(req.params.jobId || "").trim();
			const job = getHikvisionImportProgress(jobId);
			if (!job || job.organizationId !== organizationId) {
				res.status(404).json(buildErrorResponse("Import job not found or expired", 404));
				return;
			}
			if (job.status !== "processing") {
				res.status(200).json(buildSuccessResponse("Import job already finished", job, 200));
				return;
			}
			updateDeviceImportJob(jobId, {
				cancelRequested: true,
				cancelRequestedAt: new Date(),
				message: "Cancel requested",
			});
			res.status(200).json(
				buildSuccessResponse(
					"Device log sync cancellation requested",
					getHikvisionImportProgress(jobId) || job,
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to cancel device log sync", 500),
			);
		}
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
				res.status(403).json(
					buildErrorResponse("Only admins can reset saved device events", 403),
				);
				return;
			}

			const execute = Boolean((req.body as any)?.execute);
			const includeLinkedAttendance = Boolean((req.body as any)?.includeLinkedAttendance);
			const { where, scope } = buildDeviceEventResetScope(req, organizationId);

			if (!execute) {
				const isAllTimeScope =
					scope.deviceId === "all" &&
					scope.source === "all" &&
					scope.status === "all" &&
					!scope.from &&
					!scope.to;
				const deviceEventsCount = await prisma.deviceEvent.count({ where });
				const [devicesInScope, linkedAttendanceInScope] = isAllTimeScope
					? [[], []]
					: await Promise.all([
							prisma.deviceEvent.groupBy({
								by: ["deviceId"],
								where,
							}),
							prisma.deviceEvent.groupBy({
								by: ["attendanceId"],
								where: {
									...where,
									attendanceId: { not: null },
								} as Prisma.DeviceEventWhereInput,
							}),
						]);
				const counts = {
					devices: isAllTimeScope ? 0 : devicesInScope.length,
					deviceEvents: deviceEventsCount,
					linkedAttendance: isAllTimeScope ? 0 : linkedAttendanceInScope.length,
					importJobs: deviceImportJobs.size,
				};

				res.status(200).json(
					buildSuccessResponse(
						"Device event reset preview generated",
						{
							mode: "preview",
							scope,
							counts,
							affectedModels: [
								"DeviceEvent",
								"Attendance (linked only, optional)",
								"Device (export only)",
							],
						},
						200,
					),
				);
				return;
			}

			const hasDeviceEventColumns = await getDeviceEventColumnPresence();
			const events = await prisma.deviceEvent.findMany({
				where,
				orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
				select: {
					id: true,
					organizationId: true,
					deviceId: true,
					deviceUserId: hasDeviceEventColumns.deviceUserId,
					employeeId: true,
					attendanceId: true,
					eventTime: true,
					receivedAt: true,
					employeeNo: true,
					source: true,
					status: true,
					eventCategory: hasDeviceEventColumns.eventCategory,
					eventAction: hasDeviceEventColumns.eventAction,
					eventLabel: hasDeviceEventColumns.eventLabel,
					eventConfidence: hasDeviceEventColumns.eventConfidence,
					eventType: true,
					major: true,
					minor: true,
					doorNo: true,
					verifyMode: true,
					dedupeKey: true,
					payload: true,
					errorMessage: true,
					createdAt: true,
					updatedAt: true,
				},
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

			const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
			const backupDir = path.join(
				getProjectRuntimeRoot(),
				"backups",
				`device-events-reset-${timestamp}`,
			);
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
				affectedModels: [
					"DeviceEvent",
					"Attendance (linked only, optional)",
					"Device (export only)",
					"Import jobs (memory snapshot only)",
				],
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
					? await prisma.attendance.count({
							where: { id: { in: attendanceIds }, organizationId },
						})
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
					...(selectedDeviceId && selectedDeviceId !== "all"
						? { id: selectedDeviceId }
						: {}),
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
						return {
							...device,
							vendor: "Hikvision",
							source: "HIKVISION_CALLBACK" as const,
						};
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
			const deviceUserRows = (await hasDeviceUserTable())
				? ((await (prisma as any).deviceUser.findMany({
						where: {
							organizationId: String(organizationId),
							deviceId: { in: syncDevices.map((device) => device.id) },
						},
						select: {
							deviceId: true,
							vendorUserId: true,
							status: true,
							employeeId: true,
							rawPayload: true,
						},
					})) as SavedDeviceUserTruthRow[])
				: [];
			const deviceUserRowsByDeviceId = deviceUserRows.reduce(
				(groups: Map<string, SavedDeviceUserTruthRow[]>, row) => {
					const deviceId = String(row.deviceId || "").trim();
					if (!deviceId) return groups;
					const bucket = groups.get(deviceId) || [];
					bucket.push(row);
					groups.set(deviceId, bucket);
					return groups;
				},
				new Map<string, SavedDeviceUserTruthRow[]>(),
			);
			const deviceUserSummaryByDeviceId = new Map<
				string,
				ReturnType<typeof summarizeDeviceUserStatuses>
			>();
			for (const device of syncDevices) {
				deviceUserSummaryByDeviceId.set(
					device.id,
					summarizeDeviceUserStatuses(deviceUserRowsByDeviceId.get(device.id) || []),
				);
			}
			const peerBaselineByVendor = new Map<
				string,
				{
					deviceId: string;
					deviceName: string;
					rows: SavedDeviceUserTruthRow[];
					summary: ReturnType<typeof summarizeSavedDeviceUserTruth>;
				}
			>();
			for (const [vendor, vendorDevices] of syncDevices
				.reduce<Map<string, Array<(typeof syncDevices)[number]>>>((groups, device) => {
					const bucket = groups.get(device.vendor) || [];
					bucket.push(device);
					groups.set(device.vendor, bucket);
					return groups;
				}, new Map<string, Array<(typeof syncDevices)[number]>>())
				.entries()) {
				const rankedDevices = vendorDevices
					.map((device) => ({
						deviceId: device.id,
						deviceName: String(device.name || "").trim() || "Unnamed device",
						rows: deviceUserRowsByDeviceId.get(device.id) || [],
						summary: summarizeSavedDeviceUserTruth(
							deviceUserRowsByDeviceId.get(device.id) || [],
						),
					}))
					.sort((left, right) => {
						if (right.summary.userCount !== left.summary.userCount) {
							return right.summary.userCount - left.summary.userCount;
						}
						if (right.summary.fingerprintCount !== left.summary.fingerprintCount) {
							return right.summary.fingerprintCount - left.summary.fingerprintCount;
						}
						if (right.summary.faceCount !== left.summary.faceCount) {
							return right.summary.faceCount - left.summary.faceCount;
						}
						if (right.summary.cardCount !== left.summary.cardCount) {
							return right.summary.cardCount - left.summary.cardCount;
						}
						return left.deviceName.localeCompare(right.deviceName);
					});
				if (rankedDevices[0]) {
					peerBaselineByVendor.set(vendor, rankedDevices[0]);
				}
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

			const hikvisionTotals = new Map<
				string,
				Awaited<ReturnType<typeof getHikvisionSourceTotal>>
			>();
			await Promise.all(
				syncDevices
					.filter((device) => device.vendor === "Hikvision")
					.map(async (device) => {
						hikvisionTotals.set(
							device.id,
							await getHikvisionSourceTotal(req, device.id),
						);
					}),
			);
			const latestCompletedRuns = await Promise.all(
				syncDevices.map(async (device) => {
					const run = await findLatestCompletedDeviceLogRun(
						String(organizationId),
						device.id,
						device.source,
					);
					return [device.id, run] as const;
				}),
			);
			const latestRunByDeviceId = new Map(latestCompletedRuns);

			const previewRows = syncDevices.map((device) => {
				const syncedEvents =
					savedCountByDeviceAndSource.get(`${device.id}|${device.source}`) || 0;
				const deviceUserSummary = deviceUserSummaryByDeviceId.get(device.id) || {
					total: 0,
					active: 0,
					matched: 0,
					unmatched: 0,
					conflict: 0,
					disabled: 0,
				};
				const latestRun = latestRunByDeviceId.get(device.id);
				const knownSkippedEvents = Number(latestRun?.skippedRecords || 0);
				const failedEvents = Number(latestRun?.failedRecords || 0);
				const sourcePreview =
					device.vendor === "ZKTeco"
						? zktecoPreviewByIp.get(String(device.address || "").trim())
						: hikvisionTotals.get(device.id);
				const peerBaseline = peerBaselineByVendor.get(device.vendor) || null;
				const peerDrift =
					peerBaseline && peerBaseline.deviceId !== device.id
						? compareSavedDeviceUserTruth(
								peerBaseline.rows,
								deviceUserRowsByDeviceId.get(device.id) || [],
							)
						: {
								missingUsers: 0,
								staleUsers: 0,
								missingFingerprintCount: 0,
								missingFaceCount: 0,
								missingCardCount: 0,
								totalCredentialGapCount: 0,
								totalNeedsMatchCount: 0,
							};
				const totalEvents =
					device.vendor === "ZKTeco"
						? (sourcePreview?.totalEvents ?? null)
						: (sourcePreview?.totalEvents ?? null);
				const vendorUserCount =
					device.vendor === "ZKTeco"
						? firstNumericValueForKeys(sourcePreview, [
								"userCount",
								"usersCount",
								"totalUsers",
								"userTotal",
								"users",
							])
						: (sourcePreview?.userCount ?? null);
				const totalUnsavedEvents =
					totalEvents !== null &&
					totalEvents !== undefined &&
					Number.isFinite(Number(totalEvents))
						? Math.max(Number(totalEvents) - syncedEvents, 0)
						: null;
				const needsSyncEvents =
					totalUnsavedEvents !== null && totalUnsavedEvents !== undefined
						? Math.max(totalUnsavedEvents - knownSkippedEvents, 0)
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
					device.vendor === "Hikvision" &&
					rawSourceErrorMessage &&
					/^\d+$/.test(rawSourceErrorMessage)
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
					hrisUserCount: deviceUserSummary.total,
					linkedUserCount: deviceUserSummary.matched,
					openUserCount: deviceUserSummary.unmatched,
					conflictUserCount: deviceUserSummary.conflict,
					disabledUserCount: deviceUserSummary.disabled,
					peerBaselineDeviceId: peerBaseline?.deviceId || null,
					peerBaselineDeviceName: peerBaseline?.deviceName || null,
					peerMissingUserCount: peerDrift.missingUsers,
					peerStaleUserCount: peerDrift.staleUsers,
					peerMissingFingerprintCount: peerDrift.missingFingerprintCount,
					peerMissingFaceCount: peerDrift.missingFaceCount,
					peerMissingCardCount: peerDrift.missingCardCount,
					peerDriftTotalCount: peerDrift.totalNeedsMatchCount,
					peerCredentialGapCount: peerDrift.totalCredentialGapCount,
					knownSkippedEventCount: knownSkippedEvents,
					totalUnsavedEventCount: totalUnsavedEvents,
					importableIfSkipMissingEmployeeNo: needsSyncEvents,
					importableIfSaveMissingEmployeeNo: totalUnsavedEvents,
					failedEventCount: failedEvents,
					importableSavedCount: syncedEvents,
					missingEventCount: needsSyncEvents,
					canStartSync,
					syncAction: canStartSync
						? device.vendor === "Hikvision"
							? "hikvision-import"
							: "zkteco-bridge-sync"
						: null,
					status: sourceErrorMessage
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
			const healthPort = isZkteco
				? Number(device.port || 4370)
				: getHikvisionDeviceHttpPort(device);
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
			const bridgeDevice = isZkteco
				? getBridgeDeviceStatus(zktecoBridge, parsedAddress)
				: null;
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
				: [{ ok: true }, { ok: network.ok }, { ok: Boolean(deviceApi?.ok) }];
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

	const readHikvisionListenerStatus = async () => {
		const fallbackTarget = getHikvisionListenerVmTargets()[0];
		const [activeResult, showResult, tailResult] = await Promise.all([
			runHikvisionListenerVmCommand(
				["systemctl", "is-active", HIKVISION_HOT_RELOAD_LISTENER_SERVICE],
				7000,
			),
			runHikvisionListenerVmCommand(
				[
					"systemctl",
					"show",
					HIKVISION_HOT_RELOAD_LISTENER_SERVICE,
					"--property=ActiveState,SubState,MainPID,NRestarts,ExecMainStatus,Result",
					"--no-pager",
				],
				7000,
			),
			runHikvisionListenerVmCommand(
				[
					"sudo",
					"tail",
					"-n",
					"80",
					"/var/log/project-truth/hikvision-hot-reload-listener.jsonl",
				],
				7000,
			),
		]);

		const show = parseSystemctlShow(showResult.stdout);
		const activeText = activeResult.stdout.trim();
		const activeState = show.ActiveState || activeText || "unknown";
		const subState = show.SubState || "unknown";
		const running = activeState === "active" && subState !== "failed";
		const recentLogLines = tailResult.stdout
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean)
			.slice(-80);
		const sdk = summarizeHikvisionListenerLogs(recentLogLines);
		const resolvedTarget =
			activeResult.exitCode === 0
				? activeResult.target
				: showResult.exitCode === 0
					? showResult.target
					: tailResult.exitCode === 0
						? tailResult.target
						: fallbackTarget;
		const controlAvailable =
			showResult.exitCode === 0 || activeResult.exitCode === 0 || Boolean(activeText);
		const statusError =
			showResult.exitCode === 0
				? null
				: showResult.stderr.trim() || activeResult.stderr.trim() || null;

		return {
			service: HIKVISION_HOT_RELOAD_LISTENER_SERVICE,
			vm: {
				host: resolvedTarget?.host || fallbackTarget?.host || "unknown",
				user: resolvedTarget?.user || fallbackTarget?.user || "infra",
				path: resolvedTarget?.label || fallbackTarget?.label || "unknown",
			},
			running,
			status: running ? "running" : activeState === "inactive" ? "stopped" : activeState,
			sdk,
			activeState,
			subState,
			mainPid: Number(show.MainPID || 0) || null,
			restarts: Number(show.NRestarts || 0) || 0,
			execMainStatus: Number(show.ExecMainStatus || 0) || 0,
			result: show.Result || null,
			checkedAt: new Date().toISOString(),
			control: {
				available: controlAvailable,
				actions: ["start", "stop", "restart"],
			},
			logs: {
				available: tailResult.exitCode === 0,
				recent: recentLogLines,
				error:
					tailResult.exitCode === 0
						? null
						: tailResult.stderr.trim() || tailResult.stdout.trim() || null,
			},
			error: statusError,
		};
	};

	const getHikvisionListenerStatus = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const admin = assertDeviceUserAdmin(req, res);
			if (!admin) return;
			const status = await readHikvisionListenerStatus();
			res.status(200).json(
				buildSuccessResponse("Hikvision hot-reload listener status loaded", status, 200),
			);
		} catch (error: any) {
			deviceLogger.error(`Hikvision listener status failed: ${error?.message || error}`);
			res.status(500).json(
				buildErrorResponse("Failed to load Hikvision listener status", 500),
			);
		}
	};

	const controlHikvisionListener = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const admin = assertDeviceUserAdmin(req, res);
			if (!admin) return;
			const action = String(req.body?.action || "")
				.trim()
				.toLowerCase();
			if (!HIKVISION_LISTENER_CONTROL_ACTIONS.has(action)) {
				res.status(400).json(buildErrorResponse("Unsupported listener action", 400));
				return;
			}

			if (action !== "stop") {
				const managedWrapper = await installManagedHikvisionListenerWrapperOnVm();
				if (!managedWrapper.ok) {
					res.status(502).json(
						buildErrorResponse(
							managedWrapper.error || "Failed to prepare Hikvision listener runtime",
							502,
						),
					);
					return;
				}
			}

			const result = await runHikvisionListenerVmCommand(
				["sudo", "systemctl", action, HIKVISION_HOT_RELOAD_LISTENER_SERVICE],
				12000,
			);

			if (result.exitCode !== 0) {
				res.status(502).json(
					buildErrorResponse(
						result.stderr.trim() || result.stdout.trim() || "Listener control failed",
						502,
					),
				);
				return;
			}

			const status = await readHikvisionListenerStatus();
			logActivity(req, {
				userId: String((req as any).userId || "unknown"),
				action: "HIKVISION_LISTENER_CONTROL",
				description: `Hikvision hot-reload listener ${action}`,
				page: {
					url: req.originalUrl,
					title: "Device Attendance",
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					`Hikvision hot-reload listener ${action} requested`,
					{ action, status },
					200,
				),
			);
		} catch (error: any) {
			deviceLogger.error(`Hikvision listener control failed: ${error?.message || error}`);
			res.status(500).json(buildErrorResponse("Failed to control Hikvision listener", 500));
		}
	};

	const reconcileHikvisionRuntimeAfterDeviceChange = async (
		device: { id?: string; name?: string | null; config?: Prisma.JsonValue | null },
		reason: string,
	) => {
		if (!isHikvisionDevice(device)) return;

		const managedWrapper = await installManagedHikvisionListenerWrapperOnVm();
		if (!managedWrapper.ok) {
			deviceLogger.warn(
				`Hikvision runtime wrapper sync skipped after ${reason} for ${device.id || device.name}: ${
					managedWrapper.error || "unknown_error"
				}`,
			);
			return;
		}

		const restartResult = await runHikvisionListenerVmCommand(
			["sudo", "systemctl", "restart", HIKVISION_HOT_RELOAD_LISTENER_SERVICE],
			15000,
		);

		if (restartResult.exitCode !== 0) {
			deviceLogger.warn(
				`Hikvision listener restart failed after ${reason} for ${device.id || device.name}: ${
					restartResult.stderr.trim() || restartResult.stdout.trim() || "unknown_error"
				}`,
			);
			return;
		}

		deviceLogger.info(
			`Hikvision listener runtime reconciled after ${reason} for ${device.id || device.name}`,
		);
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
			const organizationId =
				validation.data.organizationId || String((req as any).organizationId || "");
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("Organization ID not found", 400));
				return;
			}

			const deviceData = {
				...validation.data,
				organizationId,
				access: validation.data.access || {},
				config: buildDeviceRuntimeConfig({
					config: validation.data.config,
					name: validation.data.name,
					protocol: validation.data.protocol,
					port: validation.data.port,
				}),
			};

			const device = await prisma.device.create({ data: deviceData });
			deviceLogger.info(`Device created successfully: ${device.id}`);

			if (
				isHikvisionDevice(device) &&
				String((device as any)?.access?.password || "").trim()
			) {
				try {
					await syncHikvisionDeviceUsersFromSource({
						req,
						organizationId,
						device,
						startedByUserId: (req as any).userId || null,
					});
					await invalidateCache.byPattern("cache:device:*").catch(() => undefined);
					deviceLogger.info(`Post-create Hikvision device users synced for ${device.id}`);
				} catch (postCreateSyncError: any) {
					deviceLogger.warn(
						`Post-create Hikvision device user sync failed for ${device.id}: ${
							postCreateSyncError?.message || postCreateSyncError
						}`,
					);
				}
			}
			await reconcileHikvisionRuntimeAfterDeviceChange(device, "device_create");

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
			if (isDeviceAddressPortUniqueError(error)) {
				deviceLogger.warn(`Device endpoint conflict while creating device: ${error}`);
				res.status(409).json(buildDeviceAddressPortConflictResponse());
				return;
			}

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
			const eventCategory = String(req.query.eventCategory || "")
				.trim()
				.toUpperCase();
			const eventAction = String(req.query.eventAction || "")
				.trim()
				.toUpperCase();
			const query = String(req.query.query || req.query.search || "").trim();
			const from = String(req.query.from || "").trim();
			const to = String(req.query.to || "").trim();
			const dateField = String(req.query.dateField || "eventTime").trim();
			const sort = String(req.query.sort || "eventTime").trim();
			const order =
				String(req.query.order || "desc").toLowerCase() === "asc" ? "asc" : "desc";
			const dateColumnSql =
				dateField === "receivedAt"
					? Prisma.sql`de."receivedAt"`
					: Prisma.sql`de."eventTime"`;

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
			const hasDeviceEventColumns = await getDeviceEventColumnPresence();
			const hasDeviceUsersTable = await hasDeviceUserTable();
			const hasDeviceUserReference =
				hasDeviceUsersTable && hasDeviceEventColumns.deviceUserId;

			if (
				eventCategory &&
				eventCategory !== "ALL" &&
				DEVICE_EVENT_CATEGORIES.has(eventCategory) &&
				hasDeviceEventColumns.eventCategory
			) {
				whereConditions.push(
					Prisma.sql`de."eventCategory" = ${eventCategory}::"DeviceEventCategory"`,
				);
			}
			if (
				eventAction &&
				eventAction !== "ALL" &&
				DEVICE_EVENT_ACTIONS.has(eventAction) &&
				hasDeviceEventColumns.eventAction
			) {
				whereConditions.push(
					Prisma.sql`de."eventAction" = ${eventAction}::"DeviceEventAction"`,
				);
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
					${
						hasDeviceEventColumns.eventLabel
							? Prisma.sql`OR de."eventLabel" ILIKE ${queryLike}`
							: Prisma.sql``
					}
					OR de."doorNo" ILIKE ${queryLike}
					OR d."name" ILIKE ${queryLike}
					OR d."address" ILIKE ${queryLike}
					OR du."vendorUserId" ILIKE ${queryLike}
					OR du."displayName" ILIKE ${queryLike}
					OR COALESCE(employee_by_id."employeeId", employee_by_device_user."employeeId", employee_by_device."employeeId", employee_by_code."employeeId") ILIKE ${queryLike}
					OR COALESCE(employee_by_id."deviceEmpId", employee_by_device_user."deviceEmpId", employee_by_device."deviceEmpId", employee_by_code."deviceEmpId") ILIKE ${queryLike}
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
						AND COALESCE(employee_by_id."employeeId", employee_by_device_user."employeeId", employee_by_device."employeeId", employee_by_code."employeeId") IN (
							${query},
							${strippedNumericQuery},
							${paddedEmployeeCode}
						)
					)
				)`);
			}

			const whereSql = Prisma.sql`WHERE ${Prisma.join(whereConditions, " AND ")}`;
			const deviceUserIdSql = hasDeviceEventColumns.deviceUserId
				? Prisma.sql`de."deviceUserId"`
				: Prisma.sql`NULL::text`;
			const eventCategorySql = hasDeviceEventColumns.eventCategory
				? Prisma.sql`de."eventCategory"::text`
				: Prisma.sql`'UNKNOWN_VENDOR'::text`;
			const eventActionSql = hasDeviceEventColumns.eventAction
				? Prisma.sql`de."eventAction"::text`
				: Prisma.sql`'UNKNOWN'::text`;
			const eventLabelSql = hasDeviceEventColumns.eventLabel
				? Prisma.sql`de."eventLabel"`
				: Prisma.sql`COALESCE(de."eventType", 'Device event')`;
			const eventConfidenceSql = hasDeviceEventColumns.eventConfidence
				? Prisma.sql`de."eventConfidence"::text`
				: Prisma.sql`'UNKNOWN'::text`;
			const deviceUserJoinSql = hasDeviceUserReference
				? Prisma.sql`LEFT JOIN device_users du ON du.id = ${deviceUserIdSql}`
				: Prisma.sql`
					LEFT JOIN LATERAL (
						SELECT
							NULL::text AS id,
							NULL::text AS "vendorUserId",
							NULL::text AS "employeeNo",
							NULL::text AS "displayName",
							NULL::text AS status,
							NULL::text AS "employeeId"
					) du ON true
				`;
			const baseFromSql = Prisma.sql`
				FROM device_events de
				LEFT JOIN "Device" d ON d.id = de."deviceId"
				${deviceUserJoinSql}
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
						AND du."employeeId" IS NOT NULL
						AND emp."organizationId" = de."organizationId"
						AND emp."isDeleted" = false
						AND emp.id = du."employeeId"
					LIMIT 1
				) employee_by_device_user ON true
				LEFT JOIN LATERAL (
					SELECT emp.id, emp."employeeId", emp."deviceEmpId", emp."personId"
					FROM employees emp
					WHERE employee_by_id.id IS NULL
						AND employee_by_device_user.id IS NULL
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
						AND employee_by_device_user.id IS NULL
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
					employee_by_device_user."personId",
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
			const orderColumnSqlBySort: Record<string, Prisma.Sql> = {
				deviceName: Prisma.sql`d."name"`,
				eventTime: Prisma.sql`de."eventTime"`,
				updatedAt: Prisma.sql`de."updatedAt"`,
				status: Prisma.sql`de."status"`,
				source: Prisma.sql`de."source"`,
				eventCategory: hasDeviceEventColumns.eventCategory
					? Prisma.sql`de."eventCategory"`
					: Prisma.sql`de."receivedAt"`,
				eventAction: hasDeviceEventColumns.eventAction
					? Prisma.sql`de."eventAction"`
					: Prisma.sql`de."receivedAt"`,
				employeeNo: Prisma.sql`de."employeeNo"`,
				doorNo: Prisma.sql`de."doorNo"`,
			};
			const orderColumnSql = orderColumnSqlBySort[sort] || Prisma.sql`de."receivedAt"`;
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
					${deviceUserIdSql} AS "deviceUserId",
					de."employeeId",
					de."attendanceId",
					de."eventTime",
					de."receivedAt",
					de."employeeNo",
					de.source::text AS source,
					de.status::text AS status,
					${eventCategorySql} AS "eventCategory",
					${eventActionSql} AS "eventAction",
					${eventLabelSql} AS "eventLabel",
					${eventConfidenceSql} AS "eventConfidence",
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
							'protocol', d.protocol::text,
							'config', d.config
						)
					END AS device,
					CASE
						WHEN du.id IS NULL THEN NULL
						ELSE JSON_BUILD_OBJECT(
							'id', du.id,
							'vendorUserId', du."vendorUserId",
							'employeeNo', du."employeeNo",
							'displayName', du."displayName",
							'status', du.status::text,
							'employeeId', du."employeeId"
						)
					END AS "deviceUser",
					CASE
						WHEN COALESCE(employee_by_id.id, employee_by_device_user.id, employee_by_device.id, employee_by_code.id) IS NULL THEN NULL
						ELSE JSON_BUILD_OBJECT(
							'id', COALESCE(employee_by_id.id, employee_by_device_user.id, employee_by_device.id, employee_by_code.id),
							'employeeId', COALESCE(employee_by_id."employeeId", employee_by_device_user."employeeId", employee_by_device."employeeId", employee_by_code."employeeId"),
							'deviceEmpId', COALESCE(employee_by_id."deviceEmpId", employee_by_device_user."deviceEmpId", employee_by_device."deviceEmpId", employee_by_code."deviceEmpId"),
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
								COALESCE(employee_by_id."employeeId", employee_by_device_user."employeeId", employee_by_device."employeeId", employee_by_code."employeeId")
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
			const categoryGroupsSql = Prisma.sql`
				SELECT ${eventCategorySql} AS "eventCategory", COUNT(*)::bigint AS count
				${aggregateFromSql}
				${whereSql}
				GROUP BY 1
			`;
			const actionGroupsSql = Prisma.sql`
				SELECT ${eventActionSql} AS "eventAction", COUNT(*)::bigint AS count
				${aggregateFromSql}
				${whereSql}
				GROUP BY 1
			`;

			const [events, totalRows, statusGroups, sourceGroups, categoryGroups, actionGroups] =
				await Promise.all([
					prisma.$queryRaw<any[]>(eventsSql),
					prisma.$queryRaw<Array<{ total: bigint | number }>>(countSql),
					prisma.$queryRaw<Array<{ status: string; count: bigint | number }>>(
						statusGroupsSql,
					),
					prisma.$queryRaw<Array<{ source: string; count: bigint | number }>>(
						sourceGroupsSql,
					),
					prisma.$queryRaw<Array<{ eventCategory: string; count: bigint | number }>>(
						categoryGroupsSql,
					),
					prisma.$queryRaw<Array<{ eventAction: string; count: bigint | number }>>(
						actionGroupsSql,
					),
				]);
			const total = Number(totalRows[0]?.total || 0);
			const enrichedEvents = events.map((event) => {
				const runtimeLabels = classifyDeviceEvent(event);
				return {
					...event,
					taxonomy: {
						eventCategory: event.eventCategory,
						eventAction: event.eventAction,
						eventLabel: event.eventLabel,
						eventConfidence: event.eventConfidence,
						processingLabel: runtimeLabels.processingLabel,
						transportLabel: runtimeLabels.transportLabel,
						capabilityConfidence: String(
							event.eventConfidence || "UNKNOWN",
						).toLowerCase(),
					},
				};
			});
			const byProcessingResult = Object.fromEntries(
				statusGroups.map((item: any) => [item.status, Number(item.count || 0)]),
			);
			const byRuntimePath = Object.fromEntries(
				sourceGroups.map((item: any) => [item.source, Number(item.count || 0)]),
			);
			const byCategory = Object.fromEntries(
				categoryGroups.map((item: any) => [item.eventCategory, Number(item.count || 0)]),
			);
			const byAction = Object.fromEntries(
				actionGroups.map((item: any) => [item.eventAction, Number(item.count || 0)]),
			);

			const summary = {
				total,
				byCategory,
				byAction,
				byProcessingResult,
				byRuntimePath,
				byStatus: byProcessingResult,
				bySource: byRuntimePath,
			};

			res.status(200).json(
				buildSuccessResponse(
					"Device events retrieved successfully",
					{
						events: enrichedEvents,
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

			const nextOrganizationId = String(
				validatedData.organizationId || (existingDevice as any).organizationId || "",
			);
			const nextAddress = String(
				validatedData.address || (existingDevice as any).address || "",
			);
			const nextPort =
				typeof validatedData.port === "number"
					? validatedData.port
					: Number((existingDevice as any).port);

			if (nextOrganizationId && nextAddress && Number.isFinite(nextPort)) {
				const conflictingDevice = await prisma.device.findFirst({
					where: {
						organizationId: nextOrganizationId,
						address: nextAddress,
						port: nextPort,
						NOT: { id },
					},
					select: {
						id: true,
						name: true,
						address: true,
						port: true,
						isDeleted: true,
					},
				});

				if (conflictingDevice && !conflictingDevice.isDeleted) {
					res.status(409).json(buildDeviceAddressPortConflictResponse());
					return;
				}

				if (conflictingDevice?.isDeleted) {
					await prisma.device.update({
						where: { id: conflictingDevice.id },
						data: { address: buildReleasedDeviceAddress(conflictingDevice) },
					});
					deviceLogger.info(
						`Released soft-deleted device endpoint before device ${id} update: ${conflictingDevice.id}`,
					);
				}
			}

			const prismaData = {
				...validatedData,
				...(validatedData.config !== undefined ||
				validatedData.name !== undefined ||
				validatedData.protocol !== undefined ||
				validatedData.port !== undefined
					? {
							config: buildDeviceRuntimeConfig({
								config: validatedData.config,
								existingConfig: existingDevice.config,
								name: validatedData.name || existingDevice.name,
								protocol: validatedData.protocol || existingDevice.protocol,
								port:
									typeof validatedData.port === "number"
										? validatedData.port
										: existingDevice.port,
							}),
						}
					: {}),
				...(validatedData.access !== undefined
					? { access: validatedData.access || {} }
					: {}),
			};

			const updatedDevice = await prisma.device.update({
				where: { id },
				data: prismaData,
			});
			await reconcileHikvisionRuntimeAfterDeviceChange(updatedDevice, "device_update");

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
			if (isDeviceAddressPortUniqueError(error)) {
				deviceLogger.warn(`Device endpoint conflict while updating ${id}: ${error}`);
				res.status(409).json(buildDeviceAddressPortConflictResponse());
				return;
			}

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
				data: {
					isDeleted: true,
					address: buildReleasedDeviceAddress(existingDevice),
				},
			});
			await reconcileHikvisionRuntimeAfterDeviceChange(existingDevice, "device_delete");

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
				select: { id: true, name: true, config: true, access: true },
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
			let enrolledDeviceUser: any = null;

			if (isHikvisionDevice(device)) {
				let existingTargetDeviceUser = await (prisma as any).deviceUser.findUnique({
					where: {
						organizationId_deviceId_vendorUserId: {
							organizationId: String(organizationId),
							deviceId: String(device.id),
							vendorUserId: normalizedDeviceEmpId,
						},
					},
					select: { id: true, employeeId: true },
				});
				if (!existingTargetDeviceUser?.id) {
					await syncSingleHikvisionDeviceUserFromSource({
						req,
						organizationId: String(organizationId),
						device,
						employeeNo: normalizedDeviceEmpId,
					}).catch((error: any) => {
						deviceLogger.warn(
							`Target single-user sync before enroll did not complete for ${device.id}/${normalizedDeviceEmpId}: ${error?.message || error}`,
						);
					});
					existingTargetDeviceUser = await (prisma as any).deviceUser.findUnique({
						where: {
							organizationId_deviceId_vendorUserId: {
								organizationId: String(organizationId),
								deviceId: String(device.id),
								vendorUserId: normalizedDeviceEmpId,
							},
						},
						select: { id: true, employeeId: true },
					});
				}
				if (!existingTargetDeviceUser?.id) {
					const sourceDeviceCandidates = await (prisma as any).deviceUser.findMany({
						where: {
							organizationId: String(organizationId),
							vendorUserId: normalizedDeviceEmpId,
							deviceId: { not: String(device.id) },
							device: {
								isDeleted: false,
							},
						},
						select: {
							deviceId: true,
							device: {
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
								},
							},
						},
					});
					const sourceDeviceUser = sourceDeviceCandidates.find(
						(candidate: any) =>
							candidate?.device && isHikvisionDevice(candidate.device),
					);
					if (!sourceDeviceUser?.deviceId) {
						res.status(409).json(
							buildErrorResponse(
								`Target device does not currently have Hikvision user ${normalizedDeviceEmpId}, and no other saved Hikvision source row was found to copy from`,
								409,
							),
						);
						return;
					}

					await runHikvisionManualCopyOnVm({
						sourceDevice: sourceDeviceUser.device,
						targetDevice: device,
						sourceDeviceId: String(sourceDeviceUser.deviceId),
						targetDeviceId: String(device.id),
						employeeNo: normalizedDeviceEmpId,
						includeFingerprints: true,
						includeFaceRecognition: true,
					});
					await syncSingleHikvisionDeviceUserFromSource({
						req,
						organizationId: String(organizationId),
						device,
						employeeNo: normalizedDeviceEmpId,
					});
					await mirrorDeviceUserLinkToPeer({
						organizationId: String(organizationId),
						sourceDeviceId: String(sourceDeviceUser.deviceId),
						targetDeviceId: String(device.id),
						vendorUserId: normalizedDeviceEmpId,
					});
				}
			}

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
			if (await hasDeviceUserTable()) {
				enrolledDeviceUser = await (prisma as any).deviceUser.upsert({
					where: {
						organizationId_deviceId_vendorUserId: {
							organizationId: String(organizationId),
							deviceId: String(device.id),
							vendorUserId: normalizedDeviceEmpId,
						},
					},
					create: {
						organizationId: String(organizationId),
						deviceId: String(device.id),
						vendorUserId: normalizedDeviceEmpId,
						employeeNo: normalizedDeviceEmpId,
						displayName:
							(employee as any)?.person?.personalInfo?.fullName ||
							(employee as any)?.employeeId ||
							normalizedDeviceEmpId,
						status: "ACTIVE",
						employeeId: employee.id,
						rawPayload: {
							hrisEnrollment: {
								source: "enroll_endpoint",
								enrolledAt: new Date().toISOString(),
								userId: String(targetUser.id),
							},
						},
						lastSyncedAt: new Date(),
					},
					update: {
						employeeId: employee.id,
						employeeNo: normalizedDeviceEmpId,
						status: "ACTIVE",
						rawPayload: {
							hrisEnrollment: {
								source: "enroll_endpoint",
								enrolledAt: new Date().toISOString(),
								userId: String(targetUser.id),
							},
						},
						lastSyncedAt: new Date(),
					},
					select: buildDeviceUserSelect({
						includeVendorMetadata: await hasDeviceUserVendorMetadataColumn(),
					}),
				});
			}

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
						deviceUser: enrolledDeviceUser ? decorateDeviceUser(enrolledDeviceUser) : null,
						deviceUserLinked: Boolean(enrolledDeviceUser?.employeeId),
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
						const updateUserUrl = helpers.buildAuthServiceUrl(
							`/api/user/${targetUser.id}`,
						);
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
		getHikvisionListenerStatus,
		controlHikvisionListener,
		getDeviceSyncPreview,
		getDeviceSyncRuns,
		getDeviceActivity,
		listDeviceUsers,
		getDeviceUserPhoto,
		syncDeviceUsers,
		previewDeviceUserExport,
		exportDeviceUsers,
		previewDeviceUserImport,
		executeDeviceUserImport,
		getDeviceUserImportJob,
		backfillDeviceUserLifecycleEvents,
		backfillDeviceUserBiometricMetadata,
		reconcileBiometricSync,
		copyHikvisionDeviceUserToPeer,
		planHikvisionSdkUserMerge,
		applyHikvisionSdkUserMerge,
		startHikvisionSdkUserMergeJob,
		getHikvisionSdkUserMergeJob,
		mirrorHikvisionFaceToPeers,
		mockHikvisionFingerprintTally,
		mockHikvisionFaceTally,
		backfillDeviceUsers,
		linkDeviceUser,
		unlinkDeviceUser,
		resetDeviceEvents,
		triggerZktecoAttendanceSync,
		triggerHikvisionAttendanceImport,
		getDeviceImportJob,
		cancelDeviceImportJob,
		startDeviceUserSyncJob,
		getDeviceUserSyncJob,
		cancelDeviceUserSyncJob,
		getById,
		update,
		remove,
		enrollDeviceUser,
		importDeviceEnrollment,
	};
};
