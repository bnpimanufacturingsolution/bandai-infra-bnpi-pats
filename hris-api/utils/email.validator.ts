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
	content?: Buffer | string;
	contentType?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (email: string): boolean => {
	return EMAIL_REGEX.test(email);
};

export const validateEmailOptions = (options: EmailOptions): void => {
	if (!options.to) {
		throw new Error("Recipient email is required");
	}

	if (!options.subject) {
		throw new Error("Email subject is required");
	}

	if (!options.html && !options.text) {
		throw new Error("Email content (html or text) is required");
	}

	const recipients = Array.isArray(options.to) ? options.to : [options.to];
	recipients.forEach((email) => {
		if (!isValidEmail(email)) {
			throw new Error(`Invalid email address: ${email}`);
		}
	});
};
