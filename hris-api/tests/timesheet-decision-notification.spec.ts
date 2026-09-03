import { expect } from "chai";
import { publishTimesheetDecisionFallbackNotification } from "../helper/notification-dispatch.helper";

type NotificationRecipient = {
	employeeId: string;
	readAt: string | Date | null;
};

type NotificationRecipients = {
	read: NotificationRecipient[];
	unread: NotificationRecipient[];
};

type NotificationMetadata = {
	targetUrl?: string;
	routeKey?: string;
	status?: string;
	comment?: string | null;
};

const createPrismaMock = (timesheet: any) => {
	const notifications: any[] = [];

	return {
		notifications,
		prisma: {
			timesheet: {
				findUnique: async () => timesheet,
			},
			notification: {
				findFirst: async ({ where }: any) =>
					notifications.find((notification) => notification.eventKey === where.eventKey) ||
					null,
				create: async ({ data }: any) => {
					const notification = { id: `notification-${notifications.length + 1}`, ...data };
					notifications.push(notification);
					return notification;
				},
				update: async ({ where, data }: any) => {
					const index = notifications.findIndex((notification) => notification.id === where.id);
					notifications[index] = { ...notifications[index], ...data };
					return notifications[index];
				},
			},
		},
	};
};

describe("publishTimesheetDecisionFallbackNotification", () => {
	it("sends approved timesheet notifications to the employee with the self-view route", async () => {
		const { prisma } = createPrismaMock({
			id: "timesheet-3",
			code: "TS-003",
			organizationId: "org-1",
			employeeId: "employee-3",
			employee: {
				role: "hris-employee",
			},
		});

		const notification = await publishTimesheetDecisionFallbackNotification(prisma as any, null, {
			timesheetId: "timesheet-3",
			status: "APPROVED",
			sourceEmployeeId: "hr-1",
		});

		expect(notification).to.not.equal(null);
		const recipients = notification!.recipients as NotificationRecipients;
		const metadata = notification!.metadata as NotificationMetadata;

		expect(notification!.title).to.equal("Timesheet approved");
		expect(notification!.type).to.equal("SUCCESS");
		expect(notification!.eventKey).to.equal("timesheet:timesheet-3:status:APPROVED");
		expect(recipients.unread).to.deep.equal([{ employeeId: "employee-3", readAt: null }]);
		expect(metadata.routeKey).to.equal("TIMESHEET_SELF_VIEW");
		expect(metadata.targetUrl).to.equal("/employee/attendance?action=view-timesheet");
	});

	it("sends rejected timesheet notifications to the employee with the self-view route", async () => {
		const { prisma } = createPrismaMock({
			id: "timesheet-4",
			code: "TS-004",
			organizationId: "org-1",
			employeeId: "employee-4",
			employee: {
				role: "hris-employee",
			},
		});

		const notification = await publishTimesheetDecisionFallbackNotification(prisma as any, null, {
			timesheetId: "timesheet-4",
			status: "REJECTED",
			sourceEmployeeId: "hr-1",
			comment: "Please fix the incomplete punch-in.",
		});

		expect(notification).to.not.equal(null);
		const recipients = notification!.recipients as NotificationRecipients;
		const metadata = notification!.metadata as NotificationMetadata;

		expect(notification!.title).to.equal("Timesheet rejected");
		expect(notification!.type).to.equal("WARNING");
		expect(notification!.eventKey).to.equal("timesheet:timesheet-4:status:REJECTED");
		expect(notification!.description).to.contain("was rejected");
		expect(recipients.unread).to.deep.equal([{ employeeId: "employee-4", readAt: null }]);
		expect(metadata.routeKey).to.equal("TIMESHEET_SELF_VIEW");
		expect(metadata.targetUrl).to.equal("/employee/attendance?action=view-timesheet");
		expect(metadata.comment).to.equal("Please fix the incomplete punch-in.");
	});
});
