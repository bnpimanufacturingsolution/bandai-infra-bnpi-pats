import {
	employeeEmailConfig,
	getEmployeeMailer,
	isEmployeeEmailConfigured,
} from "../config/employee-email.config";
import { getLogger } from "./logger.helper";

const logger = getLogger().child({ module: "employee-credentials-email" });

export interface SendEmployeeCredentialsEmailParams {
	to: string;
	employeeId: string;
	email: string;
	userName: string;
	password: string;
	fullName?: string;
}

export interface SendEmployeeCredentialsEmailResult {
	sent: boolean;
	messageId?: string;
	reason?: string;
}

const escapeHtml = (value: string): string => {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
};

const buildCredentialsText = (params: SendEmployeeCredentialsEmailParams): string => {
	const name = params.fullName?.trim() || "Employee";
	return [
		`Hi ${name},`,
		"",
		"Your Bandai HRIS account has been created.",
		"",
		`Employee ID: ${params.employeeId}`,
		`Email: ${params.email}`,
		`Username: ${params.userName}`,
		`Password: ${params.password}`,
		"",
		"Please sign in and change your password immediately.",
	].join("\n");
};

const buildCredentialsHtml = (params: SendEmployeeCredentialsEmailParams): string => {
	const name = escapeHtml(params.fullName?.trim() || "Employee");
	const employeeId = escapeHtml(params.employeeId);
	const email = escapeHtml(params.email);
	const userName = escapeHtml(params.userName);
	const password = escapeHtml(params.password);

	return `
		<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
			<p>Hi ${name},</p>
			<p>Your Bandai HRIS account has been created.</p>
			<table style="border-collapse: collapse; margin-top: 12px;">
				<tr><td style="padding: 6px 10px; border: 1px solid #d1d5db;"><strong>Employee ID</strong></td><td style="padding: 6px 10px; border: 1px solid #d1d5db;">${employeeId}</td></tr>
				<tr><td style="padding: 6px 10px; border: 1px solid #d1d5db;"><strong>Email</strong></td><td style="padding: 6px 10px; border: 1px solid #d1d5db;">${email}</td></tr>
				<tr><td style="padding: 6px 10px; border: 1px solid #d1d5db;"><strong>Username</strong></td><td style="padding: 6px 10px; border: 1px solid #d1d5db;">${userName}</td></tr>
				<tr><td style="padding: 6px 10px; border: 1px solid #d1d5db;"><strong>Password</strong></td><td style="padding: 6px 10px; border: 1px solid #d1d5db;">${password}</td></tr>
			</table>
			<p style="margin-top: 12px;">Please sign in and change your password immediately.</p>
		</div>
	`;
};

export { isEmployeeEmailConfigured };

export const sendEmployeeCredentialsEmail = async (
	params: SendEmployeeCredentialsEmailParams,
): Promise<SendEmployeeCredentialsEmailResult> => {
	if (!isEmployeeEmailConfigured) {
		return {
			sent: false,
			reason:
				"Employee email is not configured. Set EMPLOYEE_EMAIL_USER/EMPLOYEE_EMAIL_PASS (or EMAIL_USER/EMAIL_PASS, SMTP_USER/APP_PASSWORD).",
		};
	}

	const transporter = getEmployeeMailer();
	const info = await transporter.sendMail({
		from: `"${employeeEmailConfig.from.name}" <${employeeEmailConfig.from.email}>`,
		to: params.to,
		subject: "Bandai HRIS - Your Account Credentials",
		text: buildCredentialsText(params),
		html: buildCredentialsHtml(params),
	});

	logger.info(
		`Credential email sent to ${params.to} for employeeId=${params.employeeId} messageId=${info.messageId}`,
	);

	return {
		sent: true,
		messageId: info.messageId,
	};
};
