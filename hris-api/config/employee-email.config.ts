import nodemailer from "nodemailer";

export interface EmployeeEmailAuthConfig {
	user: string;
	pass: string;
}

export interface EmployeeEmailFromConfig {
	name: string;
	email: string;
}

export interface EmployeeEmailConfig {
	host: string;
	port: number;
	secure: boolean;
	auth: EmployeeEmailAuthConfig;
	from: EmployeeEmailFromConfig;
}

const parseBooleanEnv = (value: string | undefined, defaultValue: boolean): boolean => {
	if (typeof value !== "string") return defaultValue;
	const normalized = value.trim().toLowerCase();
	if (normalized === "true") return true;
	if (normalized === "false") return false;
	return defaultValue;
};

const parsePortEnv = (value: string | undefined, fallback: number): number => {
	const parsed = Number.parseInt(String(value || ""), 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const resolvedUser =
	process.env.EMPLOYEE_EMAIL_USER || process.env.EMAIL_USER || process.env.SMTP_USER || "";
const resolvedPass =
	process.env.EMPLOYEE_EMAIL_PASS || process.env.EMAIL_PASS || process.env.APP_PASSWORD || "";
const resolvedFromEmail =
	process.env.EMPLOYEE_EMAIL_FROM ||
	process.env.EMAIL_FROM_EMAIL ||
	process.env.EMAIL_USER ||
	process.env.SMTP_USER ||
	"";

export const employeeEmailConfig: EmployeeEmailConfig = {
	host: process.env.EMPLOYEE_EMAIL_HOST || process.env.EMAIL_HOST || "smtp.gmail.com",
	port: parsePortEnv(process.env.EMPLOYEE_EMAIL_PORT || process.env.EMAIL_PORT, 587),
	secure: parseBooleanEnv(process.env.EMPLOYEE_EMAIL_SECURE || process.env.EMAIL_SECURE, false),
	auth: {
		user: resolvedUser,
		pass: resolvedPass,
	},
	from: {
		name: process.env.EMPLOYEE_EMAIL_FROM_NAME || process.env.EMAIL_FROM_NAME || "Bandai HRIS",
		email: resolvedFromEmail,
	},
};

export const isEmployeeEmailConfigured = Boolean(
	employeeEmailConfig.auth.user &&
		employeeEmailConfig.auth.pass &&
		employeeEmailConfig.from.email,
);

let cachedEmployeeMailer: nodemailer.Transporter | null = null;

export const getEmployeeMailer = (): nodemailer.Transporter => {
	if (!isEmployeeEmailConfigured) {
		throw new Error(
			"Employee email is not configured. Set EMPLOYEE_EMAIL_USER/EMPLOYEE_EMAIL_PASS (or EMAIL_USER/EMAIL_PASS, SMTP_USER/APP_PASSWORD).",
		);
	}

	if (!cachedEmployeeMailer) {
		cachedEmployeeMailer = nodemailer.createTransport({
			host: employeeEmailConfig.host,
			port: employeeEmailConfig.port,
			secure: employeeEmailConfig.secure,
			auth: {
				user: employeeEmailConfig.auth.user,
				pass: employeeEmailConfig.auth.pass,
			},
		});
	}

	return cachedEmployeeMailer;
};
