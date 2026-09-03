import { expect } from "chai";
import {
	publishPayrollPublishedNotification,
	publishPayslipAvailableNotification,
	publishPaymentIssueNotification,
} from "../helper/notification-dispatch.helper";

type NotificationRecipient = {
	employeeId: string;
	readAt: string | Date | null;
};

type NotificationRecipients = {
	read: NotificationRecipient[];
	unread: NotificationRecipient[];
};

type NotificationMetadata = {
	routeKey?: string;
	employeeId?: string;
	employeePayrollId?: string;
	payrollPeriodId?: string;
	paymentIssueNote?: string | null;
};

const createPrismaMock = (employeePayroll: any) => {
	const notifications: any[] = [];

	return {
		notifications,
		prisma: {
			employeePayroll: {
				findUnique: async () => employeePayroll,
				findFirst: async () => employeePayroll,
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

const baseEmployeePayroll = {
	id: "payroll-1",
	organizationId: "org-1",
	employeeId: "employee-1",
	payrollPeriodId: "period-1",
	employee: {
		id: "employee-1",
		role: "hris-employee",
		employeeId: "EMP-001",
		person: {
			personalInfo: {
				firstName: "Aira",
				lastName: "Flores",
			},
		},
	},
	payrollPeriod: {
		id: "period-1",
		name: "Period 2 - June 2026",
	},
};

describe("payroll notification publishers", () => {
	it("creates one payroll published notification per employee and dedupes the same event key", async () => {
		const { prisma, notifications } = createPrismaMock(baseEmployeePayroll);

		const firstNotification = await publishPayrollPublishedNotification(prisma as any, null, {
			employeePayrollId: "payroll-1",
			sourceEmployeeId: "hr-1",
		});
		const secondNotification = await publishPayrollPublishedNotification(prisma as any, null, {
			employeePayrollId: "payroll-1",
			sourceEmployeeId: "hr-1",
		});

		expect(firstNotification).to.not.equal(null);
		expect(secondNotification).to.not.equal(null);
		expect(notifications).to.have.length(1);
		expect(firstNotification!.eventKey).to.equal("employeePayroll:payroll-1:published");
		expect(secondNotification!.id).to.equal(firstNotification!.id);

		const recipients = firstNotification!.recipients as NotificationRecipients;
		const metadata = firstNotification!.metadata as NotificationMetadata;

		expect(firstNotification!.title).to.equal("Payroll published");
		expect(recipients.unread).to.deep.equal([{ employeeId: "employee-1", readAt: null }]);
		expect(metadata.routeKey).to.equal("PAYROLL_SELF_VIEW");
		expect(metadata.employeeId).to.equal("employee-1");
		expect(metadata.employeePayrollId).to.equal("payroll-1");
		expect(metadata.payrollPeriodId).to.equal("period-1");
	});

	it("creates one payslip available notification per employee and dedupes the same event key", async () => {
		const { prisma, notifications } = createPrismaMock(baseEmployeePayroll);

		const firstNotification = await publishPayslipAvailableNotification(prisma as any, null, {
			employeePayrollId: "payroll-1",
			sourceEmployeeId: "hr-1",
		});
		const secondNotification = await publishPayslipAvailableNotification(prisma as any, null, {
			employeePayrollId: "payroll-1",
			sourceEmployeeId: "hr-1",
		});

		expect(firstNotification).to.not.equal(null);
		expect(secondNotification).to.not.equal(null);
		expect(notifications).to.have.length(1);
		expect(firstNotification!.eventKey).to.equal("employeePayroll:payroll-1:payslip-released");
		expect(secondNotification!.id).to.equal(firstNotification!.id);

		const recipients = firstNotification!.recipients as NotificationRecipients;
		const metadata = firstNotification!.metadata as NotificationMetadata;

		expect(firstNotification!.title).to.equal("Payslip available");
		expect(recipients.unread).to.deep.equal([{ employeeId: "employee-1", readAt: null }]);
		expect(metadata.routeKey).to.equal("PAYSLIP_SELF_VIEW");
		expect(metadata.employeePayrollId).to.equal("payroll-1");
	});

	it("creates one payment issue notification per employee and dedupes the same event key", async () => {
		const { prisma, notifications } = createPrismaMock(baseEmployeePayroll);

		const firstNotification = await publishPaymentIssueNotification(prisma as any, null, {
			employeePayrollId: "payroll-1",
			sourceEmployeeId: "hr-1",
			note: "Bank transfer failed for the payroll batch.",
		});
		const secondNotification = await publishPaymentIssueNotification(prisma as any, null, {
			employeePayrollId: "payroll-1",
			sourceEmployeeId: "hr-1",
			note: "Bank transfer failed for the payroll batch.",
		});

		expect(firstNotification).to.not.equal(null);
		expect(secondNotification).to.not.equal(null);
		expect(notifications).to.have.length(1);
		expect(firstNotification!.eventKey).to.equal("employeePayroll:payroll-1:payment-issue");
		expect(secondNotification!.id).to.equal(firstNotification!.id);

		const recipients = firstNotification!.recipients as NotificationRecipients;
		const metadata = firstNotification!.metadata as NotificationMetadata;

		expect(firstNotification!.title).to.equal("Payment issue");
		expect(recipients.unread).to.deep.equal([{ employeeId: "employee-1", readAt: null }]);
		expect(metadata.routeKey).to.equal("PAYMENT_ISSUE_SELF_VIEW");
		expect(metadata.paymentIssueNote).to.equal("Bank transfer failed for the payroll batch.");
	});
});
