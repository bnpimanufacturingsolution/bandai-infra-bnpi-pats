import path from "path";
import fs from "fs";
import nodemailer from "nodemailer";
import ejs from "ejs";
import { getLogger } from "./logger.helper";

const logger = getLogger();

const GMAIL_USER = process.env.SMTP_USER;
const GMAIL_PASS = process.env.APP_PASSWORD;

export const mailer = nodemailer.createTransport({
	service: "gmail",
	auth: {
		user: GMAIL_USER,
		pass: GMAIL_PASS,
	},
});

interface EmailCallbacks {
	onSuccess?: (result: { messageId: string }) => Promise<void> | void;
	onError?: (error: Error) => Promise<void> | void;
}

async function sendEmailWithCallbacks(
	emailFn: () => Promise<nodemailer.SentMessageInfo>,
	callbacks?: EmailCallbacks,
): Promise<void> {
	try {
		const result = await emailFn();
		if (callbacks?.onSuccess) {
			await callbacks.onSuccess({ messageId: result.messageId });
		}
	} catch (error) {
		if (callbacks?.onError) {
			await callbacks.onError(error as Error);
		} else {
			throw error;
		}
	}
}

export const sendForgotPasswordEmail = async (
	params: {
		to: string;
		resetUrl: string;
	},
	callbacks?: EmailCallbacks,
): Promise<void> => {
	await sendEmailWithCallbacks(async () => {
		const templatePath = path.join(__dirname, "..", "views", "emails", "forgot-password.ejs");

		const template = fs.readFileSync(templatePath, "utf-8");
		const html = ejs.render(template, {
			resetUrl: params.resetUrl,
		});

		const result = await mailer.sendMail({
			from: `"Ryde Solutions" <${GMAIL_USER}>`,
			to: params.to,
			subject: "Reset your Ryde password",
			html,
		});

		logger.info(`Forgot password email sent to ${params.to}`);
		return result;
	}, callbacks);
};

export const sendWelcomeEmail = async (
	params: {
		username: string;
		email: string;
	},
	callbacks?: EmailCallbacks,
): Promise<void> => {
	await sendEmailWithCallbacks(async () => {
		// Fixed: Go up one level with ".." then into "public"
		const templatePath = path.join(
			__dirname,
			"..",
			"public",
			"emails",
			"welcome-credentials.ejs",
		);

		const template = fs.readFileSync(templatePath, "utf-8");
		const html = ejs.render(template, {
			username: params.username,
			email: params.email,
		});

		const result = await mailer.sendMail({
			from: `"Bandai HRIS" <${GMAIL_USER}>`,
			to: params.email,
			subject: "Welcome to Bandai HRIS - Your Account Details",
			html,
		});

		logger.info(`Welcome email sent to ${params.email}`);
		return result;
	}, callbacks);
};

export const sendApplicationStatusUpdateEmail = async (
	params: {
		applicantName: string;
		applicantEmail: string;
		positionTitle: string;
		status: string; // new, reviewing, interview, rejected, accepted, hired
		appliedDate: Date;
		interviewDetails?: {
			scheduledDate?: Date;
			scheduledTime?: string;
			location?: string;
			interviewType?: string;
		};
		rejectionReason?: string;
		offerDetails?: {
			salary?: number;
			startDate?: Date;
		};
		additionalNotes?: string;
	},
	callbacks?: EmailCallbacks,
): Promise<void> => {
	await sendEmailWithCallbacks(async () => {
		const templatePath = path.join(
			__dirname,
			"..",
			"public",
			"emails",
			"application-status-update.ejs",
		);

		const template = fs.readFileSync(templatePath, "utf-8");
		const html = ejs.render(template, {
			applicantName: params.applicantName,
			positionTitle: params.positionTitle,
			status: params.status,
			appliedDate: params.appliedDate,
			interviewDetails: params.interviewDetails,
			rejectionReason: params.rejectionReason,
			offerDetails: params.offerDetails,
			additionalNotes: params.additionalNotes,
		});

		// Dynamic subject based on status
		const subjectMap: Record<string, string> = {
			new: "Application Received",
			reviewing: "Application Under Review",
			interview: "Interview Invitation",
			rejected: "Application Update",
			accepted: "Congratulations! Job Offer",
			hired: "Welcome to the Team!",
		};

		const result = await mailer.sendMail({
			from: `"Bandai HRIS Recruitment" <${GMAIL_USER}>`,
			to: params.applicantEmail,
			subject: `${subjectMap[params.status] || "Application Update"} - ${params.positionTitle}`,
			html,
		});

		logger.info(
			`Application status update email sent to ${params.applicantEmail} - Status: ${params.status}`,
		);
		return result;
	}, callbacks);
};
