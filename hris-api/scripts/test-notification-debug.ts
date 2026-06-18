import * as dotenv from "dotenv";
import { PrismaClient } from "../generated/prisma";

dotenv.config();

type RecipientEntry = {
	employeeId: string;
	readAt?: string | Date | null;
};

type RecipientsShape = {
	read?: RecipientEntry[];
	unread?: RecipientEntry[];
};

type NotificationRow = {
	id: string;
	organizationId: string;
	sourceEmployeeId: string | null;
	title: string;
	type: string;
	createdAt: Date;
	recipients: RecipientsShape | null;
	archive?: {
		isArchived?: boolean;
		archivedAt?: Date | null;
		archivedBy?: string | null;
		reason?: string | null;
	} | null;
};

type Scenario = {
	name: string;
	recipientEmployeeId?: string;
	unreadOnly?: boolean;
	reasonHint: string;
};

const prisma = new PrismaClient();

const getArgValue = (name: string): string | undefined => {
	const prefix = `--${name}=`;
	const found = process.argv.find((arg) => arg.startsWith(prefix));
	return found ? found.slice(prefix.length) : undefined;
};

const toBoolean = (value?: string): boolean | undefined => {
	if (value === undefined) return undefined;
	if (value === "true") return true;
	if (value === "false") return false;
	return undefined;
};

const toRecipients = (value: unknown): RecipientsShape => {
	if (!value || typeof value !== "object") {
		return { read: [], unread: [] };
	}

	const recipients = value as RecipientsShape;
	return {
		read: Array.isArray(recipients.read) ? recipients.read : [],
		unread: Array.isArray(recipients.unread) ? recipients.unread : [],
	};
};

const filterByRecipientState = (
	notifications: NotificationRow[],
	filterByEmployeeId?: string,
	filterByUnreadState?: boolean,
): NotificationRow[] => {
	if (!filterByEmployeeId || notifications.length === 0) return notifications;

	return notifications.filter((notification) => {
		const recipients = toRecipients(notification.recipients);

		const inUnread =
			recipients.unread?.some((r: RecipientEntry) => r.employeeId === filterByEmployeeId) ??
			false;
		const inRead =
			recipients.read?.some((r: RecipientEntry) => r.employeeId === filterByEmployeeId) ??
			false;

		if (filterByUnreadState === true) return inUnread;
		if (filterByUnreadState === false) return inRead;
		return inUnread || inRead;
	});
};

const buildReasonLine = (
	baseRows: NotificationRow[],
	recipientEmployeeId?: string,
	unreadOnly?: boolean,
): string => {
	if (!recipientEmployeeId) {
		return "No recipient filter applied.";
	}

	const hasUnread = baseRows.some((notification) =>
		toRecipients(notification.recipients).unread?.some((r) => r.employeeId === recipientEmployeeId),
	);
	const hasRead = baseRows.some((notification) =>
		toRecipients(notification.recipients).read?.some((r) => r.employeeId === recipientEmployeeId),
	);
	const appearsAsSource = baseRows.some(
		(notification) => notification.sourceEmployeeId === recipientEmployeeId,
	);

	if (unreadOnly === true) {
		if (hasUnread) return "Employee exists in recipients.unread.";
		return "Employee is not in recipients.unread.";
	}

	if (unreadOnly === false) {
		if (hasRead) return "Employee exists in recipients.read.";
		return "Employee is not in recipients.read.";
	}

	if (hasUnread || hasRead) return "Employee exists in notification recipients.";
	if (appearsAsSource)
		return "Employee appears as sourceEmployeeId only; source is not used for recipient filtering.";
	return "Employee not found in recipients.read or recipients.unread.";
};

const printCollection = (rows: NotificationRow[]) => {
	console.log("Current notifications collection (raw latest, compact):");
	if (rows.length === 0) {
		console.log("  [empty]");
		return;
	}

	rows.forEach((row, index) => {
		const recipients = toRecipients(row.recipients);
		const readIds = recipients.read?.map((r) => r.employeeId) ?? [];
		const unreadIds = recipients.unread?.map((r) => r.employeeId) ?? [];
		const archiveState =
			row.archive == null ? "null" : row.archive.isArchived === true ? "true" : "false";

		console.log(
			`  [${index + 1}] id=${row.id} org=${row.organizationId} source=${row.sourceEmployeeId ?? "null"} type=${row.type} createdAt=${row.createdAt.toISOString()}`,
		);
		console.log(`      title="${row.title}"`);
		console.log(`      archive.isArchived=${archiveState}`);
		console.log(
			`      recipients.read=[${readIds.join(", ")}] unread=[${unreadIds.join(", ")}]`,
		);
	});
};

