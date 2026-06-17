import { PrismaClient } from "../../generated/prisma";
import { MigrationRunRequest } from "./migration-run.types";
import { MigrationRunService } from "./migration-run.service";

export class MigrationOrchestratorService {
	private readonly runs: MigrationRunService;

	constructor(prisma: PrismaClient) {
		this.runs = new MigrationRunService(prisma);
	}

	dryRun(request: MigrationRunRequest) {
		return this.runs.dryRun(request);
	}

	startRun(request: MigrationRunRequest) {
		return this.runs.startRun(request);
	}

	getRun(runId: string) {
		return this.runs.getRun(runId);
	}

	getProgress(runId: string) {
		return this.runs.getProgress(runId);
	}

	findActiveRun(organizationId: string, workbookId: MigrationRunRequest["workbookId"]) {
		return this.runs.findActiveRun(organizationId, workbookId);
	}

	findLatestRun(
		organizationId: string,
		workbookId: MigrationRunRequest["workbookId"],
		options?: { includeDryRun?: boolean },
	) {
		return this.runs.findLatestRun(organizationId, workbookId, options);
	}

	getEvents(runId: string, limit?: number) {
		return this.runs.getEvents(runId, limit);
	}

	recover(runId: string, actorUserId?: string) {
		return this.runs.recover(runId, actorUserId);
	}

	rerun(runId: string, actorUserId?: string) {
		return this.runs.rerun(runId, actorUserId);
	}
}
