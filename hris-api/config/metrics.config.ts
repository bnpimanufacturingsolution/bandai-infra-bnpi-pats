import { PrismaClient } from "../generated/prisma";
import { MetricFilter, MetricConfig, buildWhereClause } from "../helper/metrics.helper";

export const METRICS_CONFIG: Record<string, MetricConfig> = {};
