import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../../../generated/prisma";
import { buildSuccessResponse } from "../../../helper/success-handler.helper";
import { buildErrorResponse } from "../../../helper/error-handler";
import { hikvisionEndpoint } from "../../../config/hikvision.endpoint";
import { hikvisionFetch } from "../../../lib/hikvision-client";
import {
	getHikvisionClockSkewSecondsFromSystemTime,
	getHikvisionObservedClockSkewSeconds,
	normalizeHikvisionAcsEventListTimes,
} from "../../../helper/hikvision-event-contract.helper";
import {
	captureOpaqueTokenAfterUserWrite,
	extractDisplayNameFromUserInfoBody,
	extractPlainEmployeeNoFromUserInfoBody,
	scheduleOperationLogResolveAfterSdkSignal,
} from "../../../helper/device-person-token.helper";
import { controller as callbackController } from "./callback.controller";

export const controller = (prisma: PrismaClient) => {
	const fetchFromDevice = (
		req: Request,
		endpoint: string,
		options: Parameters<typeof hikvisionFetch>[1] = {},
	) => hikvisionFetch(endpoint, { ...options, prisma, request: req });

	const scheduleWriteTimePersonTokenCapture = (params: {
		req: Request;
		userInfoBody: unknown;
		source: "USER_INFO_RECORD" | "USER_INFO_MODIFY";
	}) => {
		const plainEmployeeNo = extractPlainEmployeeNoFromUserInfoBody(params.userInfoBody);
		const deviceId = String(
			params.req.body?.deviceId ||
				params.req.query?.deviceId ||
				(params.req.body as any)?.UserInfo?.deviceId ||
				"",
		).trim();
		const organizationId = getRequestOrganizationId(params.req);
		if (!plainEmployeeNo || !deviceId || !organizationId) return;
		const writeMs = Date.now();
		const displayName = extractDisplayNameFromUserInfoBody(params.userInfoBody);
		// Fire-and-forget: never block enroll response on logSearch capture.
		void captureOpaqueTokenAfterUserWrite({
			prisma,
			req: params.req,
			deviceId,
			organizationId,
			plainEmployeeNo,
			displayName,
			source: params.source,
			writeMs,
			settleMs: 1200,
		}).catch((error) => {
			console.warn(
				"[device-person-token] write-time capture failed",
				params.source,
				plainEmployeeNo,
				error?.message || error,
			);
		});
		// Also pull typed DeviceEvents (USER_CREATED / FP / deletes) from ISAPI logSearch
		// so Device Events FE shows the same truth as FE enroll actions.
		const deviceName = String(
			(params.req.body as any)?.deviceName || (params.req as any).device?.name || "",
		).trim();
		const deviceAddress = String(
			(params.req.body as any)?.deviceAddress || (params.req as any).device?.address || "",
		).trim();
		scheduleOperationLogResolveAfterSdkSignal({
			prisma,
			req: params.req,
			deviceId,
			organizationId,
			deviceName: deviceName || null,
			deviceAddress: deviceAddress || null,
			triggerMinor: params.source,
			// FE write just completed — hammer logSearch for 1–5s socket target.
			settleMs: 200,
			retryDelaysMs: [200, 500, 1_000, 1_800, 3_000, 5_000],
			windowBeforeMs: 2 * 60_000,
			windowAfterMs: 3 * 60_000,
			cooldownMs: 800,
		});
	};

	const normalizeUserInfoSearchCond = (body: any) => {
		const cond = body?.UserInfoSearchCond || {};
		return {
			searchID: String(cond.searchID || `user-info-${Date.now()}`),
			maxResults: Math.min(Math.max(Number(cond.maxResults || 20), 1), 200),
			searchResultPosition: Math.max(Number(cond.searchResultPosition || 0), 0),
		};
	};

	const getUserInfoSearchPayload = (
		body: any,
		searchResultPosition: number,
		searchID: string,
		maxResults: number,
	) => ({
		...body,
		UserInfoSearchCond: {
			...body?.UserInfoSearchCond,
			searchID,
			maxResults,
			searchResultPosition,
		},
	});

	const getRequestOrganizationId = (req: Request) =>
		String((req as any).organizationId || (req as any).userOrganizationId || "").trim();

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

	const enrichAcsEventsWithEmployees = async (req: Request, data: any) => {
		const organizationId = getRequestOrganizationId(req);
		const events = data?.AcsEvent?.InfoList;
		if (!organizationId || !Array.isArray(events) || events.length === 0) {
			return data;
		}

		const employeeNos = Array.from(
			new Set(
				events
					.map((event: any) => String(event?.employeeNoString || "").trim())
					.filter(Boolean),
			),
		);
		if (!employeeNos.length) return data;

		const employees = await prisma.employee.findMany({
			where: {
				organizationId,
				isDeleted: false,
				deviceEmpId: { in: employeeNos },
			},
			select: {
				id: true,
				employeeId: true,
				deviceEmpId: true,
				person: { select: { personalInfo: true } },
			},
		});
		const employeeByDeviceEmpId = new Map(
			employees
				.filter((employee) => employee.deviceEmpId)
				.map((employee) => [String(employee.deviceEmpId), employee]),
		);

		return {
			...data,
			AcsEvent: {
				...data.AcsEvent,
				InfoList: events.map((event: any) => {
					const employee = employeeByDeviceEmpId.get(
						String(event?.employeeNoString || ""),
					);
					return {
						...event,
						hrisEmployee: employee ? buildEventEmployeeSnapshot(employee) : null,
					};
				}),
			},
		};
	};

	const getAcsEventList = (data: any) => {
		const events = data?.AcsEvent?.InfoList;
		return Array.isArray(events) ? events : [];
	};

	const normalizeAcsEventResponseTimes = async (
		req: Request,
		data: any,
		referenceDate = new Date(),
	) => {
		const events = getAcsEventList(data);
		if (!events.length) return data;
		const deviceId = String(req.body?.deviceId || req.query?.deviceId || "").trim();
		const device = deviceId
			? await (prisma as any).device.findFirst({
					where: { id: deviceId, isDeleted: false },
					select: { id: true, config: true },
				})
			: null;
		const knownSkewSeconds = Number((device?.config as any)?.hikvisionClockSkewSeconds || 0);
		const allowClockSkewCorrection =
			(device?.config as any)?.hikvisionAllowClockSkewCorrection === true;
		let deviceClockSkewSeconds = 0;
		try {
			const timePayload = await fetchFromDevice(req, hikvisionEndpoint.system.time, {
				method: "GET",
				deviceId: deviceId || undefined,
			});
			deviceClockSkewSeconds = getHikvisionClockSkewSecondsFromSystemTime(
				timePayload,
				referenceDate,
			);
		} catch {
			deviceClockSkewSeconds = 0;
		}
		const observedSkewSeconds = getHikvisionObservedClockSkewSeconds(events, referenceDate);
		const skewSeconds = allowClockSkewCorrection
			? deviceClockSkewSeconds || knownSkewSeconds || observedSkewSeconds
			: 0;
		if (allowClockSkewCorrection && device?.id && skewSeconds > 0 && skewSeconds !== knownSkewSeconds) {
			await (prisma as any).device.update({
				where: { id: device.id },
				data: {
					config: {
						...((device.config as any) || {}),
						hikvisionClockSkewSeconds: skewSeconds,
						hikvisionClockSkewObservedAt: referenceDate.toISOString(),
					},
				},
			});
		}
		return {
			...data,
			AcsEvent: {
				...data.AcsEvent,
				InfoList: normalizeHikvisionAcsEventListTimes(
					events,
					referenceDate,
					skewSeconds,
					{
						allowStoredSkew: allowClockSkewCorrection,
						allowAutoAdjust: allowClockSkewCorrection,
					},
				),
			},
		};
	};

	const syncAcsEventsToDeviceAttendance = async (req: Request, data: any) => {
		const deviceId = String(req.body?.deviceId || req.query?.deviceId || "").trim();
		const events = getAcsEventList(data);
		if (!deviceId || !events.length) {
			return { checked: events.length, synced: 0, skipped: events.length };
		}

		const ctrl = callbackController(prisma);
		let synced = 0;
		let skipped = 0;
		for (const event of events) {
			if (!String(event?.employeeNoString || event?.employeeNo || "").trim()) {
				skipped += 1;
				continue;
			}
			const callbackReq = {
				...req,
				body: { deviceId, AcsEventInfo: event },
				query: {},
				get: () => "application/json",
			} as any;
			let statusCode = 200;
			const callbackRes = {
				status(code: number) {
					statusCode = code;
					return this;
				},
				json() {
					return this;
				},
			} as any;
			await ctrl.handleCallback(callbackReq, callbackRes, (() => undefined) as any);
			if (statusCode >= 200 && statusCode < 300) synced += 1;
			else skipped += 1;
		}
		return { checked: events.length, synced, skipped };
	};

	return {
		// Get ACS Events (POST with body for search criteria)
		getAcsEvents: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const searchData = req.body || {
					AcsEventCond: {
						searchID: "213",
						searchResultPosition: 0,
						maxResults: 10,
						major: 0,
						minor: 0,
						startTime: "2025-11-04T00:00:00+08:00",
						endTime: "2025-11-04T23:59:59+08:00",
						timeReverseOrder: true,
					},
				};

				const data = await fetchFromDevice(req, hikvisionEndpoint.accessControl.acsEvent.list, {
					method: "POST",
					body: searchData,
				});
				const normalizedData = await normalizeAcsEventResponseTimes(req, data);
				const syncSummary = await syncAcsEventsToDeviceAttendance(req, normalizedData);
				const enrichedData = await enrichAcsEventsWithEmployees(req, normalizedData);

				return res
					.status(200)
					.json(
						buildSuccessResponse(
							"ACS events retrieved successfully",
							{ ...enrichedData, hrisSync: syncSummary },
							200,
						),
					);
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to retrieve ACS events",
							error.status || 500,
						),
					);
			}
		},

		// Get ACS Event Capabilities
		getAcsEventCapabilities: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const data = await fetchFromDevice(req, 
					hikvisionEndpoint.accessControl.acsEvent.capabilities,
				);

				return res
					.status(200)
					.json(
						buildSuccessResponse(
							"ACS event capabilities retrieved successfully",
							data,
							200,
						),
					);
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to retrieve ACS event capabilities",
							error.status || 500,
						),
					);
			}
		},

		// Get Storage Configuration
		getStorageConfig: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const data = await fetchFromDevice(req, 
					hikvisionEndpoint.accessControl.acsEvent.storageCfg.get,
				);

				return res
					.status(200)
					.json(
						buildSuccessResponse(
							"Storage configuration retrieved successfully",
							data,
							200,
						),
					);
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to retrieve storage configuration",
							error.status || 500,
						),
					);
			}
		},

		// Update Storage Configuration
		updateStorageConfig: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const configData = req.body;

				const data = await fetchFromDevice(req, 
					hikvisionEndpoint.accessControl.acsEvent.storageCfg.update,
					{
						method: "PUT",
						body: configData,
					},
				);

				return res
					.status(200)
					.json(
						buildSuccessResponse(
							"Storage configuration updated successfully",
							data,
							200,
						),
					);
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to update storage configuration",
							error.status || 500,
						),
					);
			}
		},

		// Get Storage Configuration Capabilities
		getStorageConfigCapabilities: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const data = await fetchFromDevice(req, 
					hikvisionEndpoint.accessControl.acsEvent.storageCfg.capabilities,
				);

				return res
					.status(200)
					.json(
						buildSuccessResponse(
							"Storage configuration capabilities retrieved successfully",
							data,
							200,
						),
					);
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message ||
								"Failed to retrieve storage configuration capabilities",
							error.status || 500,
						),
					);
			}
		},

		// Get ACS Event Total Number
		getAcsEventTotalNum: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const data = await fetchFromDevice(req, 
					hikvisionEndpoint.accessControl.acsEventTotalNum.get,
				);

				return res
					.status(200)
					.json(
						buildSuccessResponse(
							"ACS event total number retrieved successfully",
							data,
							200,
						),
					);
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to retrieve ACS event total number",
							error.status || 500,
						),
					);
			}
		},

		// Get ACS Event Total Number Capabilities
		getAcsEventTotalNumCapabilities: async (
			req: Request,
			res: Response,
			next: NextFunction,
		) => {
			try {
				const data = await fetchFromDevice(req, 
					hikvisionEndpoint.accessControl.acsEventTotalNum.capabilities,
				);

				return res
					.status(200)
					.json(
						buildSuccessResponse(
							"ACS event total number capabilities retrieved successfully",
							data,
							200,
						),
					);
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message ||
								"Failed to retrieve ACS event total number capabilities",
							error.status || 500,
						),
					);
			}
		},

		// Get ACS Work Status
		getAcsWorkStatus: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const data = await fetchFromDevice(req, 
					hikvisionEndpoint.accessControl.acsWorkStatus.get,
				);

				return res
					.status(200)
					.json(
						buildSuccessResponse("ACS work status retrieved successfully", data, 200),
					);
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to retrieve ACS work status",
							error.status || 500,
						),
					);
			}
		},

		// Get ACS Work Status Capabilities
		getAcsWorkStatusCapabilities: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const data = await fetchFromDevice(req, 
					hikvisionEndpoint.accessControl.acsWorkStatus.capabilities,
				);

				return res
					.status(200)
					.json(
						buildSuccessResponse(
							"ACS work status capabilities retrieved successfully",
							data,
							200,
						),
					);
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to retrieve ACS work status capabilities",
							error.status || 500,
						),
					);
			}
		},

		// UserInfo endpoints
		getUserInfoCapabilities: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const data = await fetchFromDevice(req, 
					hikvisionEndpoint.accessControl.userInfo.capabilities,
				);

				return res
					.status(200)
					.json(
						buildSuccessResponse(
							"UserInfo capabilities retrieved successfully",
							data,
							200,
						),
					);
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to retrieve UserInfo capabilities",
							error.status || 500,
						),
					);
			}
		},

		getUserInfoCount: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const data = await fetchFromDevice(req, hikvisionEndpoint.accessControl.userInfo.count);

				return res
					.status(200)
					.json(buildSuccessResponse("UserInfo count retrieved successfully", data, 200));
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to retrieve UserInfo count",
							error.status || 500,
						),
					);
			}
		},

		deleteUserInfo: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const deleteData = req.body;

				const data = await fetchFromDevice(req, hikvisionEndpoint.accessControl.userInfo.delete, {
					method: "PUT",
					body: deleteData,
				});

				const deviceId = String(
					req.body?.deviceId || req.query?.deviceId || "",
				).trim();
				const organizationId = getRequestOrganizationId(req);
				if (deviceId && organizationId) {
					scheduleOperationLogResolveAfterSdkSignal({
						prisma,
						req,
						deviceId,
						organizationId,
						triggerMinor: "USER_INFO_DELETE",
						settleMs: 1_800,
						windowBeforeMs: 2 * 60_000,
						windowAfterMs: 3 * 60_000,
						cooldownMs: 2_000,
					});
				}

				return res
					.status(200)
					.json(buildSuccessResponse("UserInfo deleted successfully", data, 200));
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to delete UserInfo",
							error.status || 500,
						),
					);
			}
		},

		modifyUserInfo: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const userInfoData = req.body;

				const data = await fetchFromDevice(req, hikvisionEndpoint.accessControl.userInfo.modify, {
					method: "PUT",
					body: userInfoData,
				});
				// Real field changes may emit op-logs; no-op re-apply often does not.
				scheduleWriteTimePersonTokenCapture({
					req,
					userInfoBody: userInfoData,
					source: "USER_INFO_MODIFY",
				});

				return res
					.status(200)
					.json(buildSuccessResponse("UserInfo modified successfully", data, 200));
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to modify UserInfo",
							error.status || 500,
						),
					);
			}
		},

		recordUserInfo: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const userInfoData = req.body;

				const data = await fetchFromDevice(req, hikvisionEndpoint.accessControl.userInfo.record, {
					method: "POST",
					body: userInfoData,
				});
				// Proven path: Record plain employeeNo → logSearch opaque token within seconds.
				scheduleWriteTimePersonTokenCapture({
					req,
					userInfoBody: userInfoData,
					source: "USER_INFO_RECORD",
				});

				return res
					.status(201)
					.json(buildSuccessResponse("UserInfo added successfully", data, 201));
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to add UserInfo",
							error.status || 500,
						),
					);
			}
		},

		searchUserInfo: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const baseCond = normalizeUserInfoSearchCond(req.body);
				const allUsers: any[] = [];
				let data: any = null;
				let searchResultPosition = baseCond.searchResultPosition;

				for (let page = 0; page < 25; page += 1) {
					const searchData = getUserInfoSearchPayload(
						req.body,
						searchResultPosition,
						baseCond.searchID,
						baseCond.maxResults,
					);

					data = await fetchFromDevice(
						req,
						hikvisionEndpoint.accessControl.userInfo.search,
						{
							method: "POST",
							body: searchData,
						},
					);

					const search = data?.UserInfoSearch || {};
					const pageUsers = Array.isArray(search.UserInfo) ? search.UserInfo : [];
					allUsers.push(...pageUsers);

					const status = String(search.responseStatusStrg || "").toUpperCase();
					const numOfMatches = Number(search.numOfMatches || pageUsers.length || 0);
					if (status !== "MORE" || numOfMatches <= 0) break;

					searchResultPosition += numOfMatches;
				}

				if (data?.UserInfoSearch) {
					data = {
						...data,
						UserInfoSearch: {
							...data.UserInfoSearch,
							UserInfo: allUsers,
							numOfMatches: allUsers.length,
							responseStatusStrg: "OK",
						},
					};
				}

				return res
					.status(200)
					.json(
						buildSuccessResponse("UserInfo search completed successfully", data, 200),
					);
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to search UserInfo",
							error.status || 500,
						),
					);
			}
		},

		setUpUserInfo: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const userInfoData = req.body;

				const data = await fetchFromDevice(req, hikvisionEndpoint.accessControl.userInfo.setUp, {
					method: "PUT",
					body: userInfoData,
				});

				return res
					.status(200)
					.json(buildSuccessResponse("UserInfo set up successfully", data, 200));
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to set up UserInfo",
							error.status || 500,
						),
					);
			}
		},

		// UserInfoDetail endpoints
		getUserInfoDetailDeleteCapabilities: async (
			req: Request,
			res: Response,
			next: NextFunction,
		) => {
			try {
				const data = await fetchFromDevice(req, 
					hikvisionEndpoint.accessControl.userInfoDetail.deleteCapabilities,
				);

				return res
					.status(200)
					.json(
						buildSuccessResponse(
							"UserInfoDetail delete capabilities retrieved successfully",
							data,
							200,
						),
					);
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message ||
								"Failed to retrieve UserInfoDetail delete capabilities",
							error.status || 500,
						),
					);
			}
		},

		deleteUserInfoDetail: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const deleteData = req.body;

				const data = await fetchFromDevice(req, 
					hikvisionEndpoint.accessControl.userInfoDetail.delete,
					{
						method: "PUT",
						body: deleteData,
					},
				);

				const deviceId = String(
					req.body?.deviceId || req.query?.deviceId || "",
				).trim();
				const organizationId = getRequestOrganizationId(req);
				if (deviceId && organizationId) {
					// Fingerprint/face/card deletes on device → typed DeviceEvents via logSearch.
					scheduleOperationLogResolveAfterSdkSignal({
						prisma,
						req,
						deviceId,
						organizationId,
						triggerMinor: "USER_INFO_DETAIL_DELETE",
						settleMs: 1_800,
						windowBeforeMs: 2 * 60_000,
						windowAfterMs: 3 * 60_000,
						cooldownMs: 2_000,
					});
				}

				return res
					.status(200)
					.json(
						buildSuccessResponse(
							"UserInfoDetail delete started successfully",
							data,
							200,
						),
					);
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to delete UserInfoDetail",
							error.status || 500,
						),
					);
			}
		},

		getUserInfoDetailDeleteProcess: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const data = await fetchFromDevice(req, 
					hikvisionEndpoint.accessControl.userInfoDetail.deleteProcess,
				);

				return res
					.status(200)
					.json(
						buildSuccessResponse(
							"UserInfoDetail delete process status retrieved successfully",
							data,
							200,
						),
					);
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message ||
								"Failed to retrieve UserInfoDetail delete process status",
							error.status || 500,
						),
					);
			}
		},
	};
};

