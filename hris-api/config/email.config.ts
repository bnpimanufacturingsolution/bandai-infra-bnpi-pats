export interface EmailAuth {
	user: string;
	pass: string;
}

export interface EmailFrom {
	name: string;
	email: string;
}

export interface EmailConfig {
	host: string;
	port: number;
	secure: boolean;
	auth: EmailAuth;
	from: EmailFrom;
	appUrl: string;
}

export const emailConfig: EmailConfig = {
	host: process.env.EMAIL_HOST || "smtp.gmail.com",
	port: parseInt(process.env.EMAIL_PORT || "587", 10),
	secure: process.env.EMAIL_SECURE === "true",
	auth: {
		user: process.env.EMAIL_USER || "",
		pass: process.env.EMAIL_PASS || "",
	},
	from: {
		name: process.env.EMAIL_FROM_NAME || "Application",
		email: process.env.EMAIL_USER || "",
	},
	appUrl: process.env.APP_URL || "http://localhost:3000",
};
