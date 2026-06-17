import type { Prisma, PrismaClient } from "../../generated/prisma";
import { getSeededWorkflowConfigs } from "../../helper/workflow-config.helper";

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

const toJsonValue = (value: unknown) => value as Prisma.InputJsonValue;

export async function seedWorkflowInstanceTemplates(
	prisma: PrismaExecutor,
	organizationId: string,
) {
	const seededConfigs = getSeededWorkflowConfigs();
	let created = 0;
	let updated = 0;

	for (const config of seededConfigs) {
		const existing = await prisma.workflowInstance.findFirst({
			where: {
				organizationId,
				domain: config.domain as any,
				domainRecordId: null,
				code: config.code,
				isDeleted: false,
			},
			select: {
				id: true,
				currentStateKey: true,
			},
		});

		const nextCurrentStateKey =
			config.states.find((state) => state.key === existing?.currentStateKey)?.key ||
			config.states[0]?.key ||
			"OPEN";

		const payload = {
			organizationId,
			domain: config.domain as any,
			domainRecordId: null,
			requestType: (config.requestType as any) ?? null,
			code: config.code,
			name: config.name,
			description: config.description ?? null,
			steps: toJsonValue(config.steps),
			states: toJsonValue(config.states),
			currentStateKey: nextCurrentStateKey,
		};

		if (existing) {
			await prisma.workflowInstance.update({
				where: { id: existing.id },
				data: payload,
			});
			updated += 1;
			continue;
		}

		await prisma.workflowInstance.create({
			data: {
				...payload,
				stateHistory: [],
			},
		});
		created += 1;
	}

	return {
		total: seededConfigs.length,
		created,
		updated,
	};
}
