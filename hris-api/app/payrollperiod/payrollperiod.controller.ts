// @ts-nocheck
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.controller = void 0;
const logger_helper_1 = require("../../helper/logger.helper");
const transformObject_1 = require("../../helper/transformObject");
const validation_helper_1 = require("../../helper/validation-helper");
const query_builder_helper_1 = require("../../helper/query-builder.helper");
const success_handler_helper_1 = require("../../helper/success-handler.helper");
const dataGrouping_1 = require("../../helper/dataGrouping");
const error_handler_1 = require("../../helper/error-handler");
const employee_schedule_helper_1 = require("../../helper/employee-schedule.helper");
const activityLogger_1 = require("../../utils/activityLogger");
const auditLogger_1 = require("../../utils/auditLogger");
const constant_1 = require("../../config/constant");
const redis_1 = require("../../config/redis");
const cache_1 = require("../../middleware/cache");
const payrollperiod_zod_1 = require("../../zod/payrollperiod.zod");
const payrollperiod_zod_2 = require("../../zod/payrollperiod.zod");
const tax_calculator_helper_1 = require("../../helper/tax-calculator.helper");
const payroll_period_helper_1 = require("../../helper/payroll-period.helper");
const payroll_period_code_helper_1 = require("../../helper/payroll-period-code.helper");
const payroll_generation_job_service_1 = require("./payroll-generation-job.service");
const payroll_cycle_helper_1 = require("./payroll-cycle.helper");
const logger = (0, logger_helper_1.getLogger)();
const payrollPeriodLogger = logger.child({ module: "payrollPeriod" });
// BNPI default: 11-25 / 26-10 (matches Bandai semi-monthly register cutoffs).
const DEFAULT_CYCLE_RULES_JSON = {
    SEMI_MONTHLY: {
        firstStartDay: 11,
        secondStartDay: 26,
        secondEndDay: 10,
    },
    WEEKLY: { anchorWeekday: 1 },
    BIWEEKLY: { anchorWeekday: 1 },
    MONTHLY: { startDay: 1, endDay: "LAST_DAY" },
    QUARTERLY: { startMonth: 1 },
    ANNUALLY: { startMonth: 1 },
};
const controller = (prisma) => {
    const getOrCreatePayrollCycleConfig = (organizationId) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        let config = yield prisma.payrollCycleConfig.findFirst({
            where: { organizationId, isDeleted: false },
        });
        if (!config) {
            config = yield prisma.payrollCycleConfig.create({
                data: {
                    organizationId,
                    defaultPayFrequency: "SEMI_MONTHLY",
                    payDateOffsetDays: 5,
                    businessDayRule: "NEXT_BUSINESS_DAY",
                    includeHolidaysInBusinessDayCheck: true,
                    cycleRules: DEFAULT_CYCLE_RULES_JSON,
                },
            });
        }
        const rawCycleRules = config.cycleRules || {};
        const hasSemiMonthlyRule = ((_a = rawCycleRules === null || rawCycleRules === void 0 ? void 0 : rawCycleRules.SEMI_MONTHLY) === null || _a === void 0 ? void 0 : _a.firstStartDay) !== undefined &&
            ((_b = rawCycleRules === null || rawCycleRules === void 0 ? void 0 : rawCycleRules.SEMI_MONTHLY) === null || _b === void 0 ? void 0 : _b.secondStartDay) !== undefined &&
            ((_c = rawCycleRules === null || rawCycleRules === void 0 ? void 0 : rawCycleRules.SEMI_MONTHLY) === null || _c === void 0 ? void 0 : _c.secondEndDay) !== undefined;
        const legacySplitDay = Number(((_d = rawCycleRules === null || rawCycleRules === void 0 ? void 0 : rawCycleRules.SEMI_MONTHLY) === null || _d === void 0 ? void 0 : _d.splitDay) || 15);
        if (!config.cycleRules || !hasSemiMonthlyRule) {
            // Prefer BNPI 11-25 / 26-10. Only honor legacy splitDay when it was explicitly stored.
            const hasLegacySplitDay = ((_d = rawCycleRules === null || rawCycleRules === void 0 ? void 0 : rawCycleRules.SEMI_MONTHLY) === null || _d === void 0 ? void 0 : _d.splitDay) !== undefined;
            const safeSplitDay = Math.min(Math.max(legacySplitDay || 15, 1), 30);
            const firstStartDay = hasLegacySplitDay ? 1 : 11;
            const secondStartDay = hasLegacySplitDay
                ? Math.min(Math.max(safeSplitDay + 1, 2), 31)
                : 26;
            const secondEndDay = hasLegacySplitDay ? "LAST_DAY" : 10;
            const migratedCycleRules = Object.assign(Object.assign({}, (rawCycleRules || {})), { SEMI_MONTHLY: {
                    firstStartDay,
                    secondStartDay,
                    secondEndDay,
                }, WEEKLY: (rawCycleRules === null || rawCycleRules === void 0 ? void 0 : rawCycleRules.WEEKLY) || { anchorWeekday: 1 }, BIWEEKLY: (rawCycleRules === null || rawCycleRules === void 0 ? void 0 : rawCycleRules.BIWEEKLY) || { anchorWeekday: 1 }, MONTHLY: (rawCycleRules === null || rawCycleRules === void 0 ? void 0 : rawCycleRules.MONTHLY) || { startDay: 1, endDay: "LAST_DAY" }, QUARTERLY: (rawCycleRules === null || rawCycleRules === void 0 ? void 0 : rawCycleRules.QUARTERLY) || { startMonth: 1 }, ANNUALLY: (rawCycleRules === null || rawCycleRules === void 0 ? void 0 : rawCycleRules.ANNUALLY) || { startMonth: 1 } });
            config = yield prisma.payrollCycleConfig.update({
                where: { id: config.id },
                data: {
                    cycleRules: migratedCycleRules,
                },
            });
        }
        return config;
    });
    const getHolidayDateKeys = (organizationId, rangeStart, rangeEnd) => __awaiter(void 0, void 0, void 0, function* () {
        const holidays = yield prisma.calendarItem.findMany({
            where: {
                organizationId,
                type: "HOLIDAY",
                status: "ACTIVE",
                startDate: {
                    lte: rangeEnd,
                },
                endDate: {
                    gte: rangeStart,
                },
            },
            select: {
                startDate: true,
                endDate: true,
            },
        });
        const keys = new Set();
        for (const holiday of holidays) {
            const cursor = new Date(Date.UTC(holiday.startDate.getUTCFullYear(), holiday.startDate.getUTCMonth(), holiday.startDate.getUTCDate()));
            const end = new Date(Date.UTC(holiday.endDate.getUTCFullYear(), holiday.endDate.getUTCMonth(), holiday.endDate.getUTCDate()));
            while (cursor <= end) {
                keys.add(cursor.toISOString().slice(0, 10));
                cursor.setUTCDate(cursor.getUTCDate() + 1);
            }
        }
        return keys;
    });
    const create = (req, res, _next) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        let requestData = req.body;
        const contentType = req.get("Content-Type") || "";
        if (contentType.includes("application/x-www-form-urlencoded") ||
            contentType.includes("multipart/form-data")) {
            payrollPeriodLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
            requestData = (0, transformObject_1.transformFormDataToObject)(req.body);
            payrollPeriodLogger.info("Transformed form data to object structure:", JSON.stringify(requestData, null, 2));
        }
        const validation = payrollperiod_zod_1.CreatePayrollPeriodSchema.safeParse(requestData);
        if (!validation.success) {
            const formattedErrors = (0, error_handler_1.formatZodErrors)(validation.error.format());
            payrollPeriodLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
            const errorResponse = (0, error_handler_1.buildErrorResponse)("Validation failed", 400, formattedErrors);
            res.status(400).json(errorResponse);
            return;
        }
        try {
            // Auto-generate code if not provided
            const createData = Object.assign({}, validation.data);
            if (!createData.code && createData.startDate && createData.endDate) {
                createData.code = (0, payroll_period_code_helper_1.generatePayrollPeriodCode)(new Date(createData.startDate), new Date(createData.endDate));
                payrollPeriodLogger.info(`Auto-generated code: ${createData.code}`);
            }
            const payrollPeriod = yield prisma.payrollPeriod.create({ data: createData });
            payrollPeriodLogger.info(`PayrollPeriod created successfully: ${payrollPeriod.id}`);
            (0, activityLogger_1.logActivity)(req, {
                userId: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || "unknown",
                action: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.ACTIONS.CREATE_PAYROLLPERIOD,
                description: `${constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.DESCRIPTIONS.PAYROLLPERIOD_CREATED}: ${payrollPeriod.name || payrollPeriod.id}`,
                page: {
                    url: req.originalUrl,
                    title: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.PAGES.PAYROLLPERIOD_CREATION,
                },
            });
            (0, auditLogger_1.logAudit)(req, {
                userId: ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id) || "unknown",
                action: constant_1.config.AUDIT_LOG.ACTIONS.CREATE,
                resource: constant_1.config.AUDIT_LOG.RESOURCES.PAYROLLPERIOD,
                severity: constant_1.config.AUDIT_LOG.SEVERITY.LOW,
                entityType: constant_1.config.AUDIT_LOG.ENTITY_TYPES.PAYROLLPERIOD,
                entityId: payrollPeriod.id,
                changesBefore: null,
                changesAfter: {
                    id: payrollPeriod.id,
                    name: payrollPeriod.name,
                    createdAt: payrollPeriod.createdAt,
                    updatedAt: payrollPeriod.updatedAt,
                },
                description: `${constant_1.config.AUDIT_LOG.PAYROLLPERIOD.DESCRIPTIONS.PAYROLLPERIOD_CREATED}: ${payrollPeriod.name || payrollPeriod.id}`,
            });
            try {
                yield cache_1.invalidateCache.byPattern("cache:payrollPeriod:list:*");
                payrollPeriodLogger.info("PayrollPeriod list cache invalidated after creation");
            }
            catch (cacheError) {
                payrollPeriodLogger.warn("Failed to invalidate cache after payrollPeriod creation:", cacheError);
            }
            const successResponse = (0, success_handler_helper_1.buildSuccessResponse)(constant_1.config.SUCCESS.PAYROLLPERIOD.CREATED, payrollPeriod, 201);
            res.status(201).json(successResponse);
        }
        catch (error) {
            payrollPeriodLogger.error(`${constant_1.config.ERROR.PAYROLLPERIOD.CREATE_FAILED}: ${error}`);
            const errorResponse = (0, error_handler_1.buildErrorResponse)(constant_1.config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500);
            res.status(500).json(errorResponse);
        }
    });
    const getAll = (req, res, _next) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        const validationResult = (0, validation_helper_1.validateQueryParams)(req, payrollPeriodLogger);
        if (!validationResult.isValid) {
            res.status(400).json(validationResult.errorResponse);
            return;
        }
        const { page, limit, order, fields, sort, skip, query, document, pagination, count, filter, groupBy, } = validationResult.validatedParams;
        payrollPeriodLogger.info(`Getting payrollPeriods, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`);
        try {
            // Base where clause
            const whereClause = {
                isDeleted: false,
            };
            // search fields sample ("name", "description", "type")
            const searchFields = ["name", "description", "type"];
            if (query) {
                const searchConditions = (0, query_builder_helper_1.buildSearchConditions)("PayrollPeriod", query, searchFields);
                if (searchConditions.length > 0) {
                    whereClause.OR = searchConditions;
                }
            }
            if (filter) {
                const filterConditions = (0, query_builder_helper_1.buildFilterConditions)("PayrollPeriod", filter);
                if (filterConditions.length > 0) {
                    whereClause.AND = filterConditions;
                }
            }
            const findManyQuery = (0, query_builder_helper_1.buildFindManyQuery)(whereClause, skip, limit, order, sort, fields);
            const [payrollPeriods, total] = yield Promise.all([
                document ? prisma.payrollPeriod.findMany(findManyQuery) : [],
                count ? prisma.payrollPeriod.count({ where: whereClause }) : 0,
            ]);
            payrollPeriodLogger.info(`Retrieved ${payrollPeriods.length} payrollPeriods`);
            const processedData = groupBy && document
                ? (0, dataGrouping_1.groupDataByField)(payrollPeriods, groupBy)
                : payrollPeriods;
            const responseData = Object.assign(Object.assign(Object.assign(Object.assign({}, (document && { payrollPeriods: processedData })), (count && { count: total })), (pagination && { pagination: (0, success_handler_helper_1.buildPagination)(total, page, limit) })), (groupBy && { groupedBy: groupBy }));
            (0, activityLogger_1.logActivity)(req, {
                userId: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || "unknown",
                action: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.ACTIONS.GET_ALL_PAYROLLPERIOD,
                description: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.DESCRIPTIONS.PAYROLLPERIODS_RETRIEVED,
                page: {
                    url: req.originalUrl,
                    title: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.PAGES.PAYROLLPERIOD_LIST,
                },
            });
            res.status(200).json((0, success_handler_helper_1.buildSuccessResponse)(constant_1.config.SUCCESS.PAYROLLPERIOD.RETRIEVED_ALL, responseData, 200));
        }
        catch (error) {
            payrollPeriodLogger.error(`${constant_1.config.ERROR.PAYROLLPERIOD.GET_ALL_FAILED}: ${error}`);
            res.status(500).json((0, error_handler_1.buildErrorResponse)(constant_1.config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500));
        }
    });
    const getById = (req, res, _next) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        const { id } = req.params;
        const { fields } = req.query;
        const organizationId = req.organizationId;
        try {
            if (!id) {
                payrollPeriodLogger.error(constant_1.config.ERROR.QUERY_PARAMS.MISSING_ID);
                const errorResponse = (0, error_handler_1.buildErrorResponse)(constant_1.config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
                res.status(400).json(errorResponse);
                return;
            }
            if (!organizationId) {
                const errorResponse = (0, error_handler_1.buildErrorResponse)("Organization ID is required", 401);
                res.status(401).json(errorResponse);
                return;
            }
            if (fields && typeof fields !== "string") {
                payrollPeriodLogger.error(`${constant_1.config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
                const errorResponse = (0, error_handler_1.buildErrorResponse)(constant_1.config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING, 400);
                res.status(400).json(errorResponse);
                return;
            }
            payrollPeriodLogger.info(`${constant_1.config.SUCCESS.PAYROLLPERIOD.GETTING_BY_ID}: ${id} (id or code)`);
            const cacheKey = `cache:payrollPeriod:byIdentifier:${id}:${fields || "full"}`;
            let payrollPeriod = null;
            try {
                if (redis_1.redisClient.isClientConnected()) {
                    payrollPeriod = yield redis_1.redisClient.getJSON(cacheKey);
                    if (payrollPeriod) {
                        payrollPeriodLogger.info(`PayrollPeriod ${id} retrieved from direct Redis cache`);
                    }
                }
            }
            catch (cacheError) {
                payrollPeriodLogger.warn(`Redis cache retrieval failed for payrollPeriod ${id}:`, cacheError);
            }
            if (!payrollPeriod) {
                const select = (0, query_builder_helper_1.getNestedFields)(fields);
                const looksLikeObjectId = /^[0-9a-fA-F]{24}$/.test(id);
                // Try ObjectId first (if applicable), then fallback to code.
                if (looksLikeObjectId) {
                    payrollPeriod = yield prisma.payrollPeriod.findFirst({
                        where: { id, organizationId, isDeleted: false },
                        select,
                    });
                }
                if (!payrollPeriod) {
                    payrollPeriod = yield prisma.payrollPeriod.findFirst({
                        where: { code: id, organizationId, isDeleted: false },
                        select,
                        orderBy: { startDate: "desc" },
                    });
                }
                if (payrollPeriod && redis_1.redisClient.isClientConnected()) {
                    try {
                        // Store under the identifier used (id or code)
                        yield redis_1.redisClient.setJSON(cacheKey, payrollPeriod, 3600);
                        // Also store canonical keys for better invalidation/hit rate
                        const canonicalId = payrollPeriod === null || payrollPeriod === void 0 ? void 0 : payrollPeriod.id;
                        const canonicalCode = payrollPeriod === null || payrollPeriod === void 0 ? void 0 : payrollPeriod.code;
                        if (canonicalId && typeof canonicalId === "string") {
                            yield redis_1.redisClient.setJSON(`cache:payrollPeriod:byId:${canonicalId}:${fields || "full"}`, payrollPeriod, 3600);
                        }
                        if (canonicalCode && typeof canonicalCode === "string") {
                            yield redis_1.redisClient.setJSON(`cache:payrollPeriod:byCode:${canonicalCode}:${fields || "full"}`, payrollPeriod, 3600);
                        }
                        payrollPeriodLogger.info(`PayrollPeriod ${id} stored in direct Redis cache (identifier + canonical keys)`);
                    }
                    catch (cacheError) {
                        payrollPeriodLogger.warn(`Failed to store payrollPeriod ${id} in Redis cache:`, cacheError);
                    }
                }
            }
            if (!payrollPeriod) {
                payrollPeriodLogger.error(`${constant_1.config.ERROR.PAYROLLPERIOD.NOT_FOUND}: ${id}`);
                const errorResponse = (0, error_handler_1.buildErrorResponse)(constant_1.config.ERROR.PAYROLLPERIOD.NOT_FOUND, 404);
                res.status(404).json(errorResponse);
                return;
            }
            payrollPeriodLogger.info(`${constant_1.config.SUCCESS.PAYROLLPERIOD.RETRIEVED}: ${payrollPeriod.id}`);
            (0, activityLogger_1.logActivity)(req, {
                userId: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || "unknown",
                action: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.ACTIONS.GET_PAYROLLPERIOD,
                description: `${constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.DESCRIPTIONS.PAYROLLPERIOD_RETRIEVED}: ${payrollPeriod.id}`,
                page: {
                    url: req.originalUrl,
                    title: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.PAGES.PAYROLLPERIOD_DETAILS,
                },
            });
            const successResponse = (0, success_handler_helper_1.buildSuccessResponse)(constant_1.config.SUCCESS.PAYROLLPERIOD.RETRIEVED, payrollPeriod, 200);
            res.status(200).json(successResponse);
        }
        catch (error) {
            payrollPeriodLogger.error(`${constant_1.config.ERROR.PAYROLLPERIOD.ERROR_GETTING}: ${error}`);
            const errorResponse = (0, error_handler_1.buildErrorResponse)(constant_1.config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500);
            res.status(500).json(errorResponse);
        }
    });
    const update = (req, res, _next) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        const { id } = req.params;
        try {
            if (!id) {
                payrollPeriodLogger.error(constant_1.config.ERROR.QUERY_PARAMS.MISSING_ID);
                const errorResponse = (0, error_handler_1.buildErrorResponse)(constant_1.config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
                res.status(400).json(errorResponse);
                return;
            }
            const validationResult = payrollperiod_zod_1.UpdatePayrollPeriodSchema.safeParse(req.body);
            if (!validationResult.success) {
                const formattedErrors = (0, error_handler_1.formatZodErrors)(validationResult.error.format());
                payrollPeriodLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
                const errorResponse = (0, error_handler_1.buildErrorResponse)("Validation failed", 400, formattedErrors);
                res.status(400).json(errorResponse);
                return;
            }
            if (Object.keys(req.body).length === 0) {
                payrollPeriodLogger.error(constant_1.config.ERROR.COMMON.NO_UPDATE_FIELDS);
                const errorResponse = (0, error_handler_1.buildErrorResponse)(constant_1.config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
                res.status(400).json(errorResponse);
                return;
            }
            const validatedData = validationResult.data;
            payrollPeriodLogger.info(`Updating payrollPeriod: ${id}`);
            const existingPayrollPeriod = yield prisma.payrollPeriod.findFirst({
                where: { id },
            });
            if (!existingPayrollPeriod) {
                payrollPeriodLogger.error(`${constant_1.config.ERROR.PAYROLLPERIOD.NOT_FOUND}: ${id}`);
                const errorResponse = (0, error_handler_1.buildErrorResponse)(constant_1.config.ERROR.PAYROLLPERIOD.NOT_FOUND, 404);
                res.status(404).json(errorResponse);
                return;
            }
            const prismaData = Object.assign({}, validatedData);
            const updatedPayrollPeriod = yield prisma.payrollPeriod.update({
                where: { id },
                data: prismaData,
            });
            try {
                yield cache_1.invalidateCache.byPattern(`cache:payrollPeriod:byId:${id}:*`);
                yield cache_1.invalidateCache.byPattern("cache:payrollPeriod:list:*");
                payrollPeriodLogger.info(`Cache invalidated after payrollPeriod ${id} update`);
            }
            catch (cacheError) {
                payrollPeriodLogger.warn("Failed to invalidate cache after payrollPeriod update:", cacheError);
            }
            payrollPeriodLogger.info(`${constant_1.config.SUCCESS.PAYROLLPERIOD.UPDATED}: ${updatedPayrollPeriod.id}`);
            (0, activityLogger_1.logActivity)(req, {
                userId: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || "unknown",
                action: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.ACTIONS.UPDATE_PAYROLLPERIOD,
                description: `${constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.DESCRIPTIONS.PAYROLLPERIOD_UPDATED}: ${updatedPayrollPeriod.name || updatedPayrollPeriod.id}`,
                page: {
                    url: req.originalUrl,
                    title: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.PAGES.PAYROLLPERIOD_UPDATE,
                },
            });
            (0, auditLogger_1.logAudit)(req, {
                userId: ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id) || "unknown",
                action: constant_1.config.AUDIT_LOG.ACTIONS.UPDATE,
                resource: constant_1.config.AUDIT_LOG.RESOURCES.PAYROLLPERIOD,
                severity: constant_1.config.AUDIT_LOG.SEVERITY.LOW,
                entityType: constant_1.config.AUDIT_LOG.ENTITY_TYPES.PAYROLLPERIOD,
                entityId: updatedPayrollPeriod.id,
                changesBefore: {
                    id: existingPayrollPeriod.id,
                    name: existingPayrollPeriod.name,
                    status: existingPayrollPeriod.status,
                    updatedAt: existingPayrollPeriod.updatedAt,
                },
                changesAfter: {
                    id: updatedPayrollPeriod.id,
                    name: updatedPayrollPeriod.name,
                    status: updatedPayrollPeriod.status,
                    updatedAt: updatedPayrollPeriod.updatedAt,
                },
                description: `${constant_1.config.AUDIT_LOG.PAYROLLPERIOD.DESCRIPTIONS.PAYROLLPERIOD_UPDATED}: ${updatedPayrollPeriod.name || updatedPayrollPeriod.id}`,
            });
            const successResponse = (0, success_handler_helper_1.buildSuccessResponse)(constant_1.config.SUCCESS.PAYROLLPERIOD.UPDATED, { payrollPeriod: updatedPayrollPeriod }, 200);
            res.status(200).json(successResponse);
        }
        catch (error) {
            payrollPeriodLogger.error(`${constant_1.config.ERROR.PAYROLLPERIOD.ERROR_UPDATING}: ${error}`);
            const errorResponse = (0, error_handler_1.buildErrorResponse)(constant_1.config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500);
            res.status(500).json(errorResponse);
        }
    });
    const remove = (req, res, _next) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        const { id } = req.params;
        try {
            if (!id) {
                payrollPeriodLogger.error(constant_1.config.ERROR.QUERY_PARAMS.MISSING_ID);
                const errorResponse = (0, error_handler_1.buildErrorResponse)(constant_1.config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
                res.status(400).json(errorResponse);
                return;
            }
            payrollPeriodLogger.info(`${constant_1.config.SUCCESS.PAYROLLPERIOD.DELETED}: ${id}`);
            const existingPayrollPeriod = yield prisma.payrollPeriod.findFirst({
                where: { id },
            });
            if (!existingPayrollPeriod) {
                payrollPeriodLogger.error(`${constant_1.config.ERROR.PAYROLLPERIOD.NOT_FOUND}: ${id}`);
                const errorResponse = (0, error_handler_1.buildErrorResponse)(constant_1.config.ERROR.PAYROLLPERIOD.NOT_FOUND, 404);
                res.status(404).json(errorResponse);
                return;
            }
            yield prisma.payrollPeriod.delete({
                where: { id },
            });
            try {
                yield cache_1.invalidateCache.byPattern(`cache:payrollPeriod:byId:${id}:*`);
                yield cache_1.invalidateCache.byPattern("cache:payrollPeriod:list:*");
                payrollPeriodLogger.info(`Cache invalidated after payrollPeriod ${id} deletion`);
            }
            catch (cacheError) {
                payrollPeriodLogger.warn("Failed to invalidate cache after payrollPeriod deletion:", cacheError);
            }
            payrollPeriodLogger.info(`${constant_1.config.SUCCESS.PAYROLLPERIOD.DELETED}: ${id}`);
            (0, activityLogger_1.logActivity)(req, {
                userId: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || "unknown",
                action: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.ACTIONS.DELETE_PAYROLLPERIOD,
                description: `${constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.DESCRIPTIONS.PAYROLLPERIOD_DELETED}: ${existingPayrollPeriod.name || id}`,
                page: {
                    url: req.originalUrl,
                    title: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.PAGES.PAYROLLPERIOD_DELETION,
                },
            });
            (0, auditLogger_1.logAudit)(req, {
                userId: ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id) || "unknown",
                action: constant_1.config.AUDIT_LOG.ACTIONS.DELETE,
                resource: constant_1.config.AUDIT_LOG.RESOURCES.PAYROLLPERIOD,
                severity: constant_1.config.AUDIT_LOG.SEVERITY.LOW,
                entityType: constant_1.config.AUDIT_LOG.ENTITY_TYPES.PAYROLLPERIOD,
                entityId: id,
                changesBefore: {
                    id: existingPayrollPeriod.id,
                    name: existingPayrollPeriod.name,
                    status: existingPayrollPeriod.status,
                },
                changesAfter: null,
                description: `${constant_1.config.AUDIT_LOG.PAYROLLPERIOD.DESCRIPTIONS.PAYROLLPERIOD_DELETED}: ${existingPayrollPeriod.name || id}`,
            });
            const successResponse = (0, success_handler_helper_1.buildSuccessResponse)(constant_1.config.SUCCESS.PAYROLLPERIOD.DELETED, {}, 200);
            res.status(200).json(successResponse);
        }
        catch (error) {
            payrollPeriodLogger.error(`${constant_1.config.ERROR.PAYROLLPERIOD.DELETE_FAILED}: ${error}`);
            const errorResponse = (0, error_handler_1.buildErrorResponse)(constant_1.config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500);
            res.status(500).json(errorResponse);
        }
    });
    const generatePayroll = (req, res, _next) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        const { id: payrollPeriodId } = req.params;
        const organizationId = req.organizationId;
        try {
            // Validate payroll period exists and is in valid status
            const payrollPeriod = yield prisma.payrollPeriod.findUnique({
                where: { id: payrollPeriodId },
            });
            if (!payrollPeriod) {
                payrollPeriodLogger.error(`Payroll period not found: ${payrollPeriodId}`);
                const errorResponse = (0, error_handler_1.buildErrorResponse)("Payroll period not found", 404);
                res.status(404).json(errorResponse);
                return;
            }
            if (payrollPeriod.status === "COMPLETED" || payrollPeriod.status === "CLOSED") {
                payrollPeriodLogger.error(`Cannot generate payroll for ${payrollPeriod.status} period`);
                const errorResponse = (0, error_handler_1.buildErrorResponse)(`Payroll period is already ${payrollPeriod.status.toLowerCase()}`, 400);
                res.status(400).json(errorResponse);
                return;
            }
            // Get all active employees in the organization with matching pay frequency
            const employees = yield prisma.employee.findMany({
                where: Object.assign({ organizationId, isDeleted: false, employmentStatus: "ACTIVE", workforceSource: "DIRECT" }, (payrollPeriod.payFrequency && {
                    payFrequency: payrollPeriod.payFrequency,
                })),
                include: {
                    person: {
                        select: {
                            personalInfo: true,
                        },
                    },
                    department: true,
                    position: true,
                    level: true,
                },
            });
            if (employees.length === 0) {
                payrollPeriodLogger.warn("No active employees found for payroll generation");
                const successResponse = (0, success_handler_helper_1.buildSuccessResponse)("No active employees found for payroll generation", { generated: 0, employees: [] }, 200);
                res.status(200).json(successResponse);
                return;
            }
            const dayNames = [
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
            ];
            const generatedPayrolls = [];
            let successCount = 0;
            let errorCount = 0;
            // Generate payroll for each employee
            for (const employee of employees) {
                try {
                    // Check if payroll already exists for this employee and period
                    const existingPayroll = yield prisma.employeePayroll.findUnique({
                        where: {
                            employeeId_payrollPeriodId: {
                                employeeId: employee.id,
                                payrollPeriodId,
                            },
                        },
                    });
                    if (existingPayroll) {
                        payrollPeriodLogger.info(`Payroll already exists for employee ${employee.id}, skipping`);
                        continue;
                    }
                    // Calculate working days and absences
                    const schedule = (0, employee_schedule_helper_1.resolveEmployeeActiveSchedule)(employee);
                    let totalWorkDays = 0;
                    let daysPresent = 0;
                    let daysAbsent = 0;
                    let totalRestDays = 0;
                    if (schedule) {
                        const currentDate = new Date(payrollPeriod.startDate);
                        // Make endDate inclusive (23:59:59.999)
                        const endDate = new Date(payrollPeriod.endDate);
                        const endDateInclusive = new Date(payrollPeriod.endDate);
                        endDateInclusive.setHours(23, 59, 59, 999);
                        // Get all attendance records for this period (inclusive)
                        const attendances = yield prisma.attendance.findMany({
                            where: {
                                employeeId: employee.id,
                                isDeleted: false,
                                date: {
                                    gte: payrollPeriod.startDate,
                                    lte: endDateInclusive,
                                },
                            },
                        });
                        const attendanceMap = new Map();
                        attendances.forEach((att) => {
                            if (att.date) {
                                const dateKey = att.date.toISOString().split("T")[0];
                                attendanceMap.set(dateKey, att);
                            }
                        });
                        while (currentDate <= endDate) {
                            const dayOfWeek = currentDate.getDay();
                            const dayName = dayNames[dayOfWeek];
                            const dateKey = currentDate.toISOString().split("T")[0];
                            const shift = schedule.shifts.find((s) => {
                                const label = s.label.toLowerCase();
                                return (label.includes(dayName.toLowerCase()) ||
                                    label.includes(dayName.substring(0, 3).toLowerCase()));
                            });
                            if (shift) {
                                if (shift.isRestDay) {
                                    totalRestDays++;
                                }
                                else {
                                    totalWorkDays++;
                                    const attendance = attendanceMap.get(dateKey);
                                    if (attendance) {
                                        daysPresent++;
                                    }
                                    else {
                                        daysAbsent++;
                                    }
                                }
                            }
                            currentDate.setDate(currentDate.getDate() + 1);
                        }
                    }
                    // Calculate rates
                    let dailyRate = 0;
                    let hourlyRate = 0;
                    const monthlySalary = employee.basicSalary;
                    if (totalWorkDays > 0) {
                        // Calculate actual working hours per day from time slots (accounting for breaks)
                        let totalDailyWorkingHours = 0;
                        if ((schedule === null || schedule === void 0 ? void 0 : schedule.shifts) && schedule.shifts.length > 0) {
                            const firstWorkShift = schedule.shifts.find((s) => !s.isRestDay && s.timeSlots);
                            if ((firstWorkShift === null || firstWorkShift === void 0 ? void 0 : firstWorkShift.timeSlots) && firstWorkShift.timeSlots.length > 0) {
                                const workTimeSlots = firstWorkShift.timeSlots.filter((ts) => ts.type === "work");
                                if (workTimeSlots.length > 0) {
                                    totalDailyWorkingHours = workTimeSlots.reduce((total, slot) => {
                                        const [startHour, startMin] = slot.startTime
                                            .split(":")
                                            .map(Number);
                                        const [endHour, endMin] = slot.endTime
                                            .split(":")
                                            .map(Number);
                                        const hours = endHour + endMin / 60 - (startHour + startMin / 60);
                                        return total + hours;
                                    }, 0);
                                }
                            }
                        }
                        if (employee.payFrequency === "MONTHLY") {
                            dailyRate = monthlySalary / totalWorkDays;
                            hourlyRate = dailyRate / totalDailyWorkingHours;
                        }
                        else if (employee.payFrequency === "SEMI_MONTHLY") {
                            // For semi-monthly, the basicSalary (monthlySalary variable) IS the period amount
                            dailyRate = monthlySalary / totalWorkDays;
                            hourlyRate = dailyRate / totalDailyWorkingHours;
                        }
                        else if (employee.payFrequency === "DAILY") {
                            dailyRate = monthlySalary;
                            hourlyRate = dailyRate / totalDailyWorkingHours;
                        }
                    }
                    // Calculate pay
                    let periodBasic = monthlySalary;
                    let splitFactor = 1.0;
                    if (employee.payFrequency === "SEMI_MONTHLY") {
                        periodBasic = monthlySalary;
                        splitFactor = 0.5;
                    }
                    const absentDeduction = (0, tax_calculator_helper_1.roundToCentavo)(daysAbsent * dailyRate);
                    const basicPay = periodBasic; // Basic pay for this specific period
                    const grossPay = (0, tax_calculator_helper_1.roundToCentavo)(basicPay - absentDeduction); // Salary minus absent deduction
                    const regularHours = (totalWorkDays - daysAbsent) * 8;
                    // Calculate tax based on full monthly/semi-monthly amount (not prorated by absences)
                    // Absences reduce the final pay but not the taxable gross for tax calculation
                    // Calculate prorated payroll using helper
                    // We pass the FULL monthly salary for bracket calculations, but the PERIOD gross for the final record.
                    // splitFactor ensures standard deductions are halved for semi-monthly.
                    const proratedPayroll = (0, tax_calculator_helper_1.calculateProratedPayroll)(monthlySalary, grossPay, splitFactor);
                    // Create employee payroll record
                    const employeePayroll = yield prisma.employeePayroll.create({
                        data: {
                            employeeId: employee.id,
                            payrollPeriodId,
                            organizationId,
                            basicPay,
                            grossPay,
                            netPay: proratedPayroll.netPay,
                            totalDeductions: proratedPayroll.totalDeductions,
                            absentDeduction,
                            isPaid: false,
                            sssContribution: proratedPayroll.contributions.sss,
                            philHealthContribution: proratedPayroll.contributions.philHealth,
                            pagibigContribution: proratedPayroll.contributions.pagIbig,
                            taxAmount: proratedPayroll.withholdingTax,
                        },
                    });
                    generatedPayrolls.push({
                        employeeId: employee.id,
                        employeeCode: employee.employeeId,
                        name: `${(_b = (_a = employee.person) === null || _a === void 0 ? void 0 : _a.personalInfo) === null || _b === void 0 ? void 0 : _b.firstName} ${(_d = (_c = employee.person) === null || _c === void 0 ? void 0 : _c.personalInfo) === null || _d === void 0 ? void 0 : _d.lastName}`,
                        basicPay,
                        grossPay,
                        sssContribution: proratedPayroll.contributions.sss,
                        philHealthContribution: proratedPayroll.contributions.philHealth,
                        pagibigContribution: proratedPayroll.contributions.pagIbig,
                        withholdingTax: proratedPayroll.withholdingTax,
                        daysPresent,
                        daysAbsent,
                        totalWorkDays,
                    });
                    successCount++;
                }
                catch (error) {
                    errorCount++;
                    payrollPeriodLogger.error(`Failed to generate payroll for employee ${employee.id}: ${error}`);
                }
            }
            // Update payroll period status to COMPLETED
            yield prisma.payrollPeriod.update({
                where: { id: payrollPeriodId },
                data: {
                    status: "COMPLETED",
                    processedBy: req.metadata?.employee?.id || null,
                    processedAt: new Date(),
                },
            });
            // Invalidate caches
            yield cache_1.invalidateCache.byPattern("cache:payrollPeriod:*");
            yield cache_1.invalidateCache.byPattern("cache:employeePayroll:*");
            payrollPeriodLogger.info(`Generated payroll for ${successCount} employees (${errorCount} errors)`);
            (0, activityLogger_1.logActivity)(req, {
                userId: ((_e = req.user) === null || _e === void 0 ? void 0 : _e.id) || "unknown",
                action: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.ACTIONS.GENERATE_PAYROLL,
                description: `${constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.DESCRIPTIONS.PAYROLL_GENERATED}: ${payrollPeriodId} (${successCount} employees)`,
                page: {
                    url: req.originalUrl,
                    title: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.PAGES.PAYROLL_GENERATION,
                },
            });
            (0, auditLogger_1.logAudit)(req, {
                userId: ((_f = req.user) === null || _f === void 0 ? void 0 : _f.id) || "unknown",
                action: constant_1.config.AUDIT_LOG.ACTIONS.UPDATE,
                resource: constant_1.config.AUDIT_LOG.RESOURCES.PAYROLLPERIOD,
                severity: constant_1.config.AUDIT_LOG.SEVERITY.HIGH,
                entityType: constant_1.config.AUDIT_LOG.ENTITY_TYPES.PAYROLLPERIOD,
                entityId: payrollPeriodId,
                changesBefore: {
                    id: payrollPeriod.id,
                    status: payrollPeriod.status,
                },
                changesAfter: {
                    id: payrollPeriodId,
                    status: "COMPLETED",
                    generated: successCount,
                    errors: errorCount,
                    total: employees.length,
                },
                description: `${constant_1.config.AUDIT_LOG.PAYROLLPERIOD.DESCRIPTIONS.PAYROLL_GENERATED}: ${payrollPeriodId}`,
            });
            const successResponse = (0, success_handler_helper_1.buildSuccessResponse)(`Payroll generated successfully for ${successCount} employees`, {
                generated: successCount,
                errors: errorCount,
                total: employees.length,
                payrolls: generatedPayrolls,
            }, 200);
            res.status(200).json(successResponse);
        }
        catch (error) {
            payrollPeriodLogger.error(`Failed to generate payroll: ${error}`);
            const errorResponse = (0, error_handler_1.buildErrorResponse)(constant_1.config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500);
            res.status(500).json(errorResponse);
        }
    });
    const generateTimesheetPayroll = (req, res, _next) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        const { id: payrollPeriodId } = req.params;
        const organizationId = req.organizationId;
        const requestedDepartmentId = typeof req.body?.departmentId === "string" && req.body.departmentId.trim() !== "all"
            ? req.body.departmentId.trim()
            : null;
        const requestedSectionId = typeof req.body?.sectionId === "string" && req.body.sectionId.trim() !== "all"
            ? req.body.sectionId.trim()
            : null;
        try {
            // Validate payroll period exists and is in valid status
            const payrollPeriod = yield prisma.payrollPeriod.findUnique({
                where: { id: payrollPeriodId },
            });
            if (!payrollPeriod) {
                payrollPeriodLogger.error(`Payroll period not found: ${payrollPeriodId}`);
                const errorResponse = (0, error_handler_1.buildErrorResponse)("Payroll period not found", 404);
                res.status(404).json(errorResponse);
                return;
            }
            if (payrollPeriod.status === "COMPLETED" || payrollPeriod.status === "CLOSED") {
                payrollPeriodLogger.error(`Cannot generate payroll for ${payrollPeriod.status} period`);
                const errorResponse = (0, error_handler_1.buildErrorResponse)(`Payroll period is already ${payrollPeriod.status.toLowerCase()}`, 400);
                res.status(400).json(errorResponse);
                return;
            }
            const activeJob = payroll_generation_job_service_1.PayrollGenerationJobService.getActiveJobForPeriod(payrollPeriodId);
            if (payrollPeriod.status === "PROCESSING" && activeJob) {
                const errorResponse = (0, error_handler_1.buildErrorResponse)("Payroll generation is already in progress for this period", 409, [
                    {
                        field: "payrollJobId",
                        message: activeJob.jobId,
                    },
                ]);
                res.status(409).json(errorResponse);
                return;
            }
            const isResumingProcessingPeriod = payrollPeriod.status === "PROCESSING" && !activeJob;
            const scopedDryRun = yield (0, payroll_period_helper_1.previewPayrollFromTimesheets)(prisma, payrollPeriodId, organizationId, {
                page: 1,
                limit: 1,
                query: "",
                departmentId: requestedDepartmentId,
                sectionId: requestedSectionId,
                requireCalculator: true,
            });
            const expectedTotal = scopedDryRun.summary.includedEmployeesCount;
            const jobId = payroll_generation_job_service_1.PayrollGenerationJobService.createJob({ total: expectedTotal, periodId: payrollPeriodId });
            payroll_generation_job_service_1.PayrollGenerationJobService.attachLiveWorker(jobId);
            yield prisma.payrollPeriod.update({
                where: { id: payrollPeriodId },
                data: {
                    status: "PROCESSING",
                    processedBy: req.metadata?.employee?.id || null,
                    processedAt: null,
                },
            });
            // Fire-and-forget worker: survives FE page navigation; progress is
            // persisted on PayrollPeriod.generationMetadata.payrollGeneration.
            (() => __awaiter(void 0, void 0, void 0, function* () {
                try {
                    payroll_generation_job_service_1.PayrollGenerationJobService.attachLiveWorker(jobId);
                    const result = yield (0, payroll_period_helper_1.generatePayrollFromTimesheets)(prisma, payrollPeriodId, organizationId, req.userId, {
                        onStart: ({ total }) => {
                            payroll_generation_job_service_1.PayrollGenerationJobService.updateJob(jobId, { total });
                        },
                        onProgress: ({ processed, success, failed, employeeId, error }) => {
                            payroll_generation_job_service_1.PayrollGenerationJobService.updateJob(jobId, {
                                processed,
                                success,
                                failed,
                            });
                            if (error) {
                                payroll_generation_job_service_1.PayrollGenerationJobService.appendError(jobId, {
                                    row: processed || failed || 0,
                                    employeeId: employeeId || "unknown",
                                    error,
                                });
                            }
                        },
                        shouldStop: () => payroll_generation_job_service_1.PayrollGenerationJobService.isStopRequested(jobId),
                        shouldPause: () => payroll_generation_job_service_1.PayrollGenerationJobService.isPauseRequested(jobId),
                        resumeFromExistingPayrolls: isResumingProcessingPeriod,
                        departmentId: requestedDepartmentId,
                        sectionId: requestedSectionId,
                    });
                    if (!result.success) {
                        if (result.paused) {
                            payroll_generation_job_service_1.PayrollGenerationJobService.updateJob(jobId, {
                                total: result.total,
                                processed: result.generated + result.errors,
                                success: result.generated,
                                failed: result.errors,
                            });
                            payroll_generation_job_service_1.PayrollGenerationJobService.markPaused(jobId, result.message);
                            yield cache_1.invalidateCache.byPattern("cache:payrollPeriod:*");
                            yield cache_1.invalidateCache.byPattern("cache:employeePayroll:*");
                            return;
                        }
                        if (result.cancelled) {
                            yield prisma.payrollPeriod.update({
                                where: { id: payrollPeriodId },
                                data: { status: "OPEN", processedAt: null },
                            });
                            payroll_generation_job_service_1.PayrollGenerationJobService.updateJob(jobId, {
                                total: result.total,
                                processed: result.generated + result.errors,
                                success: result.generated,
                                failed: result.errors,
                            });
                            payroll_generation_job_service_1.PayrollGenerationJobService.markCancelled(jobId, result.message);
                            yield cache_1.invalidateCache.byPattern("cache:payrollPeriod:*");
                            yield cache_1.invalidateCache.byPattern("cache:employeePayroll:*");
                            return;
                        }
                        yield prisma.payrollPeriod.update({
                            where: { id: payrollPeriodId },
                            data: { status: "OPEN", processedAt: null },
                        });
                        payroll_generation_job_service_1.PayrollGenerationJobService.markFailed(jobId, result.message);
                        payroll_generation_job_service_1.PayrollGenerationJobService.appendError(jobId, {
                            row: 0,
                            employeeId: "SYSTEM",
                            error: result.message,
                        });
                        return;
                    }
                    yield cache_1.invalidateCache.byPattern("cache:payrollPeriod:*");
                    yield cache_1.invalidateCache.byPattern("cache:employeePayroll:*");
                    payroll_generation_job_service_1.PayrollGenerationJobService.updateJob(jobId, {
                        total: result.total,
                        processed: result.generated + result.errors,
                        success: result.generated,
                        failed: result.errors,
                    });
                    payroll_generation_job_service_1.PayrollGenerationJobService.markCompleted(jobId, result.message);
                }
                catch (error) {
                    payrollPeriodLogger.error(`Async payroll generation failed for period ${payrollPeriodId}: ${error}`);
                    try {
                        yield prisma.payrollPeriod.update({
                            where: { id: payrollPeriodId },
                            data: { status: "OPEN", processedAt: null },
                        });
                    }
                    catch (rollbackError) {
                        payrollPeriodLogger.error(`Failed to rollback payroll period status for ${payrollPeriodId}: ${rollbackError}`);
                    }
                    payroll_generation_job_service_1.PayrollGenerationJobService.appendError(jobId, {
                        row: 0,
                        employeeId: "SYSTEM",
                        error: error instanceof Error ? error.message : String(error),
                    });
                    payroll_generation_job_service_1.PayrollGenerationJobService.markFailed(jobId, error instanceof Error ? error.message : "Payroll generation failed");
                }
                finally {
                    // Worker loop ended for this process (success, pause, cancel, or crash).
                    payroll_generation_job_service_1.PayrollGenerationJobService.detachLiveWorker(jobId);
                }
            }))();
            const responseData = {
                jobId,
                message: "Payroll generation started",
                total: expectedTotal,
            };
            (0, activityLogger_1.logActivity)(req, {
                userId: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || "unknown",
                action: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.ACTIONS.GENERATE_TIMESHEET_PAYROLL,
                description: `${constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.DESCRIPTIONS.TIMESHEET_PAYROLL_GENERATION_STARTED}: ${payrollPeriodId} (job ${jobId})`,
                page: {
                    url: req.originalUrl,
                    title: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.PAGES.PAYROLL_GENERATION,
                },
            });
            (0, auditLogger_1.logAudit)(req, {
                userId: ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id) || "unknown",
                action: constant_1.config.AUDIT_LOG.ACTIONS.UPDATE,
                resource: constant_1.config.AUDIT_LOG.RESOURCES.PAYROLLPERIOD,
                severity: constant_1.config.AUDIT_LOG.SEVERITY.HIGH,
                entityType: constant_1.config.AUDIT_LOG.ENTITY_TYPES.PAYROLLPERIOD,
                entityId: payrollPeriodId,
                changesBefore: {
                    id: payrollPeriod.id,
                    status: payrollPeriod.status,
                },
                changesAfter: {
                    id: payrollPeriodId,
                    status: "PROCESSING",
                    jobId,
                    total: expectedTotal,
                },
                description: `${constant_1.config.AUDIT_LOG.PAYROLLPERIOD.DESCRIPTIONS.TIMESHEET_PAYROLL_GENERATION_STARTED}: ${payrollPeriodId}`,
            });
            const successResponse = (0, success_handler_helper_1.buildSuccessResponse)("Payroll generation started successfully", responseData, 202);
            res.status(202).json(successResponse);
        }
        catch (error) {
            payrollPeriodLogger.error(`Failed to generate payroll from timesheets: ${error}`);
            const errorResponse = (0, error_handler_1.buildErrorResponse)(constant_1.config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500);
            res.status(500).json(errorResponse);
        }
    });
    const previewTimesheetPayroll = (req, res, _next) => __awaiter(void 0, void 0, void 0, function* () {
        const { id: payrollPeriodId } = req.params;
        const organizationId = req.organizationId;
        const requestedPage = Number(req.query.page);
        const requestedLimit = Number(req.query.limit);
        const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
        const requestedDepartmentId = typeof req.query.departmentId === "string" && req.query.departmentId.trim() !== "all"
            ? req.query.departmentId.trim()
            : null;
        const requestedSectionId = typeof req.query.sectionId === "string" && req.query.sectionId.trim() !== "all"
            ? req.query.sectionId.trim()
            : null;
        const requestedEmployeeId = typeof req.query.employeeId === "string" && req.query.employeeId.trim() !== ""
            ? req.query.employeeId.trim()
            : null;
        // Accept string | string[] | boolean query shapes from Express/qs.
        const calculateRowsParam = Array.isArray(req.query.calculateRows)
            ? req.query.calculateRows[0]
            : req.query.calculateRows;
        const calculateRowsRaw =
            typeof calculateRowsParam === "string"
                ? calculateRowsParam.trim().toLowerCase()
                : calculateRowsParam === true
                    ? "true"
                    : "";
        const calculateRows =
            calculateRowsRaw === "true" ||
                calculateRowsRaw === "1" ||
                calculateRowsRaw === "yes" ||
                calculateRowsParam === true;
        const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
        const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
            ? Math.min(Math.floor(requestedLimit), 50)
            : 10;
        try {
            const payrollPeriod = yield prisma.payrollPeriod.findUnique({
                where: { id: payrollPeriodId },
            });
            if (!payrollPeriod) {
                const errorResponse = (0, error_handler_1.buildErrorResponse)("Payroll period not found", 404);
                res.status(404).json(errorResponse);
                return;
            }
            // List mode defaults to DETAIL_REQUIRED stubs (basicSalary only). Preview Payroll
            // results must set calculateRows so each row gets gross/deductions/net dry-run amounts.
            const shouldCalculateRows = Boolean(calculateRows || requestedEmployeeId);
            const preview = yield (0, payroll_period_helper_1.previewPayrollFromTimesheets)(prisma, payrollPeriodId, organizationId, {
                page,
                limit,
                query,
                departmentId: requestedDepartmentId,
                sectionId: requestedSectionId,
                employeeId: requestedEmployeeId,
                calculateRows: shouldCalculateRows,
            });
            (0, activityLogger_1.logActivity)(req, {
                userId: (req.user && req.user.id) || "unknown",
                action: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.ACTIONS.PREVIEW_TIMESHEET_PAYROLL,
                description: `${constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.DESCRIPTIONS.TIMESHEET_PAYROLL_PREVIEWED}: ${payrollPeriodId}`,
                page: {
                    url: req.originalUrl,
                    title: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.PAGES.PAYROLL_GENERATION,
                },
            });
            res.status(200).json((0, success_handler_helper_1.buildSuccessResponse)("Payroll preview retrieved successfully", preview, 200));
        }
        catch (error) {
            payrollPeriodLogger.error(`Failed to preview timesheet payroll: ${error}`);
            const errorResponse = (0, error_handler_1.buildErrorResponse)(error instanceof Error
                ? error.message
                : constant_1.config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500);
            res.status(500).json(errorResponse);
        }
    });
    const getOtReadiness = (req, res, _next) => __awaiter(void 0, void 0, void 0, function* () {
        const { id: payrollPeriodId } = req.params;
        const organizationId = req.organizationId;
        const requestedPage = Number(req.query.page);
        const requestedLimit = Number(req.query.limit);
        const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
        const onlyWithOtRaw = typeof req.query.onlyWithOt === "string" ? req.query.onlyWithOt.trim().toLowerCase() : "true";
        const onlyWithOt = onlyWithOtRaw !== "false" && onlyWithOtRaw !== "0";
        const requestedDepartmentId = typeof req.query.departmentId === "string" && req.query.departmentId.trim() !== "all"
            ? req.query.departmentId.trim()
            : undefined;
        const requestedSectionId = typeof req.query.sectionId === "string" && req.query.sectionId.trim() !== "all"
            ? req.query.sectionId.trim()
            : undefined;
        const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
        const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
            ? Math.min(Math.floor(requestedLimit), 100)
            : 25;
        try {
            if (!payrollPeriodId || !organizationId) {
                res.status(400).json((0, error_handler_1.buildErrorResponse)("payrollPeriodId and organizationId are required", 400));
                return;
            }
            const { getPayrollPeriodOtReadiness } = require("../../helper/payroll-ot-readiness.helper");
            const readiness = yield getPayrollPeriodOtReadiness(prisma, {
                payrollPeriodId,
                organizationId,
                page,
                limit,
                query,
                onlyWithOt,
                departmentId: requestedDepartmentId,
                sectionId: requestedSectionId,
            });
            res.status(200).json((0, success_handler_helper_1.buildSuccessResponse)("Payroll OT readiness retrieved successfully", readiness, 200));
        }
        catch (error) {
            payrollPeriodLogger.error(`Failed to load payroll OT readiness: ${error}`);
            res.status(error instanceof Error && /not found/i.test(error.message) ? 404 : 500).json((0, error_handler_1.buildErrorResponse)(error instanceof Error ? error.message : constant_1.config.ERROR.COMMON.INTERNAL_SERVER_ERROR, error instanceof Error && /not found/i.test(error.message) ? 404 : 500));
        }
    });
    const getOtPersonDetail = (req, res, _next) => __awaiter(void 0, void 0, void 0, function* () {
        const { id: payrollPeriodId, timesheetId } = req.params;
        const organizationId = req.organizationId;
        try {
            if (!payrollPeriodId || !organizationId || !timesheetId) {
                res.status(400).json((0, error_handler_1.buildErrorResponse)("payrollPeriodId, timesheetId and organizationId are required", 400));
                return;
            }
            const { getPayrollPeriodOtPersonDetail } = require("../../helper/payroll-ot-readiness.helper");
            const detail = yield getPayrollPeriodOtPersonDetail(prisma, {
                payrollPeriodId,
                organizationId,
                timesheetId,
            });
            res.status(200).json((0, success_handler_helper_1.buildSuccessResponse)("Payroll OT person detail retrieved successfully", detail, 200));
        }
        catch (error) {
            payrollPeriodLogger.error(`Failed to load payroll OT person detail: ${error}`);
            res.status(error instanceof Error && /not found/i.test(error.message) ? 404 : 500).json((0, error_handler_1.buildErrorResponse)(error instanceof Error ? error.message : constant_1.config.ERROR.COMMON.INTERNAL_SERVER_ERROR, error instanceof Error && /not found/i.test(error.message) ? 404 : 500));
        }
    });
    /** Schedule assignment deltas (WorkSharing / history) for Run Payroll accordion. */
    const getScheduleDeltas = (req, res, _next) => __awaiter(void 0, void 0, void 0, function* () {
        const { id: payrollPeriodId } = req.params;
        const organizationId = req.organizationId;
        const requestedPage = Number(req.query.page);
        const requestedLimit = Number(req.query.limit);
        const onlyWorkshareRaw = typeof req.query.onlyWorkshare === "string"
            ? req.query.onlyWorkshare.trim().toLowerCase()
            : "true";
        const onlyWorkshare = onlyWorkshareRaw !== "false" && onlyWorkshareRaw !== "0";
        const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
        const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
            ? Math.min(Math.floor(requestedLimit), 100)
            : 25;
        try {
            if (!payrollPeriodId || !organizationId) {
                res.status(400).json((0, error_handler_1.buildErrorResponse)("payrollPeriodId and organizationId are required", 400));
                return;
            }
            const { getPayrollPeriodScheduleDeltas } = require("../../helper/payroll-schedule-delta.helper");
            const deltas = yield getPayrollPeriodScheduleDeltas(prisma, {
                payrollPeriodId,
                organizationId,
                page,
                limit,
                onlyWorkshare,
            });
            res.status(200).json((0, success_handler_helper_1.buildSuccessResponse)("Payroll schedule deltas retrieved successfully", deltas, 200));
        }
        catch (error) {
            payrollPeriodLogger.error(`Failed to load payroll schedule deltas: ${error}`);
            res.status(error instanceof Error && /not found/i.test(error.message) ? 404 : 500).json((0, error_handler_1.buildErrorResponse)(error instanceof Error ? error.message : constant_1.config.ERROR.COMMON.INTERNAL_SERVER_ERROR, error instanceof Error && /not found/i.test(error.message) ? 404 : 500));
        }
    });
    const getTimesheetGenerationProgress = (req, res, _next) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const { jobId } = req.params;
            if (!jobId) {
                const errorResponse = (0, error_handler_1.buildErrorResponse)("Job ID is required", 400);
                res.status(400).json(errorResponse);
                return;
            }
            const progress = yield payroll_generation_job_service_1.PayrollGenerationJobService.getJobProgressAsync(jobId);
            if (!progress) {
                const errorResponse = (0, error_handler_1.buildErrorResponse)("Payroll generation job not found or expired", 404);
                res.status(404).json(errorResponse);
                return;
            }
            // Serialize dates for FE; include orphaned so stuck UX can resume.
            const payload = Object.assign({}, progress, {
                startedAt: progress.startedAt,
                updatedAt: progress.updatedAt || progress.startedAt,
                completedAt: progress.completedAt,
                orphaned: Boolean(progress.orphaned),
            });
            const successResponse = (0, success_handler_helper_1.buildSuccessResponse)("Payroll generation progress retrieved successfully", payload, 200);
            res.status(200).json(successResponse);
        }
        catch (error) {
            payrollPeriodLogger.error(`Error getting payroll generation progress: ${error}`);
            const errorResponse = (0, error_handler_1.buildErrorResponse)(constant_1.config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500);
            res.status(500).json(errorResponse);
        }
    });
    const getActiveTimesheetGenerationProgress = (req, res, _next) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        try {
            const { id: payrollPeriodId } = req.params;
            const progress = yield payroll_generation_job_service_1.PayrollGenerationJobService.getActiveJobForPeriodAsync(payrollPeriodId);
            (0, activityLogger_1.logActivity)(req, {
                userId: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || "unknown",
                action: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.ACTIONS.GET_ACTIVE_GENERATION_PROGRESS,
                description: `${constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.DESCRIPTIONS.ACTIVE_GENERATION_PROGRESS_RETRIEVED}: ${payrollPeriodId}`,
                page: {
                    url: req.originalUrl,
                    title: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.PAGES.PAYROLL_GENERATION,
                },
            });
            res.status(200).json((0, success_handler_helper_1.buildSuccessResponse)("Active payroll generation progress retrieved successfully", progress, 200));
        }
        catch (error) {
            payrollPeriodLogger.error(`Error getting active payroll generation progress: ${error}`);
            res.status(500).json((0, error_handler_1.buildErrorResponse)(constant_1.config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500));
        }
    });
    const requestStopTimesheetPayroll = (req, res, _next) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        const { id: payrollPeriodId } = req.params;
        try {
            const payrollPeriod = yield prisma.payrollPeriod.findUnique({ where: { id: payrollPeriodId } });
            if (!payrollPeriod) {
                res.status(404).json((0, error_handler_1.buildErrorResponse)("Payroll period not found", 404));
                return;
            }
            if (payrollPeriod.status !== "PROCESSING") {
                res.status(409).json((0, error_handler_1.buildErrorResponse)("Payroll period is not currently processing", 409));
                return;
            }
            const activeJob = payroll_generation_job_service_1.PayrollGenerationJobService.getActiveJobForPeriod(payrollPeriodId);
            if (!activeJob) {
                yield prisma.payrollPeriod.update({
                    where: { id: payrollPeriodId },
                    data: { status: "OPEN", processedBy: null, processedAt: null },
                });
                yield cache_1.invalidateCache.byPattern("cache:payrollPeriod:*");
                (0, activityLogger_1.logActivity)(req, {
                    userId: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || "unknown",
                    action: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.ACTIONS.REQUEST_STOP_TIMESHEET_PAYROLL,
                    description: `${constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.DESCRIPTIONS.TIMESHEET_PAYROLL_STOP_REQUESTED}: ${payrollPeriodId} (reopened)`,
                    page: {
                        url: req.originalUrl,
                        title: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.PAGES.PAYROLL_GENERATION,
                    },
                });
                (0, auditLogger_1.logAudit)(req, {
                    userId: ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id) || "unknown",
                    action: constant_1.config.AUDIT_LOG.ACTIONS.UPDATE,
                    resource: constant_1.config.AUDIT_LOG.RESOURCES.PAYROLLPERIOD,
                    severity: constant_1.config.AUDIT_LOG.SEVERITY.HIGH,
                    entityType: constant_1.config.AUDIT_LOG.ENTITY_TYPES.PAYROLLPERIOD,
                    entityId: payrollPeriodId,
                    changesBefore: { id: payrollPeriod.id, status: payrollPeriod.status },
                    changesAfter: { id: payrollPeriodId, status: "OPEN", action: "reopened" },
                    description: `${constant_1.config.AUDIT_LOG.PAYROLLPERIOD.DESCRIPTIONS.TIMESHEET_PAYROLL_STOP_REQUESTED}: ${payrollPeriodId}`,
                });
                res.status(200).json((0, success_handler_helper_1.buildSuccessResponse)("Payroll period reopened successfully", {
                    action: "reopened",
                    cancellationRequested: false,
                    message: "No active payroll job was found. The stuck processing period was reopened safely.",
                }, 200));
                return;
            }
            payroll_generation_job_service_1.PayrollGenerationJobService.requestStop(activeJob.jobId, "Stop requested. The current payroll run will finish the current employee before stopping.");
            (0, activityLogger_1.logActivity)(req, {
                userId: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || "unknown",
                action: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.ACTIONS.REQUEST_STOP_TIMESHEET_PAYROLL,
                description: `${constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.DESCRIPTIONS.TIMESHEET_PAYROLL_STOP_REQUESTED}: ${payrollPeriodId} (job ${activeJob.jobId})`,
                page: {
                    url: req.originalUrl,
                    title: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.PAGES.PAYROLL_GENERATION,
                },
            });
            (0, auditLogger_1.logAudit)(req, {
                userId: ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id) || "unknown",
                action: constant_1.config.AUDIT_LOG.ACTIONS.UPDATE,
                resource: constant_1.config.AUDIT_LOG.RESOURCES.PAYROLLPERIOD,
                severity: constant_1.config.AUDIT_LOG.SEVERITY.HIGH,
                entityType: constant_1.config.AUDIT_LOG.ENTITY_TYPES.PAYROLLPERIOD,
                entityId: payrollPeriodId,
                changesBefore: { id: payrollPeriod.id, status: payrollPeriod.status },
                changesAfter: { id: payrollPeriodId, jobId: activeJob.jobId, action: "cancellation_requested" },
                description: `${constant_1.config.AUDIT_LOG.PAYROLLPERIOD.DESCRIPTIONS.TIMESHEET_PAYROLL_STOP_REQUESTED}: ${payrollPeriodId}`,
            });
            res.status(202).json((0, success_handler_helper_1.buildSuccessResponse)("Payroll stop requested successfully", {
                jobId: activeJob.jobId,
                action: "cancellation_requested",
                cancellationRequested: true,
                message: "Stop requested. The current payroll run will stop after the current employee finishes.",
                total: activeJob.total,
            }, 202));
        }
        catch (error) {
            payrollPeriodLogger.error(`Failed to request payroll stop: ${error}`);
            res.status(500).json((0, error_handler_1.buildErrorResponse)(constant_1.config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500));
        }
    });
    const requestPauseTimesheetPayroll = (req, res, _next) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        const { id: payrollPeriodId } = req.params;
        try {
            const payrollPeriod = yield prisma.payrollPeriod.findUnique({ where: { id: payrollPeriodId } });
            if (!payrollPeriod) {
                res.status(404).json((0, error_handler_1.buildErrorResponse)("Payroll period not found", 404));
                return;
            }
            if (payrollPeriod.status !== "PROCESSING") {
                res.status(409).json((0, error_handler_1.buildErrorResponse)("Payroll period is not currently processing", 409));
                return;
            }
            const activeJob = payroll_generation_job_service_1.PayrollGenerationJobService.getActiveJobForPeriod(payrollPeriodId);
            if (!activeJob) {
                res.status(409).json((0, error_handler_1.buildErrorResponse)("No active payroll job was found to pause", 409));
                return;
            }
            payroll_generation_job_service_1.PayrollGenerationJobService.requestPause(activeJob.jobId, "Pause requested. The current payroll run will pause after the current employee finishes.");
            (0, activityLogger_1.logActivity)(req, {
                userId: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || "unknown",
                action: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.ACTIONS.REQUEST_PAUSE_TIMESHEET_PAYROLL,
                description: `${constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.DESCRIPTIONS.TIMESHEET_PAYROLL_PAUSE_REQUESTED}: ${payrollPeriodId} (job ${activeJob.jobId})`,
                page: {
                    url: req.originalUrl,
                    title: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.PAGES.PAYROLL_GENERATION,
                },
            });
            (0, auditLogger_1.logAudit)(req, {
                userId: ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id) || "unknown",
                action: constant_1.config.AUDIT_LOG.ACTIONS.UPDATE,
                resource: constant_1.config.AUDIT_LOG.RESOURCES.PAYROLLPERIOD,
                severity: constant_1.config.AUDIT_LOG.SEVERITY.HIGH,
                entityType: constant_1.config.AUDIT_LOG.ENTITY_TYPES.PAYROLLPERIOD,
                entityId: payrollPeriodId,
                changesBefore: { id: payrollPeriod.id, status: payrollPeriod.status },
                changesAfter: { id: payrollPeriodId, jobId: activeJob.jobId, action: "pause_requested" },
                description: `${constant_1.config.AUDIT_LOG.PAYROLLPERIOD.DESCRIPTIONS.TIMESHEET_PAYROLL_PAUSE_REQUESTED}: ${payrollPeriodId}`,
            });
            res.status(202).json((0, success_handler_helper_1.buildSuccessResponse)("Payroll pause requested successfully", {
                jobId: activeJob.jobId,
                action: "pause_requested",
                pauseRequested: true,
                message: "Pause requested. The current payroll run will pause after the current employee finishes.",
                total: activeJob.total,
            }, 202));
        }
        catch (error) {
            payrollPeriodLogger.error(`Failed to request payroll pause: ${error}`);
            res.status(500).json((0, error_handler_1.buildErrorResponse)(constant_1.config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500));
        }
    });
    const isPayrollPolicyManager = (role) => ["hris-hr-manager", "hris-hr-user", "hris-admin", "admin", "super_admin"].includes(role || "");
    const getConfig = (req, res, _next) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        try {
            const organizationId = req.organizationId;
            if (!organizationId) {
                res.status(401).json((0, error_handler_1.buildErrorResponse)("Organization ID is required", 401));
                return;
            }
            const cycleConfig = yield getOrCreatePayrollCycleConfig(organizationId);
            (0, activityLogger_1.logActivity)(req, {
                userId: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || "unknown",
                action: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.ACTIONS.GET_PAYROLL_CONFIG,
                description: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.DESCRIPTIONS.PAYROLL_CONFIG_RETRIEVED,
                page: {
                    url: req.originalUrl,
                    title: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.PAGES.PAYROLL_CONFIG,
                },
            });
            res.status(200).json((0, success_handler_helper_1.buildSuccessResponse)("Payroll cycle config retrieved successfully", cycleConfig, 200));
        }
        catch (error) {
            payrollPeriodLogger.error(`Failed to retrieve payroll cycle config: ${error}`);
            res.status(500).json((0, error_handler_1.buildErrorResponse)("Failed to retrieve payroll cycle config", 500));
        }
    });
    const updateConfig = (req, res, _next) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        try {
            const organizationId = req.organizationId;
            const role = req.role;
            if (!organizationId) {
                res.status(401).json((0, error_handler_1.buildErrorResponse)("Organization ID is required", 401));
                return;
            }
            if (!isPayrollPolicyManager(role)) {
                res.status(403).json((0, error_handler_1.buildErrorResponse)("You are not authorized to update payroll cycle configuration", 403));
                return;
            }
            const parsed = payrollperiod_zod_2.UpdatePayrollCycleConfigSchema.safeParse(req.body);
            if (!parsed.success) {
                const formattedErrors = (0, error_handler_1.formatZodErrors)(parsed.error.format());
                res.status(400).json((0, error_handler_1.buildErrorResponse)("Validation failed", 400, formattedErrors));
                return;
            }
            if (Object.keys(parsed.data).length === 0) {
                res.status(400).json((0, error_handler_1.buildErrorResponse)("No fields to update", 400));
                return;
            }
            yield getOrCreatePayrollCycleConfig(organizationId);
            const currentConfig = yield getOrCreatePayrollCycleConfig(organizationId);
            const mergedCycleRules = Object.assign(Object.assign({}, (currentConfig.cycleRules || {})), (parsed.data.cycleRules || {}));
            const updated = yield prisma.payrollCycleConfig.update({
                where: { id: currentConfig.id },
                data: Object.assign(Object.assign({}, parsed.data), { cycleRules: parsed.data.cycleRules !== undefined
                        ? mergedCycleRules
                        : undefined }),
            });
            (0, activityLogger_1.logActivity)(req, {
                userId: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || "unknown",
                action: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.ACTIONS.UPDATE_PAYROLL_CONFIG,
                description: `${constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.DESCRIPTIONS.PAYROLL_CONFIG_UPDATED}: ${updated.id}`,
                page: {
                    url: req.originalUrl,
                    title: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.PAGES.PAYROLL_CONFIG,
                },
            });
            (0, auditLogger_1.logAudit)(req, {
                userId: ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id) || "unknown",
                action: constant_1.config.AUDIT_LOG.ACTIONS.UPDATE,
                resource: constant_1.config.AUDIT_LOG.RESOURCES.PAYROLLPERIOD,
                severity: constant_1.config.AUDIT_LOG.SEVERITY.HIGH,
                entityType: constant_1.config.AUDIT_LOG.ENTITY_TYPES.PAYROLLPERIOD,
                entityId: updated.id,
                changesBefore: {
                    id: currentConfig.id,
                    defaultPayFrequency: currentConfig.defaultPayFrequency,
                    payDateOffsetDays: currentConfig.payDateOffsetDays,
                },
                changesAfter: {
                    id: updated.id,
                    defaultPayFrequency: updated.defaultPayFrequency,
                    payDateOffsetDays: updated.payDateOffsetDays,
                },
                description: `${constant_1.config.AUDIT_LOG.PAYROLLPERIOD.DESCRIPTIONS.PAYROLL_CONFIG_UPDATED}: ${updated.id}`,
            });
            res.status(200).json((0, success_handler_helper_1.buildSuccessResponse)("Payroll cycle config updated successfully", updated, 200));
        }
        catch (error) {
            payrollPeriodLogger.error(`Failed to update payroll cycle config: ${error}`);
            res.status(500).json((0, error_handler_1.buildErrorResponse)("Failed to update payroll cycle config", 500));
        }
    });
    const getDefaultCalculatorId = (organizationId, requestedId) => __awaiter(void 0, void 0, void 0, function* () {
        if (requestedId)
            return requestedId;
        const currentYear = new Date().getFullYear();
        const byCode = yield prisma.calculator.findFirst({
            where: {
                organizationId,
                code: `CALC-DEFAULT-${currentYear}`,
                isDeleted: false,
            },
            select: { id: true },
        });
        if (byCode === null || byCode === void 0 ? void 0 : byCode.id)
            return byCode.id;
        const defaultCalculator = yield prisma.calculator.findFirst({
            where: {
                organizationId,
                isDeleted: false,
                isDefault: true,
            },
            select: { id: true },
            orderBy: { updatedAt: "desc" },
        });
        return defaultCalculator === null || defaultCalculator === void 0 ? void 0 : defaultCalculator.id;
    });
    const bulkGenerate = (req, res, _next) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        try {
            const organizationId = req.organizationId;
            const role = req.role;
            if (!organizationId) {
                res.status(401).json((0, error_handler_1.buildErrorResponse)("Organization ID is required", 401));
                return;
            }
            if (!isPayrollPolicyManager(role)) {
                res.status(403).json((0, error_handler_1.buildErrorResponse)("You are not authorized to generate payroll periods", 403));
                return;
            }
            const parsed = payrollperiod_zod_2.PayrollPeriodBulkGenerateSchema.safeParse(req.body);
            if (!parsed.success) {
                const formattedErrors = (0, error_handler_1.formatZodErrors)(parsed.error.format());
                res.status(400).json((0, error_handler_1.buildErrorResponse)("Validation failed", 400, formattedErrors));
                return;
            }
            const payload = parsed.data;
            const cycleConfig = yield getOrCreatePayrollCycleConfig(organizationId);
            const holidayKeys = yield getHolidayDateKeys(organizationId, payload.rangeStart, new Date(payload.rangeEnd.getTime() + 1000 * 60 * 60 * 24 * 60));
            const periods = (0, payroll_cycle_helper_1.buildPeriodsFromRange)({
                frequency: payload.frequency,
                rangeStart: payload.rangeStart,
                rangeEnd: payload.rangeEnd,
                config: cycleConfig,
                holidayKeys,
                namingMode: payload.namingMode,
                customNamePrefix: payload.customNamePrefix,
            }).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
            for (let i = 1; i < periods.length; i++) {
                const prev = periods[i - 1];
                const current = periods[i];
                const gapDays = Math.floor((current.startDate.getTime() - prev.endDate.getTime()) / (1000 * 60 * 60 * 24));
                if (gapDays > 1) {
                    res.status(400).json((0, error_handler_1.buildErrorResponse)("Generated periods are not continuous. Please adjust range and settings.", 400));
                    return;
                }
            }
            const calculatorId = yield getDefaultCalculatorId(organizationId, payload.calculatorId);
            const summary = {
                totalComputed: periods.length,
                created: 0,
                updated: 0,
                skipped: 0,
                items: [],
            };
            for (const period of periods) {
                const existing = yield prisma.payrollPeriod.findFirst({
                    where: {
                        organizationId,
                        startDate: period.startDate,
                        endDate: period.endDate,
                        isDeleted: false,
                    },
                });
                if (!existing) {
                    if (!payload.dryRun) {
                        yield prisma.payrollPeriod.create({
                            data: {
                                organizationId,
                                name: period.name,
                                code: period.code,
                                startDate: period.startDate,
                                endDate: period.endDate,
                                payDate: period.payDate,
                                payFrequency: period.payFrequency,
                                periodNumber: period.periodNumber,
                                cutoffDay: period.cutoffDay,
                                status: period.status,
                                notes: period.notes,
                                generationMetadata: period.generationMetadata,
                                calculatorId: calculatorId || undefined,
                            },
                        });
                    }
                    summary.created += 1;
                    summary.items.push({ code: period.code, action: "created" });
                    continue;
                }
                if (existing.status === "COMPLETED" || existing.status === "CLOSED") {
                    summary.skipped += 1;
                    summary.items.push({
                        code: period.code,
                        action: "skipped",
                        reason: `Protected status: ${existing.status}`,
                    });
                    continue;
                }
                if (!payload.dryRun) {
                    yield prisma.payrollPeriod.update({
                        where: { id: existing.id },
                        data: {
                            name: period.name,
                            payDate: period.payDate,
                            payFrequency: period.payFrequency,
                            periodNumber: period.periodNumber,
                            cutoffDay: period.cutoffDay,
                            notes: period.notes,
                            code: period.code,
                            generationMetadata: period.generationMetadata,
                            calculatorId: calculatorId || existing.calculatorId || undefined,
                        },
                    });
                }
                summary.updated += 1;
                summary.items.push({ code: period.code, action: "updated" });
            }
            yield cache_1.invalidateCache.byPattern("cache:payrollPeriod:*");
            (0, activityLogger_1.logActivity)(req, {
                userId: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || "unknown",
                action: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.ACTIONS.BULK_GENERATE_PAYROLL,
                description: `${constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.DESCRIPTIONS.PAYROLL_BULK_GENERATED}: created ${summary.created}, updated ${summary.updated}`,
                page: {
                    url: req.originalUrl,
                    title: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.PAGES.PAYROLLPERIOD_LIST,
                },
            });
            (0, auditLogger_1.logAudit)(req, {
                userId: ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id) || "unknown",
                action: constant_1.config.AUDIT_LOG.ACTIONS.CREATE,
                resource: constant_1.config.AUDIT_LOG.RESOURCES.PAYROLLPERIOD,
                severity: constant_1.config.AUDIT_LOG.SEVERITY.HIGH,
                entityType: constant_1.config.AUDIT_LOG.ENTITY_TYPES.PAYROLLPERIOD,
                entityId: organizationId,
                changesBefore: null,
                changesAfter: {
                    dryRun: payload.dryRun,
                    totalComputed: summary.totalComputed,
                    created: summary.created,
                    updated: summary.updated,
                    skipped: summary.skipped,
                },
                description: `${constant_1.config.AUDIT_LOG.PAYROLLPERIOD.DESCRIPTIONS.PAYROLL_BULK_GENERATED}: ${organizationId}`,
            });
            res.status(200).json((0, success_handler_helper_1.buildSuccessResponse)("Payroll periods generated successfully", summary, 200));
        }
        catch (error) {
            payrollPeriodLogger.error(`Failed bulk payroll period generation: ${error}`);
            res.status(500).json((0, error_handler_1.buildErrorResponse)("Failed bulk payroll period generation", 500));
        }
    });
    const bulkAdjust = (req, res, _next) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b, _c;
        try {
            const organizationId = req.organizationId;
            const role = req.role;
            if (!organizationId) {
                res.status(401).json((0, error_handler_1.buildErrorResponse)("Organization ID is required", 401));
                return;
            }
            if (!isPayrollPolicyManager(role)) {
                res.status(403).json((0, error_handler_1.buildErrorResponse)("You are not authorized to adjust payroll periods", 403));
                return;
            }
            const parsed = payrollperiod_zod_2.PayrollPeriodBulkAdjustSchema.safeParse(req.body);
            if (!parsed.success) {
                const formattedErrors = (0, error_handler_1.formatZodErrors)(parsed.error.format());
                res.status(400).json((0, error_handler_1.buildErrorResponse)("Validation failed", 400, formattedErrors));
                return;
            }
            const payload = parsed.data;
            const cycleConfig = yield getOrCreatePayrollCycleConfig(organizationId);
            const whereClause = {
                organizationId,
                isDeleted: false,
            };
            if (payload.frequency) {
                whereClause.payFrequency = payload.frequency;
            }
            if ((_c = payload.periodIds) === null || _c === void 0 ? void 0 : _c.length) {
                whereClause.id = { in: payload.periodIds };
            }
            const periods = yield prisma.payrollPeriod.findMany({
                where: whereClause,
                orderBy: [{ startDate: "asc" }, { periodNumber: "asc" }],
            });
            if (!periods.length) {
                (0, activityLogger_1.logActivity)(req, {
                    userId: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || "unknown",
                    action: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.ACTIONS.BULK_ADJUST_PAYROLL,
                    description: `${constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.DESCRIPTIONS.PAYROLL_BULK_ADJUSTED}: no periods found`,
                    page: {
                        url: req.originalUrl,
                        title: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.PAGES.PAYROLLPERIOD_LIST,
                    },
                });
                res.status(200).json((0, success_handler_helper_1.buildSuccessResponse)("No payroll periods found to adjust", {
                    total: 0,
                    updated: 0,
                    skipped: 0,
                    items: [],
                }));
                return;
            }
            const minStart = periods[0].startDate;
            const maxEnd = periods[periods.length - 1].endDate;
            const holidayKeys = yield getHolidayDateKeys(organizationId, minStart, new Date(maxEnd.getTime() + 1000 * 60 * 60 * 24 * 60));
            const summary = {
                total: periods.length,
                updated: 0,
                skipped: 0,
                items: [],
            };
            for (const period of periods) {
                if (!payload.forceRetroactive && ["COMPLETED", "CLOSED"].includes(period.status)) {
                    summary.skipped += 1;
                    summary.items.push({
                        id: period.id,
                        code: period.code,
                        action: "skipped",
                        reason: `Protected status: ${period.status}`,
                    });
                    continue;
                }
                let nextStart = period.startDate;
                let nextEnd = period.endDate;
                let nextCutoffDay = period.cutoffDay || undefined;
                let nextPeriodNumber = period.periodNumber || undefined;
                let nextName = period.name;
                let nextNotes = period.notes || undefined;
                let nextCode = period.code || undefined;
                if (period.payFrequency === "SEMI_MONTHLY") {
                    const monthWindowStart = new Date(Date.UTC(period.startDate.getUTCFullYear(), period.startDate.getUTCMonth() - 1, 1, 0, 0, 0, 0));
                    const monthWindowEnd = new Date(Date.UTC(period.startDate.getUTCFullYear(), period.startDate.getUTCMonth() + 2, 0, 23, 59, 59, 999));
                    const projected = (0, payroll_cycle_helper_1.buildPeriodsFromRange)({
                        frequency: "SEMI_MONTHLY",
                        rangeStart: monthWindowStart,
                        rangeEnd: monthWindowEnd,
                        config: cycleConfig,
                        holidayKeys,
                    }).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
                    const byPeriodNumber = projected.find((row) => row.periodNumber === period.periodNumber &&
                        row.startDate.getUTCMonth() === period.startDate.getUTCMonth());
                    const nearest = projected
                        .slice()
                        .sort((a, b) => Math.abs(a.startDate.getTime() - period.startDate.getTime()) -
                        Math.abs(b.startDate.getTime() - period.startDate.getTime()))[0];
                    const resolved = byPeriodNumber || nearest;
                    if (resolved) {
                        nextStart = resolved.startDate;
                        nextEnd = resolved.endDate;
                        nextCutoffDay = resolved.cutoffDay;
                        nextPeriodNumber = resolved.periodNumber;
                        nextName = resolved.name;
                        nextNotes = resolved.notes;
                        nextCode = resolved.code;
                    }
                }
                else {
                    const mergedRules = (0, payroll_cycle_helper_1.getMergedCycleRules)(cycleConfig);
                    if (period.payFrequency === "WEEKLY" || period.payFrequency === "BIWEEKLY") {
                        const weeklyRule = period.payFrequency === "WEEKLY"
                            ? mergedRules.WEEKLY
                            : mergedRules.BIWEEKLY;
                        const periodLength = period.payFrequency === "WEEKLY" ? 7 : 14;
                        const start = new Date(period.startDate);
                        const shiftBack = (start.getUTCDay() - weeklyRule.anchorWeekday + 7) % 7;
                        const adjustedStart = new Date(start);
                        adjustedStart.setUTCDate(adjustedStart.getUTCDate() - shiftBack);
                        nextStart = new Date(Date.UTC(adjustedStart.getUTCFullYear(), adjustedStart.getUTCMonth(), adjustedStart.getUTCDate(), 0, 0, 0, 0));
                        nextEnd = new Date(nextStart);
                        nextEnd.setUTCDate(nextStart.getUTCDate() + periodLength - 1);
                        nextEnd.setUTCHours(23, 59, 59, 999);
                        nextCode = (0, payroll_period_code_helper_1.generatePayrollPeriodCode)(nextStart, nextEnd);
                    }
                }
                const conflicting = yield prisma.payrollPeriod.findFirst({
                    where: {
                        organizationId,
                        isDeleted: false,
                        id: { not: period.id },
                        startDate: nextStart,
                        endDate: nextEnd,
                    },
                    select: { id: true, code: true },
                });
                if (conflicting) {
                    summary.skipped += 1;
                    summary.items.push({
                        id: period.id,
                        code: period.code,
                        action: "skipped",
                        reason: `Conflicts with period ${conflicting.code || conflicting.id}`,
                    });
                    continue;
                }
                const nextPayDate = (0, payroll_cycle_helper_1.computePayDateFromEndDate)(nextEnd, cycleConfig, holidayKeys);
                if (!payload.dryRun) {
                    yield prisma.payrollPeriod.update({
                        where: { id: period.id },
                        data: {
                            startDate: nextStart,
                            endDate: nextEnd,
                            payDate: nextPayDate,
                            cutoffDay: nextCutoffDay,
                            periodNumber: nextPeriodNumber,
                            name: nextName,
                            notes: nextNotes,
                            code: nextCode,
                            generationMetadata: {
                                source: "PAYROLL_CYCLE_CONFIG_BULK_ADJUST",
                                ruleVersion: 1,
                                payDateOffsetDays: cycleConfig.payDateOffsetDays,
                                businessDayRule: cycleConfig.businessDayRule,
                                includeHolidaysInBusinessDayCheck: cycleConfig.includeHolidaysInBusinessDayCheck,
                            },
                        },
                    });
                }
                summary.updated += 1;
                summary.items.push({
                    id: period.id,
                    code: period.code,
                    action: "updated",
                });
            }
            yield cache_1.invalidateCache.byPattern("cache:payrollPeriod:*");
            const responseMessage = payload.dryRun
                ? "Payroll period adjustment preview generated (dry-run, no records updated)"
                : "Payroll periods adjusted successfully";
            (0, activityLogger_1.logActivity)(req, {
                userId: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || "unknown",
                action: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.ACTIONS.BULK_ADJUST_PAYROLL,
                description: `${constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.DESCRIPTIONS.PAYROLL_BULK_ADJUSTED}: updated ${summary.updated}, skipped ${summary.skipped}`,
                page: {
                    url: req.originalUrl,
                    title: constant_1.config.ACTIVITY_LOG.PAYROLLPERIOD.PAGES.PAYROLLPERIOD_LIST,
                },
            });
            (0, auditLogger_1.logAudit)(req, {
                userId: ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id) || "unknown",
                action: constant_1.config.AUDIT_LOG.ACTIONS.UPDATE,
                resource: constant_1.config.AUDIT_LOG.RESOURCES.PAYROLLPERIOD,
                severity: constant_1.config.AUDIT_LOG.SEVERITY.HIGH,
                entityType: constant_1.config.AUDIT_LOG.ENTITY_TYPES.PAYROLLPERIOD,
                entityId: organizationId,
                changesBefore: null,
                changesAfter: {
                    dryRun: payload.dryRun,
                    total: summary.total,
                    updated: summary.updated,
                    skipped: summary.skipped,
                },
                description: `${constant_1.config.AUDIT_LOG.PAYROLLPERIOD.DESCRIPTIONS.PAYROLL_BULK_ADJUSTED}: ${organizationId}`,
            });
            res.status(200).json((0, success_handler_helper_1.buildSuccessResponse)(responseMessage, Object.assign(Object.assign({}, summary), { dryRunApplied: payload.dryRun }), 200));
        }
        catch (error) {
            payrollPeriodLogger.error(`Failed bulk payroll period adjustment: ${error}`);
            res.status(500).json((0, error_handler_1.buildErrorResponse)("Failed bulk payroll period adjustment", 500));
        }
    });
    return {
        create,
        getAll,
        getById,
        update,
        remove,
        generatePayroll,
        previewTimesheetPayroll,
        generateTimesheetPayroll,
        getTimesheetGenerationProgress,
        getActiveTimesheetGenerationProgress,
        requestPauseTimesheetPayroll,
        requestStopTimesheetPayroll,
        getOtReadiness,
        getOtPersonDetail,
        getScheduleDeltas,
        getConfig,
        updateConfig,
        bulkGenerate,
        bulkAdjust,
    };
};
exports.controller = controller;
export { controller };
//# sourceMappingURL=payrollperiod.controller.js.map
