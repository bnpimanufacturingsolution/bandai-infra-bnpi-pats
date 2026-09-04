/**
 * Disciplinary notification helper — notifies the employee and their manager
 * when a disciplinary action changes state, with the next-step plan taken from
 * the Rule Book `consequencePlan` for the case severity.
 *
 * Standard progressive-discipline ladder (SHRM/AIHR) + PH Labor Code twin-notice
 * due process (Art. 277(b)/292(b), Agabon v. NLRC 2004):
 *  LOW    → verbal counseling / documented coaching (no formal response window)
 *  MEDIUM → written warning; employee explains/acknowledges within 5 days
 *  HIGH   → final written warning / suspension; NTE + hearing within 5 days
 *  CRITICAL → termination process (twin-notice) with management escalation
 */
import { Prisma, PrismaClient } from "../generated/prisma";
import { publishNotification } from "./notification-dispatch.helper";

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

export type DisciplinaryNotifySeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface DisciplinaryConsequenceStep {
	action: string;
	employeeStep: string;
	managerStep?: string | null;
	responseWindowDays?: number | null;
}

export interface DisciplinaryConsequencePlan {
	LOW?: DisciplinaryConsequenceStep | null;
	MEDIUM?: DisciplinaryConsequenceStep | null;
	HIGH?: DisciplinaryConsequenceStep | null;
	CRITICAL?: DisciplinaryConsequenceStep | null;
}

const DA_CATEGORY = "DISCIPLINARY";

const DEFAULT_STEPS: Record<DisciplinaryNotifySeverity, DisciplinaryConsequenceStep> = {
	LOW: {
		action: "Verbal counseling / documented coaching",
		employeeStep:
			"Attend coaching with your immediate supervisor and acknowledge expectations; correct the behavior immediately.",
		managerStep: "Conduct private counseling, document the outcome, inform HR.",
		responseWindowDays: 0,
	},
	MEDIUM: {
		action: "Written warning + counseling",
		employeeStep:
			"Receive and sign the written warning; submit your written explanation within 5 calendar days.",
		managerStep:
			"Issue the written warning with HR, secure acknowledgment, file in the 201 record.",
		responseWindowDays: 5,
	},
	HIGH: {
		action: "Final written warning / suspension + notice to explain",
		employeeStep:
			"Respond to the Notice to Explain in writing within 5 calendar days and attend the administrative hearing (you may bring a representative).",
		managerStep:
			"Lead the investigation with HR, serve the NTE, schedule the hearing, recommend the decision.",
		responseWindowDays: 5,
	},
	CRITICAL: {
		action: "Termination process (twin-notice) with management escalation",
		employeeStep:
			"Respond to the Notice to Explain in writing within 5 calendar days and attend the administrative hearing with a counsel/representative of your choice.",
		managerStep:
			"Escalate to HR + management; run the two-notice due process (NTE, hearing, Notice of Decision); termination needs management approval.",
		responseWindowDays: 5,
	},
};

export const disciplinaryStepForSeverity = (
	severity: string | null | undefined,
	plan: DisciplinaryConsequencePlan | null | undefined,
): { severity: DisciplinaryNotifySeverity; step: DisciplinaryConsequenceStep; source: "RULE_BOOK" | "STANDARD" } => {
	const normalized = (
		["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(String(severity || "").toUpperCase())
			? String(severity).toUpperCase()
			: "MEDIUM"
	) as DisciplinaryNotifySeverity;
	const fromRule = plan ? plan[normalized] : null;
	const step = fromRule && fromRule.action && fromRule.employeeStep ? fromRule : DEFAULT_STEPS[normalized];
	return { severity: normalized, step, source: step === fromRule ? "RULE_BOOK" : "STANDARD" };
};

/**
 * Publish the state-change notification to the case employee and their direct
 * manager (reportTo). Fire-and-forget safe: notification failures are logged,
 * never thrown, so the DA update itself always succeeds.
 */
export const notifyDisciplinaryStateChange = async ({
	prisma,
	io,
	organizationId,
	disciplinaryActionId,
	employeeId,
	employeeName,
	offenseType,
	severity,
	status,
	consequencePlan,
	changedByLabel,
}: {
	prisma: PrismaExecutor;
	io?: unknown;
	organizationId: string;
	disciplinaryActionId: string;
	employeeId: string;
	employeeName?: string | null;
	offenseType: string;
	severity: string | null | undefined;
	status: string;
	consequencePlan?: DisciplinaryConsequencePlan | null;
	changedByLabel?: string | null;
}): Promise<void> => {
	try {
		const employee = await prisma.employee.findFirst({
			where: { id: employeeId, organizationId, isDeleted: false },
			select: { id: true, reportToId: true, person: { select: { personalInfo: true } } },
		});
		if (!employee) return;

		const { severity: resolvedSeverity, step, source } = disciplinaryStepForSeverity(severity, consequencePlan);
		const windowText =
			step.responseWindowDays && step.responseWindowDays > 0
				? ` Respond within ${step.responseWindowDays} calendar day(s).`
				: "";
		const name = employeeName || [employee.person?.personalInfo?.firstName, employee.person?.personalInfo?.lastName]
			.filter(Boolean)
			.join(" ")
			.trim() || "Employee";

		const recipientIds = [employee.id, ...(employee.reportToId ? [employee.reportToId] : [])];

		await publishNotification({
			prisma,
			io: (io as any) ?? null,
			organizationId,
			sourceEmployeeId: null,
			recipientEmployeeIds: recipientIds,
			category: DA_CATEGORY,
			type: severity === "CRITICAL" || severity === "HIGH" ? "ALERT" : "WARNING",
			title: `Disciplinary action ${status.toLowerCase()} — ${offenseType.replaceAll("_", " ")}`,
			description:
				status === "OPEN"
					? `${name}: a disciplinary action for ${offenseType.replaceAll("_", " ")} is now official (${resolvedSeverity}). Next step: ${step.action}. ${step.employeeStep}${windowText} Manager: ${step.managerStep || "support HR in the process."} [plan:${source}${changedByLabel ? ` by ${changedByLabel}` : ""}]`
					: `${name}: disciplinary case for ${offenseType.replaceAll("_", " ")} is now ${status}. Next step: ${step.action}.${windowText}`,
			eventKey: `disciplinary-action:${disciplinaryActionId}:${status}`,
			metadata: {
				disciplinaryActionId,
				employeeId: employee.id,
				managerEmployeeId: employee.reportToId ?? null,
				offenseType,
				severity: resolvedSeverity,
				status,
				consequencePlanSource: source,
				step,
			},
		});
	} catch (error) {
		console.error(
			`[disciplinary-notify] Failed to notify state change for DA ${disciplinaryActionId} (status=${status}):`,
			error,
		);
	}
};