const printScenario = (rows: NotificationRow[], scenario: Scenario) => {
	const matched = filterByRecipientState(rows, scenario.recipientEmployeeId, scenario.unreadOnly);
	const matchedIds = matched.map((notification) => notification.id);

	console.log(`\nScenario: ${scenario.name}`);
	console.log(
		`  recipientEmployeeId=${scenario.recipientEmployeeId ?? "none"}, unreadOnly=${scenario.unreadOnly === undefined ? "unset" : String(scenario.unreadOnly)}`,
	);
	console.log(`  count=${matched.length}`);
	console.log(`  matchedIds=[${matchedIds.join(", ")}]`);
	console.log(
		`  reason=${buildReasonLine(rows, scenario.recipientEmployeeId, scenario.unreadOnly)} ${scenario.reasonHint}`,
	);
};

async function main() {
	const limit = Number(getArgValue("limit") || "20");
	const customRecipientEmployeeId = getArgValue("recipientEmployeeId");
	const customUnreadOnly = toBoolean(getArgValue("unreadOnly"));
	const dbInfo = getDatabaseInfo();

	console.log("=== NOTIFICATION DEBUG SCRIPT ===");
	console.log(`limit=${Number.isFinite(limit) && limit > 0 ? limit : 20}`);
	console.log(`dbHost=${dbInfo.host}`);
	console.log(`dbName=${dbInfo.database}`);

	const allNotifications = (await prisma.notification.findMany({
		orderBy: {
			createdAt: "desc",
		},
		take: Number.isFinite(limit) && limit > 0 ? limit : 20,
		select: {
			id: true,
			organizationId: true,
			sourceEmployeeId: true,
			title: true,
			type: true,
			createdAt: true,
			recipients: true,
			archive: true,
		},
	})) as NotificationRow[];

	const activeNotifications = allNotifications.filter(
		(notification) => notification.archive?.isArchived !== true,
	);

	console.log(`total notifications in collection=${allNotifications.length}`);
	console.log(`total active (non-archived) notifications=${activeNotifications.length}`);

	console.log(`raw notifications fetched for display=${allNotifications.length}`);
	console.log(`active notifications fetched for scenarios=${activeNotifications.length}\n`);
	printCollection(allNotifications);

	if (activeNotifications.length === 0) {
		if (allNotifications.length > 0 && activeNotifications.length === 0) {
			console.log(
				"\nNo active notifications found because all current notifications are archived (archive.isArchived=true).",
			);
		} else {
			console.log("\nNo active notifications found for this DB target.");
		}
		console.log("Exiting.");
		return;
	}

	const latest = activeNotifications[0];
	const latestRecipients = toRecipients(latest.recipients);
	const sourceEmployeeId = latest.sourceEmployeeId ?? undefined;
	const firstUnreadRecipientId = latestRecipients.unread?.[0]?.employeeId;

	const scenarios: Scenario[] = [
		{
			name: "No recipient filter",
			reasonHint: "(baseline)",
		},
	];

	if (sourceEmployeeId) {
		scenarios.push({
			name: "recipientEmployeeId = latest sourceEmployeeId",
			recipientEmployeeId: sourceEmployeeId,
			reasonHint: "(useful for checking source-vs-recipient mismatch)",
		});
	}

	if (firstUnreadRecipientId) {
		scenarios.push({
			name: "recipientEmployeeId = first unread recipient from latest notification",
			recipientEmployeeId: firstUnreadRecipientId,
			reasonHint: "(expected to match unread recipient)",
		});
	}

	if (customRecipientEmployeeId) {
		scenarios.push({
			name: "Custom scenario from CLI args",
			recipientEmployeeId: customRecipientEmployeeId,
			unreadOnly: customUnreadOnly,
			reasonHint: "(provided via --recipientEmployeeId and optional --unreadOnly)",
		});
	}

	console.log("\n=== SCENARIO RESULTS ===");
	scenarios.forEach((scenario) => printScenario(activeNotifications, scenario));
}

main()
	.catch((error) => {
		console.error("Script failed:", error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
function getDatabaseInfo() {
	const raw = process.env.DATABASE_URL || process.env.MONGODB_URI || "";
	if (!raw) return { host: "unknown", database: "unknown" };

	try {
		const withoutProtocol = raw.replace(/^mongodb(\+srv)?:\/\//, "");
		const afterAuth = withoutProtocol.includes("@")
			? withoutProtocol.split("@")[1]
			: withoutProtocol;
		const host = afterAuth.split("/")[0] || "unknown";
		const database = (afterAuth.split("/")[1] || "").split("?")[0] || "unknown";
		return { host, database };
	} catch {
		return { host: "unknown", database: "unknown" };
	}
}
