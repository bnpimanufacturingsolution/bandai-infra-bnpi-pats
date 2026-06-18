import cron from "node-cron";
import { getEligibilityCandidates } from "../../helper/eligibility.helper";
import { prisma } from "../../config/database";
import { redisClient } from "../../config/redis";
import { config } from "../../config/config";
import { getLogger } from "../../helper/logger.helper";
import { pruneOldBackupRuns, runDatabaseBackup } from "../../helper/database-backup.helper";

const logger = getLogger();

export const initCronJobs = () => {
	logger.info("cron.initializing");

	cron.schedule("* * * * *", async () => {
		logger.info("eligibility_cron.started");
		try {
			const employees = await prisma.employee.findMany({
				select: { organizationId: true },
				distinct: ["organizationId"],
			});

			const orgIds = employees.map((employee) => employee.organizationId);

			for (const orgId of orgIds) {
				if (!orgId) continue;
				const candidates = await getEligibilityCandidates(prisma, orgId);

				if (candidates.length > 0) {
					logger.info("eligibility_cron.candidates_found", {
						organizationId: orgId,
						count: candidates.length,
						candidates: candidates.map((candidate) => ({
							employeeName: candidate.employeeName,
							eligibleFor: candidate.eligibleFor,
							eligibilityReason: candidate.eligibilityReason,
						})),
					});

					try {
						await redisClient.publish(
							"events:eligibility-updated",
							JSON.stringify({
								organizationId: orgId,
								count: candidates.length,
								timestamp: new Date().toISOString(),
							}),
						);
						logger.info("eligibility_cron.redis_published", { organizationId: orgId });
					} catch (redisError) {
						logger.error("eligibility_cron.redis_publish_failed", { error: redisError });
					}
				} else {
					logger.info("eligibility_cron.no_candidates", { organizationId: orgId });
				}
			}
		} catch (error) {
			logger.error("eligibility_cron.failed", { error });
		}
	});

	if (config.backup.enabled) {
		cron.schedule(
			config.backup.cron,
			async () => {
				logger.info("database_backup.cron_triggered", {
					cron: config.backup.cron,
					timezone: config.backup.timezone,
					outputDir: config.backup.outputDir,
					postgresContainerName: config.backup.postgresContainerName || null,
				});

				try {
					const result = await runDatabaseBackup({
						prisma,
						outputDir: config.backup.outputDir,
						timezone: config.backup.timezone,
						appVersion: process.env.npm_package_version || null,
						pgDump: {
							enabled: true,
							containerName: config.backup.postgresContainerName || undefined,
							database: config.backup.postgresDatabase || undefined,
							user: config.backup.postgresUser || undefined,
							databaseUrl: config.writeDatabaseUrl || undefined,
							env: config.backup.postgresPassword
								? { PGPASSWORD: config.backup.postgresPassword }
								: undefined,
						},
						logger,
					});

					const deleted = pruneOldBackupRuns(
						config.backup.outputDir,
						config.backup.retentionDays,
						new Date(),
						logger,
					);

					logger.info("database_backup.cron_completed", {
						runId: result.runId,
						runDir: result.runDir,
						totalRows: result.manifest.totalRows,
						artifactCount: result.manifest.artifacts.length,
						retentionDeletedCount: deleted.length,
					});
				} catch (error) {
					logger.error("database_backup.cron_failed", {
						error:
							error instanceof Error
								? { message: error.message, name: error.name, stack: error.stack }
								: error,
					});
				}
			},
			{ timezone: config.backup.timezone },
		);
	} else {
		logger.info("database_backup.cron_disabled", { reason: "BACKUP_ENABLED=false" });
	}

	logger.info("cron.initialized");
};
