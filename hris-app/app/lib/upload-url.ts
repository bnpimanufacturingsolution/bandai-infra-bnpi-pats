const PRIVATE_UPLOAD_URL_PATTERN =
	/^https?:\/\/(?:localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(?::\d+)?(\/uploads\/.+)$/i;

export function resolveUploadUrl(value?: string | null) {
	const url = String(value || "").trim();
	if (!url) return "";

	const privateUploadMatch = url.match(PRIVATE_UPLOAD_URL_PATTERN);
	if (privateUploadMatch?.[1]) {
		return privateUploadMatch[1];
	}

	return url;
}
