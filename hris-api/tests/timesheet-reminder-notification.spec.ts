import { expect } from "chai";
import { publishTimesheetReminderNotification } from "../helper/notification-dispatch.helper";

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

describe("publishTimesheetReminderNotification", () => {
	it("sends draft submission reminders to the timesheet owner", async () => {
		const { prisma } = createPrismaMock({
			id: "timesheet-1",
			code: "TS-001",
			status: "DRAFT",
			organizationId: "org-1",
			employeeId: "employee-1",
			payrollPeriod: { name: "Period 2 - May 2026", code: "MAY-2" },
			employee: {
				id: "employee-1",
				employeeId: "EMP-001",
				role: "hris-employee",
				reportToId: "manager-1",
				person: { personalInfo: { firstName: "Test", lastName: "Employee" } },
				reportTo: { id: "manager-1", role: "hris-employee-manager" },
			},
		});

		const notification = await publishTimesheetReminderNotification(prisma as any, null, {
			timesheetId: "timesheet-1",
			kind: "employee_submit",
			sourceEmployeeId: "hr-1",
		});
		expect(notification).to.not.equal(null);
		const recipients = notification!.recipients as NotificationRecipients;
		const metadata = notification!.metadata as NotificationMetadata;

		expect(notification!.title).to.equal("Submit your timesheet");
		expect(notification!.eventKey).to.equal("timesheet:timesheet-1:reminder:employee_submit");
		expect(recipients.unread).to.deep.equal([
			{ employeeId: "employee-1", readAt: null },
		]);
		expect(metadata.targetUrl).to.equal("/employee/attendance?action=view-timesheet");
	});

	it("sends submitted approval reminders to the reporting manager", async () => {
		const { prisma } = createPrismaMock({
			id: "timesheet-2",
			code: "TS-002",
			status: "SUBMITTED",
			organizationId: "org-1",
			employeeId: "employee-2",
			payrollPeriod: { name: "Period 2 - May 2026", code: "MAY-2" },
			employee: {
				id: "employee-2",
				employeeId: "EMP-002",
				role: "hris-employee",
				reportToId: "manager-2",
				person: { personalInfo: { firstName: "Test", lastName: "Employee" } },
				reportTo: { id: "manager-2", role: "hris-employee-manager" },
			},
		});

		const notification = await publishTimesheetReminderNotification(prisma as any, null, {
			timesheetId: "timesheet-2",
			kind: "manager_approval",
			sourceEmployeeId: "hr-1",
		});
		expect(notification).to.not.equal(null);
		const recipients = notification!.recipients as NotificationRecipients;
		const metadata = notification!.metadata as NotificationMetadata;

		expect(notification!.title).to.equal("Timesheet awaiting approval");
		expect(notification!.eventKey).to.equal("timesheet:timesheet-2:reminder:manager_approval");
		expect(recipients.unread).to.deep.equal([
			{ employeeId: "manager-2", readAt: null },
		]);
		expect(metadata.routeKey).to.equal("TIMESHEET_APPROVAL_VIEW");
	});
});
