export interface EmailConfig {
	host: string;
	port: number;
	secure: boolean;
	auth: {
		user: string;
		pass: string;
	};
	from: {
		name: string;
		email: string;
	};
	appUrl: string;
}

export interface EmailOptions {
	to: string | string[];
	subject: string;
	html?: string;
	text?: string;
	cc?: string | string[];
	bcc?: string | string[];
	attachments?: EmailAttachment[];
	replyTo?: string;
}

export interface EmailAttachment {
	filename: string;
	path?: string;
	content?: string;
	contentType?: string;
}

export interface EmailResult {
	success: boolean;
	messageId?: string;
	error?: string;
}

export interface WelcomeEmailData {
	username: string;
	email: string;
}

export interface PasswordResetData {
	username: string;
	email: string;
	resetToken: string;
}

export interface VerificationEmailData {
	username: string;
	email: string;
	verificationToken: string;
}
